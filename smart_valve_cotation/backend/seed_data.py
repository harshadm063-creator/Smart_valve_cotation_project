from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from datetime import datetime
from backend.database import Base, engine, SessionLocal
from backend.models import Material, ProcessingRate, BoughtOutItem, ActuationPackage, Quotation, QuotationBOMItem
from backend.services.calculation_service import calculate_full_estimate

def seed_database():
    Base.metadata.create_all(bind=engine)
    bom_columns = {column["name"] for column in inspect(engine).get_columns("quotation_bom_items")}
    new_bom_columns = {
        "unit": "VARCHAR DEFAULT 'piece' NOT NULL",
        "unit_weight_override": "FLOAT",
        "unit_material_rate": "FLOAT",
        "rate_source": "VARCHAR DEFAULT 'material_default' NOT NULL",
        "unit_fabrication_cost": "FLOAT",
        "material_rate": "FLOAT DEFAULT 0 NOT NULL",
        "fabrication_cost": "FLOAT DEFAULT 0 NOT NULL",
        "component_total": "FLOAT DEFAULT 0 NOT NULL",
        "is_purchased": "BOOLEAN DEFAULT 0 NOT NULL",
        "unit_purchase_rate": "FLOAT DEFAULT 0 NOT NULL",
        "purchase_cost": "FLOAT DEFAULT 0 NOT NULL",
    }
    with engine.begin() as connection:
        for column_name, column_sql in new_bom_columns.items():
            if column_name not in bom_columns:
                connection.execute(text(
                    f"ALTER TABLE quotation_bom_items ADD COLUMN {column_name} {column_sql}"
                ))
    db = SessionLocal()

    try:
        # 1. Materials
        if db.query(Material).count() == 0:
            materials = [
                Material(name="IS 2062", density=0.00000785, raw_rate=72.0, fab_multiplier=1.00, unit="₹/kg"),
                Material(name="SS 304 L", density=0.00000800, raw_rate=250.0, fab_multiplier=1.35, unit="₹/kg"),
                Material(name="SS 316 L", density=0.00000800, raw_rate=310.0, fab_multiplier=1.40, unit="₹/kg"),
                Material(name="SS 410", density=0.00000775, raw_rate=120.0, fab_multiplier=1.20, unit="₹/kg"),
                Material(name="EN8", density=0.00000785, raw_rate=95.0, fab_multiplier=1.10, unit="₹/kg"),
            ]
            db.add_all(materials)
            db.commit()

        additional_materials = [
            ("Cast Iron", 0.00000720, 55.0),
            ("Ductile Iron", 0.00000710, 75.0),
            ("SS 304", 0.00000800, 250.0),
            ("SS 316", 0.00000800, 310.0),
            ("Galvanized Steel", 0.00000785, 90.0),
            ("Bronze", 0.00000880, 650.0),
            ("PTFE", 0.00000220, 900.0),
            ("EPDM", 0.00000120, 350.0),
            ("Graphite Packing", 0.00000180, 600.0),
        ]
        existing_material_names = {material.name for material in db.query(Material.name).all()}
        for material_name, density, rate in additional_materials:
            if material_name in existing_material_names:
                continue
            db.add(Material(
                name=material_name, density=density, raw_rate=rate,
                fab_multiplier=1.0, unit="₹/kg",
            ))
            existing_material_names.add(material_name)
        db.commit()

        # 2. Processing Rates
        if db.query(ProcessingRate).count() == 0:
            proc_rates = [
                ProcessingRate(code="fabrication", name="Base Fabrication & Welding Rate", rate_per_kg=96.0, unit="₹/kg"),
                ProcessingRate(code="finishing", name="Surface Finishing & Painting Rate", rate_per_kg=20.0, unit="₹/kg"),
                ProcessingRate(code="cutting", name="Laser Cutting & Profile Processing Rate", rate_per_kg=10.0, unit="₹/kg"),
            ]
            db.add_all(proc_rates)
            db.commit()

        # 3. Bought-Out Items
        if db.query(BoughtOutItem).count() == 0:
            bought_out_items = [
                # Rack & Pinion Damper - SMALL
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="SMALL", item_name="Precision Racks (Hardened)", quantity=2, unit_rate=3500.0, notes="Module 4 rack"),
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="SMALL", item_name="Drive Pinions", quantity=2, unit_rate=2800.0, notes="C45 Flame hardened"),
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="SMALL", item_name="Free-Rotating Pinions", quantity=2, unit_rate=2200.0),
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="SMALL", item_name="Flanged Bearing Units", quantity=4, unit_rate=1450.0, notes="High-temp grease lubricated"),
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="SMALL", item_name="High Tensile Fasteners Set", quantity=1, unit_rate=3200.0, unit="set"),
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="SMALL", item_name="Braided Graphite Gland Packing", quantity=2, unit_rate=850.0, unit="set"),
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="SMALL", item_name="Self-Lubricating Bushings", quantity=4, unit_rate=600.0),
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="SMALL", item_name="Metallic / Viton Seat Seals", quantity=1, unit_rate=4500.0, unit="set"),

                # Rack & Pinion Damper - MEDIUM
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="MEDIUM", item_name="Precision Racks (Hardened)", quantity=2, unit_rate=7200.0, notes="Module 6 rack"),
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="MEDIUM", item_name="Drive Pinions", quantity=2, unit_rate=5800.0),
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="MEDIUM", item_name="Free-Rotating Pinions", quantity=2, unit_rate=4500.0),
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="MEDIUM", item_name="Heavy Duty Bearing Units", quantity=4, unit_rate=3100.0),
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="MEDIUM", item_name="Fasteners & Hardware Package", quantity=1, unit_rate=6500.0, unit="set"),
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="MEDIUM", item_name="Braided Graphite Gland Packing", quantity=2, unit_rate=1600.0, unit="set"),
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="MEDIUM", item_name="Phosphor Bronze Bushings", quantity=4, unit_rate=1200.0),
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="MEDIUM", item_name="Engineered Flexible Seat Seals", quantity=1, unit_rate=8900.0, unit="set"),

                # Rack & Pinion Damper - LARGE
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="LARGE", item_name="Precision Heavy Duty Racks", quantity=4, unit_rate=14000.0, notes="Module 8 rack"),
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="LARGE", item_name="Drive Pinions (Forged Alloy)", quantity=4, unit_rate=11500.0),
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="LARGE", item_name="Free-Rotating Pinions", quantity=4, unit_rate=8800.0),
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="LARGE", item_name="Heavy Duty Plummer Block Bearings", quantity=8, unit_rate=6200.0),
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="LARGE", item_name="High-Grade Structural Fasteners", quantity=1, unit_rate=14000.0, unit="set"),
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="LARGE", item_name="Multi-stage Gland Sealing Package", quantity=4, unit_rate=3200.0, unit="set"),
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="LARGE", item_name="Engineered Alloy Bushings", quantity=8, unit_rate=2400.0),
                BoughtOutItem(equipment_type="Rack & Pinion Damper", size_category="LARGE", item_name="Heavy Inconel Spring-Loaded Seals", quantity=1, unit_rate=18500.0, unit="set"),

                # Butterfly Valve - SMALL
                BoughtOutItem(equipment_type="Butterfly Valve", size_category="SMALL", item_name="Stem Bearings / Bushings", quantity=2, unit_rate=2100.0),
                BoughtOutItem(equipment_type="Butterfly Valve", size_category="SMALL", item_name="Resilient Seat Liner (EPDM / PTFE)", quantity=1, unit_rate=5400.0),
                BoughtOutItem(equipment_type="Butterfly Valve", size_category="SMALL", item_name="Shaft Gland Packing Set", quantity=1, unit_rate=1200.0, unit="set"),
                BoughtOutItem(equipment_type="Butterfly Valve", size_category="SMALL", item_name="Bolting & Hardware Kit", quantity=1, unit_rate=2800.0, unit="set"),

                # NOTE: Intentionally NO Butterfly Valve MEDIUM seeded here to adhere to the rule:
                # "The existing demonstration data contains no medium-size Butterfly Valve bought-out configuration.
                # Do not silently assume the small-size configuration is correct for medium equipment.
                # Flag the missing configuration and require an authorized rule or explicitly approved fallback."

                # Butterfly Valve - LARGE
                BoughtOutItem(equipment_type="Butterfly Valve", size_category="LARGE", item_name="Heavy Trunnion Bearings", quantity=2, unit_rate=9800.0),
                BoughtOutItem(equipment_type="Butterfly Valve", size_category="LARGE", item_name="High Performance Triple Offset Metal Seat", quantity=1, unit_rate=24000.0),
                BoughtOutItem(equipment_type="Butterfly Valve", size_category="LARGE", item_name="Dual Live-Loaded Gland Packing", quantity=2, unit_rate=4500.0, unit="set"),
                BoughtOutItem(equipment_type="Butterfly Valve", size_category="LARGE", item_name="Heavy Flange Fasteners Package", quantity=1, unit_rate=9500.0, unit="set"),
            ]
            db.add_all(bought_out_items)
            db.commit()

        # 4. Actuation Packages
        if db.query(ActuationPackage).count() == 0:
            actuations = [
                # Damper - Electrical
                ActuationPackage(equipment_type="Rack & Pinion Damper", actuation_type="Electrical", size_category="SMALL", actuator_cost=45000.0, gearbox_cost=18000.0, misc_cost=5000.0),
                ActuationPackage(equipment_type="Rack & Pinion Damper", actuation_type="Electrical", size_category="MEDIUM", actuator_cost=85000.0, gearbox_cost=32000.0, misc_cost=9000.0),
                ActuationPackage(equipment_type="Rack & Pinion Damper", actuation_type="Electrical", size_category="LARGE", actuator_cost=180000.0, gearbox_cost=65000.0, misc_cost=18000.0),
                # Damper - Pneumatic
                ActuationPackage(equipment_type="Rack & Pinion Damper", actuation_type="Pneumatic", size_category="SMALL", actuator_cost=28000.0, gearbox_cost=0.0, misc_cost=6500.0),
                ActuationPackage(equipment_type="Rack & Pinion Damper", actuation_type="Pneumatic", size_category="MEDIUM", actuator_cost=55000.0, gearbox_cost=0.0, misc_cost=11000.0),
                ActuationPackage(equipment_type="Rack & Pinion Damper", actuation_type="Pneumatic", size_category="LARGE", actuator_cost=120000.0, gearbox_cost=0.0, misc_cost=22000.0),
                # Damper - Manual
                ActuationPackage(equipment_type="Rack & Pinion Damper", actuation_type="Manual", size_category="SMALL", actuator_cost=0.0, gearbox_cost=8500.0, misc_cost=2000.0),
                ActuationPackage(equipment_type="Rack & Pinion Damper", actuation_type="Manual", size_category="MEDIUM", actuator_cost=0.0, gearbox_cost=16500.0, misc_cost=3500.0),
                ActuationPackage(equipment_type="Rack & Pinion Damper", actuation_type="Manual", size_category="LARGE", actuator_cost=0.0, gearbox_cost=38000.0, misc_cost=6000.0),

                # Valve - Electrical
                ActuationPackage(equipment_type="Butterfly Valve", actuation_type="Electrical", size_category="SMALL", actuator_cost=38000.0, gearbox_cost=14000.0, misc_cost=4500.0),
                ActuationPackage(equipment_type="Butterfly Valve", actuation_type="Electrical", size_category="MEDIUM", actuator_cost=72000.0, gearbox_cost=26000.0, misc_cost=7500.0),
                ActuationPackage(equipment_type="Butterfly Valve", actuation_type="Electrical", size_category="LARGE", actuator_cost=145000.0, gearbox_cost=52000.0, misc_cost=14000.0),
                # Valve - Pneumatic
                ActuationPackage(equipment_type="Butterfly Valve", actuation_type="Pneumatic", size_category="SMALL", actuator_cost=24000.0, gearbox_cost=0.0, misc_cost=5500.0),
                ActuationPackage(equipment_type="Butterfly Valve", actuation_type="Pneumatic", size_category="MEDIUM", actuator_cost=48000.0, gearbox_cost=0.0, misc_cost=9500.0),
                ActuationPackage(equipment_type="Butterfly Valve", actuation_type="Pneumatic", size_category="LARGE", actuator_cost=98000.0, gearbox_cost=0.0, misc_cost=17000.0),
                # Valve - Manual
                ActuationPackage(equipment_type="Butterfly Valve", actuation_type="Manual", size_category="SMALL", actuator_cost=0.0, gearbox_cost=5500.0, misc_cost=1500.0),
                ActuationPackage(equipment_type="Butterfly Valve", actuation_type="Manual", size_category="MEDIUM", actuator_cost=0.0, gearbox_cost=12500.0, misc_cost=2500.0),
                ActuationPackage(equipment_type="Butterfly Valve", actuation_type="Manual", size_category="LARGE", actuator_cost=0.0, gearbox_cost=28000.0, misc_cost=4500.0),
            ]
            db.add_all(actuations)
            db.commit()

        # 5. Seed initial sample quotations so dashboard is immediately populated with verified estimates
        if db.query(Quotation).count() == 0:
            sample_quotes = [
                {
                    "quote_number": "QUO-2026-001",
                    "customer_name": "Bharat Heavy Electricals Ltd",
                    "contact_person": "Mr. Rajesh Sharma",
                    "email": "rsharma@bhel.in",
                    "project_name": "Thermal Power Plant Flue Gas Unit 3",
                    "rfq_number": "BHEL/ENQ/2026/8912",
                    "delivery_location": "Nagpur, Maharashtra",
                    "equipment_type": "Rack & Pinion Damper",
                    "tag_number": "DMP-FGD-01",
                    "quantity": 1,
                    "length": 1400.0,
                    "width_diameter": 1200.0,
                    "depth": 350.0,
                    "body_material": "IS 2062",
                    "flap_disc_material": "SS 304 L",
                    "actuation_type": "Pneumatic",
                    "tax_percent": 18.0,
                    "margin_percent": 15.0,
                    "status": "Validated",
                    "remarks": "Standard design with high temperature Viton gland seals."
                },
                {
                    "quote_number": "QUO-2026-002",
                    "customer_name": "Tata Steel Utilities & Infrastructure",
                    "contact_person": "Ms. Ananya Roy",
                    "email": "ananya.roy@tatasteel.com",
                    "project_name": "Blast Furnace Gas Recirculation",
                    "rfq_number": "TSL/PUR/VALVE/4490",
                    "delivery_location": "Jamshedpur Works",
                    "equipment_type": "Butterfly Valve",
                    "tag_number": "BFV-GAS-102",
                    "quantity": 1,
                    "length": 1000.0,
                    "width_diameter": 1000.0,
                    "depth": 300.0,
                    "body_material": "SS 304 L",
                    "flap_disc_material": "SS 316 L",
                    "actuation_type": "Electrical",
                    "tax_percent": 18.0,
                    "margin_percent": 20.0,
                    "status": "Validated",
                    "remarks": "Triple offset valve with electric quarter-turn intelligent actuator."
                }
            ]

            for sq in sample_quotes:
                calc_res = calculate_full_estimate(
                    db=db,
                    equipment_type=sq["equipment_type"],
                    length=sq["length"],
                    width_diameter=sq["width_diameter"],
                    depth=sq["depth"],
                    body_material=sq["body_material"],
                    flap_disc_material=sq["flap_disc_material"],
                    actuation_type=sq["actuation_type"],
                    quantity=sq["quantity"],
                    tax_percent=sq["tax_percent"],
                    margin_percent=sq["margin_percent"]
                )

                cb = calc_res["cost_breakdown"]
                q = Quotation(
                    quote_number=sq["quote_number"],
                    revision=0,
                    customer_name=sq["customer_name"],
                    contact_person=sq["contact_person"],
                    email=sq["email"],
                    project_name=sq["project_name"],
                    rfq_number=sq["rfq_number"],
                    delivery_location=sq["delivery_location"],
                    equipment_type=sq["equipment_type"],
                    tag_number=sq["tag_number"],
                    quantity=sq["quantity"],
                    length=sq["length"],
                    width_diameter=sq["width_diameter"],
                    depth=sq["depth"],
                    body_material=sq["body_material"],
                    flap_disc_material=sq["flap_disc_material"],
                    actuation_type=sq["actuation_type"],
                    size_category=calc_res["size_category"],
                    governing_dimension=calc_res["governing_dimension"],
                    total_weight_kg=calc_res["total_weight_kg"],
                    raw_material_cost=cb.raw_material_cost,
                    cutting_cost=cb.cutting_cost,
                    machining_cost=cb.machining_cost,
                    fabrication_cost=cb.fabrication_cost,
                    finishing_cost=cb.finishing_cost,
                    bought_out_cost=cb.bought_out_cost,
                    actuation_cost=cb.actuation_cost,
                    subtotal=cb.subtotal,
                    tax_percent=cb.tax_percent,
                    tax_amount=cb.tax_amount,
                    margin_percent=cb.margin_percent,
                    margin_amount=cb.margin_amount,
                    final_amount=cb.final_amount,
                    status=sq["status"],
                    remarks=sq["remarks"]
                )
                db.add(q)
                db.flush()

                for b in calc_res["bom_items"]:
                    bom_item = QuotationBOMItem(
                        quotation_id=q.id,
                        part_name=b.part_name,
                        category=b.category,
                        shape=b.shape,
                        material_grade=b.material_grade,
                        length=b.length,
                        width=b.width,
                        thickness=b.thickness,
                        diameter=b.diameter,
                        wall_thickness=b.wall_thickness,
                        quantity=b.quantity,
                        unit_weight=b.unit_weight,
                        total_weight=b.total_weight,
                        raw_material_cost=b.raw_material_cost,
                        cutting_cost=b.cutting_cost,
                        machining_cost=b.machining_cost,
                        unit_machining_rate=b.unit_machining_rate
                    )
                    db.add(bom_item)
                db.commit()

    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
    print("Database seeded successfully!")

import os
import json
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.database import engine, Base, get_db
from backend.models import (
    Material, ProcessingRate, BoughtOutItem, ActuationPackage,
    Quotation, QuotationBOMItem, MaterialRateAudit
)
from backend.schemas import (
    EquipmentConfigInput, EstimateCalculationResponse, BOMItemInput,
    QuotationSummary, QuotationDetailResponse,
    MaterialSchema, MaterialUpdateSchema,
    ProcessingRateSchema, ProcessingRateUpdateSchema,
    BoughtOutItemSchema, ActuationPackageSchema,
    ExtractionResponse, CostBreakdown, BOMItemResponse, MaterialRateAuditSchema
)
from backend.seed_data import seed_database
from backend.services.calculation_service import calculate_full_estimate
from backend.services.pdf_extractor import extract_pdf_specifications
from backend.services.pdf_generator import generate_quotation_pdf


def bom_extra_fields(item):
    return {
        "unit": item.unit,
        "unit_weight_override": item.unit_weight_override,
        "unit_material_rate": item.unit_material_rate,
        "rate_source": item.rate_source,
        "unit_fabrication_cost": item.unit_fabrication_cost,
        "material_rate": item.material_rate,
        "fabrication_cost": item.fabrication_cost,
        "component_total": item.component_total,
        "is_purchased": item.is_purchased,
        "unit_purchase_rate": item.unit_purchase_rate,
        "purchase_cost": item.purchase_cost,
    }

# Ensure database tables and seed data exist
seed_database()

app = FastAPI(
    title="Smart Valve & Damper Estimation Platform API",
    version="1.0.0",
    description="Automated technical configuration, BOM generation, cost estimation, and PDF quotation generation for industrial valves & dampers."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/v1/health")
def health_check(db: Session = Depends(get_db)):
    mat_count = db.query(Material).count()
    quo_count = db.query(Quotation).count()
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "database": "connected",
        "active_materials_count": mat_count,
        "saved_quotations_count": quo_count
    }

@app.get("/api/v1/options")
def get_dropdown_options(db: Session = Depends(get_db)):
    materials = db.query(Material).filter(Material.is_active == True).all()
    proc_rates = db.query(ProcessingRate).all()

    return {
        "equipment_types": [
            {
                "id": "Rack & Pinion Damper",
                "label": "Rack & Pinion Damper",
                "description": "Heavy-duty rectangular flow isolation & modulation damper for flue gas and hot air ducts."
            },
            {
                "id": "Butterfly Valve",
                "label": "Butterfly Valve",
                "description": "Quarter-turn circular disc valve for pipelines, ductwork, and process water/gas."
            },
            *[
                {"id": name, "label": name, "description": "Preliminary component template; confirm against approved equipment drawings."}
                for name in (
                    "Gate Valve", "Globe Valve", "Ball Valve", "Check Valve",
                    "Pressure Relief Valve", "Single-Blade Damper", "Multi-Blade Damper",
                    "Flue Gas Damper", "Guillotine Damper", "Diverter Damper",
                )
            ]
        ],
        "materials": [
            {
                "name": m.name,
                "density": m.density,
                "raw_rate": m.raw_rate,
                "fab_multiplier": m.fab_multiplier,
                "unit": m.unit
            } for m in materials
        ],
        "actuation_types": [
            {"id": "Pneumatic", "label": "Pneumatic Actuator", "description": "Double-acting / spring-return cylinder with solenoid and limit switches."},
            {"id": "Electrical", "label": "Electrical Actuator", "description": "Electric multi-turn / quarter-turn motorized actuator with integral starter."},
            {"id": "Manual", "label": "Manual Operation", "description": "Handwheel with worm gearbox or lever mechanism."}
        ],
        "processing_rates": {r.code: r.rate_per_kg for r in proc_rates},
        "dimensional_limits": {
            "length": {"min": 100, "max": 10000, "unit": "mm", "default": 1200},
            "width_diameter": {"min": 100, "max": 10000, "unit": "mm", "default": 1200},
            "depth": {"min": 50, "max": 2000, "unit": "mm", "default": 400}
        }
    }

@app.get("/api/v1/sample-spec-pdf")
def get_sample_spec_pdf():
    pdf_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sample_customer_damper_spec.pdf")
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="Sample PDF not found")
    with open(pdf_path, "rb") as f:
        content = f.read()
    return Response(content=content, media_type="application/pdf", headers={"Content-Disposition": 'inline; filename="sample_customer_damper_spec.pdf"'})

@app.post("/api/v1/specifications/extract", response_model=ExtractionResponse)
async def extract_specification_from_pdf(file: UploadFile = File(...)):
    """Accepts uploaded customer technical specification PDF and returns extracted fields with confidence and traceability."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported for technical specification extraction.")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(file_bytes) > 25 * 1024 * 1024:  # 25 MB limit
        raise HTTPException(status_code=400, detail="Uploaded PDF exceeds the maximum supported size of 25MB.")

    result = extract_pdf_specifications(file_bytes, file.filename)
    return result

@app.post("/api/v1/estimates/calculate", response_model=EstimateCalculationResponse)
def calculate_estimate_preview(config: EquipmentConfigInput, db: Session = Depends(get_db)):
    """Performs instant recalculation and cost aggregation without creating a database quotation record."""
    try:
        calc = calculate_full_estimate(
            db=db,
            equipment_type=config.equipment_type,
            length=config.length,
            width_diameter=config.width_diameter,
            depth=config.depth,
            body_material=config.body_material,
            flap_disc_material=config.flap_disc_material,
            actuation_type=config.actuation_type,
            quantity=config.quantity,
            custom_bom=config.custom_bom,
            tax_percent=config.tax_percent or 0.0,
            margin_percent=config.margin_percent or 0.0,
            allow_fallback_pricing=False
        )
        return calc
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.post("/api/v1/estimates", response_model=QuotationDetailResponse)
def create_estimate(config: EquipmentConfigInput, db: Session = Depends(get_db)):
    """Saves a new estimate / draft quotation with full calculated BOM and pricing snapshot."""
    calc = calculate_full_estimate(
        db=db,
        equipment_type=config.equipment_type,
        length=config.length,
        width_diameter=config.width_diameter,
        depth=config.depth,
        body_material=config.body_material,
        flap_disc_material=config.flap_disc_material,
        actuation_type=config.actuation_type,
        quantity=config.quantity,
        custom_bom=config.custom_bom,
        tax_percent=config.tax_percent or 0.0,
        margin_percent=config.margin_percent or 0.0,
        allow_fallback_pricing=True
    )

    # Generate next quotation number
    curr_year = datetime.utcnow().year
    count_today = db.query(Quotation).count() + 1
    quote_number = f"QUO-{curr_year}-{count_today:03d}"

    cb = calc["cost_breakdown"]
    snapshot_str = json.dumps(calc["pricing_snapshot"])

    quotation = Quotation(
        quote_number=quote_number,
        revision=0,
        customer_name=config.customer_name,
        contact_person=config.contact_person,
        email=config.email,
        phone=config.phone,
        project_name=config.project_name,
        rfq_number=config.rfq_number,
        delivery_location=config.delivery_location,
        equipment_type=config.equipment_type,
        tag_number=config.tag_number,
        quantity=config.quantity,
        length=config.length,
        width_diameter=config.width_diameter,
        depth=config.depth,
        body_material=config.body_material,
        flap_disc_material=config.flap_disc_material,
        actuation_type=config.actuation_type,
        size_category=calc["size_category"],
        governing_dimension=calc["governing_dimension"],
        total_weight_kg=calc["total_weight_kg"],
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
        status=config.status or "Draft",
        remarks=config.remarks,
        pricing_snapshot_json=snapshot_str,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(quotation)
    db.flush()

    for item in calc["bom_items"]:
        b_item = QuotationBOMItem(
            quotation_id=quotation.id,
            part_name=item.part_name,
            category=item.category,
            shape=item.shape,
            material_grade=item.material_grade,
            length=item.length,
            width=item.width,
            thickness=item.thickness,
            diameter=item.diameter,
            wall_thickness=item.wall_thickness,
            quantity=item.quantity,
            unit_weight=item.unit_weight,
            total_weight=item.total_weight,
            raw_material_cost=item.raw_material_cost,
            cutting_cost=item.cutting_cost,
            machining_cost=item.machining_cost,
            unit_machining_rate=item.unit_machining_rate,
            **bom_extra_fields(item)
        )
        db.add(b_item)

    db.commit()
    db.refresh(quotation)

    return format_quotation_detail(quotation)

@app.get("/api/v1/estimates", response_model=List[QuotationSummary])
def list_estimates(
    search: Optional[str] = Query(None),
    equipment_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Returns saved estimates and quotations with optional filtering."""
    query = db.query(Quotation)
    if search:
        s = f"%{search}%"
        query = query.filter(
            (Quotation.customer_name.ilike(s)) |
            (Quotation.quote_number.ilike(s)) |
            (Quotation.project_name.ilike(s)) |
            (Quotation.rfq_number.ilike(s))
        )
    if equipment_type:
        query = query.filter(Quotation.equipment_type == equipment_type)
    if status:
        query = query.filter(Quotation.status == status)

    quotes = query.order_by(Quotation.updated_at.desc()).all()
    return [
        QuotationSummary(
            id=q.id,
            quote_number=q.quote_number,
            revision=q.revision,
            customer_name=q.customer_name,
            project_name=q.project_name,
            equipment_type=q.equipment_type,
            tag_number=q.tag_number,
            size_category=q.size_category,
            total_weight_kg=q.total_weight_kg,
            final_amount=q.final_amount,
            status=q.status,
            created_at=q.created_at,
            updated_at=q.updated_at
        ) for q in quotes
    ]

@app.get("/api/v1/estimates/{estimate_id}", response_model=QuotationDetailResponse)
def get_estimate(estimate_id: int, db: Session = Depends(get_db)):
    """Retrieves full details of a saved estimate including all calculated BOM rows."""
    q = db.query(Quotation).filter(Quotation.id == estimate_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return format_quotation_detail(q)

@app.put("/api/v1/estimates/{estimate_id}", response_model=QuotationDetailResponse)
def update_estimate(estimate_id: int, config: EquipmentConfigInput, db: Session = Depends(get_db)):
    """Updates an existing draft quotation."""
    q = db.query(Quotation).filter(Quotation.id == estimate_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")

    calc = calculate_full_estimate(
        db=db,
        equipment_type=config.equipment_type,
        length=config.length,
        width_diameter=config.width_diameter,
        depth=config.depth,
        body_material=config.body_material,
        flap_disc_material=config.flap_disc_material,
        actuation_type=config.actuation_type,
        quantity=config.quantity,
        custom_bom=config.custom_bom,
        tax_percent=config.tax_percent or 0.0,
        margin_percent=config.margin_percent or 0.0,
        allow_fallback_pricing=True
    )
    cb = calc["cost_breakdown"]

    q.customer_name = config.customer_name
    q.contact_person = config.contact_person
    q.email = config.email
    q.phone = config.phone
    q.project_name = config.project_name
    q.rfq_number = config.rfq_number
    q.delivery_location = config.delivery_location
    q.equipment_type = config.equipment_type
    q.tag_number = config.tag_number
    q.quantity = config.quantity
    q.length = config.length
    q.width_diameter = config.width_diameter
    q.depth = config.depth
    q.body_material = config.body_material
    q.flap_disc_material = config.flap_disc_material
    q.actuation_type = config.actuation_type
    q.size_category = calc["size_category"]
    q.governing_dimension = calc["governing_dimension"]
    q.total_weight_kg = calc["total_weight_kg"]
    q.raw_material_cost = cb.raw_material_cost
    q.cutting_cost = cb.cutting_cost
    q.machining_cost = cb.machining_cost
    q.fabrication_cost = cb.fabrication_cost
    q.finishing_cost = cb.finishing_cost
    q.bought_out_cost = cb.bought_out_cost
    q.actuation_cost = cb.actuation_cost
    q.subtotal = cb.subtotal
    q.tax_percent = cb.tax_percent
    q.tax_amount = cb.tax_amount
    q.margin_percent = cb.margin_percent
    q.margin_amount = cb.margin_amount
    q.final_amount = cb.final_amount
    q.status = config.status or q.status
    q.remarks = config.remarks
    q.updated_at = datetime.utcnow()

    # Clear and replace BOM items
    db.query(QuotationBOMItem).filter(QuotationBOMItem.quotation_id == q.id).delete()
    for item in calc["bom_items"]:
        b_item = QuotationBOMItem(
            quotation_id=q.id,
            part_name=item.part_name,
            category=item.category,
            shape=item.shape,
            material_grade=item.material_grade,
            length=item.length,
            width=item.width,
            thickness=item.thickness,
            diameter=item.diameter,
            wall_thickness=item.wall_thickness,
            quantity=item.quantity,
            unit_weight=item.unit_weight,
            total_weight=item.total_weight,
            raw_material_cost=item.raw_material_cost,
            cutting_cost=item.cutting_cost,
            machining_cost=item.machining_cost,
            unit_machining_rate=item.unit_machining_rate,
            **bom_extra_fields(item)
        )
        db.add(b_item)

    db.commit()
    db.refresh(q)
    return format_quotation_detail(q)

@app.post("/api/v1/estimates/{estimate_id}/duplicate", response_model=QuotationDetailResponse)
def duplicate_estimate(estimate_id: int, db: Session = Depends(get_db)):
    """Duplicates an existing estimate as a new draft."""
    q = db.query(Quotation).filter(Quotation.id == estimate_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")

    curr_year = datetime.utcnow().year
    count_today = db.query(Quotation).count() + 1
    new_quote_num = f"QUO-{curr_year}-{count_today:03d}"

    new_q = Quotation(
        quote_number=new_quote_num,
        revision=0,
        customer_name=f"{q.customer_name} (Copy)",
        contact_person=q.contact_person,
        email=q.email,
        phone=q.phone,
        project_name=q.project_name,
        rfq_number=q.rfq_number,
        delivery_location=q.delivery_location,
        equipment_type=q.equipment_type,
        tag_number=q.tag_number,
        quantity=q.quantity,
        length=q.length,
        width_diameter=q.width_diameter,
        depth=q.depth,
        body_material=q.body_material,
        flap_disc_material=q.flap_disc_material,
        actuation_type=q.actuation_type,
        size_category=q.size_category,
        governing_dimension=q.governing_dimension,
        total_weight_kg=q.total_weight_kg,
        raw_material_cost=q.raw_material_cost,
        cutting_cost=q.cutting_cost,
        machining_cost=q.machining_cost,
        fabrication_cost=q.fabrication_cost,
        finishing_cost=q.finishing_cost,
        bought_out_cost=q.bought_out_cost,
        actuation_cost=q.actuation_cost,
        subtotal=q.subtotal,
        tax_percent=q.tax_percent,
        tax_amount=q.tax_amount,
        margin_percent=q.margin_percent,
        margin_amount=q.margin_amount,
        final_amount=q.final_amount,
        status="Draft",
        remarks=q.remarks,
        pricing_snapshot_json=q.pricing_snapshot_json,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(new_q)
    db.flush()

    for item in q.bom_items:
        b_item = QuotationBOMItem(
            quotation_id=new_q.id,
            part_name=item.part_name,
            category=item.category,
            shape=item.shape,
            material_grade=item.material_grade,
            length=item.length,
            width=item.width,
            thickness=item.thickness,
            diameter=item.diameter,
            wall_thickness=item.wall_thickness,
            quantity=item.quantity,
            unit_weight=item.unit_weight,
            total_weight=item.total_weight,
            raw_material_cost=item.raw_material_cost,
            cutting_cost=item.cutting_cost,
            machining_cost=item.machining_cost,
            unit_machining_rate=item.unit_machining_rate,
            **bom_extra_fields(item)
        )
        db.add(b_item)

    db.commit()
    db.refresh(new_q)
    return format_quotation_detail(new_q)

@app.post("/api/v1/estimates/{estimate_id}/recalculate", response_model=QuotationDetailResponse)
def recalculate_estimate_with_current_rates(estimate_id: int, db: Session = Depends(get_db)):
    """Recalculates a quotation using current active rates, creating a new revision."""
    q = db.query(Quotation).filter(Quotation.id == estimate_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")

    custom_bom = [
        BOMItemInput(
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
            unit_machining_rate=b.unit_machining_rate,
            unit_weight_override=b.unit_weight_override,
            unit_material_rate=b.unit_material_rate,
            rate_source=b.rate_source,
            unit_fabrication_cost=b.unit_fabrication_cost,
            unit=b.unit,
            is_purchased=b.is_purchased,
            unit_purchase_rate=b.unit_purchase_rate,
            **bom_extra_fields(b)
        ) for b in q.bom_items
    ]

    calc = calculate_full_estimate(
        db=db,
        equipment_type=q.equipment_type,
        length=q.length,
        width_diameter=q.width_diameter,
        depth=q.depth,
        body_material=q.body_material,
        flap_disc_material=q.flap_disc_material,
        actuation_type=q.actuation_type,
        quantity=q.quantity,
        custom_bom=custom_bom,
        tax_percent=q.tax_percent,
        margin_percent=q.margin_percent,
        allow_fallback_pricing=True
    )
    cb = calc["cost_breakdown"]

    # Increment revision
    q.revision += 1
    q.raw_material_cost = cb.raw_material_cost
    q.cutting_cost = cb.cutting_cost
    q.machining_cost = cb.machining_cost
    q.fabrication_cost = cb.fabrication_cost
    q.finishing_cost = cb.finishing_cost
    q.bought_out_cost = cb.bought_out_cost
    q.actuation_cost = cb.actuation_cost
    q.subtotal = cb.subtotal
    q.tax_amount = cb.tax_amount
    q.margin_amount = cb.margin_amount
    q.final_amount = cb.final_amount
    q.pricing_snapshot_json = json.dumps(calc["pricing_snapshot"])
    q.updated_at = datetime.utcnow()

    # Update BOM cost figures
    db.query(QuotationBOMItem).filter(QuotationBOMItem.quotation_id == q.id).delete()
    for item in calc["bom_items"]:
        b_item = QuotationBOMItem(
            quotation_id=q.id,
            part_name=item.part_name,
            category=item.category,
            shape=item.shape,
            material_grade=item.material_grade,
            length=item.length,
            width=item.width,
            thickness=item.thickness,
            diameter=item.diameter,
            wall_thickness=item.wall_thickness,
            quantity=item.quantity,
            unit_weight=item.unit_weight,
            total_weight=item.total_weight,
            raw_material_cost=item.raw_material_cost,
            cutting_cost=item.cutting_cost,
            machining_cost=item.machining_cost,
            unit_machining_rate=item.unit_machining_rate,
            **bom_extra_fields(item)
        )
        db.add(b_item)

    db.commit()
    db.refresh(q)
    return format_quotation_detail(q)

@app.post("/api/v1/estimates/{estimate_id}/issue", response_model=QuotationDetailResponse)
def issue_quotation(estimate_id: int, db: Session = Depends(get_db)):
    """Marks estimate as officially 'Issued'."""
    q = db.query(Quotation).filter(Quotation.id == estimate_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    q.status = "Issued"
    q.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(q)
    return format_quotation_detail(q)

@app.get("/api/v1/quotations/{quotation_id}/pdf")
def download_quotation_pdf(quotation_id: int, db: Session = Depends(get_db)):
    """Generates and streams the formal Technical & Commercial Quotation PDF."""
    q = db.query(Quotation).filter(Quotation.id == quotation_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")

    quote_payload = {
        "quote_number": q.quote_number,
        "revision": q.revision,
        "created_date": q.created_at.strftime("%d-%b-%Y"),
        "customer_name": q.customer_name,
        "contact_person": q.contact_person,
        "email": q.email,
        "phone": q.phone,
        "project_name": q.project_name,
        "rfq_number": q.rfq_number,
        "delivery_location": q.delivery_location,
        "equipment_type": q.equipment_type,
        "tag_number": q.tag_number,
        "quantity": q.quantity,
        "length": q.length,
        "width_diameter": q.width_diameter,
        "depth": q.depth,
        "body_material": q.body_material,
        "flap_disc_material": q.flap_disc_material,
        "actuation_type": q.actuation_type,
        "size_category": q.size_category,
        "total_weight_kg": q.total_weight_kg,
        "status": q.status,
        "remarks": q.remarks,
        "cost_breakdown": {
            "raw_material_cost": q.raw_material_cost,
            "cutting_cost": q.cutting_cost,
            "machining_cost": q.machining_cost,
            "fabrication_cost": q.fabrication_cost,
            "finishing_cost": q.finishing_cost,
            "bought_out_cost": q.bought_out_cost,
            "actuation_cost": q.actuation_cost,
            "subtotal": q.subtotal,
            "tax_percent": q.tax_percent,
            "tax_amount": q.tax_amount,
            "margin_percent": q.margin_percent,
            "margin_amount": q.margin_amount,
            "final_amount": q.final_amount
        },
        "bom_items": [
            {
                "part_name": b.part_name,
                "category": b.category,
                "shape": b.shape,
                "material_grade": b.material_grade,
                "quantity": b.quantity,
                "unit_weight": b.unit_weight,
                "total_weight": b.total_weight,
                "raw_material_cost": b.raw_material_cost,
                "cutting_cost": b.cutting_cost,
                "machining_cost": b.machining_cost
            } for b in q.bom_items
        ]
    }

    pdf_bytes = generate_quotation_pdf(quote_payload)
    safe_name = f"{q.quote_number}_Rev{q.revision}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}"'
        }
    )

# --- Pricing & Material Administration Endpoints ---

@app.get("/api/v1/materials", response_model=List[MaterialSchema])
def list_materials(db: Session = Depends(get_db)):
    mats = db.query(Material).all()
    return mats

@app.put("/api/v1/materials/{material_id}", response_model=MaterialSchema)
def update_material(material_id: int, payload: MaterialUpdateSchema, db: Session = Depends(get_db)):
    m = db.query(Material).filter(Material.id == material_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")
    if payload.raw_rate is not None:
        previous_rate = m.raw_rate
        m.raw_rate = payload.raw_rate
        if previous_rate != payload.raw_rate:
            db.add(MaterialRateAudit(
                material_name=m.name,
                previous_rate=previous_rate,
                new_rate=payload.raw_rate,
                changed_by="Administrator",
            ))
        if payload.apply_to_bom_item_ids:
            selected_items = db.query(QuotationBOMItem).filter(
                QuotationBOMItem.id.in_(payload.apply_to_bom_item_ids),
                QuotationBOMItem.material_grade == m.name,
            ).all()
            if len(selected_items) != len(set(payload.apply_to_bom_item_ids)):
                raise HTTPException(
                    status_code=400,
                    detail="One or more selected BOM items were not found or do not use this material.",
                )
            affected_quotes = set()
            for bom_item in selected_items:
                bom_item.unit_material_rate = payload.raw_rate
                bom_item.rate_source = "material_default"
                bom_item.material_rate = payload.raw_rate
                bom_item.raw_material_cost = round(
                    bom_item.total_weight * payload.raw_rate, 2
                )
                bom_item.component_total = round(
                    bom_item.raw_material_cost + bom_item.cutting_cost +
                    bom_item.machining_cost + bom_item.fabrication_cost +
                    bom_item.purchase_cost, 2
                )
                affected_quotes.add(bom_item.quotation)
            for quote in affected_quotes:
                quote.raw_material_cost = round(
                    sum(item.raw_material_cost for item in quote.bom_items), 2
                )
                quote.subtotal = round(
                    quote.raw_material_cost + quote.cutting_cost + quote.machining_cost +
                    quote.fabrication_cost + quote.finishing_cost + quote.bought_out_cost +
                    quote.actuation_cost, 2
                )
                quote.margin_amount = round(quote.subtotal * quote.margin_percent / 100, 2)
                quote.tax_amount = round(
                    (quote.subtotal + quote.margin_amount) * quote.tax_percent / 100, 2
                )
                quote.final_amount = round(
                    quote.subtotal + quote.margin_amount + quote.tax_amount, 2
                )
                quote.updated_at = datetime.utcnow()
    if payload.density is not None:
        m.density = payload.density
    if payload.fab_multiplier is not None:
        m.fab_multiplier = payload.fab_multiplier
    if payload.is_active is not None:
        m.is_active = payload.is_active
    m.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(m)
    return m

@app.get("/api/v1/material-rate-audit", response_model=List[MaterialRateAuditSchema])
def list_material_rate_audit(
    material_name: Optional[str] = None, db: Session = Depends(get_db)
):
    query = db.query(MaterialRateAudit)
    if material_name:
        query = query.filter(MaterialRateAudit.material_name == material_name)
    return query.order_by(MaterialRateAudit.changed_at.desc()).limit(200).all()

@app.post("/api/v1/materials", response_model=MaterialSchema)
def create_material(payload: MaterialSchema, db: Session = Depends(get_db)):
    existing = db.query(Material).filter(Material.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Material with this name already exists")
    m = Material(
        name=payload.name,
        density=payload.density,
        raw_rate=payload.raw_rate,
        fab_multiplier=payload.fab_multiplier,
        unit=payload.unit,
        is_active=payload.is_active
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m

@app.get("/api/v1/processing-rates", response_model=List[ProcessingRateSchema])
def list_processing_rates(db: Session = Depends(get_db)):
    return db.query(ProcessingRate).all()

@app.put("/api/v1/processing-rates/{rate_code}", response_model=ProcessingRateSchema)
def update_processing_rate(rate_code: str, payload: ProcessingRateUpdateSchema, db: Session = Depends(get_db)):
    r = db.query(ProcessingRate).filter(ProcessingRate.code == rate_code).first()
    if not r:
        raise HTTPException(status_code=404, detail="Processing rate not found")
    r.rate_per_kg = payload.rate_per_kg
    r.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(r)
    return r

@app.get("/api/v1/bought-out-items", response_model=List[BoughtOutItemSchema])
def list_bought_out_items(
    equipment_type: Optional[str] = None,
    size_category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(BoughtOutItem)
    if equipment_type:
        q = q.filter(BoughtOutItem.equipment_type == equipment_type)
    if size_category:
        q = q.filter(BoughtOutItem.size_category == size_category)
    return q.all()

@app.post("/api/v1/bought-out-items", response_model=BoughtOutItemSchema)
def create_bought_out_item(item: BoughtOutItemSchema, db: Session = Depends(get_db)):
    b = BoughtOutItem(
        equipment_type=item.equipment_type,
        size_category=item.size_category,
        item_name=item.item_name,
        quantity=item.quantity,
        unit_rate=item.unit_rate,
        unit=item.unit,
        notes=item.notes
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return b

@app.get("/api/v1/actuation-packages", response_model=List[ActuationPackageSchema])
def list_actuation_packages(
    equipment_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(ActuationPackage)
    if equipment_type:
        q = q.filter(ActuationPackage.equipment_type == equipment_type)
    return q.all()

def format_quotation_detail(q: Quotation) -> QuotationDetailResponse:
    cb = CostBreakdown(
        raw_material_cost=q.raw_material_cost,
        cutting_cost=q.cutting_cost,
        machining_cost=q.machining_cost,
        fabrication_cost=q.fabrication_cost,
        finishing_cost=q.finishing_cost,
        bought_out_cost=q.bought_out_cost,
        actuation_cost=q.actuation_cost,
        subtotal=q.subtotal,
        tax_percent=q.tax_percent,
        tax_amount=q.tax_amount,
        margin_percent=q.margin_percent,
        margin_amount=q.margin_amount,
        final_amount=q.final_amount
    )
    boms = [
        BOMItemResponse(
            id=b.id,
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
            unit_machining_rate=b.unit_machining_rate,
            unit_weight=b.unit_weight,
            total_weight=b.total_weight,
            raw_material_cost=b.raw_material_cost,
            cutting_cost=b.cutting_cost,
            machining_cost=b.machining_cost
        ) for b in q.bom_items
    ]
    return QuotationDetailResponse(
        id=q.id,
        quote_number=q.quote_number,
        revision=q.revision,
        customer_name=q.customer_name,
        contact_person=q.contact_person,
        email=q.email,
        phone=q.phone,
        project_name=q.project_name,
        rfq_number=q.rfq_number,
        delivery_location=q.delivery_location,
        equipment_type=q.equipment_type,
        tag_number=q.tag_number,
        quantity=q.quantity,
        length=q.length,
        width_diameter=q.width_diameter,
        depth=q.depth,
        body_material=q.body_material,
        flap_disc_material=q.flap_disc_material,
        actuation_type=q.actuation_type,
        size_category=q.size_category,
        governing_dimension=q.governing_dimension,
        total_weight_kg=q.total_weight_kg,
        cost_breakdown=cb,
        bom_items=boms,
        status=q.status,
        remarks=q.remarks,
        pricing_snapshot_json=q.pricing_snapshot_json,
        created_at=q.created_at,
        updated_at=q.updated_at
    )

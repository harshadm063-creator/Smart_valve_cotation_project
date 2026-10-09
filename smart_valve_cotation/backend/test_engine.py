import math

from backend.engine.calculation import (
    determine_size_category,
    calculate_volume,
    calculate_weight,
    generate_standard_bom,
    EngineeringValidationError
)
from backend.database import SessionLocal, Base, engine
from backend.seed_data import seed_database
from backend.services.calculation_service import calculate_full_estimate
from backend.services.pdf_generator import generate_quotation_pdf

def test_size_classification():
    # Boundary at 1500 mm
    cat, _ = determine_size_category(1500.0, 1200.0)
    assert cat == "SMALL"

    # Immediately above 1500 mm
    cat, _ = determine_size_category(1501.0, 1000.0)
    assert cat == "MEDIUM"

    # Boundary at 3500 mm
    cat, _ = determine_size_category(3500.0, 2000.0)
    assert cat == "MEDIUM"

    # Immediately above 3500 mm
    cat, _ = determine_size_category(3501.0, 2000.0)
    assert cat == "LARGE"

def test_volume_plate():
    # Plate: 1000 x 500 x 10 mm
    vol = calculate_volume("plate", {"length": 1000.0, "width": 500.0, "thickness": 10.0})
    expected = 1000.0 * 500.0 * 10.0
    assert vol == expected

def test_volume_round_bar():
    # Round bar: dia 50 mm, length 1000 mm
    vol = calculate_volume("round_bar", {"diameter": 50.0, "length": 1000.0})
    expected = math.pi * (25.0 ** 2) * 1000.0
    assert abs(vol - expected) < 1e-4

def test_volume_pipe():
    # Pipe: OD = 100 mm, wall = 10 mm, length = 1000 mm (ID = 80 mm)
    vol = calculate_volume("pipe", {"diameter": 100.0, "wall_thickness": 10.0, "length": 1000.0})
    outer_r = 50.0
    inner_r = 40.0
    expected = math.pi * ((outer_r ** 2) - (inner_r ** 2)) * 1000.0
    assert abs(vol - expected) < 1e-4

def test_invalid_pipe_geometry():
    # Wall thickness too large (wall = 60 mm for OD = 100 mm => inner dia negative)
    try:
        calculate_volume("pipe", {"diameter": 100.0, "wall_thickness": 60.0, "length": 1000.0})
        assert False, "Should have raised EngineeringValidationError"
    except EngineeringValidationError:
        assert True

def test_weight_calculation():
    # Volume = 1,000,000 mm3, density = 0.00000785 kg/mm3 (IS 2062)
    # Unit weight = 7.85 kg, Qty = 2 => Total weight = 15.70 kg
    u_wt, t_wt = calculate_weight(1_000_000.0, 0.00000785, quantity=2)
    assert abs(u_wt - 7.85) < 1e-5
    assert abs(t_wt - 15.70) < 1e-5

def test_calculation_service_consistency():
    seed_database()
    db = SessionLocal()
    try:
        res = calculate_full_estimate(
            db=db,
            equipment_type="Rack & Pinion Damper",
            length=1200.0,
            width_diameter=1200.0,
            depth=400.0,
            body_material="IS 2062",
            flap_disc_material="SS 304 L",
            actuation_type="Pneumatic",
            quantity=1
        )
        cb = res["cost_breakdown"]
        expected_subtotal = round(
            cb.raw_material_cost +
            cb.cutting_cost +
            cb.machining_cost +
            cb.fabrication_cost +
            cb.finishing_cost +
            cb.bought_out_cost +
            cb.actuation_cost,
            2
        )
        assert abs(cb.subtotal - expected_subtotal) < 0.05
        assert res["size_category"] == "SMALL"
    finally:
        db.close()

def test_butterfly_valve_medium_missing_bought_out_flag():
    seed_database()
    db = SessionLocal()
    try:
        # Size > 1500 mm => MEDIUM Butterfly Valve
        res = calculate_full_estimate(
            db=db,
            equipment_type="Butterfly Valve",
            length=1800.0,
            width_diameter=1800.0,
            depth=400.0,
            body_material="SS 304 L",
            flap_disc_material="SS 316 L",
            actuation_type="Electrical",
            quantity=1,
            allow_fallback_pricing=False
        )
        # Must have warning about missing medium bought out configuration
        has_warning = any("Medium Butterfly Valves require an authorized pricing rule" in w or "No configured bought-out" in w for w in res["warnings"])
        assert has_warning, "Should flag missing medium bought-out configuration for Butterfly Valve"
    finally:
        db.close()

def test_pdf_generation():
    seed_database()
    db = SessionLocal()
    try:
        res = calculate_full_estimate(
            db=db,
            equipment_type="Rack & Pinion Damper",
            length=1400.0,
            width_diameter=1200.0,
            depth=350.0,
            body_material="IS 2062",
            flap_disc_material="SS 304 L",
            actuation_type="Pneumatic",
            quantity=1
        )
        quote_payload = {
            "quote_number": "QUO-TEST-001",
            "revision": 0,
            "created_date": "09-Oct-2026",
            "customer_name": "Test Engineering Corp",
            "contact_person": "Chief Engineer",
            "project_name": "Test Project",
            "rfq_number": "RFQ-12345",
            "delivery_location": "Chennai Plant",
            "equipment_type": "Rack & Pinion Damper",
            "tag_number": "TAG-TEST-1",
            "quantity": 1,
            "length": 1400.0,
            "width_diameter": 1200.0,
            "depth": 350.0,
            "body_material": "IS 2062",
            "flap_disc_material": "SS 304 L",
            "actuation_type": "Pneumatic",
            "size_category": res["size_category"],
            "total_weight_kg": res["total_weight_kg"],
            "cost_breakdown": res["cost_breakdown"].model_dump(),
            "bom_items": [b.model_dump() for b in res["bom_items"]],
            "status": "Validated",
            "remarks": "Test remarks"
        }
        pdf_bytes = generate_quotation_pdf(quote_payload)
        assert len(pdf_bytes) > 1000
        assert pdf_bytes.startswith(b"%PDF")
    finally:
        db.close()

if __name__ == "__main__":
    test_size_classification()
    test_volume_plate()
    test_volume_round_bar()
    test_volume_pipe()
    test_invalid_pipe_geometry()
    test_weight_calculation()
    test_calculation_service_consistency()
    test_butterfly_valve_medium_missing_bought_out_flag()
    test_pdf_generation()
    print("ALL 9 UNIT TESTS PASSED SUCCESSFULLY!")

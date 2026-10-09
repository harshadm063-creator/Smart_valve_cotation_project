import math
from typing import Dict, List, Any, Optional, Tuple
from sqlalchemy.orm import Session
from backend.models import Material, ProcessingRate, BoughtOutItem, ActuationPackage
from backend.engine.calculation import (
    determine_size_category,
    calculate_volume,
    calculate_weight,
    generate_standard_bom,
    EngineeringValidationError
)
from backend.schemas import BOMItemInput, CostBreakdown, BOMItemResponse, BoughtOutItemSchema, ActuationPackageSchema


def _bom_item_to_dict(item: Any) -> Dict[str, Any]:
    """Support both Pydantic v2 model_dump() and v1 dict() objects while accepting plain dicts."""
    if hasattr(item, "model_dump"):
        return item.model_dump()
    if hasattr(item, "dict"):
        return item.dict()
    if isinstance(item, dict):
        return item
    raise TypeError(f"Unsupported BOM item type: {type(item).__name__}")


def calculate_full_estimate(
    db: Session,
    equipment_type: str,
    length: float,
    width_diameter: float,
    depth: float,
    body_material: str,
    flap_disc_material: str,
    actuation_type: str,
    quantity: int = 1,
    custom_bom: Optional[List[BOMItemInput]] = None,
    tax_percent: float = 0.0,
    margin_percent: float = 0.0,
    allow_fallback_pricing: bool = False
) -> Dict[str, Any]:
    """
    Executes full engineering estimate calculation:
    1. Size classification
    2. BOM resolution & weight/cost calculation
    3. Bought-out item lookup (with validation for missing configurations)
    4. Actuation package lookup
    5. Cost head summation and final price calculation
    """
    warnings: List[str] = []

    # 1. Size Classification
    size_category, gov_reason = determine_size_category(length, width_diameter)

    # 2. Material and Processing Rates lookup
    materials_db = {m.name: m for m in db.query(Material).filter(Material.is_active == True).all()}
    rates_db = {r.code: r.rate_per_kg for r in db.query(ProcessingRate).all()}

    cutting_rate = rates_db.get("cutting", 10.0)
    base_fab_rate = rates_db.get("fabrication", 96.0)
    finishing_rate = rates_db.get("finishing", 20.0)

    # 3. Determine BOM items (custom or standard starter BOM)
    raw_bom_items: List[Dict[str, Any]] = []
    if custom_bom and len(custom_bom) > 0:
        for item in custom_bom:
            raw_bom_items.append(_bom_item_to_dict(item))
    else:
        raw_bom_items = generate_standard_bom(
            equipment_type=equipment_type,
            length=length,
            width_diameter=width_diameter,
            depth=depth,
            body_material=body_material,
            flap_disc_material=flap_disc_material
        )

    # 4. Calculate individual BOM item weights and costs
    calculated_bom: List[BOMItemResponse] = []
    total_equipment_weight = 0.0
    total_raw_material_cost = 0.0
    total_cutting_cost = 0.0
    total_machining_cost = 0.0
    total_fabrication_cost = 0.0
    total_custom_bought_out_cost = 0.0
    bought_out_list: List[BoughtOutItemSchema] = []

    for idx, item in enumerate(raw_bom_items):
        shape = item.get("shape", "plate")
        mat_name = item.get("material_grade", body_material)
        is_purchased = bool(item.get("is_purchased", shape in ("purchased", "non_stock")))
        mat_obj = materials_db.get(mat_name)

        if is_purchased:
            density = 0.0
            raw_rate = 0.0
            fab_multiplier = 1.0
        elif not mat_obj:
            # Fallback safe defaults if material not in DB
            density = 0.00000785
            raw_rate = 80.0
            fab_multiplier = 1.0
            warnings.append(f"Material '{mat_name}' not found in active database. Using default rate ₹80/kg.")
        else:
            density = mat_obj.density
            raw_rate = mat_obj.raw_rate
            fab_multiplier = mat_obj.fab_multiplier

        dims = {
            "length": float(item.get("length", 0.0) or 0.0),
            "width": float(item.get("width", 0.0) or 0.0),
            "thickness": float(item.get("thickness", 0.0) or 0.0),
            "diameter": float(item.get("diameter", 0.0) or 0.0),
            "wall_thickness": float(item.get("wall_thickness", 0.0) or 0.0)
        }

        vol = 0.0 if is_purchased else calculate_volume(shape, dims)
        item_qty = max(1, int(item.get("quantity", 1) or 1))
        override_wt = item.get("unit_weight_override")
        explicit_unit_wt = item.get("unit_weight")
        if override_wt is not None:
            unit_wt = float(override_wt)
        elif explicit_unit_wt is not None and float(explicit_unit_wt or 0.0) > 0:
            unit_wt = float(explicit_unit_wt)
        elif is_purchased:
            unit_wt = 0.0
        else:
            unit_wt = calculate_weight(vol, density, 1)[0]
        total_wt = unit_wt * item_qty

        rate_source = item.get("rate_source", "material_default")
        explicit_rate = item.get("unit_material_rate")
        material_rate = float(explicit_rate if explicit_rate is not None else raw_rate)
        if explicit_rate is not None:
            rate_source = item.get("rate_source", "custom")
        item_raw_cost = 0.0 if is_purchased else total_wt * material_rate
        item_cutting_cost = 0.0 if is_purchased else total_wt * cutting_rate
        machining_rate = float(item.get("unit_machining_rate", 0.0) or 0.0)
        machining_cost_value = item.get("machining_cost")
        if machining_cost_value is not None:
            item_machining_cost = float(machining_cost_value)
        elif is_purchased:
            item_machining_cost = 0.0
        else:
            item_machining_cost = float(item_qty) * machining_rate

        unit_fab_cost = item.get("unit_fabrication_cost")
        fabrication_cost_value = item.get("fabrication_cost")
        if unit_fab_cost is not None:
            item_fab_cost = float(unit_fab_cost) * item_qty
        elif fabrication_cost_value is not None and float(fabrication_cost_value or 0.0) > 0:
            item_fab_cost = float(fabrication_cost_value)
        elif is_purchased:
            item_fab_cost = 0.0
        else:
            item_fab_cost = total_wt * base_fab_rate * fab_multiplier
        unit_purchase_rate = float(item.get("unit_purchase_rate", 0.0) or 0.0) if is_purchased else 0.0
        purchase_cost = item_qty * unit_purchase_rate
        total_custom_bought_out_cost += purchase_cost
        component_total = item_raw_cost + item_cutting_cost + item_machining_cost + item_fab_cost + purchase_cost

        total_equipment_weight += total_wt
        total_raw_material_cost += item_raw_cost
        total_cutting_cost += item_cutting_cost
        total_machining_cost += item_machining_cost
        total_fabrication_cost += item_fab_cost

        calculated_bom.append(BOMItemResponse(
            id=idx + 1,
            part_name=item.get("part_name", f"Part {idx+1}"),
            category=item.get("category", "General"),
            shape=shape,
            material_grade=mat_name,
            length=dims["length"],
            width=dims["width"],
            thickness=dims["thickness"],
            diameter=dims["diameter"],
            wall_thickness=dims["wall_thickness"],
            quantity=item_qty,
            unit_machining_rate=machining_rate,
            unit=item.get("unit", "piece"),
            unit_weight_override=item.get("unit_weight_override"),
            unit_material_rate=item.get("unit_material_rate"),
            rate_source=rate_source,
            unit_fabrication_cost=item.get("unit_fabrication_cost"),
            is_purchased=is_purchased,
            unit_purchase_rate=unit_purchase_rate,
            unit_weight=round(unit_wt, 3),
            total_weight=round(total_wt, 3),
            raw_material_cost=round(item_raw_cost, 2),
            cutting_cost=round(item_cutting_cost, 2),
            machining_cost=round(item_machining_cost, 2),
            fabrication_cost=round(item_fab_cost, 2),
            material_rate=round(material_rate, 2),
            component_total=round(component_total, 2),
            purchase_cost=round(purchase_cost, 2),
        ))
        if is_purchased:
            if unit_purchase_rate == 0 and item.get("part_name") != "Actuator":
                warnings.append(f"Bought-out component '{item.get('part_name', 'Component')}' has no configured unit price.")
            else:
                bought_out_list.append(BoughtOutItemSchema(
                    equipment_type=equipment_type,
                    size_category=size_category,
                    item_name=item.get("part_name", f"Part {idx + 1}"),
                    quantity=item_qty,
                    unit_rate=unit_purchase_rate,
                    unit=item.get("unit", "piece"),
                ))

    total_equipment_weight = round(total_equipment_weight, 3)
    total_finishing_cost = round(total_equipment_weight * finishing_rate, 2)

    # 5. Bought-Out Item Lookup
    bought_out_query = db.query(BoughtOutItem).filter(
        BoughtOutItem.equipment_type == equipment_type,
        BoughtOutItem.size_category == size_category
    ).all()

    total_bought_out_cost = total_custom_bought_out_cost

    if not bought_out_query:
        # Check specific rule requirement for Butterfly Valve Medium or other missing sets:
        msg = (
            f"No configured bought-out component table exists for {equipment_type} in {size_category} size category. "
        )
        if equipment_type == "Butterfly Valve" and size_category == "MEDIUM":
            msg += "Per engineering standards, Medium Butterfly Valves require an authorized pricing rule or explicit fallback."
        
        if allow_fallback_pricing:
            # Try falling back to SMALL if user explicitly permits fallback
            fallback_query = db.query(BoughtOutItem).filter(
                BoughtOutItem.equipment_type == equipment_type,
                BoughtOutItem.size_category == "SMALL"
            ).all()
            if fallback_query:
                warnings.append(msg + " (Provisional fallback to SMALL configuration applied).")
                for bo in fallback_query:
                    cost = bo.quantity * bo.unit_rate
                    total_bought_out_cost += cost
                    bought_out_list.append(BoughtOutItemSchema(
                        id=bo.id,
                        equipment_type=bo.equipment_type,
                        size_category=f"{size_category} (Fallback from SMALL)",
                        item_name=bo.item_name,
                        quantity=bo.quantity,
                        unit_rate=bo.unit_rate,
                        unit=bo.unit,
                        notes=bo.notes
                    ))
            else:
                warnings.append(msg + " Cost set to ₹0.00 until authorized rule is created.")
        else:
            warnings.append(msg + " Bought-out cost is flagged as unpriced.")
    else:
        for bo in bought_out_query:
            cost = bo.quantity * bo.unit_rate
            total_bought_out_cost += cost
            bought_out_list.append(BoughtOutItemSchema(
                id=bo.id,
                equipment_type=bo.equipment_type,
                size_category=bo.size_category,
                item_name=bo.item_name,
                quantity=bo.quantity,
                unit_rate=bo.unit_rate,
                unit=bo.unit,
                notes=bo.notes
            ))

    # 6. Actuation Package Lookup
    actuation_pkg_db = db.query(ActuationPackage).filter(
        ActuationPackage.equipment_type == equipment_type,
        ActuationPackage.actuation_type == actuation_type,
        ActuationPackage.size_category == size_category
    ).first()

    actuation_schema: Optional[ActuationPackageSchema] = None
    total_actuation_cost = 0.0

    if actuation_pkg_db:
        total_actuation_cost = (
            actuation_pkg_db.actuator_cost +
            actuation_pkg_db.gearbox_cost +
            actuation_pkg_db.misc_cost
        )
        actuation_schema = ActuationPackageSchema(
            id=actuation_pkg_db.id,
            equipment_type=actuation_pkg_db.equipment_type,
            actuation_type=actuation_pkg_db.actuation_type,
            size_category=actuation_pkg_db.size_category,
            actuator_cost=actuation_pkg_db.actuator_cost,
            gearbox_cost=actuation_pkg_db.gearbox_cost,
            misc_cost=actuation_pkg_db.misc_cost,
            notes=actuation_pkg_db.notes
        )
    else:
        warnings.append(
            f"No actuation package configured for {equipment_type} - {actuation_type} ({size_category}). Actuation cost set to ₹0.00."
        )

    # 7. Total Cost Breakdown
    subtotal = (
        total_raw_material_cost +
        total_cutting_cost +
        total_machining_cost +
        total_fabrication_cost +
        total_finishing_cost +
        total_bought_out_cost +
        total_actuation_cost
    )

    # Multiply by equipment quantity if > 1
    subtotal_for_qty = subtotal * float(quantity)

    # Margin and Tax
    margin_amount = (subtotal_for_qty * (margin_percent / 100.0)) if margin_percent else 0.0
    taxable_amount = subtotal_for_qty + margin_amount
    tax_amount = (taxable_amount * (tax_percent / 100.0)) if tax_percent else 0.0
    final_amount = taxable_amount + tax_amount

    pricing_snapshot = {
        "rates": rates_db,
        "materials": {m.name: {"density": m.density, "raw_rate": m.raw_rate, "fab_multiplier": m.fab_multiplier} for m in materials_db.values()},
        "component_rates": [
            {"part_name": item.part_name, "material_grade": item.material_grade,
             "unit_material_rate": item.material_rate, "rate_source": item.rate_source}
            for item in calculated_bom
        ],
        "size_category": size_category,
        "governing_reason": gov_reason
    }

    cost_breakdown = CostBreakdown(
        raw_material_cost=round(total_raw_material_cost * quantity, 2),
        cutting_cost=round(total_cutting_cost * quantity, 2),
        machining_cost=round(total_machining_cost * quantity, 2),
        fabrication_cost=round(total_fabrication_cost * quantity, 2),
        finishing_cost=round(total_finishing_cost * quantity, 2),
        bought_out_cost=round(total_bought_out_cost * quantity, 2),
        actuation_cost=round(total_actuation_cost * quantity, 2),
        subtotal=round(subtotal_for_qty, 2),
        tax_percent=tax_percent,
        tax_amount=round(tax_amount, 2),
        margin_percent=margin_percent,
        margin_amount=round(margin_amount, 2),
        final_amount=round(final_amount, 2)
    )

    return {
        "equipment_type": equipment_type,
        "size_category": size_category,
        "governing_dimension": gov_reason,
        "total_weight_kg": round(total_equipment_weight * quantity, 3),
        "bom_items": calculated_bom,
        "bought_out_items": bought_out_list,
        "actuation_package": actuation_schema,
        "cost_breakdown": cost_breakdown,
        "warnings": warnings,
        "pricing_snapshot": pricing_snapshot
    }

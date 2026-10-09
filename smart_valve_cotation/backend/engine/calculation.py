import math
from typing import Dict, List, Any, Tuple, Optional

class EngineeringValidationError(Exception):
    """Raised when dimensions or engineering parameters violate physical rules."""
    pass

def determine_size_category(length: float, width_diameter: float) -> Tuple[str, str]:
    """
    Determines size category based on the larger of length and width/diameter:
    - SMALL: max dimension <= 1500 mm
    - MEDIUM: 1500 mm < max dimension <= 3500 mm
    - LARGE: max dimension > 3500 mm
    Returns (category, governing_dimension_explanation)
    """
    max_dim = max(length, width_diameter)
    if length >= width_diameter:
        gov_str = f"Length ({length:.1f} mm >= Width {width_diameter:.1f} mm)"
    else:
        gov_str = f"Width/Diameter ({width_diameter:.1f} mm > Length {length:.1f} mm)"

    if max_dim <= 1500.0:
        return "SMALL", f"Max dimension is {max_dim:.1f} mm (≤ 1500 mm) determined by {gov_str}"
    elif max_dim <= 3500.0:
        return "MEDIUM", f"Max dimension is {max_dim:.1f} mm (> 1500 mm and ≤ 3500 mm) determined by {gov_str}"
    else:
        return "LARGE", f"Max dimension is {max_dim:.1f} mm (> 3500 mm) determined by {gov_str}"

def calculate_volume(shape: str, dims: Dict[str, float]) -> float:
    """
    Calculates component volume in mm³.
    Shapes:
    - 'plate': length * width * thickness
    - 'round_bar': π * (diameter / 2)² * length
    - 'pipe': π * (outer_radius² - inner_radius²) * length
    """
    s = shape.lower().strip()
    if s == "plate":
        length = dims.get("length", 0.0)
        width = dims.get("width", 0.0)
        thickness = dims.get("thickness", 0.0)
        if length == 0 and width == 0 and thickness == 0:
            return 0.0
        if length <= 0 or width <= 0 or thickness <= 0:
            raise EngineeringValidationError(
                f"Plate dimensions must be positive numbers. Got L={length}, W={width}, T={thickness}"
            )
        return float(length * width * thickness)

    elif s in ("round_bar", "round bar", "bar", "shaft", "pin"):
        diameter = dims.get("diameter", 0.0)
        length = dims.get("length", 0.0)
        if diameter == 0 and length == 0:
            return 0.0
        if diameter <= 0 or length <= 0:
            raise EngineeringValidationError(
                f"Round bar dimensions must be positive numbers. Got Dia={diameter}, L={length}"
            )
        radius = diameter / 2.0
        return float(math.pi * (radius ** 2) * length)

    elif s in ("pipe", "tube", "casing"):
        outer_diameter = dims.get("diameter", 0.0)
        wall_thickness = dims.get("wall_thickness", 0.0)
        length = dims.get("length", 0.0)

        if outer_diameter == 0 and wall_thickness == 0 and length == 0:
            return 0.0
        if outer_diameter <= 0 or wall_thickness <= 0 or length <= 0:
            raise EngineeringValidationError(
                f"Pipe dimensions must be positive numbers. Got OD={outer_diameter}, Wall={wall_thickness}, L={length}"
            )
        if (2.0 * wall_thickness) >= outer_diameter:
            raise EngineeringValidationError(
                f"Invalid pipe wall thickness: 2 * wall thickness ({2.0 * wall_thickness:.1f} mm) "
                f"cannot be greater than or equal to outer diameter ({outer_diameter:.1f} mm)."
            )

        outer_radius = outer_diameter / 2.0
        inner_radius = outer_radius - wall_thickness
        return float(math.pi * ((outer_radius ** 2) - (inner_radius ** 2)) * length)

    elif s in ("purchased", "non_stock", "piece"):
        return 0.0

    else:
        raise EngineeringValidationError(f"Unsupported geometry shape: '{shape}'")

def calculate_weight(volume_mm3: float, density_kg_mm3: float, quantity: int = 1) -> Tuple[float, float]:
    """
    Unit weight in kg = volume in mm³ × density in kg/mm³
    Total weight in kg = unit weight × quantity
    Returns (unit_weight_kg, total_weight_kg)
    """
    if volume_mm3 < 0:
        raise EngineeringValidationError("Volume cannot be negative")
    if density_kg_mm3 <= 0:
        raise EngineeringValidationError(f"Density must be positive. Got {density_kg_mm3}")
    if quantity <= 0:
        raise EngineeringValidationError(f"Quantity must be at least 1. Got {quantity}")

    unit_weight = volume_mm3 * density_kg_mm3
    total_weight = unit_weight * float(quantity)
    return unit_weight, total_weight

def generate_standard_bom(
    equipment_type: str,
    length: float,
    width_diameter: float,
    depth: float,
    body_material: str,
    flap_disc_material: str
) -> List[Dict[str, Any]]:
    """
    Generates the initial standard Bill of Materials according to engineering rules.
    """
    bom: List[Dict[str, Any]] = []

    if equipment_type == "Rack & Pinion Damper":
        # 1. Housing Side Plates
        bom.append({
            "part_name": "Housing Side Plates",
            "category": "Structural Housing",
            "shape": "plate",
            "material_grade": body_material,
            "length": float(length),
            "width": float(depth),
            "thickness": 8.0,
            "diameter": 0.0,
            "wall_thickness": 0.0,
            "quantity": 2,
            "unit_machining_rate": 150.0
        })
        # 2. Housing Top/Bottom Plates
        bom.append({
            "part_name": "Housing Top/Bottom Plates",
            "category": "Structural Housing",
            "shape": "plate",
            "material_grade": body_material,
            "length": float(width_diameter),
            "width": float(depth),
            "thickness": 8.0,
            "diameter": 0.0,
            "wall_thickness": 0.0,
            "quantity": 2,
            "unit_machining_rate": 120.0
        })
        # 3. Stiffeners and Body Lugs
        stiffener_len = max(200.0, min(length, width_diameter) * 0.75)
        bom.append({
            "part_name": "Stiffeners and Body Lugs",
            "category": "Reinforcement",
            "shape": "plate",
            "material_grade": body_material,
            "length": float(round(stiffener_len, 1)),
            "width": 100.0,
            "thickness": 10.0,
            "diameter": 0.0,
            "wall_thickness": 0.0,
            "quantity": 4,
            "unit_machining_rate": 60.0
        })
        # 4. Flap Plate
        flap_len = max(100.0, length - 12.0)
        flap_wid = max(100.0, width_diameter - 12.0)
        bom.append({
            "part_name": "Flap Plate",
            "category": "Internal Blade",
            "shape": "plate",
            "material_grade": flap_disc_material,
            "length": float(round(flap_len, 1)),
            "width": float(round(flap_wid, 1)),
            "thickness": 6.0,
            "diameter": 0.0,
            "wall_thickness": 0.0,
            "quantity": 1,
            "unit_machining_rate": 280.0
        })
        # 5. Main Drive Shaft
        max_dim = max(length, width_diameter)
        shaft_dia = 50.0 if max_dim <= 1500 else (70.0 if max_dim <= 3500 else 90.0)
        bom.append({
            "part_name": "Main Drive Shaft",
            "category": "Drive Train",
            "shape": "round_bar",
            "material_grade": "EN8",
            "length": float(width_diameter + 320.0),
            "width": 0.0,
            "thickness": 0.0,
            "diameter": float(shaft_dia),
            "wall_thickness": 0.0,
            "quantity": 1,
            "unit_machining_rate": 550.0
        })
        # 6. Guiding Rollers and Pins
        bom.append({
            "part_name": "Guiding Rollers and Pins",
            "category": "Kinematics",
            "shape": "round_bar",
            "material_grade": "SS 410",
            "length": 140.0,
            "width": 0.0,
            "thickness": 0.0,
            "diameter": 38.0,
            "wall_thickness": 0.0,
            "quantity": 4,
            "unit_machining_rate": 180.0
        })

    elif equipment_type == "Butterfly Valve":
        # 1. Valve Shell Casing (Pipe / Cylindrical)
        outer_d = float(width_diameter + 40.0)
        wall_t = 20.0
        bom.append({
            "part_name": "Valve Shell Casing",
            "category": "Pressure Boundary Body",
            "shape": "pipe",
            "material_grade": body_material,
            "length": float(depth),
            "width": 0.0,
            "thickness": 0.0,
            "diameter": outer_d,
            "wall_thickness": wall_t,
            "quantity": 1,
            "unit_machining_rate": 1400.0
        })
        # 2. Internal Disc Plate
        disc_dim = max(100.0, width_diameter - 10.0)
        bom.append({
            "part_name": "Internal Disc Plate",
            "category": "Flow Control Trim",
            "shape": "plate",
            "material_grade": flap_disc_material,
            "length": float(round(disc_dim, 1)),
            "width": float(round(disc_dim, 1)),
            "thickness": 16.0,
            "diameter": 0.0,
            "wall_thickness": 0.0,
            "quantity": 1,
            "unit_machining_rate": 950.0
        })
        # 3. Drive Shaft
        max_dim = max(length, width_diameter)
        shaft_dia = 50.0 if max_dim <= 1500 else (65.0 if max_dim <= 3500 else 85.0)
        bom.append({
            "part_name": "Drive Shaft",
            "category": "Shaft / Spindle",
            "shape": "round_bar",
            "material_grade": "SS 410",
            "length": float(width_diameter + 280.0),
            "width": 0.0,
            "thickness": 0.0,
            "diameter": float(shaft_dia),
            "wall_thickness": 0.0,
            "quantity": 1,
            "unit_machining_rate": 650.0
        })

    else:
        max_dim = max(length, width_diameter)
        family = equipment_type.lower()
        valve_components = {
            "gate valve": ["Body", "Bonnet", "Gate/Wedge", "Stem", "Seat Rings"],
            "globe valve": ["Body", "Bonnet", "Disc/Plug", "Stem", "Seat Rings"],
            "ball valve": ["Body", "Ball", "Stem", "Seat Rings"],
            "check valve": ["Body", "Bonnet/Cover", "Disc/Clapper", "Hinge Pin", "Seat Rings"],
            "pressure relief valve": ["Body", "Bonnet", "Disc", "Stem", "Spring"],
        }
        damper_components = {
            "single-blade damper": ["Frame/Casing", "Blade", "Shaft", "Stiffeners"],
            "multi-blade damper": ["Frame/Casing", "Blades", "Drive Shafts", "Stiffeners", "Linkages"],
            "flue gas damper": ["Frame/Casing", "Blades", "Drive Shafts", "Stiffeners", "Linkages"],
            "guillotine damper": ["Frame/Casing", "Gate/Blade", "Guide Rails", "Stiffeners", "Drive Shaft"],
            "diverter damper": ["Frame/Casing", "Diverter Blades", "Drive Shafts", "Stiffeners", "Linkages"],
        }
        component_names = valve_components.get(family) or damper_components.get(family)
        if component_names is None:
            raise EngineeringValidationError(f"Unsupported equipment type: '{equipment_type}'")

        is_valve = family in valve_components
        body_shape = "plate" if not is_valve or family in ("gate valve", "globe valve", "check valve", "pressure relief valve") else "pipe"
        body_name = component_names[0]
        body_material_default = body_material
        blade_or_trim_material = flap_disc_material

        def add_plate(name: str, material: str, part_length: float, part_width: float,
                      thickness: float, quantity: int, machining: float = 0.0) -> None:
            bom.append({
                "part_name": name, "category": "Component", "shape": "plate",
                "material_grade": material, "length": float(max(part_length, 1.0)),
                "width": float(max(part_width, 1.0)), "thickness": float(max(thickness, 1.0)),
                "diameter": 0.0, "wall_thickness": 0.0, "quantity": quantity,
                "unit_machining_rate": machining, "unit": "piece",
            })

        def add_bar(name: str, material: str, diameter: float, part_length: float,
                    quantity: int = 1, machining: float = 0.0) -> None:
            bom.append({
                "part_name": name, "category": "Drive Train", "shape": "round_bar",
                "material_grade": material, "length": float(max(part_length, 1.0)),
                "width": 0.0, "thickness": 0.0, "diameter": diameter,
                "wall_thickness": 0.0, "quantity": quantity,
                "unit_machining_rate": machining, "unit": "piece",
            })

        if body_shape == "pipe":
            bom.append({
                "part_name": body_name, "category": "Pressure Boundary Body", "shape": "pipe",
                "material_grade": body_material_default, "length": float(max(depth, 1.0)),
                "width": 0.0, "thickness": 0.0, "diameter": float(width_diameter + 40.0),
                "wall_thickness": 20.0, "quantity": 1, "unit_machining_rate": 1400.0,
                "unit": "piece",
            })
        else:
            add_plate(body_name, body_material_default, length, depth, 10.0, 2, 180.0)
            add_plate(f"{body_name} Cover Plates", body_material_default, width_diameter, depth, 8.0, 2, 120.0)

        if not is_valve:
            blade_count = 1 if "single-blade" in family or "guillotine" in family else 4
            add_plate(component_names[1], blade_or_trim_material, length * 0.92,
                      width_diameter * 0.9, 8.0, blade_count, 280.0)
            add_bar("Shafts", "SS 410", 50.0 if max_dim <= 1500 else 70.0,
                    width_diameter + 320.0, blade_count, 550.0)
            for name in component_names[3:]:
                if "stiffener" in name.lower() or "rail" in name.lower():
                    add_plate(name, body_material_default, max(length * 0.5, 200.0), 100.0, 10.0, 4)
                else:
                    add_bar(name, "EN8", 30.0, max(width_diameter * 0.25, 100.0), 2, 80.0)
        else:
            trim_names = component_names[1:-1]
            for name in trim_names:
                if "shaft" in name.lower() or "stem" in name.lower() or "pin" in name.lower():
                    add_bar(name, "SS 410", 35.0 if max_dim <= 1500 else 50.0,
                            width_diameter + 280.0, 1, 400.0)
                else:
                    add_plate(name, blade_or_trim_material, max(width_diameter * 0.8, 100.0),
                              max(width_diameter * 0.65, 100.0), 12.0, 1, 250.0)

    if equipment_type in ("Rack & Pinion Damper", "Butterfly Valve"):
        component_names = (
            ["Bearings", "Seals", "Fasteners", "Actuator"]
            if equipment_type == "Rack & Pinion Damper"
            else ["Seat/Liner", "Bearings", "Seals", "Fasteners", "Actuator"]
        )
        for part_name in component_names:
            bom.append({
                "part_name": part_name,
                "category": "Bought-out Component",
                "shape": "purchased",
                "material_grade": "Other",
                "length": 0.0,
                "width": 0.0,
                "thickness": 0.0,
                "diameter": 0.0,
                "wall_thickness": 0.0,
                "quantity": 1,
                "unit_machining_rate": 0.0,
                "unit": "piece",
                "is_purchased": True,
                "unit_purchase_rate": 0.0,
            })

    return bom

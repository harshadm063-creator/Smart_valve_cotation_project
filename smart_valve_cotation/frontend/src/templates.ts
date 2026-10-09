import type { BOMItem, MaterialItem } from './types';

export const EQUIPMENT_OPTIONS = [
  { id: 'Butterfly Valve', label: 'Butterfly Valve', category: 'Valves', description: 'Quarter-turn circular disc valve for pipelines and flow control.' },
  { id: 'Gate Valve', label: 'Gate Valve', category: 'Valves', description: 'Full flow linear isolation valve with wedge or parallel gate.' },
  { id: 'Globe Valve', label: 'Globe Valve', category: 'Valves', description: 'Linear motion valve designed for precise throttling and regulation.' },
  { id: 'Ball Valve', label: 'Ball Valve', category: 'Valves', description: 'Quarter-turn rotary valve using a spherical disc for tight shut-off.' },
  { id: 'Check Valve', label: 'Check Valve', category: 'Valves', description: 'Automatic non-return valve preventing backflow in piping systems.' },
  { id: 'Pressure Relief Valve', label: 'Pressure Relief Valve', category: 'Valves', description: 'Spring-loaded safety valve designed to relieve excess system pressure.' },
  { id: 'Single-Blade Damper', label: 'Single-Blade Damper', category: 'Dampers', description: 'Single pivoted flap damper for HVAC and clean industrial air ducts.' },
  { id: 'Multi-Blade Damper', label: 'Multi-Blade Damper', category: 'Dampers', description: 'Parallel or opposed louvre damper for balanced airflow modulation.' },
  { id: 'Flue Gas Damper', label: 'Flue Gas Damper', category: 'Dampers', description: 'Heavy-duty high-temperature isolation damper for utility flue gas.' },
  { id: 'Guillotine Damper', label: 'Guillotine Damper', category: 'Dampers', description: 'Zero-leakage sliding blade damper for dirty gas duct isolation.' },
  { id: 'Diverter Damper', label: 'Diverter Damper', category: 'Dampers', description: 'Three-way pivoting flap damper for heat recovery & gas bypass.' },
  { id: 'Rack & Pinion Damper', label: 'Rack & Pinion Damper', category: 'Dampers', description: 'Heavy-duty linear rack-driven isolation damper with metallic seats.' },
];

export const STANDARD_MATERIALS: MaterialItem[] = [
  { name: 'IS 2062', density: 0.00000785, raw_rate: 72, fab_multiplier: 1.0, unit: '₹/kg', is_configurable_estimate: true },
  { name: 'Cast Iron', density: 0.00000720, raw_rate: 55, fab_multiplier: 1.0, unit: '₹/kg', is_configurable_estimate: true },
  { name: 'Ductile Iron', density: 0.00000710, raw_rate: 75, fab_multiplier: 1.05, unit: '₹/kg', is_configurable_estimate: true },
  { name: 'SS 304 L', density: 0.00000800, raw_rate: 250, fab_multiplier: 1.35, unit: '₹/kg', is_configurable_estimate: true },
  { name: 'SS 316 L', density: 0.00000800, raw_rate: 310, fab_multiplier: 1.40, unit: '₹/kg', is_configurable_estimate: true },
  { name: 'SS 410', density: 0.00000775, raw_rate: 120, fab_multiplier: 1.20, unit: '₹/kg', is_configurable_estimate: true },
  { name: 'EN8', density: 0.00000785, raw_rate: 95, fab_multiplier: 1.10, unit: '₹/kg', is_configurable_estimate: true },
  { name: 'Galvanized Steel', density: 0.00000785, raw_rate: 90, fab_multiplier: 1.15, unit: '₹/kg', is_configurable_estimate: true },
  { name: 'Bronze', density: 0.00000880, raw_rate: 650, fab_multiplier: 1.30, unit: '₹/kg', is_configurable_estimate: true },
  { name: 'PTFE', density: 0.00000220, raw_rate: 900, fab_multiplier: 1.0, unit: '₹/kg', is_configurable_estimate: true },
  { name: 'EPDM', density: 0.00000120, raw_rate: 350, fab_multiplier: 1.0, unit: '₹/kg', is_configurable_estimate: true },
  { name: 'Graphite Packing', density: 0.00000180, raw_rate: 600, fab_multiplier: 1.0, unit: '₹/kg', is_configurable_estimate: true },
];

export function getMaterialRate(matName: string, materialsList: MaterialItem[] = STANDARD_MATERIALS): number {
  const found = materialsList.find(m => m.name.toLowerCase().replace(/\s+/g, '') === matName.toLowerCase().replace(/\s+/g, ''));
  if (found) return found.raw_rate;
  const std = STANDARD_MATERIALS.find(m => m.name.toLowerCase().replace(/\s+/g, '') === matName.toLowerCase().replace(/\s+/g, ''));
  return std ? std.raw_rate : 80;
}

export function getDefaultComponentTemplate(
  equipmentType: string,
  dimensions: { length: number; width_diameter: number; depth: number },
  materialsList: MaterialItem[] = STANDARD_MATERIALS
): BOMItem[] {
  const { length = 1200, width_diameter = 1000, depth = 400 } = dimensions;
  const maxDim = Math.max(length, width_diameter);
  const sizeFactor = Math.max(0.5, Math.min(3.5, maxDim / 1000));

  const createItem = (
    id: number,
    part_name: string,
    category: string,
    material_grade: string,
    quantity: number,
    unit: string,
    baseWeight: number,
    baseMachining: number,
    shape: string = 'plate',
    lengthOverride?: number,
    widthOverride?: number,
    thicknessOverride?: number,
    diameterOverride?: number
  ): BOMItem => {
    const unit_weight = Math.round(baseWeight * sizeFactor * 100) / 100;
    const unit_material_rate = getMaterialRate(material_grade, materialsList);
    const machining_cost = Math.round(baseMachining * sizeFactor);
    const raw_material_cost = Math.round(quantity * unit_weight * unit_material_rate * 100) / 100;
    const component_total = Math.round((raw_material_cost + machining_cost) * 100) / 100;

    const resolvedLength = Math.max(50, lengthOverride ?? Math.max(200, length * 0.65));
    const resolvedWidth = Math.max(50, widthOverride ?? Math.max(80, Math.min(depth || 400, width_diameter * 0.6)));
    const resolvedThickness = Math.max(3, thicknessOverride ?? (shape === 'pipe' ? 10 : shape === 'round_bar' ? 15 : 8));
    const resolvedDiameter = diameterOverride ?? (
      shape === 'round_bar'
        ? Math.max(20, Math.min(maxDim * 0.04, 100))
        : shape === 'pipe'
          ? Math.max(100, width_diameter + 40)
          : 0
    );
    const resolvedWallThickness = shape === 'pipe'
      ? Math.max(3, Math.min(20, resolvedDiameter * 0.1))
      : 0;

    return {
      id,
      part_name,
      category,
      material_grade,
      quantity,
      unit,
      unit_weight,
      unit_material_rate,
      machining_cost,
      raw_material_cost,
      component_total,
      rate_source: 'material_default',
      shape,
      length: Number((resolvedLength).toFixed(1)),
      width: Number((resolvedWidth).toFixed(1)),
      thickness: Number((resolvedThickness).toFixed(1)),
      diameter: Number((resolvedDiameter).toFixed(1)),
      wall_thickness: Number(resolvedWallThickness.toFixed(1)),
    };
  };

  switch (equipmentType) {
    case 'Butterfly Valve':
      return [
        createItem(1, 'Valve Body / Casing', 'Pressure Boundary Body', 'IS 2062', 1, 'piece', 32, 1400, 'pipe'),
        createItem(2, 'Valve Disc', 'Flow Control Trim', 'SS 304 L', 1, 'piece', 18, 950, 'plate'),
        createItem(3, 'Drive Shaft / Stem', 'Shaft & Spindle', 'SS 410', 1, 'piece', 12, 650, 'round_bar'),
        createItem(4, 'Resilient Seat / Liner', 'Seals & Gaskets', 'PTFE', 1, 'piece', 2.5, 350, 'plate'),
        createItem(5, 'Trunnion Bearings / Bushings', 'Kinematics & Bearings', 'Bronze', 2, 'piece', 1.2, 200, 'round_bar'),
        createItem(6, 'Stem Gland Packing & O-Rings', 'Seals & Gaskets', 'Graphite Packing', 1, 'set', 0.8, 150, 'plate'),
        createItem(7, 'Body Bolting & Fasteners', 'Fasteners & Hardware', 'IS 2062', 1, 'set', 4.5, 100, 'plate'),
        createItem(8, 'Actuator Mounting Bracket', 'Automation & Actuation', 'IS 2062', 1, 'piece', 6.0, 250, 'plate'),
      ];

    case 'Gate Valve':
      return [
        createItem(1, 'Valve Body', 'Pressure Boundary Body', 'Cast Iron', 1, 'piece', 42, 1800, 'pipe'),
        createItem(2, 'Valve Bonnet', 'Pressure Boundary Body', 'IS 2062', 1, 'piece', 24, 1100, 'plate'),
        createItem(3, 'Solid Wedge / Gate', 'Flow Control Trim', 'SS 304 L', 1, 'piece', 16, 850, 'plate'),
        createItem(4, 'Rising Stem / Spindle', 'Shaft & Spindle', 'SS 410', 1, 'piece', 9.5, 550, 'round_bar'),
        createItem(5, 'Body Seat Rings', 'Flow Control Trim', 'SS 316 L', 2, 'piece', 2.2, 300, 'plate'),
        createItem(6, 'Gland Packing & Bonnet Gasket', 'Seals & Gaskets', 'Graphite Packing', 1, 'set', 1.2, 180, 'plate'),
        createItem(7, 'High Tensile Bonnet Studs', 'Fasteners & Hardware', 'IS 2062', 1, 'set', 5.5, 120, 'plate'),
        createItem(8, 'Handwheel / Actuator Adapter', 'Automation & Actuation', 'Ductile Iron', 1, 'piece', 7.5, 300, 'plate'),
      ];

    case 'Globe Valve':
      return [
        createItem(1, 'Valve Body', 'Pressure Boundary Body', 'Cast Iron', 1, 'piece', 38, 1650, 'pipe'),
        createItem(2, 'Valve Bonnet', 'Pressure Boundary Body', 'IS 2062', 1, 'piece', 22, 950, 'plate'),
        createItem(3, 'Contoured Disc / Plug', 'Flow Control Trim', 'SS 304 L', 1, 'piece', 13, 750, 'plate'),
        createItem(4, 'Valve Stem', 'Shaft & Spindle', 'SS 410', 1, 'piece', 8.0, 480, 'round_bar'),
        createItem(5, 'Renewable Seat Ring', 'Flow Control Trim', 'SS 316 L', 1, 'piece', 3.5, 320, 'plate'),
        createItem(6, 'Gland Packing Ring Set', 'Seals & Gaskets', 'Graphite Packing', 1, 'set', 1.0, 150, 'plate'),
        createItem(7, 'Flange & Bonnet Fasteners', 'Fasteners & Hardware', 'IS 2062', 1, 'set', 4.8, 110, 'plate'),
        createItem(8, 'Yoke / Actuator Mount', 'Automation & Actuation', 'IS 2062', 1, 'piece', 5.5, 220, 'plate'),
      ];

    case 'Ball Valve':
      return [
        createItem(1, 'Three-Piece Valve Body', 'Pressure Boundary Body', 'IS 2062', 1, 'piece', 30, 1500, 'pipe'),
        createItem(2, 'Precision Mirror-Finished Ball', 'Flow Control Trim', 'SS 316 L', 1, 'piece', 14, 1200, 'round_bar'),
        createItem(3, 'Anti-Blowout Stem', 'Shaft & Spindle', 'SS 410', 1, 'piece', 6.0, 450, 'round_bar'),
        createItem(4, 'Reinforced PTFE Seat Rings', 'Seals & Gaskets', 'PTFE', 2, 'piece', 1.8, 250, 'plate'),
        createItem(5, 'Body Gaskets & Stem Seals', 'Seals & Gaskets', 'EPDM', 1, 'set', 0.6, 120, 'plate'),
        createItem(6, 'Body Tie-Bolts & Nuts', 'Fasteners & Hardware', 'IS 2062', 1, 'set', 4.2, 100, 'plate'),
        createItem(7, 'ISO 5211 Actuator Top Flange', 'Automation & Actuation', 'IS 2062', 1, 'piece', 4.0, 180, 'plate'),
      ];

    case 'Check Valve':
      return [
        createItem(1, 'Check Valve Body', 'Pressure Boundary Body', 'Ductile Iron', 1, 'piece', 34, 1400, 'pipe'),
        createItem(2, 'Inspection Cover / Bonnet', 'Pressure Boundary Body', 'IS 2062', 1, 'piece', 18, 750, 'plate'),
        createItem(3, 'Swing Disc / Clapper', 'Flow Control Trim', 'SS 304 L', 1, 'piece', 11, 600, 'plate'),
        createItem(4, 'Hinge Pin / Pivot Shaft', 'Shaft & Spindle', 'SS 410', 1, 'piece', 4.0, 300, 'round_bar'),
        createItem(5, 'Integrally Welded Seat Rings', 'Flow Control Trim', 'SS 316 L', 1, 'piece', 3.0, 280, 'plate'),
        createItem(6, 'Cover Gasket & Fasteners', 'Fasteners & Hardware', 'IS 2062', 1, 'set', 4.0, 90, 'plate'),
      ];

    case 'Pressure Relief Valve':
      return [
        createItem(1, 'Valve Body & Inlet Nozzle', 'Pressure Boundary Body', 'Ductile Iron', 1, 'piece', 28, 1350, 'pipe'),
        createItem(2, 'Bonnet & Closed Cap', 'Pressure Boundary Body', 'IS 2062', 1, 'piece', 16, 800, 'plate'),
        createItem(3, 'Valve Disc / Lapping Face', 'Flow Control Trim', 'SS 316 L', 1, 'piece', 7.0, 850, 'plate'),
        createItem(4, 'Spindle / Guide Rod', 'Shaft & Spindle', 'SS 410', 1, 'piece', 4.5, 400, 'round_bar'),
        createItem(5, 'Engineered Calibration Spring', 'Drive Train & Mechanics', 'EN8', 1, 'piece', 9.0, 650, 'round_bar'),
        createItem(6, 'Stellite / SS Seat Rings', 'Flow Control Trim', 'SS 316 L', 1, 'piece', 2.5, 250, 'plate'),
        createItem(7, 'Adjusting Screw & Fasteners', 'Fasteners & Hardware', 'IS 2062', 1, 'set', 3.5, 150, 'plate'),
      ];

    case 'Single-Blade Damper':
      return [
        createItem(1, 'Casing / Outer Duct Frame', 'Structural Housing', 'IS 2062', 1, 'piece', 48, 1200, 'plate'),
        createItem(2, 'Aerofoil Single Damper Blade', 'Internal Blade', 'SS 304 L', 1, 'piece', 24, 800, 'plate'),
        createItem(3, 'Heavy Center Drive Shaft', 'Drive Train', 'SS 410', 1, 'piece', 15, 600, 'round_bar'),
        createItem(4, 'External Frame Stiffeners', 'Reinforcement', 'IS 2062', 4, 'piece', 4.5, 150, 'plate'),
        createItem(5, 'Self-Aligning Flange Bearings', 'Kinematics', 'Bronze', 2, 'piece', 1.6, 180, 'round_bar'),
        createItem(6, 'Flexible Gland Packing Seals', 'Seals & Gaskets', 'Graphite Packing', 2, 'set', 0.7, 120, 'plate'),
        createItem(7, 'Structural Assembly Fasteners', 'Fasteners & Hardware', 'IS 2062', 1, 'set', 4.5, 90, 'plate'),
        createItem(8, 'Actuator Mounting Plate', 'Automation & Actuation', 'IS 2062', 1, 'piece', 5.5, 200, 'plate'),
      ];

    case 'Multi-Blade Damper':
      return [
        createItem(1, 'Casing / Flanged Duct Frame', 'Structural Housing', 'IS 2062', 1, 'piece', 70, 1800, 'plate'),
        createItem(2, 'Opposed Louver Damper Blades', 'Internal Blade', 'SS 304 L', 4, 'piece', 14, 500, 'plate'),
        createItem(3, 'Drive & Interconnecting Shafts', 'Drive Train', 'EN8', 4, 'piece', 9.0, 450, 'round_bar'),
        createItem(4, 'Structural Channel Stiffeners', 'Reinforcement', 'IS 2062', 6, 'piece', 4.0, 120, 'plate'),
        createItem(5, 'Synchronization Linkages & Arms', 'Kinematics', 'EN8', 4, 'piece', 3.0, 220, 'plate'),
        createItem(6, 'Heavy Sintered Bronze Bushings', 'Kinematics', 'Bronze', 8, 'piece', 0.9, 140, 'round_bar'),
        createItem(7, 'Blade Edge & Shaft Seals', 'Seals & Gaskets', 'Graphite Packing', 4, 'set', 0.6, 100, 'plate'),
        createItem(8, 'High-Grade Assembly Fasteners', 'Fasteners & Hardware', 'IS 2062', 1, 'set', 6.5, 120, 'plate'),
        createItem(9, 'Actuator Bracket & Drive Coupling', 'Automation & Actuation', 'IS 2062', 1, 'piece', 7.5, 280, 'plate'),
      ];

    case 'Flue Gas Damper':
      return [
        createItem(1, 'Heavy Thermal Duct Frame', 'Structural Housing', 'IS 2062', 1, 'piece', 95, 2400, 'plate'),
        createItem(2, 'Heavy-Duty Louver Blades', 'Internal Blade', 'SS 304 L', 4, 'piece', 19, 750, 'plate'),
        createItem(3, 'High-Torque Stub & Drive Shafts', 'Drive Train', 'SS 410', 4, 'piece', 12, 550, 'round_bar'),
        createItem(4, 'External Box Section Stiffeners', 'Reinforcement', 'IS 2062', 8, 'piece', 5.5, 160, 'plate'),
        createItem(5, 'Heavy Toggle Linkage Mechanism', 'Kinematics', 'EN8', 4, 'piece', 4.0, 260, 'plate'),
        createItem(6, 'High-Temperature Outboard Bearings', 'Kinematics', 'Bronze', 8, 'piece', 2.0, 220, 'round_bar'),
        createItem(7, 'Multi-Stage Graphite Gland Seals', 'Seals & Gaskets', 'Graphite Packing', 4, 'set', 1.4, 180, 'plate'),
        createItem(8, 'High-Temperature Alloy Fasteners', 'Fasteners & Hardware', 'IS 2062', 1, 'set', 8.5, 150, 'plate'),
        createItem(9, 'Actuator Stand & Thermal Stand-Off', 'Automation & Actuation', 'IS 2062', 1, 'piece', 13, 400, 'plate'),
      ];

    case 'Guillotine Damper':
      return [
        createItem(1, 'Heavy Fabricated Bonnet & Frame', 'Structural Housing', 'IS 2062', 1, 'piece', 115, 2800, 'plate'),
        createItem(2, 'Solid Guillotine Gate / Blade Plate', 'Internal Blade', 'SS 304 L', 1, 'piece', 58, 1600, 'plate'),
        createItem(3, 'Hardened Machined Guide Rails', 'Kinematics', 'SS 410', 2, 'piece', 18, 900, 'plate'),
        createItem(4, 'External Vertical Stiffener Beams', 'Reinforcement', 'IS 2062', 6, 'piece', 9.0, 220, 'plate'),
        createItem(5, 'Lead Screw / Drive Spindle', 'Drive Train', 'EN8', 1, 'piece', 24, 1100, 'round_bar'),
        createItem(6, 'Guide Roller & Bushing Assemblies', 'Kinematics', 'Bronze', 4, 'piece', 2.8, 280, 'round_bar'),
        createItem(7, 'Dual Purge Air Gland Packing', 'Seals & Gaskets', 'Graphite Packing', 2, 'set', 1.6, 200, 'plate'),
        createItem(8, 'Heavy Structural Fastener Package', 'Fasteners & Hardware', 'IS 2062', 1, 'set', 9.5, 140, 'plate'),
        createItem(9, 'Drive Superstructure & Actuator Base', 'Automation & Actuation', 'IS 2062', 1, 'piece', 19, 600, 'plate'),
      ];

    case 'Diverter Damper':
      return [
        createItem(1, 'Three-Way Duct Transition Casing', 'Structural Housing', 'IS 2062', 1, 'piece', 135, 3200, 'plate'),
        createItem(2, 'Reinforced Internal Diverter Flap', 'Internal Blade', 'SS 304 L', 1, 'piece', 50, 1400, 'plate'),
        createItem(3, 'Heavy Pivot Drive Shaft', 'Drive Train', 'SS 410', 1, 'piece', 28, 1200, 'round_bar'),
        createItem(4, 'Diagonal Thermal Stiffeners', 'Reinforcement', 'IS 2062', 8, 'piece', 7.0, 180, 'plate'),
        createItem(5, 'Toggle Linkage & Drive Crank Arms', 'Kinematics', 'EN8', 2, 'piece', 6.5, 450, 'plate'),
        createItem(6, 'Heavy Plummer Block Bearings', 'Kinematics', 'Bronze', 4, 'piece', 3.2, 350, 'round_bar'),
        createItem(7, 'Inconel Spring & Graphite Seals', 'Seals & Gaskets', 'Graphite Packing', 2, 'set', 2.2, 300, 'plate'),
        createItem(8, 'High-Tensile Flange Fasteners', 'Fasteners & Hardware', 'IS 2062', 1, 'set', 10.5, 160, 'plate'),
        createItem(9, 'Floor-Mounted Actuator Stand', 'Automation & Actuation', 'IS 2062', 1, 'piece', 16, 500, 'plate'),
      ];

    case 'Rack & Pinion Damper':
    default:
      return [
        createItem(1, 'Housing Side Plates', 'Structural Housing', 'IS 2062', 2, 'piece', 36, 150, 'plate'),
        createItem(2, 'Housing Top/Bottom Plates', 'Structural Housing', 'IS 2062', 2, 'piece', 30, 120, 'plate'),
        createItem(3, 'Stiffeners and Body Lugs', 'Reinforcement', 'IS 2062', 4, 'piece', 6.5, 60, 'plate'),
        createItem(4, 'Damper Flap Plate', 'Internal Blade', 'SS 304 L', 1, 'piece', 44, 280, 'plate'),
        createItem(5, 'Main Drive Shaft', 'Drive Train', 'EN8', 1, 'piece', 19, 550, 'round_bar'),
        createItem(6, 'Guiding Rollers and Pins', 'Kinematics', 'SS 410', 4, 'piece', 1.4, 180, 'round_bar'),
        createItem(7, 'Heavy Bearing Units', 'Kinematics', 'Bronze', 4, 'piece', 1.8, 140, 'round_bar'),
        createItem(8, 'Gland Packing Ring Seals', 'Seals & Gaskets', 'Graphite Packing', 2, 'set', 0.9, 100, 'plate'),
        createItem(9, 'High-Grade Fasteners Package', 'Fasteners & Hardware', 'IS 2062', 1, 'set', 5.5, 90, 'plate'),
        createItem(10, 'Actuation Mounting Platform', 'Automation & Actuation', 'IS 2062', 1, 'piece', 8.5, 220, 'plate'),
      ];
  }
}

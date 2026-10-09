export interface MaterialItem {
  id?: number;
  name: string;
  density: number;
  raw_rate: number;
  fab_multiplier: number;
  unit: string;
  is_active?: boolean;
  is_configurable_estimate?: boolean;
}

export interface MaterialRateAudit {
  id: number;
  material_name: string;
  previous_rate: number;
  new_rate: number;
  changed_at: string;
  changed_by: string;
}

export interface ProcessingRateItem {
  id?: number;
  code: string;
  name: string;
  rate_per_kg: number;
  unit: string;
}

export interface BoughtOutItem {
  id?: number;
  equipment_type: string;
  size_category: string;
  item_name: string;
  quantity: number;
  unit_rate: number;
  unit: string;
  notes?: string;
}

export interface ActuationPackage {
  id?: number;
  equipment_type: string;
  actuation_type: string;
  size_category: string;
  actuator_cost: number;
  gearbox_cost: number;
  misc_cost: number;
  notes?: string;
}

export interface BOMItem {
  id?: number;
  part_name: string;
  category?: string;
  shape?: string;
  material_grade: string;
  length?: number;
  width?: number;
  thickness?: number;
  diameter?: number;
  wall_thickness?: number;
  quantity: number;
  unit: string;
  unit_weight: number;
  unit_material_rate: number;
  unit_machining_rate?: number;
  machining_cost?: number;
  fabrication_cost?: number;
  raw_material_cost?: number;
  component_total?: number;
  rate_source?: 'material_default' | 'custom' | string;
  unit_weight_override?: number;
  unit_fabrication_cost?: number;
  is_purchased?: boolean;
  unit_purchase_rate?: number;
  purchase_cost?: number;
  cutting_cost?: number;
}

export interface CostBreakdown {
  raw_material_cost: number;
  cutting_cost: number;
  machining_cost: number;
  fabrication_cost: number;
  finishing_cost: number;
  bought_out_cost: number;
  actuation_cost: number;
  subtotal: number;
  tax_percent: number;
  tax_amount: number;
  margin_percent: number;
  margin_amount: number;
  final_amount: number;
}

export interface EquipmentConfig {
  customer_name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  project_name?: string;
  rfq_number?: string;
  delivery_location?: string;
  equipment_type: string;
  tag_number?: string;
  quantity: number;
  length: number;
  width_diameter: number;
  depth: number;
  body_material: string;
  flap_disc_material: string;
  actuation_type: string;
  remarks?: string;
  tax_percent?: number;
  margin_percent?: number;
  status?: string;
  custom_bom?: BOMItem[];
}

export interface EstimateCalculationResponse {
  equipment_type: string;
  size_category: string;
  governing_dimension: string;
  total_weight_kg: number;
  bom_items: BOMItem[];
  bought_out_items: BoughtOutItem[];
  actuation_package?: ActuationPackage;
  cost_breakdown: CostBreakdown;
  warnings: string[];
  pricing_snapshot: Record<string, any>;
}

export interface QuotationSummary {
  id: number;
  quote_number: string;
  revision: number;
  customer_name: string;
  project_name?: string;
  equipment_type: string;
  tag_number?: string;
  size_category: string;
  total_weight_kg: number;
  final_amount: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface QuotationDetail extends EquipmentConfig {
  id: number;
  quote_number: string;
  revision: number;
  size_category: string;
  governing_dimension?: string;
  total_weight_kg: number;
  cost_breakdown: CostBreakdown;
  bom_items: BOMItem[];
  status: string;
  created_at: string;
  updated_at: string;
  pricing_snapshot_json?: string;
}

export interface ExtractedField {
  field_name: string;
  label: string;
  value: any;
  unit?: string;
  confidence: number;
  status: 'verified' | 'uncertain' | 'missing' | 'unsupported';
  source_page?: number;
  source_snippet?: string;
  notes?: string;
}

export interface ExtractionResponse {
  filename: string;
  total_pages: number;
  extracted_fields: Record<string, ExtractedField>;
  additional_information: Array<{ label: string; value: string }>;
  raw_text_preview: string;
  extraction_warnings: string[];
}

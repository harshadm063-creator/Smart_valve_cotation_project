from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime

class MaterialSchema(BaseModel):
    id: Optional[int] = None
    name: str
    density: float
    raw_rate: float
    fab_multiplier: float = 1.0
    unit: str = "₹/kg"
    is_active: bool = True
    updated_at: Optional[datetime] = None

class MaterialUpdateSchema(BaseModel):
    raw_rate: Optional[float] = None
    density: Optional[float] = None
    fab_multiplier: Optional[float] = None
    is_active: Optional[bool] = None

class ProcessingRateSchema(BaseModel):
    id: Optional[int] = None
    code: str
    name: str
    rate_per_kg: float
    unit: str = "₹/kg"
    updated_at: Optional[datetime] = None

class ProcessingRateUpdateSchema(BaseModel):
    rate_per_kg: float

class BoughtOutItemSchema(BaseModel):
    id: Optional[int] = None
    equipment_type: str
    size_category: str
    item_name: str
    quantity: int
    unit_rate: float
    unit: str = "piece"
    notes: Optional[str] = None

class ActuationPackageSchema(BaseModel):
    id: Optional[int] = None
    equipment_type: str
    actuation_type: str
    size_category: str
    actuator_cost: float
    gearbox_cost: float
    misc_cost: float
    notes: Optional[str] = None

class BOMItemInput(BaseModel):
    id: Optional[int] = None
    part_name: str
    category: str = "Component"
    shape: str  # "plate", "round_bar", "pipe"
    material_grade: str
    length: float = 0.0
    width: float = 0.0
    thickness: float = 0.0
    diameter: float = 0.0
    wall_thickness: float = 0.0
    quantity: int = 1
    unit_machining_rate: float = 0.0

class BOMItemResponse(BOMItemInput):
    unit_weight: float
    total_weight: float
    raw_material_cost: float
    cutting_cost: float
    machining_cost: float

class EquipmentConfigInput(BaseModel):
    # Customer Details
    customer_name: str
    contact_person: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    project_name: Optional[str] = ""
    rfq_number: Optional[str] = ""
    delivery_location: Optional[str] = ""

    # Equipment Configuration
    equipment_type: str = Field(..., description="Rack & Pinion Damper or Butterfly Valve")
    tag_number: Optional[str] = ""
    quantity: int = Field(1, ge=1)
    length: float = Field(..., ge=100, le=15000)
    width_diameter: float = Field(..., ge=100, le=15000)
    depth: float = Field(..., ge=50, le=5000)
    body_material: str
    flap_disc_material: str
    actuation_type: str = Field(..., description="Electrical, Pneumatic, or Manual")
    remarks: Optional[str] = ""

    # Optional overrides / custom BOM
    custom_bom: Optional[List[BOMItemInput]] = None
    tax_percent: Optional[float] = 0.0
    margin_percent: Optional[float] = 0.0
    status: Optional[str] = "Draft"

class CostBreakdown(BaseModel):
    raw_material_cost: float
    cutting_cost: float
    machining_cost: float
    fabrication_cost: float
    finishing_cost: float
    bought_out_cost: float
    actuation_cost: float
    subtotal: float
    tax_percent: float = 0.0
    tax_amount: float = 0.0
    margin_percent: float = 0.0
    margin_amount: float = 0.0
    final_amount: float

class EstimateCalculationResponse(BaseModel):
    equipment_type: str
    size_category: str
    governing_dimension: str
    total_weight_kg: float
    bom_items: List[BOMItemResponse]
    bought_out_items: List[BoughtOutItemSchema]
    actuation_package: Optional[ActuationPackageSchema] = None
    cost_breakdown: CostBreakdown
    warnings: List[str] = []
    pricing_snapshot: Dict[str, Any]

class QuotationSummary(BaseModel):
    id: int
    quote_number: str
    revision: int
    customer_name: str
    project_name: Optional[str]
    equipment_type: str
    tag_number: Optional[str]
    size_category: str
    total_weight_kg: float
    final_amount: float
    status: str
    created_at: datetime
    updated_at: datetime

class QuotationDetailResponse(BaseModel):
    id: int
    quote_number: str
    revision: int
    customer_name: str
    contact_person: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    project_name: Optional[str]
    rfq_number: Optional[str]
    delivery_location: Optional[str]
    
    equipment_type: str
    tag_number: Optional[str]
    quantity: int
    length: float
    width_diameter: float
    depth: float
    body_material: str
    flap_disc_material: str
    actuation_type: str
    
    size_category: str
    governing_dimension: Optional[str]
    total_weight_kg: float
    
    cost_breakdown: CostBreakdown
    bom_items: List[BOMItemResponse]
    status: str
    remarks: Optional[str]
    pricing_snapshot_json: Optional[str]
    created_at: datetime
    updated_at: datetime

class ExtractedField(BaseModel):
    field_name: str
    label: str
    value: Any
    unit: Optional[str] = None
    confidence: float
    status: str  # "verified", "uncertain", "missing", "unsupported"
    source_page: Optional[int] = None
    source_snippet: Optional[str] = None
    notes: Optional[str] = None

class ExtractionResponse(BaseModel):
    filename: str
    total_pages: int
    extracted_fields: Dict[str, ExtractedField]
    additional_information: List[Dict[str, Any]]
    raw_text_preview: str
    extraction_warnings: List[str]

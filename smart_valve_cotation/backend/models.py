from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey
)
from sqlalchemy.orm import relationship
from backend.database import Base

class Material(Base):
    __tablename__ = "materials"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    density = Column(Float, nullable=False)  # kg/mm³
    raw_rate = Column(Float, nullable=False)  # ₹/kg
    fab_multiplier = Column(Float, default=1.0, nullable=False)
    unit = Column(String, default="₹/kg")
    is_active = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class MaterialRateAudit(Base):
    __tablename__ = "material_rate_audits"

    id = Column(Integer, primary_key=True, index=True)
    material_name = Column(String, nullable=False, index=True)
    previous_rate = Column(Float, nullable=False)
    new_rate = Column(Float, nullable=False)
    changed_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    changed_by = Column(String, default="Administrator", nullable=False)

class ProcessingRate(Base):
    __tablename__ = "processing_rates"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    rate_per_kg = Column(Float, nullable=False)  # ₹/kg
    unit = Column(String, default="₹/kg")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class BoughtOutItem(Base):
    __tablename__ = "bought_out_items"

    id = Column(Integer, primary_key=True, index=True)
    equipment_type = Column(String, index=True, nullable=False)  # "Rack & Pinion Damper", "Butterfly Valve"
    size_category = Column(String, index=True, nullable=False)   # "SMALL", "MEDIUM", "LARGE"
    item_name = Column(String, nullable=False)
    quantity = Column(Integer, default=1, nullable=False)
    unit_rate = Column(Float, nullable=False)  # ₹
    unit = Column(String, default="piece")
    notes = Column(String, nullable=True)

class ActuationPackage(Base):
    __tablename__ = "actuation_packages"

    id = Column(Integer, primary_key=True, index=True)
    equipment_type = Column(String, index=True, nullable=False)
    actuation_type = Column(String, index=True, nullable=False)  # "Electrical", "Pneumatic", "Manual"
    size_category = Column(String, index=True, nullable=False)   # "SMALL", "MEDIUM", "LARGE"
    actuator_cost = Column(Float, default=0.0, nullable=False)
    gearbox_cost = Column(Float, default=0.0, nullable=False)
    misc_cost = Column(Float, default=0.0, nullable=False)
    notes = Column(String, nullable=True)

class Quotation(Base):
    __tablename__ = "quotations"

    id = Column(Integer, primary_key=True, index=True)
    quote_number = Column(String, unique=True, index=True, nullable=False)
    revision = Column(Integer, default=0, nullable=False)
    customer_name = Column(String, nullable=False)
    contact_person = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    project_name = Column(String, nullable=True)
    rfq_number = Column(String, nullable=True)
    delivery_location = Column(String, nullable=True)
    
    # Equipment parameters
    equipment_type = Column(String, nullable=False)
    tag_number = Column(String, nullable=True)
    quantity = Column(Integer, default=1, nullable=False)
    length = Column(Float, nullable=False)
    width_diameter = Column(Float, nullable=False)
    depth = Column(Float, nullable=False)
    body_material = Column(String, nullable=False)
    flap_disc_material = Column(String, nullable=False)
    actuation_type = Column(String, nullable=False)
    
    # Engineering calculated classifications
    size_category = Column(String, nullable=False)  # SMALL, MEDIUM, LARGE
    governing_dimension = Column(String, nullable=True)
    total_weight_kg = Column(Float, default=0.0, nullable=False)
    
    # Cost Heads
    raw_material_cost = Column(Float, default=0.0, nullable=False)
    cutting_cost = Column(Float, default=0.0, nullable=False)
    machining_cost = Column(Float, default=0.0, nullable=False)
    fabrication_cost = Column(Float, default=0.0, nullable=False)
    finishing_cost = Column(Float, default=0.0, nullable=False)
    bought_out_cost = Column(Float, default=0.0, nullable=False)
    actuation_cost = Column(Float, default=0.0, nullable=False)
    
    subtotal = Column(Float, default=0.0, nullable=False)
    tax_percent = Column(Float, default=0.0, nullable=False)
    tax_amount = Column(Float, default=0.0, nullable=False)
    margin_percent = Column(Float, default=0.0, nullable=False)
    margin_amount = Column(Float, default=0.0, nullable=False)
    final_amount = Column(Float, default=0.0, nullable=False)
    
    status = Column(String, default="Draft")  # "Draft", "Validated", "Provisional", "Issued"
    remarks = Column(Text, nullable=True)
    pricing_snapshot_json = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    bom_items = relationship("QuotationBOMItem", back_populates="quotation", cascade="all, delete-orphan")

class QuotationBOMItem(Base):
    __tablename__ = "quotation_bom_items"

    id = Column(Integer, primary_key=True, index=True)
    quotation_id = Column(Integer, ForeignKey("quotations.id"), nullable=False)
    part_name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    shape = Column(String, nullable=False)  # plate, round_bar, pipe
    material_grade = Column(String, nullable=False)
    
    # Dimensions
    length = Column(Float, default=0.0)
    width = Column(Float, default=0.0)
    thickness = Column(Float, default=0.0)
    diameter = Column(Float, default=0.0)
    wall_thickness = Column(Float, default=0.0)
    
    quantity = Column(Integer, default=1, nullable=False)
    unit_weight = Column(Float, default=0.0, nullable=False)
    total_weight = Column(Float, default=0.0, nullable=False)
    
    raw_material_cost = Column(Float, default=0.0, nullable=False)
    cutting_cost = Column(Float, default=0.0, nullable=False)
    machining_cost = Column(Float, default=0.0, nullable=False)
    unit_machining_rate = Column(Float, default=0.0, nullable=False)
    unit = Column(String, default="piece", nullable=False)
    unit_weight_override = Column(Float, nullable=True)
    unit_material_rate = Column(Float, nullable=True)
    rate_source = Column(String, default="material_default", nullable=False)
    unit_fabrication_cost = Column(Float, nullable=True)
    material_rate = Column(Float, default=0.0, nullable=False)
    fabrication_cost = Column(Float, default=0.0, nullable=False)
    component_total = Column(Float, default=0.0, nullable=False)
    is_purchased = Column(Boolean, default=False, nullable=False)
    unit_purchase_rate = Column(Float, default=0.0, nullable=False)
    purchase_cost = Column(Float, default=0.0, nullable=False)

    quotation = relationship("Quotation", back_populates="bom_items")

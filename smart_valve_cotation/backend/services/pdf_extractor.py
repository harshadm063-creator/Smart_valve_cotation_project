import re
import io
from typing import Dict, Any, List, Optional
from pypdf import PdfReader
from backend.schemas import ExtractedField, ExtractionResponse

def extract_pdf_specifications(file_bytes: bytes, filename: str) -> ExtractionResponse:
    """
    Extracts technical specifications from an uploaded customer PDF using PyPDF.
    Analyzes text across all pages, extracting equipment type, dimensions,
    materials, actuation, quantity, tags, and pressure/temp ratings.
    Classifies each field with status ('verified', 'uncertain', 'missing'),
    confidence level, and traceability snippet.
    """
    warnings: List[str] = []
    additional_info: List[Dict[str, Any]] = []

    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        total_pages = len(reader.pages)
    except Exception as e:
        return ExtractionResponse(
            filename=filename,
            total_pages=0,
            extracted_fields={},
            additional_information=[],
            raw_text_preview="",
            extraction_warnings=[f"Failed to parse PDF document: {str(e)}"]
        )

    all_page_texts: List[str] = []
    for idx, page in enumerate(reader.pages):
        try:
            txt = page.extract_text() or ""
            all_page_texts.append(txt)
        except Exception:
            all_page_texts.append("")

    full_text = "\n".join(all_page_texts)

    if not full_text.strip():
        warnings.append(
            "The uploaded document contains no readable digital text. It may be a scanned drawing or raster image. "
            "Please verify all specifications manually."
        )

    # Dictionary to hold field results
    fields: Dict[str, ExtractedField] = {}

    def search_field(
        field_name: str,
        label: str,
        patterns: List[str],
        default_unit: Optional[str] = None,
        validator_func=None
    ) -> ExtractedField:
        best_val = None
        best_page = None
        best_snippet = None
        best_confidence = 0.0

        for p_idx, p_text in enumerate(all_page_texts):
            for pat in patterns:
                match = re.search(pat, p_text, re.IGNORECASE)
                if match:
                    val = match.group(1).strip()
                    if validator_func:
                        is_valid, parsed_val = validator_func(val)
                        if is_valid:
                            best_val = parsed_val
                            best_page = p_idx + 1
                            best_snippet = match.group(0).strip()
                            best_confidence = 0.90
                            break
                    else:
                        best_val = val
                        best_page = p_idx + 1
                        best_snippet = match.group(0).strip()
                        best_confidence = 0.85
                        break
            if best_val:
                break

        if best_val is not None:
            # Check if verified vs uncertain
            status = "verified" if best_confidence >= 0.85 else "uncertain"
            return ExtractedField(
                field_name=field_name,
                label=label,
                value=best_val,
                unit=default_unit,
                confidence=best_confidence,
                status=status,
                source_page=best_page,
                source_snippet=best_snippet
            )
        else:
            return ExtractedField(
                field_name=field_name,
                label=label,
                value=None,
                unit=default_unit,
                confidence=0.0,
                status="missing",
                notes="Not detected in uploaded document"
            )

    # 1. Equipment Type
    eq_type_patterns = [
        r"(?:equipment\s*type|equipment|valve|damper)\s*(?:[:=\-]?|\n+)\s*(rack\s*(?:&|and)\s*pinion\s*damper|butterfly\s*valve)",
        r"\b(rack\s*(?:&|and)\s*pinion\s*damper)\b",
        r"\b(butterfly\s*valve)\b",
    ]
    eq_field = search_field("equipment_type", "Equipment Type", eq_type_patterns)
    if eq_field.value:
        raw_val = str(eq_field.value).lower()
        if "butterfly" in raw_val:
            eq_field.value = "Butterfly Valve"
        elif "rack" in raw_val or "pinion" in raw_val:
            eq_field.value = "Rack & Pinion Damper"
    fields["equipment_type"] = eq_field

    # 2. Dimensions
    def parse_float(val_str):
        try:
            cleaned = re.sub(r"[^\d.]", "", val_str)
            v = float(cleaned)
            return (True, v) if v > 0 else (False, None)
        except Exception:
            return (False, None)

    # Length
    len_field = search_field(
        "length", "Length",
        [
            r"(?:duct\s*length\s*(?:\(l\))?|length\s*(?:\(l\))?|length|len)\s*(?:[:=\-]?|\n+)\s*(\d+(?:\.\d+)?)\s*(?:mm)?",
            r"(?:size|dimensions|dim)\s*[:=\-]?\s*(\d+(?:\.\d+)?)\s*[xX*]",
        ],
        default_unit="mm",
        validator_func=parse_float
    )
    fields["length"] = len_field

    # Width / Diameter
    wd_field = search_field(
        "width_diameter", "Width / Diameter",
        [
            r"(?:duct\s*width\s*(?:\/\s*diameter)?\s*(?:\(w\))?|width\s*(?:\/\s*diameter)?\s*(?:\(w\))?|width|diameter|dia|bore|size|DN)\s*(?:[:=\-]?|\n+)\s*(\d+(?:\.\d+)?)\s*(?:mm)?",
            r"[xX*]\s*(\d+(?:\.\d+)?)\s*(?:mm)?\s*[xX*]",
            r"[xX*]\s*(\d{3,4}(?:\.\d+)?)\s*(?:mm)?\b"
        ],
        default_unit="mm",
        validator_func=parse_float
    )
    fields["width_diameter"] = wd_field

    # Depth
    dp_field = search_field(
        "depth", "Depth / Face-to-Face",
        [
            r"(?:casing\s*depth\s*(?:\(d\))?|depth\s*(?:\(d\))?|face\s*to\s*face|f-f|thickness|height|body\s*depth|depth)\s*(?:[:=\-]?|\n+)\s*(\d+(?:\.\d+)?)\s*(?:mm)?",
            r"[xX*]\s*(\d+(?:\.\d+)?)\s*(?:mm)?\s*(?:depth|deep)"
        ],
        default_unit="mm",
        validator_func=parse_float
    )
    fields["depth"] = dp_field

    # 3. Materials
    mat_list = ["IS 2062", "SS 304 L", "SS 304", "SS 316 L", "SS 316", "SS 410", "EN8"]
    
    # Body Material
    body_mat_field = search_field(
        "body_material", "Body Material",
        [
            r"(?:body\s*(?:\/\s*housing)?\s*material|casing\s*material|housing\s*material|shell\s*material|m\.?o\.?c\.?)\s*(?:[:=\-]?|\n+)\s*([a-zA-Z0-9\s\-]+?)(?=\n|,|;|\.|$)",
            r"\b(IS\s*2062|SS\s*304\s*L|SS\s*304|SS\s*316\s*L|SS\s*316|SS\s*410|EN8)\b"
        ]
    )
    if body_mat_field.value:
        raw_b = str(body_mat_field.value).upper().replace(" ", "")
        for m in mat_list:
            if m.replace(" ", "").upper() in raw_b:
                body_mat_field.value = m
                break
    fields["body_material"] = body_mat_field

    # Flap / Disc Material
    flap_mat_field = search_field(
        "flap_disc_material", "Flap / Disc Material",
        [
            r"(?:flap\s*(?:\/\s*blade)?\s*material|disc\s*(?:\/\s*blade)?\s*material|blade\s*material|trim\s*material|disc\s*moc|flap\s*moc)\s*(?:[:=\-]?|\n+)\s*([a-zA-Z0-9\s\-]+?)(?=\n|,|;|\.|$)",
        ]
    )
    if flap_mat_field.value:
        raw_f = str(flap_mat_field.value).upper().replace(" ", "")
        for m in mat_list:
            if m.replace(" ", "").upper() in raw_f:
                flap_mat_field.value = m
                break
    fields["flap_disc_material"] = flap_mat_field

    # 4. Actuation
    act_field = search_field(
        "actuation_type", "Actuation Type",
        [
            r"(?:actuation\s*(?:type)?|operator|actuator)\s*(?:[:=\-]?|\n+)\s*([a-zA-Z0-9\s\-]+?)(?=\n|,|;|\.|$)",
            r"\b(electrical|pneumatic|manual\s*(?:lever|gear)?)\b"
        ]
    )
    if act_field.value:
        raw_a = str(act_field.value).lower()
        if "pneumatic" in raw_a:
            act_field.value = "Pneumatic"
        elif "electric" in raw_a or "motor" in raw_a:
            act_field.value = "Electrical"
        elif "manual" in raw_a or "hand" in raw_a or "lever" in raw_a or "gear" in raw_a:
            act_field.value = "Manual"
    fields["actuation_type"] = act_field

    # 5. Quantity
    def parse_int(val_str):
        try:
            cleaned = re.sub(r"[^\d]", "", val_str)
            v = int(cleaned)
            return (True, v) if v > 0 else (False, None)
        except Exception:
            return (False, None)

    qty_field = search_field(
        "quantity", "Quantity",
        [
            r"(?:quantity|qty|total\s*units)\s*(?:[:=\-]?|\n+)\s*(\d+)\s*(?:nos|no|pcs|units)?",
            r"(\d+)\s*(?:nos|no|pcs|units)\b"
        ],
        default_unit="nos",
        validator_func=parse_int
    )
    fields["quantity"] = qty_field

    # 6. Tag Number
    tag_field = search_field(
        "tag_number", "Equipment Tag No.",
        [
            r"(?:equipment\s*tag\s*no\.?|equipment\s*tag|item\s*tag|tag\s*no\.?)\s*(?:[:=\-]?|\n+)\s*([A-Za-z0-9][A-Za-z0-9\-/_]+)",
            r"\bTAG\s*[:=\-]?\s*([A-Za-z0-9\-/_]+)"
        ]
    )
    if tag_field.value and str(tag_field.value).lower() in ("no", "na", "none"):
        tag_field.value = None
        tag_field.status = "missing"
    fields["tag_number"] = tag_field

    # 7. Customer & Project Reference
    cust_field = search_field(
        "customer_name", "Customer Name",
        [
            r"(?:client\s*(?:\/\s*buyer)?|customer|buyer|company)\s*(?:[:=\-]?|\n+)\s*([A-Za-z0-9\s\.,&()]+?)(?=\n|,|;|$)"
        ]
    )
    fields["customer_name"] = cust_field

    rfq_field = search_field(
        "rfq_number", "RFQ / Reference No.",
        [
            r"(?:rfq\s*(?:\/\s*inquiry)?\s*no\.?|inquiry\s*no\.?|enquiry\s*no\.?|ref\s*no\.?)\s*(?:[:=\-]?|\n+)\s*([A-Za-z0-9\-/_]+)",
            r"\b(RFQ-[A-Za-z0-9\-/_]+)\b"
        ]
    )
    fields["rfq_number"] = rfq_field

    # Look for additional engineering details (Pressure rating, Temperature, Medium/Fluid, Leakage Class)
    pressure_match = re.search(r"(?:design\s*pressure|operating\s*pressure|pressure\s*rating|rating)\s*[:=\-]?\s*([^\n;]+)", full_text, re.IGNORECASE)
    if pressure_match:
        additional_info.append({"label": "Pressure Rating", "value": pressure_match.group(1).strip()})

    temp_match = re.search(r"(?:design\s*temp(?:erature)?|operating\s*temp(?:erature)?)\s*[:=\-]?\s*([^\n;]+)", full_text, re.IGNORECASE)
    if temp_match:
        additional_info.append({"label": "Temperature Rating", "value": temp_match.group(1).strip()})

    medium_match = re.search(r"(?:service\s*fluid|medium|fluid|process\s*gas)\s*[:=\-]?\s*([^\n;]+)", full_text, re.IGNORECASE)
    if medium_match:
        additional_info.append({"label": "Service Fluid / Medium", "value": medium_match.group(1).strip()})

    leak_match = re.search(r"(?:leakage\s*class|seat\s*leakage)\s*[:=\-]?\s*([^\n;]+)", full_text, re.IGNORECASE)
    if leak_match:
        additional_info.append({"label": "Leakage Class", "value": leak_match.group(1).strip()})

    raw_preview = full_text[:1200] + ("..." if len(full_text) > 1200 else "")

    return ExtractionResponse(
        filename=filename,
        total_pages=total_pages,
        extracted_fields=fields,
        additional_information=additional_info,
        raw_text_preview=raw_preview,
        extraction_warnings=warnings
    )

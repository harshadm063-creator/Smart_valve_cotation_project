import io
from datetime import datetime
from typing import Dict, Any, List
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.pdfgen import canvas

def format_inr(amount: float) -> str:
    """Format floating point amount into standard Indian currency representation."""
    try:
        s, *d = f"{amount:.2f}".split(".")
        d = "." + d[0] if d else ""
        r = s[-3:]
        s = s[:-3]
        groups = []
        while s:
            groups.append(s[-2:])
            s = s[:-2]
        if groups:
            return "₹" + ",".join(reversed(groups)) + "," + r + d
        return "₹" + r + d
    except Exception:
        return f"₹{amount:,.2f}"

class NumberedCanvas(canvas.Canvas):
    """Custom canvas that adds page numbers 'Page X of Y' and confidential footer."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_number(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_page_number(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        
        # Draw bottom line
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(40, 36, 555, 36)

        # Footer text
        quote_ref = getattr(self, "quote_ref", "SMART-VALVE-QUOTATION")
        self.drawString(40, 24, f"Ref: {quote_ref} | Confidential Commercial Document | Smart Valve & Damper Estimation")
        self.drawRightString(555, 24, f"Page {self._pageNumber} of {page_count}")
        self.restoreState()

def generate_quotation_pdf(quote_data: Dict[str, Any]) -> bytes:
    """
    Generates a high-quality multi-page Technical & Commercial Quotation PDF
    using ReportLab Flowables and NumberedCanvas.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=46
    )

    styles = getSampleStyleSheet()

    # Palette
    c_primary = colors.HexColor("#0F172A")    # Deep Navy
    c_secondary = colors.HexColor("#334155")  # Slate 700
    c_accent = colors.HexColor("#D97706")     # Amber 600
    c_bg_light = colors.HexColor("#F8FAFC")   # Light table header
    c_border = colors.HexColor("#E2E8F0")     # Light border

    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=c_primary
    )
    subtitle_style = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=c_accent
    )
    h2_style = ParagraphStyle(
        "SectionHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=c_primary,
        spaceBefore=10,
        spaceAfter=4
    )
    body_style = ParagraphStyle(
        "BodyDark",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=c_secondary
    )
    body_bold = ParagraphStyle(
        "BodyBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=c_primary
    )
    table_cell = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#1E293B")
    )
    table_cell_bold = ParagraphStyle(
        "TableCellBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=9.5,
        textColor=c_primary
    )

    story = []

    # 1. Header Banner
    header_data = [
        [
            Paragraph("<b>INDUSTRIAL FLOW & DAMPER TECHNOLOGIES</b><br/><font size=7 color='#64748B'>Engineering Solutions & Flow Control Systems<br/>Regd Off: Industrial Area Phase II, Chennai, India<br/>Email: sales@smartvalve-damper.com | Web: www.smartvalves.com</font>", body_style),
            Paragraph(f"<b><font size=13 color='#0F172A'>TECH & COMMERCIAL QUOTATION</font></b><br/>"
                      f"<b>Quote No:</b> {quote_data.get('quote_number', 'N/A')}<br/>"
                      f"<b>Rev:</b> R{quote_data.get('revision', 0)} | <b>Date:</b> {quote_data.get('created_date', datetime.utcnow().strftime('%d-%b-%Y'))}<br/>"
                      f"<b>Status:</b> <font color='#D97706'><b>{quote_data.get('status', 'Validated')}</b></font>", body_style)
        ]
    ]
    header_table = Table(header_data, colWidths=[310, 215])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", thickness=1.5, color=c_accent, spaceBefore=4, spaceAfter=8))

    # 2. Customer and Equipment Reference Grid
    cust_data = [
        [
            Paragraph("<b>CLIENT & PROJECT DETAILS</b>", h2_style),
            Paragraph("<b>EQUIPMENT SPECIFICATION SUMMARY</b>", h2_style)
        ],
        [
            Paragraph(f"<b>Client Name:</b> {quote_data.get('customer_name', 'N/A')}<br/>"
                      f"<b>Contact Person:</b> {quote_data.get('contact_person') or 'Commercial Department'}<br/>"
                      f"<b>Email / Phone:</b> {quote_data.get('email') or quote_data.get('phone') or 'Not specified'}<br/>"
                      f"<b>Project:</b> {quote_data.get('project_name') or 'Industrial Damper Package'}<br/>"
                      f"<b>Customer RFQ No:</b> {quote_data.get('rfq_number') or 'RFQ-DIRECT'}<br/>"
                      f"<b>Delivery Site:</b> {quote_data.get('delivery_location') or 'Ex-Works / Customer Site'}", body_style),
            Paragraph(f"<b>Equipment Type:</b> <b>{quote_data.get('equipment_type', 'N/A')}</b><br/>"
                      f"<b>Tag Number:</b> {quote_data.get('tag_number') or 'TAG-01'}<br/>"
                      f"<b>Quantity:</b> <b>{quote_data.get('quantity', 1)} Nos</b><br/>"
                      f"<b>Dimensions (L × W × D):</b> {quote_data.get('length', 0)} × {quote_data.get('width_diameter', 0)} × {quote_data.get('depth', 0)} mm<br/>"
                      f"<b>Body Material:</b> {quote_data.get('body_material', 'IS 2062')} | <b>Flap:</b> {quote_data.get('flap_disc_material', 'SS 304 L')}<br/>"
                      f"<b>Actuation:</b> {quote_data.get('actuation_type', 'Pneumatic')} | <b>Size:</b> {quote_data.get('size_category', 'SMALL')}<br/>"
                      f"<b>Calculated Weight:</b> <b>{quote_data.get('total_weight_kg', 0):.2f} kg</b>", body_style)
        ]
    ]
    cust_table = Table(cust_data, colWidths=[262, 263])
    cust_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BACKGROUND', (0, 1), (0, 1), colors.HexColor("#F8FAFC")),
        ('BACKGROUND', (1, 1), (1, 1), colors.HexColor("#F8FAFC")),
        ('BOX', (0, 1), (0, 1), 0.5, c_border),
        ('BOX', (1, 1), (1, 1), 0.5, c_border),
        ('TOPPADDING', (0, 1), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
        ('LEFTPADDING', (0, 1), (-1, -1), 8),
        ('RIGHTPADDING', (0, 1), (-1, -1), 8),
    ]))
    story.append(cust_table)
    story.append(Spacer(1, 10))

    # 3. Bill of Materials (BOM) Table
    story.append(Paragraph("<b>VERIFIED BILL OF MATERIALS (BOM) & COMPONENT WEIGHTS</b>", h2_style))
    
    bom_rows = [
        [
            Paragraph("<b>#</b>", table_cell_bold),
            Paragraph("<b>Part Description</b>", table_cell_bold),
            Paragraph("<b>Category</b>", table_cell_bold),
            Paragraph("<b>Shape</b>", table_cell_bold),
            Paragraph("<b>Grade</b>", table_cell_bold),
            Paragraph("<b>Qty</b>", table_cell_bold),
            Paragraph("<b>Unit Wt (kg)</b>", table_cell_bold),
            Paragraph("<b>Tot Wt (kg)</b>", table_cell_bold),
            Paragraph("<b>Material Cost</b>", table_cell_bold),
            Paragraph("<b>Cutting Cost</b>", table_cell_bold),
            Paragraph("<b>Machining</b>", table_cell_bold)
        ]
    ]

    for idx, item in enumerate(quote_data.get("bom_items", [])):
        b_raw = format_inr(item.get("raw_material_cost", 0))
        b_cut = format_inr(item.get("cutting_cost", 0))
        b_mac = format_inr(item.get("machining_cost", 0))
        bom_rows.append([
            Paragraph(str(idx + 1), table_cell),
            Paragraph(str(item.get("part_name", "")), table_cell_bold),
            Paragraph(str(item.get("category", "")), table_cell),
            Paragraph(str(item.get("shape", "")).capitalize(), table_cell),
            Paragraph(str(item.get("material_grade", "")), table_cell),
            Paragraph(str(item.get("quantity", 1)), table_cell),
            Paragraph(f"{float(item.get('unit_weight', 0)):.2f}", table_cell),
            Paragraph(f"{float(item.get('total_weight', 0)):.2f}", table_cell_bold),
            Paragraph(b_raw, table_cell),
            Paragraph(b_cut, table_cell),
            Paragraph(b_mac, table_cell)
        ])

    bom_table = Table(
        bom_rows,
        colWidths=[20, 105, 55, 42, 45, 22, 44, 45, 50, 48, 49],
        repeatRows=1
    )
    bom_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#0F172A")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
    ]))
    story.append(bom_table)
    story.append(Spacer(1, 10))

    # 4. Commercial Cost Breakdown and Summary
    story.append(Paragraph("<b>COMMERCIAL ESTIMATE & COST HEAD BREAKDOWN</b>", h2_style))

    cb = quote_data.get("cost_breakdown", {})
    cost_rows = [
        [Paragraph("<b>Cost Head Description</b>", table_cell_bold), Paragraph("<b>Basis / Engineering Metric</b>", table_cell_bold), Paragraph("<b>Amount (INR)</b>", table_cell_bold)],
        [Paragraph("1. Raw Material Cost", table_cell), Paragraph("Calculated weight × Verified material rate", table_cell), Paragraph(f"<b>{format_inr(cb.get('raw_material_cost', 0))}</b>", table_cell)],
        [Paragraph("2. Profile / Laser Cutting Cost", table_cell), Paragraph("Laser profile processing @ ₹10.00/kg", table_cell), Paragraph(f"<b>{format_inr(cb.get('cutting_cost', 0))}</b>", table_cell)],
        [Paragraph("3. Precision Machining Charges", table_cell), Paragraph("Shaft turning, drilling & face machining", table_cell), Paragraph(f"<b>{format_inr(cb.get('machining_cost', 0))}</b>", table_cell)],
        [Paragraph("4. Fabrication & Welding Charges", table_cell), Paragraph("Base ₹96/kg × Material Fabrication Multiplier", table_cell), Paragraph(f"<b>{format_inr(cb.get('fabrication_cost', 0))}</b>", table_cell)],
        [Paragraph("5. Surface Preparation & Finishing", table_cell), Paragraph("Grit blasting & epoxy polyurethane primer @ ₹20/kg", table_cell), Paragraph(f"<b>{format_inr(cb.get('finishing_cost', 0))}</b>", table_cell)],
        [Paragraph("6. Bought-Out Engineering Items", table_cell), Paragraph(f"Standard {quote_data.get('size_category', '')} hardware, seals & bearings", table_cell), Paragraph(f"<b>{format_inr(cb.get('bought_out_cost', 0))}</b>", table_cell)],
        [Paragraph("7. Automation & Actuation Package", table_cell), Paragraph(f"{quote_data.get('actuation_type', '')} actuator, gearbox & mounting", table_cell), Paragraph(f"<b>{format_inr(cb.get('actuation_cost', 0))}</b>", table_cell)],
        [Paragraph("<b>Manufacturing Subtotal</b>", table_cell_bold), Paragraph(f"For {quote_data.get('quantity', 1)} Unit(s)", table_cell_bold), Paragraph(f"<b>{format_inr(cb.get('subtotal', 0))}</b>", table_cell_bold)],
    ]

    if cb.get("margin_amount", 0) > 0:
        cost_rows.append([
            Paragraph(f"Approved Margin / Engineering Margin ({cb.get('margin_percent', 0)}%)", table_cell),
            Paragraph("Commercial engineering overhead & margin", table_cell),
            Paragraph(f"<b>{format_inr(cb.get('margin_amount', 0))}</b>", table_cell)
        ])

    if cb.get("tax_amount", 0) > 0:
        cost_rows.append([
            Paragraph(f"GST / Applicable Taxes ({cb.get('tax_percent', 0)}%)", table_cell),
            Paragraph("Statutory Indirect Taxes", table_cell),
            Paragraph(f"<b>{format_inr(cb.get('tax_amount', 0))}</b>", table_cell)
        ])

    # Final Total Row
    cost_rows.append([
        Paragraph("<b>FINAL ESTIMATED QUOTATION VALUE</b>", table_cell_bold),
        Paragraph("<b>Total Commercial Price (INR)</b>", table_cell_bold),
        Paragraph(f"<b><font size=10 color='#0F172A'>{format_inr(cb.get('final_amount', 0))}</font></b>", table_cell_bold)
    ])

    cost_table = Table(cost_rows, colWidths=[200, 205, 120])
    cost_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#E2E8F0")),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor("#FEF3C7")),  # Amber highlighted total
        ('LINEBELOW', (0, -1), (-1, -1), 1.5, c_accent),
    ]))
    story.append(cost_table)
    story.append(Spacer(1, 10))

    # 5. Commercial Terms & Engineering Notes
    story.append(Paragraph("<b>COMMERCIAL TERMS, CONDITIONS & ENGINEERING ASSUMPTIONS</b>", h2_style))
    terms_text = (
        "<b>1. Price Basis:</b> Ex-works manufacturing works, packing and freight extra at actuals.<br/>"
        "<b>2. Quotation Validity:</b> 30 days from the date of this document.<br/>"
        "<b>3. Delivery Schedule:</b> 4 to 6 weeks from receipt of technically and commercially clear purchase order and approved drawing.<br/>"
        "<b>4. Payment Terms:</b> 30% advance with purchase order, balance 70% against proforma invoice prior to dispatch.<br/>"
        "<b>5. Warranty:</b> 18 months from supply or 12 months from commissioning, whichever occurs earlier, against manufacturing defects.<br/>"
        "<b>6. Inspection & Testing:</b> Internal factory hydraulic / pneumatic seat leakage testing as per standard factory QA procedure."
    )
    if quote_data.get("remarks"):
        terms_text += f"<br/><b>7. Special Engineering Remarks:</b> {quote_data.get('remarks')}"

    terms_data = [[Paragraph(terms_text, body_style)]]
    terms_table = Table(terms_data, colWidths=[525])
    terms_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ('BOX', (0, 0), (-1, -1), 0.5, c_border),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(terms_table)
    story.append(Spacer(1, 12))

    # 6. Authorized Signatures
    sig_data = [
        [
            Paragraph("<b>Prepared By:</b><br/>Estimation & Design Engineering<br/>Smart Valve Estimation System", body_style),
            Paragraph("<b>Authorized Signatory:</b><br/>Commercial & Proposals Division<br/>Industrial Flow & Damper Technologies", body_style)
        ]
    ]
    sig_table = Table(sig_data, colWidths=[262, 263])
    sig_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(sig_table)

    # Build document
    def on_first_page(canvas_obj, doc_obj):
        canvas_obj.quote_ref = quote_data.get("quote_number", "SMART-VALVE")

    doc.build(story, canvasmaker=NumberedCanvas)
    return buffer.getvalue()

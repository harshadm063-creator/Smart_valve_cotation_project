import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def generate_sample_customer_spec():
    pdf_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sample_customer_damper_spec.pdf")
    doc = SimpleDocTemplate(pdf_path, pagesize=letter, leftMargin=40, rightMargin=40, topMargin=40, bottomMargin=40)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle("T1", fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=colors.HexColor("#0F172A"))
    h2_style = ParagraphStyle("H2", fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=colors.HexColor("#D97706"))
    body = ParagraphStyle("B1", fontName="Helvetica", fontSize=9, leading=13, textColor=colors.HexColor("#334155"))
    body_bold = ParagraphStyle("B2", fontName="Helvetica-Bold", fontSize=9, leading=13, textColor=colors.HexColor("#0F172A"))

    story = [
        Paragraph("NATIONAL THERMAL POWER CORPORATION (NTPC)", title_style),
        Paragraph("TECHNICAL SPECIFICATION SHEET & INQUIRY SCHEDULE", h2_style),
        Paragraph("Document Ref: NTPC/MECH/SPEC/2026/088 | Date: 05-Oct-2026", body),
        Spacer(1, 14),
        Paragraph("<b>1. GENERAL INQUIRY INFORMATION</b>", h2_style),
        Paragraph("Client / Buyer: National Thermal Power Corporation<br/>"
                  "Project Title: 2x800 MW Supercritical Thermal Expansion Project<br/>"
                  "RFQ / Inquiry No: RFQ-NTPC-FGD-2026-904<br/>"
                  "Delivery Destination: NTPC Ramagundam Site Store, Telangana", body),
        Spacer(1, 10),
        Paragraph("<b>2. MECHANICAL EQUIPMENT REQUIREMENTS</b>", h2_style),
    ]

    spec_table_data = [
        [Paragraph("<b>Parameter</b>", body_bold), Paragraph("<b>Specification Value</b>", body_bold), Paragraph("<b>Engineering Remarks</b>", body_bold)],
        [Paragraph("Equipment Type", body), Paragraph("Rack & Pinion Damper", body_bold), Paragraph("Heavy duty isolation damper for flue gas ducting", body)],
        [Paragraph("Equipment Tag No.", body), Paragraph("DMP-FGD-ISOL-01", body_bold), Paragraph("Stainless steel etched nameplate required", body)],
        [Paragraph("Quantity", body), Paragraph("1 Nos", body_bold), Paragraph("Single set complete with drive unit", body)],
        [Paragraph("Duct Length (L)", body), Paragraph("1600 mm", body_bold), Paragraph("Flange-to-flange internal clear dimension", body)],
        [Paragraph("Duct Width / Diameter (W)", body), Paragraph("1400 mm", body_bold), Paragraph("Duct opening width", body)],
        [Paragraph("Casing Depth (D)", body), Paragraph("450 mm", body_bold), Paragraph("Overall housing depth including flange thickness", body)],
        [Paragraph("Body / Housing Material", body), Paragraph("IS 2062", body_bold), Paragraph("Structural carbon steel plate casing", body)],
        [Paragraph("Flap / Blade Material", body), Paragraph("SS 304 L", body_bold), Paragraph("Corrosion resistant austenitic stainless steel", body)],
        [Paragraph("Actuation Type", body), Paragraph("Pneumatic", body_bold), Paragraph("Double acting pneumatic actuator with 5/2 solenoid valve", body)],
        [Paragraph("Design Pressure", body), Paragraph("± 6.5 kPa (Gauge)", body), Paragraph("Continuous operating flue gas static pressure", body)],
        [Paragraph("Design Temperature", body), Paragraph("180 °C continuous, 220 °C peak", body), Paragraph("Thermal expansion allowances mandatory", body)],
        [Paragraph("Service Medium", body), Paragraph("Flue Gas with fly ash particulates", body), Paragraph("Gland seals with graphite rings", body)],
        [Paragraph("Seat Leakage Class", body), Paragraph("Class II as per AMCA 500-D", body), Paragraph("Metallic seal strip design", body)],
    ]

    t = Table(spec_table_data, colWidths=[150, 160, 220])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#F1F5F9")),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t)
    story.append(Spacer(1, 14))
    story.append(Paragraph("<b>3. SPECIAL VENDOR INSTRUCTIONS</b>", h2_style))
    story.append(Paragraph(
        "Vendor must furnish itemized Bill of Materials with unit weights, raw material grades, "
        "and manufacturing fabrication breakdowns. Final quotation must include standard test certificates.", body
    ))

    doc.build(story)
    print(f"Sample customer specification created at: {pdf_path}")

if __name__ == "__main__":
    generate_sample_customer_spec()

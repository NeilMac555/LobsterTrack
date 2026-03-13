"""Generate SteamWatch Match Model User Guide PDF."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas
import os

# ── Colours ──────────────────────────────────────────────────────────
DARK_BG = HexColor("#0f172a")
SLATE_800 = HexColor("#1e293b")
SLATE_700 = HexColor("#334155")
SLATE_400 = HexColor("#94a3b8")
SLATE_300 = HexColor("#cbd5e1")
WHITE = HexColor("#ffffff")
RED_500 = HexColor("#ef4444")
RED_400 = HexColor("#f87171")
EMERALD = HexColor("#10b981")
AMBER = HexColor("#f59e0b")

# ── Styles ───────────────────────────────────────────────────────────
def make_styles():
    s = {}
    s["title"] = ParagraphStyle(
        "Title", fontName="Helvetica-Bold", fontSize=28,
        textColor=WHITE, alignment=TA_CENTER, spaceAfter=8,
    )
    s["subtitle"] = ParagraphStyle(
        "Subtitle", fontName="Helvetica", fontSize=14,
        textColor=SLATE_400, alignment=TA_CENTER, spaceAfter=6,
    )
    s["url"] = ParagraphStyle(
        "URL", fontName="Helvetica", fontSize=11,
        textColor=RED_400, alignment=TA_CENTER, spaceAfter=0,
    )
    s["h1"] = ParagraphStyle(
        "H1", fontName="Helvetica-Bold", fontSize=18,
        textColor=RED_400, spaceBefore=18, spaceAfter=10,
    )
    s["h2"] = ParagraphStyle(
        "H2", fontName="Helvetica-Bold", fontSize=13,
        textColor=WHITE, spaceBefore=14, spaceAfter=6,
    )
    s["body"] = ParagraphStyle(
        "Body", fontName="Helvetica", fontSize=10,
        textColor=SLATE_300, leading=15, spaceAfter=8,
        alignment=TA_JUSTIFY,
    )
    s["bullet"] = ParagraphStyle(
        "Bullet", fontName="Helvetica", fontSize=10,
        textColor=SLATE_300, leading=15, spaceAfter=4,
        leftIndent=18, bulletIndent=6,
    )
    s["step_title"] = ParagraphStyle(
        "StepTitle", fontName="Helvetica-Bold", fontSize=10.5,
        textColor=EMERALD, spaceBefore=8, spaceAfter=2,
    )
    s["step_body"] = ParagraphStyle(
        "StepBody", fontName="Helvetica", fontSize=10,
        textColor=SLATE_300, leading=15, spaceAfter=6,
        leftIndent=18,
    )
    s["tip"] = ParagraphStyle(
        "Tip", fontName="Helvetica-Oblique", fontSize=10,
        textColor=AMBER, leading=14, spaceAfter=4,
        leftIndent=18, bulletIndent=6,
    )
    s["footer"] = ParagraphStyle(
        "Footer", fontName="Helvetica", fontSize=8,
        textColor=SLATE_400, alignment=TA_CENTER,
    )
    s["table_header"] = ParagraphStyle(
        "TH", fontName="Helvetica-Bold", fontSize=9.5,
        textColor=WHITE, leading=13,
    )
    s["table_cell"] = ParagraphStyle(
        "TC", fontName="Helvetica", fontSize=9.5,
        textColor=SLATE_300, leading=13,
    )
    return s

# ── Page background & footer ────────────────────────────────────────
class DarkPageTemplate:
    def __init__(self):
        pass

    def __call__(self, canvas_obj, doc):
        canvas_obj.saveState()
        canvas_obj.setFillColor(DARK_BG)
        canvas_obj.rect(0, 0, A4[0], A4[1], fill=True, stroke=False)
        # Footer
        canvas_obj.setFont("Helvetica", 8)
        canvas_obj.setFillColor(SLATE_400)
        canvas_obj.drawCentredString(A4[0] / 2, 15 * mm, "www.steamwatch.io")
        # Page number
        canvas_obj.drawRightString(A4[0] - 20 * mm, 15 * mm, f"{doc.page}")
        canvas_obj.restoreState()

# ── Divider helper ───────────────────────────────────────────────────
def divider():
    return HRFlowable(
        width="100%", thickness=0.5, color=SLATE_700,
        spaceBefore=6, spaceAfter=10,
    )

# ── Build document ───────────────────────────────────────────────────
def build_guide():
    out_path = os.path.join(os.path.dirname(__file__), "SteamWatch_Match_Model_Guide.pdf")
    doc = SimpleDocTemplate(
        out_path, pagesize=A4,
        leftMargin=22 * mm, rightMargin=22 * mm,
        topMargin=20 * mm, bottomMargin=25 * mm,
    )
    S = make_styles()
    story = []

    # ── TITLE PAGE ───────────────────────────────────────────────────
    story.append(Spacer(1, 60 * mm))
    story.append(Paragraph("SteamWatch Match Model", S["title"]))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("User Guide", ParagraphStyle(
        "TitleSub", fontName="Helvetica", fontSize=22,
        textColor=SLATE_400, alignment=TA_CENTER, spaceAfter=14,
    )))
    story.append(divider())
    story.append(Paragraph(
        "Dixon-Coles Probability Baselines for Football Matches", S["subtitle"]
    ))
    story.append(Spacer(1, 12 * mm))
    story.append(Paragraph("www.steamwatch.io", S["url"]))
    story.append(PageBreak())

    # ── 1. WHAT IS THE MATCH MODEL? ─────────────────────────────────
    story.append(Paragraph("1. What Is the Match Model?", S["h1"]))
    story.append(Paragraph(
        "The SteamWatch Match Model uses a <b>Dixon-Coles adjusted Poisson regression</b> "
        "to estimate the probability of match outcomes (Home Win, Draw, Away Win) for "
        "football matches. It generates <b>fair odds baselines</b> that help you identify "
        "value in the betting market.",
        S["body"],
    ))
    story.append(Paragraph(
        "All calculations run in your browser \u2014 no data leaves your device.",
        S["body"],
    ))

    # ── 2. WHAT YOU NEED ─────────────────────────────────────────────
    story.append(Paragraph("2. What You Need (Data Inputs)", S["h1"]))
    story.append(Paragraph(
        "You enter stats for both teams. The form is split into sections \u2014 "
        "only Core Stats are required; the rest improve accuracy.",
        S["body"],
    ))

    story.append(Paragraph("Core Stats (per team)", S["h2"]))
    for item in [
        "Goals For / Against per match",
        "xG For / Against per match",
        "Matches Played (season)",
        "Penalties Received & Conceded (season totals)",
        "Avg Red Cards For / Against per match",
        "Shots For / Against per match",
    ]:
        story.append(Paragraph(f"\u2022  {item}", S["bullet"]))

    story.append(Paragraph("xG Quality Breakdown (optional but recommended)", S["h2"]))
    for item in [
        "Open Play xG",
        "Set Piece xG",
        "Last 6 xG For / Against per match",
        "Last 6 xG Per Shot",
    ]:
        story.append(Paragraph(f"\u2022  {item}", S["bullet"]))

    story.append(Paragraph("Context & Adjustments", S["h2"]))
    for item in [
        "Motivation \u2014 Normal / Elevated / Must-Win",
        "Absence Severity \u2014 Attack & Defence sliders (1\u20135 scale)",
        "Home Advantage Factor \u2014 pre-set per league, adjustable per match",
    ]:
        story.append(Paragraph(f"\u2022  {item}", S["bullet"]))

    # ── 3. WHERE TO FIND THE DATA ────────────────────────────────────
    story.append(Paragraph("3. Where to Find the Data", S["h1"]))
    sources = [
        ("Opta Analyst", "theanalyst.com", "Goals, xG, open play / set piece xG breakdown"),
        ("FBref", "fbref.com", "Shots per game, shot quality metrics"),
        ("Transfermarkt", "transfermarkt.com", "Penalties awarded / conceded, injury & absence info"),
        ("Scoreroom", "scoreroom.com", "Red cards, discipline stats"),
    ]
    for name, url, desc in sources:
        story.append(Paragraph(
            f"\u2022  <b>{name}</b> ({url}) \u2014 {desc}", S["bullet"]
        ))

    # ── 4. HOW THE MODEL WORKS ───────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("4. How the Model Works", S["h1"]))
    story.append(Paragraph(
        "The model runs an 11-step pipeline. Each step refines the expected goals "
        "estimate before converting it into match probabilities.",
        S["body"],
    ))

    steps = [
        ("1. Penalty xG Adjustment",
         "Strips out penalty xG (0.76 per penalty) and reintroduces 50% to reflect "
         "actual conversion rates, giving a truer picture of open-play attacking quality."),
        ("2. Set Piece xG Discount",
         "Applies a discount (default 85%) to set piece xG, since set pieces are "
         "less repeatable than open play chances."),
        ("3. Red Card Normalization",
         "Adjusts attacking and defensive strength based on each team\u2019s red card "
         "frequency. More reds = weaker attack, worse defence."),
        ("4. xG Per Shot Quality",
         "Compares each team\u2019s shot quality (xG per shot) against the league average. "
         "Teams that create higher-quality chances get a small boost."),
        ("5. Form Weighting",
         "Blends full-season stats with the last 6 matches (default 75/25 split). "
         "Captures recent form without overreacting to small samples."),
        ("6. Attack & Defence Strength",
         "Calculates each team\u2019s attacking and defensive ratings relative to the "
         "league average. Attack uses xG for; defence uses an 80/20 blend of xG against "
         "and actual goals against."),
        ("7. Expected Goals (Lambda)",
         "Combines attack strength, defence strength, league average, and home advantage "
         "into a single expected goals figure per team \u2014 the Poisson \u03bb parameter."),
        ("8. Motivation & Absences",
         "Applies multipliers for team motivation (e.g., relegation battle = +10%) and "
         "reduces/increases expected goals based on key player absences."),
        ("9. Poisson Distribution",
         "Uses each team\u2019s \u03bb to generate a probability distribution for 0\u201310 goals, "
         "then builds an 11\u00d711 scoreline probability matrix."),
        ("10. Dixon-Coles Correction",
         "Adjusts the joint probability matrix to correct for the known tendency of basic "
         "Poisson models to underestimate low-scoring draws (0-0, 1-1). Uses the rho "
         "parameter (default \u22120.03)."),
        ("11. Draw Inflation",
         "Applies a final 8% uplift to draw probability to match real-world frequencies, "
         "then normalises all three outcomes to sum to 100%."),
    ]
    for title, body in steps:
        story.append(Paragraph(title, S["step_title"]))
        story.append(Paragraph(body, S["step_body"]))

    # ── 5. UNDERSTANDING THE OUTPUT ──────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("5. Understanding the Output", S["h1"]))
    outputs = [
        ("Probability %",
         "The model\u2019s estimated chance of Home Win, Draw, and Away Win."),
        ("Fair Odds",
         "Calculated as 1 \u00f7 probability. If a bookmaker offers higher odds than the "
         "fair price, there may be value."),
        ("Expected Goals (\u03bb)",
         "The Poisson rate parameter for each team. Higher \u03bb = more goals expected."),
        ("Calculation Log",
         "Expandable breakdown showing every step, so you can see exactly how the "
         "numbers were derived."),
    ]
    for title, body in outputs:
        story.append(Paragraph(f"\u2022  <b>{title}</b> \u2014 {body}", S["bullet"]))

    # ── 6. ADVANCED SETTINGS ─────────────────────────────────────────
    story.append(Paragraph("6. Advanced Settings", S["h1"]))
    story.append(Paragraph(
        "For experienced users \u2014 these parameters let you fine-tune the model. "
        "The defaults work well for most matches.",
        S["body"],
    ))

    adv_data = [
        [Paragraph("<b>Parameter</b>", S["table_header"]),
         Paragraph("<b>Default</b>", S["table_header"]),
         Paragraph("<b>What It Does</b>", S["table_header"])],
        [Paragraph("Draw Inflation", S["table_cell"]),
         Paragraph("1.08", S["table_cell"]),
         Paragraph("Boosts draw probability to match real-world frequencies", S["table_cell"])],
        [Paragraph("Dixon-Coles rho", S["table_cell"]),
         Paragraph("\u22120.03", S["table_cell"]),
         Paragraph("Controls low-score correction strength (0-0 and 1-1 draws)", S["table_cell"])],
        [Paragraph("Form Weight", S["table_cell"]),
         Paragraph("0.25", S["table_cell"]),
         Paragraph("Weight given to last 6 matches vs full season (0 = season only)", S["table_cell"])],
        [Paragraph("Set Piece xG Discount", S["table_cell"]),
         Paragraph("0.85", S["table_cell"]),
         Paragraph("Discount applied to set piece xG (1.0 = no discount)", S["table_cell"])],
        [Paragraph("xG/Shot Quality Weight", S["table_cell"]),
         Paragraph("0.15", S["table_cell"]),
         Paragraph("How much shot quality influences the estimate", S["table_cell"])],
        [Paragraph("Absence Weight", S["table_cell"]),
         Paragraph("0.03", S["table_cell"]),
         Paragraph("Impact per absence severity level on expected goals", S["table_cell"])],
    ]

    adv_table = Table(adv_data, colWidths=[35 * mm, 20 * mm, 100 * mm])
    adv_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SLATE_800),
        ("BACKGROUND", (0, 1), (-1, -1), HexColor("#141c2e")),
        ("GRID", (0, 0), (-1, -1), 0.5, SLATE_700),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(adv_table)

    # ── 7. SUPPORTED LEAGUES ─────────────────────────────────────────
    story.append(Paragraph("7. Supported Leagues", S["h1"]))

    league_data = [
        [Paragraph("<b>League</b>", S["table_header"]),
         Paragraph("<b>Home Advantage</b>", S["table_header"]),
         Paragraph("<b>Avg Goals</b>", S["table_header"]),
         Paragraph("<b>Avg xG</b>", S["table_header"])],
        [Paragraph("Premier League", S["table_cell"]), Paragraph("1.12", S["table_cell"]),
         Paragraph("1.43", S["table_cell"]), Paragraph("1.35", S["table_cell"])],
        [Paragraph("Bundesliga", S["table_cell"]), Paragraph("1.15", S["table_cell"]),
         Paragraph("1.50", S["table_cell"]), Paragraph("1.45", S["table_cell"])],
        [Paragraph("La Liga", S["table_cell"]), Paragraph("1.14", S["table_cell"]),
         Paragraph("1.30", S["table_cell"]), Paragraph("1.25", S["table_cell"])],
        [Paragraph("Serie A", S["table_cell"]), Paragraph("1.13", S["table_cell"]),
         Paragraph("1.32", S["table_cell"]), Paragraph("1.26", S["table_cell"])],
        [Paragraph("Ligue 1", S["table_cell"]), Paragraph("1.11", S["table_cell"]),
         Paragraph("1.33", S["table_cell"]), Paragraph("1.27", S["table_cell"])],
        [Paragraph("Champions League", S["table_cell"]), Paragraph("1.18", S["table_cell"]),
         Paragraph("1.45", S["table_cell"]), Paragraph("1.40", S["table_cell"])],
        [Paragraph("Europa League", S["table_cell"]), Paragraph("1.18", S["table_cell"]),
         Paragraph("1.40", S["table_cell"]), Paragraph("1.35", S["table_cell"])],
    ]

    league_table = Table(league_data, colWidths=[42 * mm, 32 * mm, 28 * mm, 28 * mm])
    league_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SLATE_800),
        ("BACKGROUND", (0, 1), (-1, -1), HexColor("#141c2e")),
        ("GRID", (0, 0), (-1, -1), 0.5, SLATE_700),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(league_table)

    # ── 8. TIPS ──────────────────────────────────────────────────────
    story.append(Paragraph("8. Tips", S["h1"]))
    tips = [
        "Always use the most recent season stats.",
        "Update last-6 form data before each matchweek.",
        "Absence severity 3+ has meaningful impact \u2014 use it for confirmed injuries to key players.",
        "Compare model fair odds to Pinnacle closing lines for the best value assessment.",
        "The model works best as a baseline \u2014 combine with your own tactical knowledge.",
    ]
    for tip in tips:
        story.append(Paragraph(f"\u2022  {tip}", S["tip"]))

    # ── BUILD ────────────────────────────────────────────────────────
    doc.build(story, onFirstPage=DarkPageTemplate(), onLaterPages=DarkPageTemplate())
    print(f"PDF saved to: {out_path}")

if __name__ == "__main__":
    build_guide()

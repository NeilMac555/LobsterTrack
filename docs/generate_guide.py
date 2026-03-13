"""Generate SteamWatch Match Model User Guide PDF — Quant Edition."""
import math
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    HRFlowable, Flowable
)

W, H = A4

# ── Colours ──────────────────────────────────────────────────────────
DARK_BG    = HexColor("#0f172a")
DARK_BG2   = HexColor("#0c1322")
SLATE_900  = HexColor("#0f172a")
SLATE_800  = HexColor("#1e293b")
SLATE_700  = HexColor("#334155")
SLATE_600  = HexColor("#475569")
SLATE_500  = HexColor("#64748b")
SLATE_400  = HexColor("#94a3b8")
SLATE_300  = HexColor("#cbd5e1")
WHITE      = HexColor("#ffffff")
RED_500    = HexColor("#ef4444")
RED_400    = HexColor("#f87171")
EMERALD    = HexColor("#10b981")
EMERALD_D  = HexColor("#065f46")
AMBER      = HexColor("#f59e0b")
CYAN       = HexColor("#06b6d4")
CYAN_DIM   = HexColor("#0e7490")

def alpha(color, a):
    """Return color with alpha-like blending against DARK_BG."""
    bg = (15/255, 23/255, 42/255)
    r = bg[0] * (1 - a) + color.red * a
    g = bg[1] * (1 - a) + color.green * a
    b = bg[2] * (1 - a) + color.blue * a
    return Color(r, g, b)

# ── Poisson helper ───────────────────────────────────────────────────
def poisson_pmf(k, lam):
    return math.exp(-lam) * (lam ** k) / math.factorial(k)

# ── Custom flowables ─────────────────────────────────────────────────

class PoissonCurveFlowable(Flowable):
    """Draws two overlapping Poisson distributions."""
    def __init__(self, width, height, lam_h=1.45, lam_a=1.12):
        super().__init__()
        self.width = width
        self.height = height
        self.lam_h = lam_h
        self.lam_a = lam_a

    def draw(self):
        c = self.canv
        max_k = 7
        bar_w = self.width / (max_k + 1)
        max_p = max(poisson_pmf(k, self.lam_h) for k in range(max_k + 1))
        max_p = max(max_p, max(poisson_pmf(k, self.lam_a) for k in range(max_k + 1)))

        for k in range(max_k + 1):
            x = k * bar_w
            # Home bars
            ph = poisson_pmf(k, self.lam_h)
            bh = (ph / max_p) * (self.height - 18)
            c.setFillColor(alpha(EMERALD, 0.5))
            c.rect(x + 2, 0, bar_w * 0.4 - 2, bh, fill=True, stroke=False)
            # Away bars
            pa = poisson_pmf(k, self.lam_a)
            ba = (pa / max_p) * (self.height - 18)
            c.setFillColor(alpha(RED_400, 0.45))
            c.rect(x + bar_w * 0.4 + 1, 0, bar_w * 0.4 - 2, ba, fill=True, stroke=False)
            # Label
            c.setFillColor(SLATE_500)
            c.setFont("Helvetica", 7)
            c.drawCentredString(x + bar_w * 0.4, -10, str(k))

        # Legend
        c.setFont("Helvetica", 7)
        lx = self.width - 55
        ly = self.height - 14
        c.setFillColor(alpha(EMERALD, 0.6))
        c.rect(lx, ly, 8, 8, fill=True, stroke=False)
        c.setFillColor(SLATE_400)
        c.drawString(lx + 11, ly + 1, f"Home ({self.lam_h})")
        c.setFillColor(alpha(RED_400, 0.55))
        c.rect(lx, ly - 13, 8, 8, fill=True, stroke=False)
        c.setFillColor(SLATE_400)
        c.drawString(lx + 11, ly - 12, f"Away ({self.lam_a})")


class ScorelineHeatmapFlowable(Flowable):
    """Draws a mini 6x6 scoreline probability heatmap."""
    def __init__(self, width, height, lam_h=1.45, lam_a=1.12, rho=-0.03):
        super().__init__()
        self.width = width
        self.height = height
        self.lam_h = lam_h
        self.lam_a = lam_a
        self.rho = rho

    def draw(self):
        c = self.canv
        n = 6
        cell = min(self.width / (n + 1.5), (self.height - 10) / (n + 1.5))
        ox = (self.width - cell * (n + 1)) / 2
        oy = 2

        # Compute joint probs with Dixon-Coles
        probs = []
        max_p = 0
        for i in range(n):
            row = []
            for j in range(n):
                p = poisson_pmf(i, self.lam_h) * poisson_pmf(j, self.lam_a)
                # Dixon-Coles correction
                if i == 0 and j == 0:
                    p *= max(0, 1 - self.lam_h * self.lam_a * self.rho)
                elif i == 1 and j == 0:
                    p *= max(0, 1 + self.lam_a * self.rho)
                elif i == 0 and j == 1:
                    p *= max(0, 1 + self.lam_h * self.rho)
                elif i == 1 and j == 1:
                    p *= max(0, 1 - self.rho)
                row.append(p)
                if p > max_p:
                    max_p = p
            probs.append(row)

        # Column headers (away goals)
        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(SLATE_500)
        for j in range(n):
            x = ox + (j + 1) * cell + cell / 2
            c.drawCentredString(x, oy + (n + 0.3) * cell, str(j))
        # "Away" label
        c.setFont("Helvetica", 6)
        c.setFillColor(RED_400)
        mid_x = ox + (n / 2 + 1) * cell + cell / 2
        c.drawCentredString(mid_x, oy + (n + 0.9) * cell, "Away Goals")

        # Row headers (home goals)
        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(SLATE_500)
        for i in range(n):
            y = oy + (n - 1 - i) * cell + cell / 2 - 2.5
            c.drawRightString(ox + cell - 3, y, str(i))
        # "Home" label
        c.setFont("Helvetica", 6)
        c.setFillColor(EMERALD)
        c.saveState()
        c.translate(ox - 2, oy + n * cell / 2)
        c.rotate(90)
        c.drawCentredString(0, 0, "Home Goals")
        c.restoreState()

        # Heatmap cells
        for i in range(n):
            for j in range(n):
                x = ox + (j + 1) * cell
                y = oy + (n - 1 - i) * cell
                intensity = probs[i][j] / max_p if max_p > 0 else 0

                # Color: home win = green, draw = amber, away win = red
                if i > j:
                    fill = alpha(EMERALD, 0.15 + intensity * 0.6)
                elif i == j:
                    fill = alpha(AMBER, 0.15 + intensity * 0.55)
                else:
                    fill = alpha(RED_400, 0.15 + intensity * 0.55)

                c.setFillColor(fill)
                c.setStrokeColor(alpha(SLATE_700, 0.4))
                c.setLineWidth(0.3)
                c.rect(x, y, cell, cell, fill=True, stroke=True)

                # Probability text
                pct = probs[i][j] * 100
                if pct >= 1:
                    c.setFont("Helvetica", 6)
                    c.setFillColor(Color(1, 1, 1, 0.85) if intensity > 0.3 else SLATE_400)
                    c.drawCentredString(x + cell / 2, y + cell / 2 - 2.5, f"{pct:.1f}")


class ProbabilityBarFlowable(Flowable):
    """Draws a horizontal 1X2 probability bar like the site."""
    def __init__(self, width, height, ph=0.452, pd=0.243, pa=0.305):
        super().__init__()
        self.width = width
        self.height = height
        self.ph = ph
        self.pd = pd
        self.pa = pa

    def draw(self):
        c = self.canv
        h = self.height
        # Home
        w_h = self.width * self.ph
        c.setFillColor(HexColor("#15803d"))
        c.roundRect(0, 0, w_h - 1, h, 4, fill=True, stroke=False)
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 11)
        c.drawCentredString(w_h / 2, h / 2 - 4, f"{self.ph * 100:.1f}%")
        c.setFont("Helvetica", 7)
        c.drawCentredString(w_h / 2, h / 2 + 8, "HOME")

        # Draw
        w_d = self.width * self.pd
        c.setFillColor(HexColor("#d97706"))
        c.rect(w_h, 0, w_d - 1, h, fill=True, stroke=False)
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 11)
        c.drawCentredString(w_h + w_d / 2, h / 2 - 4, f"{self.pd * 100:.1f}%")
        c.setFont("Helvetica", 7)
        c.drawCentredString(w_h + w_d / 2, h / 2 + 8, "DRAW")

        # Away
        w_a = self.width * self.pa
        c.setFillColor(HexColor("#b91c1c"))
        c.roundRect(w_h + w_d, 0, w_a, h, 4, fill=True, stroke=False)
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 11)
        c.drawCentredString(w_h + w_d + w_a / 2, h / 2 - 4, f"{self.pa * 100:.1f}%")
        c.setFont("Helvetica", 7)
        c.drawCentredString(w_h + w_d + w_a / 2, h / 2 + 8, "AWAY")


class GridOverlayFlowable(Flowable):
    """Draws a subtle data-grid background pattern."""
    def __init__(self, width, height, spacing=12):
        super().__init__()
        self.width = width
        self.height = height
        self.spacing = spacing

    def draw(self):
        c = self.canv
        c.setStrokeColor(alpha(SLATE_700, 0.2))
        c.setLineWidth(0.2)
        for x in range(0, int(self.width), self.spacing):
            c.line(x, 0, x, self.height)
        for y in range(0, int(self.height), self.spacing):
            c.line(0, y, self.width, y)


# ── Styles ───────────────────────────────────────────────────────────
def make_styles():
    s = {}
    s["title"] = ParagraphStyle(
        "Title", fontName="Helvetica-Bold", fontSize=32,
        textColor=WHITE, alignment=TA_CENTER, spaceAfter=4,
    )
    s["title_accent"] = ParagraphStyle(
        "TitleAccent", fontName="Helvetica-Bold", fontSize=32,
        textColor=RED_400, alignment=TA_CENTER, spaceAfter=8,
    )
    s["subtitle"] = ParagraphStyle(
        "Subtitle", fontName="Helvetica", fontSize=13,
        textColor=SLATE_400, alignment=TA_CENTER, spaceAfter=6,
    )
    s["url"] = ParagraphStyle(
        "URL", fontName="Helvetica", fontSize=11,
        textColor=RED_400, alignment=TA_CENTER, spaceAfter=0,
    )
    s["tagline"] = ParagraphStyle(
        "Tagline", fontName="Courier", fontSize=9,
        textColor=CYAN, alignment=TA_CENTER, spaceAfter=0,
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
    s["table_header"] = ParagraphStyle(
        "TH", fontName="Helvetica-Bold", fontSize=9.5,
        textColor=WHITE, leading=13,
    )
    s["table_cell"] = ParagraphStyle(
        "TC", fontName="Helvetica", fontSize=9.5,
        textColor=SLATE_300, leading=13,
    )
    s["mono_small"] = ParagraphStyle(
        "MonoSmall", fontName="Courier", fontSize=8,
        textColor=CYAN, leading=11, alignment=TA_CENTER,
    )
    return s

# ── Page template ────────────────────────────────────────────────────
class CoverPage:
    """Custom title page with grid, Poisson curves, heatmap, prob bar."""
    def __call__(self, canvas_obj, doc):
        c = canvas_obj
        c.saveState()

        # Background
        c.setFillColor(DARK_BG2)
        c.rect(0, 0, W, H, fill=True, stroke=False)

        # Grid overlay across full page
        c.setStrokeColor(alpha(SLATE_700, 0.12))
        c.setLineWidth(0.2)
        spacing = 14
        for x in range(0, int(W), spacing):
            c.line(x, 0, x, H)
        for y in range(0, int(H), spacing):
            c.line(0, y, W, y)

        # Accent lines — top and bottom
        c.setStrokeColor(alpha(RED_400, 0.6))
        c.setLineWidth(2)
        c.line(20 * mm, H - 18 * mm, W - 20 * mm, H - 18 * mm)
        c.line(20 * mm, 28 * mm, W - 20 * mm, 28 * mm)

        # Corner accent marks
        c.setStrokeColor(alpha(EMERALD, 0.35))
        c.setLineWidth(1)
        for cx, cy in [(25*mm, H-22*mm), (W-25*mm, H-22*mm), (25*mm, 32*mm), (W-25*mm, 32*mm)]:
            c.line(cx - 4, cy, cx + 4, cy)
            c.line(cx, cy - 4, cx, cy + 4)

        # Floating Poisson curve (top-right area, faded)
        max_k = 8
        bar_w = 18
        base_x = W - 45 * mm
        base_y = H - 75 * mm
        for lam, col_fn in [(1.45, EMERALD), (1.15, RED_400)]:
            max_p = max(poisson_pmf(k, lam) for k in range(max_k))
            for k in range(max_k):
                p = poisson_pmf(k, lam)
                bh = (p / max_p) * 55
                c.setFillColor(alpha(col_fn, 0.15))
                offset = 0 if col_fn == EMERALD else bar_w * 0.45
                c.rect(base_x + k * bar_w + offset, base_y, bar_w * 0.4, bh, fill=True, stroke=False)

        # Floating mini heatmap (bottom-left area, faded)
        n = 5
        cell_s = 14
        hm_x = 28 * mm
        hm_y = 42 * mm
        lam_h, lam_a, rho = 1.45, 1.12, -0.03
        probs = []
        max_p = 0
        for i in range(n):
            row = []
            for j in range(n):
                p = poisson_pmf(i, lam_h) * poisson_pmf(j, lam_a)
                if i == 0 and j == 0:
                    p *= max(0, 1 - lam_h * lam_a * rho)
                elif i == 1 and j == 0:
                    p *= max(0, 1 + lam_a * rho)
                elif i == 0 and j == 1:
                    p *= max(0, 1 + lam_h * rho)
                elif i == 1 and j == 1:
                    p *= max(0, 1 - rho)
                row.append(p)
                if p > max_p:
                    max_p = p
            probs.append(row)

        for i in range(n):
            for j in range(n):
                intensity = probs[i][j] / max_p if max_p > 0 else 0
                if i > j:
                    fill = alpha(EMERALD, 0.05 + intensity * 0.15)
                elif i == j:
                    fill = alpha(AMBER, 0.05 + intensity * 0.12)
                else:
                    fill = alpha(RED_400, 0.05 + intensity * 0.12)
                c.setFillColor(fill)
                c.rect(hm_x + j * cell_s, hm_y + (n - 1 - i) * cell_s, cell_s - 1, cell_s - 1, fill=True, stroke=False)

        # Floating formula text (subtle)
        c.setFont("Courier", 7)
        c.setFillColor(alpha(CYAN, 0.18))
        formulas = [
            "P(X=k) = e^(-l) * l^k / k!",
            "tau(x,y,l1,l2,rho) = Dixon-Coles(1997)",
            "l_home = atk_h * def_a * mu * hfa",
            "fair_odds = 1 / P(outcome)",
        ]
        for i, f in enumerate(formulas):
            c.drawString(W - 62 * mm, 42 * mm + i * 11, f)

        # Footer
        c.setFont("Helvetica", 8)
        c.setFillColor(SLATE_500)
        c.drawCentredString(W / 2, 15 * mm, "www.steamwatch.io")

        c.restoreState()


class ContentPage:
    """Standard content page with subtle grid and footer."""
    def __call__(self, canvas_obj, doc):
        c = canvas_obj
        c.saveState()

        # Background
        c.setFillColor(DARK_BG)
        c.rect(0, 0, W, H, fill=True, stroke=False)

        # Subtle grid
        c.setStrokeColor(alpha(SLATE_700, 0.07))
        c.setLineWidth(0.15)
        for x in range(0, int(W), 18):
            c.line(x, 0, x, H)
        for y in range(0, int(H), 18):
            c.line(0, y, W, y)

        # Top accent line
        c.setStrokeColor(alpha(RED_400, 0.25))
        c.setLineWidth(0.8)
        c.line(20 * mm, H - 14 * mm, W - 20 * mm, H - 14 * mm)

        # Footer
        c.setFont("Helvetica", 8)
        c.setFillColor(SLATE_500)
        c.drawCentredString(W / 2, 15 * mm, "www.steamwatch.io")
        c.drawRightString(W - 20 * mm, 15 * mm, f"{doc.page}")

        # Page number accent
        c.setFont("Courier", 7)
        c.setFillColor(alpha(CYAN, 0.25))
        c.drawString(20 * mm, 15 * mm, f"// page {doc.page:02d}")

        c.restoreState()


# ── Divider ──────────────────────────────────────────────────────────
def divider():
    return HRFlowable(width="100%", thickness=0.5, color=SLATE_700, spaceBefore=6, spaceAfter=10)

def accent_divider():
    return HRFlowable(width="100%", thickness=1, color=alpha(RED_400, 0.4), spaceBefore=4, spaceAfter=8)


# ── Build ────────────────────────────────────────────────────────────
def build_guide():
    out_path = os.path.join(os.path.dirname(__file__), "SteamWatch_Match_Model_Guide.pdf")
    doc = SimpleDocTemplate(
        out_path, pagesize=A4,
        leftMargin=22 * mm, rightMargin=22 * mm,
        topMargin=20 * mm, bottomMargin=25 * mm,
    )
    S = make_styles()
    content_w = W - 44 * mm
    story = []

    # ═══════════════════════════════════════════════════════════════════
    # TITLE PAGE
    # ═══════════════════════════════════════════════════════════════════
    story.append(Spacer(1, 48 * mm))
    story.append(Paragraph("STEAMWATCH", S["title"]))
    story.append(Paragraph("Match Model", S["title_accent"]))
    story.append(Spacer(1, 3 * mm))
    story.append(accent_divider())
    story.append(Paragraph(
        "Dixon-Coles Probability Baselines for Football Matches", S["subtitle"]
    ))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "P(H) = 45.2%&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;"
        "P(D) = 24.3%&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;"
        "P(A) = 30.5%", S["tagline"]
    ))
    story.append(Spacer(1, 6 * mm))
    # Example probability bar on the title page
    story.append(ProbabilityBarFlowable(content_w, 36))
    story.append(Spacer(1, 14 * mm))
    story.append(Paragraph("User Guide", ParagraphStyle(
        "TitleSub2", fontName="Helvetica", fontSize=16,
        textColor=SLATE_400, alignment=TA_CENTER,
    )))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph("www.steamwatch.io", S["url"]))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════
    # 1. WHAT IS THE MATCH MODEL?
    # ═══════════════════════════════════════════════════════════════════
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

    # Visual: Poisson distribution example
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "Example: Poisson goal distributions for Home (\u03bb=1.45) vs Away (\u03bb=1.12)",
        ParagraphStyle("Caption", fontName="Helvetica", fontSize=8, textColor=SLATE_500, alignment=TA_CENTER, spaceAfter=4)
    ))
    story.append(PoissonCurveFlowable(content_w, 80))
    story.append(Spacer(1, 6 * mm))

    # ═══════════════════════════════════════════════════════════════════
    # 2. WHAT YOU NEED
    # ═══════════════════════════════════════════════════════════════════
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

    # ═══════════════════════════════════════════════════════════════════
    # 3. WHERE TO FIND THE DATA
    # ═══════════════════════════════════════════════════════════════════
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

    # ═══════════════════════════════════════════════════════════════════
    # 4. HOW THE MODEL WORKS
    # ═══════════════════════════════════════════════════════════════════
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

    # ═══════════════════════════════════════════════════════════════════
    # 5. UNDERSTANDING THE OUTPUT
    # ═══════════════════════════════════════════════════════════════════
    story.append(PageBreak())
    story.append(Paragraph("5. Understanding the Output", S["h1"]))

    # Scoreline heatmap visual
    story.append(Paragraph(
        "Example: Scoreline probability matrix (Dixon-Coles adjusted)",
        ParagraphStyle("Caption2", fontName="Helvetica", fontSize=8, textColor=SLATE_500, alignment=TA_CENTER, spaceAfter=6)
    ))
    story.append(ScorelineHeatmapFlowable(content_w, 110))
    story.append(Spacer(1, 8 * mm))

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

    # Example output bar
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(
        "Example output:",
        ParagraphStyle("Cap3", fontName="Helvetica", fontSize=8, textColor=SLATE_500, spaceAfter=4)
    ))
    story.append(ProbabilityBarFlowable(content_w, 32, ph=0.523, pd=0.221, pa=0.256))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        "Fair Odds:&nbsp;&nbsp;&nbsp;H 1.91&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;"
        "D 4.52&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;A 3.91",
        S["mono_small"],
    ))

    # ═══════════════════════════════════════════════════════════════════
    # 6. ADVANCED SETTINGS
    # ═══════════════════════════════════════════════════════════════════
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

    # ═══════════════════════════════════════════════════════════════════
    # 7. SUPPORTED LEAGUES
    # ═══════════════════════════════════════════════════════════════════
    story.append(Paragraph("7. Supported Leagues", S["h1"]))

    league_data = [
        [Paragraph("<b>League</b>", S["table_header"]),
         Paragraph("<b>Home Adv</b>", S["table_header"]),
         Paragraph("<b>Avg Goals</b>", S["table_header"]),
         Paragraph("<b>Avg xG</b>", S["table_header"]),
         Paragraph("<b>Avg Shots</b>", S["table_header"])],
        [Paragraph("Premier League", S["table_cell"]), Paragraph("1.12", S["table_cell"]),
         Paragraph("1.43", S["table_cell"]), Paragraph("1.35", S["table_cell"]),
         Paragraph("13.2", S["table_cell"])],
        [Paragraph("Bundesliga", S["table_cell"]), Paragraph("1.15", S["table_cell"]),
         Paragraph("1.50", S["table_cell"]), Paragraph("1.45", S["table_cell"]),
         Paragraph("14.1", S["table_cell"])],
        [Paragraph("La Liga", S["table_cell"]), Paragraph("1.14", S["table_cell"]),
         Paragraph("1.30", S["table_cell"]), Paragraph("1.25", S["table_cell"]),
         Paragraph("12.4", S["table_cell"])],
        [Paragraph("Serie A", S["table_cell"]), Paragraph("1.13", S["table_cell"]),
         Paragraph("1.32", S["table_cell"]), Paragraph("1.26", S["table_cell"]),
         Paragraph("13.0", S["table_cell"])],
        [Paragraph("Ligue 1", S["table_cell"]), Paragraph("1.11", S["table_cell"]),
         Paragraph("1.33", S["table_cell"]), Paragraph("1.27", S["table_cell"]),
         Paragraph("12.8", S["table_cell"])],
        [Paragraph("Champions League", S["table_cell"]), Paragraph("1.18", S["table_cell"]),
         Paragraph("1.45", S["table_cell"]), Paragraph("1.40", S["table_cell"]),
         Paragraph("13.5", S["table_cell"])],
        [Paragraph("Europa League", S["table_cell"]), Paragraph("1.18", S["table_cell"]),
         Paragraph("1.40", S["table_cell"]), Paragraph("1.35", S["table_cell"]),
         Paragraph("13.0", S["table_cell"])],
    ]

    league_table = Table(league_data, colWidths=[38 * mm, 24 * mm, 26 * mm, 24 * mm, 26 * mm])
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

    # ═══════════════════════════════════════════════════════════════════
    # 8. TIPS
    # ═══════════════════════════════════════════════════════════════════
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

    # ═══════════════════════════════════════════════════════════════════
    # BUILD
    # ═══════════════════════════════════════════════════════════════════
    doc.build(story, onFirstPage=CoverPage(), onLaterPages=ContentPage())
    print(f"PDF saved to: {out_path}")


if __name__ == "__main__":
    build_guide()

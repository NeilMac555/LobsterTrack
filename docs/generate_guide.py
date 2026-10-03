"""Rebuild both distributed copies of the current Match Predictor guide."""
from pathlib import Path
from shutil import copyfile
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, PageBreak

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/SteamWatch_Match_Model_Guide.pdf'
BG, PANEL, INK, MUTED, CYAN = map(colors.HexColor, ['#0f172a', '#1e293b', '#f1f5f9', '#cbd5e1', '#22d3ee'])
STYLES = {
    'title': ParagraphStyle('title', fontName='Helvetica-Bold', fontSize=25, leading=30, textColor=INK, spaceAfter=14),
    'h': ParagraphStyle('h', fontName='Helvetica-Bold', fontSize=13, leading=17, textColor=CYAN, spaceBefore=12, spaceAfter=7),
    'p': ParagraphStyle('p', fontName='Helvetica', fontSize=10, leading=14, textColor=INK, spaceAfter=8),
    'small': ParagraphStyle('small', fontName='Helvetica', fontSize=9, leading=12, textColor=MUTED, spaceAfter=7),
}

def build():
    story = []
    def p(text, style='p'): story.append(Paragraph(text, STYLES[style]))
    def h(text): p(text, 'h')
    def page(title):
        if story: story.append(PageBreak())
        p(title, 'title')
    def table(rows, widths):
        t = Table([[Paragraph(c, STYLES['small']) for c in row] for row in rows], colWidths=widths)
        t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),PANEL),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,0),1,CYAN),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
        story.append(t)

    page('Match Predictor / User guide')
    p('STEAMWATCH  |  UPDATED 3 OCTOBER 2026', 'small')
    p('Turn team statistics into goal rates, probabilities and fair odds using a Poisson score model with a Dixon-Coles low-score correction.')
    h('Start with consistent data')
    p('Choose Premier League, Bundesliga, La Liga, Serie A or Ligue 1. Use all-venue team averages from one provider; home/away-only samples can double-count venue advantage. Understat aligns with the live league references. This calculator is separate from the offline international ratings model.')
    table([['Core input for each team','What to enter'],['Goals Against / match','Actual goals conceded divided by matches played.'],['xG For / match; xG Against / match','Per-match xG including penalties for the standard penalty adjustment. Use the same provider and sample.'],['Matches Played','Number of matches represented by the season statistics.'],['Penalties Received; Penalties Conceded','Counts over that same sample, not per-match rates or penalties scored.']], [178,329])
    h('Replace the prefilled numbers')
    p('The prefilled figures are defaults, not automatically researched team data. Replace them before calculating. Do not mix season totals with per-match averages.')
    p('If using non-penalty xG, set penalty counts to zero to avoid deducting penalties twice. This skips the penalty adjustment; it does not recreate the retained penalty contribution used by the standard calculation.', 'small')
    h('Recent form')
    p('Last 6 xG For and Against are per-match averages. Form Weight defaults to 0.25: 75% adjusted season data plus 25% entered last-six data. If recent data is unavailable, set Form Weight to 0. Blank last-six fields are treated as zero, not as missing data.')
    h('Optional xG breakdown and shots')
    p('Open Play xG and Set Piece xG are per match. A supplied breakdown enables an attack-side set-piece adjustment; both blank skips it. Keep the components consistent and exclude penalties from set pieces when the provider reports them separately.')
    p('Shots For and Against are per match. They only affect the result when xG/Shot Quality Weight is above zero. Its default is zero, so entering shots alone has no effect.')

    page('Absences & advanced settings')
    h('One absence setting per team')
    p('Absence Severity affects both the team\'s scoring rate and its opponent\'s scoring rate. It is a manual team-level adjustment, not an automatic injury feed or a valuation of individual players.')
    table([['Setting','Effect at the default weight'],['None (1)','No adjustment.'],['Weakened (3)','Team goal rate x 0.94; opponent goal rate x 1.06.'],['Severely weakened (5)','Team goal rate x 0.88; opponent goal rate x 1.12.']], [178,329])
    p('Both sets of multipliers apply if both teams have absences. A 6% goal-rate change is not a six-percentage-point change in win probability.', 'small')
    h('Current defaults')
    table([['Parameter','Default','Effect'],['Draw Inflation','1.08','Multiply draw cells by 1.08, then normalise the full grid.'],['Dixon-Coles rho','-0.03','Adjust 0-0, 1-0, 0-1 and 1-1 probabilities.'],['Form Weight','0.25','Share assigned to entered last-six xG.'],['Set Piece xG Discount','0.85','Retain 85% of the set-piece component in the attack adjustment.'],['xG/Shot Quality Weight','0','Disabled by default. Enables a relative shot-quality modifier above zero.'],['Absence Weight','0.03','Adjustment per severity point above 1.']], [165,55,287])
    h('League constants')
    p('The scoring baseline blends current and previous-season Understat results. The previous season contributes up to 100 equivalent matches. With 50 current matches and a full previous season, the current-season weight is 50 / (50 + 100), or one-third. This smoothing choice has not been fitted for predictive accuracy.')
    p('Team-strength references use current-season goals, xG and penalty xG from the same matches. This avoids treating a league-wide rise as stronger teams too. With no current data, references use the previous season and the page flags this. At least 50 valid matches across both seasons are required.')
    p('The page shows the latest match date. References recalculate from stored data, cached for ten minutes; the source import runs weekly. No separate ball-in-play or tempo uplift is added.', 'small')
    p('Home advantage retains the historical multi-season league ratio, refreshed weekly. The optional shots reference stays fixed. If the new references are unavailable, the page clearly labels its older fallback values.', 'small')
    h('Defaults are assumptions')
    p('Optional adjustments do not automatically improve accuracy. Draw Inflation is an extra modelling choice beyond Dixon-Coles. A 1.08 multiplier does not mean an 8% rise in the final draw probability after normalisation.')

    page('How the calculation works')
    p('The calculator derives goal rates from entered statistics. It does not fit a new Poisson regression when you run it.', 'small')
    h('1 / Adjust season xG')
    p('Penalty contribution per match = penalty count / matches played x 0.76. For attack and defence: adjusted xG = max(0, entered xG - penalty contribution) + 0.50 x penalty contribution. Retaining half is a modelling choice, not a 50% penalty conversion estimate.')
    p('If a component breakdown is provided, attack xG is multiplied by (open-play xG + discount x set-piece xG) / (open-play xG + set-piece xG). With shot weighting enabled, relevant attack or defence xG is then multiplied by (1 - weight) + weight x relative xG per shot. The reference is league average xG divided by league average shots.')
    h('2 / Blend recent form and derive strengths')
    p('Blend adjusted season xG with entered last-six xG. The last-six inputs do not separately pass through the penalty, set-piece or shot-quality adjustments.')
    p('For live references, reference xG = league xG - 0.50 x league penalty xG x (1 - Form Weight). This matches the season/recent penalty treatment. Attack strength = blended xG for / reference xG. Defence strength = (0.80 x blended xG against + 0.20 x actual goals against) / (0.80 x reference xG + 0.20 x league goals). Older fallbacks use unadjusted league xG.')
    h('3 / Calculate expected goals')
    p('Let r be the league home/away goals ratio and g its average goals per team. Home multiplier = 2r / (1+r); away multiplier = 2 / (1+r). Each goal rate equals team attack strength x opponent defence strength x g x venue multiplier.')
    p('The venue multipliers reproduce the league total for two league-average teams. Absence multipliers apply next. Goal rates are bounded between 0.05 and 8.')
    h('4 / Build the score probabilities')
    p('Poisson probabilities form an 11 x 11 grid, from 0 to 10 goals per team. Dixon-Coles adjusts the four low-score cells. Draw Inflation multiplies all draw cells; the grid is then normalised to total 100%. All displayed markets use this adjusted probability distribution.')
    h('What is not modelled explicitly')
    p('The tool does not adjust team input samples for opponent strength or automatically evaluate lineups, individual player quality or tactical changes. Small samples and differences between xG providers can materially change its prices.')

    page('Markets & interpreting prices')
    table([['Output','Meaning'],['1X2','Home win, draw and away win for regulation time including stoppage time; excludes extra time and shootouts. Fair odds = 1 / probability.'],['Expected goals','The two adjusted Poisson goal rates. These are not observed shot-based xG from a future match.'],['Asian handicap','The handicap is applied to the home team. Whole lines allow pushes; quarter lines split the stake equally between adjacent whole/half lines.'],['Totals','Over/under combined goals. Whole totals allow pushes; quarter totals split between adjacent lines.'],['Both teams to score','Yes means each side scores at least once. No is its complement.'],['Correct scores','The eight most probable scorelines, not the whole distribution. Their probabilities need not sum to 100%.'],['Calculation log','Intermediate adjustments, strengths and rates used to produce the result.']], [133,374])
    h('Pushes and quarter lines')
    p('For handicaps and totals, fair odds = (1 - push share) / winning share. Quarter-line shares average the two half-stakes. Home -0.25, for example, splits into home 0 and home -0.5: a draw returns half the stake and loses half. Do not use 1 / cover probability when a push share exists.')
    h('A baseline, not a validated betting edge')
    p('Fair odds contain no bookmaker margin. Compare matching markets and settlement rules. A higher bookmaker price indicates value only under the model\'s assumptions; it does not establish a profitable strategy. Closing prices help evaluate predictions afterwards but may not be available when making a pre-match decision.')
    h('Version and reference')
    p('Model guide: 3 October 2026, responsive league baseline revision (season-blend-v1). The calculation log records the source, sample, weighting and data date. Dixon & Coles (1997) provides the low-score correction; SteamWatch\'s xG preprocessing, league smoothing, form blend, absences and extra draw multiplier are additional modelling choices.', 'small')
    p('<link href="https://www.steamwatch.io/tools/match-predictor" color="#22d3ee">Open the SteamWatch Match Predictor</link>', 'small')

    def background(c, doc):
        c.setFillColor(BG); c.rect(0,0,*A4,fill=1,stroke=0)
        c.setFillColor(CYAN); c.rect(44,A4[1]-37,507,2,fill=1,stroke=0)
        c.setFillColor(MUTED); c.setFont('Helvetica',8)
        c.drawString(44,27,'STEAMWATCH / MATCH PREDICTOR GUIDE / 3 OCT 2026')
        c.drawRightString(A4[0]-44,27,str(doc.page))
    SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=44, rightMargin=44, topMargin=55, bottomMargin=48, title='SteamWatch Match Predictor - October 2026', author='SteamWatch').build(story,onFirstPage=background,onLaterPages=background)
    copyfile(OUT, ROOT/'frontend/public/SteamWatch_Match_Model_Guide.pdf')
    print(OUT)

if __name__ == '__main__': build()

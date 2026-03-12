import { useState, useCallback, useRef, useEffect } from 'react';

// ===== TYPES =====
interface TeamInputs {
  goalsFor: string;
  goalsAgainst: string;
  xgFor: string;
  xgAgainst: string;
  matchesPlayed: string;
  penaltiesReceived: string;
  penaltiesConceded: string;
  avgRedCardsFor: string;
  avgRedCardsAgainst: string;
  shotsFor: string;
  shotsAgainst: string;
  openPlayXG: string;
  setPieceXG: string;
  psxgFor: string;
  psxgAgainst: string;
  last6XGFor: string;
  last6XGAgainst: string;
  last6XGPerShot: string;
  motivation: 'normal' | 'elevated' | 'must_win';
  absenceAtk: number;
  absenceDef: number;
}

interface AdvancedSettings {
  drawInflation: string;
  rho: string;
  formWeight: string;
  psxgWeight: string;
  varianceSensitivity: string;
  absenceWeight: string;
  negBin: boolean;
}

interface AbsenceNote {
  team: 'home' | 'away';
  type: 'attack' | 'defence';
  severity: number;
  pct: string;
}

interface PredictionResult {
  lambdaHome: number;
  lambdaAway: number;
  probHome: number;
  probDraw: number;
  probAway: number;
  absenceNotes: AbsenceNote[];
}

// ===== LEAGUE CONSTANTS =====
const LEAGUES: Record<string, { name: string; avgGoals: number; avgXG: number; avgShotsPerGame: number; homeAdv: number }> = {
  PL:  { name: 'Premier League',   avgGoals: 1.43, avgXG: 1.35, avgShotsPerGame: 13.2, homeAdv: 1.12 },
  BL:  { name: 'Bundesliga',       avgGoals: 1.50, avgXG: 1.45, avgShotsPerGame: 14.1, homeAdv: 1.15 },
  LL:  { name: 'La Liga',          avgGoals: 1.30, avgXG: 1.25, avgShotsPerGame: 12.4, homeAdv: 1.14 },
  SA:  { name: 'Serie A',          avgGoals: 1.32, avgXG: 1.26, avgShotsPerGame: 13.0, homeAdv: 1.13 },
  L1:  { name: 'Ligue 1',          avgGoals: 1.33, avgXG: 1.27, avgShotsPerGame: 12.8, homeAdv: 1.11 },
  CL:  { name: 'Champions League', avgGoals: 1.45, avgXG: 1.40, avgShotsPerGame: 13.5, homeAdv: 1.18 },
  UEL: { name: 'Europa League',    avgGoals: 1.40, avgXG: 1.35, avgShotsPerGame: 13.0, homeAdv: 1.18 },
};

const LEAGUE_DEFAULTS: Record<string, { gf: number; ga: number; xgf: number; xga: number; shots: number }> = {
  PL:  { gf: 1.43, ga: 1.43, xgf: 1.35, xga: 1.35, shots: 13.2 },
  BL:  { gf: 1.50, ga: 1.50, xgf: 1.45, xga: 1.45, shots: 14.1 },
  LL:  { gf: 1.30, ga: 1.30, xgf: 1.25, xga: 1.25, shots: 12.4 },
  SA:  { gf: 1.32, ga: 1.32, xgf: 1.26, xga: 1.26, shots: 13.0 },
  L1:  { gf: 1.33, ga: 1.33, xgf: 1.27, xga: 1.27, shots: 12.8 },
  CL:  { gf: 1.45, ga: 1.45, xgf: 1.40, xga: 1.40, shots: 13.5 },
  UEL: { gf: 1.40, ga: 1.40, xgf: 1.35, xga: 1.35, shots: 13.0 },
};

const MOTIVATION_MULT: Record<string, number> = { normal: 1.00, elevated: 1.05, must_win: 1.10 };
const SEVERITY_LABELS: Record<number, string> = { 1: 'Rotation', 2: 'Useful starter', 3: 'Significant', 4: 'Key player', 5: 'Transformational' };
const MAX_GOALS = 10;

function makeDefaultTeam(league: string): TeamInputs {
  const d = LEAGUE_DEFAULTS[league] || LEAGUE_DEFAULTS.PL;
  return {
    goalsFor: d.gf.toFixed(2), goalsAgainst: d.ga.toFixed(2),
    xgFor: d.xgf.toFixed(2), xgAgainst: d.xga.toFixed(2),
    matchesPlayed: '19', penaltiesReceived: '3', penaltiesConceded: '3',
    avgRedCardsFor: '0.05', avgRedCardsAgainst: '0.05',
    shotsFor: d.shots.toFixed(1), shotsAgainst: d.shots.toFixed(1),
    openPlayXG: '1.00', setPieceXG: '0.25',
    psxgFor: '1.30', psxgAgainst: '1.30',
    last6XGFor: '1.30', last6XGAgainst: '1.30', last6XGPerShot: '0.100',
    motivation: 'normal', absenceAtk: 1, absenceDef: 1,
  };
}

function makeDefaultAdvanced(): AdvancedSettings {
  return { drawInflation: '1.10', rho: '0.03', formWeight: '0.35', psxgWeight: '0.15', varianceSensitivity: '0.10', absenceWeight: '0.03', negBin: false };
}

// ===== MATH =====
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function logFactorial(n: number) { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; }
function poissonPMF(k: number, lambda: number) {
  if (lambda <= 0) return k === 0 ? 1.0 : 0.0;
  return Math.exp(-lambda + k * Math.log(lambda) - logFactorial(k));
}
function v(s: string) { const n = parseFloat(s); return isNaN(n) ? 0 : n; }

// ===== COLLAPSIBLE SECTION COMPONENT =====
function Section({ title, badge, defaultOpen, children }: { title: string; badge?: string; badgeClass?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className={`bg-slate-800 rounded-xl border transition-all duration-200 ${open ? 'border-slate-600 shadow-lg shadow-black/10' : 'border-slate-700/80 hover:border-slate-600'}`}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center px-4 sm:px-5 py-3.5 sm:py-4 text-left">
        <span className={`inline-flex items-center justify-center w-5 h-5 mr-3 text-[10px] rounded bg-red-500/10 text-red-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>&#9656;</span>
        <span className="flex-1 font-semibold text-white text-sm sm:text-base">{title}</span>
        {badge && <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-700/50 text-slate-400">{badge}</span>}
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-[1200px]' : 'max-h-0'}`}>
        <div className="px-4 sm:px-5 pb-4 sm:pb-5">{children}</div>
      </div>
    </div>
  );
}

// ===== FIELD COMPONENT =====
function Field({ label, value, onChange, step, min, placeholder, type = 'number' }: {
  label: string; value: string; onChange: (v: string) => void; step?: string; min?: string; placeholder?: string; type?: string;
}) {
  return (
    <div className="mb-3">
      <label className="block text-xs sm:text-sm text-slate-400 mb-1.5">{label}</label>
      <input
        type={type} step={step} min={min} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => (e.target as HTMLInputElement).select()}
        className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2.5 text-white font-mono text-sm sm:text-base focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
      />
    </div>
  );
}

// ===== DATA SOURCES SECTION =====
function DataSourcesSection() {
  const [open, setOpen] = useState(false);
  const SourceLink = ({ href, name }: { href: string; name: string }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline font-medium">{name}</a>
  );
  return (
    <div className={`bg-slate-800/50 rounded-xl border transition-all duration-200 ${open ? 'border-slate-600' : 'border-slate-700/50 hover:border-slate-600'}`}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center px-4 sm:px-5 py-3 text-left">
        <span className={`inline-flex items-center justify-center w-5 h-5 mr-3 text-[10px] rounded bg-slate-700/50 text-slate-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>&#9656;</span>
        <span className="flex-1 font-semibold text-slate-300 text-xs sm:text-sm">Where to Find the Data</span>
      </button>
      {open && (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-5">
          {/* Core Stats */}
          <div>
            <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2 pb-1.5 border-b border-red-500/15">Core Stats</h4>
            <table className="w-full text-xs sm:text-sm">
              <thead><tr className="text-slate-500 text-[10px] uppercase tracking-wider"><th className="text-left py-1 px-1.5">Stat</th><th className="text-left py-1 px-1.5">Source</th><th className="text-left py-1 px-1.5">Where to Find</th></tr></thead>
              <tbody className="text-slate-400">
                <tr className="border-b border-slate-700/30"><td className="py-1.5 px-1.5 text-white font-medium">Goals For / Against</td><td className="py-1.5 px-1.5"><SourceLink href="https://theanalyst.com/football/stats" name="OPTA Analyst" /></td><td className="py-1.5 px-1.5 text-slate-500 text-[11px] italic">Football &gt; Stats &gt; Team stats &gt; Goals per match</td></tr>
                <tr className="border-b border-slate-700/30"><td className="py-1.5 px-1.5 text-white font-medium">xG For / Against</td><td className="py-1.5 px-1.5"><SourceLink href="https://theanalyst.com/football/stats" name="OPTA Analyst" /></td><td className="py-1.5 px-1.5 text-slate-500 text-[11px] italic">Football &gt; Stats &gt; Team stats &gt; xG per match</td></tr>
                <tr className="border-b border-slate-700/30"><td className="py-1.5 px-1.5 text-white font-medium">Penalties Received / Conceded</td><td className="py-1.5 px-1.5"><SourceLink href="https://www.transfermarkt.com" name="Transfermarkt" /></td><td className="py-1.5 px-1.5 text-slate-500 text-[11px] italic">Team page &gt; Detailed stats &gt; Penalties</td></tr>
                <tr><td className="py-1.5 px-1.5 text-white font-medium">Avg Red Cards For / Against</td><td className="py-1.5 px-1.5"><SourceLink href="https://scoreroom.com" name="Scoreroom" /></td><td className="py-1.5 px-1.5 text-slate-500 text-[11px] italic">Select league &gt; Team &gt; Cards tab</td></tr>
              </tbody>
            </table>
          </div>
          {/* xG Quality */}
          <div>
            <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2 pb-1.5 border-b border-red-500/15">xG Quality Breakdown</h4>
            <table className="w-full text-xs sm:text-sm">
              <thead><tr className="text-slate-500 text-[10px] uppercase tracking-wider"><th className="text-left py-1 px-1.5">Stat</th><th className="text-left py-1 px-1.5">Source</th><th className="text-left py-1 px-1.5">Where to Find</th></tr></thead>
              <tbody className="text-slate-400">
                <tr className="border-b border-slate-700/30"><td className="py-1.5 px-1.5 text-white font-medium">Shots For / Against</td><td className="py-1.5 px-1.5"><SourceLink href="https://fbref.com" name="FBref" /></td><td className="py-1.5 px-1.5 text-slate-500 text-[11px] italic">Team page &gt; Shooting &gt; Sh/90</td></tr>
                <tr className="border-b border-slate-700/30"><td className="py-1.5 px-1.5 text-white font-medium">Open Play xG</td><td className="py-1.5 px-1.5"><SourceLink href="https://theanalyst.com/football/stats" name="OPTA Analyst" /></td><td className="py-1.5 px-1.5 text-slate-500 text-[11px] italic">Team stats &gt; total xG minus set piece xG</td></tr>
                <tr className="border-b border-slate-700/30"><td className="py-1.5 px-1.5 text-white font-medium">Set Piece xG</td><td className="py-1.5 px-1.5"><SourceLink href="https://theanalyst.com/football/stats" name="OPTA Analyst" /></td><td className="py-1.5 px-1.5 text-slate-500 text-[11px] italic">Team stats &gt; Dead ball xG</td></tr>
                <tr className="border-b border-slate-700/30"><td className="py-1.5 px-1.5 text-white font-medium">PSxG For / Against</td><td className="py-1.5 px-1.5"><SourceLink href="https://fbref.com" name="FBref" /></td><td className="py-1.5 px-1.5 text-slate-500 text-[11px] italic">Goalkeeping &gt; Advanced &gt; PSxG</td></tr>
                <tr className="border-b border-slate-700/30"><td className="py-1.5 px-1.5 text-white font-medium">Danger Poss. Lost (LOS)</td><td className="py-1.5 px-1.5"><SourceLink href="https://markstats.club" name="MarkStats" /></td><td className="py-1.5 px-1.5 text-slate-500 text-[11px] italic">Select league &gt; Team &gt; LOS</td></tr>
                <tr><td className="py-1.5 px-1.5 text-white font-medium">Open-play Poss. Lost (OLOS)</td><td className="py-1.5 px-1.5"><SourceLink href="https://markstats.club" name="MarkStats" /></td><td className="py-1.5 px-1.5 text-slate-500 text-[11px] italic">Select league &gt; Team &gt; OLOS</td></tr>
              </tbody>
            </table>
          </div>
          {/* Form Data */}
          <div>
            <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2 pb-1.5 border-b border-red-500/15">Form Data</h4>
            <table className="w-full text-xs sm:text-sm">
              <thead><tr className="text-slate-500 text-[10px] uppercase tracking-wider"><th className="text-left py-1 px-1.5">Stat</th><th className="text-left py-1 px-1.5">Source</th><th className="text-left py-1 px-1.5">Where to Find</th></tr></thead>
              <tbody className="text-slate-400">
                <tr className="border-b border-slate-700/30"><td className="py-1.5 px-1.5 text-white font-medium">Last 6 xG For / Against</td><td className="py-1.5 px-1.5"><SourceLink href="https://theanalyst.com/football/stats" name="OPTA Analyst" /></td><td className="py-1.5 px-1.5 text-slate-500 text-[11px] italic">Match-by-match xG &gt; sum last 6 &gt; divide by 6</td></tr>
                <tr><td className="py-1.5 px-1.5 text-white font-medium">Last 6 xG / Shot</td><td className="py-1.5 px-1.5"><SourceLink href="https://theanalyst.com/football/stats" name="OPTA Analyst" /></td><td className="py-1.5 px-1.5 text-slate-500 text-[11px] italic">Last 6 matches &gt; total xG / total shots</td></tr>
              </tbody>
            </table>
          </div>
          {/* Context */}
          <div>
            <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2 pb-1.5 border-b border-red-500/15">Context & Adjustments</h4>
            <table className="w-full text-xs sm:text-sm">
              <thead><tr className="text-slate-500 text-[10px] uppercase tracking-wider"><th className="text-left py-1 px-1.5">Stat</th><th className="text-left py-1 px-1.5">Source</th><th className="text-left py-1 px-1.5">Where to Find</th></tr></thead>
              <tbody className="text-slate-400">
                <tr className="border-b border-slate-700/30"><td className="py-1.5 px-1.5 text-white font-medium">Motivation</td><td className="py-1.5 px-1.5 text-slate-400">Subjective</td><td className="py-1.5 px-1.5 text-slate-500 text-[11px] italic">Normal / Elevated (derbies) / Must-Win (relegation)</td></tr>
                <tr><td className="py-1.5 px-1.5 text-white font-medium">Absence Severity</td><td className="py-1.5 px-1.5 text-slate-400">Subjective</td><td className="py-1.5 px-1.5 text-slate-500 text-[11px] italic">Check injury news, rate 1-5 for attack & defence</td></tr>
              </tbody>
            </table>
          </div>
          <div className="text-[11px] text-slate-500 italic bg-black/15 rounded-lg p-3 leading-relaxed">
            <strong className="text-slate-400 not-italic">Tip:</strong> OPTA Analyst for all goals & xG. FBref for shots & PSxG. MarkStats for LOS/OLOS. Scoreroom & Transfermarkt for cards & penalties. Motivation and absence severity are subjective.
          </div>
        </div>
      )}
    </div>
  );
}

// ===== MAIN COMPONENT =====
export default function MatchPredictorPage() {
  const [league, setLeague] = useState('PL');
  const [homeName, setHomeName] = useState('Home');
  const [awayName, setAwayName] = useState('Away');
  const [home, setHome] = useState<TeamInputs>(makeDefaultTeam('PL'));
  const [away, setAway] = useState<TeamInputs>(makeDefaultTeam('PL'));
  const [homeAdv, setHomeAdv] = useState(LEAGUES.PL.homeAdv.toFixed(2));
  const [adv, setAdv] = useState<AdvancedSettings>(makeDefaultAdvanced());
  const [result, setResult] = useState<PredictionResult | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const updateHome = useCallback((field: keyof TeamInputs, value: string | number) => {
    setHome(prev => ({ ...prev, [field]: value }));
  }, []);
  const updateAway = useCallback((field: keyof TeamInputs, value: string | number) => {
    setAway(prev => ({ ...prev, [field]: value }));
  }, []);
  const updateAdv = useCallback((field: keyof AdvancedSettings, value: string | boolean) => {
    setAdv(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleLeagueChange = useCallback((newLeague: string) => {
    setLeague(newLeague);
    setHomeAdv(LEAGUES[newLeague].homeAdv.toFixed(2));
  }, []);

  const handleReset = useCallback(() => {
    setHome(makeDefaultTeam(league));
    setAway(makeDefaultTeam(league));
    setHomeAdv(LEAGUES[league].homeAdv.toFixed(2));
    setAdv(makeDefaultAdvanced());
    setResult(null);
  }, [league]);

  // ===== CALCULATION PIPELINE =====
  const calculate = useCallback(() => {
    const lg = LEAGUES[league];
    const h = home, a = away;

    // Step 0: Penalty xG Adjustment
    function penAdjXGFor(t: TeamInputs) {
      const penXG = (v(t.penaltiesReceived) / Math.max(1, v(t.matchesPlayed))) * 0.76;
      return Math.max(0, v(t.xgFor) - penXG) + penXG * 0.50;
    }
    function penAdjXGAgainst(t: TeamInputs) {
      const penXGA = (v(t.penaltiesConceded) / Math.max(1, v(t.matchesPlayed))) * 0.76;
      return Math.max(0, v(t.xgAgainst) - penXGA) + penXGA * 0.50;
    }

    let exH = penAdjXGFor(h), exA = penAdjXGFor(a);
    let eaH = penAdjXGAgainst(h), eaA = penAdjXGAgainst(a);

    // Step 1: Red card normalisation
    const atkRedAdjH = clamp(1 - v(h.avgRedCardsFor) * 0.18 + v(h.avgRedCardsAgainst) * 0.12, 0.90, 1.10);
    const defRedAdjH = clamp(1 + v(h.avgRedCardsFor) * 0.22 - v(h.avgRedCardsAgainst) * 0.12, 0.90, 1.10);
    const atkRedAdjA = clamp(1 - v(a.avgRedCardsFor) * 0.18 + v(a.avgRedCardsAgainst) * 0.12, 0.90, 1.10);
    const defRedAdjA = clamp(1 + v(a.avgRedCardsFor) * 0.22 - v(a.avgRedCardsAgainst) * 0.12, 0.90, 1.10);

    exH *= atkRedAdjH; exA *= atkRedAdjA;
    eaH *= defRedAdjH; eaA *= defRedAdjA;

    // Step 2: Attack strength
    const atkH = exH / lg.avgXG, atkA = exA / lg.avgXG;

    // Step 3: Defence strength (80/20 blend)
    const dbH = 0.80 * eaH + 0.20 * v(h.goalsAgainst);
    const dbA = 0.80 * eaA + 0.20 * v(a.goalsAgainst);
    const avgDB = 0.80 * lg.avgXG + 0.20 * lg.avgGoals;
    const defH = dbH / avgDB, defA = dbA / avgDB;

    // Step 4: Lambda
    const ha = v(homeAdv);
    let lH = clamp(atkH * defA * lg.avgGoals * ha, 0.05, 8);
    let lA = clamp(atkA * defH * lg.avgGoals, 0.05, 8);

    // Step 5: Motivation
    lH *= (MOTIVATION_MULT[h.motivation] || 1.00);
    lA *= (MOTIVATION_MULT[a.motivation] || 1.00);
    lH = clamp(lH, 0.05, 8);
    lA = clamp(lA, 0.05, 8);

    // Step 5b: Absence severity
    const absWt = v(adv.absenceWeight);
    lH *= (1 - ((h.absenceAtk - 1) * absWt));
    lA *= (1 + ((h.absenceDef - 1) * absWt));
    lA *= (1 - ((a.absenceAtk - 1) * absWt));
    lH *= (1 + ((a.absenceDef - 1) * absWt));
    lH = clamp(lH, 0.05, 8);
    lA = clamp(lA, 0.05, 8);

    // Build absence notes
    const absenceNotes: AbsenceNote[] = [];
    if (h.absenceAtk > 1) absenceNotes.push({ team: 'home', type: 'attack', severity: h.absenceAtk, pct: ((h.absenceAtk - 1) * absWt * 100).toFixed(1) });
    if (h.absenceDef > 1) absenceNotes.push({ team: 'home', type: 'defence', severity: h.absenceDef, pct: ((h.absenceDef - 1) * absWt * 100).toFixed(1) });
    if (a.absenceAtk > 1) absenceNotes.push({ team: 'away', type: 'attack', severity: a.absenceAtk, pct: ((a.absenceAtk - 1) * absWt * 100).toFixed(1) });
    if (a.absenceDef > 1) absenceNotes.push({ team: 'away', type: 'defence', severity: a.absenceDef, pct: ((a.absenceDef - 1) * absWt * 100).toFixed(1) });

    // Step 6: Poisson marginals
    const hP: number[] = [], aP: number[] = [];
    for (let k = 0; k <= MAX_GOALS; k++) { hP[k] = poissonPMF(k, lH); aP[k] = poissonPMF(k, lA); }

    // Step 7: Dixon-Coles correction
    const rho = v(adv.rho);
    const matrix: number[][] = [];
    for (let i = 0; i <= MAX_GOALS; i++) {
      matrix[i] = [];
      for (let j = 0; j <= MAX_GOALS; j++) {
        let p = hP[i] * aP[j];
        if (i === 0 && j === 0) p *= Math.max(0, 1 - lH * lA * rho);
        else if (i === 1 && j === 0) p *= Math.max(0, 1 + lA * rho);
        else if (i === 0 && j === 1) p *= Math.max(0, 1 + lH * rho);
        else if (i === 1 && j === 1) p *= Math.max(0, 1 - rho);
        matrix[i][j] = p;
      }
    }

    // Step 8: Aggregate 1X2
    let pH = 0, pD = 0, pA = 0;
    for (let i = 0; i <= MAX_GOALS; i++)
      for (let j = 0; j <= MAX_GOALS; j++) {
        if (i > j) pH += matrix[i][j];
        else if (i === j) pD += matrix[i][j];
        else pA += matrix[i][j];
      }

    // Step 9: Draw inflation
    pD *= v(adv.drawInflation);
    const tot = pH + pD + pA;
    pH /= tot; pD /= tot; pA /= tot;

    setResult({ lambdaHome: lH, lambdaAway: lA, probHome: pH, probDraw: pD, probAway: pA, absenceNotes });
  }, [league, home, away, homeAdv, adv]);

  // Scroll to results after calculation
  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [result]);

  // ===== TEAM INPUT FIELDS RENDERER =====
  const renderTeamFields = (team: TeamInputs, update: (field: keyof TeamInputs, value: string | number) => void, side: 'home' | 'away') => {
    const color = side === 'home' ? 'text-emerald-400' : 'text-red-400';
    const borderColor = side === 'home' ? 'border-emerald-500/25' : 'border-red-500/25';
    return (
      <div>
        <div className={`text-xs uppercase tracking-widest font-bold ${color} pb-2 mb-3 border-b ${borderColor}`}>
          {side === 'home' ? 'Home' : 'Away'}
        </div>
        <Field label="Goals For / match" value={team.goalsFor} onChange={v => update('goalsFor', v)} step="0.01" min="0" />
        <Field label="Goals Against / match" value={team.goalsAgainst} onChange={v => update('goalsAgainst', v)} step="0.01" min="0" />
        <Field label="xG For / match" value={team.xgFor} onChange={v => update('xgFor', v)} step="0.01" min="0" />
        <Field label="xG Against / match" value={team.xgAgainst} onChange={v => update('xgAgainst', v)} step="0.01" min="0" />
        <Field label="Matches Played" value={team.matchesPlayed} onChange={v => update('matchesPlayed', v)} step="1" min="1" />
        <Field label="Penalties Received (season)" value={team.penaltiesReceived} onChange={v => update('penaltiesReceived', v)} step="1" min="0" />
        <Field label="Penalties Conceded (season)" value={team.penaltiesConceded} onChange={v => update('penaltiesConceded', v)} step="1" min="0" />
        <Field label="Avg Red Cards For / match" value={team.avgRedCardsFor} onChange={v => update('avgRedCardsFor', v)} step="0.01" min="0" />
        <Field label="Avg Red Cards Against / match" value={team.avgRedCardsAgainst} onChange={v => update('avgRedCardsAgainst', v)} step="0.01" min="0" />
      </div>
    );
  };

  const renderXGFields = (team: TeamInputs, update: (field: keyof TeamInputs, value: string | number) => void, side: 'home' | 'away') => {
    const color = side === 'home' ? 'text-emerald-400' : 'text-red-400';
    const borderColor = side === 'home' ? 'border-emerald-500/25' : 'border-red-500/25';
    return (
      <div>
        <div className={`text-xs uppercase tracking-widest font-bold ${color} pb-2 mb-3 border-b ${borderColor}`}>
          {side === 'home' ? 'Home' : 'Away'}
        </div>
        <Field label="Shots For / match" value={team.shotsFor} onChange={v => update('shotsFor', v)} step="0.1" min="0" />
        <Field label="Shots Against / match" value={team.shotsAgainst} onChange={v => update('shotsAgainst', v)} step="0.1" min="0" />
        <Field label="Open Play xG / match" value={team.openPlayXG} onChange={v => update('openPlayXG', v)} step="0.01" min="0" />
        <Field label="Set Piece xG / match" value={team.setPieceXG} onChange={v => update('setPieceXG', v)} step="0.01" min="0" />
        <Field label="PSxG For / match" value={team.psxgFor} onChange={v => update('psxgFor', v)} step="0.01" min="0" />
        <Field label="PSxG Against / match" value={team.psxgAgainst} onChange={v => update('psxgAgainst', v)} step="0.01" min="0" />
      </div>
    );
  };

  const renderFormFields = (team: TeamInputs, update: (field: keyof TeamInputs, value: string | number) => void, side: 'home' | 'away') => {
    const color = side === 'home' ? 'text-emerald-400' : 'text-red-400';
    const borderColor = side === 'home' ? 'border-emerald-500/25' : 'border-red-500/25';
    return (
      <div>
        <div className={`text-xs uppercase tracking-widest font-bold ${color} pb-2 mb-3 border-b ${borderColor}`}>
          {side === 'home' ? 'Home' : 'Away'}
        </div>
        <Field label="Last 6 xG For / match" value={team.last6XGFor} onChange={v => update('last6XGFor', v)} step="0.01" min="0" />
        <Field label="Last 6 xG Against / match" value={team.last6XGAgainst} onChange={v => update('last6XGAgainst', v)} step="0.01" min="0" />
        <Field label="Last 6 xG / Shot" value={team.last6XGPerShot} onChange={v => update('last6XGPerShot', v)} step="0.001" min="0" />
      </div>
    );
  };

  const renderContextFields = (team: TeamInputs, update: (field: keyof TeamInputs, value: string | number) => void, side: 'home' | 'away') => {
    const color = side === 'home' ? 'text-emerald-400' : 'text-red-400';
    const borderColor = side === 'home' ? 'border-emerald-500/25' : 'border-red-500/25';
    return (
      <div>
        <div className={`text-xs uppercase tracking-widest font-bold ${color} pb-2 mb-3 border-b ${borderColor}`}>
          {side === 'home' ? 'Home' : 'Away'}
        </div>
        <div className="mb-3">
          <label className="block text-xs sm:text-sm text-slate-400 mb-1.5">Motivation</label>
          <select
            value={team.motivation}
            onChange={(e) => update('motivation', e.target.value)}
            className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm sm:text-base focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          >
            <option value="normal">Normal</option>
            <option value="elevated">Elevated</option>
            <option value="must_win">Must-Win</option>
          </select>
        </div>
        {/* Absence Severity */}
        <div className="mt-4 pt-3 border-t border-slate-700/40">
          <p className={`text-xs font-bold uppercase tracking-wider ${color} mb-3`}>Absence Severity</p>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs sm:text-sm text-slate-400">Attack Absence</label>
                <span className="text-sm font-bold text-white font-mono w-5 text-center">{team.absenceAtk}</span>
              </div>
              <input
                type="range" min="1" max="5" step="1" value={team.absenceAtk}
                onChange={(e) => update('absenceAtk', parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-red-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(239,68,68,0.4)] [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-red-500 [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:cursor-pointer"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs sm:text-sm text-slate-400">Defence Absence</label>
                <span className="text-sm font-bold text-white font-mono w-5 text-center">{team.absenceDef}</span>
              </div>
              <input
                type="range" min="1" max="5" step="1" value={team.absenceDef}
                onChange={(e) => update('absenceDef', parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-red-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(239,68,68,0.4)] [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-red-500 [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:cursor-pointer"
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-500 italic mt-2">1 = Rotation · 2 = Useful starter · 3 = Significant · 4 = Key player · 5 = Transformational</p>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="mb-6 sm:mb-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-1 tracking-wider">
          Match Model
        </h1>
        <p className="text-slate-400 text-xs sm:text-sm uppercase tracking-widest">Soccer Match Prediction</p>
      </div>

      {/* League Selector + Reset */}
      <div className="flex items-center justify-center gap-3 sm:gap-4 mb-6">
        <label className="text-xs sm:text-sm text-slate-400 font-semibold uppercase tracking-wider">League</label>
        <select
          value={league}
          onChange={(e) => handleLeagueChange(e.target.value)}
          className="bg-slate-800 text-white border border-slate-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
        >
          {Object.entries(LEAGUES).map(([key, lg]) => (
            <option key={key} value={key}>{lg.name}</option>
          ))}
        </select>
        <button
          onClick={handleReset}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg text-xs sm:text-sm font-medium transition-all duration-200"
        >
          Reset
        </button>
      </div>

      {/* Team Names */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-5 mb-6">
        <input
          type="text" value={homeName} onChange={(e) => setHomeName(e.target.value)} placeholder="Home Team"
          className="bg-transparent border-b-2 border-slate-600 focus:border-emerald-400 text-emerald-400 text-xl sm:text-2xl font-bold text-center py-2 px-4 w-full sm:w-72 outline-none transition-colors"
        />
        <span className="text-slate-500 font-extrabold tracking-widest text-sm">VS</span>
        <input
          type="text" value={awayName} onChange={(e) => setAwayName(e.target.value)} placeholder="Away Team"
          className="bg-transparent border-b-2 border-slate-600 focus:border-red-400 text-red-400 text-xl sm:text-2xl font-bold text-center py-2 px-4 w-full sm:w-72 outline-none transition-colors"
        />
      </div>

      {/* Sections */}
      <div className="space-y-3">
        <Section title="Core Stats" defaultOpen={true}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {renderTeamFields(home, updateHome, 'home')}
            {renderTeamFields(away, updateAway, 'away')}
          </div>
        </Section>

        <Section title="xG Quality Breakdown">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {renderXGFields(home, updateHome, 'home')}
            {renderXGFields(away, updateAway, 'away')}
          </div>
        </Section>

        <Section title="Form Data">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {renderFormFields(home, updateHome, 'home')}
            {renderFormFields(away, updateAway, 'away')}
          </div>
        </Section>

        <Section title="Context & Adjustments">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {renderContextFields(home, updateHome, 'home')}
            {renderContextFields(away, updateAway, 'away')}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-700/40 flex items-center justify-center gap-3">
            <label className="text-xs sm:text-sm text-slate-400 font-medium">Home Advantage Factor</label>
            <input
              type="number" step="0.01" min="0.80" max="1.40" value={homeAdv}
              onChange={(e) => setHomeAdv(e.target.value)}
              className="w-20 bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono text-sm text-center focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>
        </Section>

        <Section title="Advanced Settings">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Draw Inflation</label>
              <input type="number" step="0.01" min="0.80" max="1.30" value={adv.drawInflation} onChange={(e) => updateAdv('drawInflation', e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Dixon-Coles rho</label>
              <input type="number" step="0.001" min="-0.10" max="0.20" value={adv.rho} onChange={(e) => updateAdv('rho', e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Form Weight</label>
              <input type="number" step="0.01" min="0" max="1" value={adv.formWeight} onChange={(e) => updateAdv('formWeight', e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">PSxG Weight</label>
              <input type="number" step="0.01" min="0" max="1" value={adv.psxgWeight} onChange={(e) => updateAdv('psxgWeight', e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Variance Sensitivity</label>
              <input type="number" step="0.01" min="0.01" max="1" value={adv.varianceSensitivity} onChange={(e) => updateAdv('varianceSensitivity', e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Absence Weight</label>
              <input type="number" step="0.005" min="0" max="0.10" value={adv.absenceWeight} onChange={(e) => updateAdv('absenceWeight', e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4 pt-3 border-t border-slate-700/40">
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={adv.negBin} onChange={(e) => updateAdv('negBin', e.target.checked)} className="sr-only peer" />
              <div className="w-10 h-5 bg-slate-600 rounded-full peer peer-checked:bg-red-500 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
            </label>
            <span className="text-xs sm:text-sm text-slate-400">Use Quality-Adjusted Negative Binomial (off = standard Poisson)</span>
          </div>
        </Section>
      </div>

      {/* Calculate Button */}
      <div className="text-center my-8">
        <button
          onClick={calculate}
          className="bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white font-bold text-sm sm:text-base uppercase tracking-widest px-12 sm:px-16 py-4 rounded-xl shadow-lg shadow-red-500/25 hover:shadow-red-500/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
        >
          Calculate Prediction
        </button>
      </div>

      {/* Results */}
      {result && (
        <div ref={resultRef} className="bg-slate-800 rounded-xl border border-slate-600 p-5 sm:p-8 animate-in fade-in slide-in-from-bottom-3 duration-400">
          {/* Title */}
          <p className="text-center text-slate-400 text-sm mb-6 tracking-wide">
            <span className="text-emerald-400 font-bold">{homeName}</span> vs{' '}
            <span className="text-red-400 font-bold">{awayName}</span> — Prediction
          </p>

          {/* Lambda Display */}
          <div className="flex justify-center gap-6 sm:gap-12 mb-8">
            <div className="text-center bg-slate-900/50 border border-slate-700 rounded-xl px-8 sm:px-12 py-5">
              <span className="block text-[10px] text-slate-400 uppercase tracking-widest font-semibold mb-2">Home &lambda;</span>
              <span className="text-3xl sm:text-4xl font-extrabold text-emerald-400 font-mono">{result.lambdaHome.toFixed(2)}</span>
            </div>
            <div className="text-center bg-slate-900/50 border border-slate-700 rounded-xl px-8 sm:px-12 py-5">
              <span className="block text-[10px] text-slate-400 uppercase tracking-widest font-semibold mb-2">Away &lambda;</span>
              <span className="text-3xl sm:text-4xl font-extrabold text-red-400 font-mono">{result.lambdaAway.toFixed(2)}</span>
            </div>
          </div>

          {/* Probability Bar */}
          <p className="text-center text-xs text-slate-400 uppercase tracking-widest font-semibold mb-3">Match Result Probabilities</p>
          <div className="flex rounded-xl overflow-hidden h-[72px] mb-2">
            <div className="flex flex-col items-center justify-center bg-gradient-to-br from-green-700 to-green-600" style={{ flex: result.probHome }}>
              <span className="text-[10px] font-bold uppercase tracking-wide text-white/90">{homeName}</span>
              <span className="text-lg sm:text-xl font-extrabold text-white">{(result.probHome * 100).toFixed(1)}%</span>
            </div>
            <div className="flex flex-col items-center justify-center bg-gradient-to-br from-amber-600 to-amber-500" style={{ flex: result.probDraw }}>
              <span className="text-[10px] font-bold uppercase tracking-wide text-white/90">Draw</span>
              <span className="text-lg sm:text-xl font-extrabold text-white">{(result.probDraw * 100).toFixed(1)}%</span>
            </div>
            <div className="flex flex-col items-center justify-center bg-gradient-to-br from-red-700 to-red-600" style={{ flex: result.probAway }}>
              <span className="text-[10px] font-bold uppercase tracking-wide text-white/90">{awayName}</span>
              <span className="text-lg sm:text-xl font-extrabold text-white">{(result.probAway * 100).toFixed(1)}%</span>
            </div>
          </div>

          {/* Fair Odds */}
          <div className="flex mb-6">
            <div className="flex flex-col items-center py-2" style={{ flex: result.probHome }}>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Fair Odds</span>
              <span className="text-base sm:text-lg font-bold font-mono text-yellow-400">{(1 / result.probHome).toFixed(2)}</span>
            </div>
            <div className="flex flex-col items-center py-2" style={{ flex: result.probDraw }}>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Fair Odds</span>
              <span className="text-base sm:text-lg font-bold font-mono text-yellow-400">{(1 / result.probDraw).toFixed(2)}</span>
            </div>
            <div className="flex flex-col items-center py-2" style={{ flex: result.probAway }}>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Fair Odds</span>
              <span className="text-base sm:text-lg font-bold font-mono text-yellow-400">{(1 / result.probAway).toFixed(2)}</span>
            </div>
          </div>

          {/* Absence Notes */}
          {result.absenceNotes.length > 0 && (
            <div className="bg-red-500/5 border border-red-500/15 rounded-lg p-3 sm:p-4">
              {result.absenceNotes.map((n, i) => (
                <p key={i} className="text-sm text-amber-400/80 py-0.5">
                  <span className={`font-bold ${n.team === 'home' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {n.team === 'home' ? homeName : awayName}
                  </span>{' '}
                  {n.type} absence (lvl {n.severity} — {SEVERITY_LABELS[n.severity]}) {n.type === 'attack' ? 'reduces their attack' : 'weakens their defence'} by {n.pct}%
                </p>
              ))}
            </div>
          )}

          <p className="text-center text-slate-500 text-xs italic mt-5 pt-4 border-t border-slate-700/50">
            Scoreline heatmap, full markets, xG quality, form weighting, NegBin — Phases 4-8
          </p>
        </div>
      )}

      {/* Data Sources */}
      <div className="mt-6">
        <DataSourcesSection />
      </div>
    </div>
  );
}

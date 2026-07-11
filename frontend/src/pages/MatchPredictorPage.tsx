import { useState, useCallback, useRef, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import PaywallOverlay from '../components/PaywallOverlay';

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
  spDiscount: string;
  qualityWeight: string;
  absenceWeight: string;
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
  calcLog: string[];
}

// ===== LEAGUE CONSTANTS =====
// avgGoalsPerTeam + homeAwayRatio replace the old flat `homeAdv` multiplier
// (see calculate() Step 4). homeAwayRatio = (league-average home goals) /
// (league-average away goals) for a league-average matchup; the pipeline
// derives symmetric home/away multipliers from it so the expected match
// total is preserved regardless of how strong the ratio is.
//
// premier_league / la_liga / serie_a / bundesliga / ligue_1 values are
// 2025/26 full-season empirical (avg goals per team per match, home/away
// goals ratio), lightly shrunk toward the cross-league mean.
//
// TODO: Champions League and Europa League are NOT yet empirically
// calibrated — avgGoalsPerTeam reuses the old avgXG figure and
// homeAwayRatio reuses the old flat homeAdv value (r = h), which only
// preserves their previous home:away SPLIT, not a real fitted ratio.
// Needs a proper pass once we have full-season UCL/UEL data.
const LEAGUES: Record<string, { name: string; avgGoals: number; avgXG: number; avgShotsPerGame: number; avgGoalsPerTeam: number; homeAwayRatio: number }> = {
  PL:  { name: 'Premier League',   avgGoals: 1.43, avgXG: 1.35, avgShotsPerGame: 13.2, avgGoalsPerTeam: 1.375, homeAwayRatio: 1.25 },
  BL:  { name: 'Bundesliga',       avgGoals: 1.50, avgXG: 1.45, avgShotsPerGame: 14.1, avgGoalsPerTeam: 1.620, homeAwayRatio: 1.22 },
  LL:  { name: 'La Liga',          avgGoals: 1.30, avgXG: 1.25, avgShotsPerGame: 12.4, avgGoalsPerTeam: 1.345, homeAwayRatio: 1.36 },
  SA:  { name: 'Serie A',          avgGoals: 1.32, avgXG: 1.26, avgShotsPerGame: 13.0, avgGoalsPerTeam: 1.215, homeAwayRatio: 1.15 },
  L1:  { name: 'Ligue 1',          avgGoals: 1.33, avgXG: 1.27, avgShotsPerGame: 12.8, avgGoalsPerTeam: 1.415, homeAwayRatio: 1.27 },
  CL:  { name: 'Champions League', avgGoals: 1.45, avgXG: 1.40, avgShotsPerGame: 13.5, avgGoalsPerTeam: 1.40 /* TODO: uncalibrated, = old avgXG */, homeAwayRatio: 1.18 /* TODO: uncalibrated, r = old homeAdv */ },
  UEL: { name: 'Europa League',    avgGoals: 1.40, avgXG: 1.35, avgShotsPerGame: 13.0, avgGoalsPerTeam: 1.35 /* TODO: uncalibrated, = old avgXG */, homeAwayRatio: 1.18 /* TODO: uncalibrated, r = old homeAdv */ },
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
    last6XGFor: '1.30', last6XGAgainst: '1.30', last6XGPerShot: '0.100',
    motivation: 'normal', absenceAtk: 1, absenceDef: 1,
  };
}

function makeDefaultAdvanced(): AdvancedSettings {
  return { drawInflation: '1.08', rho: '-0.03', formWeight: '0.25', spDiscount: '0.85', qualityWeight: '0.15', absenceWeight: '0.03' };
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
            <strong className="text-slate-400 not-italic">Tip:</strong> OPTA Analyst for all goals & xG. FBref for shots. MarkStats for LOS/OLOS. Scoreroom & Transfermarkt for cards & penalties. Motivation and absence severity are subjective.
          </div>
        </div>
      )}
    </div>
  );
}

// ===== MAIN COMPONENT =====
export default function MatchPredictorPage() {
  const { isSubscribed, refreshUser } = useAuth();
  const [searchParams] = useSearchParams();
  const [league, setLeague] = useState('PL');
  const [homeName, setHomeName] = useState('Home');
  const [awayName, setAwayName] = useState('Away');
  const [home, setHome] = useState<TeamInputs>(makeDefaultTeam('PL'));
  const [away, setAway] = useState<TeamInputs>(makeDefaultTeam('PL'));
  const [adv, setAdv] = useState<AdvancedSettings>(makeDefaultAdvanced());
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const pendingResult = useRef<PredictionResult | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // After successful Stripe checkout, refresh user subscription status
  useEffect(() => {
    if (searchParams.get('checkout') === 'success') {
      refreshUser().then(() => {
        // If there's a pending result and user is now subscribed, show it
        if (pendingResult.current) {
          setResult(pendingResult.current);
          setShowPaywall(false);
          pendingResult.current = null;
        }
      });
    }
  }, [searchParams, refreshUser]);

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
  }, []);

  const handleReset = useCallback(() => {
    setHome(makeDefaultTeam(league));
    setAway(makeDefaultTeam(league));
    setAdv(makeDefaultAdvanced());
    setResult(null);
  }, [league]);

  // ===== CALCULATION PIPELINE =====
  const calculate = useCallback(() => {
    const lg = LEAGUES[league];
    const h = home, a = away;
    const log: string[] = [];

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
    log.push(`Step 0 — Pen xG Adj: H_atk=${exH.toFixed(3)} A_atk=${exA.toFixed(3)} H_def=${eaH.toFixed(3)} A_def=${eaA.toFixed(3)}`);

    // Step 0b: Set Piece xG Discount (attack side only)
    const spDiscount = v(adv.spDiscount);
    function applySpDiscount(adjXG: number, openPlay: number, setPiece: number): [number, boolean] {
      if (openPlay > 0 || setPiece > 0) {
        const total = openPlay + setPiece;
        if (total > 0) {
          const discounted = openPlay + (setPiece * spDiscount);
          return [adjXG * (discounted / total), true];
        }
      }
      return [adjXG, false];
    }
    const [exH2, spAppliedH] = applySpDiscount(exH, v(h.openPlayXG), v(h.setPieceXG));
    const [exA2, spAppliedA] = applySpDiscount(exA, v(a.openPlayXG), v(a.setPieceXG));
    exH = exH2; exA = exA2;
    if (spAppliedH || spAppliedA) {
      log.push(`Step 0b — SP Discount (${spDiscount}): H_atk=${exH.toFixed(3)} A_atk=${exA.toFixed(3)}`);
    } else {
      log.push(`Step 0b — SP Discount: SKIPPED — no component breakdown`);
    }

    // Step 1: Red card normalisation
    const atkRedAdjH = clamp(1 - v(h.avgRedCardsFor) * 0.18 + v(h.avgRedCardsAgainst) * 0.12, 0.90, 1.10);
    const defRedAdjH = clamp(1 + v(h.avgRedCardsFor) * 0.22 - v(h.avgRedCardsAgainst) * 0.12, 0.90, 1.10);
    const atkRedAdjA = clamp(1 - v(a.avgRedCardsFor) * 0.18 + v(a.avgRedCardsAgainst) * 0.12, 0.90, 1.10);
    const defRedAdjA = clamp(1 + v(a.avgRedCardsFor) * 0.22 - v(a.avgRedCardsAgainst) * 0.12, 0.90, 1.10);

    exH *= atkRedAdjH; exA *= atkRedAdjA;
    eaH *= defRedAdjH; eaA *= defRedAdjA;
    log.push(`Step 1 — Red Card Norm: H_atkAdj=${atkRedAdjH.toFixed(3)} H_defAdj=${defRedAdjH.toFixed(3)} A_atkAdj=${atkRedAdjA.toFixed(3)} A_defAdj=${defRedAdjA.toFixed(3)}`);

    // Step 1b: xG Per Shot Quality Modifier
    const qualityWeight = v(adv.qualityWeight);
    const leagueAvgXGPerShot = lg.avgXG / lg.avgShotsPerGame;
    const shotsForH = v(h.shotsFor), shotsForA = v(a.shotsFor);
    const shotsAgainstH = v(h.shotsAgainst), shotsAgainstA = v(a.shotsAgainst);

    if (shotsForH > 0 && qualityWeight > 0) {
      const xgpsH = exH / shotsForH;
      const qRatioH = xgpsH / leagueAvgXGPerShot;
      const qModH = (1 - qualityWeight) + qualityWeight * qRatioH;
      exH *= qModH;
      log.push(`Step 1b — Quality (H atk): xG/shot=${xgpsH.toFixed(4)} ratio=${qRatioH.toFixed(3)} mod=${qModH.toFixed(3)}`);
    }
    if (shotsForA > 0 && qualityWeight > 0) {
      const xgpsA = exA / shotsForA;
      const qRatioA = xgpsA / leagueAvgXGPerShot;
      const qModA = (1 - qualityWeight) + qualityWeight * qRatioA;
      exA *= qModA;
      log.push(`Step 1b — Quality (A atk): xG/shot=${xgpsA.toFixed(4)} ratio=${qRatioA.toFixed(3)} mod=${qModA.toFixed(3)}`);
    }
    if (shotsAgainstH > 0 && qualityWeight > 0) {
      const xgpsDefH = eaH / shotsAgainstH;
      const qRatioDefH = xgpsDefH / leagueAvgXGPerShot;
      const qModDefH = (1 - qualityWeight) + qualityWeight * qRatioDefH;
      eaH *= qModDefH;
      log.push(`Step 1b — Quality (H def): xG/shot=${xgpsDefH.toFixed(4)} ratio=${qRatioDefH.toFixed(3)} mod=${qModDefH.toFixed(3)}`);
    }
    if (shotsAgainstA > 0 && qualityWeight > 0) {
      const xgpsDefA = eaA / shotsAgainstA;
      const qRatioDefA = xgpsDefA / leagueAvgXGPerShot;
      const qModDefA = (1 - qualityWeight) + qualityWeight * qRatioDefA;
      eaA *= qModDefA;
      log.push(`Step 1b — Quality (A def): xG/shot=${xgpsDefA.toFixed(4)} ratio=${qRatioDefA.toFixed(3)} mod=${qModDefA.toFixed(3)}`);
    }
    if (qualityWeight === 0) log.push(`Step 1b — Quality: SKIPPED — weight is 0`);

    // Step 1c: Form Weighting (Last 6 Blend)
    const formWeight = v(adv.formWeight);
    const l6xgfH = v(h.last6XGFor), l6xgaH = v(h.last6XGAgainst);
    const l6xgfA = v(a.last6XGFor), l6xgaA = v(a.last6XGAgainst);

    let formApplied = false;
    if (formWeight > 0) {
      if (Math.abs(l6xgfH - exH) > 0.001 || Math.abs(l6xgaH - eaH) > 0.001) {
        exH = (1 - formWeight) * exH + formWeight * l6xgfH;
        eaH = (1 - formWeight) * eaH + formWeight * l6xgaH;
        formApplied = true;
      }
      if (Math.abs(l6xgfA - exA) > 0.001 || Math.abs(l6xgaA - eaA) > 0.001) {
        exA = (1 - formWeight) * exA + formWeight * l6xgfA;
        eaA = (1 - formWeight) * eaA + formWeight * l6xgaA;
        formApplied = true;
      }
    }
    if (formApplied) {
      log.push(`Step 1c — Form (${formWeight}): H_atk=${exH.toFixed(3)} H_def=${eaH.toFixed(3)} A_atk=${exA.toFixed(3)} A_def=${eaA.toFixed(3)}`);
    } else {
      log.push(`Step 1c — Form: SKIPPED — values match season data`);
    }

    // Step 2: Attack strength
    const atkH = exH / lg.avgXG, atkA = exA / lg.avgXG;
    log.push(`Step 2 — Attack Strength: H=${atkH.toFixed(3)} A=${atkA.toFixed(3)}`);

    // Step 3: Defence strength (80/20 blend)
    const dbH = 0.80 * eaH + 0.20 * v(h.goalsAgainst);
    const dbA = 0.80 * eaA + 0.20 * v(a.goalsAgainst);
    const avgDB = 0.80 * lg.avgXG + 0.20 * lg.avgGoals;
    const defH = dbH / avgDB, defA = dbA / avgDB;
    log.push(`Step 3 — Defence Strength: H=${defH.toFixed(3)} A=${defA.toFixed(3)}`);

    // Step 4: Lambda (base rate = league avg goals per team, home advantage
    // split symmetrically so the expected match total is preserved).
    //
    // The old version applied a single one-sided homeAdvantage multiplier
    // to home lambda only, leaving away lambda unscaled — that inflated
    // the expected match total by (homeAdvantage-1)/2 for every match
    // (roughly 5.5-9% with the old constants), which would have badly
    // mispriced Totals once built. Splitting the league's home/away goals
    // ratio `r` into two multipliers that sum to 2 fixes this: home is
    // boosted, away is suppressed by the same amount, and two
    // league-average teams (all strengths = 1.0) reproduce the league's
    // actual observed home/away split while landing on the league's
    // actual observed average total.
    const r = lg.homeAwayRatio;
    const homeMult = (2 * r) / (1 + r);
    const awayMult = 2 / (1 + r);
    let lH = clamp(atkH * defA * lg.avgGoalsPerTeam * homeMult, 0.05, 8);
    let lA = clamp(atkA * defH * lg.avgGoalsPerTeam * awayMult, 0.05, 8);
    log.push(`Step 4 — Lambda (raw): H=${lH.toFixed(3)} A=${lA.toFixed(3)} [r=${r.toFixed(3)} homeMult=${homeMult.toFixed(3)} awayMult=${awayMult.toFixed(3)}]`);

    // Step 5: Motivation
    lH *= (MOTIVATION_MULT[h.motivation] || 1.00);
    lA *= (MOTIVATION_MULT[a.motivation] || 1.00);
    lH = clamp(lH, 0.05, 8);
    lA = clamp(lA, 0.05, 8);
    if (h.motivation !== 'normal' || a.motivation !== 'normal') {
      log.push(`Step 5 — Motivation: H=${h.motivation}(${MOTIVATION_MULT[h.motivation]}) A=${a.motivation}(${MOTIVATION_MULT[a.motivation]}) → λH=${lH.toFixed(3)} λA=${lA.toFixed(3)}`);
    } else {
      log.push(`Step 5 — Motivation: SKIPPED — both normal`);
    }

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
    if (absenceNotes.length > 0) {
      log.push(`Step 5b — Absence: λH=${lH.toFixed(3)} λA=${lA.toFixed(3)}`);
    } else {
      log.push(`Step 5b — Absence: SKIPPED — all sliders at 1`);
    }

    // Step 6: Poisson marginals
    const hP: number[] = [], aP: number[] = [];
    for (let k = 0; k <= MAX_GOALS; k++) { hP[k] = poissonPMF(k, lH); aP[k] = poissonPMF(k, lA); }
    log.push(`Step 6 — Poisson: λH=${lH.toFixed(3)} λA=${lA.toFixed(3)}`);

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
    log.push(`Step 7 — Dixon-Coles: ρ=${rho}`);

    // Step 8: Aggregate 1X2
    let pH = 0, pD = 0, pA = 0;
    for (let i = 0; i <= MAX_GOALS; i++)
      for (let j = 0; j <= MAX_GOALS; j++) {
        if (i > j) pH += matrix[i][j];
        else if (i === j) pD += matrix[i][j];
        else pA += matrix[i][j];
      }
    log.push(`Step 8 — Raw 1X2: H=${(pH*100).toFixed(1)}% D=${(pD*100).toFixed(1)}% A=${(pA*100).toFixed(1)}%`);

    // Step 9: Draw inflation
    pD *= v(adv.drawInflation);
    const tot = pH + pD + pA;
    pH /= tot; pD /= tot; pA /= tot;
    log.push(`Step 9 — Draw Inflation (${adv.drawInflation}): H=${(pH*100).toFixed(1)}% D=${(pD*100).toFixed(1)}% A=${(pA*100).toFixed(1)}%`);

    const computed = { lambdaHome: lH, lambdaAway: lA, probHome: pH, probDraw: pD, probAway: pA, absenceNotes, calcLog: log };
    if (isSubscribed) {
      setResult(computed);
      setShowPaywall(false);
    } else {
      pendingResult.current = computed;
      setResult(null);
      setShowPaywall(true);
    }
  }, [league, home, away, adv, isSubscribed]);

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
    <div className="max-w-7xl mx-auto">
      <Helmet>
        <title>Match Predictor — SteamWatch Dixon-Coles Model</title>
        <meta name="description" content="Generate match probability predictions using the SteamWatch Dixon-Coles adjusted Poisson model. Fair odds for 1X2, Asian Handicap, and Totals markets." />
        <link rel="canonical" href="https://www.steamwatch.io/tools/match-predictor" />
      </Helmet>
      {/* Page Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-3">
          <div className="w-1 h-10 sm:h-11 rounded-full bg-gradient-to-b from-red-400 to-red-600 flex-shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Match Model</h1>
              <span className="px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded">Beta</span>
            </div>
            <p className="text-slate-500 text-[10px] sm:text-xs mt-0.5 font-mono uppercase tracking-[0.12em]">Dixon-Coles Probability Baseline</p>
          </div>
        </div>
      </div>

      <div className="flex gap-6">
      {/* Data Sources Sidebar */}
      <aside className="hidden lg:block w-72 flex-shrink-0">
        <div className="sticky top-4 space-y-4">
          {/* Where to find data */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300 mb-3 flex items-center gap-2">
              <span className="text-amber-400">📊</span> Where to Find the Data
            </h3>

            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 mb-1">OPTA Analyst</p>
                <a href="https://theanalyst.com" target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-400 hover:text-blue-300 underline underline-offset-2">theanalyst.com</a>
                <ul className="mt-1 space-y-0.5">
                  <li className="text-[11px] text-slate-400">• Goals For / Against per match</li>
                  <li className="text-[11px] text-slate-400">• xG For / Against per match</li>
                  <li className="text-[11px] text-slate-400">• Open Play xG</li>
                  <li className="text-[11px] text-slate-400">• Set Piece xG</li>
                  <li className="text-[11px] text-slate-400">• Non-penalty xG</li>
                  <li className="text-[11px] text-slate-400">• Last 6 xG For / Against</li>
                </ul>
              </div>

              <div className="border-t border-slate-700/40 pt-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400 mb-1">Transfermarkt</p>
                <a href="https://www.transfermarkt.com" target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-400 hover:text-blue-300 underline underline-offset-2">transfermarkt.com</a>
                <ul className="mt-1 space-y-0.5">
                  <li className="text-[11px] text-slate-400">• Penalties Received (season)</li>
                  <li className="text-[11px] text-slate-400">• Penalties Conceded (season)</li>
                </ul>
              </div>

              <div className="border-t border-slate-700/40 pt-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-1">Scoreroom</p>
                <a href="https://scoreroom.com" target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-400 hover:text-blue-300 underline underline-offset-2">scoreroom.com</a>
                <ul className="mt-1 space-y-0.5">
                  <li className="text-[11px] text-slate-400">• Avg Red Cards For / match</li>
                  <li className="text-[11px] text-slate-400">• Avg Red Cards Against / match</li>
                </ul>
              </div>

              <div className="border-t border-slate-700/40 pt-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-1">FBref</p>
                <a href="https://fbref.com" target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-400 hover:text-blue-300 underline underline-offset-2">fbref.com</a>
                <ul className="mt-1 space-y-0.5">
                  <li className="text-[11px] text-slate-400">• Shots For / Against</li>
                  <li className="text-[11px] text-slate-400">• Last 6 Shots per match</li>
                </ul>
              </div>

              <div className="border-t border-slate-700/40 pt-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-purple-400 mb-1">MarkStats</p>
                <a href="https://markstats.club" target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-400 hover:text-blue-300 underline underline-offset-2">markstats.club</a>
                <ul className="mt-1 space-y-0.5">
                  <li className="text-[11px] text-slate-400">• Danger Possession Lost (LOS/OLOS)</li>
                </ul>
              </div>

              <div className="border-t border-slate-700/40 pt-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Subjective</p>
                <ul className="mt-1 space-y-0.5">
                  <li className="text-[11px] text-slate-500">• Motivation level</li>
                  <li className="text-[11px] text-slate-500">• Absence severity (attack/defence)</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Useful reference sites */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300 mb-3 flex items-center gap-2">
              <span className="text-amber-400">🔗</span> Useful Reference Sites
            </h3>
            <div className="space-y-2">
              <a href="https://theanalyst.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[11px] text-slate-400 hover:text-white transition-colors group">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span className="group-hover:underline">OPTA Analyst</span>
                <span className="text-slate-600 ml-auto">xG, goals</span>
              </a>
              <a href="https://fbref.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[11px] text-slate-400 hover:text-white transition-colors group">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                <span className="group-hover:underline">FBref</span>
                <span className="text-slate-600 ml-auto">shots, stats</span>
              </a>
              <a href="https://www.whoscored.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[11px] text-slate-400 hover:text-white transition-colors group">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                <span className="group-hover:underline">WhoScored</span>
                <span className="text-slate-600 ml-auto">ratings, form</span>
              </a>
              <a href="https://www.transfermarkt.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[11px] text-slate-400 hover:text-white transition-colors group">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                <span className="group-hover:underline">Transfermarkt</span>
                <span className="text-slate-600 ml-auto">pens, injuries</span>
              </a>
              <a href="https://scoreroom.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[11px] text-slate-400 hover:text-white transition-colors group">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                <span className="group-hover:underline">Scoreroom</span>
                <span className="text-slate-600 ml-auto">cards, discipline</span>
              </a>
              <a href="https://www.footystats.org" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[11px] text-slate-400 hover:text-white transition-colors group">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                <span className="group-hover:underline">FootyStats</span>
                <span className="text-slate-600 ml-auto">league stats</span>
              </a>
              <a href="https://www.wyscout.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[11px] text-slate-400 hover:text-white transition-colors group">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
                <span className="group-hover:underline">Wyscout</span>
                <span className="text-slate-600 ml-auto">advanced metrics</span>
              </a>
              <a href="https://markstats.club" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[11px] text-slate-400 hover:text-white transition-colors group">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                <span className="group-hover:underline">MarkStats</span>
                <span className="text-slate-600 ml-auto">possession loss</span>
              </a>
            </div>
          </div>

          {/* Telegram Feedback */}
          <a
            href="https://t.me/neilmac555"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-[#2AABEE]/10 hover:bg-[#2AABEE]/20 border border-[#2AABEE]/30 text-[#2AABEE] rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 hover:scale-[1.02]"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            Feedback / Suggestions
          </a>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0">

      {/* League Selector + Reset */}
      <div className="flex items-center justify-center gap-3 sm:gap-4 mb-6">
        <label className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">League</label>
        <select
          value={league}
          onChange={(e) => handleLeagueChange(e.target.value)}
          className="bg-slate-900/60 text-white border border-slate-700/60 rounded-md px-3 py-2 font-mono text-[12px] font-semibold focus:outline-none focus:border-blue-500 transition-colors"
        >
          {Object.entries(LEAGUES).map(([key, lg]) => (
            <option key={key} value={key}>{lg.name}</option>
          ))}
        </select>
        <button
          onClick={handleReset}
          className="px-3 py-1.5 bg-slate-900/60 hover:bg-slate-800/60 text-slate-400 hover:text-white border border-slate-700/60 rounded-md font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors"
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
          <p className="mt-4 pt-4 border-t border-slate-700/40 text-[11px] text-slate-500 italic text-center">
            Home advantage is now a fitted per-league constant (derived from each league's actual home/away goals ratio), applied symmetrically so it shifts the balance between the teams without inflating the expected match total. It's no longer a per-match setting.
          </p>
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
              <label className="block text-xs text-slate-400 mb-1">Form Weight (Last 6)</label>
              <input type="number" step="0.01" min="0" max="0.50" value={adv.formWeight} onChange={(e) => updateAdv('formWeight', e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Set Piece xG Discount</label>
              <input type="number" step="0.01" min="0.50" max="1.00" value={adv.spDiscount} onChange={(e) => updateAdv('spDiscount', e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">xG/Shot Quality Weight</label>
              <input type="number" step="0.01" min="0.00" max="0.50" value={adv.qualityWeight} onChange={(e) => updateAdv('qualityWeight', e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Absence Weight</label>
              <input type="number" step="0.005" min="0" max="0.10" value={adv.absenceWeight} onChange={(e) => updateAdv('absenceWeight', e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
          </div>
        </Section>
      </div>

      {/* Calculate Button */}
      <div className="text-center my-8">
        <button
          onClick={calculate}
          className="bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white font-mono font-bold text-sm sm:text-base uppercase tracking-[0.18em] px-12 sm:px-16 py-4 rounded-xl shadow-lg shadow-red-500/25 hover:shadow-red-500/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
        >
          Calculate Probabilities →
        </button>
      </div>

      {/* Paywall */}
      {showPaywall && !result && (
        <div ref={resultRef}>
          <PaywallOverlay />
        </div>
      )}

      {/* Results */}
      {result && (
        <div ref={resultRef} className="bg-slate-800 rounded-xl border border-slate-600 p-5 sm:p-8 animate-in fade-in slide-in-from-bottom-3 duration-400">
          {/* Title */}
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-700/50">
            <div className="w-1 h-7 rounded-full bg-gradient-to-b from-red-400 to-red-600 flex-shrink-0" />
            <div>
              <h3 className="text-white font-bold text-base sm:text-lg tracking-tight">
                <span className="text-emerald-400">{homeName}</span>
                <span className="text-slate-500 mx-2">vs</span>
                <span className="text-red-400">{awayName}</span>
              </h3>
              <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">Probability Baseline</p>
            </div>
          </div>

          {/* Lambda Display — terminal stat blocks */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
            <div className="bg-slate-900/50 border border-emerald-500/30 rounded-xl px-4 py-4 text-center">
              <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-emerald-400/80 font-semibold">Home &lambda;</div>
              <div className="text-3xl sm:text-4xl font-mono font-bold tabular-nums tracking-tight text-emerald-400 leading-none mt-1.5">
                {result.lambdaHome.toFixed(2)}
              </div>
              <div className="text-[10px] sm:text-xs text-slate-500 mt-1.5 truncate">expected goals</div>
            </div>
            <div className="bg-slate-900/50 border border-red-500/30 rounded-xl px-4 py-4 text-center">
              <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-red-400/80 font-semibold">Away &lambda;</div>
              <div className="text-3xl sm:text-4xl font-mono font-bold tabular-nums tracking-tight text-red-400 leading-none mt-1.5">
                {result.lambdaAway.toFixed(2)}
              </div>
              <div className="text-[10px] sm:text-xs text-slate-500 mt-1.5 truncate">expected goals</div>
            </div>
          </div>

          {/* Probability Bar */}
          <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold mb-2">Match Result Probabilities</p>
          <div className="flex rounded-lg overflow-hidden h-[76px] mb-0">
            <div className="flex flex-col items-center justify-center bg-gradient-to-br from-emerald-600 to-emerald-500" style={{ flex: result.probHome }}>
              <span className="text-[9px] font-mono font-bold uppercase tracking-[0.12em] text-white/90 truncate max-w-full px-1">{homeName}</span>
              <span className="text-xl sm:text-2xl font-mono font-bold tabular-nums tracking-tight text-white leading-none mt-0.5">{(result.probHome * 100).toFixed(1)}%</span>
            </div>
            <div className="flex flex-col items-center justify-center bg-gradient-to-br from-amber-600 to-amber-500" style={{ flex: result.probDraw }}>
              <span className="text-[9px] font-mono font-bold uppercase tracking-[0.12em] text-white/90">Draw</span>
              <span className="text-xl sm:text-2xl font-mono font-bold tabular-nums tracking-tight text-white leading-none mt-0.5">{(result.probDraw * 100).toFixed(1)}%</span>
            </div>
            <div className="flex flex-col items-center justify-center bg-gradient-to-br from-red-600 to-red-500" style={{ flex: result.probAway }}>
              <span className="text-[9px] font-mono font-bold uppercase tracking-[0.12em] text-white/90 truncate max-w-full px-1">{awayName}</span>
              <span className="text-xl sm:text-2xl font-mono font-bold tabular-nums tracking-tight text-white leading-none mt-0.5">{(result.probAway * 100).toFixed(1)}%</span>
            </div>
          </div>

          {/* Fair Odds */}
          <div className="flex mb-6 border-t border-slate-700/50">
            <div className="flex flex-col items-center py-2.5" style={{ flex: result.probHome }}>
              <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">Fair Odds</span>
              <span className="text-base sm:text-lg font-mono font-bold tabular-nums tracking-tight text-amber-400 mt-0.5">{(1 / result.probHome).toFixed(2)}</span>
            </div>
            <div className="flex flex-col items-center py-2.5" style={{ flex: result.probDraw }}>
              <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">Fair Odds</span>
              <span className="text-base sm:text-lg font-mono font-bold tabular-nums tracking-tight text-amber-400 mt-0.5">{(1 / result.probDraw).toFixed(2)}</span>
            </div>
            <div className="flex flex-col items-center py-2.5" style={{ flex: result.probAway }}>
              <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">Fair Odds</span>
              <span className="text-base sm:text-lg font-mono font-bold tabular-nums tracking-tight text-amber-400 mt-0.5">{(1 / result.probAway).toFixed(2)}</span>
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

          {/* Calc Log */}
          <details className="mt-5 pt-4 border-t border-slate-700/50">
            <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400 transition-colors">Show Calculation Log</summary>
            <div className="mt-2 bg-black/20 rounded-lg p-3 font-mono text-[11px] text-slate-500 space-y-0.5 max-h-64 overflow-y-auto">
              {result.calcLog.map((line, i) => (
                <p key={i} className={line.includes('SKIPPED') ? 'text-slate-600' : ''}>{line}</p>
              ))}
            </div>
          </details>

          {/* Model Guide Download */}
          <div className="mt-5 pt-4 border-t border-slate-700/50 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-300 font-medium">Match Model Guide</p>
              <p className="text-xs text-slate-500">How the Dixon-Coles pipeline works, where to find data, and tips</p>
            </div>
            <a
              href="/SteamWatch_Match_Model_Guide.pdf"
              download
              className="flex items-center gap-2 px-4 py-2 bg-red-500/15 border border-red-500/30 rounded-lg text-red-400 text-sm font-medium hover:bg-red-500/25 hover:border-red-500/50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download PDF
            </a>
          </div>
        </div>
      )}

      {/* Data Sources (mobile only — sidebar handles desktop) */}
      <div className="mt-6 lg:hidden">
        <DataSourcesSection />
      </div>
      </div>{/* end Main Content */}
      </div>{/* end flex */}
    </div>
  );
}

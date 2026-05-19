/**
 * Qualifying xG — portable component.
 *
 * Bundled from the Mundial '26 project for migration into SteamWatch / SharpCheck.
 * Self-contained except for one peer file:
 *   - `./qualifying-xg.data.ts`  (the Wyscout-sourced match data, exported as QUAL_XG)
 *
 * Renders a confederation-tabbed team picker, an attacking/defending summary card
 * for each team, and a match-by-match xG dominance table.
 *
 * THEMING
 * All colors are referenced via CSS custom properties with hex fallbacks, so it
 * renders fine out-of-the-box on a dark theme without you defining any tokens.
 * To match a specific palette, define these CSS variables on a parent element:
 *   --color-bg, --color-bg-2, --color-surface, --color-surface-2, --color-surface-3
 *   --color-border, --color-border-2
 *   --color-text, --color-text-2, --color-text-3, --color-text-4
 *   --color-gold, --color-gold-2
 *   --color-green, --color-red
 *   --font-sans, --font-mono
 *
 * USAGE
 *   import { QualifyingXg } from './qualifying-xg';
 *   <QualifyingXg />
 *
 * Optional: render a single team without the picker:
 *   <QualifyingXg team="Argentina" hideTeamPicker />
 */

import { useMemo, useState } from 'react';
import { QUAL_XG, QUAL_XG_SOURCE, aggregate, type TeamXg, type XgAggregate, type XgMatch } from './qualifying-xg.data';

// ── Types ───────────────────────────────────────────────────────────

type Confederation = 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'CAF' | 'AFC' | 'OFC';
type PillTone = 'green' | 'red' | 'gold' | 'mute';

// ── Nation → confederation lookup ──────────────────────────────────
// Subset covering only teams that have xG data. Add new teams here when
// you load more Wyscout exports.

const NATION_CONFEDERATION: Record<string, Confederation> = {
  Argentina: 'CONMEBOL', Brazil: 'CONMEBOL', Colombia: 'CONMEBOL', Ecuador: 'CONMEBOL',
  Paraguay: 'CONMEBOL', Uruguay: 'CONMEBOL',
  England: 'UEFA', France: 'UEFA', Spain: 'UEFA', Germany: 'UEFA',
  Netherlands: 'UEFA', Portugal: 'UEFA', Belgium: 'UEFA', Croatia: 'UEFA',
  Switzerland: 'UEFA', Austria: 'UEFA', Norway: 'UEFA', Scotland: 'UEFA',
  Sweden: 'UEFA', 'Türkiye': 'UEFA', 'Bosnia and Herzegovina': 'UEFA', Czechia: 'UEFA',
  Morocco: 'CAF', Senegal: 'CAF', Ghana: 'CAF', Egypt: 'CAF',
  Tunisia: 'CAF', Algeria: 'CAF', 'South Africa': 'CAF', "Côte d'Ivoire": 'CAF',
  'Cabo Verde': 'CAF', 'DR Congo': 'CAF',
  Japan: 'AFC', 'South Korea': 'AFC', Iran: 'AFC', Australia: 'AFC',
  'Saudi Arabia': 'AFC', Qatar: 'AFC', Uzbekistan: 'AFC', Jordan: 'AFC', Iraq: 'AFC',
  'United States': 'CONCACAF', Mexico: 'CONCACAF', Canada: 'CONCACAF', Panama: 'CONCACAF',
  'Curaçao': 'CONCACAF', Haiti: 'CONCACAF',
  'New Zealand': 'OFC',
};

const CONFEDERATIONS: Confederation[] = ['CONMEBOL', 'UEFA', 'CAF', 'AFC', 'CONCACAF', 'OFC'];
const COVERAGE_NOTE = 'Wyscout exports loaded · more added as data arrives';

// ── Flag (flagcdn.com) ─────────────────────────────────────────────

const FLAG_CODES: Record<string, string> = {
  Argentina: 'ar', Brazil: 'br', Colombia: 'co', Ecuador: 'ec', Paraguay: 'py', Uruguay: 'uy',
  England: 'gb-eng', France: 'fr', Spain: 'es', Germany: 'de', Netherlands: 'nl', Portugal: 'pt',
  Belgium: 'be', Croatia: 'hr', Switzerland: 'ch', Austria: 'at', Norway: 'no', Scotland: 'gb-sct',
  Sweden: 'se', 'Türkiye': 'tr', 'Bosnia and Herzegovina': 'ba', Czechia: 'cz',
  Morocco: 'ma', Senegal: 'sn', Ghana: 'gh', Egypt: 'eg', Tunisia: 'tn', Algeria: 'dz',
  'South Africa': 'za', "Côte d'Ivoire": 'ci', 'Cabo Verde': 'cv', 'DR Congo': 'cd',
  Japan: 'jp', 'South Korea': 'kr', Iran: 'ir', Australia: 'au', 'Saudi Arabia': 'sa',
  Qatar: 'qa', Uzbekistan: 'uz', Jordan: 'jo', Iraq: 'iq',
  'United States': 'us', Mexico: 'mx', Canada: 'ca', Panama: 'pa', 'Curaçao': 'cw', Haiti: 'ht',
  'New Zealand': 'nz',
};

function Flag({ nation, size = 20 }: { nation: string; size?: number }) {
  const code = FLAG_CODES[nation];
  if (!code) {
    return (
      <span
        style={{
          display: 'inline-block',
          width: size,
          height: Math.round(size * 0.7),
          background: 'var(--color-surface-3, #2a2d31)',
          borderRadius: 1,
          flexShrink: 0,
        }}
      />
    );
  }
  const w = size <= 20 ? 40 : size <= 32 ? 80 : 160;
  return (
    <img
      src={`https://flagcdn.com/w${w}/${code}.png`}
      alt={`${nation} flag`}
      width={size}
      height={Math.round(size * 0.7)}
      style={{ borderRadius: 1, flexShrink: 0, display: 'inline-block' }}
    />
  );
}

// ── Atoms (terminal-style) ─────────────────────────────────────────

function TLabel({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        letterSpacing: '0.12em',
        color: color ?? 'var(--color-text-3, #8c8a87)',
        fontWeight: 500,
        fontFamily: 'var(--font-mono, ui-monospace, "JetBrains Mono", monospace)',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </span>
  );
}

function TMono({
  children, size = 12, color, weight = 500, style,
}: {
  children: React.ReactNode;
  size?: number;
  color?: string;
  weight?: number;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={{
        fontSize: size,
        color: color ?? 'var(--color-text-2, #c2c0bd)',
        fontWeight: weight,
        fontFamily: 'var(--font-mono, ui-monospace, "JetBrains Mono", monospace)',
        letterSpacing: '0.02em',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

const PILL_TONES: Record<PillTone, { bg: string; border: string; color: string }> = {
  green: { bg: 'rgba(94,200,138,0.10)', border: 'rgba(94,200,138,0.40)', color: 'var(--color-green, #5ec88a)' },
  red:   { bg: 'rgba(220,80,80,0.10)',  border: 'rgba(220,80,80,0.40)',  color: 'var(--color-red, #dc5050)' },
  gold:  { bg: 'rgba(232,185,74,0.10)', border: 'rgba(232,185,74,0.40)', color: 'var(--color-gold, #e8b94a)' },
  mute:  { bg: 'var(--color-bg-2, #141719)', border: 'var(--color-border, #2a2d31)', color: 'var(--color-text-3, #8c8a87)' },
};

function TPill({
  children, tone = 'mute', size = 'md',
}: {
  children: React.ReactNode;
  tone?: PillTone;
  size?: 'sm' | 'md';
}) {
  const t = PILL_TONES[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: size === 'sm' ? '2px 7px' : '3px 9px',
        background: t.bg,
        border: '1px solid ' + t.border,
        borderRadius: 3,
        fontSize: size === 'sm' ? 10 : 11,
        color: t.color,
        fontWeight: 500,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
      }}
    >
      {children}
    </span>
  );
}

function TCaption({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px 24px',
        padding: '10px 14px',
        background: 'var(--color-bg-2, #0e1114)',
        border: '1px solid var(--color-border, #2a2d31)',
        borderRadius: 4,
        fontSize: 11.5,
      }}
    >
      {children}
    </div>
  );
}

function TCaptionItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
      <TLabel>{label}</TLabel>
      <span style={{ color: 'var(--color-text-2, #c2c0bd)', fontSize: 12 }}>{value}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────

export interface QualifyingXgProps {
  /** Pre-select a team. Falls back to the first available. */
  team?: string;
  /** Hide the confederation tabs + team buttons (single-team view). */
  hideTeamPicker?: boolean;
}

export function QualifyingXg({ team: initialTeam, hideTeamPicker }: QualifyingXgProps = {}) {
  const [team, setTeam] = useState(initialTeam ?? QUAL_XG[0]?.team ?? '');
  const current = QUAL_XG.find((t) => t.team === team);

  return (
    <div style={{ fontFamily: 'var(--font-sans, system-ui, -apple-system, sans-serif)' }}>
      <TCaption>
        <TCaptionItem label="Coverage" value={`${QUAL_XG.length} teams · ${COVERAGE_NOTE}`} />
        <TCaptionItem
          label="Source"
          value={
            <a href={QUAL_XG_SOURCE.url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-gold, #e8b94a)' }}>
              wyscout.com
            </a>
          }
        />
      </TCaption>

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {!hideTeamPicker && <Header team={team} setTeam={setTeam} />}
        {current ? <TeamPanel t={current} /> : <EmptyState />}
      </div>
    </div>
  );
}

function Header({ team, setTeam }: { team: string; setTeam: (t: string) => void }) {
  const teamsByConf = useMemo(() => {
    const map = new Map<Confederation, string[]>();
    for (const c of CONFEDERATIONS) map.set(c, []);
    for (const t of QUAL_XG) {
      const conf = NATION_CONFEDERATION[t.team];
      if (conf && map.has(conf)) map.get(conf)!.push(t.team);
    }
    for (const list of map.values()) list.sort((a, b) => a.localeCompare(b));
    return map;
  }, []);

  const teamConf = NATION_CONFEDERATION[team] ?? 'CONMEBOL';
  const [activeConf, setActiveConf] = useState<Confederation>(teamConf);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {CONFEDERATIONS.map((c) => {
          const count = teamsByConf.get(c)?.length ?? 0;
          const active = activeConf === c;
          return (
            <button
              key={c}
              onClick={() => setActiveConf(c)}
              style={{
                background: active ? 'var(--color-surface-2, #1a1d20)' : 'transparent',
                border: '1px solid ' + (active ? 'var(--color-gold, #e8b94a)' : 'var(--color-border, #2a2d31)'),
                color: active ? 'var(--color-text, #e8e6e3)' : 'var(--color-text-2, #c2c0bd)',
                padding: '6px 12px',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                fontFamily: 'inherit',
              }}
            >
              {c}
              <span
                style={{
                  marginLeft: 6,
                  fontFamily: 'var(--font-mono, monospace)',
                  color: active ? 'var(--color-gold, #e8b94a)' : 'var(--color-text-3, #8c8a87)',
                  fontSize: 11,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {teamsByConf.get(activeConf)?.map((t) => {
          const selected = team === t;
          return (
            <button
              key={t}
              onClick={() => setTeam(t)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: selected ? 'var(--color-surface-2, #1a1d20)' : 'transparent',
                border: '1px solid ' + (selected ? 'var(--color-gold, #e8b94a)' : 'var(--color-border, #2a2d31)'),
                color: selected ? 'var(--color-text, #e8e6e3)' : 'var(--color-text-2, #c2c0bd)',
                padding: '5px 10px',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <Flag nation={t} size={16} />
              <span>{t}</span>
            </button>
          );
        })}
        {(teamsByConf.get(activeConf)?.length ?? 0) === 0 && (
          <span style={{ fontSize: 12, color: 'var(--color-text-3, #8c8a87)' }}>
            No teams loaded for this confederation yet.
          </span>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        border: '1px dashed var(--color-border-2, #3a3d41)',
        background: 'var(--color-surface, #141719)',
        padding: 32,
        textAlign: 'center',
        fontSize: 13,
        color: 'var(--color-text-3, #8c8a87)',
        borderRadius: 6,
      }}
    >
      No team data loaded yet. Pick a team once Wyscout exports arrive.
    </div>
  );
}

function TeamPanel({ t }: { t: TeamXg }) {
  const a = useMemo(() => aggregate(t), [t]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {t.note && (
        <div
          style={{
            background: 'var(--color-surface, #141719)',
            border: '1px solid rgba(220,80,80,0.40)',
            borderRadius: 6,
            padding: 14,
            fontSize: 13,
            lineHeight: 1.55,
            color: 'var(--color-red, #dc5050)',
          }}
        >
          <span style={{ marginRight: 8, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: 11 }}>
            ⚠ Caveat
          </span>
          {t.note}
        </div>
      )}
      <SummaryBlock team={t.team} a={a} />
      <MatchTable matches={t.matches} />
    </div>
  );
}

const FIN_TIER: Record<XgAggregate['finishingTier'], { label: string; tone: PillTone }> = {
  CLINICAL: { label: 'Clinical finishers', tone: 'green' },
  MET: { label: 'Met expectations', tone: 'mute' },
  WASTEFUL: { label: 'Wasteful finishers', tone: 'red' },
};

const DEF_TIER: Record<XgAggregate['defendingTier'], { label: string; tone: PillTone }> = {
  SOLID: { label: 'Solid defending', tone: 'green' },
  MET: { label: 'On expectations', tone: 'mute' },
  LEAKY: { label: 'Leaky / unlucky', tone: 'red' },
};

function SummaryBlock({ team, a }: { team: string; a: XgAggregate }) {
  const conv = a.shots ? (a.goalsFor / a.shots) * 100 : 0;
  const fin = FIN_TIER[a.finishingTier];
  const def = DEF_TIER[a.defendingTier];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
      <Card>
        <CardHeader team={team} matches={a.matches} subtitle={`${a.fromDate} → ${a.toDate}`} sectionLabel="Attacking" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Stat label="xG / match" value={a.xgPer.toFixed(2)} />
          <Stat label="Goals / match" value={a.goalsPer.toFixed(2)} />
          <Stat label="Conversion" value={conv.toFixed(1) + '%'} />
        </div>
        <DeltaRow label="Δ Finishing" value={a.finishing} tone={fin.tone} chipLabel={fin.label} hint="Goals scored vs xG predicted" />
      </Card>

      <Card>
        <CardHeader team={team} matches={a.matches} subtitle="Lower xGA = higher quality block" sectionLabel="Defending" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Stat label="xGA / match" value={a.xgaPer.toFixed(2)} />
          <Stat label="GA / match" value={a.goalsAgainstPer.toFixed(2)} />
          <Stat label="Clean sheets" value={String(a.cleanSheets)} />
        </div>
        <DeltaRow label="Δ Defending" value={a.defending} tone={def.tone} chipLabel={def.label} hint="xGA expected vs goals actually conceded" />
      </Card>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--color-surface, #141719)',
        border: '1px solid var(--color-border, #2a2d31)',
        borderRadius: 6,
        padding: 18,
      }}
    >
      {children}
    </div>
  );
}

function CardHeader({
  team, matches, subtitle, sectionLabel,
}: {
  team: string;
  matches: number;
  subtitle: string;
  sectionLabel: string;
}) {
  return (
    <header
      style={{
        marginBottom: 14,
        paddingBottom: 12,
        borderBottom: '1px solid var(--color-border, #2a2d31)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <Flag nation={team} size={32} />
      <div>
        <TLabel color="var(--color-gold, #e8b94a)">{sectionLabel} · {matches} matches</TLabel>
        <div style={{ fontSize: 11, color: 'var(--color-text-3, #8c8a87)', marginTop: 2 }}>{subtitle}</div>
      </div>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <TMono size={26} color="var(--color-text, #e8e6e3)" weight={500}>{value}</TMono>
      <div style={{ marginTop: 4 }}>
        <TLabel>{label}</TLabel>
      </div>
    </div>
  );
}

function DeltaRow({
  label, value, tone, chipLabel, hint,
}: {
  label: string;
  value: number;
  tone: PillTone;
  chipLabel: string;
  hint: string;
}) {
  const sign = value > 0 ? '+' : '';
  return (
    <div
      style={{
        marginTop: 16,
        paddingTop: 12,
        borderTop: '1px solid var(--color-border, #2a2d31)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'baseline',
        gap: 12,
      }}
    >
      <TLabel>{label}</TLabel>
      <TMono size={16} color="var(--color-text, #e8e6e3)" weight={600}>{sign}{value.toFixed(2)}</TMono>
      <TPill tone={tone} size="sm">{chipLabel}</TPill>
      <TMono size={10} color="var(--color-text-3, #8c8a87)" style={{ marginLeft: 'auto' }}>{hint}</TMono>
    </div>
  );
}

// ── Match table ────────────────────────────────────────────────────

function MatchTable({ matches }: { matches: XgMatch[] }) {
  const maxAbs = Math.max(...matches.map((m) => Math.abs(m.xg - m.xga)));
  return (
    <div
      style={{
        border: '1px solid var(--color-border, #2a2d31)',
        borderRadius: 6,
        overflow: 'hidden',
        background: 'var(--color-surface, #141719)',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <ThHead label="Date" align="left" />
            <ThHead label="Opponent" align="left" />
            <ThHead label="H/A" align="center" />
            <ThHead label="Score" align="center" />
            <ThHead label="xG" align="right" />
            <ThHead label="xGA" align="right" />
            <ThHead label="xG dominance" align="left" />
          </tr>
        </thead>
        <tbody>
          {matches.map((m, i) => (
            <MatchRow key={m.date + m.opponent} m={m} maxAbs={maxAbs} i={i} last={i === matches.length - 1} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ThHead({ label, align = 'left' }: { label: string; align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: '11px 14px',
        borderBottom: '1px solid var(--color-border, #2a2d31)',
        background: 'var(--color-surface, #141719)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 10.5,
          fontWeight: 500,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--color-text-3, #8c8a87)',
        }}
      >
        {label}
      </span>
    </th>
  );
}

function MatchRow({ m, maxAbs, i, last }: { m: XgMatch; maxAbs: number; i: number; last: boolean }) {
  const diff = m.xg - m.xga;
  const won = m.gf > m.ga;
  const drew = m.gf === m.ga;
  const scoreColor = won ? 'var(--color-green, #5ec88a)' : drew ? 'var(--color-text-2, #c2c0bd)' : 'var(--color-red, #dc5050)';
  return (
    <tr
      style={{
        borderBottom: last ? 'none' : '1px solid var(--color-border, #2a2d31)',
        background: i % 2 ? 'var(--color-bg-2, #0e1114)' : 'transparent',
      }}
    >
      <td style={{ padding: '11px 14px' }}>
        <TMono size={12} color="var(--color-text-3, #8c8a87)">{m.date}</TMono>
      </td>
      <td style={{ padding: '11px 14px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <Flag nation={m.opponent} size={20} />
          <span style={{ fontSize: 13, color: 'var(--color-text, #e8e6e3)', fontWeight: 500 }}>{m.opponent}</span>
        </span>
      </td>
      <td style={{ padding: '11px 14px', textAlign: 'center' }}>
        <TMono size={11} color="var(--color-text-3, #8c8a87)">{m.venue}</TMono>
      </td>
      <td style={{ padding: '11px 14px', textAlign: 'center' }}>
        <TMono size={13} color={scoreColor} weight={500}>{m.gf}-{m.ga}</TMono>
      </td>
      <td style={{ padding: '11px 14px', textAlign: 'right' }}>
        <TMono size={12} color="var(--color-text-2, #c2c0bd)">{m.xg.toFixed(2)}</TMono>
      </td>
      <td style={{ padding: '11px 14px', textAlign: 'right' }}>
        <TMono size={12} color="var(--color-text-2, #c2c0bd)">{m.xga.toFixed(2)}</TMono>
      </td>
      <td style={{ padding: '11px 14px' }}>
        <DominanceBar diff={diff} maxAbs={maxAbs} />
      </td>
    </tr>
  );
}

function DominanceBar({ diff, maxAbs }: { diff: number; maxAbs: number }) {
  const pct = maxAbs > 0 ? Math.min(100, (Math.abs(diff) / maxAbs) * 100) : 0;
  const positive = diff >= 0;
  return (
    <div
      style={{
        position: 'relative',
        height: 12,
        width: '100%',
        overflow: 'hidden',
        background: 'var(--color-surface-3, #1f2226)',
        borderRadius: 2,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          height: '100%',
          width: 1,
          background: 'var(--color-border-2, #3a3d41)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          height: '100%',
          background: positive ? 'var(--color-green, #5ec88a)' : 'var(--color-red, #dc5050)',
          opacity: 0.7,
          ...(positive ? { left: '50%', width: `${pct / 2}%` } : { right: '50%', width: `${pct / 2}%` }),
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          padding: '0 6px',
          fontSize: 10,
          fontWeight: 500,
          fontFamily: 'var(--font-mono, monospace)',
          color: positive ? 'var(--color-green, #5ec88a)' : 'var(--color-red, #dc5050)',
          ...(positive ? { left: '51%' } : { right: '51%' }),
        }}
      >
        {positive ? '+' : ''}{diff.toFixed(2)}
      </div>
    </div>
  );
}

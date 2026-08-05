import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { createForecast, getForecastRegistry, getRecentForecasts } from '../api';
import type {
  ForecastResponse,
  ForecastSource,
  ForecastStage,
  RecentForecastsResponse,
} from '../types';
import ForecastSwarm, { type SwarmNodeStatus } from '../components/ForecastSwarm';
import { parseUtc } from '../utils/time';

// Fallback mirror of backend registry.py — used only if the registry
// endpoint fails; keeps the swarm rendering something honest.
const FALLBACK_SOURCES: ForecastSource[] = [
  { id: 'league_constants', name: 'League constants', tier: 1, detail: '' },
  { id: 'standings', name: 'Season results ledger', tier: 1, detail: '' },
  { id: 'strength_fit', name: 'Team strength model', tier: 2, detail: '' },
  { id: 'xg_form', name: 'npxG form (Understat)', tier: 1, detail: '' },
  { id: 'pinnacle', name: 'Pinnacle odds feed', tier: 1, detail: '' },
  { id: 'polymarket', name: 'Polymarket prices', tier: 1, detail: '' },
  { id: 'steam', name: 'Steam move detector', tier: 1, detail: '' },
  { id: 'monte_carlo', name: 'Dixon-Coles season simulator', tier: 2, detail: '' },
];

const EXAMPLE_CHIPS = [
  'Who wins the Premier League?',
  'Does Bayern Munich win the Bundesliga?',
  'Who makes the top 4 in Serie A?',
  'Who gets relegated from La Liga?',
  'Arsenal vs Chelsea',
];

type Phase = 'idle' | 'running' | 'replay' | 'done' | 'unsupported' | 'error';

const STAGE_REPLAY_MS = 300;

export default function ForecastPage() {
  const [sources, setSources] = useState<ForecastSource[]>(FALLBACK_SOURCES);
  const [engineVersion, setEngineVersion] = useState('forecast-v1');
  const [question, setQuestion] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [nodeStates, setNodeStates] = useState<Record<string, SwarmNodeStatus>>({});
  const [log, setLog] = useState<ForecastStage[]>([]);
  const [response, setResponse] = useState<ForecastResponse | null>(null);
  const [errorText, setErrorText] = useState('');
  const [recent, setRecent] = useState<RecentForecastsResponse['forecasts']>([]);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const timersRef = useRef<number[]>([]);
  const scanRef = useRef<number | null>(null);

  function refreshRecent() {
    getRecentForecasts(6)
      .then((r) => setRecent(r.forecasts))
      .catch(() => {});
  }

  function clearAllTimers() {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
    if (scanRef.current !== null) {
      window.clearInterval(scanRef.current);
      scanRef.current = null;
    }
  }

  useEffect(() => {
    getForecastRegistry()
      .then((r) => {
        setSources(r.sources);
        setEngineVersion(r.engine_version);
      })
      .catch(() => {});
    refreshRecent();
    return () => clearAllTimers();
  }, []);

  function runQuestion(q: string) {
    const trimmed = q.trim();
    if (!trimmed || phase === 'running' || phase === 'replay') return;
    clearAllTimers();
    setQuestion(trimmed);
    setResponse(null);
    setLog([]);
    setShowAllEntries(false);
    setErrorText('');
    setPhase('running');
    setNodeStates({});

    // While the engine works, sweep an "active" highlight across the
    // registry so the swarm reads as searching. Real statuses replace
    // this the moment the stage timeline arrives.
    let i = 0;
    scanRef.current = window.setInterval(() => {
      const id = sources[i % sources.length]?.id;
      setNodeStates((prev) => {
        const next: Record<string, SwarmNodeStatus> = {};
        Object.entries(prev).forEach(([k, v]) => {
          if (v === 'active') next[k] = 'idle';
          else next[k] = v;
        });
        if (id) next[id] = 'active';
        return next;
      });
      i += 1;
    }, 320);

    createForecast(trimmed)
      .then((res) => {
        clearAllTimers();
        if (res.status === 'unsupported' || res.status === 'error') {
          setResponse(res);
          setNodeStates({});
          setPhase(res.status === 'unsupported' ? 'unsupported' : 'error');
          setErrorText(res.reason ?? 'Forecast failed.');
          refreshRecent();
          return;
        }
        // Replay the recorded stage timeline node by node — the
        // animation shows what the engine actually consulted.
        setPhase('replay');
        setNodeStates({});
        res.stages.forEach((stage, idx) => {
          timersRef.current.push(
            window.setTimeout(() => {
              setNodeStates((prev) => ({ ...prev, [stage.source]: 'active' }));
              timersRef.current.push(
                window.setTimeout(() => {
                  setNodeStates((prev) => ({ ...prev, [stage.source]: stage.status }));
                  setLog((prev) => [...prev, stage]);
                }, STAGE_REPLAY_MS * 0.7),
              );
            }, idx * STAGE_REPLAY_MS),
          );
        });
        timersRef.current.push(
          window.setTimeout(() => {
            setResponse(res);
            setPhase('done');
            refreshRecent();
          }, res.stages.length * STAGE_REPLAY_MS + 350),
        );
      })
      .catch(() => {
        clearAllTimers();
        setNodeStates({});
        setPhase('error');
        setErrorText('The forecast engine is unreachable — try again in a moment.');
      });
  }

  function loadRecent(item: RecentForecastsResponse['forecasts'][number]) {
    clearAllTimers();
    setQuestion(item.question);
    setResponse(item.payload);
    setLog(item.payload.stages);
    setShowAllEntries(false);
    const states: Record<string, SwarmNodeStatus> = {};
    item.payload.stages.forEach((s) => {
      states[s.source] = s.status;
    });
    setNodeStates(states);
    setPhase('done');
  }

  const sourceName = (id: string) => sources.find((s) => s.id === id)?.name ?? id;
  const busy = phase === 'running' || phase === 'replay';

  return (
    <div className="space-y-6">
      <Helmet>
        <title>Forecast Engine | SteamWatch</title>
        <meta
          name="description"
          content="Ask a question about the Top 5 European leagues and get a calibrated Dixon-Coles Monte Carlo forecast built only from SteamWatch's own controlled data sources."
        />
      </Helmet>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/40 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔮</span>
          <h1 className="font-mono text-lg sm:text-xl font-bold uppercase tracking-[0.18em] text-white">
            Forecast Engine
          </h1>
          <span className="ml-auto hidden sm:flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/80">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
            {engineVersion}
          </span>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400">
          Ask a season or match question about the Top 5 European leagues. Every
          answer comes from a Dixon-Coles Monte Carlo simulation over sources we
          control — the nodes below are the <em>entire</em> research universe.
          No junk sites, no repackaged bookmaker prices, no LLM guesswork.
        </p>

        {/* Question box */}
        <form
          className="mt-5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            runQuestion(question);
          }}
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. who wins the Premier League?"
            maxLength={300}
            className="flex-1 rounded-lg border border-slate-600/70 bg-slate-950/70 px-4 py-3 font-mono text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors focus:border-cyan-400/70"
          />
          <button
            type="submit"
            disabled={busy || !question.trim()}
            className="rounded-lg bg-cyan-500 px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.14em] text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {busy ? 'Running…' : 'Forecast'}
          </button>
        </form>

        {/* Example chips */}
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLE_CHIPS.map((c) => (
            <button
              key={c}
              onClick={() => runQuestion(c)}
              disabled={busy}
              className="rounded-full border border-slate-600/60 bg-slate-800/60 px-3 py-1.5 font-mono text-[11px] text-slate-300 transition-colors hover:border-cyan-400/60 hover:text-cyan-300 disabled:opacity-50"
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Swarm + stage log */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-4">
          <div className="mb-1 flex items-center justify-between">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              research swarm · source registry
            </p>
            {busy && (
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300">
                {phase === 'running' ? 'consulting sources…' : 'compiling…'}
              </p>
            )}
          </div>
          <ForecastSwarm sources={sources} nodeStates={nodeStates} running={busy} />
        </div>

        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-4">
          <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            stage log
          </p>
          {log.length === 0 ? (
            <p className="font-mono text-xs text-slate-600">
              {busy ? 'engine running…' : 'run a forecast to see the audit trail'}
            </p>
          ) : (
            <ul className="space-y-2">
              {log.map((s, i) => (
                <li key={`${s.source}-${i}`} className="flex items-start gap-2 font-mono text-[11px] leading-snug">
                  <span
                    className={
                      s.status === 'done'
                        ? 'text-emerald-400'
                        : s.status === 'empty'
                          ? 'text-slate-500'
                          : 'text-red-400'
                    }
                  >
                    {s.status === 'done' ? '✓' : s.status === 'empty' ? '·' : '✕'}
                  </span>
                  <span className="text-slate-300">
                    <span className="text-slate-500">{sourceName(s.source)}</span>{' '}
                    {s.headline}
                    <span className="text-slate-600"> · {s.ms}ms</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Unsupported / error */}
      {(phase === 'unsupported' || phase === 'error') && (
        <div
          className={`rounded-2xl border p-5 ${
            phase === 'unsupported'
              ? 'border-amber-500/40 bg-amber-950/20'
              : 'border-red-500/40 bg-red-950/20'
          }`}
        >
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
            {phase === 'unsupported' ? 'Outside the grammar (for now)' : 'Engine error'}
          </p>
          <p className="mt-2 text-sm text-slate-300">{errorText}</p>
          {response?.suggestions && (
            <div className="mt-3 flex flex-wrap gap-2">
              {response.suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => runQuestion(s)}
                  className="rounded-full border border-slate-600/60 bg-slate-800/60 px-3 py-1.5 font-mono text-[11px] text-slate-300 transition-colors hover:border-cyan-400/60 hover:text-cyan-300"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {phase === 'done' && response?.result && (
        <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/80 p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-mono text-base font-bold text-white">
              {response.question}
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
              {response.league_name} · {response.duration_ms}ms ·{' '}
              {response.result.meta
                ? `${response.result.meta.n_sims.toLocaleString()} sims`
                : response.engine_version}
            </span>
          </div>

          {/* Distribution bars */}
          {(response.result.type === 'distribution' || response.result.type === 'binary') &&
            response.result.entries && (
              <div className="mt-4 space-y-1.5">
                {(showAllEntries
                  ? response.result.entries
                  : response.result.entries.slice(0, 8)
                ).map((e) => {
                  const highlight =
                    response.result?.type === 'binary' &&
                    response.result.binary?.team === e.team;
                  return (
                    <div
                      key={e.team}
                      className={`flex items-center gap-3 rounded px-2 py-1 ${
                        highlight ? 'bg-cyan-500/10 ring-1 ring-cyan-400/40' : ''
                      }`}
                    >
                      <span className="w-44 truncate font-mono text-xs text-slate-300">
                        {e.team}
                      </span>
                      <div className="h-3 flex-1 overflow-hidden rounded-sm bg-slate-800">
                        <div
                          className="h-full rounded-sm bg-gradient-to-r from-cyan-500 to-emerald-400"
                          style={{ width: `${Math.max(e.probability * 100, 0.5)}%` }}
                        />
                      </div>
                      <span className="w-14 text-right font-mono text-xs font-semibold text-white">
                        {(e.probability * 100).toFixed(1)}%
                      </span>
                      {response.result?.meta?.outright_market && (
                        <span className="w-16 text-right font-mono text-[11px] text-amber-300/80">
                          {e.market_implied !== undefined
                            ? `${(e.market_implied * 100).toFixed(1)}%`
                            : '—'}
                        </span>
                      )}
                    </div>
                  );
                })}
                {response.result.meta?.outright_market && (
                  <div className="flex items-center justify-end gap-3 px-2 pt-1">
                    <span className="font-mono text-[10px] text-slate-500">
                      model
                    </span>
                    <span className="w-16 text-right font-mono text-[10px] text-amber-300/60">
                      polymarket
                    </span>
                  </div>
                )}
                {response.result.entries.length > 8 && (
                  <button
                    onClick={() => setShowAllEntries(!showAllEntries)}
                    className="mt-1 font-mono text-[11px] text-cyan-400 hover:text-cyan-300"
                  >
                    {showAllEntries
                      ? 'show fewer'
                      : `+${response.result.entries.length - 8} more`}
                  </button>
                )}
              </div>
            )}

          {/* Binary headline */}
          {response.result.type === 'binary' && response.result.binary && (
            <div className="mt-4 rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4">
              <span className="font-mono text-3xl font-bold text-cyan-300">
                {(response.result.binary.probability * 100).toFixed(1)}%
              </span>
              <span className="ml-3 font-mono text-sm text-slate-300">
                {response.result.binary.team} finish {response.result.binary.outcome_label}
              </span>
              {response.result.binary.market_implied !== undefined && (
                <div className="mt-2 font-mono text-xs text-amber-300/80">
                  polymarket {(response.result.binary.market_implied * 100).toFixed(1)}%
                  <span className="ml-2 text-slate-500">
                    (raw {((response.result.binary.market_yes ?? 0) * 100).toFixed(1)}¢)
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Match result */}
          {response.result.type === 'match' &&
            response.result.match &&
            (() => {
              const m = response.result.match;
              const cells: Array<[string, number, number | null]> = [
                [m.home, m.p_home, m.market?.home ?? null],
                ['Draw', m.p_draw, m.market?.draw ?? null],
                [m.away, m.p_away, m.market?.away ?? null],
              ];
              return (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {cells.map(([label, p, market]) => (
                      <div
                        key={label}
                        className="rounded-xl border border-slate-700/60 bg-slate-950/50 p-3 text-center"
                      >
                        <p className="truncate font-mono text-[11px] text-slate-400">{label}</p>
                        <p className="mt-1 font-mono text-2xl font-bold text-white">
                          {(p * 100).toFixed(1)}%
                        </p>
                        {market !== null && (
                          <p className="mt-1 font-mono text-[10px] text-slate-500">
                            pinnacle {(market * 100).toFixed(1)}%
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  {!m.venue_known && (
                    <p className="font-mono text-[11px] text-amber-400">
                      ⚠ venue assumed ({m.home} at home) — no upcoming fixture in
                      the feed for this pairing
                    </p>
                  )}
                </div>
              );
            })()}

          {/* Warnings */}
          {response.warnings && response.warnings.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3">
              {response.warnings.map((w, i) => (
                <p key={i} className="font-mono text-[11px] leading-relaxed text-amber-300">
                  ⚠ {w}
                </p>
              ))}
            </div>
          )}

          {/* Rationale */}
          <div className="mt-5 space-y-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              rationale
            </p>
            {response.rationale.map((para, i) => (
              <div key={i} className="text-sm leading-relaxed text-slate-300">
                {para.text}
                {para.sources.length > 0 && (
                  <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                    {para.sources.map((sid) => (
                      <span
                        key={sid}
                        className="rounded border border-slate-600/60 bg-slate-800/80 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-slate-400"
                      >
                        {sourceName(sid)}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Evidence */}
          <details className="mt-5 group">
            <summary className="cursor-pointer font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 hover:text-cyan-300">
              sources consulted ({Object.keys(response.evidence).length}) — raw evidence
            </summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {Object.entries(response.evidence).map(([sid, card]) => (
                <div
                  key={sid}
                  className="rounded-lg border border-slate-700/60 bg-slate-950/60 p-3"
                >
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-cyan-300/90">
                    {sourceName(sid)}
                  </p>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-slate-400">
                    {JSON.stringify(card, null, 1)}
                  </pre>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* Recent forecasts ledger */}
      {recent.length > 0 && (
        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-5">
          <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            recent forecasts · public ledger
          </p>
          <ul className="divide-y divide-slate-800">
            {recent.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => loadRecent(r)}
                  className="flex w-full items-baseline gap-3 py-2 text-left transition-colors hover:bg-slate-800/40"
                >
                  <span className="flex-1 truncate font-mono text-xs text-slate-300">
                    {r.question}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500">
                    {r.kind.replace('_', ' ')} ·{' '}
                    {parseUtc(r.created_at).toLocaleDateString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

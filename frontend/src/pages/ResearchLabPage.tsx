import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../contexts/AuthContext";
import "./ResearchLabPage.css";

const sample = "English clubs at home in Europe in 2026/27";
const questions = [
  "Which team has seen steam moves the most this season from the Top 5 leagues?",
  "Which teams have drifted most in the Premier League?",
  "Would I be up backing Lazio every week this season?",
  "English clubs away in Europe this season",
  "Arsenal last 10 away games below 2.00",
];
type Rules = {
  team: string;
  competitions: string[];
  season: number;
  venue: string;
  stage: string;
  last: number | null;
  bound: string | null;
  price: number | null;
};
type Summary = {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  priced: number;
  missing: number;
  pnl: number | null;
  roi: number | null;
  win_pct: number | null;
};
type Fixture = {
  competition: string;
  date: string;
  home: string;
  away: string;
  hg: number;
  ag: number;
  side: "home" | "away";
  result: "W" | "D" | "L";
  price: number | null;
  pnl: number | null;
  source: string;
  link: string | null;
};
type Report = {
  kind?: "win_report";
  canonical: string;
  rules: Rules;
  summary: Summary;
  fixtures: Fixture[];
  breakdown: Record<string, Summary>;
  unclassified: number;
  notices: string[];
};
type MovementReport = {
  kind: "movement_ranking";
  canonical: string;
  direction: "steam" | "drift";
  competitions: string[];
  season: number;
  count: number;
  latest: string | null;
  threshold_pp: number;
  window_minutes: number;
  rows: {
    rank: number;
    team: string;
    competition: string;
    moves: number;
    wins: number;
    draws: number;
    losses: number;
    pending: number;
    fixtures: {
      match_id: string;
      date: string;
      opponent: string;
      venue: string;
      opening: number;
      price: number;
      pp: number;
      result: string;
    }[];
  }[];
};
type Track = {
  id: number;
  question: string;
  created_at: string;
  forward_from: string;
  baseline: Summary;
};
type Progress = Track & { forward: Report };

async function request<T>(
  url: string,
  token: string | null,
  method = "GET",
  question?: string,
  signal?: AbortSignal,
  previous?: string,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = "Bearer " + token;
  if (question) headers["Content-Type"] = "application/json";
  const response = await fetch("/api/research/" + url, {
    method,
    headers,
    cache: token ? "no-store" : "default",
    body: question ? JSON.stringify({ question, previous }) : undefined,
    signal,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      typeof err.detail === "string"
        ? err.detail
        : "Could not load this research. Please try again.",
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
function units(n: number | null) {
  return n === null ? "—" : (n > 0 ? "+" : "") + n.toFixed(2) + "u";
}
function pct(n: number | null) {
  return n === null ? "—" : n.toFixed(1) + "%";
}
function dateLabel(day: string) {
  return new Date(day.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
function errorText(e: unknown) {
  return e instanceof Error ? e.message : "Please try again.";
}
function Metrics({ s }: { s: Summary }) {
  return (
    <div className="rl-metrics">
      <div>
        <span>Wins / games</span>
        <strong>
          {s.wins}
          <small> / {s.games}</small>
        </strong>
      </div>
      <div>
        <span>Win rate</span>
        <strong>{pct(s.win_pct)}</strong>
      </div>
      <div>
        <span>Net P/L</span>
        <strong className={s.pnl !== null && s.pnl > 0 ? "positive" : ""}>
          {units(s.pnl)}
        </strong>
      </div>
      <div>
        <span>ROI</span>
        <strong>{pct(s.roi)}</strong>
      </div>
    </div>
  );
}
function Results({
  data,
  question,
  onSave,
  saved,
  busy,
  forward = false,
}: {
  data: Report;
  question: string;
  onSave?: () => void;
  saved?: boolean;
  busy?: boolean;
  forward?: boolean;
}) {
  const [visible, setVisible] = useState(12);
  const { rules: r, summary: s } = data;
  const europe = r.competitions.some((c) => ["UCL", "UEL", "UECL"].includes(c));
  const filters = [
    r.team,
    r.competitions.join(" + "),
    r.season + "/" + String(r.season + 1).slice(-2),
    r.venue === "all"
      ? "Home & away"
      : r.venue === "home"
        ? "Home only"
        : "Away only",
    europe
      ? r.stage === "all"
        ? "Including qualifiers"
        : r.stage === "league"
          ? "League phase"
          : "Main competition"
      : "",
    r.last && !forward ? "Last " + r.last + " games" : "",
    r.bound ? r.bound + " " + r.price?.toFixed(2) : "",
  ].filter(Boolean);
  return (
    <section className="rl-results" aria-label="Research results">
      <div className="rl-result-head">
        <div>
          {forward && <p className="rl-meta">Since tracking started</p>}
          <h2>{question}</h2>
        </div>
        {onSave && (
          <button
            className="rl-secondary"
            disabled={busy || saved}
            onClick={onSave}
          >
            {saved ? "Tracking" : "Save & track"}
          </button>
        )}
      </div>
      <p className="rl-filters">{filters.join("  ·  ")}</p>
      {data.fixtures.length > 0 && (
        <p className="rl-asof">
          Latest matching result · {dateLabel(data.fixtures[0].date)}
        </p>
      )}
      {data.notices.map((note) => (
        <p className="rl-warning" key={note}>
          {note}. Figures cover available results.
        </p>
      ))}
      <Metrics s={s} />
      <p className="rl-coverage">
        <b>
          {s.priced} priced {s.priced === 1 ? "bet" : "bets"}
        </b>{" "}
        · 1u each at the Pinnacle close.{" "}
        {s.missing > 0
          ? s.missing +
            " " +
            (s.missing === 1 ? "game counts" : "games count") +
            " in the record only. "
          : ""}
        {data.unclassified > 0
          ? data.unclassified +
            " games had no verified price to check against the odds filter."
          : ""}
      </p>
      {s.games === 0 ? (
        <p className="rl-empty">
          {forward
            ? "New settled fixtures will appear here."
            : "No settled games matched these rules in the available archive."}
        </p>
      ) : (
        <>
          {r.competitions.length > 1 && (
            <div className="rl-scroll">
              <table>
                <caption>By competition</caption>
                <thead>
                  <tr>
                    <th>Competition</th>
                    <th>W–D–L</th>
                    <th>Bets</th>
                    <th>Net P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.breakdown).map(([name, b]) => (
                    <tr key={name}>
                      <th>{name}</th>
                      <td>
                        {b.wins}–{b.draws}–{b.losses}
                      </td>
                      <td>{b.priced}</td>
                      <td>{units(b.pnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <details className="rl-evidence">
            <summary>
              Show the matches <span>{s.games}</span>
            </summary>
            <div className="rl-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Match &amp; score</th>
                    <th>Selection</th>
                    <th>Close</th>
                    <th>P/L</th>
                    <th>Price source</th>
                  </tr>
                </thead>
                <tbody>
                  {data.fixtures.slice(0, visible).map((f) => (
                    <tr
                      key={[f.date, f.competition, f.home, f.away, f.side].join(
                        "|",
                      )}
                    >
                      <td>{dateLabel(f.date)}</td>
                      <td>
                        {f.home}{" "}
                        <b>
                          {f.hg}–{f.ag}
                        </b>{" "}
                        {f.away}
                      </td>
                      <td>{f[f.side]}</td>
                      <td>{f.price?.toFixed(2) ?? "—"}</td>
                      <td>{units(f.pnl)}</td>
                      <td>
                        {f.link ? <a href={f.link}>{f.source}</a> : f.source}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visible < s.games && (
              <button
                className="rl-secondary"
                onClick={() => setVisible(visible + 40)}
              >
                Show more matches
              </button>
            )}
          </details>
        </>
      )}
      <details className="rl-method">
        <summary>How this is calculated</summary>
        <p>
          Each priced selection stakes one unit to win in 90 minutes. Draws and
          defeats lose the stake. Win rate includes every matching result. ROI
          divides net profit by units staked. A missing price never counts as a
          loss. SteamWatch quotes must come from the final five minutes before
          kickoff. Historical Pinnacle closes use the named archive in the match
          list.
        </p>
        {r.last && (
          <p>
            The last-game limit applies within the season and venue before the
            price filter. Forward tracking counts every new qualifying game.
          </p>
        )}
      </details>
    </section>
  );
}
function MovementResults({ data }: { data: MovementReport }) {
  const [all, setAll] = useState(false);
  const [selected, setSelected] = useState("");
  const leaders = data.rows.filter((r) => r.rank === 1);
  const top = leaders[0];
  const team = data.rows.find((r) => r.team === selected) ?? top;
  const rows = all ? data.rows : data.rows.filter((r) => r.rank <= 5);
  const noun = data.direction === "steam" ? "steam" : "drift";
  return (
    <section className="rl-results" aria-label="Market movement ranking">
      <div className="rl-result-head">
        <h2>
          {top
            ? (leaders.length === 1
                ? top.team + " lead"
                : leaders.length + " teams share the lead") +
              " with " +
              top.moves +
              " qualifying " +
              (top.moves === 1 ? "match" : "matches")
            : "No qualifying moves recorded"}
        </h2>
      </div>
      <p className="rl-filters">
        {data.canonical} · {data.count} qualifying team selections
        {data.latest && " · Latest move " + dateLabel(data.latest)}
      </p>
      <p className="rl-coverage">
        We count one match each time a team’s Pinnacle win probability{" "}
        {noun === "steam" ? "rises" : "falls"} at least {data.threshold_pp}{" "}
        percentage points from the first recorded price during the final{" "}
        {data.window_minutes / 60} hours before kickoff. Repeat moves count
        once; the match list shows the largest. A Telegram alert isn’t required.
      </p>
      {top && (
        <>
          <div className="rl-scroll">
            <table>
              <caption>
                {all
                  ? "All teams with qualifying moves"
                  : "Top five places, including ties"}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Team</th>
                  <th scope="col">League</th>
                  <th scope="col">Matches</th>
                  <th scope="col">W–D–L</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.competition + r.team}>
                    <td>{r.rank}</td>
                    <th scope="row">{r.team}</th>
                    <td>{r.competition}</td>
                    <td>{r.moves}</td>
                    <td>
                      {r.wins}–{r.draws}–{r.losses}
                      {r.pending ? " (" + r.pending + " pending)" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(all || rows.length < data.rows.length) && (
            <button className="rl-secondary" onClick={() => setAll(!all)}>
              {all
                ? "Show top five places"
                : "Show all " + data.rows.length + " teams"}
            </button>
          )}
          <details className="rl-evidence">
            <summary>Check the individual matches</summary>
            <label>
              Team{" "}
              <select
                className="rl-secondary"
                value={team.team}
                onChange={(e) => setSelected(e.target.value)}
              >
                {data.rows.map((r) => (
                  <option key={r.team}>{r.team}</option>
                ))}
              </select>
            </label>
            <div className="rl-scroll">
              <table>
                <caption>
                  {team.team} · {team.moves} qualifying matches
                </caption>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Opponent</th>
                    <th>First → move price</th>
                    <th>Change</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {team.fixtures.map((f) => (
                    <tr key={f.match_id}>
                      <td>{dateLabel(f.date)}</td>
                      <td>
                        <Link to={"/match/" + f.match_id}>{f.opponent}</Link> (
                        {f.venue === "home" ? "H" : "A"})
                      </td>
                      <td>
                        {f.opening.toFixed(2)} → {f.price.toFixed(2)}
                      </td>
                      <td>
                        {f.pp > 0 ? "+" : ""}
                        {f.pp.toFixed(2)}pp
                      </td>
                      <td>{f.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
function Lab({ token, member }: { token: string | null; member: boolean }) {
  const [input, setInput] = useState("");
  const [current, setCurrent] = useState<{
    question: string;
    data: Report | MovementReport;
  } | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [detail, setDetail] = useState<Progress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    setReady(false);
    request<Report>("example", null, "GET", undefined, c.signal)
      .then((data) => {
        setCurrent({ question: sample, data });
        setReady(true);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorText(e));
      });
    if (member)
      request<Track[]>("tracks", token, "GET", undefined, c.signal)
        .then(setTracks)
        .catch((e) => {
          if (!c.signal.aborted) setError(errorText(e));
        });
    return () => c.abort();
  }, [member, token, attempt]);
  async function act(action: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function run(q: string) {
    return act(async () => {
      const data = await request<Report | MovementReport>(
        "run",
        token,
        "POST",
        q,
        undefined,
        detail?.forward.canonical ?? current?.data.canonical,
      );
      setCurrent({ question: data.canonical, data });
      setDetail(null);
      setSaved(false);
    });
  }
  function save() {
    if (!current || current.data.kind === "movement_ranking") return;
    return act(async () => {
      const t = await request<Track>(
        "tracks",
        token,
        "POST",
        current.data.canonical,
      );
      setTracks((old) => [t, ...old.filter((item) => item.id !== t.id)]);
      setSaved(true);
    });
  }
  return (
    <main className="rl-page">
      <Helmet>
        <title>Research Lab · SteamWatch</title>
        <link
          rel="canonical"
          href="https://www.steamwatch.io/tools/research-lab"
        />
      </Helmet>
      <header className="rl-title">
        <h1>Research Lab</h1>
        <p>
          Ask a football question. Check the results and the prices behind it.
        </p>
      </header>
      {member ? (
        <section className="rl-compose">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy && ready && input.trim()) void run(input.trim());
            }}
          >
            <label htmlFor="rl-question">Your question</label>
            <div className="rl-inputrow">
              <textarea
                id="rl-question"
                rows={3}
                value={input}
                maxLength={240}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    (e.ctrlKey || e.metaKey) &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    if (!e.repeat) e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Example: Which teams have seen the most steam moves in Serie A this season?"
                required
              />
              <div className="rl-question-actions">
                <span className="rl-shortcut">
                  Ctrl+Enter or ⌘+Enter to run
                </span>
                <button
                  type="submit"
                  disabled={busy || !ready || !input.trim()}
                  className="rl-primary"
                >
                  {busy ? "Working…" : "Run query"}
                </button>
              </div>
            </div>
          </form>
          <div className="rl-examples">
            {[
              ...questions,
              !detail && current?.data.kind === "movement_ranking"
                ? current.data.competitions.length === 1
                  ? "What about the top five leagues?"
                  : "Serie A only?"
                : "What about away?",
            ].map((q) => (
              <button
                key={q}
                disabled={busy || !ready}
                onClick={() => {
                  setInput(q);
                  void run(q);
                }}
              >
                {q}
              </button>
            ))}
          </div>
          <details className="rl-help">
            <summary>What can I ask?</summary>
            <p>
              Ask about backing a club to win in the Premier League, Serie A, La
              Liga, Bundesliga or Ligue 1. In Europe, follow the nine English
              entrants in 2026/27. Add a venue, season, competition, last 1–50
              games, or decimal odds such as “below 2.00”. You can also rank
              teams by qualifying steam moves or drifts across the five domestic
              leagues or in one league.
            </p>
          </details>
        </section>
      ) : (
        <div className="rl-upgrade">
          <p>
            <strong>Explore a public report.</strong> Pro members can run their
            own questions and track future results.
          </p>
          <Link className="rl-primary" to="/pro">
            Explore Pro
          </Link>
        </div>
      )}
      {error && (
        <p role="alert" className="rl-warning">
          {error}{" "}
          {!ready && (
            <button
              onClick={() => {
                setError("");
                setAttempt(attempt + 1);
              }}
            >
              Retry
            </button>
          )}
        </p>
      )}
      {member && tracks.length > 0 && (
        <section className="rl-tracks">
          <h2>Tracked questions</h2>
          <div>
            {tracks.map((t) => (
              <button
                key={t.id}
                disabled={busy || !ready}
                className="rl-secondary"
                onClick={() =>
                  void act(async () =>
                    setDetail(await request<Progress>("tracks/" + t.id, token)),
                  )
                }
              >
                {t.question}
              </button>
            ))}
          </div>
        </section>
      )}
      {!current && !error && <p role="status">Loading match report…</p>}
      {detail ? (
        <>
          <section className="rl-baseline">
            <div className="rl-result-head">
              <h2>When you saved it</h2>
              <button
                className="rl-secondary"
                disabled={busy}
                onClick={() => setDetail(null)}
              >
                Back to report
              </button>
            </div>
            <Metrics s={detail.baseline} />
            <p>
              Forward record starts {dateLabel(detail.forward_from)} (UTC). The
              original season and rules are fixed.
            </p>
          </section>
          <Results
            key={"track" + detail.id}
            question={detail.question}
            data={detail.forward}
            forward
          />
          <button
            className="rl-secondary"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "Stop tracking this question and remove its saved record?",
                )
              )
                void act(async () => {
                  await request("tracks/" + detail.id, token, "DELETE");
                  setTracks(tracks.filter((t) => t.id !== detail.id));
                  setSaved(false);
                  setDetail(null);
                });
            }}
          >
            Stop tracking
          </button>
        </>
      ) : (
        current &&
        (current.data.kind === "movement_ranking" ? (
          <MovementResults key={current.question} data={current.data} />
        ) : (
          <Results
            key={current.question}
            data={current.data}
            question={current.question}
            busy={busy}
            saved={saved}
            onSave={member ? save : undefined}
          />
        ))
      )}
    </main>
  );
}
export default function ResearchLabPage() {
  const { token, isSubscribed, isLoading } = useAuth();
  if (isLoading) return <p role="status">Loading Research Lab…</p>;
  return <Lab key={token ?? "public"} token={token} member={isSubscribed} />;
}

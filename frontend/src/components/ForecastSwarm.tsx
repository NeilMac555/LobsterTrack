import type { ForecastSource } from '../types';

// Research-swarm visualization for the Forecast Engine. Every node is a
// source from the backend's registry (GET /forecast/registry) — the
// engine can't consult anything that isn't drawn here, so the animation
// doubles as the audit trail: while a run is in flight nodes pulse as
// the engine works, then each settles into the status the stage
// timeline actually recorded (done / empty / error).

export type SwarmNodeStatus = 'idle' | 'active' | 'done' | 'empty' | 'error';

interface Props {
  sources: ForecastSource[];
  nodeStates: Record<string, SwarmNodeStatus>;
  running: boolean;
}

// Hand-placed scatter for up to 9 nodes (viewBox 800x360) — a loose
// constellation rather than a grid, engine hub in the middle.
const POSITIONS: Array<[number, number]> = [
  [95, 75], [265, 42], [500, 48], [690, 88],
  [110, 280], [330, 318], [545, 305], [700, 255],
  [55, 180],
];

const HUB: [number, number] = [400, 178];

const NODE_COLOR: Record<SwarmNodeStatus, string> = {
  idle: '#334155',    // slate-700
  active: '#22d3ee',  // cyan-400
  done: '#34d399',    // emerald-400
  empty: '#64748b',   // slate-500
  error: '#f87171',   // red-400
};

export default function ForecastSwarm({ sources, nodeStates, running }: Props) {
  return (
    <svg
      viewBox="0 0 800 360"
      className="w-full h-auto select-none"
      role="img"
      aria-label="Forecast engine source registry"
    >
      <style>{`
        @keyframes swarm-dash { to { stroke-dashoffset: -32; } }
        @keyframes swarm-pulse {
          0%, 100% { opacity: 0.35; r: 9; }
          50% { opacity: 1; r: 12; }
        }
      `}</style>

      {/* edges hub -> node */}
      {sources.map((s, i) => {
        const [x, y] = POSITIONS[i % POSITIONS.length];
        const status = nodeStates[s.id] ?? 'idle';
        const activeEdge = status === 'active' && running;
        return (
          <line
            key={`edge-${s.id}`}
            x1={HUB[0]} y1={HUB[1]} x2={x} y2={y}
            stroke={activeEdge ? '#22d3ee' : status === 'done' ? '#34d39955' : '#33415555'}
            strokeWidth={activeEdge ? 1.6 : 1}
            strokeDasharray={activeEdge ? '5 11' : status === 'idle' ? '2 6' : 'none'}
            style={activeEdge ? { animation: 'swarm-dash 0.7s linear infinite' } : undefined}
          />
        );
      })}

      {/* engine hub */}
      <circle cx={HUB[0]} cy={HUB[1]} r={16} fill="#0e7490" opacity={0.25} />
      <circle
        cx={HUB[0]} cy={HUB[1]} r={9}
        fill="#22d3ee"
        style={running ? { animation: 'swarm-pulse 1.1s ease-in-out infinite' } : undefined}
      />
      <text
        x={HUB[0]} y={HUB[1] + 30}
        textAnchor="middle"
        className="fill-cyan-300"
        fontSize={11}
        fontFamily="ui-monospace, monospace"
        letterSpacing="0.1em"
      >
        ENGINE
      </text>

      {/* source nodes */}
      {sources.map((s, i) => {
        const [x, y] = POSITIONS[i % POSITIONS.length];
        const status = nodeStates[s.id] ?? 'idle';
        const color = NODE_COLOR[status];
        const labelAbove = y > HUB[1];
        return (
          <g key={s.id}>
            {status === 'active' && running && (
              <circle
                cx={x} cy={y} r={11} fill={color} opacity={0.4}
                style={{ animation: 'swarm-pulse 0.9s ease-in-out infinite' }}
              />
            )}
            <circle cx={x} cy={y} r={6.5} fill={color} />
            {status === 'done' && (
              <path
                d={`M ${x - 3} ${y} l 2.2 2.4 l 4 -4.6`}
                stroke="#022c22" strokeWidth={1.6} fill="none" strokeLinecap="round"
              />
            )}
            <text
              x={x}
              y={labelAbove ? y - 14 : y + 21}
              textAnchor="middle"
              fill={status === 'idle' ? '#64748b' : '#cbd5e1'}
              fontSize={10.5}
              fontFamily="ui-monospace, monospace"
              letterSpacing="0.06em"
            >
              {s.name.toLowerCase()}
            </text>
            <text
              x={x}
              y={labelAbove ? y - 26 : y + 33}
              textAnchor="middle"
              fill="#475569"
              fontSize={8.5}
              fontFamily="ui-monospace, monospace"
            >
              {s.tier === 2 ? 'model' : 'our data'}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

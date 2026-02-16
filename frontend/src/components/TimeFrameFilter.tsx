export type TimeFrame = '1h' | '2h' | '6h' | '12h' | '24h' | 'all';

export const TIME_FRAME_OPTIONS: { label: string; value: TimeFrame }[] = [
  { label: '1H', value: '1h' },
  { label: '2H', value: '2h' },
  { label: '6H', value: '6h' },
  { label: '12H', value: '12h' },
  { label: '24H', value: '24h' },
  { label: 'ALL', value: 'all' },
];

const HOURS_MAP: Record<TimeFrame, number | null> = {
  '1h': 1,
  '2h': 2,
  '6h': 6,
  '12h': 12,
  '24h': 24,
  'all': null,
};

interface TimeFrameFilterProps {
  value: TimeFrame;
  onChange: (tf: TimeFrame) => void;
}

export function filterByTimeFrame<T extends { timestamp: string }>(
  data: T[],
  timeFrame: TimeFrame,
): T[] {
  const hours = HOURS_MAP[timeFrame];
  if (hours === null || data.length === 0) return data;

  // Use the latest data point's timestamp as reference (not wall clock),
  // so the filter works for historical matches too
  const latestTs = new Date(data[data.length - 1].timestamp).getTime();
  const cutoff = latestTs - hours * 60 * 60 * 1000;

  return data.filter((d) => new Date(d.timestamp).getTime() >= cutoff);
}

export default function TimeFrameFilter({ value, onChange }: TimeFrameFilterProps) {
  return (
    <div className="flex bg-slate-800 rounded-lg p-1">
      {TIME_FRAME_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-2 sm:px-3 py-1.5 text-[10px] sm:text-xs font-semibold rounded-md transition-all ${
            value === opt.value
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

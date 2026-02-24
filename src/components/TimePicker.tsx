'use client';

// Custom Haven-themed time picker.
// Replaces native <input type="time"> and <select> hour/minute dropdowns
// which render inconsistently across browsers/OS (black boxes, tiny text, random popup positions).

interface TimePickerProps {
  value: string;          // "HH:MM" or "" for unset
  onChange: (val: string) => void;
  optional?: boolean;     // if true, shows a "No time" option
  className?: string;
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 6); // 6–20
const MINUTES = ['00', '15', '30', '45'];

function fmt12(h: number): string {
  if (h === 12) return '12 PM';
  if (h > 12) return `${h - 12} PM`;
  return `${h} AM`;
}

export default function TimePicker({ value, onChange, optional = false, className = '' }: TimePickerProps) {
  const selectedHour = value ? parseInt(value.split(':')[0], 10) : null;
  const selectedMin  = value ? (value.split(':')[1] || '00') : null;

  const setHour = (h: number) => {
    const m = selectedMin ?? '00';
    onChange(`${String(h).padStart(2, '0')}:${m}`);
  };

  const setMin = (m: string) => {
    if (selectedHour === null) return; // hour must be picked first
    onChange(`${String(selectedHour).padStart(2, '0')}:${m}`);
  };

  const pill = 'px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all flex-shrink-0';
  const active = `${pill} bg-emerald-600 text-white border-emerald-600`;
  const inactive = `${pill} bg-white text-gray-700 border-gray-200 hover:border-emerald-400 hover:text-emerald-600`;
  const disabled = `${pill} bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed`;

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Hour row — horizontal scroll */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {optional && (
          <button
            type="button"
            onClick={() => onChange('')}
            className={!value ? active : inactive}
          >
            None
          </button>
        )}
        {HOURS.map(h => (
          <button
            key={h}
            type="button"
            onClick={() => setHour(h)}
            className={selectedHour === h ? active : inactive}
          >
            {fmt12(h)}
          </button>
        ))}
      </div>

      {/* Minute row — only enabled once an hour is chosen */}
      <div className="flex gap-1.5">
        {MINUTES.map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setMin(m)}
            disabled={selectedHour === null}
            className={
              selectedHour === null
                ? disabled
                : selectedMin === m
                  ? active
                  : inactive
            }
          >
            :{m}
          </button>
        ))}
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className={`${pill} bg-white text-gray-400 border-gray-200 hover:text-red-400 ml-auto`}
          >
            Clear
          </button>
        )}
      </div>

      {/* Current selection display */}
      {value && (
        <p className="text-xs text-emerald-700 font-semibold">
          {fmt12(parseInt(value.split(':')[0], 10))} :{value.split(':')[1] || '00'}
        </p>
      )}
    </div>
  );
}

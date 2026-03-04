'use client';

interface Props {
  value: string;        // YYYY-MM-DD or ''
  onChange: (val: string) => void;
  minDate?: string;
  maxDate?: string;
  month: string;        // YYYY-MM controlled by parent
  onMonthChange: (m: string) => void;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function DatePickerInline({ value, onChange, minDate, maxDate, month, onMonthChange }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [year, monthNum] = month.split('-').map(Number);
  const firstDay = new Date(year, monthNum - 1, 1).getDay();
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  const prevMonth = () => {
    const d = new Date(year, monthNum - 2, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const nextMonth = () => {
    const d = new Date(year, monthNum, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const monthLabel = new Date(year, monthNum - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

  const select = (day: number) => {
    const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (minDate && dateStr < minDate) return;
    if (maxDate && dateStr > maxDate) return;
    onChange(dateStr);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      {/* Selected date display */}
      {value && (
        <p className="text-sm font-semibold text-emerald-700 text-center mb-3">
          {new Date(value + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      )}

      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7"/></svg>
        </button>
        <span className="text-sm font-semibold text-gray-800">{monthLabel}</span>
        <button type="button" onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>)}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-y-1">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isSelected = dateStr === value;
          const isToday = dateStr === today;
          const isDisabled = (minDate ? dateStr < minDate : false) || (maxDate ? dateStr > maxDate : false);
          return (
            <button
              key={day}
              type="button"
              onClick={() => select(day)}
              disabled={isDisabled}
              className={`w-9 h-9 mx-auto flex items-center justify-center rounded-full text-sm font-medium transition-all
                ${isSelected ? 'bg-emerald-600 text-white shadow-sm' :
                  isToday ? 'bg-emerald-50 text-emerald-700 font-bold' :
                  isDisabled ? 'text-gray-300 cursor-not-allowed' :
                  'text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 active:bg-emerald-100'}`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

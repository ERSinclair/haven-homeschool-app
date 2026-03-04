'use client';

import { useState } from 'react';

interface Props {
  value: string;        // YYYY-MM-DD or ''
  onChange: (val: string) => void;
  minDate?: string;
  maxDate?: string;
  month: string;        // YYYY-MM controlled by parent
  onMonthChange: (m: string) => void;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// Dropdown-style date picker that renders in normal flow (not absolute)
// so it works reliably in scrollable containers on mobile
export default function DatePickerInline({ value, onChange, minDate, maxDate, month, onMonthChange }: Props) {
  const [open, setOpen] = useState(false);
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

  const monthLabel = new Date(year, monthNum - 1, 1).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });

  const select = (day: number) => {
    const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (minDate && dateStr < minDate) return;
    if (maxDate && dateStr > maxDate) return;
    onChange(dateStr);
    setOpen(false);
  };

  return (
    <div>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full p-3.5 border border-gray-200 rounded-xl text-left text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500 flex items-center justify-between"
      >
        <span>{value ? new Date(value + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : <span className="text-gray-400">Select date</span>}</span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
      </button>

      {/* Calendar — renders in flow, not absolute */}
      {open && (
        <div className="mt-1 bg-white/60 backdrop-blur-md border border-white/40 rounded-2xl shadow-xl p-3">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={prevMonth} className="p-1 rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-600">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7"/></svg>
            </button>
            <span className="text-xs font-semibold text-gray-800">{monthLabel}</span>
            <button type="button" onClick={nextMonth} className="p-1 rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-600">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => <div key={d} className="text-center text-[9px] font-semibold text-gray-400">{d}</div>)}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-y-0.5">
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
                  className={`w-7 h-7 mx-auto flex items-center justify-center rounded-full text-[11px] font-medium transition-all
                    ${isSelected ? 'bg-emerald-600 text-white' :
                      isToday ? 'bg-emerald-50 text-emerald-700 font-bold' :
                      isDisabled ? 'text-gray-300 cursor-not-allowed' :
                      'text-gray-700 hover:bg-emerald-50 hover:text-emerald-700'}`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {value && (
            <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="mt-2 w-full text-[11px] text-gray-400 hover:text-red-400 text-center">
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';

export type ReminderOffset = '15min' | '30min' | '1hr' | '2hr' | '1day' | '2days' | null;
export type ReminderDelivery = 'push' | 'notification' | 'email';

export interface ReminderConfig {
  offset: ReminderOffset;
  delivery: ReminderDelivery[];
}

interface Props {
  value: ReminderConfig;
  onChange: (val: ReminderConfig) => void;
}

const OFFSETS: { value: ReminderOffset; label: string }[] = [
  { value: '15min',  label: '15 min' },
  { value: '30min',  label: '30 min' },
  { value: '1hr',    label: '1 hour' },
  { value: '2hr',    label: '2 hours' },
  { value: '1day',   label: '1 day' },
  { value: '2days',  label: '2 days' },
];

const DELIVERY: { value: ReminderDelivery; label: string }[] = [
  { value: 'push',         label: 'Push' },
  { value: 'notification', label: 'In-app' },
  { value: 'email',        label: 'Email' },
];

export function offsetToMs(offset: ReminderOffset): number {
  switch (offset) {
    case '15min':  return 15 * 60 * 1000;
    case '30min':  return 30 * 60 * 1000;
    case '1hr':    return 60 * 60 * 1000;
    case '2hr':    return 2 * 60 * 60 * 1000;
    case '1day':   return 24 * 60 * 60 * 1000;
    case '2days':  return 2 * 24 * 60 * 60 * 1000;
    default:       return 0;
  }
}

export default function ReminderPicker({ value, onChange }: Props) {
  const toggleDelivery = (d: ReminderDelivery) => {
    const current = value.delivery;
    const updated = current.includes(d) ? current.filter(x => x !== d) : [...current, d];
    if (updated.length === 0) return; // at least one must be selected
    onChange({ ...value, delivery: updated });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-700">Remind me before</p>
      <div className="flex flex-wrap gap-2">
        {OFFSETS.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange({ ...value, offset: value.offset === o.value ? null : o.value })}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              value.offset === o.value
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-gray-500 border-gray-200 hover:border-emerald-400'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {value.offset && (
        <div>
          <p className="text-xs text-gray-500 mb-2">Via</p>
          <div className="flex gap-2">
            {DELIVERY.map(d => (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDelivery(d.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  value.delivery.includes(d.value)
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-emerald-400'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { getStoredSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import SimpleLocationPicker from '@/components/SimpleLocationPicker';

type EventData = {
  id: string;
  title: string;
  description: string;
  category: string;
  event_date: string;
  event_time: string;
  location_name: string;
  location_details?: string;
  exact_address?: string;
  latitude?: number;
  longitude?: number;
  show_exact_location: boolean;
  age_range?: string;
  max_attendees?: number;
  host_id: string;
  host?: { name: string };
  rsvp_count?: number;
  user_rsvp?: boolean;
  user_waitlist?: boolean;
  waitlist_count?: number;
  is_private?: boolean;
  is_cancelled?: boolean;
  cover_image_url?: string | null;
  recurrence_rule?: 'weekly' | 'fortnightly' | 'monthly' | null;
  recurrence_end_date?: string | null;
  is_recurring_instance?: boolean;
};

export default function CreateEventModal({
  onClose,
  onCreated,
  userId,
}: {
  onClose: () => void;
  onCreated: (event: EventData) => void;
  userId: string;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Educational');
  const [customCategory, setCustomCategory] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [exactLocation, setExactLocation] = useState<{
    name: string;
    address: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [ageRange, setAgeRange] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<'none' | 'weekly' | 'fortnightly' | 'monthly'>('none');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [maxAttendees, setMaxAttendees] = useState('');
  const [saving, setSaving] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null);

  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setCoverImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const handleCreate = async () => {
    if (!title || !date) return;
    if (!exactLocation) { setLocationError(true); return; }
    
    const session = getStoredSession();
    if (!session) return;

    setSaving(true);

    try {
      const eventData = {
        host_id: userId,
        title,
        description,
        category: category === 'Other' ? (customCategory || 'Other') : category,
        event_date: date,
        event_time: time,
        age_range: ageRange || null,
        is_private: isPrivate,
        show_exact_location: exactLocation ? true : false,
        location_name: exactLocation ? exactLocation.name : null,
        exact_address: exactLocation ? exactLocation.address : null,
        latitude: exactLocation ? exactLocation.lat : null,
        longitude: exactLocation ? exactLocation.lng : null,
        recurrence_rule: recurrenceRule === 'none' ? null : recurrenceRule,
        recurrence_end_date: (recurrenceRule !== 'none' && recurrenceEndDate) ? recurrenceEndDate : null,
        max_attendees: maxAttendees ? parseInt(maxAttendees) : null,
      };

      
      const res = await fetch(
        `${supabaseUrl}/rest/v1/events`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify(eventData),
        }
      );

      if (res.ok) {
        let [newEvent] = await res.json();

        // Upload cover image if selected
        if (coverImageFile && newEvent?.id) {
          const ext = coverImageFile.name.split('.').pop() || 'jpg';
          const path = `event-covers/${newEvent.id}/cover.${ext}`;
          const uploadRes = await fetch(
            `${supabaseUrl}/storage/v1/object/event-files/${path}`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': coverImageFile.type,
                'x-upsert': 'true',
              },
              body: coverImageFile,
            }
          );
          if (uploadRes.ok) {
            const coverUrl = `${supabaseUrl}/storage/v1/object/public/event-files/${path}`;
            await fetch(`${supabaseUrl}/rest/v1/events?id=eq.${newEvent.id}`, {
              method: 'PATCH',
              headers: {
                'apikey': supabaseKey!,
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ cover_image_url: coverUrl }),
            });
            newEvent = { ...newEvent, cover_image_url: coverUrl };
          }
        }

        // Get host name
        const hostRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=family_name,display_name`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );
        const hosts = await hostRes.json();
        
        onCreated({
          ...newEvent,
          host: hosts[0] ? { 
            name: hosts[0].display_name || hosts[0].family_name || 'You' 
          } : { name: 'You' },
          rsvp_count: 0,
          user_rsvp: false,
        });
      } else {
        const errorText = await res.text();
        console.error('Event creation failed:', res.status, errorText);
        console.error('Request data was:', eventData);
      }
    } catch (err) {
      console.error('Error creating event:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
      <div className="bg-white rounded-t-2xl w-full max-w-md flex flex-col max-h-[92vh]">
        {/* Sticky modal header */}
        <div className="flex-shrink-0 flex justify-between items-center px-6 py-4 border-b border-gray-100">
          <h2 className="text-2xl font-bold text-gray-900">Create Event</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>
        {/* Scrollable form — min-h-0 is required for overflow-y-auto to work inside a flex-col */}
        <div className="overflow-y-auto flex-1 min-h-0 p-6 pb-28" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="space-y-6">

            {/* Cover image picker */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Banner photo (optional)</label>
              <label className="block cursor-pointer group">
                {coverImagePreview ? (
                  <div className="relative w-full h-32 rounded-xl overflow-hidden">
                    <img src={coverImagePreview} alt="Cover preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-white text-sm font-semibold">Change photo</span>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-24 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center gap-2 group-hover:border-emerald-400 group-hover:bg-emerald-50 transition-colors">
                    <svg className="w-4 h-4 text-gray-400 group-hover:text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm text-gray-400 group-hover:text-emerald-600">Add banner photo</span>
                  </div>
                )}
                <input type="file" accept="image/*" className="sr-only" onChange={handleCoverSelect} />
              </label>
            </div>

            <div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900 placeholder-gray-400"
                placeholder="Event title"
              />
            </div>

            <div>
              <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200">
                {[
                  { value: 'Educational', label: 'Educational' },
                  { value: 'Play', label: 'Play' },
                  { value: 'Other', label: 'Other' }
                ].map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setCategory(cat.value)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      category === cat.value ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              {/* Custom category description for "Other" */}
              {category === 'Other' && (
                <div className="mt-3">
                  <input
                    type="text"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900 placeholder-gray-400"
                    placeholder="Describe your event category..."
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900"
                />
              </div>
              {/* Custom time picker */}
              <div className="flex gap-2">
                <select
                  value={(() => {
                    const [h] = time.split(':');
                    const hour = parseInt(h, 10);
                    return hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
                  })()}
                  onChange={(e) => {
                    const label = e.target.value;
                    const isPM = label.includes('PM');
                    const num = parseInt(label, 10);
                    const hour = num === 12 ? (isPM ? 12 : 0) : isPM ? num + 12 : num;
                    const [, m] = time.split(':');
                    setTime(`${String(hour).padStart(2, '0')}:${m || '00'}`);
                  }}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {['6 AM','7 AM','8 AM','9 AM','10 AM','11 AM','12 PM','1 PM','2 PM','3 PM','4 PM','5 PM','6 PM','7 PM','8 PM'].map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <select
                  value={(() => { const [,m] = time.split(':'); return m || '00'; })()}
                  onChange={(e) => {
                    const [h] = time.split(':');
                    setTime(`${h}:${e.target.value}`);
                  }}
                  className="w-24 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {['00','15','30','45'].map(m => (
                    <option key={m} value={m}>{m === '00' ? ':00' : `:${m}`}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Repeat / Recurrence */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Repeat</p>
              <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200">
                {([
                  { value: 'none',        label: 'Once' },
                  { value: 'weekly',      label: 'Weekly' },
                  { value: 'fortnightly', label: 'Fortnightly' },
                  { value: 'monthly',     label: 'Monthly' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRecurrenceRule(opt.value)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      recurrenceRule === opt.value ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {recurrenceRule !== 'none' && (
                <div className="mt-3">
                  <label className="text-xs text-gray-500 mb-1 block">End date (optional)</label>
                  <input
                    type="date"
                    value={recurrenceEndDate}
                    onChange={(e) => setRecurrenceEndDate(e.target.value)}
                    className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900 text-sm"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Location <span className="text-red-500">*</span>
              </label>
              <SimpleLocationPicker
                onLocationSelect={(loc) => { setExactLocation(loc); setLocationError(false); }}
                placeholder="Search for address or venue..."
              />
              {locationError && !exactLocation && (
                <p className="text-xs text-red-500 mt-1">Location is required</p>
              )}
              {exactLocation && (
                <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="text-sm font-medium text-emerald-900">{exactLocation.name}</div>
                  <div className="text-xs text-emerald-700">{exactLocation.address}</div>
                </div>
              )}
            </div>

            <div>
              <input
                type="text"
                value={ageRange}
                onChange={(e) => setAgeRange(e.target.value)}
                className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900 placeholder-gray-400"
                placeholder="Age range (optional)"
              />
            </div>

            <div>
              <input
                type="number"
                min="1"
                max="500"
                value={maxAttendees}
                onChange={(e) => setMaxAttendees(e.target.value)}
                className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900 placeholder-gray-400"
                placeholder="Max attendees (optional — leave blank for unlimited)"
              />
            </div>

            <div className="space-y-2">
              <label 
                className={`flex items-center p-3.5 rounded-xl border-2 cursor-pointer ${
                  !isPrivate 
                    ? 'border-emerald-600 bg-emerald-50'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  checked={!isPrivate}
                  onChange={() => setIsPrivate(false)}
                  className="sr-only"
                />
                <div className={`w-4 h-4 rounded-full border-2 mr-3 ${
                  !isPrivate 
                    ? 'border-emerald-600 bg-emerald-600' 
                    : 'border-gray-300'
                }`}>
                  {!isPrivate && (
                    <div className="w-full h-full rounded-full bg-white transform scale-50"></div>
                  )}
                </div>
                <div>
                  <span className={`font-medium ${
                    !isPrivate ? 'text-emerald-900' : 'text-gray-700'
                  }`}>
                    Public
                  </span>
                  <p className="text-sm text-gray-500 mt-1">Anyone can see and join this event</p>
                </div>
              </label>

              <label 
                className={`flex items-center p-3.5 rounded-xl border-2 cursor-pointer ${
                  isPrivate 
                    ? 'border-emerald-600 bg-emerald-50'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  checked={isPrivate}
                  onChange={() => setIsPrivate(true)}
                  className="sr-only"
                />
                <div className={`w-4 h-4 rounded-full border-2 mr-3 ${
                  isPrivate 
                    ? 'border-emerald-600 bg-emerald-600' 
                    : 'border-gray-300'
                }`}>
                  {isPrivate && (
                    <div className="w-full h-full rounded-full bg-white transform scale-50"></div>
                  )}
                </div>
                <div>
                  <span className={`font-medium ${
                    isPrivate ? 'text-emerald-900' : 'text-gray-700'
                  }`}>
                    Private
                  </span>
                  <p className="text-sm text-gray-500 mt-1">Only your connections can see this event</p>
                </div>
              </label>
            </div>

            <div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900 placeholder-gray-400"
                rows={4}
                placeholder="What's the plan?"
              />
            </div>
          </div>

          <div className="flex gap-4 mt-8">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!title || !date || saving || (category === 'Other' && !customCategory)}
              className="flex-1 py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
            >
              {saving ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';
import ImageCropModal from '@/components/ImageCropModal';

import { useState } from 'react';
import { getStoredSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import MapPinPicker from '@/components/MapPinPicker';

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
  const [recurrenceRule, setRecurrenceRule] = useState<'none' | 'weekly' | 'fortnightly' | 'monthly' | 'custom'>('custom');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [singleDate, setSingleDate] = useState('');
  const [customDates, setCustomDates] = useState<string[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; });
  const [maxAttendees, setMaxAttendees] = useState('');
  const [saving, setSaving] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null);
  const [coverCropSrc, setCoverCropSrc] = useState<string | null>(null);

  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const src = URL.createObjectURL(file);
    setCoverCropSrc(src);
    e.target.value = '';
  };

  const handleCoverCropConfirm = (blob: Blob) => {
    const file = new File([blob], `event-cover-${Date.now()}.jpg`, { type: 'image/jpeg' });
    setCoverImageFile(file);
    setCoverImagePreview(URL.createObjectURL(blob));
    if (coverCropSrc) URL.revokeObjectURL(coverCropSrc);
    setCoverCropSrc(null);
  };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const handleCreate = async () => {
    if (!title) return;
    if (!exactLocation) { setLocationError(true); return; }
    
    const session = getStoredSession();
    if (!session) return;

    setSaving(true);

    try {
      // For 'Date' mode: create one event per selected date
      // For recurring modes: create one event with recurrence_rule
      const datesToCreate = recurrenceRule === 'custom' ? customDates : [singleDate];

      const baseData = {
        host_id: userId,
        title,
        description,
        category: category === 'Other' ? (customCategory || 'Other') : category,
        event_time: time,
        age_range: ageRange || null,
        is_private: isPrivate,
        show_exact_location: exactLocation ? true : false,
        location_name: exactLocation ? exactLocation.name : null,
        exact_address: exactLocation ? exactLocation.address : null,
        latitude: exactLocation ? exactLocation.lat : null,
        longitude: exactLocation ? exactLocation.lng : null,
        recurrence_rule: recurrenceRule === 'custom' ? null : recurrenceRule,
        recurrence_end_date: recurrenceRule !== 'custom' && recurrenceEndDate ? recurrenceEndDate : null,
        max_attendees: maxAttendees ? parseInt(maxAttendees) : null,
      };

      // Create all events (parallel for Date mode, single for recurring)
      const responses = await Promise.all(
        datesToCreate.map(date =>
          fetch(`${supabaseUrl}/rest/v1/events`, {
            method: 'POST',
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation',
            },
            body: JSON.stringify({ ...baseData, event_date: date }),
          })
        )
      );

      const failed = responses.find(r => !r.ok);
      if (failed) {
        const errorText = await failed.text();
        console.error('Event creation failed:', failed.status, errorText);
        return;
      }

      const allCreated = await Promise.all(responses.map(r => r.json()));
      const res = { ok: true };
      if (res.ok) {
        let [newEvent] = allCreated[0];

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
      }
    } catch (err) {
      console.error('Error creating event:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    {coverCropSrc && (
      <ImageCropModal
        imageSrc={coverCropSrc}
        aspect={16/9}
        title="Crop cover photo"
        onConfirm={handleCoverCropConfirm}
        onCancel={() => { URL.revokeObjectURL(coverCropSrc); setCoverCropSrc(null); }}
      />
    )}
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/85 backdrop-blur-md rounded-2xl w-full max-w-md flex flex-col max-h-[92vh] border border-white/60 shadow-xl">
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
                maxLength={100}
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

            <div>
              {/* Time picker */}
              {(() => {
                const [hStr, mStr] = time.split(':');
                const hour24 = parseInt(hStr || '9', 10);
                const isPM = hour24 >= 12;
                const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
                const minute = Math.round(parseInt(mStr || '0', 10) / 5) * 5 % 60;
                const [showPicker, setShowPicker] = useState(false);

                const hours = [1,2,3,4,5,6,7,8,9,10,11,12];
                const minutes = [0,5,10,15,20,25,30,35,40,45,50,55];
                const formatted = `${hour12}:${String(minute).padStart(2,'0')} ${isPM ? 'PM' : 'AM'}`;

                const setHour = (h12: number) => {
                  const h24 = h12 === 12 ? (isPM ? 12 : 0) : isPM ? h12 + 12 : h12;
                  setTime(`${String(h24).padStart(2,'0')}:${String(minute).padStart(2,'0')}`);
                };
                const setMin = (m: number) => {
                  setTime(`${String(hour24).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
                };
                const toggleAmPm = (pm: boolean) => {
                  const h24 = hour12 === 12 ? (pm ? 12 : 0) : pm ? hour12 + 12 : hour12;
                  setTime(`${String(h24).padStart(2,'0')}:${String(minute).padStart(2,'0')}`);
                };

                return (
                  <div>
                    <button type="button" onClick={() => setShowPicker(v => !v)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-emerald-300 transition-colors">
                      <span className="text-sm text-gray-500">Time</span>
                      <span className="text-sm font-medium text-gray-900 font-mono">{formatted}</span>
                    </button>

                    {showPicker && (
                      <div className="mt-2 rounded-2xl border border-gray-200 overflow-hidden shadow-md bg-white">
                        {/* Selection highlight */}
                        <div className="relative" style={{height: 200}}>
                          {/* Centre line highlight */}
                          <div className="absolute inset-x-0 pointer-events-none z-10" style={{top: '50%', transform: 'translateY(-50%)', height: 40, background: 'rgba(16,185,129,0.07)', borderTop: '1.5px solid rgba(16,185,129,0.2)', borderBottom: '1.5px solid rgba(16,185,129,0.2)'}} />

                          <div className="flex h-full">
                            {/* Hours */}
                            <div className="flex-1 overflow-y-scroll" style={{scrollSnapType:'y mandatory', scrollbarWidth:'none', msOverflowStyle:'none'}}
                              ref={el => { if (el) { const idx = hours.indexOf(hour12); el.scrollTop = idx * 40; } }}>
                              <style>{`.no-scroll::-webkit-scrollbar { display: none; }`}</style>
                              <div style={{paddingTop: 80, paddingBottom: 80}}>
                                {hours.map(h => (
                                  <div key={h} onClick={() => setHour(h)}
                                    style={{scrollSnapAlign:'center', height: 40}}
                                    className={`flex items-center justify-center text-xl font-bold cursor-pointer transition-colors ${h === hour12 ? 'text-emerald-600' : 'text-gray-300'}`}>
                                    {String(h).padStart(2,'0')}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Colon */}
                            <div className="flex items-center justify-center w-5 text-xl font-bold text-gray-300 flex-shrink-0 pointer-events-none">:</div>

                            {/* Minutes */}
                            <div className="flex-1 overflow-y-scroll" style={{scrollSnapType:'y mandatory', scrollbarWidth:'none', msOverflowStyle:'none'}}
                              ref={el => { if (el) { const idx = minutes.indexOf(minute); el.scrollTop = idx * 40; } }}>
                              <div style={{paddingTop: 80, paddingBottom: 80}}>
                                {minutes.map(m => (
                                  <div key={m} onClick={() => setMin(m)}
                                    style={{scrollSnapAlign:'center', height: 40}}
                                    className={`flex items-center justify-center text-xl font-bold cursor-pointer transition-colors ${m === minute ? 'text-emerald-600' : 'text-gray-300'}`}>
                                    {String(m).padStart(2,'0')}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* AM/PM */}
                            <div className="flex flex-col items-center justify-center gap-2 px-3 flex-shrink-0 border-l border-gray-100">
                              <button type="button" onClick={() => toggleAmPm(false)}
                                className={`w-12 py-2.5 rounded-xl text-sm font-bold transition-colors ${!isPM ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:bg-gray-100'}`}>AM</button>
                              <button type="button" onClick={() => toggleAmPm(true)}
                                className={`w-12 py-2.5 rounded-xl text-sm font-bold transition-colors ${isPM ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:bg-gray-100'}`}>PM</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Repeat / Recurrence */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Repeat</p>
              <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200">
                {([
                  { value: 'custom',      label: 'Date' },
                  { value: 'weekly',      label: 'Weekly' },
                  { value: 'fortnightly', label: '2 weeks' },
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

              {/* Single date picker for recurring modes */}
              {recurrenceRule !== 'none' && recurrenceRule !== 'custom' && (() => {
                const [year, month] = calendarMonth.split('-').map(Number);
                const firstDay = new Date(year, month - 1, 1).getDay();
                const daysInMonth = new Date(year, month, 0).getDate();
                const today = new Date().toISOString().slice(0, 10);
                const prevMonth = () => {
                  const d = new Date(year, month - 2, 1);
                  setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
                };
                const nextMonth = () => {
                  const d = new Date(year, month, 1);
                  setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
                };
                const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
                return (
                  <div className="mt-3 bg-white border border-gray-200 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                      <button type="button" onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">‹</button>
                      <span className="text-sm font-semibold text-gray-900">{monthLabel}</span>
                      <button type="button" onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">›</button>
                    </div>
                    <div className="grid grid-cols-7 text-center px-2 pt-2">
                      {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                        <div key={d} className="text-[10px] font-semibold text-gray-400 py-1">{d}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 px-2 pb-3 gap-y-1">
                      {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                        const selected = singleDate === dateStr;
                        const isPast = dateStr < today;
                        return (
                          <button
                            key={day}
                            type="button"
                            disabled={isPast}
                            onClick={() => setSingleDate(dateStr)}
                            className={`h-8 w-full rounded-lg text-xs font-semibold transition-colors ${
                              selected ? 'bg-emerald-600 text-white' :
                              isPast ? 'text-gray-200 cursor-not-allowed' :
                              'text-gray-700 hover:bg-emerald-50 hover:text-emerald-600'
                            }`}
                          >{day}</button>
                        );
                      })}
                    </div>
                    {singleDate && (
                      <div className="px-4 pb-3">
                        <span className="text-xs text-emerald-600 font-semibold">{new Date(singleDate + 'T00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Custom date picker calendar */}
              {recurrenceRule === 'custom' && (() => {
                const [year, month] = calendarMonth.split('-').map(Number);
                const firstDay = new Date(year, month - 1, 1).getDay();
                const daysInMonth = new Date(year, month, 0).getDate();
                const today = new Date().toISOString().slice(0, 10);
                const prevMonth = () => {
                  const d = new Date(year, month - 2, 1);
                  setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
                };
                const nextMonth = () => {
                  const d = new Date(year, month, 1);
                  setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
                };
                const toggleDate = (dateStr: string) => {
                  setCustomDates(prev => {
                    if (prev.includes(dateStr)) {
                      if (prev.length <= 1) return prev; // always keep at least 1
                      return prev.filter(d => d !== dateStr);
                    }
                    return [...prev, dateStr].sort();
                  });
                };
                const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
                return (
                  <div className="mt-3 bg-white border border-gray-200 rounded-2xl overflow-hidden">
                    {/* Month nav */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                      <button type="button" onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">‹</button>
                      <span className="text-sm font-semibold text-gray-900">{monthLabel}</span>
                      <button type="button" onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">›</button>
                    </div>
                    {/* Day labels */}
                    <div className="grid grid-cols-7 text-center px-2 pt-2">
                      {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                        <div key={d} className="text-[10px] font-semibold text-gray-400 py-1">{d}</div>
                      ))}
                    </div>
                    {/* Days grid */}
                    <div className="grid grid-cols-7 px-2 pb-3 gap-y-1">
                      {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                        const selected = customDates.includes(dateStr);
                        const isPast = dateStr < today;
                        return (
                          <button
                            key={day}
                            type="button"
                            disabled={isPast}
                            onClick={() => toggleDate(dateStr)}
                            className={`h-8 w-full rounded-lg text-xs font-semibold transition-colors ${
                              selected ? 'bg-emerald-600 text-white' :
                              isPast ? 'text-gray-200 cursor-not-allowed' :
                              'text-gray-700 hover:bg-emerald-50 hover:text-emerald-600'
                            }`}
                          >{day}</button>
                        );
                      })}
                    </div>
                    {/* Selected count */}
                    {customDates.length > 0 && (
                      <div className="px-4 pb-3 flex items-center justify-between">
                        <span className="text-xs text-emerald-600 font-semibold">{customDates.length} date{customDates.length > 1 ? 's' : ''} selected</span>
                        <button type="button" onClick={() => setCustomDates([])} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Clear</button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Location <span className="text-red-500">*</span>
              </label>
              <MapPinPicker
                onSelect={(loc) => {
                  setExactLocation({ name: loc.name, address: loc.name, lat: loc.lat, lng: loc.lng });
                  setLocationError(false);
                }}
                initialLocation={exactLocation ? { name: exactLocation.name, lat: exactLocation.lat, lng: exactLocation.lng } : null}
                placeholder="Search for address or venue..."
              />
              {locationError && !exactLocation && (
                <p className="text-xs text-red-500 mt-1">Location is required</p>
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
                maxLength={1000}
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
              disabled={!title || (recurrenceRule === 'custom' && customDates.length === 0) || (recurrenceRule !== 'custom' && !singleDate) || saving || (category === 'Other' && !customCategory)}
              className="flex-1 py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
            >
              {saving ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

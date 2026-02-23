'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import AppHeader from '@/components/AppHeader';
import ProtectedRoute from '@/components/ProtectedRoute';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ─── Types ───────────────────────────────────────────────────────────────────

type CalItem = {
  id: string;
  title: string;
  date: string;          // YYYY-MM-DD
  time?: string;         // HH:MM
  type: 'hosting' | 'attending' | 'circle' | 'note';
  location?: string;
  description?: string;
  eventId?: string;      // links back to /events
  circleId?: string;     // links back to /circles/[id]
  noteId?: string;       // links to calendar_notes.id
  recurrenceRule?: 'weekly' | 'monthly' | 'yearly' | null;
};

type CalNote = {
  id: string;
  note_date: string;
  title?: string;
  content: string;
  recurrence_rule?: 'weekly' | 'monthly' | 'yearly' | null;
  recurrence_end_date?: string | null;
};

// ─── Recurring Note Expansion ─────────────────────────────────────────────────

function expandRecurringNote(note: CalNote): { date: string; instanceId: string }[] {
  const instances: { date: string; instanceId: string }[] = [];
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 30); // 30 days back
  const windowEnd = new Date();
  windowEnd.setFullYear(windowEnd.getFullYear() + 1); // 1 year forward

  const endDate = note.recurrence_end_date ? new Date(note.recurrence_end_date + 'T12:00:00') : windowEnd;
  const limit = endDate < windowEnd ? endDate : windowEnd;

  let current = new Date(note.note_date + 'T12:00:00');
  let count = 0;
  while (current <= limit && count < 500) {
    count++;
    const dateStr = current.toISOString().slice(0, 10);
    if (current >= windowStart) {
      instances.push({ date: dateStr, instanceId: `note-${note.id}-${dateStr}` });
    }
    if (note.recurrence_rule === 'weekly') {
      current = new Date(current);
      current.setDate(current.getDate() + 7);
    } else if (note.recurrence_rule === 'monthly') {
      current = new Date(current);
      current.setMonth(current.getMonth() + 1);
    } else if (note.recurrence_rule === 'yearly') {
      current = new Date(current);
      current.setFullYear(current.getFullYear() + 1);
    } else {
      break;
    }
  }
  return instances;
}

// ─── ICS Generator (Phase 4) ─────────────────────────────────────────────────

function generateICS(items: CalItem[]): string {
  const escape = (s: string) => s.replace(/[\\;,]/g, c => `\\${c}`).replace(/\n/g, '\\n');
  const fmtDate = (date: string, time?: string) => {
    const d = date.replace(/-/g, '');
    if (!time) return `${d}`;
    const t = time.replace(/:/g, '') + '00';
    return `${d}T${t}`;
  };

  const events = items.map(item => {
    const dtStart = item.time
      ? `DTSTART:${fmtDate(item.date, item.time)}`
      : `DTSTART;VALUE=DATE:${fmtDate(item.date)}`;
    const dtEnd = item.time
      ? `DTEND:${fmtDate(item.date, item.time.split(':').map((v, i) => i === 0 ? String(parseInt(v) + 1).padStart(2, '0') : v).join(':'))}`
      : `DTEND;VALUE=DATE:${fmtDate(item.date)}`;
    return [
      'BEGIN:VEVENT',
      `UID:haven-${item.id}@familyhaven.app`,
      dtStart,
      dtEnd,
      `SUMMARY:${escape(item.title)}`,
      item.description ? `DESCRIPTION:${escape(item.description)}` : '',
      item.location ? `LOCATION:${escape(item.location)}` : '',
      'END:VEVENT',
    ].filter(Boolean).join('\r\n');
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Haven//Family Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

function downloadICS(items: CalItem[]) {
  // Include notes in export but mark them clearly
  const ics = generateICS(items.map(i => i.type === 'note' ? { ...i, title: `[Note] ${i.title}` } : i));
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'haven-calendar.ics';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Calendar Grid ────────────────────────────────────────────────────────────

const DOT_COLORS: Record<CalItem['type'], string> = {
  hosting:   'bg-emerald-500',
  attending: 'bg-blue-400',
  circle:    'bg-violet-400',
  note:      'bg-amber-400',
};

const LABEL_COLORS: Record<CalItem['type'], string> = {
  hosting:   'bg-emerald-100 text-emerald-800 border-emerald-200',
  attending: 'bg-blue-100 text-blue-800 border-blue-200',
  circle:    'bg-violet-100 text-violet-800 border-violet-200',
  note:      'bg-amber-100 text-amber-800 border-amber-200',
};

const TYPE_LABELS: Record<CalItem['type'], string> = {
  hosting:   'Hosting',
  attending: 'Attending',
  circle:    'Circle meetup',
  note:      'Note',
};

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// ─── Main Component ───────────────────────────────────────────────────────────

function CalendarContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<CalItem[]>([]);
  const [notes, setNotes] = useState<CalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = searchParams.get('date');
    return d ? new Date(d + 'T12:00:00') : new Date();
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(() => searchParams.get('date'));
  const [userId, setUserId] = useState<string | null>(null);
  // Note editing state
  const [addingNote, setAddingNote] = useState(false);
  const [editingNote, setEditingNote] = useState<CalNote | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteRecurrence, setNoteRecurrence] = useState<'none' | 'weekly' | 'monthly' | 'yearly'>('none');
  const [noteRecurrenceEnd, setNoteRecurrenceEnd] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const loadCalendarData = useCallback(async () => {
    const session = getStoredSession();
    if (!session?.user) { router.push('/login'); return; }
    setUserId(session.user.id);
    const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` };

    try {
      const [hostedRes, rsvpRes, circleRes, notesRes] = await Promise.all([
        // Events I'm hosting
        fetch(`${supabaseUrl}/rest/v1/events?host_id=eq.${session.user.id}&is_cancelled=eq.false&select=id,title,event_date,event_time,location_name,description`, { headers: h }),
        // Events I've RSVPed to
        fetch(`${supabaseUrl}/rest/v1/event_rsvps?profile_id=eq.${session.user.id}&status=eq.going&select=event_id`, { headers: h }),
        // Circles I'm in that have meetup dates
        fetch(`${supabaseUrl}/rest/v1/circle_members?member_id=eq.${session.user.id}&select=circle_id`, { headers: h }),
        // Personal calendar notes
        fetch(`${supabaseUrl}/rest/v1/calendar_notes?profile_id=eq.${session.user.id}&order=note_date.asc&select=*`, { headers: h }),
      ]);

      const allItems: CalItem[] = [];

      // Hosted events
      if (hostedRes.ok) {
        const hosted = await hostedRes.json();
        hosted.forEach((e: any) => {
          allItems.push({
            id: `hosted-${e.id}`,
            title: e.title,
            date: e.event_date,
            time: e.event_time,
            type: 'hosting',
            location: e.location_name,
            description: e.description,
            eventId: e.id,
          });
        });
      }

      // RSVPed events — fetch event details
      if (rsvpRes.ok) {
        const rsvps = await rsvpRes.json();
        const eventIds: string[] = rsvps.map((r: any) => r.event_id);
        if (eventIds.length > 0) {
          const evRes = await fetch(
            `${supabaseUrl}/rest/v1/events?id=in.(${eventIds.join(',')})&is_cancelled=eq.false&select=id,title,event_date,event_time,location_name,description`,
            { headers: h }
          );
          if (evRes.ok) {
            const evs = await evRes.json();
            evs.forEach((e: any) => {
              // Skip if already added as hosted
              if (allItems.find(i => i.eventId === e.id)) return;
              allItems.push({
                id: `attending-${e.id}`,
                title: e.title,
                date: e.event_date,
                time: e.event_time,
                type: 'attending',
                location: e.location_name,
                description: e.description,
                eventId: e.id,
              });
            });
          }
        }
      }

      // Circle meetups
      if (circleRes.ok) {
        const memberships = await circleRes.json();
        const circleIds: string[] = memberships.map((m: any) => m.circle_id);
        if (circleIds.length > 0) {
          const cRes = await fetch(
            `${supabaseUrl}/rest/v1/circles?id=in.(${circleIds.join(',')})&next_meetup_date=not.is.null&select=id,name,next_meetup_date,next_meetup_time,meetup_location,meetup_notes`,
            { headers: h }
          );
          if (cRes.ok) {
            const circles = await cRes.json();
            circles.forEach((c: any) => {
              allItems.push({
                id: `circle-${c.id}`,
                title: `${c.name} meetup`,
                date: c.next_meetup_date,
                time: c.next_meetup_time,
                type: 'circle',
                location: c.meetup_location,
                description: c.meetup_notes,
                circleId: c.id,
              });
            });
          }
        }
      }

      // Personal notes
      let loadedNotes: CalNote[] = [];
      if (notesRes.ok) {
        loadedNotes = await notesRes.json();
        setNotes(loadedNotes);
        loadedNotes.forEach((n: CalNote) => {
          if (n.recurrence_rule) {
            // Expand recurring note into multiple instances
            expandRecurringNote(n).forEach(({ date, instanceId }) => {
              allItems.push({
                id: instanceId,
                title: n.title || 'Note',
                date,
                type: 'note',
                description: n.content,
                noteId: n.id,
                recurrenceRule: n.recurrence_rule,
              });
            });
          } else {
            allItems.push({
              id: `note-${n.id}`,
              title: n.title || 'Note',
              date: n.note_date,
              type: 'note',
              description: n.content,
              noteId: n.id,
            });
          }
        });
      }

      setItems(allItems.sort((a, b) => a.date.localeCompare(b.date)));
    } catch (err) {
      console.error('Calendar load error:', err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadCalendarData(); }, [loadCalendarData]);

  // ── Calendar grid ──────────────────────────────────────────────────────────

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const startOffset = (firstDayOfWeek + 6) % 7; // Mon-first

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const itemsByDate: Record<string, CalItem[]> = {};
  items.forEach(item => {
    if (!itemsByDate[item.date]) itemsByDate[item.date] = [];
    itemsByDate[item.date].push(item);
  });

  const todayStr = new Date().toISOString().slice(0, 10);

  const dayItems = selectedDate ? (itemsByDate[selectedDate] || []) : [];

  const handleItemClick = (item: CalItem) => {
    if (item.eventId) router.push(`/events?manage=${item.eventId}`);
    else if (item.circleId) router.push(`/circles/${item.circleId}`);
    // Notes are handled inline — no navigation
  };

  const startAddNote = () => {
    setEditingNote(null);
    setNoteTitle('');
    setNoteContent('');
    setNoteRecurrence('none');
    setNoteRecurrenceEnd('');
    setAddingNote(true);
  };

  const startEditNote = (note: CalNote) => {
    setEditingNote(note);
    setNoteTitle(note.title || '');
    setNoteContent(note.content);
    setNoteRecurrence(note.recurrence_rule || 'none');
    setNoteRecurrenceEnd(note.recurrence_end_date || '');
    setAddingNote(true);
  };

  const cancelNote = () => {
    setAddingNote(false);
    setEditingNote(null);
    setNoteTitle('');
    setNoteContent('');
    setNoteRecurrence('none');
    setNoteRecurrenceEnd('');
  };

  const saveNote = async () => {
    if (!noteContent.trim() || !selectedDate) return;
    setSavingNote(true);
    const session = getStoredSession();
    if (!session) { setSavingNote(false); return; }
    const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
    try {
      if (editingNote) {
        // Update existing note
        const recurrencePayload = {
          title: noteTitle.trim() || null,
          content: noteContent.trim(),
          recurrence_rule: noteRecurrence === 'none' ? null : noteRecurrence,
          recurrence_end_date: noteRecurrence !== 'none' && noteRecurrenceEnd ? noteRecurrenceEnd : null,
        };
        const res = await fetch(`${supabaseUrl}/rest/v1/calendar_notes?id=eq.${editingNote.id}`, {
          method: 'PATCH',
          headers: { ...h, 'Prefer': 'return=representation' },
          body: JSON.stringify(recurrencePayload),
        });
        if (res.ok) {
          const [updated] = await res.json();
          // Re-fetch all notes to correctly rebuild recurring instances
          setNotes(prev => prev.map(n => n.id === editingNote.id ? updated : n));
          // Remove old instances for this note, re-expand
          setItems(prev => {
            const filtered = prev.filter(i => i.noteId !== editingNote.id);
            if (updated.recurrence_rule) {
              const newInstances = expandRecurringNote(updated).map(({ date, instanceId }) => ({
                id: instanceId,
                title: updated.title || 'Note',
                date,
                type: 'note' as const,
                description: updated.content,
                noteId: updated.id,
                recurrenceRule: updated.recurrence_rule,
              }));
              return [...filtered, ...newInstances].sort((a, b) => a.date.localeCompare(b.date));
            }
            return [...filtered, {
              id: `note-${updated.id}`,
              title: updated.title || 'Note',
              date: updated.note_date,
              type: 'note' as const,
              description: updated.content,
              noteId: updated.id,
            }].sort((a, b) => a.date.localeCompare(b.date));
          });
        }
      } else {
        // Create new note
        const recurrencePayload = {
          profile_id: userId,
          note_date: selectedDate,
          title: noteTitle.trim() || null,
          content: noteContent.trim(),
          recurrence_rule: noteRecurrence === 'none' ? null : noteRecurrence,
          recurrence_end_date: noteRecurrence !== 'none' && noteRecurrenceEnd ? noteRecurrenceEnd : null,
        };
        const res = await fetch(`${supabaseUrl}/rest/v1/calendar_notes`, {
          method: 'POST',
          headers: { ...h, 'Prefer': 'return=representation' },
          body: JSON.stringify(recurrencePayload),
        });
        if (res.ok) {
          const [created] = await res.json();
          setNotes(prev => [...prev, created]);
          if (created.recurrence_rule) {
            const newInstances = expandRecurringNote(created).map(({ date, instanceId }) => ({
              id: instanceId,
              title: created.title || 'Note',
              date,
              type: 'note' as const,
              description: created.content,
              noteId: created.id,
              recurrenceRule: created.recurrence_rule,
            }));
            setItems(prev => [...prev, ...newInstances].sort((a, b) => a.date.localeCompare(b.date)));
          } else {
            setItems(prev => [...prev, {
              id: `note-${created.id}`,
              title: created.title || 'Note',
              date: created.note_date,
              type: 'note' as const,
              description: created.content,
              noteId: created.id,
            }].sort((a, b) => a.date.localeCompare(b.date)));
          }
        }
      }
      cancelNote();
    } catch { /* silent */ }
    finally { setSavingNote(false); }
  };

  const deleteNote = async (noteId: string) => {
    const session = getStoredSession();
    if (!session) return;
    try {
      await fetch(`${supabaseUrl}/rest/v1/calendar_notes?id=eq.${noteId}`, {
        method: 'DELETE',
        headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` },
      });
      setNotes(prev => prev.filter(n => n.id !== noteId));
      setItems(prev => prev.filter(i => i.noteId !== noteId));
    } catch { /* silent */ }
  };

  const formatTime = (t?: string) => {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hour = parseInt(h);
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
  };

  const formatDateLong = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });

  // ── Upcoming (next 7 days) ──────────────────────────────────────────────────

  const upcoming = items.filter(i => i.date >= todayStr && i.date <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white pb-32">
        <div className="max-w-md mx-auto px-4 pb-8 pt-2">
          <div className="mb-6">
            <Link href="/profile" className="text-emerald-600 hover:text-emerald-700 font-medium">← Profile</Link>
          </div>

          <AppHeader />

          {/* Top actions */}
          <div className="flex gap-1 mb-4 bg-white rounded-xl p-1 border border-gray-200">
            <Link
              href="/events?create=1"
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all text-center bg-emerald-600 text-white shadow-sm"
            >
              + Add event
            </Link>
            <button
              onClick={() => downloadICS(items)}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all text-gray-500 hover:text-gray-700"
            >
              Export .ics
            </button>
          </div>

          {/* Upcoming strip */}
          {upcoming.length === 0 && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-4 mb-5 flex items-center gap-3">
              <div className="text-2xl">🌿</div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-700">Nothing planned this week</p>
                <p className="text-xs text-gray-500 mt-0.5">Browse events or add a personal note to a day below</p>
              </div>
              <Link href="/events" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex-shrink-0">
                Browse
              </Link>
            </div>
          )}

          {upcoming.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Next 7 days</p>
              <div className="space-y-2">
                {upcoming.map(item => (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className="w-full text-left bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm hover:shadow-md transition-shadow flex items-center gap-3"
                  >
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_COLORS[item.type]}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{item.title}</p>
                      <p className="text-xs text-gray-500">{formatDateLong(item.date)}{item.time ? ` · ${formatTime(item.time)}` : ''}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${LABEL_COLORS[item.type]}`}>
                      {TYPE_LABELS[item.type]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Calendar grid */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
            {/* Month nav */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <button
                onClick={() => { setCurrentMonth(new Date(year, month - 1, 1)); setSelectedDate(null); }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <h3 className="font-semibold text-gray-900">{MONTH_NAMES[month]} {year}</h3>
              <button
                onClick={() => { setCurrentMonth(new Date(year, month + 1, 1)); setSelectedDate(null); }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-gray-100">
              {DAY_NAMES.map(d => (
                <div key={d} className="py-2 text-center text-xs font-medium text-gray-400">{d}</div>
              ))}
            </div>

            {/* Grid cells */}
            <div className="grid grid-cols-7">
              {cells.map((day, idx) => {
                if (day === null) return <div key={`e${idx}`} className="h-12 border-b border-r border-gray-50 last:border-r-0" />;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayItems = itemsByDate[dateStr] || [];
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDate;
                const isPast = dateStr < todayStr;

                // Collect unique dot types for this day
                const dotTypes = [...new Set(dayItems.map(i => i.type))];

                return (
                  <button
                    key={day}
                    onClick={() => { setSelectedDate(prev => prev === dateStr ? null : dateStr); cancelNote(); }}
                    className={`h-12 flex flex-col items-center justify-start pt-1.5 border-b border-r border-gray-50 last:border-r-0 transition-colors ${
                      isSelected ? 'bg-emerald-600' : isToday ? 'bg-emerald-50' : isPast ? 'bg-gray-50/50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className={`text-xs font-semibold leading-none ${
                      isSelected ? 'text-white' : isToday ? 'text-emerald-700' : isPast ? 'text-gray-400' : 'text-gray-700'
                    }`}>{day}</span>
                    {dotTypes.length > 0 && (
                      <div className="flex gap-0.5 mt-1">
                        {dotTypes.map(type => (
                          <div key={type} className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/80' : DOT_COLORS[type]}`} />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-100 flex-wrap">
              {(Object.entries(DOT_COLORS) as [CalItem['type'], string][]).map(([type, cls]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${cls}`} />
                  <span className="text-xs text-gray-500">{TYPE_LABELS[type]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Selected day events */}
          {selectedDate && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700">{formatDateLong(selectedDate)}</p>
                <button
                  onClick={startAddNote}
                  className="text-sm font-medium text-amber-600 hover:text-amber-700 flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add note
                </button>
              </div>

              {/* Note creation / edit form */}
              {addingNote && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3 space-y-3">
                  <input
                    type="text"
                    value={noteTitle}
                    onChange={e => setNoteTitle(e.target.value)}
                    placeholder="Title (optional)"
                    className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 bg-white"
                  />
                  <textarea
                    value={noteContent}
                    onChange={e => setNoteContent(e.target.value)}
                    placeholder="What's on your mind for this day?"
                    rows={3}
                    autoFocus
                    className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 bg-white resize-none"
                  />
                  {/* Recurrence picker */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-amber-800">Repeats</p>
                    <div className="flex gap-2 flex-wrap">
                      {(['none', 'weekly', 'monthly', 'yearly'] as const).map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setNoteRecurrence(opt)}
                          className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                            noteRecurrence === opt
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-100'
                          }`}
                        >
                          {opt === 'none' ? 'Never' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                        </button>
                      ))}
                    </div>
                    {noteRecurrence !== 'none' && (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-amber-700 whitespace-nowrap">End date (optional)</label>
                        <input
                          type="date"
                          value={noteRecurrenceEnd}
                          onChange={e => setNoteRecurrenceEnd(e.target.value)}
                          className="flex-1 px-2 py-1 border border-amber-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-amber-400"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={saveNote}
                      disabled={!noteContent.trim() || savingNote}
                      className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold disabled:bg-gray-200 disabled:text-gray-400 hover:bg-amber-600 transition-colors"
                    >
                      {savingNote ? 'Saving...' : editingNote ? 'Update note' : 'Save note'}
                    </button>
                    <button
                      onClick={cancelNote}
                      className="px-4 py-2 bg-white text-gray-600 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {dayItems.length === 0 && !addingNote ? (
                <div className="text-center py-6 bg-white rounded-xl border border-gray-100">
                  <p className="text-gray-400 text-sm">Nothing here yet</p>
                  <div className="flex gap-3 justify-center mt-2">
                    <button onClick={startAddNote} className="text-amber-600 text-sm font-medium hover:underline">+ Add note</button>
                    <Link href="/events?create=1" className="text-emerald-600 text-sm font-medium hover:underline">+ Add event</Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {dayItems.map(item => (
                    item.type === 'note' ? (
                      // Note card — editable inline
                      <div key={item.id} className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                        <div className="flex items-start gap-3">
                          <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5 bg-amber-400" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {item.title !== 'Note' && <p className="font-semibold text-amber-900 text-sm">{item.title}</p>}
                              {item.recurrenceRule && (
                                <span className="text-xs text-amber-600 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">
                                  {item.recurrenceRule === 'weekly' ? 'Weekly' : item.recurrenceRule === 'monthly' ? 'Monthly' : 'Yearly'}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-amber-800 mt-0.5 whitespace-pre-wrap">{item.description}</p>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={() => {
                                const note = notes.find(n => n.id === item.noteId);
                                if (note) startEditNote(note);
                              }}
                              className="text-amber-500 hover:text-amber-700 text-xs font-medium"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => item.noteId && deleteNote(item.noteId)}
                              className="text-red-400 hover:text-red-600 text-xs font-medium"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      // Event / circle card — navigates
                      <button
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        className="w-full text-left bg-white border border-gray-100 rounded-xl px-4 py-4 shadow-sm hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${DOT_COLORS[item.type]}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold text-gray-900">{item.title}</p>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${LABEL_COLORS[item.type]}`}>
                                {TYPE_LABELS[item.type]}
                              </span>
                            </div>
                            {item.time && <p className="text-sm text-gray-500">{formatTime(item.time)}</p>}
                            {item.location && <p className="text-sm text-gray-500">{item.location}</p>}
                            {item.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{item.description}</p>}
                          </div>
                          <svg className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </button>
                    )
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {items.length === 0 && !loading && (
            <div className="text-center py-12">
              <p className="text-gray-500 font-medium mb-2">Your calendar is empty</p>
              <p className="text-gray-400 text-sm mb-4">RSVP to events or create your own to see them here</p>
              <Link href="/events" className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors">
                Browse events
              </Link>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CalendarContent />
    </Suspense>
  );
}

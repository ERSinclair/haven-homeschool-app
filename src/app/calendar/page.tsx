'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import { undoDelete } from '@/lib/undo';
import ReminderPicker, { ReminderConfig, offsetToMs } from '@/components/ReminderPicker';
import DatePickerModal from '@/components/DatePickerModal';
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
  recurrenceRule?: 'weekly' | 'fortnightly' | 'monthly' | 'yearly' | null;
};

type CalNote = {
  id: string;
  note_date: string;
  title?: string;
  content: string;
  recurrence_rule?: 'weekly' | 'fortnightly' | 'monthly' | 'yearly' | null;
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
    } else if (note.recurrence_rule === 'fortnightly') {
      current = new Date(current);
      current.setDate(current.getDate() + 14);
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
  attending: 'bg-sky-400',
  circle:    'bg-violet-400',
  note:      'bg-amber-400',
};

const LABEL_COLORS: Record<CalItem['type'], string> = {
  hosting:   'bg-emerald-100 text-emerald-800 border-emerald-200',
  attending: 'bg-sky-100 text-sky-800 border-sky-200',
  circle:    'bg-violet-100 text-violet-800 border-violet-200',
  note:      'bg-amber-100 text-amber-800 border-amber-200',
};

const TYPE_LABELS: Record<CalItem['type'], string> = {
  hosting:   'Hosting',
  attending: 'Event',
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
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(() => searchParams.get('date') || todayStr);
  const [userId, setUserId] = useState<string | null>(null);
  // Note editing state
  const [addingNote, setAddingNote] = useState(false);
  const [editingNote, setEditingNote] = useState<CalNote | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteRecurrence, setNoteRecurrence] = useState<'none' | 'weekly' | 'fortnightly' | 'monthly' | 'yearly'>('none');
  const [noteRecurrenceEnd, setNoteRecurrenceEnd] = useState('');
  const [noteReminder, setNoteReminder] = useState<ReminderConfig>({ offset: null, delivery: ['push', 'notification'] });
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [endDateMonth, setEndDateMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [savingNote, setSavingNote] = useState(false);

  const loadCalendarData = useCallback(async () => {
    const session = getStoredSession();
    if (!session?.user) { router.push('/login'); return; }
    setUserId(session.user.id);
    const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` };

    try {
      const [hostedRes, rsvpRes, circleRes, notesRes] = await Promise.all([
        // Events I'm hosting
        fetch(`${supabaseUrl}/rest/v1/events?host_id=eq.${session.user.id}&is_cancelled=eq.false&select=id,title,event_date,event_time,location_name,description,recurrence_rule,recurrence_end_date`, { headers: h }),
        // Events I've RSVPed to
        fetch(`${supabaseUrl}/rest/v1/event_rsvps?profile_id=eq.${session.user.id}&status=eq.going&select=event_id`, { headers: h }),
        // Circles I'm in that have meetup dates
        fetch(`${supabaseUrl}/rest/v1/circle_members?member_id=eq.${session.user.id}&select=circle_id`, { headers: h }),
        // Personal calendar notes
        fetch(`${supabaseUrl}/rest/v1/calendar_notes?profile_id=eq.${session.user.id}&order=note_date.asc&select=*`, { headers: h }),
      ]);

      const allItems: CalItem[] = [];

      // Hosted events (expand recurring)
      if (hostedRes.ok) {
        const hosted = await hostedRes.json();
        hosted.forEach((e: any) => {
          expandRecurringEvent(e, 'hosting').forEach((inst: any, idx: number) => {
            allItems.push({
              id: `hosted-${e.id}-${idx}`,
              title: inst.title + (idx > 0 ? '' : ''),
              date: inst.event_date,
              time: inst.event_time,
              type: 'hosting' as const,
              location: inst.location_name,
              description: inst.description,
              eventId: e.id,
            });
          });
        });
      }

      // RSVPed events — fetch event details
      if (rsvpRes.ok) {
        const rsvps = await rsvpRes.json();
        const eventIds: string[] = rsvps.map((r: any) => r.event_id);
        if (eventIds.length > 0) {
          const evRes = await fetch(
            `${supabaseUrl}/rest/v1/events?id=in.(${eventIds.join(',')})&is_cancelled=eq.false&select=id,title,event_date,event_time,location_name,description,recurrence_rule,recurrence_end_date`,
            { headers: h }
          );
          if (evRes.ok) {
            const evs = await evRes.json();
            evs.forEach((e: any) => {
              expandRecurringEvent(e, 'attending').forEach((inst: any, idx: number) => {
                if (allItems.find(i => i.eventId === e.id && i.date === inst.event_date)) return;
                allItems.push({
                  id: `attending-${e.id}-${idx}`,
                  title: inst.title,
                  date: inst.event_date,
                  time: inst.event_time,
                  type: 'attending' as const,
                  location: inst.location_name,
                  description: inst.description,
                  eventId: e.id,
                });
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


  const dayItems = itemsByDate[selectedDate] || [];

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
      // Save reminder if set
      if (noteReminder.offset) {
        const noteDate = new Date(selectedDate + 'T09:00:00');
        const remindAt = new Date(noteDate.getTime() - offsetToMs(noteReminder.offset));
        if (remindAt > new Date()) {
          await fetch(`${supabaseUrl}/rest/v1/reminders`, {
            method: 'POST',
            headers: { ...h, 'Prefer': 'return=minimal' },
            body: JSON.stringify({
              user_id: session.user.id,
              type: 'note',
              target_id: session.user.id, // placeholder — note id not needed for routing
              target_title: noteTitle.trim() || noteContent.trim().slice(0, 40),
              remind_at: remindAt.toISOString(),
              delivery: noteReminder.delivery,
            }),
          }).catch(() => {});
        }
      }
      cancelNote();
    } catch { /* silent */ }
    finally { setSavingNote(false); }
  };

  const deleteNote = (noteId: string) => {
    const session = getStoredSession();
    if (!session) return;
    // Optimistically remove from UI
    const removedNote = notes.find(n => n.id === noteId);
    setNotes(prev => prev.filter(n => n.id !== noteId));
    setItems(prev => prev.filter(i => i.noteId !== noteId));
    undoDelete({
      label: 'Note',
      onDelete: async () => {
        await fetch(`${supabaseUrl}/rest/v1/calendar_notes?id=eq.${noteId}`, {
          method: 'DELETE',
          headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` },
        });
      },
      onUndo: () => {
        if (removedNote) setNotes(prev => [...prev, removedNote]);
      },
    });
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
    <div className="min-h-screen bg-transparent flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const from = searchParams?.get('from') || '/discover';

  return (
    <ProtectedRoute>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={() => router.push(from)} />
      {/* Sheet — centred, frosted */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white/85 backdrop-blur-md rounded-2xl w-full max-w-md border border-white/60 shadow-xl pointer-events-auto" style={{ maxHeight: '92dvh', overflowY: 'auto' }}>
        {/* Header */}
        <div className="sticky top-0 bg-transparent px-4 pt-2 pb-1 z-10 flex justify-end">
          <button onClick={() => router.push(from)} className="p-1 text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="px-4 pb-8 pt-1">

          {/* Upcoming strip */}
          {upcoming.length === 0 && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-4 mb-5 flex items-center gap-3">
              <div className="text-2xl">🌿</div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-700">Nothing planned this week</p>
                <p className="text-xs text-gray-500 mt-0.5">Browse events to add them to your calendar</p>
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
                onClick={() => { setCurrentMonth(new Date(year, month - 1, 1)); }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <h3 className="font-semibold text-gray-900">{MONTH_NAMES[month]} {year}</h3>
              <button
                onClick={() => { setCurrentMonth(new Date(year, month + 1, 1)); }}
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
                    onClick={() => { setSelectedDate(dateStr); cancelNote(); }}
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
          {(
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700">{formatDateLong(selectedDate)}</p>
                <button
                  onClick={startAddNote}
                  className="text-sm font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>

                </button>
              </div>

              {/* Note creation / edit form */}
              {addingNote && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-3 space-y-4 shadow-sm">
                  <h3 className="text-lg font-bold text-gray-900">{editingNote ? 'Edit note' : ''}</h3>
                  <input
                    type="text"
                    value={noteTitle}
                    onChange={e => setNoteTitle(e.target.value)}
                    placeholder="Title (optional)"
                    className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900 placeholder-gray-400 text-sm"
                  />
                  <textarea
                    value={noteContent}
                    onChange={e => setNoteContent(e.target.value)}
                    placeholder="What's on your mind for this day?"
                    rows={3}
                    autoFocus
                    className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900 placeholder-gray-400 text-sm resize-none"
                  />
                  {/* Recurrence */}
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Repeat</p>
                    <div className="flex gap-2 flex-wrap justify-center">
                      {(['weekly', 'fortnightly', 'monthly', 'yearly'] as const).map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setNoteRecurrence(prev => prev === opt ? 'none' : opt)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                            noteRecurrence === opt
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-gray-500 border-gray-200 hover:border-emerald-400'
                          }`}
                        >
                          {opt === 'fortnightly' ? '2 Weeks' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                        </button>
                      ))}
                    </div>
                    {noteRecurrence !== 'none' && (
                      <div className="mt-3">
                        <label className="text-xs text-gray-500 mb-1 block">End date (optional)</label>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setShowEndDatePicker(v => !v)}
                            className="w-full p-3 border border-gray-200 rounded-xl bg-white text-gray-900 text-sm text-left hover:border-emerald-400 transition-colors"
                          >
                            {noteRecurrenceEnd ? new Date(noteRecurrenceEnd + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Select end date'}
                          </button>
                          {showEndDatePicker && (
                            <DatePickerModal
                              value={noteRecurrenceEnd}
                              onChange={setNoteRecurrenceEnd}
                              onClose={() => setShowEndDatePicker(false)}
                              minDate={new Date().toISOString().slice(0, 10)}
                              month={endDateMonth}
                              onMonthChange={setEndDateMonth}
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <ReminderPicker value={noteReminder} onChange={setNoteReminder} />
                  <div className="flex gap-3 mt-2">
                    <button
                      onClick={cancelNote}
                      className="flex-1 py-3.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveNote}
                      disabled={!noteContent.trim() || savingNote}
                      className="flex-1 py-3.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold disabled:bg-gray-300 disabled:text-gray-500 hover:bg-emerald-700 transition-colors"
                    >
                      {savingNote ? 'Saving...' : editingNote ? 'Update' : 'Save note'}
                    </button>
                  </div>
                </div>
              )}

              {dayItems.length === 0 && !addingNote ? (
                <div className="text-center py-6 bg-white rounded-xl border border-gray-100">
                  <p className="text-gray-400 text-sm">Nothing here yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {dayItems.map(item => (
                    item.type === 'note' ? (
                      // Note card — editable inline
                      <div key={item.id} className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                        <div className="flex items-start gap-3">
                          <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5 bg-emerald-500" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {item.title !== 'Note' && <p className="font-semibold text-emerald-900 text-sm">{item.title}</p>}
                              {item.recurrenceRule && (
                                <span className="text-xs text-emerald-600 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
                                  {item.recurrenceRule === 'weekly' ? 'Weekly' : item.recurrenceRule === 'monthly' ? 'Monthly' : 'Yearly'}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-emerald-800 mt-0.5 whitespace-pre-wrap">{item.description}</p>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={() => {
                                const note = notes.find(n => n.id === item.noteId);
                                if (note) startEditNote(note);
                              }}
                              className="text-emerald-600 hover:text-emerald-700 text-xs font-medium"
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
      </div>
    </ProtectedRoute>
  );
}

// Expand a recurring event into multiple CalItem instances within a window
function expandRecurringEvent(e: any, baseType: 'hosting' | 'attending', windowMonths = 3): any[] {
  if (!e.recurrence_rule || e.recurrence_rule === 'none') return [e];
  const items: any[] = [];
  const start = new Date(e.event_date + 'T12:00:00');
  const end = e.recurrence_end_date
    ? new Date(e.recurrence_end_date + 'T12:00:00')
    : new Date(Date.now() + windowMonths * 30 * 86400000);
  let cur = new Date(start);
  while (cur <= end) {
    items.push({ ...e, event_date: cur.toISOString().split('T')[0], _instanceOf: e.id });
    if (e.recurrence_rule === 'weekly') cur.setDate(cur.getDate() + 7);
    else if (e.recurrence_rule === 'monthly') cur.setMonth(cur.getMonth() + 1);
    else if (e.recurrence_rule === 'yearly') cur.setFullYear(cur.getFullYear() + 1);
    else break;
  }
  return items;
}


export default function CalendarPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-transparent flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CalendarContent />
    </Suspense>
  );
}

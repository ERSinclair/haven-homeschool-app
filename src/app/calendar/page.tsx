'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import { undoDelete } from '@/lib/undo';
import { toast } from '@/lib/toast';
import { getFamilyLinks } from '@/lib/familyLinks';
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
  type: 'hosting' | 'attending' | 'circle' | 'note' | 'birthday' | 'family';
  familyMemberName?: string;
  location?: string;
  description?: string;
  eventId?: string;      // links back to /events
  circleId?: string;     // links back to /circles/[id]
  noteId?: string;       // links to calendar_notes.id
  recurrenceRule?: 'weekly' | 'fortnightly' | 'monthly' | 'yearly' | null;
  category?: string;
};

type CalNote = {
  id: string;
  note_date: string;
  title?: string;
  content: string;
  recurrence_rule?: 'weekly' | 'fortnightly' | 'monthly' | 'yearly' | null;
  recurrence_end_date?: string | null;
  note_type?: 'note' | 'birthday';
  category?: string;
  note_time?: string;
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

// ─── Natural Language Parser ──────────────────────────────────────────────────

type ParsedNote = {
  title: string;
  time?: string;
  category?: string;
  recurrence?: 'weekly' | 'fortnightly' | 'monthly' | 'yearly';
};

function parseNaturalLanguage(input: string): ParsedNote {
  let remaining = input.trim();
  let time: string | undefined;
  let category: string | undefined;
  let recurrence: ParsedNote['recurrence'];

  // Time: "3pm", "3:30pm", "9am", "9:30 am", "14:00"
  const timeMatch = remaining.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
    || remaining.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (timeMatch) {
    if (timeMatch[3]) {
      // 12-hour
      let h = parseInt(timeMatch[1]);
      const m = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      if (timeMatch[3].toLowerCase() === 'pm' && h !== 12) h += 12;
      if (timeMatch[3].toLowerCase() === 'am' && h === 12) h = 0;
      time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    } else {
      // 24-hour
      time = `${String(timeMatch[1]).padStart(2, '0')}:${String(timeMatch[2]).padStart(2, '0')}`;
    }
    remaining = remaining.replace(timeMatch[0], '').trim();
  }

  // Recurrence keywords
  if (/\bevery\s+week\b|\bweekly\b/i.test(remaining)) {
    recurrence = 'weekly';
    remaining = remaining.replace(/\bevery\s+week\b|\bweekly\b/i, '').trim();
  } else if (/\bfortnightly\b|\bevery\s+2\s+weeks?\b/i.test(remaining)) {
    recurrence = 'fortnightly';
    remaining = remaining.replace(/\bfortnightly\b|\bevery\s+2\s+weeks?\b/i, '').trim();
  } else if (/\bevery\s+month\b|\bmonthly\b/i.test(remaining)) {
    recurrence = 'monthly';
    remaining = remaining.replace(/\bevery\s+month\b|\bmonthly\b/i, '').trim();
  } else if (/\bevery\s+year\b|\byearly\b|\bannually\b/i.test(remaining)) {
    recurrence = 'yearly';
    remaining = remaining.replace(/\bevery\s+year\b|\byearly\b|\bannually\b/i, '').trim();
  }

  // Category — match label or value
  const catKeywords: { pattern: RegExp; value: string }[] = [
    { pattern: /\bbills?\b/i,    value: 'bills' },
    { pattern: /\bschool\b/i,    value: 'school' },
    { pattern: /\bfamily\b/i,    value: 'family' },
    { pattern: /\bhealth\b/i,    value: 'health' },
    { pattern: /\bsocial\b/i,    value: 'social' },
    { pattern: /\bpersonal\b/i,  value: 'personal' },
  ];
  for (const kw of catKeywords) {
    if (kw.pattern.test(remaining)) {
      category = kw.value;
      remaining = remaining.replace(kw.pattern, '').trim();
      break;
    }
  }

  // Clean up stray "every" and double spaces
  remaining = remaining.replace(/\bevery\b/i, '').replace(/\s{2,}/g, ' ').trim();

  return { title: remaining || input.trim(), time, category, recurrence };
}

// ─── ICS Generator ───────────────────────────────────────────────────────────

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
  birthday:  'bg-pink-400',
  family:    'bg-gray-400',
};

const BAR_COLORS: Record<CalItem['type'], string> = {
  hosting:   'bg-emerald-100 text-emerald-800',
  attending: 'bg-sky-100 text-sky-800',
  circle:    'bg-violet-100 text-violet-800',
  note:      'bg-amber-100 text-amber-800',
  birthday:  'bg-pink-100 text-pink-800',
  family:    'bg-gray-100 text-gray-600',
};

const CATEGORIES = [
  { value: 'personal', label: 'Personal', bar: 'bg-amber-100 text-amber-800',   dot: 'bg-amber-400' },
  { value: 'bills',    label: 'Bills',    bar: 'bg-orange-100 text-orange-800', dot: 'bg-orange-500' },
  { value: 'school',   label: 'School',   bar: 'bg-blue-100 text-blue-800',     dot: 'bg-blue-400' },
  { value: 'family',   label: 'Family',   bar: 'bg-purple-100 text-purple-800', dot: 'bg-purple-400' },
  { value: 'health',   label: 'Health',   bar: 'bg-teal-100 text-teal-800',     dot: 'bg-teal-400' },
  { value: 'social',   label: 'Social',   bar: 'bg-rose-100 text-rose-800',     dot: 'bg-rose-400' },
] as const;

function getItemBarColor(item: CalItem): string {
  if (item.type === 'note' && item.category) {
    const cat = CATEGORIES.find(c => c.value === item.category);
    if (cat) return cat.bar;
  }
  return BAR_COLORS[item.type];
}

type CalViewMode = 'month' | 'week' | 'agenda';

const LABEL_COLORS: Record<CalItem['type'], string> = {
  hosting:   'bg-emerald-100 text-emerald-800 border-emerald-200',
  attending: 'bg-sky-100 text-sky-800 border-sky-200',
  circle:    'bg-violet-100 text-violet-800 border-violet-200',
  note:      'bg-amber-100 text-amber-800 border-amber-200',
  birthday:  'bg-pink-100 text-pink-800 border-pink-200',
  family:    'bg-gray-100 text-gray-600 border-gray-200',
};

const TYPE_LABELS: Record<CalItem['type'], string> = {
  hosting:   'Hosting',
  attending: 'Event',
  circle:    'Circle meetup',
  note:      'Note',
  birthday:  'Birthday',
  family:    'Family',
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
  const [isBirthday, setIsBirthday] = useState(false);
  const [birthdayName, setBirthdayName] = useState('');
  const [birthdayYear, setBirthdayYear] = useState('');
  const [calViewMode, setCalViewMode] = useState<CalViewMode>('month');
  const [noteCategory, setNoteCategory] = useState('personal');
  const [noteTime, setNoteTime] = useState('');
  const [showNoteTimePicker, setShowNoteTimePicker] = useState(false);
  const [quickInput, setQuickInput] = useState('');
  const [quickParsed, setQuickParsed] = useState<ParsedNote | null>(null);
  const [savingQuick, setSavingQuick] = useState(false);
  const [movingNote, setMovingNote] = useState<CalNote | null>(null);
  const [moveTargetDate, setMoveTargetDate] = useState('');
  const [pendingDeleteNoteId, setPendingDeleteNoteId] = useState<string | null>(null);

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
          const nType = (n.note_type === 'birthday' ? 'birthday' : 'note') as CalItem['type'];
          if (n.recurrence_rule) {
            expandRecurringNote(n).forEach(({ date, instanceId }) => {
              allItems.push({
                id: instanceId,
                title: n.title || (nType === 'birthday' ? 'Birthday' : 'Note'),
                date,
                type: nType,
                description: n.content,
                noteId: n.id,
                recurrenceRule: n.recurrence_rule,
                category: n.category,
                time: n.note_time || undefined,
              });
            });
          } else {
            allItems.push({
              id: `note-${n.id}`,
              title: n.title || (nType === 'birthday' ? 'Birthday' : 'Note'),
              date: n.note_date,
              type: nType,
              description: n.content,
              noteId: n.id,
              category: n.category,
              time: n.note_time || undefined,
            });
          }
        });
      }

      // Family shared calendars
      const familyLinks = await getFamilyLinks(session.user.id, session.access_token);
      for (const link of familyLinks) {
        const isRequester = link.requester_id === session.user.id;
        const theyShare = isRequester ? link.receiver_share_calendar : link.requester_share_calendar;
        if (!theyShare) continue;
        const otherId = isRequester ? link.receiver_id : link.requester_id;
        // Fetch their events (hosted + attending)
        const [theirHosted, theirRsvps, theirProfile] = await Promise.all([
          fetch(`${supabaseUrl}/rest/v1/events?host_id=eq.${otherId}&is_cancelled=eq.false&select=id,title,event_date,event_time,location_name`, { headers: h }).then(r => r.ok ? r.json() : []),
          fetch(`${supabaseUrl}/rest/v1/event_rsvps?profile_id=eq.${otherId}&status=eq.going&select=event_id`, { headers: h }).then(r => r.ok ? r.json() : []),
          fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${otherId}&select=family_name,display_name`, { headers: h }).then(r => r.ok ? r.json().then((d: any[]) => d[0]) : null),
        ]);
        const memberName = theirProfile?.display_name || theirProfile?.family_name?.split(' ')[0] || 'Family';
        theirHosted.forEach((e: any) => {
          allItems.push({ id: `family-host-${e.id}`, title: `${memberName}: ${e.title}`, date: e.event_date, time: e.event_time, type: 'family', location: e.location_name, familyMemberName: memberName });
        });
        if (theirRsvps.length > 0) {
          const eventIds = theirRsvps.map((r: any) => r.event_id);
          const theirEvents = await fetch(`${supabaseUrl}/rest/v1/events?id=in.(${eventIds.join(',')})&is_cancelled=eq.false&select=id,title,event_date,event_time,location_name`, { headers: h }).then(r => r.ok ? r.json() : []);
          theirEvents.forEach((e: any) => {
            if (!allItems.find(i => i.id === `family-host-${e.id}`)) {
              allItems.push({ id: `family-rsvp-${e.id}`, title: `${memberName}: ${e.title}`, date: e.event_date, time: e.event_time, type: 'family', location: e.location_name, familyMemberName: memberName });
            }
          });
        }
      }

      setItems(allItems.sort((a, b) => a.date.localeCompare(b.date)));

      // Auto-add own birthday to calendar if DOB set and not already added
      const profileRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=dob`, { headers: h });
      if (profileRes.ok) {
        const [profile] = await profileRes.json();
        if (profile?.dob) {
          const existingBirthday = loadedNotes.find(n => n.note_type === 'birthday' && n.title === 'My Birthday');
          if (!existingBirthday) {
            const hJson = { ...h, 'Content-Type': 'application/json' };
            const res = await fetch(`${supabaseUrl}/rest/v1/calendar_notes`, {
              method: 'POST',
              headers: { ...hJson, Prefer: 'return=representation' },
              body: JSON.stringify({
                profile_id: session.user.id,
                note_date: profile.dob,
                title: 'My Birthday',
                content: '',
                recurrence_rule: 'yearly',
                recurrence_end_date: null,
                note_type: 'birthday',
              }),
            });
            if (res.ok) {
              const [created] = await res.json();
              if (created) {
                const newInstances = expandRecurringNote(created).map(({ date, instanceId }) => ({
                  id: instanceId,
                  title: 'My Birthday',
                  date,
                  type: 'birthday' as const,
                  description: '',
                  noteId: created.id,
                  recurrenceRule: created.recurrence_rule,
                }));
                setItems(prev => [...prev, ...newInstances].sort((a, b) => a.date.localeCompare(b.date)));
              }
            }
          }
        }
      }

      // Daily birthday notification digest
      const today = new Date().toISOString().split('T')[0];
      const lastBirthdayCheck = localStorage.getItem('haven-birthday-check-date');
      if (lastBirthdayCheck !== today) {
        const todayBirthdays = allItems.filter(i => i.type === 'birthday' && i.date === today);
        if (todayBirthdays.length > 0) {
          // Show in-app notification via push service worker
          if ('serviceWorker' in navigator && 'PushManager' in window) {
            navigator.serviceWorker.ready.then(reg => {
              reg.showNotification('Birthdays today', {
                body: todayBirthdays.map(b => b.title).join(', '),
                icon: '/icons/icon-192.png',
                tag: 'birthday-digest',
              }).catch(() => {});
            }).catch(() => {});
          }
        }
        localStorage.setItem('haven-birthday-check-date', today);
      }
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
    if (addingNote && !isBirthday) { cancelNote(); return; }
    setEditingNote(null);
    setNoteTitle('');
    setNoteContent('');
    setNoteRecurrence('none');
    setNoteRecurrenceEnd('');
    setIsBirthday(false);
    setAddingNote(true);
  };

  const startAddBirthday = () => {
    if (addingNote && isBirthday) { cancelNote(); return; }
    setEditingNote(null);
    setBirthdayName('');
    setBirthdayYear('');
    setIsBirthday(true);
    setAddingNote(true);
  };

  const startEditNote = (note: CalNote) => {
    setEditingNote(note);
    if (note.note_type === 'birthday') {
      setBirthdayName(note.title || '');
      setBirthdayYear(note.content || '');
      setIsBirthday(true);
    } else {
      setNoteTitle(note.title || '');
      setNoteContent(note.content);
      setIsBirthday(false);
    }
    setNoteRecurrence(note.recurrence_rule || 'none');
    setNoteRecurrenceEnd(note.recurrence_end_date || '');
    setNoteCategory(note.category || 'personal');
    setNoteTime(note.note_time || '');
    setAddingNote(true);
  };

  const cancelNote = () => {
    setAddingNote(false);
    setEditingNote(null);
    setNoteTitle('');
    setNoteContent('');
    setNoteRecurrence('none');
    setNoteRecurrenceEnd('');
    setIsBirthday(false);
    setBirthdayName('');
    setBirthdayYear('');
    setNoteCategory('personal');
    setNoteTime('');
  };

  const saveBirthday = async () => {
    if (!birthdayName.trim() || !selectedDate) return;
    setSavingNote(true);
    const session = getStoredSession();
    if (!session) { setSavingNote(false); return; }
    const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
    const payload = {
      profile_id: session.user.id,
      note_date: selectedDate,
      title: birthdayName.trim(),
      content: birthdayYear.trim() || '',
      recurrence_rule: 'yearly' as const,
      recurrence_end_date: null,
      note_type: 'birthday' as const,
    };
    try {
      if (editingNote) {
        await fetch(`${supabaseUrl}/rest/v1/calendar_notes?id=eq.${editingNote.id}`, {
          method: 'PATCH', headers: { ...h, Prefer: 'return=representation' }, body: JSON.stringify(payload),
        });
        setNotes(prev => prev.map(n => n.id === editingNote.id ? { ...n, ...payload } : n));
      } else {
        const res = await fetch(`${supabaseUrl}/rest/v1/calendar_notes`, {
          method: 'POST', headers: { ...h, Prefer: 'return=representation' }, body: JSON.stringify(payload),
        });
        if (res.ok) {
          const [created] = await res.json();
          if (created) {
            setNotes(prev => [...prev, created]);
            const newInstances = expandRecurringNote(created).map(({ date, instanceId }) => ({
              id: instanceId,
              title: created.title || 'Birthday',
              date,
              type: 'birthday' as const,
              description: created.content,
              noteId: created.id,
              recurrenceRule: created.recurrence_rule,
            }));
            setItems(prev => [...prev, ...newInstances].sort((a, b) => a.date.localeCompare(b.date)));
          }
        }
      }
      cancelNote();
    } catch { /* ignore */ } finally { setSavingNote(false); }
  };

  const saveNote = async () => {
    if (isBirthday) { await saveBirthday(); return; }
    if (!noteContent.trim() || !selectedDate) return;
    setSavingNote(true);
    const session = getStoredSession();
    if (!session) { setSavingNote(false); return; }
    const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
    try {
      if (editingNote) {
        // Update existing note
        const recurrencePayload = {
          title: noteContent.trim().split('\n')[0].slice(0, 80) || null,
          content: noteContent.trim(),
          recurrence_rule: noteRecurrence === 'none' ? null : noteRecurrence,
          recurrence_end_date: noteRecurrence !== 'none' && noteRecurrenceEnd ? noteRecurrenceEnd : null,
          category: noteCategory,
          note_time: noteTime || null,
        };
        const res = await fetch(`${supabaseUrl}/rest/v1/calendar_notes?id=eq.${editingNote.id}`, {
          method: 'PATCH',
          headers: { ...h, 'Prefer': 'return=representation' },
          body: JSON.stringify(recurrencePayload),
        });
        if (res.ok) {
          const [updated] = await res.json();
          setNotes(prev => prev.map(n => n.id === editingNote.id ? updated : n));
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
                category: updated.category,
                time: updated.note_time || undefined,
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
              category: updated.category,
              time: updated.note_time || undefined,
            }].sort((a, b) => a.date.localeCompare(b.date));
          });
        }
      } else {
        // Create new note
        const recurrencePayload = {
          profile_id: userId,
          note_date: selectedDate,
          title: noteContent.trim().split('\n')[0].slice(0, 80) || null,
          content: noteContent.trim(),
          recurrence_rule: isBirthday ? 'yearly' : (noteRecurrence === 'none' ? null : noteRecurrence),
          recurrence_end_date: noteRecurrence !== 'none' && noteRecurrenceEnd ? noteRecurrenceEnd : null,
          note_type: isBirthday ? 'birthday' : 'note',
          category: noteCategory,
          note_time: noteTime || null,
        };
        const res = await fetch(`${supabaseUrl}/rest/v1/calendar_notes`, {
          method: 'POST',
          headers: { ...h, 'Prefer': 'return=representation' },
          body: JSON.stringify(recurrencePayload),
        });
        if (res.ok) {
          const [created] = await res.json();
          setNotes(prev => [...prev, created]);
          const createdType = (created.note_type === 'birthday' ? 'birthday' : 'note') as CalItem['type'];
          if (created.recurrence_rule) {
            const newInstances = expandRecurringNote(created).map(({ date, instanceId }) => ({
              id: instanceId,
              title: created.title || (createdType === 'birthday' ? 'Birthday' : 'Note'),
              date,
              type: createdType,
              description: created.content,
              noteId: created.id,
              recurrenceRule: created.recurrence_rule,
              category: created.category,
              time: created.note_time || undefined,
            }));
            setItems(prev => [...prev, ...newInstances].sort((a, b) => a.date.localeCompare(b.date)));
          } else {
            setItems(prev => [...prev, {
              id: `note-${created.id}`,
              title: created.title || (createdType === 'birthday' ? 'Birthday' : 'Note'),
              date: created.note_date,
              type: createdType,
              description: created.content,
              noteId: created.id,
              category: created.category,
              time: created.note_time || undefined,
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
              target_title: noteContent.trim().split('\n')[0].slice(0, 40),
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

  const saveQuickNote = async () => {
    if (!quickInput.trim() || !selectedDate) return;
    setSavingQuick(true);
    const session = getStoredSession();
    if (!session) { setSavingQuick(false); return; }
    const parsed = parseNaturalLanguage(quickInput.trim());
    const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
    try {
      const payload = {
        profile_id: session.user.id,
        note_date: selectedDate,
        title: parsed.title,
        content: '',
        recurrence_rule: parsed.recurrence || null,
        recurrence_end_date: null,
        note_type: 'note',
        category: parsed.category || 'personal',
        note_time: parsed.time || null,
      };
      const res = await fetch(`${supabaseUrl}/rest/v1/calendar_notes`, { method: 'POST', headers: h, body: JSON.stringify(payload) });
      if (res.ok) {
        const [created] = await res.json();
        setNotes(prev => [...prev, created]);
        const instances = created.recurrence_rule
          ? expandRecurringNote(created).map(({ date, instanceId }) => ({
              id: instanceId, title: created.title, date, type: 'note' as const,
              description: created.content, noteId: created.id, recurrenceRule: created.recurrence_rule,
              category: created.category, time: created.note_time || undefined,
            }))
          : [{ id: `note-${created.id}`, title: created.title, date: created.note_date, type: 'note' as const,
               description: created.content, noteId: created.id, category: created.category, time: created.note_time || undefined }];
        setItems(prev => [...prev, ...instances].sort((a, b) => a.date.localeCompare(b.date)));
        setQuickInput('');
        setQuickParsed(null);
      }
    } catch { /* silent */ }
    finally { setSavingQuick(false); }
  };

  const moveNote = async () => {
    if (!movingNote || !moveTargetDate) return;
    const session = getStoredSession();
    if (!session) return;
    const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
    try {
      await fetch(`${supabaseUrl}/rest/v1/calendar_notes?id=eq.${movingNote.id}`, {
        method: 'PATCH', headers: h, body: JSON.stringify({ note_date: moveTargetDate }),
      });
      setNotes(prev => prev.map(n => n.id === movingNote.id ? { ...n, note_date: moveTargetDate } : n));
      setItems(prev => {
        const filtered = prev.filter(i => i.noteId !== movingNote.id);
        const updated = { ...movingNote, note_date: moveTargetDate };
        if (updated.recurrence_rule) {
          const newInstances = expandRecurringNote(updated).map(({ date, instanceId }) => ({
            id: instanceId, title: updated.title || 'Note', date, type: (updated.note_type === 'birthday' ? 'birthday' : 'note') as CalItem['type'],
            description: updated.content, noteId: updated.id, recurrenceRule: updated.recurrence_rule,
            category: updated.category, time: updated.note_time || undefined,
          }));
          return [...filtered, ...newInstances].sort((a, b) => a.date.localeCompare(b.date));
        }
        return [...filtered, {
          id: `note-${updated.id}`, title: updated.title || 'Note', date: moveTargetDate,
          type: (updated.note_type === 'birthday' ? 'birthday' : 'note') as CalItem['type'],
          description: updated.content, noteId: updated.id, category: updated.category, time: updated.note_time || undefined,
        }].sort((a, b) => a.date.localeCompare(b.date));
      });
      setMovingNote(null);
      setMoveTargetDate('');
      setSelectedDate(moveTargetDate);
      toast('Note moved', 'success');
    } catch { toast('Failed to move note', 'error'); }
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

          {/* View mode toggle */}
          <div className="flex bg-gray-100 rounded-xl p-0.5 mb-3">
            {(['month', 'week', 'agenda'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setCalViewMode(mode)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${
                  calViewMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Agenda view */}
          {calViewMode === 'agenda' && (() => {
            const futureItems = items.filter(i => i.date >= todayStr).sort((a, b) => {
              const d = a.date.localeCompare(b.date);
              if (d !== 0) return d;
              return (a.time || '99:99').localeCompare(b.time || '99:99');
            });
            if (futureItems.length === 0) return (
              <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center mb-4">
                <p className="text-gray-400 text-sm">Nothing coming up</p>
              </div>
            );
            // Group by date
            const grouped: Record<string, CalItem[]> = {};
            futureItems.forEach(i => { if (!grouped[i.date]) grouped[i.date] = []; grouped[i.date].push(i); });
            return (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
                {Object.entries(grouped).map(([date, dateItems], gi) => (
                  <div key={date}>
                    {gi > 0 && <div className="h-px bg-gray-100 mx-4" />}
                    <div className="px-4 pt-3 pb-1">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                        {new Date(date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                        {date === todayStr && <span className="ml-2 text-emerald-600 normal-case">Today</span>}
                      </p>
                    </div>
                    {dateItems.map(item => (
                      <button
                        key={item.id}
                        onClick={() => { setSelectedDate(item.date); setCalViewMode('month'); handleItemClick(item); }}
                        className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
                      >
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_COLORS[item.type]}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                        </div>
                        {item.time && <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(item.time)}</span>}
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${LABEL_COLORS[item.type]}`}>
                          {TYPE_LABELS[item.type]}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Week view */}
          {calViewMode === 'week' && (() => {
            const sel = new Date(selectedDate + 'T12:00:00');
            const dow = (sel.getDay() + 6) % 7;
            const monday = new Date(sel); monday.setDate(sel.getDate() - dow);
            const weekDays = Array.from({ length: 7 }, (_, i) => {
              const d = new Date(monday); d.setDate(monday.getDate() + i);
              return d.toISOString().slice(0, 10);
            });
            const weekHasItems = weekDays.some(d => (itemsByDate[d] || []).length > 0);
            return (
              <div className="mb-4 space-y-2">
                {/* Week nav header */}
                <div className="flex items-center justify-between px-1 pb-1">
                  <button
                    onClick={() => { const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() - 7); setSelectedDate(d.toISOString().slice(0, 10)); setCurrentMonth(d); }}
                    className="p-2 rounded-xl hover:bg-white text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <span className="text-sm font-semibold text-gray-700">
                    {new Date(weekDays[0] + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – {new Date(weekDays[6] + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  </span>
                  <button
                    onClick={() => { const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() + 7); setSelectedDate(d.toISOString().slice(0, 10)); setCurrentMonth(d); }}
                    className="p-2 rounded-xl hover:bg-white text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>

                {/* Day rows */}
                {weekDays.map((dateStr, i) => {
                  const wItems = (itemsByDate[dateStr] || []).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
                  const isToday = dateStr === todayStr;
                  const isSelected = dateStr === selectedDate;
                  const isPast = dateStr < todayStr;
                  const dayNum = parseInt(dateStr.slice(8));
                  const dayName = DAY_NAMES[i];
                  const isWeekend = i >= 5;

                  return (
                    <div
                      key={dateStr}
                      className={`rounded-2xl border transition-all ${
                        isToday
                          ? 'bg-emerald-50 border-emerald-200 shadow-sm'
                          : isSelected
                          ? 'bg-white border-emerald-300 shadow-sm'
                          : isPast
                          ? 'bg-gray-50/60 border-gray-100'
                          : 'bg-white border-gray-100 shadow-sm'
                      }`}
                    >
                      {/* Day header row */}
                      <button
                        onClick={() => { setSelectedDate(dateStr); cancelNote(); }}
                        className="w-full flex items-center gap-3 px-4 py-3"
                      >
                        {/* Date badge */}
                        <div className={`flex flex-col items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 ${
                          isToday ? 'bg-emerald-600' : isWeekend && !isPast ? 'bg-gray-100' : isPast ? 'bg-gray-100' : 'bg-gray-100'
                        }`}>
                          <span className={`text-[10px] font-bold uppercase leading-none mb-0.5 ${isToday ? 'text-emerald-100' : 'text-gray-400'}`}>{dayName}</span>
                          <span className={`text-base font-bold leading-none ${isToday ? 'text-white' : isPast ? 'text-gray-400' : 'text-gray-800'}`}>{dayNum}</span>
                        </div>

                        {/* Summary / items preview */}
                        <div className="flex-1 min-w-0">
                          {wItems.length === 0 ? (
                            <p className={`text-sm ${isPast ? 'text-gray-300' : 'text-gray-400'}`}>
                              {isToday ? 'Nothing on today' : 'Free'}
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {wItems.slice(0, 3).map(item => {
                                const barColor = getItemBarColor(item);
                                const dotColor = DOT_COLORS[item.type];
                                return (
                                  <div key={item.id} className="flex items-center gap-2 min-w-0">
                                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
                                    {item.time && (
                                      <span className="text-[10px] text-gray-400 font-medium flex-shrink-0 w-10">
                                        {(() => {
                                          const [h, m] = item.time!.split(':').map(Number);
                                          const ampm = h >= 12 ? 'pm' : 'am';
                                          const h12 = h % 12 || 12;
                                          return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2,'0')}${ampm}`;
                                        })()}
                                      </span>
                                    )}
                                    <span className={`text-xs font-medium truncate ${isPast ? 'text-gray-400' : 'text-gray-700'}`}>{item.title}</span>
                                  </div>
                                );
                              })}
                              {wItems.length > 3 && (
                                <p className="text-[10px] text-gray-400 pl-3.5">+{wItems.length - 3} more</p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Item count badge */}
                        {wItems.length > 0 && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                            isToday ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                          }`}>{wItems.length}</span>
                        )}
                      </button>

                      {/* Expanded items — shown when this day is selected */}
                      {isSelected && wItems.length > 0 && (
                        <div className="border-t border-gray-100 divide-y divide-gray-50">
                          {wItems.map(item => (
                            <button
                              key={item.id}
                              onClick={() => handleItemClick(item)}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                            >
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_COLORS[item.type]}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{item.title}</p>
                                {item.location && <p className="text-xs text-gray-400 truncate">{item.location}</p>}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {item.time && (
                                  <span className="text-xs text-gray-400">
                                    {(() => {
                                      const [h, m] = item.time!.split(':').map(Number);
                                      const ampm = h >= 12 ? 'pm' : 'am';
                                      const h12 = h % 12 || 12;
                                      return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2,'0')}${ampm}`;
                                    })()}
                                  </span>
                                )}
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${LABEL_COLORS[item.type]}`}>
                                  {TYPE_LABELS[item.type]}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Calendar grid */}
          {calViewMode === 'month' && <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
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
                if (day === null) return <div key={`e${idx}`} className="h-[72px] border-b border-r border-gray-50 last:border-r-0" />;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayItems = itemsByDate[dateStr] || [];
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDate;
                const isPast = dateStr < todayStr;

                return (
                  <button
                    key={day}
                    onClick={() => { setSelectedDate(dateStr); cancelNote(); }}
                    className={`h-[72px] flex flex-col items-start pt-1.5 px-0.5 pb-1 border-b border-r last:border-r-0 transition-colors overflow-hidden w-full ${
                      isSelected ? 'bg-emerald-600 border-emerald-600' : isToday ? 'bg-emerald-50 border-gray-50' : isPast ? 'bg-gray-50/50 border-gray-50' : 'hover:bg-gray-50 border-gray-50'
                    }`}
                  >
                    <span className={`text-xs font-semibold leading-none mb-1 w-full text-center ${
                      isSelected ? 'text-white' : isToday ? 'text-emerald-700' : isPast ? 'text-gray-400' : 'text-gray-700'
                    }`}>{day}</span>
                    <div className="w-full space-y-px">
                      {dayItems.slice(0, 3).map(item => (
                        <div
                          key={item.id}
                          className={`w-full rounded-sm px-0.5 ${isSelected ? 'bg-white/25' : getItemBarColor(item)}`}
                        >
                          <p className={`text-[8px] font-medium leading-tight truncate ${isSelected ? 'text-white' : ''}`}>
                            {item.title}
                          </p>
                        </div>
                      ))}
                      {dayItems.length > 3 && (
                        <p className={`text-[8px] leading-tight pl-0.5 ${isSelected ? 'text-white/70' : 'text-gray-400'}`}>
                          +{dayItems.length - 3}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-t border-gray-100 flex-wrap">
              {(['hosting','attending','circle','birthday'] as CalItem['type'][]).map(type => (
                <div key={type} className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${DOT_COLORS[type]}`} />
                  <span className="text-[10px] text-gray-500">{TYPE_LABELS[type]}</span>
                </div>
              ))}
              {CATEGORIES.map(cat => (
                <div key={cat.value} className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${cat.dot}`} />
                  <span className="text-[10px] text-gray-500">{cat.label}</span>
                </div>
              ))}
            </div>
          </div>}

          {/* Selected day events */}
          {(
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700">{formatDateLong(selectedDate)}</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={startAddBirthday}
                    className="flex items-center justify-center text-gray-400 hover:text-pink-400 transition-colors"
                    title="Add birthday"
                  >
                    <svg className="w-7 h-7" viewBox="0 -1 24 25" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 6 C5.5 5 5.5 1 8 -0.5 C10.5 1 10.5 5 8 6Z" fill="currentColor" stroke="none" />
                    <rect x="7" y="6" width="2" height="4" rx="0.5" />
                    <path d="M16 6 C13.5 5 13.5 1 16 -0.5 C18.5 1 18.5 5 16 6Z" fill="currentColor" stroke="none" />
                    <rect x="15" y="6" width="2" height="4" rx="0.5" />
                    <rect x="2" y="10" width="20" height="12" rx="2" />
                    <path d="M2 13 Q5.5 11 9 13 Q12 15 15 13 Q18.5 11 22 13" strokeWidth={1.4} />
                    </svg>
                  </button>
                  <button
                    onClick={startAddNote}
                    className="flex items-center justify-center text-gray-400 hover:text-emerald-500 transition-colors"
                    title="Add note"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Note / Birthday form */}
              {addingNote && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-3 space-y-4 shadow-sm">
                  {isBirthday ? (
                    <>
                      <h3 className="text-base font-bold text-pink-600">Birthday</h3>
                      <input
                        type="text"
                        value={birthdayName}
                        onChange={e => setBirthdayName(e.target.value)}
                        placeholder="Whose birthday?"
                        autoFocus
                        className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-400 bg-white text-gray-900 placeholder-gray-400 text-sm"
                      />
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Birth year (optional — shows age)</label>
                        <input
                          type="number"
                          value={birthdayYear}
                          onChange={e => setBirthdayYear(e.target.value)}
                          placeholder={`e.g. ${new Date().getFullYear() - 5}`}
                          min={1900}
                          max={new Date().getFullYear()}
                          className="w-32 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-400 bg-white text-gray-900 text-sm"
                        />
                        {birthdayYear && parseInt(birthdayYear) > 1900 && (
                          <p className="text-xs text-gray-400 mt-1">
                            Turns {new Date().getFullYear() - parseInt(birthdayYear)} this year
                          </p>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">Repeats every year · no end date</p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-lg font-bold text-gray-900">{editingNote ? 'Edit note' : 'Add note'}</h3>
                      {/* Category chips */}
                      <div className="flex gap-1.5 flex-wrap">
                        {CATEGORIES.map(cat => (
                          <button
                            key={cat.value}
                            type="button"
                            onClick={() => setNoteCategory(cat.value)}
                            className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                              noteCategory === cat.value
                                ? `${cat.bar} border-current`
                                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                            }`}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={noteContent}
                        onChange={e => setNoteContent(e.target.value)}
                        placeholder="What's on your mind for this day?"
                        rows={3}
                        autoFocus
                        className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900 placeholder-gray-400 text-sm resize-none"
                      />
                      {/* Time (optional) — scroll-wheel picker */}
                      {(() => {
                        const [hStr, mStr] = (noteTime || '09:00').split(':');
                        const hour24 = parseInt(hStr || '9', 10);
                        const isPM = hour24 >= 12;
                        const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
                        const minute = Math.round(parseInt(mStr || '0', 10) / 5) * 5 % 60;
                        const hours = [1,2,3,4,5,6,7,8,9,10,11,12];
                        const minutes = [0,5,10,15,20,25,30,35,40,45,50,55];
                        const formatted = noteTime ? `${hour12}:${String(minute).padStart(2,'0')} ${isPM ? 'PM' : 'AM'}` : 'No time';
                        const setHour = (h12: number) => {
                          const h24 = h12 === 12 ? (isPM ? 12 : 0) : isPM ? h12 + 12 : h12;
                          setNoteTime(`${String(h24).padStart(2,'0')}:${String(minute).padStart(2,'0')}`);
                        };
                        const setMin = (m: number) => setNoteTime(`${String(hour24).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
                        const toggleAmPm = (pm: boolean) => {
                          const h24 = hour12 === 12 ? (pm ? 12 : 0) : pm ? hour12 + 12 : hour12;
                          setNoteTime(`${String(h24).padStart(2,'0')}:${String(minute).padStart(2,'0')}`);
                        };
                        return (
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-600 whitespace-nowrap">Time</span>
                              <div className="flex gap-1.5">
                                <button type="button" onMouseDown={e => e.stopPropagation()}
                                  onClick={() => { setNoteTime(''); setShowNoteTimePicker(false); }}
                                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${!noteTime ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white/60 text-gray-500 border-white/60 hover:border-emerald-300'}`}>
                                  No time
                                </button>
                                <button type="button" onMouseDown={e => e.stopPropagation()}
                                  onClick={() => { if (!noteTime) setNoteTime('09:00'); setShowNoteTimePicker(v => !v); }}
                                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${noteTime ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white/60 text-gray-500 border-white/60 hover:border-emerald-300'}`}>
                                  {noteTime ? formatted : 'Set time'}
                                </button>
                              </div>
                            </div>
                            {showNoteTimePicker && (
                              <div className="mt-2 rounded-2xl border border-white/40 overflow-hidden shadow-md" style={{ background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(16px)' }}>
                                <div className="relative" style={{height: 200}}>
                                  <div className="absolute inset-x-0 pointer-events-none z-10" style={{top: '50%', transform: 'translateY(-50%)', height: 40, background: 'rgba(16,185,129,0.07)', borderTop: '1.5px solid rgba(16,185,129,0.2)', borderBottom: '1.5px solid rgba(16,185,129,0.2)'}} />
                                  <div className="flex h-full">
                                    <div className="flex-1 overflow-y-scroll" style={{scrollSnapType:'y mandatory', scrollbarWidth:'none'}}
                                      ref={el => { if (el) el.scrollTop = hours.indexOf(hour12) * 40; }}>
                                      <div style={{paddingTop: 80, paddingBottom: 80}}>
                                        {hours.map(h => (
                                          <div key={h} onClick={() => setHour(h)} style={{scrollSnapAlign:'center', height: 40}}
                                            className={`flex items-center justify-center text-xl font-bold cursor-pointer transition-colors ${h === hour12 ? 'text-emerald-600' : 'text-gray-300'}`}>
                                            {String(h).padStart(2,'0')}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-center w-5 text-xl font-bold text-gray-300 flex-shrink-0 pointer-events-none">:</div>
                                    <div className="flex-1 overflow-y-scroll" style={{scrollSnapType:'y mandatory', scrollbarWidth:'none'}}
                                      ref={el => { if (el) el.scrollTop = minutes.indexOf(minute) * 40; }}>
                                      <div style={{paddingTop: 80, paddingBottom: 80}}>
                                        {minutes.map(m => (
                                          <div key={m} onClick={() => setMin(m)} style={{scrollSnapAlign:'center', height: 40}}
                                            className={`flex items-center justify-center text-xl font-bold cursor-pointer transition-colors ${m === minute ? 'text-emerald-600' : 'text-gray-300'}`}>
                                            {String(m).padStart(2,'0')}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
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
                    </>
                  )}
                  {/* Recurrence — hidden for birthdays */}
                  {!isBirthday && <div>
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
                  </div>}
                  {!isBirthday && <ReminderPicker value={noteReminder} onChange={setNoteReminder} />}
                  <div className="flex gap-3 mt-2">
                    <button
                      onClick={cancelNote}
                      className="flex-1 py-3.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveNote}
                      disabled={isBirthday ? !birthdayName.trim() || savingNote : !noteContent.trim() || savingNote}
                      className={`flex-1 py-3.5 rounded-xl text-sm font-semibold transition-colors ${
                        isBirthday
                          ? 'bg-pink-500 text-white hover:bg-pink-600 disabled:bg-gray-300 disabled:text-gray-500'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-300 disabled:text-gray-500'
                      }`}
                    >
                      {savingNote ? 'Saving...' : editingNote ? 'Update' : isBirthday ? 'Save birthday' : 'Save note'}
                    </button>
                  </div>
                </div>
              )}

              {/* Quick add */}
              {!addingNote && (
                <div className="mb-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={quickInput}
                      onChange={e => { setQuickInput(e.target.value); setQuickParsed(e.target.value.trim() ? parseNaturalLanguage(e.target.value) : null); }}
                      onKeyDown={e => { if (e.key === 'Enter' && quickInput.trim()) saveQuickNote(); }}
                      placeholder="Quick add: Pay rent monthly bills 1pm"
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                    {quickInput.trim() && (
                      <button onClick={saveQuickNote} disabled={savingQuick} className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                        {savingQuick ? '...' : 'Add'}
                      </button>
                    )}
                  </div>
                  {quickParsed && quickInput.trim() && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5 px-1">
                      {quickParsed.time && <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">{quickParsed.time}</span>}
                      {quickParsed.recurrence && <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">{quickParsed.recurrence}</span>}
                      {quickParsed.category && quickParsed.category !== 'personal' && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{quickParsed.category}</span>}
                    </div>
                  )}
                </div>
              )}

              {dayItems.length === 0 && !addingNote ? (
                <div className="text-center py-6 bg-white rounded-xl border border-gray-100">
                  <p className="text-gray-400 text-sm">Nothing here yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {dayItems.map(item => (
                    (item.type === 'note' || item.type === 'birthday') ? (
                      // Note / Birthday card — editable inline
                      <div key={item.id} className={item.type === 'birthday' ? 'bg-pink-50 border border-pink-200 rounded-xl px-4 py-3' : 'bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3'}>
                        <div className="flex items-start gap-3">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${item.type === 'birthday' ? 'bg-pink-400' : 'bg-emerald-500'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {item.type === 'birthday'
                              ? <p className="font-semibold text-pink-900 text-sm">{item.title || 'Birthday'}</p>
                              : item.title !== 'Note' && <p className="font-semibold text-sm text-emerald-900">{item.title}</p>
                            }
                              {item.recurrenceRule && (
                                <span className={`text-xs px-2 py-0.5 rounded-full border ${item.type === 'birthday' ? 'text-pink-600 bg-pink-100 border-pink-200' : 'text-emerald-600 bg-emerald-100 border-emerald-200'}`}>
                                  {item.recurrenceRule === 'weekly' ? 'Weekly' : item.recurrenceRule === 'monthly' ? 'Monthly' : 'Yearly'}
                                </span>
                              )}
                            </div>
                            {item.type === 'birthday' && item.description && parseInt(item.description) > 1900
                              ? <p className="text-sm mt-0.5 text-pink-700">Turns {new Date(item.date + 'T12:00:00').getFullYear() - parseInt(item.description)}</p>
                              : item.type !== 'birthday' && <p className="text-sm mt-0.5 whitespace-pre-wrap text-emerald-800">{item.description}</p>
                            }
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={() => {
                                const note = notes.find(n => n.id === item.noteId);
                                if (note) startEditNote(note);
                              }}
                              className={`text-xs font-medium ${item.type === 'birthday' ? 'text-pink-600 hover:text-pink-700' : 'text-emerald-600 hover:text-emerald-700'}`}
                            >
                              Edit
                            </button>
                            {item.type !== 'birthday' && (
                              <button
                                onClick={() => {
                                  const note = notes.find(n => n.id === item.noteId);
                                  if (note) { setMovingNote(note); setMoveTargetDate(note.note_date); }
                                }}
                                className="text-xs font-medium text-gray-400 hover:text-gray-600"
                              >
                                Move
                              </button>
                            )}
                            {pendingDeleteNoteId === item.noteId ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-gray-500">Delete?</span>
                                <button onClick={() => { deleteNote(item.noteId!); setPendingDeleteNoteId(null); }} className="text-red-500 hover:text-red-700 text-xs font-semibold">Yes</button>
                                <button onClick={() => setPendingDeleteNoteId(null)} className="text-gray-400 hover:text-gray-600 text-xs font-medium">No</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => item.noteId && setPendingDeleteNoteId(item.noteId)}
                                className="text-red-400 hover:text-red-600 text-xs font-medium"
                              >
                                Delete
                              </button>
                            )}
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


        </div>
        </div>
      </div>
      {/* Move note modal */}
      {movingNote && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <h3 className="text-base font-bold text-gray-900 mb-1">Move note</h3>
            <p className="text-sm text-gray-500 mb-4 truncate">{movingNote.title || movingNote.content}</p>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Move to date</label>
            <input
              type="date"
              value={moveTargetDate}
              onChange={e => setMoveTargetDate(e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-500 mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => { setMovingNote(null); setMoveTargetDate(''); }} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold">
                Cancel
              </button>
              <button onClick={moveNote} disabled={!moveTargetDate} className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                Move
              </button>
            </div>
          </div>
        </div>
      )}
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

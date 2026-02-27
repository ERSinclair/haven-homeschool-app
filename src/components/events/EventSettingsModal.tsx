'use client';

import { useState } from 'react';
import { getStoredSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import ImageCropModal from '@/components/ImageCropModal';

type Props = {
  event: any;
  userId: string;
  onClose: () => void;
  onUpdated: (updates: any) => void;
  onCancelled: (eventId: string) => void;
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' });
};

const formatTime = (timeStr: string) => {
  const [hours, minutes] = timeStr.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
};

export default function EventSettingsModal({ event, userId: _userId, onClose, onUpdated, onCancelled }: Props) {
  const [confirmCancelEvent, setConfirmCancelEvent] = useState(false);
  const [cancellingEvent, setCancellingEvent] = useState(false);
  const [uploadingEventCover, setUploadingEventCover] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const handleCoverFileSelected = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => setCropSrc(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const uploadEventCover = async (blob: Blob) => {
    setCropSrc(null);
    if (uploadingEventCover) return;
    setUploadingEventCover(true);
    try {
      const session = getStoredSession();
      if (!session) return;
      const path = `event-covers/${event.id}-${Date.now()}.jpg`;
      const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/event-files/${path}`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'image/jpeg',
          'x-upsert': 'true',
        },
        body: blob,
      });
      if (!uploadRes.ok) { toast('Upload failed', 'error'); return; }
      const coverUrl = `${supabaseUrl}/storage/v1/object/public/event-files/${path}`;
      await fetch(`${supabaseUrl}/rest/v1/events?id=eq.${event.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ cover_image_url: coverUrl }),
      });
      onUpdated({ cover_image_url: coverUrl });
      toast('Cover photo updated', 'success');
    } catch { toast('Upload failed', 'error'); }
    finally { setUploadingEventCover(false); }
  };

  const removeEventCover = async () => {
    try {
      const session = getStoredSession();
      if (!session) return;
      await fetch(`${supabaseUrl}/rest/v1/events?id=eq.${event.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ cover_image_url: null }),
      });
      onUpdated({ cover_image_url: null });
    } catch { /* silent */ }
  };

  const cancelEvent = async () => {
    const session = getStoredSession();
    if (!session) return;
    setCancellingEvent(true);
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/events?id=eq.${event.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ is_cancelled: true }),
      });
      if (res.ok) {
        toast('Event cancelled', 'success');
        onCancelled(event.id);
      } else {
        toast('Could not cancel event', 'error');
      }
    } catch {
      toast('Could not cancel event', 'error');
    } finally {
      setCancellingEvent(false);
    }
  };

  return (
    <>
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-white rounded-t-2xl p-6 pb-4 border-b border-gray-100">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold text-gray-900">Event Settings</h3>
            <button onClick={() => { onClose(); setConfirmCancelEvent(false); }} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {/* Title */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-1">Title</p>
                <p className="font-medium text-gray-900">{event.title}</p>
              </div>
              <button onClick={() => { onClose(); }} className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">Edit</button>
            </div>
          </div>
          {/* Date & Time */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-1">Date & Time</p>
                <p className="font-medium text-gray-900">{formatDate(event.event_date)} at {formatTime(event.event_time)}</p>
              </div>
              <button onClick={() => { onClose(); }} className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">Edit</button>
            </div>
          </div>
          {/* Location */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-1">Location</p>
                <p className="font-medium text-gray-900">{event.location_name || 'Not set'}</p>
              </div>
              <button onClick={() => { onClose(); }} className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">Edit</button>
            </div>
          </div>
          {/* Description */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 mb-1">Description</p>
                <p className="text-sm text-gray-700 line-clamp-2">{event.description || 'No description'}</p>
              </div>
              <button onClick={() => { onClose(); }} className="text-emerald-600 hover:text-emerald-700 text-sm font-medium flex-shrink-0">Edit</button>
            </div>
          </div>
          {/* Age Range */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-1">Age range</p>
                <p className="font-medium text-gray-900">{event.age_range || 'All ages'}</p>
              </div>
              <button onClick={() => { onClose(); }} className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">Edit</button>
            </div>
          </div>
          {/* Attendance */}
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Attendance</p>
            <p className="font-medium text-gray-900">{event.rsvp_count || 0} going</p>
          </div>

          {/* Cover Photo */}
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-3">Cover Photo</p>
            {event.cover_image_url ? (
              <div className="space-y-2">
                <div className="relative w-full h-24 rounded-xl overflow-hidden">
                  <img src={event.cover_image_url} alt="Cover" className="w-full h-full object-cover" />
                </div>
                <div className="flex gap-2">
                  <label className="flex-1 py-2 text-center text-sm font-semibold text-emerald-700 bg-white border border-emerald-200 rounded-xl cursor-pointer hover:bg-emerald-50 transition-colors">
                    {uploadingEventCover ? 'Uploading...' : 'Change'}
                    <input type="file" accept="image/*" className="hidden" disabled={uploadingEventCover} onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverFileSelected(f); e.target.value = ''; }} />
                  </label>
                  <button onClick={removeEventCover} className="flex-1 py-2 text-sm font-semibold text-red-600 bg-white border border-red-200 rounded-xl hover:bg-red-50 transition-colors">Remove</button>
                </div>
              </div>
            ) : (
              <label className="flex items-center justify-center w-full h-20 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-emerald-300 transition-colors">
                {uploadingEventCover ? (
                  <span className="text-sm text-gray-400">Uploading...</span>
                ) : (
                  <span className="text-sm text-gray-400">+ Add cover photo</span>
                )}
                <input type="file" accept="image/*" className="hidden" disabled={uploadingEventCover} onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverFileSelected(f); e.target.value = ''; }} />
              </label>
            )}
          </div>

          {/* Danger Zone */}
          <div className="border border-red-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-3">Danger Zone</p>
            {!confirmCancelEvent ? (
              <button
                onClick={() => setConfirmCancelEvent(true)}
                className="w-full py-2.5 bg-white border border-red-300 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-50 transition-colors"
              >
                Cancel event
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-700 font-medium">Cancel this event? Attendees won&apos;t be notified automatically.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmCancelEvent(false)}
                    className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200"
                  >
                    Keep it
                  </button>
                  <button
                    onClick={cancelEvent}
                    disabled={cancellingEvent}
                    className="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-60"
                  >
                    {cancellingEvent ? 'Cancelling...' : 'Yes, cancel'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          aspect={16 / 9}
          title="Crop cover photo"
          onConfirm={(blob) => uploadEventCover(blob)}
          onCancel={() => setCropSrc(null)}
        />
      )}
    </>
  );
}

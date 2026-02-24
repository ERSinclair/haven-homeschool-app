'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import { geocodeSuburb } from '@/lib/geocode';
import { toast } from '@/lib/toast';
import AvatarUpload from '@/components/AvatarUpload';
import ProtectedRoute from '@/components/ProtectedRoute';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const APPROACHES = ['Classical', 'Charlotte Mason', 'Unschooling', 'Eclectic', 'Montessori', 'Waldorf/Steiner', 'Relaxed', 'Faith-based', 'Online/Virtual', 'Unit Study'];
const AU_STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];
const TOTAL_STEPS = 5;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [userId, setUserId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [saving, setSaving] = useState(false);

  // Step 1 — About your family
  const [bio, setBio] = useState('');
  const [familyName, setFamilyName] = useState('');

  // Step 2 — Location (critical for Discover)
  const [suburb, setSuburb] = useState('');
  const [state, setStateVal] = useState('VIC');

  // Step 3 — Kids ages
  const [kidsAges, setKidsAges] = useState<number[]>([]);
  const [newAge, setNewAge] = useState('');

  // Step 4 — Approach
  const [approaches, setApproaches] = useState<string[]>([]);

  // Step 5 — Circle suggestions
  const [suggestedCircles, setSuggestedCircles] = useState<any[]>([]);
  const [joinedCircles, setJoinedCircles] = useState<Set<string>>(new Set());
  const [loadingCircles, setLoadingCircles] = useState(false);

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.user) { router.push('/login'); return; }
    setUserId(session.user.id);
    setAccessToken(session.access_token);

    const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` };
    fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=family_name,display_name,bio,kids_ages,homeschool_approaches,location_name,onboarding_complete`,
      { headers: h }
    )
      .then(r => r.json())
      .then(([prof]) => {
        if (!prof) return;
        if (prof.onboarding_complete) { router.replace('/discover'); return; }
        setFamilyName(prof.display_name || prof.family_name || '');
        setBio(prof.bio || '');
        setKidsAges(prof.kids_ages || []);
        setApproaches(prof.homeschool_approaches || []);
        // Pre-fill location if already set from signup
        if (prof.location_name) {
          const parts = prof.location_name.split(',');
          setSuburb(parts[0]?.trim() || '');
          setStateVal(parts[1]?.trim() || 'VIC');
        }
      })
      .catch(() => {});
  }, [router]);

  // Load circle suggestions on step 5
  useEffect(() => {
    if (step !== 5 || !accessToken) return;
    setLoadingCircles(true);
    const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${accessToken}` };
    fetch(`${supabaseUrl}/rest/v1/circles?is_active=eq.true&order=member_count.desc&limit=6&select=id,name,description,emoji,member_count`, { headers: h })
      .then(r => r.json())
      .then(data => setSuggestedCircles(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadingCircles(false));
  }, [step, accessToken]);

  const saveStep = async (stepNum: number) => {
    setSaving(true);
    try {
      const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
      let body: Record<string, any> = {};

      if (stepNum === 1) {
        body = { bio: bio.trim() || null, display_name: familyName.trim() || null };
      }

      if (stepNum === 2 && suburb.trim()) {
        const locationName = `${suburb.trim()}, ${state}`;
        // Geocode the suburb so the user appears in Discover
        const coords = await geocodeSuburb(locationName);
        body = {
          location_name: locationName,
          location_lat: coords?.lat ?? null,
          location_lng: coords?.lng ?? null,
        };
      }

      if (stepNum === 3) body = { kids_ages: kidsAges };
      if (stepNum === 4) body = { homeschool_approaches: approaches };

      if (Object.keys(body).length > 0) {
        await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, { method: 'PATCH', headers: h, body: JSON.stringify(body) });
      }
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  const handleNext = async () => {
    await saveStep(step);
    if (step < TOTAL_STEPS) setStep(s => s + 1);
    else finish();
  };

  const handleJoinCircle = async (circleId: string) => {
    if (joinedCircles.has(circleId)) return;
    const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
    try {
      await fetch(`${supabaseUrl}/rest/v1/circle_members`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ circle_id: circleId, member_id: userId, role: 'member' }),
      });
      setJoinedCircles(prev => new Set(prev).add(circleId));
    } catch { /* silent */ }
  };

  const finish = async () => {
    setSaving(true);
    try {
      const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
      await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH', headers: h,
        body: JSON.stringify({ onboarding_complete: true }),
      });
    } catch { /* silent */ }
    finally { setSaving(false); }
    router.push('/discover');
  };

  const addKid = () => {
    const age = parseInt(newAge);
    if (isNaN(age) || age < 0 || age > 18) { toast('Enter an age between 0 and 18', 'error'); return; }
    setKidsAges(prev => [...prev, age].sort((a, b) => a - b));
    setNewAge('');
  };
  const removeKid = (idx: number) => setKidsAges(prev => prev.filter((_, i) => i !== idx));
  const toggleApproach = (a: string) => setApproaches(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);

  const progress = (step / TOTAL_STEPS) * 100;
  const pillClass = "px-3 py-1.5 rounded-full text-sm font-semibold transition-all border";
  const pillActive = `${pillClass} bg-emerald-600 text-white border-emerald-600`;
  const pillInactive = `${pillClass} bg-white text-gray-700 border-gray-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200`;

  // Is the Next button allowed to proceed?
  const canProceed = () => {
    if (step === 2) return suburb.trim().length >= 2;
    return true;
  };

  const stepLabels = ['About you', 'Location', 'Your kids', 'Approach', 'Circles'];

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white pb-16">
        <div className="max-w-md mx-auto px-4 pt-8">

          {/* Haven wordmark */}
          <div className="text-center mb-6">
            <span className="font-bold text-emerald-600 text-3xl" style={{ fontFamily: 'var(--font-fredoka)' }}>Haven</span>
          </div>

          {/* Progress bar */}
          <div className="mb-8">
            <div className="flex justify-between text-xs text-gray-400 mb-1.5">
              <span className="font-medium text-gray-600">{stepLabels[step - 1]}</span>
              <button onClick={finish} className="text-gray-400 hover:text-gray-600">Skip setup</button>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between mt-1.5">
              {stepLabels.map((label, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${i < step ? 'bg-emerald-500' : 'bg-gray-200'}`}
                />
              ))}
            </div>
          </div>

          {/* ── Step 1: About your family ── */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome to Haven</h1>
                <p className="text-gray-500 text-sm">Let other families know a bit about you.</p>
              </div>
              <div className="flex justify-center">
                <AvatarUpload userId={userId} name={familyName || 'My Family'} size="xl" editable />
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Your family name</label>
                  <input
                    type="text"
                    value={familyName}
                    onChange={e => setFamilyName(e.target.value)}
                    placeholder="e.g. The Millers, or Miller Family"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">A little about your family</label>
                  <textarea
                    value={bio}
                    onChange={e => setBio(e.target.value.slice(0, 300))}
                    placeholder="Where you're based, what you love, why you're homeschooling..."
                    rows={4}
                    maxLength={300}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm resize-none"
                  />
                  <p className={`text-xs mt-1 ${bio.length >= 280 ? 'text-amber-500' : 'text-gray-400'}`}>{bio.length}/300</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Location (CRITICAL — needed for Discover) ── */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Where are you based?</h1>
                <p className="text-gray-500 text-sm">This is how local families find you. Only your suburb is shown — never your address.</p>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Suburb or town</label>
                  <input
                    type="text"
                    value={suburb}
                    onChange={e => setSuburb(e.target.value)}
                    placeholder="e.g. Torquay"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white text-sm"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">State</label>
                  <select
                    value={state}
                    onChange={e => setStateVal(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white text-sm"
                  >
                    {AU_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {suburb.trim() && (
                  <div className="flex items-center gap-2 pt-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                    <span className="text-sm text-emerald-700 font-medium">{suburb.trim()}, {state}</span>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-3 bg-gray-50 rounded-xl p-4">
                <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-gray-500">Haven only shows your suburb to other families — your exact address is never shared. You can change this at any time.</p>
              </div>
            </div>
          )}

          {/* ── Step 3: Kids ages ── */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Your kids</h1>
                <p className="text-gray-500 text-sm">Ages help families with similar-aged kids find each other.</p>
              </div>

              {kidsAges.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {kidsAges.map((age, i) => (
                    <div key={i} className="flex items-center gap-1 bg-blue-50 border border-blue-100 rounded-full px-3 py-1.5">
                      <span className="text-sm font-medium text-blue-800">{age === 0 ? 'Under 1' : `${age} yr${age !== 1 ? 's' : ''}`}</span>
                      <button onClick={() => removeKid(i)} className="text-blue-400 hover:text-blue-600 ml-1 text-base leading-none">×</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  max="18"
                  value={newAge}
                  onChange={e => setNewAge(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addKid()}
                  placeholder="Age (0–18)"
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                />
                <button onClick={addKid} className="px-5 py-3 bg-emerald-600 text-white rounded-xl font-semibold text-sm">
                  Add
                </button>
              </div>
              {kidsAges.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-4">No kids added yet — that's fine too</p>
              )}
            </div>
          )}

          {/* ── Step 4: Homeschool approach ── */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Your approach</h1>
                <p className="text-gray-500 text-sm">Pick all that describe your style. Helps families with similar values find you.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {APPROACHES.map(a => (
                  <button key={a} onClick={() => toggleApproach(a)} className={approaches.includes(a) ? pillActive : pillInactive}>
                    {a}
                  </button>
                ))}
              </div>
              {approaches.length === 0 && (
                <p className="text-xs text-gray-400 text-center">Nothing selected — you can update this later from your profile</p>
              )}
            </div>
          )}

          {/* ── Step 5: Join a circle ── */}
          {step === 5 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Join a circle</h1>
                <p className="text-gray-500 text-sm">Circles are groups where families connect, share resources and plan meetups.</p>
              </div>

              {loadingCircles ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : suggestedCircles.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-6">No circles yet — you can create one from the Circles tab</p>
              ) : (
                <div className="space-y-2">
                  {suggestedCircles.map(c => {
                    const joined = joinedCircles.has(c.id);
                    return (
                      <div key={c.id} className={`flex items-center gap-3 bg-white rounded-xl px-4 py-3 border transition-all ${joined ? 'border-emerald-300 bg-emerald-50' : 'border-gray-100'}`}>
                        <span className="text-2xl flex-shrink-0">{c.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm">{c.name}</p>
                          {c.description && <p className="text-xs text-gray-500 truncate">{c.description}</p>}
                          <p className="text-xs text-gray-400">{c.member_count} member{c.member_count !== 1 ? 's' : ''}</p>
                        </div>
                        <button
                          onClick={() => handleJoinCircle(c.id)}
                          disabled={joined}
                          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${joined ? 'bg-emerald-100 text-emerald-700 cursor-default' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                        >
                          {joined ? 'Joined ✓' : 'Join'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <Link href="/circles/discover" className="block text-center text-sm text-emerald-600 font-medium hover:underline">
                Browse all circles →
              </Link>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-8 space-y-3">
            <button
              onClick={handleNext}
              disabled={saving || !canProceed()}
              className="w-full py-3.5 bg-gray-900 text-white rounded-2xl font-bold text-base disabled:opacity-50 transition-all"
            >
              {saving ? 'Saving...' : step === TOTAL_STEPS ? "I'm all set — go to Haven" : 'Next'}
            </button>
            {step > 1 && (
              <button onClick={() => setStep(s => s - 1)} className="w-full py-2 text-sm text-gray-400 hover:text-gray-600">
                Back
              </button>
            )}
          </div>

        </div>
      </div>
    </ProtectedRoute>
  );
}

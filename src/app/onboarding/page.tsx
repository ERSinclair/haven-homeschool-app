'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import AvatarUpload from '@/components/AvatarUpload';
import ProtectedRoute from '@/components/ProtectedRoute';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const APPROACHES = ['Classical', 'Charlotte Mason', 'Unschooling', 'Eclectic', 'Montessori', 'Waldorf/Steiner', 'Relaxed', 'Faith-based', 'Online/Virtual', 'Unit Study'];
const TOTAL_STEPS = 4;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [userId, setUserId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [saving, setSaving] = useState(false);

  // Step 1 — Bio
  const [bio, setBio] = useState('');
  const [familyName, setFamilyName] = useState('');

  // Step 2 — Kids ages
  const [kidsAges, setKidsAges] = useState<number[]>([]);
  const [newAge, setNewAge] = useState('');

  // Step 3 — Approach
  const [approaches, setApproaches] = useState<string[]>([]);

  // Step 4 — Circle suggestions
  const [suggestedCircles, setSuggestedCircles] = useState<any[]>([]);
  const [joinedCircles, setJoinedCircles] = useState<Set<string>>(new Set());
  const [loadingCircles, setLoadingCircles] = useState(false);

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.user) { router.push('/login'); return; }
    setUserId(session.user.id);
    setAccessToken(session.access_token);

    // Load existing profile data
    const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` };
    fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=family_name,display_name,bio,kids_ages,homeschool_approaches,onboarding_complete`, { headers: h })
      .then(r => r.json())
      .then(([prof]) => {
        if (!prof) return;
        // If already completed, skip to discover
        if (prof.onboarding_complete) { router.replace('/discover'); return; }
        setFamilyName(prof.display_name || prof.family_name || '');
        setBio(prof.bio || '');
        setKidsAges(prof.kids_ages || []);
        setApproaches(prof.homeschool_approaches || []);
      })
      .catch(() => {});
  }, [router]);

  // Load circle suggestions when we hit step 4
  useEffect(() => {
    if (step !== 4 || !accessToken) return;
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
      if (stepNum === 1) body = { bio: bio.trim() || null, display_name: familyName.trim() || null };
      if (stepNum === 2) body = { kids_ages: kidsAges };
      if (stepNum === 3) body = { homeschool_approaches: approaches };
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

  const pillClass = "px-2 py-1.5 rounded-full text-sm font-bold transition-all shadow-sm flex items-center justify-center border";
  const pillarActive = `${pillClass} bg-emerald-600 text-white border-emerald-600`;
  const pillarInactive = `${pillClass} bg-white text-gray-700 border-gray-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200`;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white pb-16">
        <div className="max-w-md mx-auto px-4 pt-8">

          {/* Header */}
          <div className="text-center mb-6">
            <span className="font-bold text-emerald-600 text-3xl" style={{ fontFamily: 'var(--font-fredoka)' }}>Haven</span>
          </div>

          {/* Progress bar */}
          <div className="mb-8">
            <div className="flex justify-between text-xs text-gray-400 mb-1.5">
              <span>Step {step} of {TOTAL_STEPS}</span>
              <button onClick={finish} className="text-gray-400 hover:text-gray-600">Skip setup</button>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* ── Step 1: About your family ── */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome to Haven</h1>
                <p className="text-gray-500 text-sm">Let other homeschool families know a bit about you.</p>
              </div>

              {/* Avatar */}
              <div className="flex justify-center">
                <AvatarUpload userId={userId} name={familyName || 'My Family'} size="lg" editable />
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Your family name</label>
                  <input
                    type="text"
                    value={familyName}
                    onChange={e => setFamilyName(e.target.value)}
                    placeholder="e.g. The Millers, or just Miller Family"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">A little about your family</label>
                  <textarea
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    placeholder="Where you're based, what you love, why you're homeschooling..."
                    rows={4}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm resize-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">{bio.length}/300</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Kids ages ── */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Your kids</h1>
                <p className="text-gray-500 text-sm">Ages help families with similar-aged kids find each other.</p>
              </div>

              {kidsAges.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {kidsAges.map((age, i) => (
                    <div key={i} className="flex items-center gap-1 bg-blue-50 border border-blue-100 rounded-full px-3 py-1">
                      <span className="text-sm font-medium text-blue-800">{age === 0 ? 'Under 1' : `${age} year${age !== 1 ? 's' : ''}`}</span>
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
                <button
                  onClick={addKid}
                  className="px-5 py-3 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700"
                >
                  Add
                </button>
              </div>
              {kidsAges.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-4">No kids added yet — that's fine too</p>
              )}
            </div>
          )}

          {/* ── Step 3: Homeschool approach ── */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Your approach</h1>
                <p className="text-gray-500 text-sm">Pick all that describe your homeschool style. Helps families with similar values find you.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {APPROACHES.map(a => (
                  <button
                    key={a}
                    onClick={() => toggleApproach(a)}
                    className={approaches.includes(a) ? pillarActive : pillarInactive}
                  >
                    {a}
                  </button>
                ))}
              </div>
              {approaches.length === 0 && (
                <p className="text-xs text-gray-400 text-center">Nothing selected — you can always update this later in your profile</p>
              )}
            </div>
          )}

          {/* ── Step 4: Join a circle ── */}
          {step === 4 && (
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
                          {joined ? 'Joined' : 'Join'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <Link href="/circles/discover" className="block text-center text-sm text-emerald-600 font-medium hover:underline">
                Browse all circles
              </Link>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-8 space-y-3">
            <button
              onClick={handleNext}
              disabled={saving}
              className="w-full py-3.5 bg-gray-900 text-white rounded-2xl font-bold text-base hover:bg-gray-800 disabled:opacity-60 transition-colors"
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

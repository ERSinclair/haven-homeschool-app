/**
 * profilePrompts.ts
 *
 * Defines profile fields that were added over time. When a new field is added
 * to signup, add an entry here. Existing users who are missing the field will
 * see a dismissible nudge on the feed page the next time they log in.
 *
 * To add a new prompt:
 * 1. Add an entry to PROFILE_PROMPTS below
 * 2. Give it a unique `id` (format: 'field-YYYY-MM')
 * 3. Set `check` to return true when the field is missing
 * 4. Set `userTypes` to restrict to specific account types (or omit for all)
 * 5. Deploy — existing users will be nudged automatically
 */

export type ProfilePrompt = {
  /** Unique stable id — used as the localStorage dismiss key */
  id: string;
  /** Short label shown in the banner */
  label: string;
  /** Supporting copy */
  description: string;
  /** Where to send the user to fill it in */
  href: string;
  /** Returns true when the user's profile is missing this field */
  check: (profile: Record<string, any>) => boolean;
  /** Restrict to specific user_type values (omit = all types) */
  userTypes?: string[];
};

export const PROFILE_PROMPTS: ProfilePrompt[] = [
  {
    id: 'dob-2026-03',
    label: 'Add your date of birth',
    description: 'Let Haven celebrate your birthday with your connections.',
    href: '/profile?edit=1',
    check: (p) => !p?.dob,
    userTypes: ['family', 'teacher'],
  },
  // ── Add future prompts below this line ──
];

/**
 * Returns the list of prompts that apply to this profile and haven't been
 * dismissed by the user in this browser.
 */
export function getPendingPrompts(profile: Record<string, any> | null): ProfilePrompt[] {
  if (!profile) return [];
  const userType = profile.user_type || 'family';
  return PROFILE_PROMPTS.filter(prompt => {
    if (prompt.userTypes && !prompt.userTypes.includes(userType)) return false;
    if (typeof window !== 'undefined') {
      if (localStorage.getItem(`haven-prompt-dismissed-${prompt.id}`) === '1') return false;
    }
    return prompt.check(profile);
  });
}

/** Dismiss a prompt so it doesn't show again on this device */
export function dismissPrompt(id: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(`haven-prompt-dismissed-${id}`, '1');
  }
}

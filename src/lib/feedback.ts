import { getStoredSession } from './session';

export type FeedbackType = 'bug_report' | 'feedback';

export interface BugReportData {
  message: string;
  subject?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

export interface FeedbackData {
  message: string;
  subject?: string;
  type?: 'suggestion' | 'feature_request' | 'compliment' | 'complaint' | 'other';
}

export async function submitBugReport(data: BugReportData): Promise<{ success: boolean; error?: string }> {
  try {
    const session = getStoredSession();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Get user profile for name/email
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=family_name,display_name`,
      {
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
        },
      }
    );

    const profiles = await profileRes.json();
    const profile = profiles[0];

    const reportData = {
      user_id: session.user.id,
      user_name: profile?.display_name || profile?.family_name || null,
      email: session.user.email,
      subject: data.subject || 'Bug Report',
      message: data.message,
      priority: data.priority || 'medium',
      status: 'new'
    };

    const response = await fetch(`${supabaseUrl}/rest/v1/bug_reports`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(reportData),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.message || 'Failed to submit bug report' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error submitting bug report:', error);
    return { success: false, error: 'Network error occurred' };
  }
}

export async function submitFeedback(data: FeedbackData): Promise<{ success: boolean; error?: string }> {
  try {
    const session = getStoredSession();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Get user profile for name/email
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=family_name,display_name`,
      {
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
        },
      }
    );

    const profiles = await profileRes.json();
    const profile = profiles[0];

    const feedbackData = {
      user_id: session.user.id,
      user_name: profile?.display_name || profile?.family_name || null,
      email: session.user.email,
      subject: data.subject || 'Feedback & Suggestions',
      message: data.message,
      type: data.type || 'suggestion',
      status: 'new'
    };

    const response = await fetch(`${supabaseUrl}/rest/v1/feedback`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(feedbackData),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.message || 'Failed to submit feedback' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error submitting feedback:', error);
    return { success: false, error: 'Network error occurred' };
  }
}
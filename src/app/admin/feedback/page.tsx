'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAdmin } from '@/lib/admin';
import { getStoredSession } from '@/lib/session';
import ProtectedRoute from '@/components/ProtectedRoute';

type Feedback = {
  id: string;
  user_id?: string;
  user_name?: string;
  email?: string;
  subject: string;
  message: string;
  type: 'suggestion' | 'feature_request' | 'compliment' | 'complaint' | 'other';
  status: 'new' | 'reviewed' | 'implemented' | 'closed';
  admin_notes?: string;
  created_at: string;
  updated_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
};

const typeColors = {
  suggestion: 'bg-blue-100 text-blue-800',
  feature_request: 'bg-purple-100 text-purple-800',
  compliment: 'bg-green-100 text-green-800',
  complaint: 'bg-red-100 text-red-800',
  other: 'bg-gray-100 text-gray-800'
};

const statusColors = {
  new: 'bg-blue-100 text-blue-800',
  reviewed: 'bg-yellow-100 text-yellow-800',
  implemented: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-800'
};

export default function FeedbackAdmin() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [updating, setUpdating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const adminAuth = await isAdmin();
      if (!adminAuth) {
        router.push('/admin');
        return;
      }
      setAuthorized(true);
      loadFeedback();
    };
    
    checkAuth();
  }, [router]);

  const loadFeedback = async () => {
    try {
      const session = getStoredSession();
      if (!session) return;

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      let query = `${supabaseUrl}/rest/v1/feedback?select=*&order=created_at.desc`;
      if (statusFilter !== 'all') {
        query += `&status=eq.${statusFilter}`;
      }
      if (typeFilter !== 'all') {
        query += `&type=eq.${typeFilter}`;
      }

      const response = await fetch(query, {
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setFeedback(data);
      }
    } catch (error) {
      console.error('Error loading feedback:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateFeedback = async (id: string, updates: Partial<Feedback>) => {
    try {
      setUpdating(true);
      const session = getStoredSession();
      if (!session) return;

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const updateData: any = { ...updates };
      if (updates.status === 'reviewed' || updates.status === 'implemented' || updates.status === 'closed') {
        updateData.reviewed_at = new Date().toISOString();
        updateData.reviewed_by = session.user.id;
      }

      const response = await fetch(`${supabaseUrl}/rest/v1/feedback?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        loadFeedback(); // Refresh the list
        setSelectedFeedback(null); // Close modal
      }
    } catch (error) {
      console.error('Error updating feedback:', error);
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    if (authorized) {
      loadFeedback();
    }
  }, [statusFilter, typeFilter, authorized]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!authorized) {
    return null;
  }

  const filteredFeedback = feedback.filter(item => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (typeFilter !== 'all' && item.type !== typeFilter) return false;
    return true;
  });

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Feedback & Suggestions</h1>
            <p className="text-gray-600">Review and manage user feedback</p>
          </div>
          <Link 
            href="/admin"
            className="text-teal-600 hover:text-teal-700 font-medium"
          >
            ← Back to Admin
          </Link>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl p-4 mb-6 shadow-sm">
          <div className="flex gap-4 flex-wrap">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select 
                value={statusFilter} 
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500"
              >
                <option value="all">All Status</option>
                <option value="new">New</option>
                <option value="reviewed">Reviewed</option>
                <option value="implemented">Implemented</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
              <select 
                value={typeFilter} 
                onChange={(e) => setTypeFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500"
              >
                <option value="all">All Types</option>
                <option value="suggestion">Suggestion</option>
                <option value="feature_request">Feature Request</option>
                <option value="compliment">Compliment</option>
                <option value="complaint">Complaint</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </div>

        {/* Feedback List */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {filteredFeedback.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-4xl mb-4">💡</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Feedback</h3>
              <p className="text-gray-600">No feedback matches your current filters.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredFeedback.map((item) => (
                <div 
                  key={item.id}
                  className="p-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedFeedback(item)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{item.subject}</h3>
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">{item.message}</p>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${typeColors[item.type]}`}>
                        {item.type.replace('_', ' ')}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[item.status]}`}>
                        {item.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center text-sm text-gray-500">
                    <span>
                      {item.user_name || item.email || 'Anonymous'} • {new Date(item.created_at).toLocaleDateString()}
                    </span>
                    <span>#{item.id.slice(-8)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail Modal */}
        {selectedFeedback && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Feedback Details</h2>
                    <p className="text-gray-600">ID: #{selectedFeedback.id.slice(-8)}</p>
                  </div>
                  <button
                    onClick={() => setSelectedFeedback(null)}
                    className="text-gray-400 hover:text-gray-600 text-2xl"
                  >
                    ×
                  </button>
                </div>
              </div>
              
              <div className="p-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                    <p className="text-gray-900">{selectedFeedback.subject}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                    <p className="text-gray-900 whitespace-pre-wrap">{selectedFeedback.message}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
                      <p className="text-gray-900">{selectedFeedback.user_name || selectedFeedback.email || 'Anonymous'}</p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Submitted</label>
                      <p className="text-gray-900">{new Date(selectedFeedback.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                      <select 
                        value={selectedFeedback.type}
                        onChange={(e) => updateFeedback(selectedFeedback.id, { type: e.target.value as any })}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500"
                        disabled={updating}
                      >
                        <option value="suggestion">Suggestion</option>
                        <option value="feature_request">Feature Request</option>
                        <option value="compliment">Compliment</option>
                        <option value="complaint">Complaint</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <select 
                        value={selectedFeedback.status}
                        onChange={(e) => updateFeedback(selectedFeedback.id, { status: e.target.value as any })}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500"
                        disabled={updating}
                      >
                        <option value="new">New</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="implemented">Implemented</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Admin Notes</label>
                    <textarea 
                      value={selectedFeedback.admin_notes || ''}
                      onChange={(e) => setSelectedFeedback({ ...selectedFeedback, admin_notes: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500"
                      rows={3}
                      placeholder="Add internal notes..."
                    />
                  </div>
                </div>
                
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setSelectedFeedback(null)}
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => updateFeedback(selectedFeedback.id, { admin_notes: selectedFeedback.admin_notes })}
                    disabled={updating}
                    className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 disabled:bg-gray-300"
                  >
                    {updating ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </ProtectedRoute>
  );
}
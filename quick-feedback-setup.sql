-- Quick setup for feedback system - run in Supabase SQL Editor

-- Bug Reports table
CREATE TABLE bug_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name TEXT,
    email TEXT,
    subject TEXT DEFAULT 'Bug Report',
    message TEXT NOT NULL,
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved', 'closed')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Feedback table  
CREATE TABLE feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name TEXT,
    email TEXT,
    subject TEXT DEFAULT 'Feedback & Suggestions',
    message TEXT NOT NULL,
    type TEXT DEFAULT 'suggestion' CHECK (type IN ('suggestion', 'feature_request', 'compliment', 'complaint', 'other')),
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'implemented', 'closed')),
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS (Row Level Security)
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- RLS Policies for bug_reports
CREATE POLICY "Users can insert their own bug reports" ON bug_reports
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own bug reports" ON bug_reports
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all bug reports" ON bug_reports
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND (profiles.admin_level IS NOT NULL OR profiles.is_admin = true)
        )
    );

CREATE POLICY "Admins can update bug reports" ON bug_reports
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND (profiles.admin_level IS NOT NULL OR profiles.is_admin = true)
        )
    );

-- RLS Policies for feedback
CREATE POLICY "Users can insert their own feedback" ON feedback
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own feedback" ON feedback
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all feedback" ON feedback
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND (profiles.admin_level IS NOT NULL OR profiles.is_admin = true)
        )
    );

CREATE POLICY "Admins can update feedback" ON feedback
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND (profiles.admin_level IS NOT NULL OR profiles.is_admin = true)
        )
    );
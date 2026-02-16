-- Create feedback and bug report tables for admin panel
-- Run this SQL in your Supabase SQL editor

-- Bug Reports table
CREATE TABLE IF NOT EXISTS bug_reports (
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
CREATE TABLE IF NOT EXISTS feedback (
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

-- Auto-replies table for tracking sent replies
CREATE TABLE IF NOT EXISTS auto_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    reply_type TEXT NOT NULL CHECK (reply_type IN ('bug_report', 'feedback')),
    reference_id UUID, -- references bug_reports.id or feedback.id
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bug_reports_user_id ON bug_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status);
CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON bug_reports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_replies ENABLE ROW LEVEL SECURITY;

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

-- RLS Policies for auto_replies
CREATE POLICY "Users can view their own auto replies" ON auto_replies
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert auto replies" ON auto_replies
    FOR INSERT WITH CHECK (true);

-- Function to automatically send thank you message when bug report/feedback is created
CREATE OR REPLACE FUNCTION send_auto_reply_for_feedback()
RETURNS TRIGGER AS $$
DECLARE
    reply_message TEXT;
    reply_type TEXT;
BEGIN
    -- Determine the reply type and message
    IF TG_TABLE_NAME = 'bug_reports' THEN
        reply_type := 'bug_report';
        reply_message := 'Thank you for reporting this bug! We''ve received your report and our development team will investigate it. We''ll keep you updated on the progress. Your feedback helps make Haven better for everyone!';
    ELSE -- feedback table
        reply_type := 'feedback';
        reply_message := 'Thank you for your valuable feedback! We appreciate you taking the time to share your thoughts and suggestions. Our team reviews all feedback carefully to improve Haven for our community.';
    END IF;

    -- Insert auto-reply record
    INSERT INTO auto_replies (user_id, reply_type, reference_id)
    VALUES (NEW.user_id, reply_type, NEW.id);

    -- Here we could integrate with your messaging system to send actual messages
    -- For now, we'll just create a record in messages table if it exists
    
    -- Insert thank you message into messages table (if conversation system exists)
    IF NEW.user_id IS NOT NULL THEN
        INSERT INTO conversations (participant_1, participant_2, last_message_text, last_message_at, last_message_by, created_at)
        VALUES (
            NEW.user_id,
            (SELECT id FROM profiles WHERE admin_level = 'gold' OR is_admin = true LIMIT 1), -- First admin user
            reply_message,
            NOW(),
            (SELECT id FROM profiles WHERE admin_level = 'gold' OR is_admin = true LIMIT 1),
            NOW()
        )
        ON CONFLICT (participant_1, participant_2) 
        DO UPDATE SET 
            last_message_text = reply_message,
            last_message_at = NOW(),
            last_message_by = (SELECT id FROM profiles WHERE admin_level = 'gold' OR is_admin = true LIMIT 1);
            
        -- Insert the actual message
        INSERT INTO messages (
            conversation_id,
            sender_id,
            content,
            created_at
        )
        SELECT 
            c.id,
            (SELECT id FROM profiles WHERE admin_level = 'gold' OR is_admin = true LIMIT 1),
            reply_message,
            NOW()
        FROM conversations c
        WHERE (c.participant_1 = NEW.user_id AND c.participant_2 = (SELECT id FROM profiles WHERE admin_level = 'gold' OR is_admin = true LIMIT 1))
           OR (c.participant_2 = NEW.user_id AND c.participant_1 = (SELECT id FROM profiles WHERE admin_level = 'gold' OR is_admin = true LIMIT 1));
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers to send auto-replies
CREATE TRIGGER trigger_auto_reply_bug_report
    AFTER INSERT ON bug_reports
    FOR EACH ROW EXECUTE FUNCTION send_auto_reply_for_feedback();

CREATE TRIGGER trigger_auto_reply_feedback
    AFTER INSERT ON feedback
    FOR EACH ROW EXECUTE FUNCTION send_auto_reply_for_feedback();

-- Update triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_bug_reports_updated_at
    BEFORE UPDATE ON bug_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_feedback_updated_at
    BEFORE UPDATE ON feedback
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create views for admin dashboard
CREATE VIEW admin_bug_report_summary AS
SELECT 
    status,
    priority,
    COUNT(*) as count,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as today_count,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as week_count
FROM bug_reports 
GROUP BY status, priority;

CREATE VIEW admin_feedback_summary AS
SELECT 
    type,
    status,
    COUNT(*) as count,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as today_count,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as week_count
FROM feedback 
GROUP BY type, status;
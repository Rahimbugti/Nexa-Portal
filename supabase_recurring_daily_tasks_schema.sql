-- ====================================================================
-- SUPABASE DATABASE SCHEMA MIGRATION: RECURRING DAILY TASK CYCLE SYSTEM
-- Software House Enterprise Management Portal
-- ====================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TASK ASSIGNMENT GROUPS TABLE (Batch header for recurring assignments)
CREATE TABLE IF NOT EXISTS task_assignment_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_email VARCHAR(255) NOT NULL,
    user_name VARCHAR(255),
    user_role VARCHAR(50) DEFAULT 'employee',
    created_by_email VARCHAR(255) DEFAULT 'admin@gmail.com',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    duration_days INT NOT NULL CHECK (duration_days > 0),
    daily_due_time TIME NOT NULL DEFAULT '09:00:00',
    timezone VARCHAR(50) DEFAULT 'Asia/Karachi',
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'completed', 'cancelled', 'paused'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TASK ASSIGNMENTS TABLE (Templates assigned under a group)
CREATE TABLE IF NOT EXISTS task_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES task_assignment_groups(id) ON DELETE CASCADE,
    user_email VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    instructions TEXT,
    priority VARCHAR(50) DEFAULT 'Medium', -- 'Low', 'Medium', 'High', 'Urgent'
    submission_type VARCHAR(50) DEFAULT 'any', -- 'any', 'link', 'text', 'file', 'link_notes', 'file_notes'
    reference_url TEXT,
    attachment_url TEXT,
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'cancelled'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add column if table already exists
ALTER TABLE task_assignments ADD COLUMN IF NOT EXISTS submission_type VARCHAR(50) DEFAULT 'any';

-- 3. DAILY TASK INSTANCES TABLE (Independent per-day cycle instance)
CREATE TABLE IF NOT EXISTS daily_task_instances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID REFERENCES task_assignments(id) ON DELETE CASCADE,
    group_id UUID REFERENCES task_assignment_groups(id) ON DELETE CASCADE,
    user_email VARCHAR(255) NOT NULL,
    user_name VARCHAR(255),
    task_title VARCHAR(255) NOT NULL,
    task_description TEXT,
    task_instructions TEXT,
    priority VARCHAR(50) DEFAULT 'Medium',
    submission_type VARCHAR(50) DEFAULT 'any', -- 'any', 'link', 'text', 'file', 'link_notes', 'file_notes'
    reference_url TEXT,
    attachment_url TEXT,
    cycle_number INT NOT NULL, -- 1, 2, 3 ... duration_days
    total_cycles INT NOT NULL, -- e.g. 7
    task_date DATE NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'submitted', 'missed', 'cancelled', 'late_submitted'
    submitted_at TIMESTAMPTZ,
    missed_notified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_assignment_date UNIQUE (assignment_id, task_date),
    CONSTRAINT unique_assignment_cycle UNIQUE (assignment_id, cycle_number)
);

-- Add column if table already exists
ALTER TABLE daily_task_instances ADD COLUMN IF NOT EXISTS submission_type VARCHAR(50) DEFAULT 'any';

-- 4. TASK SUBMISSIONS TABLE (Work proofs & details submitted by user)
CREATE TABLE IF NOT EXISTS task_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    daily_task_instance_id UUID REFERENCES daily_task_instances(id) ON DELETE CASCADE,
    assignment_id UUID,
    group_id UUID,
    user_email VARCHAR(255) NOT NULL,
    user_name VARCHAR(255),
    submission_text TEXT,
    submission_url TEXT,
    file_url TEXT,
    notes TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_instance_submission UNIQUE (daily_task_instance_id)
);

-- 5. TASK NOTIFICATIONS TABLE (In-app notifications for admins and users)
CREATE TABLE IF NOT EXISTS task_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_email VARCHAR(255) NOT NULL,
    recipient_role VARCHAR(50) DEFAULT 'admin',
    type VARCHAR(50) NOT NULL, -- 'task_missed', 'daily_summary', 'task_submitted', 'task_assigned'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    related_user_email VARCHAR(255),
    related_user_name VARCHAR(255),
    related_task_id UUID,
    related_daily_instance_id UUID,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. PUSH SUBSCRIPTIONS TABLE (Web Push Notification Endpoints)
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_email VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- PERFORMANCE INDEXES
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_groups_user_email ON task_assignment_groups(user_email);
CREATE INDEX IF NOT EXISTS idx_groups_status ON task_assignment_groups(status);
CREATE INDEX IF NOT EXISTS idx_assignments_group ON task_assignments(group_id);
CREATE INDEX IF NOT EXISTS idx_instances_user_email ON daily_task_instances(user_email);
CREATE INDEX IF NOT EXISTS idx_instances_date ON daily_task_instances(task_date);
CREATE INDEX IF NOT EXISTS idx_instances_status ON daily_task_instances(status);
CREATE INDEX IF NOT EXISTS idx_instances_due_at ON daily_task_instances(due_at);
CREATE INDEX IF NOT EXISTS idx_instances_group ON daily_task_instances(group_id);
CREATE INDEX IF NOT EXISTS idx_submissions_instance ON task_submissions(daily_task_instance_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON task_notifications(recipient_email, is_read);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_email);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================
ALTER TABLE task_assignment_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_task_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated and public access via proxy/policies
DROP POLICY IF EXISTS "Public Access Task Groups" ON task_assignment_groups;
CREATE POLICY "Public Access Task Groups" ON task_assignment_groups FOR ALL USING (true);

DROP POLICY IF EXISTS "Public Access Task Assignments" ON task_assignments;
CREATE POLICY "Public Access Task Assignments" ON task_assignments FOR ALL USING (true);

DROP POLICY IF EXISTS "Public Access Daily Task Instances" ON daily_task_instances;
CREATE POLICY "Public Access Daily Task Instances" ON daily_task_instances FOR ALL USING (true);

DROP POLICY IF EXISTS "Public Access Task Submissions" ON task_submissions;
CREATE POLICY "Public Access Task Submissions" ON task_submissions FOR ALL USING (true);

DROP POLICY IF EXISTS "Public Access Task Notifications" ON task_notifications;
CREATE POLICY "Public Access Task Notifications" ON task_notifications FOR ALL USING (true);

DROP POLICY IF EXISTS "Public Access Push Subscriptions" ON push_subscriptions;
CREATE POLICY "Public Access Push Subscriptions" ON push_subscriptions FOR ALL USING (true);

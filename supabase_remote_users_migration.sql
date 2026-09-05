-- ====================================================================
-- SUPABASE DATABASE MIGRATION: REMOTE USERS TABLE
-- Single Source of Truth for Remote Monitoring & Supervision
-- ====================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. REMOTE USERS TABLE
CREATE TABLE IF NOT EXISTS remote_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_email VARCHAR(255) NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    department VARCHAR(100) DEFAULT 'Software Engineering',
    designation VARCHAR(100) DEFAULT 'Remote Member',
    role VARCHAR(50) DEFAULT 'employee', -- 'employee', 'intern', 'student'
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'inactive'
    is_active BOOLEAN DEFAULT TRUE,
    added_by_email VARCHAR(255) DEFAULT 'admin@gmail.com',
    profile_photo TEXT,
    device_name VARCHAR(255) DEFAULT 'Desktop Workstation',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_remote_user_email UNIQUE (user_email)
);

-- 2. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_remote_users_email ON remote_users(user_email);
CREATE INDEX IF NOT EXISTS idx_remote_users_status ON remote_users(status);
CREATE INDEX IF NOT EXISTS idx_remote_users_is_active ON remote_users(is_active);

-- 3. ROW LEVEL SECURITY (RLS)
ALTER TABLE remote_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access remote_users" ON remote_users;
CREATE POLICY "Public Access remote_users" ON remote_users FOR ALL USING (true);

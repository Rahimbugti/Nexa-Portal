-- ====================================================================
-- SUPABASE DATABASE MIGRATION: OFFICE PUBLIC IP & ATTENDANCE AUDITING
-- Security Verification for Student Attendance via ipify API
-- ====================================================================

-- 1. SYSTEM SETTINGS TABLE (For persistent configuration of Office Public IP)
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(255) NOT NULL UNIQUE,
    value JSONB NOT NULL,
    description TEXT,
    updated_by VARCHAR(255) DEFAULT 'admin@gmail.com',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index on system_settings key
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);

-- RLS for system_settings
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access system_settings" ON system_settings;
CREATE POLICY "Public Access system_settings" ON system_settings FOR ALL USING (true);

-- 2. INITIAL SEED FOR OFFICE PUBLIC IP
INSERT INTO system_settings (key, value, description)
VALUES (
    'office_public_ip',
    '{"ip": "39.46.69.123", "label": "Main Campus Office Wi-Fi", "is_active": true}'::jsonb,
    'Configured Office Public IP for student attendance network verification'
)
ON CONFLICT (key) DO NOTHING;

-- 3. ENSURE ATTENDANCE TABLE HAS AUDIT IP COLUMNS
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS public_ip VARCHAR(100);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS ip_address VARCHAR(100);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS network_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS user_role VARCHAR(50) DEFAULT 'employee';

-- Indexes on attendance
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_user_email ON attendance(user_email);
CREATE INDEX IF NOT EXISTS idx_attendance_public_ip ON attendance(public_ip);

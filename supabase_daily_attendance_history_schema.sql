-- ====================================================================
-- SUPABASE DATABASE MIGRATION: STUDENT DAILY ATTENDANCE & AUTO-ABSENCE
-- Permanent Daily History, Server-Side Absences, Office IP Auditing & PDF Reporting
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENSURE ATTENDANCE TABLE HAS ALL MANDATORY DAILY COLUMNS
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id VARCHAR(255),
    student_id VARCHAR(255),
    user_email VARCHAR(255) NOT NULL,
    user_name VARCHAR(255),
    user_role VARCHAR(50) DEFAULT 'student',
    attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
    date VARCHAR(50),
    status VARCHAR(50) NOT NULL DEFAULT 'Present',
    attendance_status VARCHAR(50),
    check_in_time VARCHAR(50) DEFAULT '--:--',
    check_in VARCHAR(50) DEFAULT '--:--',
    check_out_time VARCHAR(50) DEFAULT 'Not Checked Out',
    check_out VARCHAR(50) DEFAULT 'Not Checked Out',
    public_ip VARCHAR(100) DEFAULT '127.0.0.1',
    ip_address VARCHAR(100) DEFAULT '127.0.0.1',
    network_verified BOOLEAN DEFAULT FALSE,
    work_hours NUMERIC(4,2) DEFAULT 0,
    total_work_hours VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ENSURE COLUMNS EXIST (If table already created earlier)
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS student_id VARCHAR(255);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS employee_id VARCHAR(255);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS user_role VARCHAR(50) DEFAULT 'student';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS attendance_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS date VARCHAR(50);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Present';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(50);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_in_time VARCHAR(50) DEFAULT '--:--';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_in VARCHAR(50) DEFAULT '--:--';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out_time VARCHAR(50) DEFAULT 'Not Checked Out';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out VARCHAR(50) DEFAULT 'Not Checked Out';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS public_ip VARCHAR(100) DEFAULT '127.0.0.1';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS ip_address VARCHAR(100) DEFAULT '127.0.0.1';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS network_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS work_hours NUMERIC(4,2) DEFAULT 0;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS total_work_hours VARCHAR(50);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 4. UNIQUE CONSTRAINT (One final record per student per attendance date)
-- Clean duplicate records keeping the most recent one before applying unique index
DELETE FROM attendance a
WHERE a.id NOT IN (
    SELECT DISTINCT ON (LOWER(TRIM(COALESCE(user_email, student_id, ''))), attendance_date) id
    FROM attendance
    ORDER BY LOWER(TRIM(COALESCE(user_email, student_id, ''))), attendance_date, created_at DESC
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_student_daily_date 
ON attendance(LOWER(TRIM(user_email)), attendance_date);

-- 5. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_attendance_user_email ON attendance(user_email);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status);
CREATE INDEX IF NOT EXISTS idx_attendance_role ON attendance(user_role);

-- 6. SYSTEM SETTINGS TABLE
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(255) NOT NULL UNIQUE,
    value JSONB NOT NULL,
    description TEXT,
    updated_by VARCHAR(255) DEFAULT 'admin@gmail.com',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed office public IP setting
INSERT INTO system_settings (key, value, description)
VALUES (
    'office_public_ip',
    '{"ip": "39.46.69.123", "label": "Main Campus Office Wi-Fi", "is_active": true}'::jsonb,
    'Configured Office Public IP for student attendance verification'
)
ON CONFLICT (key) DO NOTHING;

-- 7. AUTOMATED ABSENT PROCESSING POSTGRES FUNCTION
CREATE OR REPLACE FUNCTION process_daily_student_absences(target_date DATE DEFAULT CURRENT_DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_sunday BOOLEAN;
    active_student_count INT := 0;
    already_recorded_count INT := 0;
    absent_created_count INT := 0;
    rec RECORD;
BEGIN
    -- Check if target date is Sunday (0 = Sunday in PostgreSQL DOW)
    IF EXTRACT(DOW FROM target_date) = 0 THEN
        RETURN jsonb_build_object(
            'success', true,
            'date', target_date,
            'is_weekend', true,
            'message', 'Target date is Sunday (Weekend Holiday). No absences generated.',
            'absent_created', 0
        );
    END IF;

    -- Count active students
    SELECT COUNT(*) INTO active_student_count 
    FROM students 
    WHERE LOWER(COALESCE(status, 'Active')) = 'active';

    -- Count existing records for this date
    SELECT COUNT(*) INTO already_recorded_count 
    FROM attendance 
    WHERE attendance_date = target_date;

    -- Loop through active students who have NO attendance record for target_date
    FOR rec IN 
        SELECT s.id, s.full_name, s.email, s.course_name
        FROM students s
        WHERE LOWER(COALESCE(s.status, 'Active')) = 'active'
          AND s.email IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 
              FROM attendance a 
              WHERE LOWER(TRIM(a.user_email)) = LOWER(TRIM(s.email))
                AND a.attendance_date = target_date
          )
    LOOP
        INSERT INTO attendance (
            student_id,
            employee_id,
            user_email,
            user_name,
            user_role,
            attendance_date,
            date,
            status,
            attendance_status,
            check_in_time,
            check_in,
            check_out_time,
            check_out,
            public_ip,
            ip_address,
            network_verified,
            notes,
            created_at,
            updated_at
        ) VALUES (
            rec.email,
            rec.email,
            LOWER(TRIM(rec.email)),
            rec.full_name,
            'student',
            target_date,
            target_date::text,
            'Absent',
            'Absent 🔴',
            '--:--',
            '--:--',
            '--:--',
            '--:--',
            'N/A',
            'N/A',
            FALSE,
            'Automatically recorded as absent after shift hours.',
            NOW(),
            NOW()
        )
        ON CONFLICT (LOWER(TRIM(user_email)), attendance_date) DO NOTHING;

        absent_created_count := absent_created_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'date', target_date,
        'active_students', active_student_count,
        'already_recorded', already_recorded_count,
        'absent_created', absent_created_count,
        'timestamp', NOW()
    );
END;
$$;

-- 8. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Select Attendance" ON attendance;
DROP POLICY IF EXISTS "Public Insert Attendance" ON attendance;
DROP POLICY IF EXISTS "Public Update Attendance" ON attendance;
DROP POLICY IF EXISTS "Public Delete Attendance" ON attendance;

CREATE POLICY "Public Select Attendance" ON attendance FOR SELECT USING (true);
CREATE POLICY "Public Insert Attendance" ON attendance FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Attendance" ON attendance FOR UPDATE USING (true);
CREATE POLICY "Public Delete Attendance" ON attendance FOR DELETE USING (true);

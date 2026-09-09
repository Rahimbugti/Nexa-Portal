-- ====================================================================
-- SUPABASE DATABASE MIGRATION: STUDENT DAILY ATTENDANCE & AUTOMATED ABSENCE
-- Permanent Daily History, Server-Side Absences, Office IP Verification & PDF Reporting
-- Timezone: Asia/Karachi (PKT, UTC+5)
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENSURE ATTENDANCE TABLE HAS ALL MANDATORY DAILY COLUMNS
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id VARCHAR(255),
    student_name VARCHAR(255),
    student_email VARCHAR(255),
    employee_id VARCHAR(255),
    user_email VARCHAR(255) NOT NULL,
    user_name VARCHAR(255),
    user_role VARCHAR(50) DEFAULT 'student',
    attendance_date DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'Asia/Karachi')::DATE),
    date VARCHAR(50),
    attendance_status VARCHAR(50) NOT NULL DEFAULT 'Present',
    status VARCHAR(50) NOT NULL DEFAULT 'Present',
    attendance_marked BOOLEAN DEFAULT FALSE,
    check_in_time VARCHAR(50) DEFAULT '--:--',
    check_in VARCHAR(50) DEFAULT '--:--',
    check_out_time VARCHAR(50) DEFAULT 'Not Checked Out',
    check_out VARCHAR(50) DEFAULT 'Not Checked Out',
    ip_address VARCHAR(100) DEFAULT '127.0.0.1',
    public_ip VARCHAR(100) DEFAULT '127.0.0.1',
    network_verified BOOLEAN DEFAULT FALSE,
    work_hours NUMERIC(4,2) DEFAULT 0,
    total_work_hours VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ENSURE ALL COLUMNS EXIST IF TABLE WAS CREATED PREVIOUSLY
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS student_id VARCHAR(255);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS student_name VARCHAR(255);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS student_email VARCHAR(255);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS employee_id VARCHAR(255);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS user_role VARCHAR(50) DEFAULT 'student';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS attendance_date DATE DEFAULT ((NOW() AT TIME ZONE 'Asia/Karachi')::DATE);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS date VARCHAR(50);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(50) DEFAULT 'Present';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Present';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS attendance_marked BOOLEAN DEFAULT FALSE;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_in_time VARCHAR(50) DEFAULT '--:--';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_in VARCHAR(50) DEFAULT '--:--';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out_time VARCHAR(50) DEFAULT 'Not Checked Out';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out VARCHAR(50) DEFAULT 'Not Checked Out';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS ip_address VARCHAR(100) DEFAULT '127.0.0.1';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS public_ip VARCHAR(100) DEFAULT '127.0.0.1';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS network_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS work_hours NUMERIC(4,2) DEFAULT 0;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS total_work_hours VARCHAR(50);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 4. HOLIDAYS TABLE (For Admin-Defined Holidays)
CREATE TABLE IF NOT EXISTS holidays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    holiday_date DATE NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed standard national holidays if not existing
INSERT INTO holidays (holiday_date, title, description)
VALUES 
    ('2026-03-23', 'Pakistan Day', 'National Holiday'),
    ('2026-05-01', 'Labour Day', 'International Labour Day'),
    ('2026-08-14', 'Independence Day', 'Pakistan Independence Day'),
    ('2026-09-06', 'Defence Day', 'National Defence Day'),
    ('2026-12-25', 'Quaid-e-Azam Day', 'Birthday of Quaid-e-Azam')
ON CONFLICT (holiday_date) DO NOTHING;

-- 5. UNIQUE INDEX CONSTRAINTS (One record per student per attendance date)
-- Safely clean duplicates keeping the latest record
DELETE FROM attendance a
WHERE a.id NOT IN (
    SELECT DISTINCT ON (LOWER(TRIM(COALESCE(user_email, student_email, student_id, ''))), attendance_date) id
    FROM attendance
    ORDER BY LOWER(TRIM(COALESCE(user_email, student_email, student_id, ''))), attendance_date, created_at DESC
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_student_daily_email
ON attendance(LOWER(TRIM(COALESCE(user_email, student_email, ''))), attendance_date);

CREATE INDEX IF NOT EXISTS idx_attendance_student_id_date ON attendance(student_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_user_email_date ON attendance(user_email, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status);
CREATE INDEX IF NOT EXISTS idx_attendance_role ON attendance(user_role);
CREATE INDEX IF NOT EXISTS idx_attendance_marked ON attendance(attendance_marked);

-- 6. SYSTEM SETTINGS TABLE (Configured Office Public IP & Policy)
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(255) NOT NULL UNIQUE,
    value JSONB NOT NULL,
    description TEXT,
    updated_by VARCHAR(255) DEFAULT 'admin@nexa.com',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default office public IP setting
INSERT INTO system_settings (key, value, description)
VALUES (
    'office_public_ip',
    '{"ip": "39.46.69.123", "label": "Main Campus Office Wi-Fi", "is_active": true}'::jsonb,
    'Configured Office Public IP for student attendance verification'
)
ON CONFLICT (key) DO NOTHING;

-- 7. POSTGRESQL FUNCTION: PROCESS DAILY STUDENT ABSENCES
-- Automatically evaluates active students for target_date.
-- If Sunday or registered Holiday: returns holiday summary (no absences).
-- If working day: marks active students without attendance as 'Absent' (attendance_marked = false).
CREATE OR REPLACE FUNCTION process_daily_student_absences(target_date DATE DEFAULT ((NOW() AT TIME ZONE 'Asia/Karachi')::DATE))
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_sunday BOOLEAN;
    is_holiday BOOLEAN := FALSE;
    holiday_name VARCHAR(255) := '';
    active_student_count INT := 0;
    already_recorded_count INT := 0;
    absent_created_count INT := 0;
    holiday_created_count INT := 0;
    rec RECORD;
BEGIN
    -- 1. Check if target date is Sunday (0 = Sunday in PostgreSQL DOW)
    IF EXTRACT(DOW FROM target_date) = 0 THEN
        is_sunday := TRUE;
    ELSE
        is_sunday := FALSE;
    END IF;

    -- 2. Check if target date is in holidays table
    SELECT title INTO holiday_name 
    FROM holidays 
    WHERE holiday_date = target_date 
    LIMIT 1;

    IF holiday_name IS NOT NULL AND holiday_name <> '' THEN
        is_holiday := TRUE;
    END IF;

    -- Count active students in system
    SELECT COUNT(*) INTO active_student_count 
    FROM students 
    WHERE LOWER(COALESCE(status, 'Active')) = 'active';

    -- If Sunday or Holiday, record Holiday entries for students without entries or return summary
    IF is_sunday OR is_holiday THEN
        FOR rec IN 
            SELECT s.id, s.enrollment_no, s.full_name, s.email, s.course_name
            FROM students s
            WHERE LOWER(COALESCE(s.status, 'Active')) = 'active'
              AND s.email IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 
                  FROM attendance a 
                  WHERE (LOWER(TRIM(a.user_email)) = LOWER(TRIM(s.email)) OR a.student_id = s.id::text)
                    AND a.attendance_date = target_date
              )
        LOOP
            INSERT INTO attendance (
                student_id,
                student_name,
                student_email,
                employee_id,
                user_email,
                user_name,
                user_role,
                attendance_date,
                date,
                status,
                attendance_status,
                attendance_marked,
                check_in_time,
                check_in,
                check_out_time,
                check_out,
                ip_address,
                public_ip,
                network_verified,
                notes,
                created_at,
                updated_at
            ) VALUES (
                COALESCE(rec.enrollment_no, rec.id::text, rec.email),
                rec.full_name,
                LOWER(TRIM(rec.email)),
                rec.email,
                LOWER(TRIM(rec.email)),
                rec.full_name,
                'student',
                target_date,
                target_date::text,
                'Holiday',
                CASE WHEN is_sunday THEN 'Holiday' ELSE 'Holiday' END,
                FALSE,
                '--:--',
                '--:--',
                '--:--',
                '--:--',
                'N/A',
                'N/A',
                FALSE,
                CASE WHEN is_sunday THEN 'Sunday (Weekend Holiday)' ELSE ('Official Holiday: ' || holiday_name) END,
                NOW(),
                NOW()
            )
            ON CONFLICT (LOWER(TRIM(COALESCE(user_email, student_email, ''))), attendance_date) DO NOTHING;

            holiday_created_count := holiday_created_count + 1;
        END LOOP;

        RETURN jsonb_build_object(
            'success', true,
            'date', target_date,
            'is_weekend', is_sunday,
            'is_holiday', is_holiday,
            'holiday_title', holiday_name,
            'active_students', active_student_count,
            'holiday_records_created', holiday_created_count,
            'message', CASE WHEN is_sunday THEN 'Target date is Sunday (Weekend Holiday).' ELSE ('Target date is Holiday: ' || holiday_name) END,
            'absent_created', 0
        );
    END IF;

    -- Count existing records for this date
    SELECT COUNT(*) INTO already_recorded_count 
    FROM attendance 
    WHERE attendance_date = target_date;

    -- 3. Working Day: Mark all active students without attendance as Absent (attendance_marked = FALSE)
    FOR rec IN 
        SELECT s.id, s.enrollment_no, s.full_name, s.email, s.course_name
        FROM students s
        WHERE LOWER(COALESCE(s.status, 'Active')) = 'active'
          AND s.email IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 
              FROM attendance a 
              WHERE (LOWER(TRIM(a.user_email)) = LOWER(TRIM(s.email)) OR a.student_id = s.id::text)
                AND a.attendance_date = target_date
          )
    LOOP
        INSERT INTO attendance (
            student_id,
            student_name,
            student_email,
            employee_id,
            user_email,
            user_name,
            user_role,
            attendance_date,
            date,
            status,
            attendance_status,
            attendance_marked,
            check_in_time,
            check_in,
            check_out_time,
            check_out,
            ip_address,
            public_ip,
            network_verified,
            notes,
            created_at,
            updated_at
        ) VALUES (
            COALESCE(rec.enrollment_no, rec.id::text, rec.email),
            rec.full_name,
            LOWER(TRIM(rec.email)),
            rec.email,
            LOWER(TRIM(rec.email)),
            rec.full_name,
            'student',
            target_date,
            target_date::text,
            'Absent',
            'Absent',
            FALSE,
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
        ON CONFLICT (LOWER(TRIM(COALESCE(user_email, student_email, ''))), attendance_date) DO NOTHING;

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

DROP POLICY IF EXISTS "Allow All Select Attendance" ON attendance;
DROP POLICY IF EXISTS "Allow All Insert Attendance" ON attendance;
DROP POLICY IF EXISTS "Allow All Update Attendance" ON attendance;
DROP POLICY IF EXISTS "Allow All Delete Attendance" ON attendance;

CREATE POLICY "Allow All Select Attendance" ON attendance FOR SELECT USING (true);
CREATE POLICY "Allow All Insert Attendance" ON attendance FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow All Update Attendance" ON attendance FOR UPDATE USING (true);
CREATE POLICY "Allow All Delete Attendance" ON attendance FOR DELETE USING (true);

-- 9. SUPABASE PG_CRON SCHEDULE (Optional / Recommended for Cloud automation)
-- Note: Enable the pg_cron extension first (either via Supabase Dashboard -> Database -> Extensions -> "pg_cron", or via SQL below):
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- To enable daily auto-absent execution at 7:00 PM PKT (14:00 UTC) / 11:30 PM PKT (18:30 UTC):
-- DO $$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
--     PERFORM cron.schedule(
--       'daily-student-auto-absent-job',
--       '30 18 * * *',
--       $$SELECT public.process_daily_student_absences((NOW() AT TIME ZONE 'Asia/Karachi')::DATE);$$
--     );
--   END IF;
-- END
-- $$;


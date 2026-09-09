import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const LIVE_SUPABASE_URL = "https://uzwmwtkldgchnuqxamov.supabase.co";
const LIVE_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6d213dGtsZGdjaG51cXhhbW92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MDUxMjYsImV4cCI6MjEwMDk4MTEyNn0.dTw41DhaS-qDVqX4jj3WsrAvYE9CLigjOLZFiDt_7Rk";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
  ? process.env.NEXT_PUBLIC_SUPABASE_URL
  : LIVE_SUPABASE_URL;

const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.includes("placeholder")
  ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  : LIVE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`
    }
  }
});

// Helper to get formatted date string in Asia/Karachi timezone (YYYY-MM-DD)
function getTargetDate(customDate) {
  if (customDate && /^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
    return customDate;
  }
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  } catch (e) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
}

/**
 * Scheduled / On-Demand Auto-Absent Processing Endpoint
 * Finds all active Students who have NOT marked attendance for the target date
 * and inserts permanent 'Absent' records into Supabase (with attendance_marked = false).
 */
export async function POST(request) {
  try {
    let body = {};
    try {
      body = await request.json();
    } catch (e) {}

    const { searchParams } = new URL(request.url);
    const dateParam = body.date || searchParams.get("date");
    const targetDate = getTargetDate(dateParam);

    // 1. Check if the target date is Sunday (0 = Sunday)
    const [y, m, d] = targetDate.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayOfWeek = dateObj.getDay();

    if (dayOfWeek === 0) {
      return NextResponse.json({
        success: true,
        date: targetDate,
        is_sunday: true,
        message: "Target date is Sunday (Weekend Holiday). No student absences generated.",
        absent_created: 0
      });
    }

    // 2. Check if the target date is in holidays table
    try {
      const { data: holidayData } = await supabase
        .from("holidays")
        .select("title")
        .eq("holiday_date", targetDate)
        .maybeSingle();

      if (holidayData && holidayData.title) {
        return NextResponse.json({
          success: true,
          date: targetDate,
          is_holiday: true,
          holiday_title: holidayData.title,
          message: `Target date is an official holiday (${holidayData.title}). No student absences generated.`,
          absent_created: 0
        });
      }
    } catch (e) {}

    // 3. Try executing Postgres Function `process_daily_student_absences` first
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc("process_daily_student_absences", {
        target_date: targetDate
      });

      if (!rpcError && rpcData) {
        return NextResponse.json(rpcData);
      }
    } catch (rpcErr) {
      console.warn("RPC process_daily_student_absences failed or not installed, executing server-side query fallback:", rpcErr.message);
    }

    // 4. Server-Side Fallback Reconciliation:
    // Fetch all active students
    const { data: students, error: stuError } = await supabase
      .from("students")
      .select("id, enrollment_no, full_name, student_name, email, course_name, status");

    if (stuError) {
      console.error("Error fetching students for auto-absent:", stuError);
      return NextResponse.json({ success: false, error: stuError.message }, { status: 500 });
    }

    const activeStudents = (students || []).filter(s => {
      const status = (s.status || "Active").toLowerCase();
      const email = (s.email || "").trim();
      return status === "active" && email.length > 0;
    });

    // Fetch existing attendance records for targetDate
    let existingAttendance = [];
    const { data: attData, error: attError } = await supabase
      .from("attendance")
      .select("student_id, user_email, student_email, employee_id, status, attendance_status, attendance_date")
      .eq("attendance_date", targetDate);

    if (!attError && attData) {
      existingAttendance = attData;
    } else {
      const { data: fbData } = await supabase.from("attendance").select("*");
      existingAttendance = (fbData || []).filter(r => (r.attendance_date === targetDate || r.date === targetDate));
    }

    // Map of existing student identifiers with attendance today
    const recordedIdentifierSet = new Set();
    let presentCount = 0;

    (existingAttendance || []).forEach(record => {
      const email = (record.student_email || record.user_email || record.employee_id || "").toLowerCase().trim();
      const sId = (record.student_id || "").toLowerCase().trim();
      if (email) recordedIdentifierSet.add(email);
      if (sId) recordedIdentifierSet.add(sId);

      const st = (record.status || record.attendance_status || "").toLowerCase();
      if (st.includes("present") || st.includes("late") || st.includes("leave")) {
        presentCount++;
      }
    });

    // Identify active students missing attendance on targetDate
    const missingStudents = activeStudents.filter(s => {
      const email = (s.email || "").toLowerCase().trim();
      const id = (s.enrollment_no || s.id || "").toString().toLowerCase().trim();
      return !recordedIdentifierSet.has(email) && !recordedIdentifierSet.has(id);
    });

    const insertedAbsentRecords = [];
    let lastError = null;

    for (const student of missingStudents) {
      const studentEmail = (student.email || "").toLowerCase().trim();
      const studentName = student.full_name || student.student_name || (studentEmail.includes("@") ? studentEmail.split("@")[0] : "Student");
      const studentIdVal = student.enrollment_no || student.id || studentEmail;

      const absentPayload = {
        student_id: studentIdVal,
        student_name: studentName,
        student_email: studentEmail,
        employee_id: studentEmail,
        user_email: studentEmail,
        user_name: studentName,
        user_role: "student",
        attendance_date: targetDate,
        date: targetDate,
        status: "Absent",
        attendance_status: "Absent",
        attendance_marked: false,
        check_in_time: "--:--",
        check_in: "--:--",
        check_out_time: "--:--",
        check_out: "--:--",
        ip_address: "N/A",
        public_ip: "N/A",
        network_verified: false,
        notes: "Automatically recorded as absent after shift hours.",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: inserted, error: insertError } = await supabase
        .from("attendance")
        .insert([absentPayload])
        .select();

      if (!insertError && inserted && inserted.length > 0) {
        insertedAbsentRecords.push(inserted[0]);
        recordedIdentifierSet.add(studentEmail);
        recordedIdentifierSet.add(studentIdVal.toLowerCase());
      } else if (insertError) {
        lastError = insertError.message;
        console.error("Auto absent insert error for", studentEmail, insertError);
      }
    }

    return NextResponse.json({
      success: true,
      date: targetDate,
      active_students: activeStudents.length,
      already_recorded: recordedIdentifierSet.size,
      present_count: presentCount,
      absent_created: insertedAbsentRecords.length,
      absent_students: insertedAbsentRecords.map(r => r.student_email || r.user_email),
      last_error: lastError
    });

  } catch (e) {
    console.error("Error in auto-absent processing endpoint:", e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function GET(request) {
  // Allow GET to be triggered by cron webhooks or uptime monitors
  return POST(request);
}

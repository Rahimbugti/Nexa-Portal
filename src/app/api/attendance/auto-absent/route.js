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

// Helper to get formatted date string in Asia/Karachi timezone
function getTargetDate(customDate) {
  if (customDate && /^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
    return customDate;
  }
  const now = new Date();
  // Format to YYYY-MM-DD
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Scheduled / On-Demand Auto-Absent Processing Endpoint
 * Finds all active Students who have NOT marked attendance for the target date
 * and inserts permanent 'Absent' records into Supabase.
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

    // 2. Try executing Postgres Function `process_daily_student_absences` first
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc("process_daily_student_absences", {
        target_date: targetDate
      });

      if (!rpcError && rpcData) {
        return NextResponse.json(rpcData);
      }
    } catch (rpcErr) {
      console.warn("RPC process_daily_student_absences not yet installed or failed, using server-side query fallback:", rpcErr.message);
    }

    // 3. Fallback: Perform server-side active students vs attendance reconciliation
    // Fetch all active students
    const { data: students, error: stuError } = await supabase
      .from("students")
      .select("id, full_name, student_name, email, course_name, status");

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
      .select("*")
      .eq("date", targetDate);

    if (!attError && attData) {
      existingAttendance = attData;
    } else {
      const { data: fbData } = await supabase
        .from("attendance")
        .select("*");
      existingAttendance = (fbData || []).filter(r => (r.date === targetDate || r.attendance_date === targetDate));
    }

    // Map of existing emails with attendance today
    const recordedEmailSet = new Set();
    let presentCount = 0;

    (existingAttendance || []).forEach(record => {
      const email = (record.user_email || record.student_id || record.employee_id || record.email || "").toLowerCase().trim();
      if (email) recordedEmailSet.add(email);
      const st = (record.status || record.attendance_status || "").toLowerCase();
      if (st.includes("present") || st.includes("late") || st.includes("leave")) {
        presentCount++;
      }
    });

    // Identify missing active students
    const missingStudents = activeStudents.filter(s => {
      const email = s.email.toLowerCase().trim();
      return !recordedEmailSet.has(email);
    });

    const insertedAbsentRecords = [];

    let lastError = null;
    for (const student of missingStudents) {
      const studentEmail = student.email.toLowerCase().trim();
      const studentName = student.full_name || student.student_name || studentEmail.split("@")[0];
      const studentUuid = student.id;

      const absentPayload = {
        employee_id: null,
        user_email: studentEmail,
        user_name: studentName,
        date: targetDate,
        status: "Absent",
        attendance_status: "Absent 🔴",
        check_in_time: "--:--",
        check_out_time: "--:--",
        public_ip: "N/A"
      };




      const { data: inserted, error: insertError } = await supabase
        .from("attendance")
        .insert([absentPayload])
        .select();

      if (!insertError && inserted && inserted.length > 0) {
        insertedAbsentRecords.push(inserted[0]);
        recordedEmailSet.add(studentEmail);
      } else if (insertError) {
        lastError = insertError.message;
        console.error("Auto absent insert error for", studentEmail, insertError);
      }
    }

    return NextResponse.json({
      success: true,
      date: targetDate,
      active_students: activeStudents.length,
      already_recorded: recordedEmailSet.size,
      present_count: presentCount,
      absent_created: insertedAbsentRecords.length,
      absent_students: insertedAbsentRecords.map(r => r.user_email || r.email),
      last_error: lastError
    });


  } catch (e) {
    console.error("Error in auto-absent processing endpoint:", e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function GET(request) {
  // Allow GET as well so it can be pinged by standard webhooks or uptime monitors
  return POST(request);
}

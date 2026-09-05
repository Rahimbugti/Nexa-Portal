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
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`
    }
  }
});

// Day names lookup
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Convert time strings to 24-hour format for database storage
function convertTo24HourTime(timeStr) {
  if (!timeStr || timeStr === "--:--" || String(timeStr).includes("Not Checked Out")) return null;
  const str = String(timeStr).trim();
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(str)) return str.length === 5 ? `${str}:00` : str;

  const match = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const seconds = match[3] || "00";
  const modifier = match[4].toUpperCase();

  if (modifier === "PM" && hours < 12) hours += 12;
  if (modifier === "AM" && hours === 12) hours = 0;

  return `${String(hours).padStart(2, "0")}:${minutes}:${seconds}`;
}

// Convert 24-hour time to 12-hour format for display
function convertTo12HourTime(timeStr) {
  if (!timeStr || timeStr === "--:--" || timeStr === "Not Checked Out") return "—";
  const parts = String(timeStr).split(":");
  if (parts.length < 2) return timeStr;
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  const modifier = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${String(hours).padStart(2, "0")}:${minutes} ${modifier}`;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const fromDate = searchParams.get("from") || searchParams.get("startDate");
    const toDate = searchParams.get("to") || searchParams.get("endDate");
    const month = searchParams.get("month"); // e.g. "2026-09"
    const studentId = searchParams.get("studentId") || searchParams.get("email");
    const requesterEmail = (searchParams.get("requesterEmail") || "").toLowerCase().trim();
    const requesterRole = (searchParams.get("requesterRole") || "").toLowerCase().trim();
    const limit = parseInt(searchParams.get("limit") || "365");

    // Access control: If requester is student, ensure they can only query their own history
    if (requesterRole === "student" && requesterEmail && studentId) {
      if (studentId.toLowerCase().trim() !== requesterEmail) {
        return NextResponse.json({
          success: false,
          error: "Unauthorized access to other student attendance records."
        }, { status: 403 });
      }
    }

    // Build query
    let query = supabase.from("attendance").select("*").order("created_at", { ascending: false }).limit(limit);

    if (date) {
      query = query.or(`attendance_date.eq.${date},date.eq.${date}`);
    } else {
      if (fromDate) {
        query = query.gte("date", fromDate);
      }
      if (toDate) {
        query = query.lte("date", toDate);
      }
      if (month && !fromDate && !toDate) {
        const startOfMonth = `${month}-01`;
        const endOfMonth = `${month}-31`;
        query = query.gte("date", startOfMonth).lte("date", endOfMonth);
      }
    }

    if (studentId) {
      const cleanId = studentId.toLowerCase().trim();
      query = query.ilike("user_email", `%${cleanId}%`);
    }



    const { data, error } = await query;

    if (error) {
      console.error("Supabase attendance fetch error:", error);
      return NextResponse.json({ success: true, data: [], summary: null });
    }

    // Transform and normalize data
    const transformedData = (data || []).map(item => {
      const studentEmail = item.student_id || item.user_email || item.employee_id || item.email || "";
      const studentName = item.student_name || item.user_name || item.name || studentEmail.split("@")[0];
      const rawStatus = (item.attendance_status || item.status || "").toLowerCase();
      
      let attendanceStatus = "Present";
      if (rawStatus.includes("absent")) {
        attendanceStatus = "Absent";
      } else if (rawStatus.includes("late") || rawStatus.includes("warning")) {
        attendanceStatus = "Late";
      } else if (rawStatus.includes("leave")) {
        attendanceStatus = "Leave";
      } else if (rawStatus.includes("holiday") || rawStatus.includes("sunday")) {
        attendanceStatus = "Holiday";
      } else if (rawStatus.includes("present")) {
        attendanceStatus = "Present";
      }

      const attDate = item.attendance_date || item.date || "";
      let dayName = "—";
      if (attDate && /^\d{4}-\d{2}-\d{2}$/.test(attDate)) {
        const [y, m, d] = attDate.split("-").map(Number);
        const dateObj = new Date(y, m - 1, d);
        dayName = DAY_NAMES[dateObj.getDay()] || "—";
      }

      return {
        id: item.id,
        student_id: studentEmail,
        user_email: studentEmail,
        student_name: studentName,
        user_name: studentName,
        date: attDate,
        attendance_date: attDate,
        day_name: dayName,
        status: attendanceStatus,
        attendance_status: attendanceStatus,
        check_in: item.check_in_time ? convertTo12HourTime(item.check_in_time) : (item.check_in ? convertTo12HourTime(item.check_in) : "—"),
        check_out: item.check_out_time ? convertTo12HourTime(item.check_out_time) : (item.check_out ? convertTo12HourTime(item.check_out) : "—"),
        ip_address: item.public_ip || item.ip_address || "Office Verified",
        public_ip: item.public_ip || item.ip_address || "Office Verified",
        network_verified: item.network_verified ?? true,
        notes: item.notes || "",
        created_at: item.created_at || ""
      };
    });

    // Calculate Summary Statistics
    const workingDays = transformedData.filter(d => d.status !== "Holiday" && d.day_name !== "Sunday");
    const presentCount = workingDays.filter(d => d.status === "Present").length;
    const lateCount = workingDays.filter(d => d.status === "Late").length;
    const absentCount = workingDays.filter(d => d.status === "Absent").length;
    const leaveCount = workingDays.filter(d => d.status === "Leave").length;
    const holidayCount = transformedData.filter(d => d.status === "Holiday" || d.day_name === "Sunday").length;

    const totalWorking = workingDays.length;
    const attendancePercentage = totalWorking > 0
      ? Number((((presentCount + lateCount) / totalWorking) * 100).toFixed(2))
      : 100;

    const summary = {
      total_working_days: totalWorking,
      present_days: presentCount,
      absent_days: absentCount,
      late_days: lateCount,
      leave_days: leaveCount,
      holidays: holidayCount,
      attendance_percentage: attendancePercentage
    };

    return NextResponse.json({ 
      success: true, 
      data: transformedData,
      summary: summary
    }, {
      status: 200,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" }
    });

  } catch (e) {
    console.error("Error fetching student attendance:", e);
    return NextResponse.json({ success: true, data: [], summary: null });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, records, studentId, date } = body;

    if (!action) {
      return NextResponse.json({ error: "Action required" }, { status: 400 });
    }

    // 1. SAVE/BULK SAVE/CLOCK-IN ACTION
    if (action === "save" || action === "bulk_save" || action === "clock_in" || action === "mark_self") {
      const recordsToSave = Array.isArray(records) ? records : [records];
      
      if (recordsToSave.length === 0) {
        return NextResponse.json({ success: true, saved: 0 });
      }

      const savedRecords = [];

      for (const record of recordsToSave) {
        if (!record) continue;

        const studentEmail = (record.student_id || record.user_email || record.user_id || record.email || studentId || "").toLowerCase().trim();
        const studentName = record.student_name || record.user_name || record.name || studentEmail.split("@")[0];
        const attDate = record.date || record.attendance_date || date || new Date().toISOString().split("T")[0];
        
        // Determine status from input
        const rawStatus = (record.status || record.attendance_status || "Present").toLowerCase();
        let attendanceStatus = "Present";
        
        if (rawStatus.includes("absent")) {
          attendanceStatus = "Absent";
        } else if (rawStatus.includes("late")) {
          attendanceStatus = "Late";
        } else if (rawStatus.includes("leave")) {
          attendanceStatus = "Leave";
        } else if (rawStatus.includes("holiday") || rawStatus.includes("sunday")) {
          attendanceStatus = "Holiday";
        } else if (rawStatus.includes("present")) {
          attendanceStatus = "Present";
        }

        const checkInTime = convertTo24HourTime(record.check_in || record.check_in_time) || "10:00:00";
        const checkOutTime = convertTo24HourTime(record.check_out || record.check_out_time);

        // Server-Side Office Public IP Verification for Students
        const clientProvidedIp = (record.public_ip || record.ip_address || "").trim();
        const headerIp = (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "").split(",")[0].trim();
        const effectiveIp = clientProvidedIp || headerIp || "127.0.0.1";

        const isSelfStudentMark = record.is_self_student_clockin || record.user_role === "student" || action === "clock_in" || action === "mark_self";
        
        if (isSelfStudentMark) {
          // Fetch authorized Office Public IP from system_settings
          let authorizedOfficeIp = process.env.OFFICE_PUBLIC_IP || "39.46.69.123";
          try {
            const { data: setting } = await supabase
              .from("system_settings")
              .select("value")
              .eq("key", "office_public_ip")
              .maybeSingle();

            if (setting && setting.value) {
              if (typeof setting.value === "object" && (setting.value.ip || setting.value.office_public_ip)) {
                authorizedOfficeIp = (setting.value.ip || setting.value.office_public_ip).trim();
              } else if (typeof setting.value === "string") {
                authorizedOfficeIp = setting.value.trim();
              }
            }
          } catch (e) {}

          const isMatch = clientProvidedIp && clientProvidedIp.toLowerCase() === authorizedOfficeIp.toLowerCase();
          if (!isMatch) {
            return NextResponse.json({
              success: false,
              error: "Attendance can only be marked while connected to the authorized Office Wi-Fi network."
            }, { status: 403 });
          }
        }

        // Check for existing attendance record for this student on this date
        const { data: existingRows } = await supabase
          .from("attendance")
          .select("id, check_in, check_in_time")
          .or(`student_id.eq.${studentEmail},user_email.eq.${studentEmail},employee_id.eq.${studentEmail}`)
          .eq("attendance_date", attDate)
          .limit(1);

        const attPayload = {
          employee_id: studentEmail,
          student_id: studentEmail,
          user_email: studentEmail,
          user_name: studentName,
          user_role: "student",
          attendance_date: attDate,
          date: attDate,
          status: attendanceStatus,
          attendance_status: attendanceStatus,
          check_in: checkInTime,
          check_in_time: checkInTime,
          check_out: checkOutTime,
          check_out_time: checkOutTime,
          ip_address: effectiveIp,
          public_ip: effectiveIp,
          network_verified: true,
          updated_at: new Date().toISOString()
        };

        if (existingRows && existingRows.length > 0) {
          // Preserve initial check-in if already recorded
          if (existingRows[0].check_in_time && existingRows[0].check_in_time !== "--:--") {
            attPayload.check_in_time = existingRows[0].check_in_time;
            attPayload.check_in = existingRows[0].check_in_time;
          }

          const { data: updated, error: updateError } = await supabase
            .from("attendance")
            .update(attPayload)
            .eq("id", existingRows[0].id)
            .select();

          if (!updateError && updated && updated.length > 0) {
            savedRecords.push(updated[0]);
          }
        } else {
          // Insert new record
          attPayload.created_at = new Date().toISOString();
          const { data: inserted, error: insertError } = await supabase
            .from("attendance")
            .insert([attPayload])
            .select();

          if (!insertError && inserted && inserted.length > 0) {
            savedRecords.push(inserted[0]);
          }
        }

        // Sync to students table for quick attendance summary percentage
        if (studentEmail) {
          try {
            const { data: studentRecords } = await supabase
              .from("attendance")
              .select("status")
              .or(`student_id.eq.${studentEmail},user_email.eq.${studentEmail}`)
              .gte("attendance_date", new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);

            if (studentRecords && studentRecords.length > 0) {
              const presentCount = studentRecords.filter(a => {
                const s = (a.status || "").toLowerCase();
                return s.includes("present") || s.includes("late") || s.includes("leave");
              }).length;
              const newAttendanceRate = Math.round((presentCount / studentRecords.length) * 100);

              await supabase
                .from("students")
                .update({ 
                  attendance_percentage: newAttendanceRate,
                  updated_at: new Date().toISOString()
                })
                .eq("email", studentEmail);
            }
          } catch (e) {
            console.debug(`Could not update student attendance for ${studentEmail}:`, e);
          }
        }
      }

      return NextResponse.json({ 
        success: true, 
        saved: savedRecords.length,
        records: savedRecords
      });
    }

    // 2. DELETE ACTION
    if (action === "delete") {
      const { id, studentId: deleteStudentId, date: deleteDate } = records || {};
      
      if (id) {
        const { error } = await supabase.from("attendance").delete().eq("id", id);
        if (!error) {
          return NextResponse.json({ success: true, deleted: true, id });
        }
      }

      if (deleteStudentId && deleteDate) {
        const { error } = await supabase
          .from("attendance")
          .delete()
          .or(`student_id.eq.${deleteStudentId},user_email.eq.${deleteStudentId}`)
          .eq("attendance_date", deleteDate);

        if (!error) {
          return NextResponse.json({ success: true, deleted: true, studentId: deleteStudentId, date: deleteDate });
        }
      }

      return NextResponse.json({ success: false, error: "No valid identifier provided" });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });

  } catch (e) {
    console.error("Error in student attendance API:", e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

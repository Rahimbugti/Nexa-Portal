import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  if (!timeStr || timeStr === "--:--" || timeStr === "Not Checked Out") return "Not Checked Out";
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
    const studentId = searchParams.get("studentId");
    const limit = parseInt(searchParams.get("limit") || "30");

    // Build query
    let query = supabase.from("attendance").select("*").order("created_at", { ascending: false }).limit(limit);

    if (date) {
      query = query.eq("attendance_date", date);
    }

    if (studentId) {
      query = query.or(`student_id.eq.${studentId},user_email.eq.${studentId},user_id.eq.${studentId}`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase attendance fetch error:", error);
      return NextResponse.json({ success: true, data: [] });
    }

    // Transform data for student attendance format
    const transformedData = (data || []).map(item => {
      // Map different possible field names
      const studentEmail = item.student_id || item.user_email || item.user_id || item.email || "";
      const studentName = item.student_name || item.user_name || item.name || "";
      
      // Determine attendance status from various possible fields
      const rawStatus = item.attendance_status || item.status || "";
      let attendanceStatus = "Present";
      
      if (rawStatus.toLowerCase().includes("absent")) {
        attendanceStatus = "Absent";
      } else if (rawStatus.toLowerCase().includes("late")) {
        attendanceStatus = "Late";
      } else if (rawStatus.toLowerCase().includes("leave")) {
        attendanceStatus = "Leave";
      } else if (rawStatus.toLowerCase().includes("present")) {
        attendanceStatus = "Present";
      }

      return {
        id: item.id,
        student_id: studentEmail,
        student_name: studentName,
        date: item.attendance_date || item.date || "",
        status: attendanceStatus,
        check_in: item.check_in_time ? convertTo12HourTime(item.check_in_time) : (item.check_in ? convertTo12HourTime(item.check_in) : "--:--"),
        check_out: item.check_out_time ? convertTo12HourTime(item.check_out_time) : (item.check_out ? convertTo12HourTime(item.check_out) : "Not Checked Out"),
        ip_address: item.ip_address || item.public_ip || "127.0.0.1",
        created_at: item.created_at || item.timestamp || ""
      };
    });

    return NextResponse.json({ 
      success: true, 
      data: transformedData 
    }, {
      status: 200,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" }
    });

  } catch (e) {
    console.error("Error fetching student attendance:", e);
    return NextResponse.json({ success: true, data: [] });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, records, studentId, date } = body;

    if (!action) {
      return NextResponse.json({ error: "Action required" }, { status: 400 });
    }

    // 1. SAVE/BULK SAVE ACTION
    if (action === "save" || action === "bulk_save") {
      const recordsToSave = Array.isArray(records) ? records : [records];
      
      if (recordsToSave.length === 0) {
        return NextResponse.json({ success: true, saved: 0 });
      }

      const savedRecords = [];

      for (const record of recordsToSave) {
        if (!record) continue;

        const studentEmail = (record.student_id || record.user_email || record.user_id || record.email || "").toLowerCase().trim();
        const studentName = record.student_name || record.user_name || record.name || studentEmail.split("@")[0];
        const attDate = record.date || record.attendance_date || date || new Date().toISOString().split("T")[0];
        
        // Determine status from various possible fields
        const rawStatus = record.status || record.attendance_status || "Present";
        let attendanceStatus = "Present";
        
        if (rawStatus.toLowerCase().includes("absent")) {
          attendanceStatus = "Absent";
        } else if (rawStatus.toLowerCase().includes("late")) {
          attendanceStatus = "Late";
        } else if (rawStatus.toLowerCase().includes("leave")) {
          attendanceStatus = "Leave";
        } else if (rawStatus.toLowerCase().includes("present")) {
          attendanceStatus = "Present";
        }

        const checkInTime = convertTo24HourTime(record.check_in || record.check_in_time) || "09:00:00";
        const checkOutTime = convertTo24HourTime(record.check_out || record.check_out_time);

        // Check for existing attendance record for this student on this date
        const { data: existingRows } = await supabase
          .from("attendance")
          .select("id")
          .or(`student_id.eq.${studentEmail},user_email.eq.${studentEmail},user_id.eq.${studentEmail}`)
          .eq("attendance_date", attDate)
          .limit(1);

        const attPayload = {
          employee_id: studentEmail,
          student_id: studentEmail,
          user_email: studentEmail,
          user_name: studentName,
          attendance_date: attDate,
          date: attDate,
          status: attendanceStatus,
          attendance_status: attendanceStatus,
          check_in: checkInTime,
          check_in_time: checkInTime,
          check_out: checkOutTime,
          check_out_time: checkOutTime,
          ip_address: record.ip_address || record.public_ip || "127.0.0.1",
          public_ip: record.ip_address || record.public_ip || "127.0.0.1",
          updated_at: new Date().toISOString()
        };

        if (existingRows && existingRows.length > 0) {
          // Update existing record
          const { data: updated, error: updateError } = await supabase
            .from("attendance")
            .update(attPayload)
            .eq("id", existingRows[0].id)
            .select();

          if (!updateError && updated) {
            savedRecords.push(updated[0]);
          } else {
            // Fallback update
            const fallback = {
              employee_id: studentEmail,
              date: attDate,
              status: attendanceStatus,
              check_in: checkInTime,
              check_out: checkOutTime,
              ip_address: record.ip_address || "127.0.0.1"
            };
            const { data: fUp } = await supabase.from("attendance").update(fallback).eq("id", existingRows[0].id).select();
            if (fUp) savedRecords.push(fUp[0]);
          }
        } else {
          // Insert new record
          const { data: inserted, error: insertError } = await supabase
            .from("attendance")
            .insert([attPayload])
            .select();

          if (!insertError && inserted) {
            savedRecords.push(inserted[0]);
          } else {
            // Fallback insert
            const fallback = {
              employee_id: studentEmail,
              date: attDate,
              status: attendanceStatus,
              check_in: checkInTime,
              check_out: checkOutTime,
              ip_address: record.ip_address || "127.0.0.1"
            };
            const { data: fIns } = await supabase.from("attendance").insert([fallback]).select();
            if (fIns) savedRecords.push(fIns[0]);
          }
        }

        // Also sync to students table for quick attendance summary
        if (studentEmail) {
          try {
            const { data: studentData } = await supabase
              .from("students")
              .select("id, attendance")
              .eq("email", studentEmail)
              .limit(1);

            if (studentData && studentData[0]) {
              const studentId = studentData[0].id;
              
              // Calculate updated attendance percentage based on recent records
              const { data: recentAttendance } = await supabase
                .from("attendance")
                .select("status")
                .or(`student_id.eq.${studentEmail},user_email.eq.${studentEmail}`)
                .gte("attendance_date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);

              if (recentAttendance && recentAttendance.length > 0) {
                const presentCount = recentAttendance.filter(a => 
                  (a.status || "").toLowerCase().includes("present") || 
                  (a.status || "").toLowerCase().includes("on time") ||
                  (a.status || "").toLowerCase().includes("leave")
                ).length;
                const newAttendanceRate = Math.round((presentCount / recentAttendance.length) * 100);

                await supabase
                  .from("students")
                  .update({ attendance: newAttendanceRate })
                  .eq("id", studentId);
              }
            }
          } catch (e) {
            // Don't fail if student update fails
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

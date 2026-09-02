import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder"))
  ? process.env.NEXT_PUBLIC_SUPABASE_URL
  : "https://uzwmwtkldgchnuqxamov.supabase.co";

const LIVE_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6d213dGtsZGdjaG51cXhhbW92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MDUxMjYsImV4cCI6MjEwMDk4MTEyNn0.dTw41DhaS-qDVqX4jj3WsrAvYE9CLigjOLZFiDt_7Rk";
const supabaseKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.includes("placeholder"))
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
    let table = searchParams.get("table");
    if (!table) {
      return NextResponse.json({ error: "Table name required" }, { status: 400 });
    }

    let { data, error } = await supabase.from(table).select("*");

    if (table === "daily_tasks" && Array.isArray(data)) {
      data = data.map(item => ({
        ...item,
        task: item.task_title || item.task || item.title || "Untitled Task",
        assignedTo: item.assigned_to ? `${item.assigned_to} (${item.assigned_to_email || ""})` : item.assignedTo,
        assigned_to_name: item.assigned_to || item.assigned_to_name,
        assigned_to_email: item.assigned_to_email || item.email
      }));
    }

    if (table === "attendance" && Array.isArray(data)) {
      try {
        const [allEmps, allStudents, allInterns] = await Promise.all([
          supabase.from("employees").select("id, full_name, email").then(r => r.data || []).catch(() => []),
          supabase.from("students").select("id, full_name, email").then(r => r.data || []).catch(() => []),
          supabase.from("interns").select("id, full_name, email").then(r => r.data || []).catch(() => []),
        ]);

        const userMap = new Map();
        [...allEmps, ...allStudents, ...allInterns].forEach(u => {
          if (!u) return;
          if (u.id) userMap.set(String(u.id).toLowerCase().trim(), u);
          if (u.email) userMap.set(u.email.toLowerCase().trim(), u);
          if (u.enrollment_no) userMap.set(String(u.enrollment_no).toLowerCase().trim(), u);
          if (u.full_name) userMap.set(u.full_name.toLowerCase().trim(), u);
          if (u.name) userMap.set(u.name.toLowerCase().trim(), u);
        });

        data = data.map(item => {
          const empIdStr = String(item.employee_id || item.student_id || item.user_email || item.user_id || item.email || "").toLowerCase().trim();
          const user = userMap.get(empIdStr) || 
                       userMap.get(String(item.id || "").toLowerCase().trim()) || 
                       (item.user_name ? userMap.get(String(item.user_name).toLowerCase().trim()) : null) || 
                       (item.name ? userMap.get(String(item.name).toLowerCase().trim()) : null);
          const email = user?.email || (empIdStr.includes("@") ? empIdStr : (item.user_email || item.student_id || item.email || ""));
          const name = user?.full_name || user?.name || item.name || item.user_name || item.employee_name || (email ? email.split("@")[0] : "Member");
          return {
            id: item.id,
            employee_id: email || empIdStr,
            user_email: email || empIdStr,
            email: email || empIdStr,
            user_name: name,
            name: name,
            attendance_date: item.date || item.attendance_date,
            date: item.date || item.attendance_date,
            check_in_time: item.check_in ? convertTo12HourTime(item.check_in) : (item.check_in_time || "--:--"),
            check_out_time: item.check_out ? convertTo12HourTime(item.check_out) : (item.check_out_time || "Not Checked Out"),
            attendance_status: item.status || item.attendance_status || (item.check_out ? "Present (Completed)" : "Present (On Time)"),
            status: item.status || item.attendance_status,
            public_ip: item.ip_address || item.public_ip || "127.0.0.1",
            timestamp: item.timestamp || `${item.date || item.attendance_date || new Date().toISOString().split("T")[0]}T${item.check_in || "00:00:00"}`
          };
        });
      } catch (e) { }
    }

    if (error) {
      return NextResponse.json({ success: true, data: [] }, {
        status: 200,
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" }
      });
    }

    return NextResponse.json({ success: true, data: data || [] }, {
      status: 200,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" }
    });
  } catch (e) {
    return NextResponse.json({ success: true, data: [] }, {
      status: 200,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" }
    });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { table, record, action } = body;

    if (!table) {
      return NextResponse.json({ error: "Table required" }, { status: 400 });
    }

    // 0. CLEAR ALL ACTION
    if (action === "clear_all" || action === "delete_all") {
      const { error } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
      return NextResponse.json({ success: true, cleared: !error, error: error ? error.message : null });
    }

    // 1. DELETE ACTION
    if (action === "delete") {
      const { id, email, full_name, name, task_title, title, applicant_email } = record || {};
      const cleanEmail = (email || applicant_email || "").toLowerCase().trim();
      const cleanName = (full_name || name || "").trim();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const isValidDbId = id && (uuidRegex.test(String(id)) || (!isNaN(Number(id)) && Number(id) > 0));

      // 1. Direct ID deletion if valid DB ID
      if (isValidDbId) {
        await supabase.from(table).delete().eq("id", id).catch(() => {});
      }

      // 2. Query and delete from students table by email, name, or enrollment
      if (cleanEmail || cleanName) {
        try {
          const { data: matchedStudents } = await supabase
            .from("students")
            .select("id")
            .or(cleanEmail ? `email.ilike.%${cleanEmail}%` : `full_name.ilike.%${cleanName}%`)
            .catch(() => ({ data: [] }));

          if (matchedStudents && matchedStudents.length > 0) {
            for (const s of matchedStudents) {
              await supabase.from("students").delete().eq("id", s.id).catch(() => {});
            }
          }
        } catch (e) {}

        // 3. Query and delete from interns table by email or name
        try {
          const { data: matchedInterns } = await supabase
            .from("interns")
            .select("id")
            .or(cleanEmail ? `email.ilike.%${cleanEmail}%` : `full_name.ilike.%${cleanName}%`)
            .catch(() => ({ data: [] }));

          if (matchedInterns && matchedInterns.length > 0) {
            for (const i of matchedInterns) {
              await supabase.from("interns").delete().eq("id", i.id).catch(() => {});
            }
          }
        } catch (e) {}

        // 4. Query and delete from employees table by email or name
        try {
          const { data: matchedEmployees } = await supabase
            .from("employees")
            .select("id")
            .or(cleanEmail ? `email.ilike.%${cleanEmail}%` : `full_name.ilike.%${cleanName}%`)
            .catch(() => ({ data: [] }));

          if (matchedEmployees && matchedEmployees.length > 0) {
            for (const emp of matchedEmployees) {
              await supabase.from("employees").delete().eq("id", emp.id).catch(() => {});
            }
          }
        } catch (e) {}

        // 5. Query and delete from app_users
        if (cleanEmail) {
          try {
            const { data: matchedUsers } = await supabase
              .from("app_users")
              .select("id")
              .ilike("email", `%${cleanEmail}%`)
              .catch(() => ({ data: [] }));

            if (matchedUsers && matchedUsers.length > 0) {
              for (const u of matchedUsers) {
                await supabase.from("app_users").delete().eq("id", u.id).catch(() => {});
              }
            }
          } catch (e) {}
        }
      }

      // 6. Direct cascade deletes across all operational tables
      if (cleanEmail) {
        await supabase.from("payrolls").delete().ilike("email", `%${cleanEmail}%`).catch(() => {});
        await supabase.from("performances").delete().ilike("email", `%${cleanEmail}%`).catch(() => {});
        await supabase.from("monitoring_sessions").delete().ilike("user_email", `%${cleanEmail}%`).catch(() => {});
        await supabase.from("attendance").delete().or(`user_email.ilike.%${cleanEmail}%,email.ilike.%${cleanEmail}%,student_id.ilike.%${cleanEmail}%`).catch(() => {});
        await supabase.from("daily_tasks").delete().or(`assigned_to_email.ilike.%${cleanEmail}%,email.ilike.%${cleanEmail}%`).catch(() => {});
        await supabase.from("leaves").delete().or(`applicant_email.ilike.%${cleanEmail}%,email.ilike.%${cleanEmail}%`).catch(() => {});
        await supabase.from("screenshot_logs").delete().or(`email.ilike.%${cleanEmail}%,employeeId.ilike.%${cleanEmail}%`).catch(() => {});
        await supabase.from("activity_logs").delete().or(`email.ilike.%${cleanEmail}%,employeeId.ilike.%${cleanEmail}%`).catch(() => {});
      }

      // 7. For tasks or projects, delete by title if ID was local/temporary
      if (task_title || title) {
        const titleField = table === "daily_tasks" ? "task_title" : "title";
        await supabase.from(table).delete().eq(titleField, task_title || title).catch(() => {});
      }

      return NextResponse.json({ success: true, deleted: true });
    }

    // 2. SAVE ACTION
    if (record) {
      // 2.1 Attendance
      if (table === "attendance") {
        const attDate = record.date || record.attendance_date || (record.timestamp ? record.timestamp.split("T")[0] : new Date().toISOString().split("T")[0]);
        const checkInTime = convertTo24HourTime(record.check_in || record.check_in_time) || "09:00:00";
        const checkOutTime = convertTo24HourTime(record.check_out || record.check_out_time);

        let empUuid = null;
        const targetEmail = (record.user_email || record.email || record.student_id || record.employee_id || "").toLowerCase().trim();
        const targetName = (record.user_name || record.name || record.full_name || record.employee_name || "").trim();

        if (targetEmail) {
          const { data: empData } = await supabase.from("employees").select("id").ilike("email", targetEmail).limit(1).catch(() => ({ data: [] }));
          if (empData && empData[0]) {
            empUuid = empData[0].id;
          } else {
            const { data: stuData } = await supabase.from("students").select("id").ilike("email", targetEmail).limit(1).catch(() => ({ data: [] }));
            if (stuData && stuData[0]) {
              empUuid = stuData[0].id;
            } else {
              const { data: intData } = await supabase.from("interns").select("id").ilike("email", targetEmail).limit(1).catch(() => ({ data: [] }));
              if (intData && intData[0]) {
                empUuid = intData[0].id;
              }
            }
          }
        }

        if (!empUuid && targetName) {
          const { data: empNameData } = await supabase.from("employees").select("id").ilike("full_name", `%${targetName}%`).limit(1).catch(() => ({ data: [] }));
          if (empNameData && empNameData[0]) {
            empUuid = empNameData[0].id;
          } else {
            const { data: stuNameData } = await supabase.from("students").select("id").ilike("full_name", `%${targetName}%`).limit(1).catch(() => ({ data: [] }));
            if (stuNameData && stuNameData[0]) {
              empUuid = stuNameData[0].id;
            } else {
              const { data: intNameData } = await supabase.from("interns").select("id").ilike("full_name", `%${targetName}%`).limit(1).catch(() => ({ data: [] }));
              if (intNameData && intNameData[0]) {
                empUuid = intNameData[0].id;
              }
            }
          }
        }

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        let isRealUuid = empUuid && uuidRegex.test(String(empUuid));

        // If not a valid UUID or not present in DB, ensure an employee row exists to satisfy foreign keys
        if (!isRealUuid && targetEmail) {
          try {
            const { data: createdEmp } = await supabase.from("employees").insert([{
              full_name: targetName || targetEmail.split("@")[0],
              email: targetEmail,
              department: "General",
              designation: "Member",
              employment_type: "Remote Member",
              status: "active"
            }]).select("id");
            if (createdEmp && createdEmp[0] && createdEmp[0].id) {
              empUuid = createdEmp[0].id;
              isRealUuid = true;
            }
          } catch (e) {}
        }

        if (!isRealUuid) {
          try {
            const { data: anyEmp } = await supabase.from("employees").select("id").limit(1);
            if (anyEmp && anyEmp[0] && anyEmp[0].id) {
              empUuid = anyEmp[0].id;
            }
          } catch (e) {}
        }

        const attPayload = {
          employee_id: empUuid,
          user_email: targetEmail,
          user_name: targetName || (targetEmail ? targetEmail.split("@")[0] : "Member"),
          date: attDate,
          status: record.status || record.attendance_status || (checkOutTime ? "Present (Completed)" : "Present (On Time)"),
          check_in: checkInTime,
          check_out: checkOutTime,
          ip_address: record.ip_address || record.public_ip || "127.0.0.1"
        };

        let existingQuery = supabase.from("attendance").select("id").eq("date", attDate);
        if (empUuid) {
          existingQuery = existingQuery.eq("employee_id", empUuid);
        }
        const { data: existingRows } = await existingQuery.limit(1).catch(() => ({ data: [] }));

        let dbSaved = false;
        let dbError = null;
        if (existingRows && existingRows.length > 0) {
          const { error: updateErr } = await supabase.from("attendance").update(attPayload).eq("id", existingRows[0].id);
          if (!updateErr) {
            dbSaved = true;
          } else {
            const fallbackPayload = {
              employee_id: empUuid,
              date: attDate,
              status: attPayload.status,
              check_in: checkInTime,
              check_out: checkOutTime,
              ip_address: attPayload.ip_address
            };
            const { error: fErr } = await supabase.from("attendance").update(fallbackPayload).eq("id", existingRows[0].id);
            if (!fErr) dbSaved = true;
            else dbError = fErr.message;
          }
        } else {
          const { data: insData, error: insertErr } = await supabase.from("attendance").insert([attPayload]).select();
          if (!insertErr && insData) {
            dbSaved = true;
          } else {
            const fallbackPayload = {
              employee_id: empUuid,
              date: attDate,
              status: attPayload.status,
              check_in: checkInTime,
              check_out: checkOutTime,
              ip_address: attPayload.ip_address
            };
            const { data: fInsData, error: fErr } = await supabase.from("attendance").insert([fallbackPayload]).select();
            if (!fErr && fInsData) dbSaved = true;
            else if (fErr) dbError = fErr.message;
          }
        }

        return NextResponse.json({ success: true, saved: dbSaved, error: dbError });
      }

      // 2.2 Students (Student Attendance support)
      if (table === "students") {
        const cleanEmail = (record.email || "").toLowerCase().trim();
        const passVal = record.password || record.assigned_password || "studentpassword123";
        const stuPayload = {
          full_name: record.full_name || cleanEmail.split("@")[0],
          email: cleanEmail,
          phone: record.phone || "",
          course_name: record.course_name || "Full Stack MERN Web Development",
          status: record.status || "Active"
        };

        if (cleanEmail) {
          try {
            const { data: existS } = await supabase.from("students").select("id").eq("email", cleanEmail).limit(1);
            if (existS && existS.length > 0) {
              await supabase.from("students").update(stuPayload).eq("id", existS[0].id);
            } else {
              await supabase.from("students").insert([stuPayload]);
            }
          } catch (e) { }

          try {
            const userPayload = {
              email: cleanEmail,
              password: passVal,
              full_name: stuPayload.full_name,
              role: "student",
              status: "active"
            };
            const { data: existU } = await supabase.from("app_users").select("id").eq("email", cleanEmail).limit(1);
            if (existU && existU.length > 0) {
              await supabase.from("app_users").update(userPayload).eq("id", existU[0].id);
            } else {
              await supabase.from("app_users").insert([userPayload]);
            }
          } catch (e) { }
        }

        return NextResponse.json({ success: true });
      }

      // 2.3 Student Attendance
      if (table === "attendance" && record.student_id) {
        const attDate = record.date || record.attendance_date || new Date().toISOString().split("T")[0];
        const studentEmail = (record.student_id || record.user_email || record.user_id || "").toLowerCase().trim();
        const studentName = record.student_name || record.user_name || record.name || studentEmail.split("@")[0];
        
        let attendanceStatus = "Present";
        if ((record.status || "").toLowerCase().includes("absent")) {
          attendanceStatus = "Absent";
        } else if ((record.status || "").toLowerCase().includes("late")) {
          attendanceStatus = "Late";
        } else if ((record.status || "").toLowerCase().includes("leave")) {
          attendanceStatus = "Leave";
        }

        const checkInTime = convertTo24HourTime(record.check_in || record.check_in_time) || "09:00:00";
        const checkOutTime = convertTo24HourTime(record.check_out || record.check_out_time);

        const attPayload = {
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
          ip_address: record.ip_address || "127.0.0.1",
          public_ip: record.ip_address || "127.0.0.1"
        };

        // Check for existing record
        const { data: existingRows } = await supabase
          .from("attendance")
          .select("id")
          .or(`student_id.eq.${studentEmail},user_email.eq.${studentEmail}`)
          .eq("attendance_date", attDate)
          .limit(1);

        if (existingRows && existingRows.length > 0) {
          await supabase.from("attendance").update(attPayload).eq("id", existingRows[0].id);
        } else {
          await supabase.from("attendance").insert([attPayload]);
        }
        
        // Also update student attendance percentage
        try {
          const { data: studentData } = await supabase
            .from("students")
            .select("id, attendance")
            .eq("email", studentEmail)
            .limit(1);

          if (studentData && studentData[0]) {
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
                .eq("id", studentData[0].id);
            }
          }
        } catch (e) {
          console.debug(`Could not update student attendance for ${studentEmail}:`, e);
        }

        return NextResponse.json({ success: true });
      }

      // 2.4 Daily Tasks Table (Schema Columns: task_title, description, priority, status, assigned_to_email)
      if (table === "daily_tasks") {
        const taskTitle = record.task_title || record.task || record.title || "Untitled Task";
        const desc = record.description || record.task || "Workstream deliverable";
        const cleanEmail = (record.assigned_to_email || record.email || "staff@nexa-portal.com").toLowerCase().trim() || "staff@nexa-portal.com";
        const assignName = record.assigned_to_name || record.assignedTo || cleanEmail.split("@")[0] || "Staff Member";

        // Primary Payload matching exact Supabase Schema (assigned_to_email, task_title, description, priority, status)
        const taskPayload = {
          task_title: taskTitle,
          description: desc,
          priority: record.priority || "Medium",
          status: record.status || "Pending",
          assigned_to_email: cleanEmail
        };

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (record.id && typeof record.id === "string" && uuidRegex.test(record.id)) {
          taskPayload.id = record.id;
        }

        let { data: dtData, error: dtErr } = await supabase.from("daily_tasks").insert([taskPayload]).select();

        if (dtErr) {
          console.error("daily_tasks primary insert error:", dtErr.message || dtErr);
          // Fallback including assigned_to if present in schema
          const fallbackPayload = {
            ...taskPayload,
            assigned_to: assignName
          };
          const fallbackRes = await supabase.from("daily_tasks").insert([fallbackPayload]).select();
          if (!fallbackRes.error) {
            dtData = fallbackRes.data;
            dtErr = null;
          } else {
            dtErr = fallbackRes.error;
          }
        }
        return NextResponse.json({ success: !dtErr, data: dtData, error: dtErr ? (dtErr.message || JSON.stringify(dtErr)) : null });
      }

      // 2.5 Complaints Table (Schema: ticket_id, title, category, description, is_anonymous, submitted_by, email, status, admin_note)
      if (table === "complaints") {
        const recordsToProcess = Array.isArray(body.list) ? body.list : (record ? [record] : []);
        let lastError = null;

        for (const item of recordsToProcess) {
          if (!item) continue;
          const ticketIdStr = item.ticket_id || `TICKET-${Math.floor(100000 + Math.random() * 900000)}`;
          const ticketPayload = {
            ticket_id: ticketIdStr,
            title: item.title || "General Query",
            category: item.category || "General",
            description: item.description || item.title || "",
            is_anonymous: Boolean(item.is_anonymous),
            submitted_by: item.submitted_by || item.email || "Applicant",
            email: item.email || "user@example.com",
            status: item.status || "Pending",
            admin_note: item.admin_note || "Awaiting review."
          };

          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (item.id && typeof item.id === "string" && uuidRegex.test(item.id)) {
            ticketPayload.id = item.id;
          }

          // 1. Primary Target: complaints table
          const { data: existing } = await supabase.from("complaints").select("id").eq("ticket_id", ticketIdStr).limit(1).catch(() => ({ data: [] }));
          let resErr = null;

          if (existing && existing.length > 0) {
            const { error } = await supabase.from("complaints").update(ticketPayload).eq("id", existing[0].id);
            resErr = error;
          } else {
            const { error } = await supabase.from("complaints").insert([ticketPayload]);
            resErr = error;
          }

          // 2. Dual-Target Fallback: Mirror insert into confirmed daily_tasks table in Supabase
          try {
            await supabase.from("daily_tasks").insert([{
              task_title: `[COMPLAINT TICKET] ${ticketIdStr}: ${item.title || item.category || "Query"}`,
              description: `Category: ${item.category || "HR"} | Submitted By: ${item.submitted_by || item.email} | Text: ${item.description || ""}`,
              priority: "High",
              status: "Pending",
              assigned_to_email: item.email || "admin@nexa.com"
            }]);
          } catch (dtErr) {}

          if (resErr) {
            console.error("complaints insert error:", resErr.message || resErr);
            lastError = resErr.message || resErr;
          }
        }
        return NextResponse.json({ success: !lastError, error: lastError ? String(lastError) : null });
      }

      // 2.6 Daily Tasks Table Explicit Handler
      if (table === "daily_tasks") {
        const assignedEmail = (record.assigned_to_email || record.email || "staff@nexa-portal.com").toLowerCase().trim();

        const payload = {
          task_title: record.task_title || record.task || "Workstream Deliverable",
          description: record.description || record.task || "Task Description",
          priority: record.priority || "Medium",
          assigned_to_email: assignedEmail,
          assigned_by_name: record.assigned_by_name || "System Admin",
          due_date: record.due_date || record.dueDate || null,
          status: record.status || "Pending",
          total_working_seconds: Number(record.total_working_seconds || record.timerSeconds) || 0
        };

        const { data: insertedData, error: taskErr } = await supabase.from("daily_tasks").insert([payload]).select();
        return NextResponse.json({ success: !taskErr, data: insertedData, error: taskErr ? taskErr.message : null });
      }

      // 2.6 Announcements Table Explicit Handler
      if (table === "announcements") {
        const recordsToProcess = Array.isArray(body.list) ? body.list : (record ? [record] : []);
        let lastError = null;

        for (const item of recordsToProcess) {
          if (!item) continue;
          const annPayload = {
            title: item.title || "Announcement Notice",
            category: item.category || "General Notice",
            priority: item.priority || "Normal",
            target_audience: item.target_audience || item.target_type || "All Users",
            target_type: item.target_type || "all",
            target_key: item.target_key || null,
            content: item.content || item.description || item.title || "",
            start_date: item.start_date || new Date().toISOString().split("T")[0],
            expiry_date: item.expiry_date || null,
            due_date: item.due_date || null,
            is_fee_notice: Boolean(item.is_fee_notice),
            broadcast_notification: item.broadcast_notification !== false,
          };

          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (item.id && typeof item.id === "string" && uuidRegex.test(item.id)) {
            annPayload.id = item.id;
          }

          const { data: existing } = await supabase.from("announcements").select("id").eq("title", annPayload.title).limit(1).catch(() => ({ data: [] }));

          if (existing && existing.length > 0) {
            const { error } = await supabase.from("announcements").update(annPayload).eq("id", existing[0].id);
            lastError = error;
          } else {
            const { error } = await supabase.from("announcements").insert([annPayload]);
            lastError = error;
          }
        }
        return NextResponse.json({ success: !lastError, error: lastError ? (lastError.message || JSON.stringify(lastError)) : null });
      }

      // 2.7 Projects Table Explicit Handler
      if (table === "projects") {
        const payload = {
          title: record.title || "New Project",
          client: record.client || "Client Deal",
          department: record.department || "Engineering",
          deadline: record.deadline || null,
          budget: record.budget || "Rs. 0",
          status: record.status || "In Progress",
          description: record.description || "",
          progress: Number(record.progress) || 0
        };

        const { data: insertedData, error: projErr } = await supabase.from("projects").insert([payload]).select();
        return NextResponse.json({ success: !projErr, data: insertedData, error: projErr ? projErr.message : null });
      }

      // 2.7 Payrolls Table Explicit Handler
      if (table === "payrolls") {
        const email = (record.email || "").toLowerCase().trim();
        const payload = {
          employee_name: record.employee_name || record.full_name || "Employee",
          email: email,
          department: record.department || "Engineering",
          designation: record.designation || "Staff Member",
          month: record.month || new Date().toISOString().slice(0, 7),
          basic_salary: Number(record.basic_salary) || 50000,
          overtime_hours: Number(record.overtime_hours) || 0,
          overtime_amount: Number(record.overtime_amount) || 0,
          leave_deduction: Number(record.leave_deduction) || 0,
          late_penalty: Number(record.late_penalty) || 0,
          bonus_amount: Number(record.bonus_amount) || 0,
          incentive_amount: Number(record.incentive_amount) || 0,
          loan_deduction: Number(record.loan_deduction) || 0,
          final_payable_salary: Number(record.final_payable_salary) || Number(record.basic_salary) || 50000,
          status: record.status || "processed"
        };

        if (email) {
          const { data: existP } = await supabase.from("payrolls").select("id").eq("email", email).limit(1);
          if (existP && existP.length > 0) {
            await supabase.from("payrolls").update(payload).eq("id", existP[0].id);
          } else {
            await supabase.from("payrolls").insert([payload]);
          }
        }
        return NextResponse.json({ success: true });
      }

      // 2.8 Interns Table Explicit Handler
      if (table === "interns") {
        const payload = {
          full_name: record.full_name || record.name || "Intern Member",
          email: (record.email || "").toLowerCase().trim(),
          phone: record.phone || null,
          internship_mode: record.internship_mode || "On-Site / Offline",
          course_name: record.course_name || record.tech_domain || "Full Stack MERN Web Development",
          start_date: record.start_date || new Date().toISOString().split("T")[0],
          progress: Number(record.progress) || 0,
          status: record.status || "active"
        };

        const { data: insertedData, error: intErr } = await supabase.from("interns").insert([payload]).select();
        return NextResponse.json({ success: !intErr, data: insertedData, error: intErr ? intErr.message : null });
      }

      // 2.9 Students Table Explicit Handler
      if (table === "students") {
        const payload = {
          enrollment_no: record.enrollment_no || `STD-${Math.random().toString(36).substring(2, 8)}`,
          full_name: record.full_name || record.name || "Student Member",
          email: (record.email || "").toLowerCase().trim(),
          phone: record.phone || null,
          course_name: record.course_name || record.tech_domain || "Full Stack MERN Web Development",
          start_date: record.start_date || new Date().toISOString().split("T")[0],
          status: record.status || "active",
          fee_status: record.fee_status || "Paid",
          progress: Number(record.progress) || 0
        };

        const { data: insertedData, error: stuErr } = await supabase.from("students").insert([payload]).select();
        return NextResponse.json({ success: !stuErr, data: insertedData, error: stuErr ? stuErr.message : null });
      }

      // 2.10 General Tables (Incomes, Expenses, etc.)
      const cleaned = {};
      const invalidColumns = [
        "cnic", "internship_mode", "resources_url", "screen_access_url",
        "start_date", "end_date", "daily_logs", "work_mode", "is_remote",
        "course_mode", "reminder_sent", "assigned_password", "enrollment_mode",
        "auth_user_id", "blood_group", "guardian_phone", "emergency_phone",
        "total_fee", "course_fee", "submitted_fee", "fee_paid", "remaining_fee"
      ];

      Object.keys(record).forEach((key) => {
        if (invalidColumns.includes(key)) return;
        const val = record[key];
        if (typeof val === "function" || typeof val === "symbol") return;
        if (val && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date)) return;
        if (key === "id" && typeof val === "string" && isNaN(Number(val))) return;
        cleaned[key] = val;
      });

      const { error: insErr } = await supabase.from(table).insert([cleaned]).catch(() => ({}));
      if (insErr) {
        await supabase.from(table).upsert([cleaned]).catch(() => { });
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: true }, { status: 200 });
  }
}

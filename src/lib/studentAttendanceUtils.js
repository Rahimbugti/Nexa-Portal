/**
 * Student Attendance Utility Functions
 * Provides utility functions for student attendance management
 */

// Use API route instead of direct Supabase access for client-side utilities

/**
 * Get today's date string in YYYY-MM-DD format
 */
export function getTodayDateString() {
  return new Date().toISOString().split("T")[0];
}

/**
 * Get attendance status colors based on status type
 */
export function getAttendanceStatusColor(status) {
  const statusLower = (status || "").toLowerCase();
  
  if (statusLower.includes("present") || statusLower.includes("on time")) {
    return "bg-green-100 text-green-800 border-green-200";
  }
  if (statusLower.includes("absent")) {
    return "bg-red-100 text-red-800 border-red-200";
  }
  if (statusLower.includes("late")) {
    return "bg-yellow-100 text-yellow-800 border-yellow-200";
  }
  if (statusLower.includes("leave")) {
    return "bg-blue-100 text-blue-800 border-blue-200";
  }
  return "bg-gray-100 text-gray-800 border-gray-200";
}

/**
 * Get attendance status icon based on status type
 */
export function getAttendanceStatusIcon(status) {
  const statusLower = (status || "").toLowerCase();
  
  if (statusLower.includes("present") || statusLower.includes("on time")) {
    return "present";
  }
  if (statusLower.includes("absent")) {
    return "absent";
  }
  if (statusLower.includes("late")) {
    return "late";
  }
  if (statusLower.includes("leave")) {
    return "leave";
  }
  return "unknown";
}

/**
 * Calculate attendance percentage for a student
 * @param {Array} attendanceRecords - Array of attendance records
 * @returns {number} Attendance percentage (0-100)
 */
export function calculateAttendancePercentage(attendanceRecords) {
  if (!attendanceRecords || attendanceRecords.length === 0) {
    return 100;
  }

  const presentCount = attendanceRecords.filter(record => {
    const status = (record.status || record.attendance_status || "").toLowerCase();
    return status.includes("present") || 
           status.includes("on time") || 
           status.includes("leave");
  }).length;

  return Math.round((presentCount / attendanceRecords.length) * 100);
}

/**
 * Get all students from database
 */
export async function fetchAllStudents() {
  try {
    const response = await fetch("/api/persistence?table=students");
    const result = await response.json();
    return result?.data || [];
  } catch (e) {
    console.error("Unexpected error fetching students:", e);
    return [];
  }
}

/**
 * Get student attendance for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 */
export async function getStudentAttendanceByDate(date) {
  try {
    const response = await fetch(`/api/attendance/student?date=${encodeURIComponent(date)}`);
    const result = await response.json();
    return result?.data || [];
  } catch (e) {
    console.error("Unexpected error fetching student attendance:", e);
    return [];
  }
}

/**
 * Mark attendance for a student
 * @param {Object} params - Attendance data
 * @param {string} params.studentId - Student email/ID
 * @param {string} params.studentName - Student name
 * @param {string} params.date - Date in YYYY-MM-DD format
 * @param {string} params.status - Attendance status (Present/Absent/Late/Leave)
 * @param {string} params.ipAddress - IP address (optional)
 * @returns {Object} API response
 */
export async function markStudentAttendance({
  studentId,
  studentName,
  date,
  status = "Present",
  ipAddress = "127.0.0.1"
}) {
  try {
    const response = await fetch("/api/attendance/student", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "save",
        records: {
          student_id: studentId,
          student_name: studentName,
          date: date,
          status: status,
          ip_address: ipAddress
        }
      })
    });

    const result = await response.json();
    return result;
  } catch (e) {
    console.error("Error marking student attendance:", e);
    return { success: false, error: e.message };
  }
}

/**
 * Mark bulk attendance for multiple students
 * @param {Array} attendanceData - Array of attendance objects
 * @returns {Object} API response
 */
export async function markBulkStudentAttendance(attendanceData) {
  try {
    const response = await fetch("/api/attendance/student", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "bulk_save",
        records: attendanceData
      })
    });

    const result = await response.json();
    return result;
  } catch (e) {
    console.error("Error marking bulk student attendance:", e);
    return { success: false, error: e.message };
  }
}

/**
 * Get attendance summary for a student
 * @param {string} studentId - Student email/ID
 * @param {number} days - Number of days to include (default: 30)
 */
export async function getStudentAttendanceSummary(studentId, days = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split("T")[0];
    
    const response = await fetch(`/api/attendance/student?date=${startDateStr}`);
    const result = await response.json();
    const allRecords = result?.data || [];
    
    // Filter for this student
    const studentRecords = allRecords.filter(
      r => (r.student_id || r.user_email || r.user_id || "").toLowerCase() === studentId.toLowerCase()
    );

    const summary = {
      totalDays: studentRecords.length,
      present: 0,
      absent: 0,
      late: 0,
      leave: 0
    };

    studentRecords.forEach(record => {
      const status = (record.status || record.attendance_status || "").toLowerCase();
      if (status.includes("present") || status.includes("on time")) {
        summary.present++;
      } else if (status.includes("absent")) {
        summary.absent++;
      } else if (status.includes("late")) {
        summary.late++;
      } else if (status.includes("leave")) {
        summary.leave++;
      }
    });

    summary.percentage = Math.round((summary.present / summary.totalDays) * 100);
    
    return summary;
  } catch (e) {
    console.error("Unexpected error fetching attendance summary:", e);
    return null;
  }
}

/**
 * Export attendance data to CSV
 * @param {Array} attendanceData - Attendance records
 * @param {string} filename - Filename for download
 */
export function exportAttendanceToCSV(attendanceData, filename = "student_attendance.csv") {
  if (!attendanceData || attendanceData.length === 0) {
    return;
  }

  const csvHeader = "Student ID,Student Name,Date,Status,Check In,Check Out,IP Address\n";
  
  const csvContent = attendanceData.map(record => {
    const studentId = record.student_id || record.user_email || record.user_id || "";
    const studentName = record.student_name || record.user_name || record.name || "";
    const date = record.attendance_date || record.date || "";
    const status = record.status || record.attendance_status || "";
    const checkIn = record.check_in_time || record.check_in || "--:--";
    const checkOut = record.check_out_time || record.check_out || "Not Checked Out";
    const ipAddress = record.ip_address || record.public_ip || "127.0.0.1";
    
    return `${studentId},"${studentName}",${date},${status},${checkIn},${checkOut},${ipAddress}`;
  }).join("\n");

  const csv = csvHeader + csvContent;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Get attendance for a specific student
 * @param {string} studentId - Student email/ID
 */
export async function getStudentAttendance(studentId) {
  try {
    const response = await fetch(`/api/attendance/student?studentId=${encodeURIComponent(studentId)}`);
    const result = await response.json();
    return result?.data || [];
  } catch (e) {
    console.error("Unexpected error fetching student attendance:", e);
    return [];
  }
}

/**
 * Delete attendance record
 * @param {string} id - Record ID
 * @param {string} studentId - Student email/ID
 * @param {string} date - Date in YYYY-MM-DD format
 */
export async function deleteAttendanceRecord(id, studentId, date) {
  try {
    const response = await fetch("/api/attendance/student", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "delete",
        records: { id, studentId, date }
      })
    });

    const result = await response.json();
    return result;
  } catch (e) {
    console.error("Error deleting attendance record:", e);
    return { success: false, error: e.message };
  }
}

/**
 * Convert time string to minutes since midnight
 */
export function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return 0;
  
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3] ? match[3].toUpperCase() : "AM";
  
  if (period === "PM" && hours < 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  
  return hours * 60 + minutes;
}

/**
 * Convert minutes to time string
 */
export function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")} ${period}`;
}

/**
 * Fetch Student Attendance History with range filters and calculated summary
 */
export async function fetchStudentAttendanceHistory({
  studentId = "",
  from = "",
  to = "",
  month = "",
  date = "",
  requesterEmail = "",
  requesterRole = "admin"
} = {}) {
  try {
    const params = new URLSearchParams();
    if (studentId) params.append("studentId", studentId);
    if (from) params.append("from", from);
    if (to) params.append("to", to);
    if (month) params.append("month", month);
    if (date) params.append("date", date);
    if (requesterEmail) params.append("requesterEmail", requesterEmail);
    if (requesterRole) params.append("requesterRole", requesterRole);

    const response = await fetch(`/api/attendance/student?${params.toString()}`);
    const result = await response.json();
    return {
      records: result?.data || [],
      summary: result?.summary || null,
      success: result?.success ?? false
    };
  } catch (e) {
    console.error("Error fetching student attendance history:", e);
    return { records: [], summary: null, success: false, error: e.message };
  }
}

/**
 * Trigger server-side daily auto-absent processing
 */
export async function triggerDailyAutoAbsentJob(targetDate = "") {
  try {
    const response = await fetch("/api/attendance/auto-absent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: targetDate })
    });
    return await response.json();
  } catch (e) {
    console.error("Error triggering auto-absent job:", e);
    return { success: false, error: e.message };
  }
}


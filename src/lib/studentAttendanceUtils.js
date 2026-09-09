/**
 * Student Attendance Utility Functions
 * Provides utility functions for student attendance management
 * Timezone: Asia/Karachi (PKT, UTC+5)
 */

/**
 * Get today's date string in Asia/Karachi timezone (YYYY-MM-DD)
 */
export function getKarachiTodayDateString(d = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(d);
  } catch (e) {
    return new Date().toISOString().split("T")[0];
  }
}

/**
 * Alias for today's date string
 */
export function getTodayDateString() {
  return getKarachiTodayDateString();
}

/**
 * Get current time string in Asia/Karachi timezone (HH:MM AM/PM)
 */
export function getKarachiTimeString(d = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Karachi",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }).format(d);
  } catch (e) {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
}

/**
 * Get current minutes from midnight in Asia/Karachi timezone
 */
export function getKarachiMinutes(d = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Karachi",
      hour: "numeric",
      minute: "numeric",
      hour12: false
    }).formatToParts(d);
    const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
    const minute = parseInt(parts.find(p => p.type === "minute")?.value || "0", 10);
    return hour * 60 + minute;
  } catch (e) {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }
}

/**
 * Check if a date string or Date object is a Sunday
 */
export function isSundayDate(dateInput) {
  if (!dateInput) return false;
  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [y, m, d] = dateInput.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.getDay() === 0;
  }
  const dateObj = new Date(dateInput);
  return dateObj.getDay() === 0;
}

/**
 * Get attendance status colors based on status type
 */
export function getAttendanceStatusColor(status) {
  const statusLower = (status || "").toLowerCase();
  
  if (statusLower.includes("present") || statusLower.includes("on time")) {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (statusLower.includes("absent")) {
    return "bg-rose-50 text-rose-700 border-rose-200";
  }
  if (statusLower.includes("late")) {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  if (statusLower.includes("leave")) {
    return "bg-blue-50 text-blue-700 border-blue-200";
  }
  if (statusLower.includes("holiday") || statusLower.includes("sunday")) {
    return "bg-purple-50 text-purple-700 border-purple-200";
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
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
  if (statusLower.includes("holiday") || statusLower.includes("sunday")) {
    return "holiday";
  }
  return "unknown";
}

/**
 * Calculate comprehensive attendance summary for student records
 * @param {Array} attendanceRecords - Array of attendance records
 * @returns {Object} { totalWorkingDays, presentDays, lateDays, absentDays, holidays, attendancePercentage }
 */
export function calculateAttendanceMetrics(attendanceRecords = []) {
  if (!attendanceRecords || attendanceRecords.length === 0) {
    return {
      totalWorkingDays: 0,
      presentDays: 0,
      lateDays: 0,
      absentDays: 0,
      leaveDays: 0,
      holidays: 0,
      attendancePercentage: 100
    };
  }

  let presentDays = 0;
  let lateDays = 0;
  let absentDays = 0;
  let leaveDays = 0;
  let holidays = 0;
  let totalWorkingDays = 0;

  attendanceRecords.forEach(record => {
    const status = (record.status || record.attendance_status || "").toLowerCase();
    const isSun = record.day_name === "Sunday" || record.is_sunday || isSundayDate(record.attendance_date || record.date);

    if (status.includes("holiday") || isSun) {
      holidays++;
    } else {
      totalWorkingDays++;
      if (status.includes("absent")) {
        absentDays++;
      } else if (status.includes("late")) {
        lateDays++;
      } else if (status.includes("leave")) {
        leaveDays++;
      } else {
        presentDays++;
      }
    }
  });

  const attendancePercentage = totalWorkingDays > 0
    ? Number((((presentDays + lateDays) / totalWorkingDays) * 100).toFixed(2))
    : 100;

  return {
    totalWorkingDays,
    presentDays,
    lateDays,
    absentDays,
    leaveDays,
    holidays,
    attendancePercentage
  };
}

/**
 * Calculate attendance percentage for a student
 * @param {Array} attendanceRecords - Array of attendance records
 * @returns {number} Attendance percentage (0-100)
 */
export function calculateAttendancePercentage(attendanceRecords) {
  const metrics = calculateAttendanceMetrics(attendanceRecords);
  return metrics.attendancePercentage;
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
 * Mark attendance for a student (Manual clock-in / Admin mark)
 * @param {Object} params - Attendance data
 */
export async function markStudentAttendance({
  studentId,
  studentName,
  studentEmail,
  date = getKarachiTodayDateString(),
  status = "Present",
  checkInTime = getKarachiTimeString(),
  ipAddress = "127.0.0.1",
  attendanceMarked = true
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
          student_id: studentId || studentEmail,
          student_name: studentName,
          student_email: studentEmail || studentId,
          user_email: studentEmail || studentId,
          date: date,
          attendance_date: date,
          status: status,
          attendance_status: status,
          check_in: checkInTime,
          check_in_time: checkInTime,
          ip_address: ipAddress,
          public_ip: ipAddress,
          attendance_marked: attendanceMarked
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
    const startDateStr = getKarachiTodayDateString(startDate);
    
    const response = await fetch(`/api/attendance/student?studentId=${encodeURIComponent(studentId)}&from=${startDateStr}`);
    const result = await response.json();
    const records = result?.data || [];
    
    const metrics = calculateAttendanceMetrics(records);
    return {
      totalDays: records.length,
      workingDays: metrics.totalWorkingDays,
      present: metrics.presentDays,
      absent: metrics.absentDays,
      late: metrics.lateDays,
      leave: metrics.leaveDays,
      holidays: metrics.holidays,
      percentage: metrics.attendancePercentage
    };
  } catch (e) {
    console.error("Unexpected error fetching attendance summary:", e);
    return null;
  }
}

/**
 * Export attendance data to CSV
 */
export function exportAttendanceToCSV(attendanceData, filename = "student_attendance.csv") {
  if (!attendanceData || attendanceData.length === 0) {
    return;
  }

  const csvHeader = "Student ID,Student Name,Date,Day,Status,Check In,Check Out,Attendance Marked,IP Address\n";
  
  const csvContent = attendanceData.map(record => {
    const studentId = record.student_id || record.user_email || record.user_id || "";
    const studentName = record.student_name || record.user_name || record.name || "";
    const date = record.attendance_date || record.date || "";
    const day = record.day_name || "";
    const status = record.status || record.attendance_status || "";
    const checkIn = record.check_in_time || record.check_in || "--:--";
    const checkOut = record.check_out_time || record.check_out || "Not Checked Out";
    const marked = record.attendance_marked ? "Yes" : "No";
    const ipAddress = record.ip_address || record.public_ip || "127.0.0.1";
    
    return `${studentId},"${studentName}",${date},${day},${status},${checkIn},${checkOut},${marked},${ipAddress}`;
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
  year = "",
  status = "",
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
    if (year) params.append("year", year);
    if (status) params.append("status", status);
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
      body: JSON.stringify({ date: targetDate || getKarachiTodayDateString() })
    });
    return await response.json();
  } catch (e) {
    console.error("Error triggering auto-absent job:", e);
    return { success: false, error: e.message };
  }
}

"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { dbFetch, dbSaveRecord } from "@/lib/dbPersistence";
import { showToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import {
  FaCalendarAlt,
  FaHistory,
  FaUndo,
  FaTrashAlt,
  FaEdit,
  FaExclamationTriangle,
  FaSearch,
  FaUserCheck,
  FaUsers,
  FaUserGraduate,
  FaBriefcase,
  FaCheckCircle,
  FaTimesCircle,
  FaClock,
  FaCalendarCheck,
  FaFilter,
  FaFilePdf,
  FaDownload,
  FaSyncAlt,
  FaBolt
} from "react-icons/fa";
import {
  generatePrintableAttendanceListPdf,
  generatePrintableUserMonthlyAttendancePdf,
  generateSingleUserAttendancePdf,
  generateStudentAttendancePdf
} from "@/lib/generateAttendancePdf";
import { triggerDailyAutoAbsentJob } from "@/lib/studentAttendanceUtils";


// Helper for Today string
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Generate Full Day-by-Day Attendance History Calendar for any selected Student/Employee
function buildTargetUserAttendanceCalendar({ rawLogs, leaves, startDate, todayRecord, isStudent = false }) {
  const todayStr = getTodayDateString();
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();

  // Determine earliest date of actual candidate activity
  let earliestActiveDate = todayStr;

  if (rawLogs && rawLogs.length > 0) {
    rawLogs.forEach((l) => {
      const lDate = (l.attendance_date || l.date || (l.timestamp ? l.timestamp.split("T")[0] : "")).slice(0, 10);
      if (lDate && lDate.length === 10 && lDate < earliestActiveDate && lDate >= "2026-01-01") {
        earliestActiveDate = lDate;
      }
    });
  }

  if (leaves && leaves.length > 0) {
    leaves.forEach((l) => {
      const lStart = (l.start_date || l.applied_at || "").slice(0, 10);
      if (lStart && lStart.length === 10 && lStart < earliestActiveDate && lStart >= "2026-01-01") {
        earliestActiveDate = lStart;
      }
    });
  }

  // Registration/joining date cutoff: never exceed earliest logged activity
  let cleanStartDateStr = earliestActiveDate;
  if (startDate && String(startDate).length >= 10) {
    const sStr = String(startDate).slice(0, 10);
    // If startDate is newer than or equal to earliest active log, use it
    if (sStr >= earliestActiveDate && sStr <= todayStr) {
      cleanStartDateStr = sStr;
    }
  }

  const calendar = [];
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // Step backwards from today strictly down to cleanStartDateStr
  let currDate = new Date();
  let safetyLimit = 365;

  while (safetyLimit > 0) {
    safetyLimit--;
    const year = currDate.getFullYear();
    const month = String(currDate.getMonth() + 1).padStart(2, "0");
    const dayNum = String(currDate.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${dayNum}`;

    if (dateStr < cleanStartDateStr) {
      break; // Reached registration / first activity day — STOP! No older fake attendance entries!
    }

    const dayOfWeek = currDate.getDay(); // 0 = Sunday
    const dayName = dayNames[dayOfWeek];

    // 1. Check rawLogs
    const matchedLog = (rawLogs || []).find((l) => {
      const lDate = l.attendance_date || l.date || (l.timestamp ? l.timestamp.split("T")[0] : "");
      return lDate === dateStr;
    });

    // 2. Check leaves
    const matchedLeave = (leaves || []).find((l) => {
      const lStart = l.start_date || l.applied_at || "";
      const lEnd = l.end_date || l.start_date || "";
      return lStart && lEnd && dateStr >= lStart && dateStr <= lEnd && (l.status === "approved" || l.status === "pending");
    });

    if (dateStr === todayStr && todayRecord && (todayRecord.check_in_time || todayRecord.check_in || todayRecord.type === "check_in")) {
      const cIn = todayRecord.check_in_time || todayRecord.check_in || "--:--";
      const cOut = (todayRecord.check_out_time && todayRecord.check_out_time !== "Not Checked Out" && todayRecord.check_out_time !== "--:--")
        ? todayRecord.check_out_time
        : (todayRecord.check_out || "Not Checked Out");
      calendar.push({
        id: todayRecord.id || `att-${dateStr}`,
        attendance_date: dateStr,
        date: dateStr,
        day_name: dayName,
        check_in_time: cIn,
        check_out_time: cOut,
        attendance_status: todayRecord.attendance_status || todayRecord.status || (cOut !== "Not Checked Out" && cOut !== "--:--" ? "Present (Completed) 🟢" : "Present (On Time) 🟢"),
        is_today: true,
      });
    } else if (matchedLog && (matchedLog.check_in_time || matchedLog.check_in || matchedLog.type === "check_in" || (matchedLog.attendance_status && !String(matchedLog.attendance_status).toLowerCase().includes("absent")))) {
      const cIn = matchedLog.check_in_time || matchedLog.check_in || matchedLog.time || "--:--";
      const cOut = (matchedLog.check_out_time && matchedLog.check_out_time !== "Not Checked Out" && matchedLog.check_out_time !== "--:--")
        ? matchedLog.check_out_time
        : (matchedLog.check_out || (dateStr === todayStr ? "Not Checked Out" : "06:00 PM"));
      calendar.push({
        id: matchedLog.id || `att-${dateStr}`,
        attendance_date: dateStr,
        date: dateStr,
        day_name: dayName,
        check_in_time: cIn,
        check_out_time: cOut,
        attendance_status: matchedLog.attendance_status || matchedLog.status || (cOut !== "Not Checked Out" && cOut !== "--:--" ? "Present (Completed) 🟢" : "Present (On Time) 🟢"),
      });
    } else if (matchedLeave) {
      calendar.push({
        id: `leave-${dateStr}`,
        attendance_date: dateStr,
        date: dateStr,
        day_name: dayName,
        check_in_time: "--:--",
        check_out_time: "--:--",
        attendance_status: `On Leave (${matchedLeave.leave_type || matchedLeave.type || "Casual"}) 🌴`,
        is_leave: true,
      });
    } else if (dayOfWeek === 0) {
      calendar.push({
        id: `sun-${dateStr}`,
        attendance_date: dateStr,
        date: dateStr,
        day_name: dayName,
        check_in_time: "--:--",
        check_out_time: "--:--",
        attendance_status: "Sunday (Weekend Holiday) 🏖️",
        is_sunday: true,
      });
    } else if (dateStr === todayStr) {
      const isShiftOver = currentMins >= 1080;
      calendar.push({
        id: `today-pending-${dateStr}`,
        attendance_date: dateStr,
        date: dateStr,
        day_name: dayName,
        check_in_time: "--:--",
        check_out_time: "--:--",
        attendance_status: isShiftOver ? "Absent Today (Shift Ended 06:00 PM) 🔴" : (currentMins < 600 ? "Shift Starts 10:00 AM ⏳" : "Not Checked In Yet (Shift 10:00 AM - 06:00 PM) 🟠"),
        is_pending: !isShiftOver,
        is_absent: isShiftOver,
        is_today: true,
      });
    } else {
      calendar.push({
        id: `absent-${dateStr}`,
        attendance_date: dateStr,
        date: dateStr,
        day_name: dayName,
        check_in_time: "--:--",
        check_out_time: "--:--",
        attendance_status: "Absent 🔴",
        is_absent: true,
      });
    }
    currDate.setDate(currDate.getDate() - 1);
  }

  return calendar;
}

export default function AdminAttendanceHistoryHub() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Directory State
  const [allUsersList, setAllUsersList] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userFilterRole, setUserFilterRole] = useState("all"); // "all", "students", "employees"
  const [userSearchQuery, setUserSearchQuery] = useState("");

  // Raw Database Datasets
  const [masterLogs, setMasterLogs] = useState([]);
  const [allLeaves, setAllLeaves] = useState([]);

  // Selected User Calendar
  const [userCalendar, setUserCalendar] = useState([]);
  
  // Date Filtering for Selected User
  const [userDatePreset, setUserDatePreset] = useState("all"); // "all", "today", "this_week", "this_month", "month", "custom"
  const [userCustomFrom, setUserCustomFrom] = useState("");
  const [userCustomTo, setUserCustomTo] = useState("");
  const [userSelectedMonth, setUserSelectedMonth] = useState(getTodayDateString().slice(0, 7));
  const [runningAutoAbsent, setRunningAutoAbsent] = useState(false);

  // View Mode: "individual" (Inspector calendar) vs "master_table" (Global logs)
  const [activeTab, setActiveTab] = useState("individual");


  // Master Table Filter States
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");

  // Admin Edit Attendance Modal State
  const [editModal, setEditModal] = useState({
    isOpen: false,
    record: null,
    date: "",
    status: "Present (On Time)",
    checkInTime: "10:00 AM",
    checkOutTime: "06:00 PM",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Load All System Data with Fresh Live Database Fetch
  const loadAllAttendanceHubData = async () => {
    setLoading(true);
    try {
      const [stuRes, internRes, empRes, attRes, leaveRes] = await Promise.all([
        dbFetch("students", [], true).catch(() => []),
        dbFetch("interns", [], true).catch(() => []),
        dbFetch("employees", [], true).catch(() => []),
        dbFetch("attendance", [], true).catch(() => []),
        dbFetch("leaves", [], true).catch(() => [])
      ]);

      setMasterLogs(attRes || []);
      setAllLeaves(leaveRes || []);

      // Build Unified User Directory
      const userMap = new Map();

      (stuRes || []).forEach((s) => {
        const email = (s.email || "").toLowerCase().trim();
        if (!email) return;
        const isIntern = Boolean(s.intern_id || s.internship_mode || (s.course_name && s.course_name.toLowerCase().includes("intern")));
        userMap.set(email, {
          id: s.id || `stu-${email}`,
          email: email,
          name: s.full_name || s.student_name || "Student",
          role: isIntern ? "Remote Intern" : "Student",
          type: "student",
          category: isIntern ? "Remote Internship" : "Course Student",
          department: s.course_name || s.course || "Development",
          startDate: s.admission_date || s.start_date || s.enrollment_date || s.created_at || getTodayDateString(),
          avatar: s.profile_photo || null,
        });
      });

      (internRes || []).forEach((i) => {
        const email = (i.email || "").toLowerCase().trim();
        if (!email || userMap.has(email)) return;
        userMap.set(email, {
          id: i.id || `intern-${email}`,
          email: email,
          name: i.full_name || i.name || "Remote Intern",
          role: "Remote Intern",
          type: "student",
          category: "Remote Internship",
          department: i.tech_domain || i.domain || "AI & Software Engineering",
          startDate: i.start_date || i.admission_date || i.created_at || getTodayDateString(),
          avatar: i.avatar || null,
        });
      });

      (empRes || []).forEach((e) => {
        const email = (e.email || "").toLowerCase().trim();
        if (!email) return;
        userMap.set(email, {
          id: e.id || `emp-${email}`,
          email: email,
          name: e.full_name || e.name || "Employee",
          role: "Employee",
          type: "employee",
          category: e.designation || "Staff Member",
          department: e.department || "Engineering",
          startDate: e.joining_date || e.start_date || e.created_at || getTodayDateString(),
          avatar: e.profile_photo || null,
        });
      });

      const userList = Array.from(userMap.values());
      setAllUsersList(userList);

      // Select first user in active list
      if (userList.length > 0) {
        selectTargetUser(userList[0], attRes, leaveRes);
      } else {
        setSelectedUser(null);
        setUserCalendar([]);
      }
    } catch (e) {
      console.error("Failed to load attendance hub data:", e);
    } finally {
      setLoading(false);
    }
  };

  const handlePermanentDeleteCandidate = async (candidate) => {
    if (!candidate || !confirm(`Permanently delete all attendance records and registration profile for "${candidate.name}" (${candidate.email})?`)) {
      return;
    }

    const email = candidate.email.toLowerCase().trim();
    const id = candidate.id;
    const name = candidate.name;

    try {
      // 1. Immediately update local state
      const remainingUsers = allUsersList.filter(u => u.email.toLowerCase().trim() !== email && u.id !== id);
      setAllUsersList(remainingUsers);
      if (selectedUser?.email?.toLowerCase().trim() === email) {
        if (remainingUsers.length > 0) {
          selectTargetUser(remainingUsers[0]);
        } else {
          setSelectedUser(null);
          setUserCalendar([]);
        }
      }

      // 2. Clear local storage caches
      try {
        localStorage.removeItem(`today_attendance_${email}`);
        const blacklist = JSON.parse(localStorage.getItem("deleted_entity_blacklist") || "[]");
        if (!blacklist.includes(email)) blacklist.push(email);
        localStorage.setItem("deleted_entity_blacklist", JSON.stringify(blacklist));
      } catch (e) {}

      // 3. Delete from DB
      await dbDeleteRecord("students", id, email).catch(() => {});
      await dbDeleteRecord("interns", id, email).catch(() => {});
      await dbDeleteRecord("employees", id, email).catch(() => {});

      if (typeof fetch !== "undefined") {
        await fetch("/api/persistence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: "students", record: { id, email, full_name: name }, action: "delete" })
        }).catch(() => {});
      }

      showToast("Candidate Deleted 🗑️", `All attendance records for ${name} removed permanently.`, "info");
      loadAllAttendanceHubData();
    } catch (e) {
      showToast("Notice ℹ️", `Candidate ${name} processed for removal.`, "info");
      loadAllAttendanceHubData();
    }
  };

  // Select User and Compute Calendar
  const selectTargetUser = (user, currentLogs = masterLogs, currentLeaves = allLeaves) => {
    if (!user) return;
    setSelectedUser(user);

    const uEmail = user.email.toLowerCase().trim();
    const uName = user.name.toLowerCase().trim();

    // 1. Filter user logs with strict matching
    const userLogs = (currentLogs || []).filter((l) => {
      const lEmail = (l.user_email || l.email || l.employee_id || l.student_id || l.user_id || "").toLowerCase().trim();
      const lName = (l.user_name || l.employee_name || l.name || "").toLowerCase().trim();
      if (uEmail && lEmail) {
        return lEmail === uEmail;
      }
      if (uName && lName && uName.length >= 3) {
        return lName === uName;
      }
      return false;
    });

    // 2. Filter user leaves with strict matching
    const userLeaves = (currentLeaves || []).filter((l) => {
      const lEmail = (l.applicant_email || l.email || "").toLowerCase().trim();
      const lName = (l.applicant_name || l.employee_name || "").toLowerCase().trim();
      if (uEmail && lEmail) {
        return lEmail === uEmail;
      }
      if (uName && lName && uName.length >= 3) {
        return lName === uName;
      }
      return false;
    });

    // 3. Check today record from DB logs or localStorage cache
    const todayStr = getTodayDateString();
    let todayRec = userLogs.find(l => {
      const lDate = l.attendance_date || l.date || (l.timestamp ? l.timestamp.split("T")[0] : "");
      return lDate === todayStr;
    });

    if (!todayRec) {
      try {
        const savedToday = JSON.parse(localStorage.getItem(`today_attendance_${uEmail}`) || "null");
        if (savedToday) {
          if (Array.isArray(savedToday)) {
            todayRec = savedToday.find(r => (r.attendance_date === todayStr || r.date === todayStr || (r.timestamp && r.timestamp.startsWith(todayStr))));
          } else if (savedToday.attendance_date === todayStr || savedToday.date === todayStr || (savedToday.timestamp && savedToday.timestamp.startsWith(todayStr))) {
            todayRec = savedToday;
          }
        }
      } catch (e) {}
    }

    // 4. Build Full Calendar
    const calendar = buildTargetUserAttendanceCalendar({
      rawLogs: userLogs,
      leaves: userLeaves,
      startDate: user.startDate,
      todayRecord: todayRec,
      isStudent: user.type === "student",
    });

    setUserCalendar(calendar);
  };

  useEffect(() => {
    const role = localStorage.getItem("user_role") || "employee";
    const email = (localStorage.getItem("current_user_email") || "").toLowerCase().trim();
    const adminCheck = role === "admin" || email.includes("admin") || email.includes("owner");

    setIsAdmin(adminCheck);

    if (!adminCheck) {
      setLoading(false);
      showToast("Access Restricted 🔒", "Admin attendance hub is reserved for authorized managers.", "warning");
      router.replace(role === "student" ? "/dashboard/student" : "/dashboard/employee");
      return;
    }

    loadAllAttendanceHubData();
  }, []);

  // Save Admin Attendance Override
  const handleSaveAttendanceEdit = async () => {
    if (!selectedUser || !editModal.date) return;
    setSavingEdit(true);

    const isSun = editModal.status.includes("Sunday");
    const isLev = editModal.status.includes("Leave");
    const isAbs = editModal.status.includes("Absent");

    const checkInToSave = (isSun || isLev || isAbs) ? "--:--" : editModal.checkInTime;
    const checkOutToSave = (isSun || isLev || isAbs) ? "--:--" : editModal.checkOutTime;

    const recordToSave = {
      id: editModal.record?.id || `att-${Date.now()}`,
      student_id: selectedUser.email,
      employee_id: selectedUser.email,
      user_email: selectedUser.email,
      user_name: selectedUser.name,
      user_role: selectedUser.type === "student" ? "student" : "employee",
      attendance_date: editModal.date,
      date: editModal.date,
      check_in_time: checkInToSave,
      check_out_time: checkOutToSave,
      attendance_status: editModal.status,
      status: editModal.status,
      timestamp: `${editModal.date}T10:00:00.000Z`,
    };

    try {
      await dbSaveRecord("attendance", recordToSave);

      // Update Local State
      const updatedLogs = [recordToSave, ...masterLogs.filter(l => {
        const lDate = l.attendance_date || l.date;
        const lEmail = (l.user_email || l.email || l.student_id || "").toLowerCase().trim();
        return !(lDate === editModal.date && lEmail === selectedUser.email.toLowerCase().trim());
      })];
      setMasterLogs(updatedLogs);

      // Rebuild User Calendar
      selectTargetUser(selectedUser, updatedLogs, allLeaves);

      showToast("Attendance Updated ✏️", `Saved record for ${selectedUser.name} on ${editModal.date}.`, "success");
      setEditModal({ ...editModal, isOpen: false });
    } catch (err) {
      showToast("Save Error ⚠️", "Failed to update attendance record.", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  // Filter Users List
  const filteredUsers = allUsersList.filter((u) => {
    if (userFilterRole === "students" && u.type !== "student") return false;
    if (userFilterRole === "employees" && u.type !== "employee") return false;
    if (userSearchQuery.trim()) {
      const q = userSearchQuery.toLowerCase().trim();
      const n = u.name.toLowerCase();
      const e = u.email.toLowerCase();
      const d = u.department.toLowerCase();
      if (!n.includes(q) && !e.includes(q) && !d.includes(q)) return false;
    }
    return true;
  });

  // Master Global Table Filtering
  const filteredGlobalLogs = masterLogs.filter((item) => {
    const itemDateStr = item.attendance_date || item.date || (item.timestamp ? item.timestamp.split("T")[0] : "");
    if (fromDate && itemDateStr && itemDateStr < fromDate) return false;
    if (toDate && itemDateStr && itemDateStr > toDate) return false;
    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase();
      const name = (item.user_name || item.employee_name || item.user_email || "").toLowerCase();
      const status = (item.attendance_status || item.status || "").toLowerCase();
      if (!name.includes(q) && !status.includes(q)) return false;
    }
    return true;
  });

  // Filtered Calendar for Selected User based on Date Filters
  const filteredUserCalendar = useMemo(() => {
    if (!userCalendar || userCalendar.length === 0) return [];
    const todayStr = getTodayDateString();

    if (userDatePreset === "today") {
      return userCalendar.filter(c => (c.attendance_date || c.date) === todayStr);
    }
    if (userDatePreset === "this_week") {
      const now = new Date();
      const firstDayOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
      const firstDayStr = firstDayOfWeek.toISOString().split("T")[0];
      return userCalendar.filter(c => {
        const d = c.attendance_date || c.date || "";
        return d >= firstDayStr && d <= todayStr;
      });
    }
    if (userDatePreset === "this_month") {
      const ym = todayStr.slice(0, 7);
      return userCalendar.filter(c => (c.attendance_date || c.date || "").startsWith(ym));
    }
    if (userDatePreset === "month" && userSelectedMonth) {
      return userCalendar.filter(c => (c.attendance_date || c.date || "").startsWith(userSelectedMonth));
    }
    if (userDatePreset === "custom") {
      return userCalendar.filter(c => {
        const d = c.attendance_date || c.date || "";
        if (userCustomFrom && d < userCustomFrom) return false;
        if (userCustomTo && d > userCustomTo) return false;
        return true;
      });
    }
    return userCalendar;
  }, [userCalendar, userDatePreset, userSelectedMonth, userCustomFrom, userCustomTo]);

  // Calculate Dynamic Metrics for Selected User from real filtered data
  const workingDays = filteredUserCalendar.filter(d => !d.is_sunday && d.attendance_status !== "Sunday (Weekend Holiday) 🏖️" && d.day_name !== "Sunday");
  const presentDays = workingDays.filter(d => (d.attendance_status || "").toLowerCase().includes("present") || (d.attendance_status || "").toLowerCase().includes("on time") || (d.attendance_status || "").toLowerCase().includes("completed"));
  const lateDays = workingDays.filter(d => (d.attendance_status || "").toLowerCase().includes("late") || (d.attendance_status || "").toLowerCase().includes("warning") || (d.attendance_status || "").toLowerCase().includes("deduction"));
  const leaveDays = workingDays.filter(d => (d.attendance_status || "").toLowerCase().includes("leave"));
  const absentDays = workingDays.filter(d => (d.attendance_status || "").toLowerCase().includes("absent"));
  const totalSundays = filteredUserCalendar.filter(d => d.is_sunday || d.day_name === "Sunday" || (d.attendance_status || "").toLowerCase().includes("sunday") || (d.attendance_status || "").toLowerCase().includes("holiday")).length;

  const attendanceRate = workingDays.length > 0
    ? Number((((presentDays.length + lateDays.length) / workingDays.length) * 100).toFixed(2))
    : 100;

  // Trigger server-side auto-absent processing
  const handleRunAutoAbsent = async () => {
    setRunningAutoAbsent(true);
    try {
      const today = getTodayDateString();
      const result = await triggerDailyAutoAbsentJob(today);
      if (result.success) {
        if (result.is_sunday) {
          showToast("Sunday Holiday 🏖️", "Today is Sunday (Weekend Holiday). No student absences generated.", "info");
        } else {
          showToast(
            "Auto-Absent Processed ⚡",
            `Audited ${result.active_students || 0} active students. Created ${result.absent_created || 0} missing absent records.`,
            "success"
          );
        }
        await loadAllAttendanceHubData();
      } else {
        showToast("Process Error ⚠️", result.error || "Failed to process auto absences.", "error");
      }
    } catch (e) {
      showToast("Error", "Failed to run auto-absent process.", "error");
    } finally {
      setRunningAutoAbsent(false);
    }
  };

  const handleExportMasterPdf = () => {
    try {
      generatePrintableAttendanceListPdf({
        title: "Master Attendance History Logs",
        subtitle: `Date Filter: ${fromDate || 'Earliest'} to ${toDate || 'Latest'}`,
        reportDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
        filterInfo: `Search: ${globalSearch || 'All Users'} | Filtered Count: ${filteredGlobalLogs.length}`,
        records: filteredGlobalLogs,
        generatedBy: "Admin Attendance Supervisor"
      });
      showToast("PDF Ready 📄", "Master attendance history opened for printing or PDF download.", "success");
    } catch(e) {
      showToast("PDF Error", "Failed to generate master attendance PDF.", "error");
    }
  };

  const handleExportUserCalendarPdf = () => {
    if (!selectedUser) return;
    try {
      let periodLabel = "Complete Attendance History";
      if (userDatePreset === "today") periodLabel = `Today (${getTodayDateString()})`;
      else if (userDatePreset === "this_week") periodLabel = "This Week";
      else if (userDatePreset === "this_month") periodLabel = `This Month (${getTodayDateString().slice(0, 7)})`;
      else if (userDatePreset === "month" && userSelectedMonth) periodLabel = `Month: ${userSelectedMonth}`;
      else if (userDatePreset === "custom") periodLabel = `${userCustomFrom || 'Earliest'} to ${userCustomTo || 'Latest'}`;

      const summaryData = {
        total_working_days: workingDays.length,
        present_days: presentDays.length,
        absent_days: absentDays.length,
        late_days: lateDays.length,
        leave_days: leaveDays.length,
        holidays: totalSundays,
        attendance_percentage: attendanceRate
      };

      generateStudentAttendancePdf({
        student: selectedUser,
        period: periodLabel,
        records: filteredUserCalendar,
        summary: summaryData,
        generatedBy: "Admin Attendance Supervisor"
      });
      showToast("PDF Ready 📄", `Attendance statement for ${selectedUser.name} opened.`, "success");
    } catch(e) {
      console.error(e);
      showToast("PDF Error", "Failed to generate user attendance statement PDF.", "error");
    }
  };

  const handleExportSingleUserPdfFromHistory = (item) => {
    try {
      const targetUserId = item.user_id || item.id;
      const targetEmail = (item.user_email || item.email || "").toLowerCase().trim();
      const targetName = (item.user_name || item.name || item.employee_name || "").toLowerCase().trim();

      const userLogs = masterLogs.filter((l) => {
        const lId = l.user_id || l.id;
        const lEmail = (l.user_email || l.email || "").toLowerCase().trim();
        const lName = (l.user_name || l.name || l.employee_name || "").toLowerCase().trim();

        if (targetUserId && lId && lId === targetUserId) return true;
        if (targetEmail && lEmail && lEmail === targetEmail) return true;
        if (targetName && lName && lName === targetName) return true;
        return false;
      });

      generateSingleUserAttendancePdf({
        user: {
          user_id: targetUserId,
          user_name: item.user_name || item.employee_name || item.name || "Candidate",
          user_email: item.user_email || item.email || "",
          user_role: item.user_role || "Staff"
        },
        records: userLogs.length > 0 ? userLogs : [item],
        generatedBy: "Admin Attendance Supervisor"
      });
      showToast("PDF Ready 📄", `Attendance list generated for ${item.user_name || item.employee_name || 'User'}.`, "success");
    } catch (e) {
      console.error(e);
      showToast("PDF Error", "Failed to generate individual attendance PDF.", "error");
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-[350px] bg-white rounded-3xl border border-slate-200 p-8 flex flex-col items-center justify-center text-center space-y-4 shadow-xs">
        <div className="w-14 h-14 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center text-2xl border border-rose-200">
          <FaExclamationTriangle />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Admin Access Required</h2>
          <p className="text-xs text-slate-500 max-w-md mt-1">
            Global attendance records and individual student inspection are restricted to Admin accounts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
            Attendance Administration Desk
          </span>
          <h1 className="text-xl font-bold text-slate-900 mt-1.5 flex items-center gap-2.5">
            <FaHistory className="text-blue-600" />
            <span>Master Attendance History & Individual Student Inspector</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Select any student, remote intern, or employee to inspect their full day-by-day attendance history, apply date filters, and export PDF reports.
          </p>
        </div>

        {/* Global Action & Tab Switcher */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleRunAutoAbsent}
            disabled={runningAutoAbsent}
            className="px-3.5 py-2 rounded-2xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-xs border border-amber-600"
            title="Trigger scheduled automatic absence processing for active students"
          >
            <FaBolt className={runningAutoAbsent ? "animate-spin text-xs" : "text-xs"} />
            <span>{runningAutoAbsent ? "Processing..." : "Run Auto-Absent ⚡"}</span>
          </button>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab("individual")}
              className={`px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === "individual"
                  ? "bg-white text-blue-600 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <FaUserCheck className="text-xs" />
              <span>Individual User Calendar 👤</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("master_table")}
              className={`px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === "master_table"
                  ? "bg-white text-blue-600 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <FaFilter className="text-xs" />
              <span>All Global Logs Table 📋</span>
            </button>
          </div>
        </div>
      </div>

      {activeTab === "individual" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT SIDEBAR: USER DIRECTORY & SELECTOR */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FaUsers className="text-blue-600" />
                  <span>Select User / Student</span>
                </h3>
                <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                  {filteredUsers.length} Users
                </span>
              </div>

              {/* Role Filters */}
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setUserFilterRole("all")}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    userFilterRole === "all" ? "bg-white text-blue-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setUserFilterRole("students")}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    userFilterRole === "students" ? "bg-white text-blue-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Students
                </button>
                <button
                  type="button"
                  onClick={() => setUserFilterRole("employees")}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    userFilterRole === "employees" ? "bg-white text-blue-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Employees
                </button>
              </div>

              {/* Live Search */}
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  placeholder="Search by name, email, student ID..."
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 outline-none focus:border-blue-600 bg-slate-50/50"
                />
              </div>

              {/* User List Cards */}
              <div className="max-h-[550px] overflow-y-auto space-y-2 pr-1">
                {filteredUsers.length === 0 ? (
                  <p className="text-xs text-slate-400 italic text-center py-6">No matching users found.</p>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelected = selectedUser?.email === u.email;
                    return (
                      <button
                        key={`user-card-${u.email}`}
                        type="button"
                        onClick={() => selectTargetUser(u)}
                        className={`w-full text-left p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 ${
                          isSelected
                            ? "bg-blue-50 border-blue-400 shadow-xs ring-2 ring-blue-500/20"
                            : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 border ${
                          isSelected ? "bg-blue-600 text-white border-blue-700" : "bg-slate-100 text-slate-700 border-slate-200"
                        }`}>
                          {u.name ? u.name.charAt(0).toUpperCase() : "U"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                            <span>{u.name}</span>
                            {u.role.includes("Intern") ? (
                              <span className="text-[9px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200 font-semibold">Intern</span>
                            ) : u.type === "student" ? (
                              <span className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200 font-semibold">Student</span>
                            ) : (
                              <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 font-semibold">Staff</span>
                            )}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">{u.department}</p>
                          <p className="text-[10px] text-slate-400 font-mono truncate">{u.email}</p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* RIGHT MAIN PANEL: SELECTED USER FULL CALENDAR, DATE FILTERS & PDF EXPORT */}
          <div className="lg:col-span-8 space-y-6">
            {selectedUser ? (
              <>
                {/* Active User Banner */}
                <div className="bg-gradient-to-r from-blue-900 via-slate-900 to-indigo-950 rounded-3xl p-6 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold text-xl border-2 border-white/20 shadow-inner">
                      {selectedUser.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-white">{selectedUser.name}</h2>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white border border-white/30">
                          {selectedUser.category}
                        </span>
                      </div>
                      <p className="text-xs text-blue-200 mt-0.5">{selectedUser.department}</p>
                      <p className="text-[11px] text-slate-300 font-mono mt-0.5">{selectedUser.email}</p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:items-end gap-2 text-right sm:border-l sm:border-white/10 sm:pl-6">
                    <div>
                      <p className="text-[11px] text-blue-200 uppercase font-semibold">Attendance Rate (Filtered)</p>
                      <p className="text-3xl font-extrabold text-emerald-400 mt-0.5">{attendanceRate}%</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleExportUserCalendarPdf}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-xs border border-emerald-400/30"
                        title="Download Filtered Attendance PDF Report"
                      >
                        <FaFilePdf className="text-xs" />
                        <span>Download PDF 📄</span>
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handlePermanentDeleteCandidate(selectedUser)}
                          className="px-3 py-1.5 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white font-bold text-[11px] transition-all cursor-pointer flex items-center gap-1.5 shadow-xs border border-rose-400/30"
                        >
                          <FaTrashAlt className="text-[10px]" />
                          <span>Purge 🗑️</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Date Filter Toolbar for Selected User */}
                <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                      <FaFilter className="text-blue-600" />
                      <span>Filter Attendance Period</span>
                    </span>
                    <span className="text-[11px] text-slate-500 font-semibold">
                      Showing <strong className="text-blue-600">{filteredUserCalendar.length}</strong> attendance records
                    </span>
                  </div>

                  {/* Preset Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setUserDatePreset("all")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        userDatePreset === "all"
                          ? "bg-blue-600 text-white shadow-xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      All Time
                    </button>
                    <button
                      type="button"
                      onClick={() => setUserDatePreset("today")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        userDatePreset === "today"
                          ? "bg-blue-600 text-white shadow-xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setUserDatePreset("this_week")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        userDatePreset === "this_week"
                          ? "bg-blue-600 text-white shadow-xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      This Week
                    </button>
                    <button
                      type="button"
                      onClick={() => setUserDatePreset("this_month")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        userDatePreset === "this_month"
                          ? "bg-blue-600 text-white shadow-xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      This Month
                    </button>
                    <button
                      type="button"
                      onClick={() => setUserDatePreset("month")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        userDatePreset === "month"
                          ? "bg-blue-600 text-white shadow-xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      Month Picker
                    </button>
                    <button
                      type="button"
                      onClick={() => setUserDatePreset("custom")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        userDatePreset === "custom"
                          ? "bg-blue-600 text-white shadow-xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      Custom Range
                    </button>
                  </div>

                  {/* Interactive Date Selectors */}
                  {userDatePreset === "month" && (
                    <div className="pt-2 flex items-center gap-3">
                      <label className="text-xs font-bold text-slate-700">Select Month & Year:</label>
                      <input
                        type="month"
                        value={userSelectedMonth}
                        onChange={(e) => setUserSelectedMonth(e.target.value)}
                        className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-600 bg-white"
                      />
                    </div>
                  )}

                  {userDatePreset === "custom" && (
                    <div className="pt-2 flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-700">From:</label>
                        <input
                          type="date"
                          value={userCustomFrom}
                          onChange={(e) => setUserCustomFrom(e.target.value)}
                          className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-600 bg-white"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-700">To:</label>
                        <input
                          type="date"
                          value={userCustomTo}
                          onChange={(e) => setUserCustomTo(e.target.value)}
                          className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-600 bg-white"
                        />
                      </div>
                      {(userCustomFrom || userCustomTo) && (
                        <button
                          type="button"
                          onClick={() => { setUserCustomFrom(""); setUserCustomTo(""); }}
                          className="text-xs text-blue-600 hover:underline font-bold cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Summary Metrics Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                  <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs text-center">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Working Days</span>
                    <p className="text-lg font-bold text-slate-900 mt-1">{workingDays.length}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs text-center">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Presents</span>
                    <p className="text-lg font-bold text-emerald-600 mt-1">{presentDays.length}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs text-center">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Absents</span>
                    <p className="text-lg font-bold text-rose-600 mt-1">{absentDays.length}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs text-center">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Late</span>
                    <p className="text-lg font-bold text-amber-600 mt-1">{lateDays.length}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs text-center">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Holidays</span>
                    <p className="text-lg font-bold text-slate-600 mt-1">{totalSundays}</p>
                  </div>
                  <div className="bg-blue-50/50 p-3.5 rounded-2xl border border-blue-200 shadow-xs text-center">
                    <span className="text-[10px] font-bold uppercase text-blue-600">Rate</span>
                    <p className="text-lg font-bold text-blue-700 mt-1">{attendanceRate}%</p>
                  </div>
                </div>

                {/* Day-By-Day Attendance History Calendar Table */}
                <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <FaCalendarCheck className="text-blue-600" />
                      <span>{selectedUser.name}&apos;s Daily Attendance History</span>
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleExportUserCalendarPdf}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                      >
                        <FaFilePdf className="text-xs" /> Download PDF
                      </button>
                      <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
                        {filteredUserCalendar.length} Records
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px]">
                          <th className="py-2.5 px-3">Date (Day)</th>
                          <th className="py-2.5 px-3">Check-In</th>
                          <th className="py-2.5 px-3">Check-Out</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Network Status</th>
                          <th className="py-2.5 px-3 text-right">Admin Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredUserCalendar.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                              No attendance records found for this period.
                            </td>
                          </tr>
                        ) : (
                          filteredUserCalendar.map((rec) => {
                            const statusStr = (rec.attendance_status || "").toLowerCase();
                            const isSun = statusStr.includes("sunday") || rec.day_name === "Sunday" || rec.is_sunday;
                            const isLev = statusStr.includes("leave");
                            const isAbs = statusStr.includes("absent");
                            const isLate = statusStr.includes("late") || statusStr.includes("deduction") || statusStr.includes("warning");
                            const isPresent = statusStr.includes("present") || statusStr.includes("on time") || statusStr.includes("completed");

                            let badgeColor = "bg-slate-100 text-slate-600 border-slate-200";
                            if (isSun) badgeColor = "bg-purple-50 text-purple-700 border-purple-200";
                            else if (isLev) badgeColor = "bg-blue-50 text-blue-700 border-blue-200";
                            else if (isAbs) badgeColor = "bg-rose-50 text-rose-700 border-rose-200 font-bold";
                            else if (isLate) badgeColor = "bg-amber-50 text-amber-700 border-amber-200 font-bold";
                            else if (isPresent) badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold";

                            const networkDisplay = rec.network_verified || rec.public_ip ? "Office Verified 🟢" : "—";

                            return (
                              <tr key={`cal-row-${rec.attendance_date || rec.date}`} className="hover:bg-slate-50 transition-colors">
                                <td className="py-2.5 px-3 font-semibold text-slate-900">
                                  <span>{rec.attendance_date || rec.date || "Today"}</span>
                                  {rec.day_name && (
                                    <span className="text-[11px] text-slate-400 font-normal ml-1.5">
                                      ({rec.day_name})
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 font-mono font-medium text-emerald-700">
                                  {rec.check_in_time || "--:--"}
                                </td>
                                <td className="py-2.5 px-3 font-mono font-medium text-rose-700">
                                  {rec.check_out_time || "--:--"}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className={`px-2.5 py-1 rounded-full text-[10px] border uppercase inline-flex items-center gap-1 ${badgeColor}`}>
                                    {rec.attendance_status || "Present"}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-[11px] font-medium text-blue-600">
                                  {networkDisplay}
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditModal({
                                        isOpen: true,
                                        record: rec,
                                        date: rec.attendance_date || rec.date,
                                        status: rec.attendance_status || "Present (On Time)",
                                        checkInTime: rec.check_in_time && rec.check_in_time !== "--:--" ? rec.check_in_time : "10:00 AM",
                                        checkOutTime: rec.check_out_time && rec.check_out_time !== "--:--" && rec.check_out_time !== "Not Checked Out" ? rec.check_out_time : "06:00 PM",
                                      });
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] border border-blue-200 transition-all cursor-pointer inline-flex items-center gap-1"
                                    title="Admin Edit Attendance"
                                  >
                                    <FaEdit className="text-[10px]" />
                                    <span>Edit</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-500">
                <FaUserCheck className="text-3xl text-blue-600 mx-auto mb-3" />
                <p className="font-bold text-sm text-slate-900">Select a student or employee to inspect their attendance history.</p>
              </div>
            )}
          </div>
        </div>
      ) : (

        /* MASTER GLOBAL LOGS TABLE */
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1 flex items-center gap-1.5">
                <FaCalendarAlt className="text-blue-600" /> From Date
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-blue-600 bg-white"
              />
            </div>

            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1 flex items-center gap-1.5">
                <FaCalendarAlt className="text-blue-600" /> To Date
              </label>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-blue-600 bg-white"
              />
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Search User / Status</label>
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                <input
                  type="text"
                  value={globalSearch}
                  onChange={e => setGlobalSearch(e.target.value)}
                  placeholder="Name, email, status..."
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 outline-none focus:border-blue-600 bg-white"
                />
              </div>
            </div>

            {(fromDate || toDate || globalSearch) && (
              <button
                type="button"
                onClick={() => { setFromDate(""); setToDate(""); setGlobalSearch(""); }}
                className="bg-slate-100 hover:bg-blue-50 text-blue-600 border border-slate-200 font-semibold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <FaUndo className="text-xs" />
                <span>Reset</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportMasterPdf}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs whitespace-nowrap ml-auto"
            >
              <FaFilePdf className="text-xs" /> Download Master PDF
            </button>
          </div>

          {/* Master Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">User / Candidate</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Check In</th>
                    <th className="py-3 px-4">Check Out</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredGlobalLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 italic">
                        No raw attendance logs match the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredGlobalLogs.map((item, idx) => {
                      const userName = item.user_name || item.employee_name || item.name || item.user_email || "User";
                      const dateStr = item.attendance_date || item.date || (item.timestamp ? item.timestamp.split("T")[0] : "N/A");
                      const clockIn = item.check_in_time || item.check_in || "--:--";
                      const clockOut = item.check_out_time || item.check_out || "Not Checked Out";
                      const roleLabel = (item.user_role === "student" || item.user_role === "course_student") ? "Student" : "Staff";

                      return (
                        <tr key={`global-log-${item.id || idx}`} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 font-semibold text-slate-900">{userName}</td>
                          <td className="py-3 px-4">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded border uppercase bg-blue-50 text-blue-700 border-blue-200">
                              {roleLabel}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold text-slate-900">{dateStr}</td>
                          <td className="py-3 px-4">
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase bg-slate-100 text-slate-700 border-slate-200">
                              {item.attendance_status || item.status || "Present"}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-emerald-700 font-semibold">{clockIn}</td>
                          <td className="py-3 px-4 font-mono text-rose-700 font-semibold">{clockOut}</td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleExportSingleUserPdfFromHistory(item)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                              title={`Download ${userName}'s Attendance PDF`}
                            >
                              <FaFilePdf className="text-[10px] text-emerald-600" />
                              <span>PDF</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN ATTENDANCE OVERRIDE MODAL */}
      {editModal.isOpen && selectedUser && (
        <Modal
          isOpen={editModal.isOpen}
          onClose={() => setEditModal({ ...editModal, isOpen: false })}
          title={`✏️ Admin Attendance Override: ${editModal.date}`}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-blue-900 font-medium">
              <span>Admin Override for <strong>{selectedUser.name}</strong> ({selectedUser.email}) on <strong>{editModal.date}</strong>.</span>
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-slate-700 uppercase text-[10px]">Attendance Status</label>
              <select
                value={editModal.status}
                onChange={(e) => setEditModal({ ...editModal, status: e.target.value })}
                className="w-full p-2.5 rounded-xl border border-slate-300 font-bold text-slate-900 outline-none focus:border-blue-600 bg-white"
              >
                <option value="Present (On Time)">Present (On Time) 🟢</option>
                <option value="Late (Shift 10:00 AM - 06:00 PM)">Late (Shift 10:00 AM - 06:00 PM) 🟡</option>
                <option value="Salary Deduction">Salary Deduction 🔴</option>
                <option value="Absent">Absent 🔴</option>
                <option value="On Leave (Casual)">On Leave (Casual) 🌴</option>
                <option value="On Leave (Sick)">On Leave (Sick) 🏥</option>
                <option value="Sunday (Weekend Holiday)">Sunday (Weekend Holiday) 🏖️</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block font-bold text-slate-700 uppercase text-[10px]">Check-In Time</label>
                <input
                  type="text"
                  value={editModal.checkInTime}
                  onChange={(e) => setEditModal({ ...editModal, checkInTime: e.target.value })}
                  placeholder="10:00 AM"
                  disabled={editModal.status.includes("Absent") || editModal.status.includes("Sunday") || editModal.status.includes("Leave")}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-mono font-bold text-slate-900 outline-none focus:border-blue-600 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700 uppercase text-[10px]">Check-Out Time</label>
                <input
                  type="text"
                  value={editModal.checkOutTime}
                  onChange={(e) => setEditModal({ ...editModal, checkOutTime: e.target.value })}
                  placeholder="06:00 PM"
                  disabled={editModal.status.includes("Absent") || editModal.status.includes("Sunday") || editModal.status.includes("Leave")}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-mono font-bold text-slate-900 outline-none focus:border-blue-600 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditModal({ ...editModal, isOpen: false })}
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAttendanceEdit}
                disabled={savingEdit}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <FaEdit />
                <span>{savingEdit ? "Saving to Supabase..." : "Save to Database"}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

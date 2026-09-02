"use client";

import { useEffect, useState } from "react";
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
  FaFilter
} from "react-icons/fa";

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

  // Clean user's registration/start date strictly
  let cleanStartDateStr = todayStr;
  if (startDate && String(startDate).length >= 10) {
    const sStr = String(startDate).slice(0, 10);
    if (sStr !== "2026-06-01" && sStr !== "2026-05-01" && sStr !== "2026-08-01") {
      cleanStartDateStr = sStr;
    }
  }

  const calendar = [];
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // Step backwards from today strictly down to registration date
  let currDate = new Date();
  let safetyLimit = 365;

  while (safetyLimit > 0) {
    safetyLimit--;
    const year = currDate.getFullYear();
    const month = String(currDate.getMonth() + 1).padStart(2, "0");
    const dayNum = String(currDate.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${dayNum}`;

    if (dateStr < cleanStartDateStr) {
      break; // Reached registration day — STOP! No older fake attendance entries!
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

    if (dateStr === todayStr && todayRecord && todayRecord.check_in_time) {
      calendar.push({
        id: todayRecord.id || `att-${dateStr}`,
        attendance_date: dateStr,
        date: dateStr,
        day_name: dayName,
        check_in_time: todayRecord.check_in_time,
        check_out_time: todayRecord.check_out_time || "Not Checked Out",
        attendance_status: todayRecord.attendance_status || todayRecord.status || "Present (On Time)",
        is_today: true,
      });
    } else if (matchedLog && (matchedLog.check_in_time || matchedLog.type === "check_in" || (matchedLog.attendance_status && matchedLog.attendance_status !== "Absent"))) {
      calendar.push({
        id: matchedLog.id || `att-${dateStr}`,
        attendance_date: dateStr,
        date: dateStr,
        day_name: dayName,
        check_in_time: matchedLog.check_in_time || matchedLog.time || "--:--",
        check_out_time:
          matchedLog.check_out_time && matchedLog.check_out_time !== "Not Checked Out" && matchedLog.check_out_time !== "--:--"
            ? matchedLog.check_out_time
            : (dateStr === todayStr ? "Not Checked Out" : "06:00 PM"),
        attendance_status: matchedLog.attendance_status || matchedLog.status || "Present (On Time)",
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
      const isRegistrationDay = cleanStartDateStr === todayStr;
      if (currentMins >= 1080) { // After 6:00 PM
        calendar.push({
          id: `today-absent-${dateStr}`,
          attendance_date: dateStr,
          date: dateStr,
          day_name: dayName,
          check_in_time: "--:--",
          check_out_time: "--:--",
          attendance_status: isRegistrationDay ? "Enrolled Today (Pending Check-In) ⏳" : "Absent (Shift Ended 06:00 PM) 🔴",
          is_absent: !isRegistrationDay,
          is_pending: isRegistrationDay,
          is_today: true,
        });
      } else {
        calendar.push({
          id: `today-pending-${dateStr}`,
          attendance_date: dateStr,
          date: dateStr,
          day_name: dayName,
          check_in_time: "--:--",
          check_out_time: "--:--",
          attendance_status: isRegistrationDay ? "Enrolled Today (Pending Check-In) ⏳" : (currentMins < 600 ? "Shift Starts 10:00 AM ⏳" : "Not Checked In Yet (Shift 10:00 AM - 06:00 PM) 🟠"),
          is_pending: true,
          is_today: true,
        });
      }
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

  // Load All System Data
  const loadAllAttendanceHubData = async () => {
    setLoading(true);
    try {
      const [stuRes, internRes, empRes, attRes, leaveRes] = await Promise.all([
        dbFetch("students").catch(() => []),
        dbFetch("interns").catch(() => []),
        dbFetch("employees").catch(() => []),
        dbFetch("attendance").catch(() => []),
        dbFetch("leaves").catch(() => [])
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

      // Select first user by default (prefer student/intern like Rahim Bugti)
      if (userList.length > 0) {
        const defaultUser = userList.find(u => u.name.toLowerCase().includes("rahim") || u.email.toLowerCase().includes("rahim")) || userList[0];
        selectTargetUser(defaultUser, attRes, leaveRes);
      }
    } catch (e) {
      console.error("Failed to load attendance hub data:", e);
    } finally {
      setLoading(false);
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

    // 3. Check today record
    const todayStr = getTodayDateString();
    let todayRec = userLogs.find(l => {
      const lDate = l.attendance_date || l.date || (l.timestamp ? l.timestamp.split("T")[0] : "");
      return lDate === todayStr;
    });

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

  // Calculate Metrics for Selected User
  const workingDays = userCalendar.filter(d => !d.is_sunday);
  const presentDays = workingDays.filter(d => (d.attendance_status || "").toLowerCase().includes("present") || (d.attendance_status || "").toLowerCase().includes("on time"));
  const lateDays = workingDays.filter(d => (d.attendance_status || "").toLowerCase().includes("late") || (d.attendance_status || "").toLowerCase().includes("deduction"));
  const leaveDays = workingDays.filter(d => (d.attendance_status || "").toLowerCase().includes("leave"));
  const absentDays = workingDays.filter(d => (d.attendance_status || "").toLowerCase().includes("absent"));
  const totalSundays = userCalendar.filter(d => d.is_sunday).length;

  const attendanceRate = workingDays.length > 0
    ? Math.round(((presentDays.length + leaveDays.length) / workingDays.length) * 100)
    : 100;

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
            Select any student, remote intern, or employee to inspect their full day-by-day attendance history calendar, shift times, Sunday holidays, and leaves.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl border border-slate-200 shrink-0 self-start">
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
                  placeholder="Search student or employee name..."
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

          {/* RIGHT MAIN PANEL: SELECTED USER FULL CALENDAR & METRICS */}
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

                  <div className="text-right sm:border-l sm:border-white/10 sm:pl-6">
                    <p className="text-[11px] text-blue-200 uppercase font-semibold">Working Days Attendance</p>
                    <p className="text-3xl font-extrabold text-emerald-400 mt-0.5">{attendanceRate}%</p>
                    <p className="text-[10px] text-slate-300">Shift: 10:00 AM - 06:00 PM</p>
                  </div>
                </div>

                {/* Summary Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs text-center">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Total Presents</span>
                    <p className="text-xl font-bold text-emerald-600 mt-1">{presentDays.length} Days</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs text-center">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Late / Deductions</span>
                    <p className="text-xl font-bold text-amber-600 mt-1">{lateDays.length} Days</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs text-center">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Approved Leaves</span>
                    <p className="text-xl font-bold text-blue-600 mt-1">{leaveDays.length} Days</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs text-center">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Absents</span>
                    <p className="text-xl font-bold text-rose-600 mt-1">{absentDays.length} Days</p>
                  </div>
                </div>

                {/* Day-By-Day Attendance History Calendar Table */}
                <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <FaCalendarCheck className="text-blue-600" />
                      <span>{selectedUser.name}&apos;s Attendance Calendar History</span>
                    </h3>
                    <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
                      {userCalendar.length} Calendar Days Logged
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px]">
                          <th className="py-2.5 px-3">Date (Day)</th>
                          <th className="py-2.5 px-3">Check-In</th>
                          <th className="py-2.5 px-3">Check-Out</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3 text-right">Admin Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {userCalendar.map((rec) => {
                          const statusStr = (rec.attendance_status || "").toLowerCase();
                          const isSun = statusStr.includes("sunday");
                          const isLev = statusStr.includes("leave");
                          const isAbs = statusStr.includes("absent");
                          const isLate = statusStr.includes("late") || statusStr.includes("deduction");
                          const isPresent = statusStr.includes("present") || statusStr.includes("on time") || statusStr.includes("completed");

                          let badgeColor = "bg-slate-100 text-slate-600 border-slate-200";
                          if (isSun) badgeColor = "bg-purple-50 text-purple-700 border-purple-200";
                          else if (isLev) badgeColor = "bg-blue-50 text-blue-700 border-blue-200";
                          else if (isAbs) badgeColor = "bg-rose-50 text-rose-700 border-rose-200 font-bold";
                          else if (isLate) badgeColor = "bg-amber-50 text-amber-700 border-amber-200 font-bold";
                          else if (isPresent) badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold";

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
                        })}
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredGlobalLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 italic">
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

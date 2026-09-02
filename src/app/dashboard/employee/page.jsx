"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { dbFetch, dbSaveRecord, dbSaveList } from "@/lib/dbPersistence";
import Modal from "@/components/Modal";
import { showToast } from "@/components/Toast";
import { verifyOfficeWifiAttendance } from "@/lib/attendanceIpUtils";
import { isRecordFromToday, isRecordFromYesterday, getTodayDateString, getEmployeeCheckInStatus } from "@/lib/attendanceUtils";
import {
  FaUserCheck,
  FaCalendarCheck,
  FaTasks,
  FaBullhorn,
  FaClock,
  FaCheckCircle,
  FaPlay,
  FaPause,
  FaWifi,
  FaPaperPlane,
  FaExclamationTriangle,
  FaUserTimes,
  FaBriefcase,
  FaFileAlt,
  FaLaptopCode,
  FaArrowLeft,
  FaVideo,
  FaLink,
  FaUsers
} from "react-icons/fa";

import {
  getAssignedExamsForUser,
  getExamAttemptsForUser,
  submitExamAttempt
} from "@/lib/mcqExamUtils";

// Full Attendance Calendar Builder for Employees (Handles Sundays, Leaves, Presents, Shift Times & Absents)
const buildFullEmployeeAttendanceCalendar = ({ rawLogs, leaves, joiningDate, todayRecord }) => {
  const todayStr = getTodayDateString();
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();

  // Employee joining date is the strict hard cutoff boundary
  let cleanStartDateStr = todayStr;
  if (joiningDate && String(joiningDate).length >= 10) {
    const sStr = String(joiningDate).slice(0, 10);
    if (sStr !== "2026-06-01" && sStr !== "2026-05-01" && sStr !== "2026-08-01") {
      cleanStartDateStr = sStr;
    }
  }

  const calendar = [];
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // Step backwards from today strictly down to joining date
  let currDate = new Date();
  let safetyLimit = 365;

  while (safetyLimit > 0) {
    safetyLimit--;
    const year = currDate.getFullYear();
    const month = String(currDate.getMonth() + 1).padStart(2, "0");
    const dayNum = String(currDate.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${dayNum}`;

    if (dateStr < cleanStartDateStr) {
      break; // Reached joining day — STOP! No older fake attendance entries!
    }

    const dayOfWeek = currDate.getDay(); // 0 = Sunday
    const dayName = dayNames[dayOfWeek];

    // 1. Check rawLogs for attendance on this date
    const matchedLog = (rawLogs || []).find((l) => {
      const lDate = l.attendance_date || l.date || (l.timestamp ? l.timestamp.split("T")[0] : "");
      return lDate === dateStr;
    });

    // 2. Check leaves for this date
    const matchedLeave = (leaves || []).find((l) => {
      const lStart = l.start_date || l.applied_at || "";
      const lEnd = l.end_date || l.start_date || "";
      return lStart && lEnd && dateStr >= lStart && dateStr <= lEnd && (l.status === "approved" || l.status === "pending");
    });

    if (dateStr === todayStr && todayRecord && (todayRecord.check_in_time || todayRecord.type === "check_in")) {
      calendar.push({
        id: todayRecord.id || `att-${dateStr}`,
        attendance_date: dateStr,
        date: dateStr,
        day_name: dayName,
        check_in_time: todayRecord.check_in_time || "Clocked In",
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
      calendar.push({
        id: `today-pending-${dateStr}`,
        attendance_date: dateStr,
        date: dateStr,
        day_name: dayName,
        check_in_time: "--:--",
        check_out_time: "--:--",
        attendance_status: currentMins < 600 ? "Shift Starts 10:00 AM ⏳" : (currentMins >= 1080 ? "Absent Today 🔴" : "Not Checked In Yet (Shift 10:00 AM - 06:00 PM) 🟠"),
        is_pending: currentMins < 1080,
        is_absent: currentMins >= 1080,
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
};

export default function EmployeeDedicatedDashboardPage() {
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [isAdminUser, setIsAdminUser] = useState(false);

  // Attendance State
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [yesterdayAttendance, setYesterdayAttendance] = useState(null);
  const [myAttendanceHistory, setMyAttendanceHistory] = useState([]);
  const [markingAttendance, setMarkingAttendance] = useState(false);
  const [wifiStatus, setWifiStatus] = useState("Verifying Wi-Fi...");
  const [userIp, setUserIp] = useState("");

  // Tasks State
  const [myTasks, setMyTasks] = useState([]);
  
  // Announcements & Meetings State
  const [announcements, setAnnouncements] = useState([]);
  const [myMeetings, setMyMeetings] = useState([]);

  // Dynamic MCQ Exams State
  const [assignedExams, setAssignedExams] = useState([]);
  const [examAttempts, setExamAttempts] = useState([]);
  const [activeExam, setActiveExam] = useState(null);
  const [examTimerSeconds, setExamTimerSeconds] = useState(0);
  const [latestAttemptResult, setLatestAttemptResult] = useState(null);
  const [mcqModalOpen, setMcqModalOpen] = useState(false);
  const [userAnswers, setUserAnswers] = useState({});

  // Leave Form State
  const [myLeaves, setMyLeaves] = useState([]);
  const [leaveForm, setLeaveForm] = useState({
    leave_type: "Casual Leave",
    start_date: new Date().toISOString().split("T")[0],
    end_date: new Date().toISOString().split("T")[0],
    reason: "",
  });
  const [submittingLeave, setSubmittingLeave] = useState(false);

  // Modal Notification
  const [modal, setModal] = useState({ isOpen: false, title: "", message: "", type: "info" });

  const showAlert = (title, message, type = "info") => {
    setModal({ isOpen: true, title, message, type });
  };

  const closeModal = () => {
    setModal({ ...modal, isOpen: false });
  };

  const [orgEmployeesAttendance, setOrgEmployeesAttendance] = useState([]);
  const [userAvatarUrl, setUserAvatarUrl] = useState("");
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [inputAvatarUrl, setInputAvatarUrl] = useState("");

  const handleSaveProfileAvatar = (newPicUrl) => {
    if (!newPicUrl) return;
    const eClean = (employeeEmail || localStorage.getItem("current_user_email") || "").toLowerCase().trim();
    if (eClean) {
      localStorage.setItem(`user_avatar_${eClean}`, newPicUrl);
      setUserAvatarUrl(newPicUrl);
    }
    localStorage.removeItem("current_user_avatar");
    localStorage.removeItem("user_profile_avatar");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("avatarChanged"));
    }
    setAvatarModalOpen(false);
    showToast("Profile Photo Updated 🖼️", "Your avatar image has been updated successfully.", "success");
  };

  const handleAvatarFileUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result) {
          handleSaveProfileAvatar(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    const savedRole = localStorage.getItem("user_role") || "employee";
    const savedEmail = (localStorage.getItem("current_user_email") || "").trim().toLowerCase();
    const savedName = localStorage.getItem("current_user_name") || savedEmail.split("@")[0] || "Employee";

    const isAdmin = savedRole === "admin" || savedEmail.includes("admin") || savedEmail.includes("owner");
    setIsAdminUser(isAdmin);
    setEmployeeEmail(savedEmail);
    setEmployeeName(savedName);

    const savedPic = savedEmail ? (localStorage.getItem(`user_avatar_${savedEmail}`) || "") : "";
    setUserAvatarUrl(savedPic);
    setInputAvatarUrl(savedPic);

    fetchEmployeeDashboardData(savedEmail, isAdmin);

    const handleDataChange = () => {
      fetchEmployeeDashboardData(savedEmail, isAdmin);
    };
    window.addEventListener("dataChanged", handleDataChange);
    return () => window.removeEventListener("dataChanged", handleDataChange);
  }, []);

  const fetchEmployeeDashboardData = async (email, isAdmin = false) => {
    if (!email) return;

    // If Admin, fetch all employees & today's attendance status
    if (isAdmin) {
      try {
        const [allEmployees, allLogs] = await Promise.all([
          dbFetch("employees").catch(() => []),
          dbFetch("attendance").catch(() => [])
        ]);
        const todayStr = new Date().toISOString().split("T")[0];
        const statusList = (allEmployees || []).map((emp) => {
          const empEmail = (emp.email || "").toLowerCase().trim();
          const matchLog = (allLogs || []).find(
            (l) => (l.user_email || l.email || "").toLowerCase().trim() === empEmail &&
                   (l.attendance_date === todayStr || (l.timestamp && l.timestamp.startsWith(todayStr)))
          );
          let status = "Absent";
          let checkIn = "--:--";
          let checkOut = "--:--";
          if (matchLog) {
            const hasCheckedOut = matchLog.check_out_time && matchLog.check_out_time !== "Not Checked Out" && matchLog.check_out_time !== "--:--";
            status = matchLog.attendance_status || (hasCheckedOut ? "Completed" : "Present");
            checkIn = matchLog.check_in_time || "--:--";
            checkOut = hasCheckedOut ? matchLog.check_out_time : (matchLog.check_in_time ? "Not Checked Out" : "--:--");
          }
          return {
            id: emp.id || empEmail,
            name: emp.full_name || emp.name,
            department: emp.department || emp.designation || "Staff",
            email: emp.email,
            status,
            checkIn,
            checkOut
          };
        });
        setOrgEmployeesAttendance(statusList);
      } catch (e) {}
    }

    // 1. Fetch Today's Attendance & History Log
    try {
      const allLeaves = await dbFetch("leaves").catch(() => []);
      const userLeaves = (allLeaves || []).filter(
        (l) => (l.applicant_email || l.email || "").toLowerCase().trim() === email
      );
      setMyLeaves(userLeaves);

      const allLogs = await dbFetch("attendance").catch(() => []);
      const userLogs = (allLogs || []).filter(
        (l) => (l.user_email || l.email || l.employee_id || "").toLowerCase().trim() === email ||
               (l.user_name || l.employee_name || "").toLowerCase().trim() === employeeName.toLowerCase().trim()
      );

      // 1. Fetch Today's Attendance & History Log strictly for TODAY
      const key = `today_attendance_${email}`;
      const savedToday = localStorage.getItem(key);
      let currentDayAttendance = null;

      if (savedToday) {
        try {
          const parsed = JSON.parse(savedToday);
          if (Array.isArray(parsed)) {
            currentDayAttendance = parsed.find(r => isRecordFromToday(r) && (r.type === "check_in" || r.check_in_time));
          } else if (isRecordFromToday(parsed)) {
            currentDayAttendance = parsed;
          }
        } catch(e) {}
      }

      if (!currentDayAttendance && userLogs.length > 0) {
        currentDayAttendance = userLogs.find(l => isRecordFromToday(l) && (l.type === "check_in" || l.check_in_time || l.check_in));
      }

      setTodayAttendance(currentDayAttendance || null);

      // Load Yesterday's Attendance Record for Employee View
      let prevAttendance = userLogs.find(l => isRecordFromYesterday(l));
      if (!prevAttendance && userLogs.length > 0) {
        prevAttendance = userLogs.find(l => !isRecordFromToday(l));
      }
      setYesterdayAttendance(prevAttendance || null);

      // Build Comprehensive Attendance Calendar (Sundays, Leaves, Shift Times, Absents & Presents)
      const fullCalendar = buildFullEmployeeAttendanceCalendar({
        rawLogs: userLogs,
        leaves: userLeaves,
        joiningDate: "2026-08-01",
        todayRecord: currentDayAttendance,
      });
      setMyAttendanceHistory(fullCalendar);
    } catch (e) {}

    // Verify Wi-Fi Network
    try {
      const wifiRes = await verifyOfficeWifiAttendance({
        userEmail: email,
        userName: employeeName,
        userRole: "employee",
      });
      setUserIp(wifiRes.currentPublicIp || "Offline");
      setWifiStatus(wifiRes.success ? "Office Wi-Fi Verified 🟢" : "Remote / Unverified Network 🟠");
    } catch (e) {
      setWifiStatus("Wi-Fi Check Active 🔵");
    }

    // 2. Fetch My Assigned Tasks
    try {
      const allTasks = await dbFetch("daily_tasks").catch(() => []);
      const cleanEmail = email.toLowerCase().trim();
      const namePart = cleanEmail.split("@")[0];
      const assigned = (allTasks || []).filter((t) => {
        const tEmail = (t.assigned_to_email || t.assignedToEmail || t.email || "").toLowerCase().trim();
        const tName = (t.assigned_to_name || t.assignedTo || "").toLowerCase().trim();
        const targetAud = (t.targetAudience || "").toLowerCase();
        return (
          tEmail === cleanEmail ||
          (cleanEmail && tEmail.includes(cleanEmail)) ||
          (namePart && tName.includes(namePart)) ||
          targetAud.includes("all paid staff") ||
          targetAud.includes("all staff") ||
          targetAud.includes("all employees")
        );
      });
      setMyTasks(assigned);
    } catch (e) {}

    // 3. Fetch Announcements
    try {
      const allAnnouncements = await dbFetch("announcements").catch(() => []);
      setAnnouncements(allAnnouncements || []);
    } catch (e) {}

    // 5. Fetch Database MCQ Exams & Attempts
    try {
      const examsList = await getAssignedExamsForUser(email);
      const attemptsList = await getExamAttemptsForUser(email);
      setAssignedExams(examsList || []);
      setExamAttempts(attemptsList || []);
    } catch (e) {}

    // 6. Fetch Scheduled Meetings targeted for this employee
    try {
      const allMeetings = await dbFetch("meetings").catch(() => []);
      const cleanEmail = email.toLowerCase().trim();
      const targetedMeetings = (allMeetings || []).filter((m) => {
        if (!m) return false;
        const targetType = (m.target_type || "").toLowerCase();
        const targetKey = (m.target_key || "").toLowerCase();
        return (
          targetType === "all" ||
          targetType === "all_employees" ||
          targetKey.includes(cleanEmail) ||
          (m.participants || []).some(p => (p.email || "").toLowerCase().trim() === cleanEmail)
        );
      });
      setMyMeetings(targetedMeetings);
    } catch (e) {}
  };

  // Handle Start MCQ Exam
  const handleStartMcqExam = (exam) => {
    setActiveExam(exam);
    setUserAnswers({});
    setLatestAttemptResult(null);
    const limitMins = Number(exam.time_limit || 10);
    setExamTimerSeconds(limitMins * 60);
    setMcqModalOpen(true);
  };

  // Handle Submit MCQ Exam
  const handleSubmitMcqExam = async () => {
    if (!activeExam) return;

    const limitSecs = Number(activeExam.time_limit || 10) * 60;
    const timeTaken = Math.max(1, limitSecs - examTimerSeconds);
    const attempt = await submitExamAttempt({
      exam: activeExam,
      userEmail: employeeEmail,
      userName: employeeName,
      userRole: "employee",
      userAnswers: userAnswers,
      timeTakenSeconds: timeTaken,
    });

    setLatestAttemptResult(attempt);
    setExamAttempts((prev) => [attempt, ...prev.filter((a) => a.id !== attempt.id)]);
    showToast("Exam Submitted 📝", `Result: ${attempt.result} (${attempt.percentage}%)`, attempt.result === "PASSED" ? "success" : "info");
  };

  // MCQ Exam Countdown Timer Effect
  useEffect(() => {
    let interval = null;
    if (mcqModalOpen && activeExam && examTimerSeconds > 0 && latestAttemptResult === null) {
      interval = setInterval(() => {
        setExamTimerSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            showToast("Time Expired ⏱️", "Time is over. Your exam has been submitted automatically.", "info");
            handleSubmitMcqExam();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [mcqModalOpen, activeExam, examTimerSeconds, latestAttemptResult]);

  // Check-In Handler
  const handleCheckIn = async () => {
    if (todayAttendance?.check_in_time) {
      showToast("Already Checked In ℹ️", `Checked in today at ${todayAttendance.check_in_time}.`, "info");
      return;
    }

    setMarkingAttendance(true);
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const policyResult = getEmployeeCheckInStatus(currentMinutes);
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const newRecord = {
      id: `att-${Date.now()}`,
      employee_id: employeeEmail,
      user_email: employeeEmail,
      user_name: employeeName,
      user_role: "employee",
      type: "check_in",
      check_in_time: timeStr,
      check_out_time: "Not Checked Out",
      attendance_status: policyResult.status, // "On Time", "Late Warning", or "Salary Deduction"
      status: policyResult.status,
      attendance_date: getTodayDateString(),
      timestamp: now.toISOString(),
      public_ip: userIp || "127.0.0.1",
    };

    setTodayAttendance(newRecord);
    setMyAttendanceHistory((prev) => [newRecord, ...prev.filter(r => r.id !== newRecord.id)]);

    try {
      const key = `today_attendance_${employeeEmail}`;
      localStorage.setItem(key, JSON.stringify([newRecord]));
      await dbSaveRecord("attendance", newRecord).catch(() => {});
    } catch (e) {}

    setMarkingAttendance(false);
    showToast(`Check-In: ${policyResult.label}`, `Recorded at ${timeStr}. Status: ${policyResult.status}`, policyResult.colorKey === "emerald" ? "success" : policyResult.colorKey === "amber" ? "warning" : "error");
    showAlert(
      `Check-In Recorded: ${policyResult.label}`,
      `Check-In Time: ${timeStr}\nAttendance Status: ${policyResult.status} (${policyResult.dot})\nPolicy Rule: ${policyResult.rule}\nNetwork: ${wifiStatus}`,
      policyResult.colorKey === "emerald" ? "success" : policyResult.colorKey === "amber" ? "warning" : "error"
    );
  };

  // Check-Out Handler
  const handleCheckOut = async () => {
    if (!todayAttendance?.check_in_time) {
      showToast("Check-In Required 🛑", "You must check in first before checking out.", "error");
      return;
    }
    const isAlreadyCheckedOut = todayAttendance?.check_out_time && todayAttendance.check_out_time !== "Not Checked Out" && todayAttendance.check_out_time !== "--:--";
    if (isAlreadyCheckedOut) {
      showToast("Already Checked Out ℹ️", `Checked out today at ${todayAttendance.check_out_time}.`, "info");
      return;
    }

    setMarkingAttendance(true);
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const updatedRecord = {
      ...todayAttendance,
      check_out_time: timeStr,
      attendance_status: todayAttendance.attendance_status || "On Time",
      updated_at: now.toISOString(),
    };

    setTodayAttendance(updatedRecord);
    setMyAttendanceHistory((prev) =>
      prev.map((r) => (r.id === updatedRecord.id || r.attendance_date === updatedRecord.attendance_date ? updatedRecord : r))
    );

    try {
      const key = `today_attendance_${employeeEmail}`;
      localStorage.setItem(key, JSON.stringify([updatedRecord]));
      await dbSaveRecord("attendance", updatedRecord).catch(() => {});
    } catch (e) {}

    setMarkingAttendance(false);
    showToast("Check-Out Successful 🔴", `Checked out at ${timeStr}. Daily work log completed.`, "success");
    showAlert("Check-Out Successful 🔴", `Checked out successfully at ${timeStr}!\n\nStatus: ${updatedRecord.attendance_status}\nDaily attendance log marked as Completed.`, "success");
  };

  // Task Status Update Handler
  const handleUpdateTaskStatus = async (taskId, newStatus) => {
    const updated = myTasks.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          status: newStatus,
          isTimerRunning: newStatus === "In Progress",
          progress: newStatus === "Completed" ? 100 : t.progress || 0,
        };
      }
      return t;
    });

    setMyTasks(updated);

    const targetTask = updated.find((t) => t.id === taskId);
    if (targetTask) {
      await dbSaveRecord("daily_tasks", targetTask).catch(() => {});
    }

    showToast("Task Updated 📝", `Status updated to '${newStatus}'.`, "success");
  };

  // Submit Leave Request Handler
  const handleLeaveSubmit = async (e) => {
    e.preventDefault();
    if (!leaveForm.reason.trim()) {
      showToast("Validation Error 🛑", "Please enter a reason for your leave request.", "error");
      return;
    }

    setSubmittingLeave(true);

    const newLeave = {
      id: `leave-${Date.now()}`,
      applicant_name: employeeName || "Employee Staff",
      employee_name: employeeName || "Employee Staff",
      applicant_email: employeeEmail,
      email: employeeEmail,
      role: "employee",
      leave_type: leaveForm.leave_type,
      type: leaveForm.leave_type,
      start_date: leaveForm.start_date,
      end_date: leaveForm.end_date,
      reason: leaveForm.reason.trim(),
      status: "pending",
      salary_cut: false,
      applied_at: new Date().toISOString().split("T")[0],
    };

    const updatedLeaves = [newLeave, ...myLeaves];
    setMyLeaves(updatedLeaves);

    try {
      const savedLeaves = JSON.parse(localStorage.getItem("software_house_leaves") || "[]");
      localStorage.setItem("software_house_leaves", JSON.stringify([newLeave, ...savedLeaves.filter(l => l.id !== newLeave.id)]));
      window.dispatchEvent(new Event("storage"));
    } catch (err) {}

    await dbSaveRecord("leaves", newLeave).catch(() => {});

    setSubmittingLeave(false);
    setLeaveForm({
      leave_type: "Casual Leave",
      start_date: new Date().toISOString().split("T")[0],
      end_date: new Date().toISOString().split("T")[0],
      reason: "",
    });

    showToast("Leave Submitted 📝", "Your leave request has been submitted for Admin approval.", "success");
    showAlert("Leave Request Submitted 🟢", `Leave request (${leaveForm.leave_type}) submitted successfully!\n\nStatus: Pending Admin/HR Approval.`, "success");
  };

  // Metrics Calculations
  const pendingTasksCount = useMemo(() => myTasks.filter((t) => t.status === "Pending" || t.status === "In Progress").length, [myTasks]);
  const completedTasksCount = useMemo(() => myTasks.filter((t) => t.status === "Completed").length, [myTasks]);
  const pendingLeavesCount = useMemo(() => myLeaves.filter((l) => l.status === "Pending").length, [myLeaves]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const currentRole = localStorage.getItem("user_role") || "";
      const currentEmail = (localStorage.getItem("current_user_email") || "").toLowerCase().trim();
      const isAdmin = currentRole === "admin" || currentRole === "hr" || currentRole === "manager" || currentEmail === "admin@gmail.com";
      setIsAdminUser(isAdmin);
    }
  }, []);

  return (
    <div className="space-[#F8FAFC] space-y-6 max-w-7xl mx-auto">
      {/* Modal Notification */}
      <Modal isOpen={modal.isOpen} title={modal.title} message={modal.message} type={modal.type} onClose={closeModal} />

      {/* ADMIN PREVIEW BANNER */}
      {isAdminUser && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🛡️</span>
            <div>
              <p className="text-xs font-bold text-slate-900">Admin View: Staff / Employee Portal</p>
              <p className="text-[11px] text-slate-500">You are previewing the staff portal interface. Click below to return anytime.</p>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm self-start sm:self-auto cursor-pointer"
          >
            <FaArrowLeft className="text-[10px]" />
            <span>Return to Admin Dashboard</span>
          </Link>
        </div>
      )}

      {/* HEADER BANNER */}
      <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            onClick={() => {
              setInputAvatarUrl(userAvatarUrl || "");
              setAvatarModalOpen(true);
            }}
            className="relative h-14 w-14 rounded-2xl overflow-hidden bg-[#EFF6FF] border-2 border-[#2563EB]/30 shadow-xs flex items-center justify-center shrink-0 cursor-pointer group hover:scale-105 transition-transform"
            title="Click to change profile picture"
          >
            {userAvatarUrl ? (
              <img
                src={userAvatarUrl}
                alt="Profile"
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : null}
            <span className="text-[#2563EB] text-base font-bold">
              {(employeeName || "E").slice(0, 2).toUpperCase()}
            </span>
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[10px] font-bold">
              📷
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] bg-[#EFF6FF] px-2.5 py-1 rounded-full border border-[#2563EB]/20">
                Official Employee Workspace
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-[#0F172A] mt-1.5 flex items-center gap-2.5">
              <span>Welcome Back, {employeeName}!</span>
            </h1>
            <p className="text-xs text-[#64748B] mt-1">
              Logged in as <strong className="text-[#0F172A]">{employeeEmail}</strong> • Employee Portal Active
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isAdminUser && (
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-200"
            >
              <FaArrowLeft className="text-xs text-blue-600" />
              <span>Admin Dashboard</span>
            </Link>
          )}

          <div className="bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-2 rounded-xl text-right">
            <span className="block text-[10px] font-semibold text-[#64748B] uppercase">Network Verification</span>
            <span className="text-xs font-bold text-[#2563EB] flex items-center gap-1.5 justify-end">
              <FaWifi className="text-xs" /> {wifiStatus}
            </span>
          </div>
        </div>
      </div>

      {/* SUMMARY METRICS CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          href="/dashboard/attendance"
          className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-2 hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group block"
        >
          <div className="flex justify-between items-center text-xs text-[#64748B]">
            <span className="font-semibold text-slate-700">Today's Attendance</span>
            <FaCalendarCheck className="text-emerald-500 group-hover:scale-110 transition-transform" />
          </div>
          <p className="text-base font-bold text-[#0F172A]">
            {todayAttendance?.check_out_time && todayAttendance.check_out_time !== "Not Checked Out" && todayAttendance.check_out_time !== "--:--"
              ? "Completed"
              : todayAttendance?.attendance_status === "On Time" || todayAttendance?.status === "On Time"
              ? "On Time 🟢"
              : todayAttendance?.attendance_status === "Late Warning" || todayAttendance?.status === "Late Warning"
              ? "Late Warning 🟠"
              : todayAttendance?.attendance_status === "Salary Deduction" || todayAttendance?.status === "Salary Deduction"
              ? "Salary Deduction 🔴"
              : todayAttendance?.check_in_time
              ? "Checked In 🔵"
              : "Not Marked"}
          </p>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
            <span className="text-[#64748B]">
              {todayAttendance?.check_out_time && todayAttendance.check_out_time !== "Not Checked Out" && todayAttendance.check_out_time !== "--:--"
                ? `Out: ${todayAttendance.check_out_time}`
                : todayAttendance?.check_in_time
                ? `In: ${todayAttendance.check_in_time}`
                : "Action required"}
            </span>
            <span className="text-[10px] font-bold text-emerald-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              Attendance Desk ↗
            </span>
          </div>
        </Link>

        <Link
          href="/dashboard/tasks"
          className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-2 hover:border-amber-400 hover:shadow-md transition-all cursor-pointer group block"
        >
          <div className="flex justify-between items-center text-xs text-[#64748B]">
            <span className="font-semibold text-slate-700">My Pending Tasks</span>
            <FaTasks className="text-amber-500 group-hover:scale-110 transition-transform" />
          </div>
          <p className="text-2xl font-black text-[#0F172A]">{pendingTasksCount}</p>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
            <span className="text-[#64748B]">In progress / pending</span>
            <span className="text-[10px] font-bold text-amber-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              Tasks ↗
            </span>
          </div>
        </Link>

        <Link
          href="/dashboard/tasks"
          className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-2 hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group block"
        >
          <div className="flex justify-between items-center text-xs text-[#64748B]">
            <span className="font-semibold text-slate-700">Completed Tasks</span>
            <FaCheckCircle className="text-emerald-500 group-hover:scale-110 transition-transform" />
          </div>
          <p className="text-2xl font-black text-[#0F172A]">{completedTasksCount}</p>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
            <span className="text-[#64748B]">Finished work items</span>
            <span className="text-[10px] font-bold text-emerald-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              Records ↗
            </span>
          </div>
        </Link>

        <Link
          href="/dashboard/leaves"
          className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-2 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group block"
        >
          <div className="flex justify-between items-center text-xs text-[#64748B]">
            <span className="font-semibold text-slate-700">Pending Leaves</span>
            <FaClock className="text-blue-500 group-hover:scale-110 transition-transform" />
          </div>
          <p className="text-2xl font-black text-[#0F172A]">{pendingLeavesCount}</p>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
            <span className="text-[#64748B]">Awaiting Admin review</span>
            <span className="text-[10px] font-bold text-blue-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              Leave Desk ↗
            </span>
          </div>
        </Link>
      </div>
      {/* ATTENDANCE POLICY TIMELINE BANNER (VISIBLE ONLY ON EMPLOYEE DASHBOARD) */}
      {!isAdminUser && (
        <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] bg-[#EFF6FF] px-2.5 py-0.5 rounded-full border border-blue-200">
                Official Company Policy
              </span>
              <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2 mt-1">
                <FaClock className="text-[#2563EB]" />
                <span>Attendance Policy Timeline</span>
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <span>Standard Shift:</span>
              <strong className="text-slate-800 font-mono">10:00 AM – 6:00 PM</strong>
            </div>
          </div>

          {/* 3 POLICY TIMELINE BRACKETS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* 1. 10:00 AM – 10:14 AM — On Time 🟢 */}
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-2 hover:border-emerald-400 transition-all shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs"></span>
                  On Time 🟢
                </span>
                <span className="text-[10px] font-mono font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                  10:00 AM – 10:14 AM
                </span>
              </div>
              <p className="text-[11px] text-emerald-700 font-medium leading-relaxed">
                Full on-time attendance marked. Normal working day with 100% salary credit.
              </p>
            </div>

            {/* 2. 10:15 AM – 10:29 AM — Late Warning 🟠 */}
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 space-y-2 hover:border-amber-400 transition-all shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-xs"></span>
                  Late Warning 🟠
                </span>
                <span className="text-[10px] font-mono font-bold text-amber-700 bg-white px-2 py-0.5 rounded-md border border-amber-200">
                  10:15 AM – 10:29 AM
                </span>
              </div>
              <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
                Late arrival warning recorded. Please ensure on-time clock-in before 10:15 AM.
              </p>
            </div>

            {/* 3. 10:30 AM and after — Salary Deduction 🔴 */}
            <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/50 space-y-2 hover:border-rose-400 transition-all shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-xs"></span>
                  Salary Deduction 🔴
                </span>
                <span className="text-[10px] font-mono font-bold text-rose-700 bg-white px-2 py-0.5 rounded-md border border-rose-200">
                  10:30 AM and after
                </span>
              </div>
              <p className="text-[11px] text-rose-700 font-medium leading-relaxed">
                1-day salary deduction applies according to company policy for late check-in.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 1: TOP 2-COLUMN BALANCED ROW (Attendance Control on Left, Announcements & Leave Desk on Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN (7 COLS): Attendance Clocking / Admin Supervisory View */}
        <div className="lg:col-span-7">
          {isAdminUser ? (
            <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-4 h-full flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] bg-[#EFF6FF] px-2.5 py-0.5 rounded-full border border-[#2563EB]/20">
                      Admin Supervisory View
                    </span>
                    <h2 className="text-sm font-bold text-[#0F172A] mt-1 flex items-center gap-2">
                      <FaUserCheck className="text-[#2563EB]" />
                      <span>Employees Today&apos;s Attendance Status</span>
                    </h2>
                  </div>
                  <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                    {orgEmployeesAttendance.filter((e) => e.status !== "Absent").length} / {orgEmployeesAttendance.length} Present
                  </span>
                </div>

                <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto mt-2 pr-1">
                  {orgEmployeesAttendance.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-6 text-center">No employee records configured.</p>
                  ) : (
                    orgEmployeesAttendance.map((emp) => (
                      <div key={emp.id} className="py-2.5 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-bold text-[#0F172A]">{emp.name}</p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            {emp.role} • In: {emp.in} | Out: {emp.out}
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${
                          emp.status === "Present"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : emp.status === "Late"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                        }`}>
                          {emp.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>🛡️ Employees clock in from their personal devices.</span>
                <Link href="/dashboard/attendance" className="text-blue-600 font-bold hover:underline">
                  Full Master Hub →
                </Link>
              </div>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-4 h-full flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                  <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                    <FaCalendarCheck className="text-[#2563EB]" />
                    <span>Today&apos;s Attendance Control</span>
                  </h2>
                  <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border ${
                    todayAttendance?.attendance_status === "On Time" || todayAttendance?.status === "On Time"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : todayAttendance?.attendance_status === "Late Warning" || todayAttendance?.status === "Late Warning"
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : todayAttendance?.attendance_status === "Salary Deduction" || todayAttendance?.status === "Salary Deduction"
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : todayAttendance?.check_in_time
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-slate-100 text-slate-600 border-slate-200"
                  }`}>
                    {todayAttendance?.attendance_status === "On Time" || todayAttendance?.status === "On Time"
                      ? "On Time 🟢"
                      : todayAttendance?.attendance_status === "Late Warning" || todayAttendance?.status === "Late Warning"
                      ? "Late Warning 🟠"
                      : todayAttendance?.attendance_status === "Salary Deduction" || todayAttendance?.status === "Salary Deduction"
                      ? "Salary Deduction 🔴"
                      : todayAttendance?.check_in_time
                      ? "Checked In 🔵"
                      : "Not Checked In ⚪"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                  <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
                    <span className="text-[10px] font-semibold text-[#64748B] uppercase">Check-In Time</span>
                    <p className="text-base font-mono font-bold text-[#0F172A]">
                      {todayAttendance?.check_in_time || "--:--"}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
                    <span className="text-[10px] font-semibold text-[#64748B] uppercase">Check-Out Time</span>
                    <p className="text-base font-mono font-bold text-[#0F172A]">
                      {todayAttendance?.check_out_time && todayAttendance.check_out_time !== "Not Checked Out" && todayAttendance.check_out_time !== "--:--"
                        ? todayAttendance.check_out_time
                        : todayAttendance?.check_in_time
                        ? "Not Checked Out"
                        : "--:--"}
                    </p>
                  </div>
                </div>

                {/* Real-Time Check-In Status Feedback Bar */}
                {todayAttendance?.check_in_time && (
                  <div className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs mt-3 ${
                    todayAttendance.attendance_status === "On Time" || todayAttendance.status === "On Time"
                      ? "bg-emerald-50/80 border-emerald-200 text-emerald-800"
                      : todayAttendance.attendance_status === "Late Warning" || todayAttendance.status === "Late Warning"
                      ? "bg-amber-50/80 border-amber-200 text-amber-800"
                      : "bg-rose-50/80 border-rose-200 text-rose-800"
                  }`}>
                    <span className="font-bold flex items-center gap-1.5">
                      <span>{todayAttendance.attendance_status === "On Time" || todayAttendance.status === "On Time" ? "🟢" : todayAttendance.attendance_status === "Late Warning" || todayAttendance.status === "Late Warning" ? "🟠" : "🔴"}</span>
                      <span>Evaluated Status: <strong>{todayAttendance.attendance_status || todayAttendance.status || "On Time"}</strong></span>
                    </span>
                    <span className="text-[11px] font-medium opacity-90">
                      {todayAttendance.attendance_status === "On Time" || todayAttendance.status === "On Time"
                        ? "Checked in 10:00 AM – 10:14 AM (On Time)"
                        : todayAttendance.attendance_status === "Late Warning" || todayAttendance.status === "Late Warning"
                        ? "Checked in 10:15 AM – 10:29 AM (Late Warning)"
                        : "Checked in 10:30 AM or later (Salary Deduction Applied)"}
                    </span>
                  </div>
                )}

                {/* Yesterday's Attendance Record Summary Card */}
                {yesterdayAttendance && (
                  <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-2 mt-3 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <span className="font-bold text-slate-700 flex items-center gap-1.5 text-[11px]">
                        <FaCalendarCheck className="text-blue-600" />
                        <span>Yesterday&apos;s Attendance ({yesterdayAttendance.attendance_date || yesterdayAttendance.date || "Yesterday"})</span>
                      </span>
                      <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                        (yesterdayAttendance.attendance_status || yesterdayAttendance.status || "").toLowerCase().includes("deduction") || (yesterdayAttendance.attendance_status || yesterdayAttendance.status || "").toLowerCase().includes("late")
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200"
                      }`}>
                        {yesterdayAttendance.attendance_status || yesterdayAttendance.status || "Present"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3.5 pt-1">
                      <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                        <span className="text-[9px] font-bold text-slate-500 uppercase block">Check-In Time</span>
                        <span className="font-mono font-extrabold text-slate-900 text-xs">
                          {yesterdayAttendance.check_in_time || yesterdayAttendance.check_in || "--:--"}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                        <span className="text-[9px] font-bold text-slate-500 uppercase block">Check-Out Time</span>
                        <span className="font-mono font-extrabold text-slate-900 text-xs">
                          {yesterdayAttendance.check_out_time || yesterdayAttendance.check_out || "Not Checked Out"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Check-In / Check-Out Buttons for Employee */}
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCheckIn}
                  disabled={markingAttendance || Boolean(todayAttendance?.check_in_time)}
                  className={`py-3 rounded-xl font-bold text-xs shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                    todayAttendance?.check_in_time
                      ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                      : "bg-[#2563EB] hover:bg-[#1D4ED8] text-white"
                  }`}
                >
                  <FaUserCheck />
                  <span>{todayAttendance?.check_in_time ? "Checked In 🟢" : "Check In"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCheckOut}
                  disabled={
                    markingAttendance ||
                    !todayAttendance?.check_in_time ||
                    Boolean(todayAttendance?.check_out_time && todayAttendance.check_out_time !== "Not Checked Out" && todayAttendance.check_out_time !== "--:--")
                  }
                  className={`py-3 rounded-xl font-bold text-xs shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                    !todayAttendance?.check_in_time ||
                    (todayAttendance?.check_out_time && todayAttendance.check_out_time !== "Not Checked Out" && todayAttendance.check_out_time !== "--:--"
                      ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                      : "bg-rose-600 hover:bg-rose-700 text-white")
                  }`}
                >
                  <FaUserTimes />
                  <span>
                    {todayAttendance?.check_out_time && todayAttendance.check_out_time !== "Not Checked Out" && todayAttendance.check_out_time !== "--:--"
                      ? "Checked Out 🔴"
                      : "Check Out"}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN (5 COLS): Meetings & Announcements & Leave Management */}
        <div className="lg:col-span-5 space-y-6">
          {/* SCHEDULED MEETINGS & VIDEO SYNC (High-Priority Real-Time Alert) */}
          <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                <FaVideo className="text-[#2563EB]" />
                <span>Scheduled Meetings & Video Sync</span>
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded-full border border-[#2563EB]/20">
                  {myMeetings.length} Scheduled
                </span>
                <Link href="/dashboard/meetings" className="text-xs font-bold text-[#2563EB] hover:underline hidden sm:inline-block">
                  Meetings Hub →
                </Link>
              </div>
            </div>

            {myMeetings.length === 0 ? (
              <div className="p-4 text-center bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[#64748B] text-xs italic space-y-1">
                <p>No upcoming meetings scheduled for you.</p>
                <p className="text-[10px] text-slate-400">When Admin schedules a session, it appears here with a direct join link.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {myMeetings.map((m) => (
                  <div key={m.id} className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/50 space-y-2 relative overflow-hidden">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-[#0F172A]">{m.title}</h4>
                        <p className="text-[10px] text-blue-700 font-semibold mt-0.5 flex items-center gap-1">
                          <FaClock className="text-[9px]" /> {m.date} • {m.time}
                        </p>
                      </div>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white text-blue-800 border border-blue-200 shrink-0">
                        {m.platform || "Google Meet"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-[#64748B] pt-1 border-t border-blue-100/80">
                      <span>Host: <strong className="text-slate-900">{m.host}</strong></span>
                      <span className="text-blue-600 font-medium">{m.target_audience_label || "Invited"}</span>
                    </div>

                    <a
                      href={m.meetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2 px-3 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-[11px] transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer block text-center"
                    >
                      <FaVideo className="text-[10px]" />
                      <span>Join Video Meeting Now 🚀</span>
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* OFFICIAL ANNOUNCEMENTS */}
          <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                <FaBullhorn className="text-[#2563EB]" />
                <span>Company Announcements</span>
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded-full border border-[#2563EB]/20">
                  Notice Board
                </span>
                <Link href="/dashboard" className="text-xs font-bold text-[#2563EB] hover:underline hidden sm:inline-block">
                  Dashboard →
                </Link>
              </div>
            </div>

            {announcements.length === 0 ? (
              <div className="p-4 text-center bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[#64748B] text-xs italic">
                No active announcements at the moment.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                {announcements.map((a) => (
                  <div key={a.id} className="p-3 rounded-xl border border-blue-100 bg-blue-50/40 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-[#0F172A]">{a.title}</h4>
                      <span className="text-[9px] font-semibold text-[#64748B]">{a.date || a.created_at || "Recent"}</span>
                    </div>
                    <p className="text-[11px] text-[#64748B] leading-relaxed whitespace-pre-line">{a.message || a.content}</p>
                    {a.meet_url && (
                      <a
                        href={a.meet_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline pt-1"
                      >
                        <FaLink className="text-[9px]" /> Join Scheduled Meeting Link →
                      </a>
                    )}
                    <p className="text-[9px] text-[#2563EB] font-bold pt-0.5">Posted by: {a.posted_by || "Management"}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* LEAVE MANAGEMENT SECTION */}
          {isAdminUser ? (
            <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] border-l-4 border-l-[#2563EB] shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] bg-[#EFF6FF] px-2.5 py-0.5 rounded-full border border-[#2563EB]/20">
                    Admin Supervisory Control
                  </span>
                  <h2 className="text-xs font-bold text-[#0F172A] mt-1 flex items-center gap-1.5">
                    <FaPaperPlane className="text-[#2563EB]" />
                    <span>Organization Leave Desk</span>
                  </h2>
                </div>
                <Link
                  href="/dashboard/leaves"
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
                >
                  <span>Approvals Desk</span>
                  <FaArrowLeft className="rotate-180 text-[9px]" />
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div className="p-2.5 rounded-xl bg-blue-50/60 border border-blue-100">
                  <span className="text-[9px] font-bold text-blue-700 uppercase">Pending</span>
                  <p className="text-lg font-black text-blue-800">{myLeaves.filter(l => (l.status || "").toLowerCase() === "pending").length}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100">
                  <span className="text-[9px] font-bold text-emerald-700 uppercase">Approved</span>
                  <p className="text-lg font-black text-emerald-800">{myLeaves.filter(l => (l.status || "").toLowerCase() === "approved").length}</p>
                </div>
              </div>

              <Link
                href="/dashboard/leaves"
                className="w-full py-2 px-3 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <FaPaperPlane className="text-xs" />
                <span>Review & Decide Leaves</span>
              </Link>
            </div>
          ) : (
            <>
              {/* APPLY FOR LEAVE FORM (EMPLOYEE ONLY) */}
              <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-4">
                <div className="border-b border-[#E2E8F0] pb-3">
                  <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                    <FaPaperPlane className="text-[#2563EB]" />
                    <span>Apply for Leave</span>
                  </h2>
                </div>

                <form onSubmit={handleLeaveSubmit} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] uppercase mb-1">Leave Type *</label>
                    <select
                      value={leaveForm.leave_type}
                      onChange={(e) => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}
                      className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] bg-white outline-none focus:border-[#2563EB]"
                    >
                      <option value="Casual Leave">Casual Leave</option>
                      <option value="Sick Leave">Sick Leave</option>
                      <option value="Emergency Leave">Emergency Leave</option>
                      <option value="Annual Leave">Annual Leave</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] uppercase mb-1">Start Date</label>
                      <input
                        type="date"
                        value={leaveForm.start_date}
                        onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                        className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] uppercase mb-1">End Date</label>
                      <input
                        type="date"
                        value={leaveForm.end_date}
                        onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                        className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] uppercase mb-1">Reason *</label>
                    <textarea
                      rows={2}
                      value={leaveForm.reason}
                      onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                      placeholder="State reason for leave request..."
                      required
                      className="w-full rounded-xl border border-[#E2E8F0] p-3 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submittingLeave}
                    className="w-full py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs transition-colors shadow-xs cursor-pointer"
                  >
                    {submittingLeave ? "Submitting..." : "Submit Leave Request"}
                  </button>
                </form>
              </div>

              {/* MY LEAVE HISTORY FEED (EMPLOYEE ONLY) */}
              <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-3">
                <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">My Leave Applications History</h3>
                {myLeaves.length === 0 ? (
                  <p className="text-xs text-[#64748B] italic">No leave applications submitted yet.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {myLeaves.map((l) => (
                      <div key={l.id} className="p-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between text-xs">
                        <div>
                          <p className="font-bold text-[#0F172A]">{l.leave_type}</p>
                          <p className="text-[10px] text-[#64748B]">{l.start_date} to {l.end_date}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${
                          l.status === "Approved"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : l.status === "Rejected"
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}>
                          {l.status || "Pending"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* SECTION 2: MIDDLE 2-COLUMN BALANCED ROW (Online MCQ Exam on Left, My Assigned Tasks on Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ONLINE MCQ EXAM CARD SECTION */}
        <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
            <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <FaLaptopCode className="text-[#2563EB]" />
              <span>Online MCQ Exam</span>
            </h2>
            <span className="text-xs font-bold text-[#2563EB] bg-[#EFF6FF] px-2.5 py-1 rounded-full border border-[#2563EB]/20">
              {assignedExams.length} Assigned
            </span>
          </div>

          {assignedExams.length === 0 ? (
            <div className="p-6 text-center bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[#64748B] text-xs italic space-y-1">
              <p className="font-bold text-[#0F172A]">Online MCQ Exam</p>
              <p>No exam has been assigned to you yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {assignedExams.map((exam) => {
                const attempt = examAttempts.find((a) => a.exam_id === exam.id);

                return (
                  <div key={exam.id} className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#0F172A]">{exam.title}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${
                        attempt
                          ? attempt.result === "PASSED"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-blue-50 text-blue-700 border-blue-200"
                      }`}>
                        {attempt ? `Completed (${attempt.result})` : "Assigned"}
                      </span>
                    </div>

                    <p className="text-xs text-[#64748B]">{exam.description || "Official evaluation test."}</p>

                    <div className="text-[11px] text-[#64748B] flex justify-between bg-white p-2.5 rounded-lg border border-[#E2E8F0]">
                      <span>Questions: <strong>{exam.questions?.length || 0}</strong></span>
                      <span>Time Limit: <strong>{exam.time_limit || 10} Mins</strong></span>
                      <span>Due: <strong>{exam.due_date || "Open"}</strong></span>
                    </div>

                    {attempt ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-emerald-50 text-emerald-800 font-bold border border-emerald-200">
                          <span>Score: {attempt.score} ({attempt.percentage}%)</span>
                          <span>{attempt.result}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveExam(exam);
                            setLatestAttemptResult(attempt);
                            setMcqModalOpen(true);
                          }}
                          className="w-full py-2.5 rounded-xl border border-[#2563EB] bg-[#EFF6FF] hover:bg-blue-100 text-[#2563EB] font-bold text-xs transition-colors cursor-pointer"
                        >
                          View Result
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStartMcqExam(exam)}
                        className="w-full py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs transition-colors shadow-xs cursor-pointer"
                      >
                        Start MCQ Exam Now
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* MY ASSIGNED TASKS */}
        <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
            <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <FaTasks className="text-[#2563EB]" />
              <span>My Assigned Tasks</span>
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#2563EB] bg-[#EFF6FF] px-2.5 py-1 rounded-full border border-[#2563EB]/20">
                {myTasks.length} Assigned
              </span>
              <Link href="/dashboard/tasks" className="text-xs font-bold text-[#2563EB] hover:underline hidden sm:inline-block">
                Task Manager →
              </Link>
            </div>
          </div>

          {myTasks.length > 0 && (() => {
            const completedCount = myTasks.filter(t => t.status === "Completed").length;
            const taskProgressSum = myTasks.reduce((acc, t) => {
              if (t.status === "Completed") return acc + 100;
              const curSecs = Number(t.timerSeconds || t.total_working_seconds || 0);
              if (t.status === "In Progress" || curSecs > 0) {
                const targetSeconds = (Number(t.target_days) || 1) * 3600;
                const timeProgress = Math.min(95, Math.max(5, Math.round((curSecs / targetSeconds) * 100)));
                return acc + timeProgress;
              }
              return acc;
            }, 0);
            const employeeTaskPct = Math.round(taskProgressSum / myTasks.length);

            return (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <FaChartLine className="text-blue-600" />
                    <span>Deliverables Completion Score</span>
                  </span>
                  <span className="font-black text-blue-600 font-mono text-sm">
                    {employeeTaskPct}%
                    <span className="text-[11px] text-slate-500 font-normal ml-1.5">
                      ({completedCount} of {myTasks.length} Done)
                    </span>
                  </span>
                </div>
                <div className="w-full bg-white rounded-full h-2.5 overflow-hidden border border-blue-200 p-0.5">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full transition-all duration-500 shadow-xs"
                    style={{ width: `${employeeTaskPct}%` }}
                  />
                </div>
              </div>
            );
          })()}

          {myTasks.length === 0 ? (
            <div className="p-8 text-center bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[#64748B] text-xs italic">
              No tasks assigned to you currently. Check back later or notify Admin.
            </div>
          ) : (
            <div className="space-y-3">
              {myTasks.map((t) => {
                const targetDays = t.target_days || 1;
                const dueDate = t.dueDate || t.due_date;
                const daysRemaining = dueDate
                  ? Math.ceil((new Date(dueDate).getTime() - new Date().setHours(0,0,0,0)) / 86400000)
                  : null;

                return (
                  <div key={t.id} className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-bold text-[#0F172A]">{t.task || t.task_title || "Assigned Work Item"}</h3>
                        <p className="text-[11px] text-[#64748B] mt-0.5">{t.description || "Complete assigned project deliverables as per guidelines."}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase border shrink-0 ${
                        t.status === "Completed"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : t.status === "In Progress"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}>
                        {t.status || "Pending"}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#64748B] pt-1 border-t border-[#E2E8F0]">
                      <div className="flex items-center gap-2 font-medium">
                        <span>Due: <strong className="text-[#0F172A]">{dueDate || "Today"}</strong></span>
                        {t.target_days && (
                          <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold border border-blue-200">
                            ⏱️ {targetDays} Day(s) Target
                          </span>
                        )}
                        {daysRemaining !== null && (
                          <span className={`font-semibold ${daysRemaining < 0 ? "text-rose-600" : daysRemaining === 0 ? "text-amber-600" : "text-slate-600"}`}>
                            {t.status === "Completed"
                              ? "✓ Completed"
                              : daysRemaining > 1
                              ? `⏳ ${daysRemaining} days remaining`
                              : daysRemaining === 1
                              ? "⏳ Due tomorrow"
                              : daysRemaining === 0
                              ? "⚠️ Due today"
                              : `🔴 Overdue by ${Math.abs(daysRemaining)} day(s)`}
                          </span>
                        )}
                      </div>
                      <span>Priority: <strong className="text-[#2563EB]">{t.priority || "Normal"}</strong></span>
                    </div>

                  {/* Task Actions */}
                  <div className="flex items-center gap-2 pt-2">
                    {t.status !== "In Progress" && t.status !== "Completed" && (
                      <button
                        type="button"
                        onClick={() => handleUpdateTaskStatus(t.id, "In Progress")}
                        className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <FaPlay className="text-[9px]" /> Start Task
                      </button>
                    )}

                    {t.status === "In Progress" && (
                      <button
                        type="button"
                        onClick={() => handleUpdateTaskStatus(t.id, "Pending")}
                        className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <FaPause className="text-[9px]" /> Pause
                      </button>
                    )}

                    {t.status !== "Completed" && (
                      <button
                        type="button"
                        onClick={() => handleUpdateTaskStatus(t.id, "Completed")}
                        className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <FaCheckCircle className="text-[9px]" /> Complete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      </div>

      {/* SECTION 3: BOTTOM FULL-WIDTH ATTENDANCE HISTORY TABLE */}
      <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
          <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
            <FaCalendarCheck className="text-[#2563EB]" />
            <span>My Attendance History</span>
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#2563EB] bg-[#EFF6FF] px-2.5 py-1 rounded-full border border-[#2563EB]/20">
              {myAttendanceHistory.length} Logs
            </span>
            {isAdminUser && (
              <Link href="/dashboard/attendance/history" className="text-xs font-bold text-[#2563EB] hover:underline hidden sm:inline-block">
                Full Attendance Hub →
              </Link>
            )}
          </div>
        </div>

        {myAttendanceHistory.length === 0 ? (
          <p className="text-xs text-[#64748B] italic text-center py-4">No attendance records found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[#64748B] uppercase text-[10px]">
                  <th className="py-2.5 px-3">Date (Day)</th>
                  <th className="py-2.5 px-3">Check-In</th>
                  <th className="py-2.5 px-3">Check-Out</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {myAttendanceHistory.map((rec) => {
                  const statusStr = (rec.attendance_status || rec.status || "").toLowerCase();
                  const isSun = statusStr.includes("sunday");
                  const isLev = statusStr.includes("leave");
                  const isAbs = statusStr.includes("absent");
                  const isSalDed = statusStr.includes("salary deduction");
                  const isLateWarn = statusStr.includes("late warning") || statusStr.includes("late");
                  const isOnTime = statusStr.includes("on time") || statusStr.includes("completed") || statusStr === "present";

                  let badgeColor = "bg-slate-100 text-slate-600 border-slate-200";
                  let badgeLabel = rec.attendance_status || rec.status || "Present";

                  if (isSun) {
                    badgeColor = "bg-purple-50 text-purple-700 border-purple-200";
                  } else if (isLev) {
                    badgeColor = "bg-blue-50 text-blue-700 border-blue-200";
                  } else if (isAbs) {
                    badgeColor = "bg-rose-50 text-rose-700 border-rose-200 font-bold";
                  } else if (isSalDed) {
                    badgeColor = "bg-rose-50 text-rose-700 border-rose-200 font-bold";
                    badgeLabel = "Salary Deduction 🔴";
                  } else if (isLateWarn) {
                    badgeColor = "bg-amber-50 text-amber-700 border-amber-200 font-bold";
                    badgeLabel = "Late Warning 🟠";
                  } else if (isOnTime) {
                    badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold";
                    badgeLabel = "On Time 🟢";
                  }

                  return (
                    <tr key={rec.id || rec.attendance_date || rec.date} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-[#0F172A]">
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
                        {rec.check_out_time && rec.check_out_time !== "Not Checked Out" && rec.check_out_time !== "--:--"
                          ? rec.check_out_time
                          : (rec.check_in_time && rec.check_in_time !== "--:--" ? "Not Checked Out" : "--:--")}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] border uppercase inline-flex items-center gap-1 ${badgeColor}`}>
                          {badgeLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MCQ EXAM RUNNER MODAL */}
      {mcqModalOpen && activeExam && (
        <Modal
          isOpen={mcqModalOpen}
          onClose={() => setMcqModalOpen(false)}
          title={activeExam.title}
        >
          <div className="space-y-6 text-xs text-slate-700">
            {latestAttemptResult === null ? (
              <div className="space-y-5">
                <div className="p-3.5 rounded-xl bg-blue-900 text-white flex justify-between items-center shadow-xs">
                  <div>
                    <span className="text-[10px] text-blue-200 uppercase font-bold block">Passing Criteria</span>
                    <span className="font-bold text-xs">{activeExam.passing_score || 50}% Minimum Score</span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-blue-200 uppercase font-bold block">Time Remaining</span>
                    <span className="font-mono text-base font-black text-amber-300">
                      {Math.floor(examTimerSeconds / 60).toString().padStart(2, "0")}:
                      {(examTimerSeconds % 60).toString().padStart(2, "0")}
                    </span>
                  </div>
                </div>

                {(activeExam.questions || []).map((q, qIdx) => (
                  <div key={q.id || qIdx} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <p className="font-bold text-slate-900 text-xs">
                      Question {qIdx + 1} of {(activeExam.questions || []).length}: {q.question}
                    </p>
                    <div className="space-y-2 pt-1">
                      {[
                        { key: "option_a", text: q.option_a || q.options?.[0] },
                        { key: "option_b", text: q.option_b || q.options?.[1] },
                        { key: "option_c", text: q.option_c || q.options?.[2] },
                        { key: "option_d", text: q.option_d || q.options?.[3] },
                      ].map((opt) => (
                        <label
                          key={opt.key}
                          className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                            userAnswers[q.id] === opt.key
                              ? "bg-blue-100 border-blue-500 text-blue-900 font-bold"
                              : "bg-white border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            checked={userAnswers[q.id] === opt.key}
                            onChange={() => setUserAnswers((prev) => ({ ...prev, [q.id]: opt.key }))}
                            className="text-blue-600"
                          />
                          <span>{opt.text}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setMcqModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitMcqExam}
                    className="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-xs cursor-pointer"
                  >
                    Submit Exam Answers
                  </button>
                </div>
              </div>
            ) : (
              /* Score & Result Display */
              <div className="text-center py-6 space-y-4">
                <div className={`mx-auto h-20 w-20 rounded-full flex items-center justify-center text-white text-2xl font-black shadow-md ${
                  latestAttemptResult.result === "PASSED" ? "bg-emerald-600" : "bg-rose-600"
                }`}>
                  {latestAttemptResult.percentage}%
                </div>

                <div className="space-y-1">
                  <h3 className="text-base font-bold text-slate-900">
                    {latestAttemptResult.result === "PASSED" ? "Congratulations! Exam Passed 🎉" : "Exam Completed (Needs Improvement)"}
                  </h3>
                  <p className="text-xs text-slate-500">Your score has been saved to your employee record.</p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 max-w-sm mx-auto text-xs space-y-2 text-left">
                  <div className="flex justify-between border-b border-slate-200 pb-1">
                    <span className="text-slate-500">Total Questions:</span>
                    <span className="font-bold text-slate-900">{latestAttemptResult.total_questions}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-1">
                    <span className="text-slate-500">Correct Answers:</span>
                    <span className="font-bold text-emerald-700">{latestAttemptResult.correct_answers}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-1">
                    <span className="text-slate-500">Wrong Answers:</span>
                    <span className="font-bold text-rose-600">{latestAttemptResult.wrong_answers}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-1">
                    <span className="text-slate-500">Score Ratio:</span>
                    <span className="font-bold text-slate-900">{latestAttemptResult.score}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Result:</span>
                    <span className={`font-black ${latestAttemptResult.result === "PASSED" ? "text-emerald-700" : "text-rose-600"}`}>
                      {latestAttemptResult.result}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setMcqModalOpen(false)}
                  className="px-6 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs shadow-xs"
                >
                  Close Result Summary
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* AVATAR PHOTO UPLOAD MODAL */}
      {avatarModalOpen && (
        <Modal
          isOpen={avatarModalOpen}
          onClose={() => setAvatarModalOpen(false)}
          title="Upload Profile Picture 📷"
        >
          <div className="space-y-4 text-xs p-1">
            <div className="flex items-center gap-4 bg-[#F8FAFC] p-4 rounded-2xl border border-[#E2E8F0]">
              <div className="relative h-16 w-16 rounded-2xl overflow-hidden bg-[#EFF6FF] border border-[#2563EB]/30 shadow-xs flex items-center justify-center shrink-0">
                {userAvatarUrl ? (
                  <img src={userAvatarUrl} alt="Preview" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[#2563EB] text-lg font-bold">
                    {(employeeName || "E").slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <h4 className="font-bold text-[#0F172A] text-sm">{employeeName || "Employee"}</h4>
                <p className="text-[#64748B] text-[11px] font-mono">{employeeEmail}</p>
                <p className="text-[10px] text-[#2563EB] font-bold mt-0.5 uppercase">Role: Employee</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#0F172A] uppercase mb-1">
                  Choose Image File from Device
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarFileUpload}
                  className="w-full text-xs text-[#64748B] file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#EFF6FF] file:text-[#2563EB] hover:file:bg-[#2563EB] hover:file:text-white cursor-pointer"
                />
              </div>

              <div className="relative flex items-center my-2">
                <div className="flex-grow border-t border-[#E2E8F0]"></div>
                <span className="flex-shrink mx-3 text-[10px] text-[#64748B] font-bold uppercase">OR</span>
                <div className="flex-grow border-t border-[#E2E8F0]"></div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0F172A] uppercase mb-1">
                  Paste Custom Image URL
                </label>
                <input
                  type="text"
                  value={inputAvatarUrl}
                  onChange={(e) => setInputAvatarUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full rounded-xl border border-[#E2E8F0] px-3.5 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] bg-white font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setAvatarModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-[#E2E8F0] text-[#64748B] font-semibold hover:bg-[#F8FAFC] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveProfileAvatar(inputAvatarUrl)}
                className="px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold transition-all shadow-xs cursor-pointer"
              >
                Save Profile Photo
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import Modal from "@/components/Modal";
import { showToast } from "@/components/Toast";
import { generatePrintableStudentFeeReceiptPdf } from "@/lib/generateStudentReceiptPdf";
import { generatePrintable3MonthStudentCertificatePdf } from "@/lib/generate3MonthStudentCertificatePdf";
import { generatePrintableInternshipExperienceCertificatePdf } from "@/lib/generateInternshipExperienceCertificatePdf";
import { dbFetch, dbSaveRecord } from "@/lib/dbPersistence";
import { calculate30DayFeeCycles } from "@/lib/studentEnrollmentUtils";
import { isRecordFromToday, getTodayDateString } from "@/lib/attendanceUtils";
import { startScreenBroadcast, stopScreenBroadcast, WebRTCViewerClient } from "@/lib/webrtcScreenService";
import {
  FaGraduationCap,
  FaCalendarAlt,
  FaChalkboardTeacher,
  FaTasks,
  FaClock,
  FaCheckCircle,
  FaExclamationTriangle,
  FaFileUpload,
  FaFileDownload,
  FaMoneyBillWave,
  FaShieldAlt,
  FaUserCheck,
  FaBuilding,
  FaBookReader,
  FaAward,
  FaQrcode,
  FaLaptopCode,
  FaCode,
  FaClipboardCheck,
  FaDesktop,
  FaBullhorn,
  FaPlay,
  FaPause,
  FaStop,
  FaCheckDouble,
  FaShareAlt,
  FaPrint,
  FaSearch,
  FaRegLightbulb,
  FaUserTimes,
  FaPaperPlane,
  FaVideo,
  FaLink,
  FaUser,
  FaIdCard,
  FaPhoneAlt,
  FaEnvelope,
  FaTimes,
  FaStar,
  FaEye,
  FaEdit
} from "react-icons/fa";

import {
  getDailyTasks,
  saveTaskRecord,
  getCertificates,
  saveCertificate,
} from "@/lib/studentTaskUtils";

import {
  getAssignedExamsForUser,
  getExamAttemptsForUser,
  submitExamAttempt
} from "@/lib/mcqExamUtils";

// Centralized Safe Date Validator
const formatSafeDueDate = (rawDate) => {
  if (
    !rawDate ||
    rawDate === "0000-00-00" ||
    rawDate === "2024-00-00" ||
    rawDate === "Invalid Date" ||
    rawDate.includes("-00")
  ) {
    return "Pending Verification";
  }
  try {
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return "Pending Verification";
    return rawDate;
  } catch (e) {
    return "Pending Verification";
  }
};

// Full Attendance Calendar Builder (Handles Sundays, Leaves, Presents, Shift Times & Absents)
const buildFullStudentAttendanceCalendar = ({ rawLogs, leaves, startDate, todayRecord }) => {
  const todayStr = getTodayDateString();
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();

  const sDate = new Date(startDate || "2026-08-01");
  const eDate = new Date();
  const minAllowedDate = new Date();
  minAllowedDate.setDate(minAllowedDate.getDate() - 30);
  const effectiveStartDate = sDate > minAllowedDate ? sDate : minAllowedDate;

  const calendar = [];
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  for (let d = new Date(eDate); d >= effectiveStartDate; d.setDate(d.getDate() - 1)) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const dayNum = String(d.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${dayNum}`;
    const dayOfWeek = d.getDay(); // 0 = Sunday
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

    if (dateStr === todayStr && todayRecord && todayRecord.check_in_time) {
      calendar.push({
        id: todayRecord.id || `att-${dateStr}`,
        attendance_date: dateStr,
        date: dateStr,
        day_name: dayName,
        check_in_time: todayRecord.check_in_time,
        check_out_time: todayRecord.check_out_time || "Not Checked Out",
        attendance_status: todayRecord.attendance_status || "Present (On Time)",
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
        attendance_status: matchedLog.attendance_status || "Present (On Time)",
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
      if (currentMins >= 1080) { // After 6:00 PM
        calendar.push({
          id: `today-absent-${dateStr}`,
          attendance_date: dateStr,
          date: dateStr,
          day_name: dayName,
          check_in_time: "--:--",
          check_out_time: "--:--",
          attendance_status: "Absent (Shift Ended 06:00 PM) 🔴",
          is_absent: true,
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
          attendance_status: currentMins < 600 ? "Shift Starts 10:00 AM ⏳" : "Not Checked In (Shift 10:00 AM - 06:00 PM) 🟠",
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
  }

  return calendar;
};

export default function StudentDedicatedDashboardPage() {
  const [role, setRole] = useState("student");
  const [myStudentMeetings, setMyStudentMeetings] = useState([]);
  const [myFeeNotices, setMyFeeNotices] = useState([]);
  const [profileDetailModalOpen, setProfileDetailModalOpen] = useState(false);
  const [allStudentsList, setAllStudentsList] = useState([]);
  const [selectedStudentEmail, setSelectedStudentEmail] = useState("");
  const [studentInfo, setStudentInfo] = useState({
    name: "Enrolled Student",
    email: "",
    phone: "0300-1234567",
    enrollmentNo: "ENR-2026-101",
    course: "Full Stack MERN Web Development",
    techDomain: "Full Stack Software Engineering",
    trackType: "Remote Student",
    batch: "Batch #14 (Morning Tech)",
    instructor: "Lead Industry Instructor",
    currentWeek: "Week #1 of 12 (Orientation & Setup)",
    startDate: "2026-06-01",
    endDate: "2026-09-01",
    progress: 45,
    attendance: 95,
    certificateType: "course", // or "internship"
  });

  // Remote Monitoring Workstation Live Session State
  const [remoteSessionActive, setRemoteSessionActive] = useState(false);
  const [remoteSessionSeconds, setRemoteSessionSeconds] = useState(0);
  const [remoteFocusApp, setRemoteFocusApp] = useState("VS Code (Development)");

  const [feeStatus, setFeeStatus] = useState({
    dueDate: "2026-08-08",
    totalFee: 25000,
    paidAmount: 25000,
    remainingBalance: 0,
    status: "Approved & Paid",
    receiptNo: "REC-99812",
  });

  // Daily Tasks State with Timer
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [activeTaskTimerId, setActiveTaskTimerId] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);

  // Dynamic Database MCQ Exams State
  const [assignedExams, setAssignedExams] = useState([]);
  const [examAttempts, setExamAttempts] = useState([]);
  const [activeExam, setActiveExam] = useState(null);
  const [examTimerSeconds, setExamTimerSeconds] = useState(0);
  const [latestAttemptResult, setLatestAttemptResult] = useState(null);
  const [mcqModalOpen, setMcqModalOpen] = useState(false);
  const [userAnswers, setUserAnswers] = useState({});
  const [examSubmittedScore, setExamSubmittedScore] = useState(null);

  // Certificate Modal & QR State
  const [certificateModalOpen, setCertificateModalOpen] = useState(false);
  const [feeReceiptModalOpen, setFeeReceiptModalOpen] = useState(false);

  const [feeCyclesList, setFeeCyclesList] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [studentAttendanceHistory, setStudentAttendanceHistory] = useState([]);
  const [markingAttendance, setMarkingAttendance] = useState(false);

  // Admin-Only Attendance Edit State
  const [editAttendanceModal, setEditAttendanceModal] = useState({
    isOpen: false,
    date: "",
    status: "Present (On Time)",
    checkInTime: "10:00 AM",
    checkOutTime: "06:00 PM",
  });
  const [savingAttendanceEdit, setSavingAttendanceEdit] = useState(false);

  // Leave Form & History State
  const [myStudentLeaves, setMyStudentLeaves] = useState([]);
  const [submittingStudentLeave, setSubmittingStudentLeave] = useState(false);
  const [studentLeaveForm, setStudentLeaveForm] = useState({
    leave_type: "Casual Leave",
    start_date: new Date().toISOString().split("T")[0],
    end_date: new Date().toISOString().split("T")[0],
    reason: "",
  });

  const [isAdminUser, setIsAdminUser] = useState(false);
  const [myPerformance, setMyPerformance] = useState(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState("");
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [inputAvatarUrl, setInputAvatarUrl] = useState("");

  // Announcements & Complaints / Query Desk State
  const [announcements, setAnnouncements] = useState([]);
  const [myComplaints, setMyComplaints] = useState([]);
  const [complaintModalOpen, setComplaintModalOpen] = useState(false);
  const [submittingComplaint, setSubmittingComplaint] = useState(false);
  const [complaintForm, setComplaintForm] = useState({
    title: "",
    category: "Technical / LMS",
    description: "",
    priority: "Normal"
  });

  // Remote Screen Access Live Stream State & Ref
  const screenVideoRef = useRef(null);
  const adminViewerVideoRef = useRef(null);
  const [screenMediaStream, setScreenMediaStream] = useState(null);
  const [screenAccessModalOpen, setScreenAccessModalOpen] = useState(false);
  const [remoteViewerStream, setRemoteViewerStream] = useState(null);
  const [remoteViewerFrameUrl, setRemoteViewerFrameUrl] = useState(null);
  const [remoteViewerState, setRemoteViewerState] = useState("idle");
  const [remoteViewerStatus, setRemoteViewerStatus] = useState("");
  const [incomingSupervisionModal, setIncomingSupervisionModal] = useState({
    isOpen: false,
    ping: null,
  });
  const studentViewerClientRef = useRef(null);

  const handleAcceptSupervisionRequest = async () => {
    setIncomingSupervisionModal({ isOpen: false, ping: null });
    await handleStartScreenShare();
  };

  const handleCaptureAndSendSnapshot = async () => {
    try {
      const sEmail = (studentInfo?.email || localStorage.getItem("current_user_email") || "").toLowerCase().trim();
      const sName = studentInfo?.name || localStorage.getItem("current_user_name") || "Student";

      let stream = screenMediaStream;
      let ownStreamCreated = false;

      if (!stream) {
        if (typeof window === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
          showToast("Notice ℹ️", "Screen capture API not supported.", "info");
          return;
        }
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: "always", displaySurface: "monitor" },
          audio: false,
        });
        ownStreamCreated = true;
      }

      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(16, canvas.height - 48, 560, 36);
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(
        `NEXA AUDIT SNAPSHOT • ${sName} • ${new Date().toLocaleTimeString()}`,
        26,
        canvas.height - 25
      );

      const snapUrl = canvas.toDataURL("image/webp", 0.9);

      const snapRecord = {
        id: `snap-${Date.now()}`,
        employeeId: studentInfo?.id || sEmail,
        employeeName: sName,
        email: sEmail,
        department: studentInfo?.course || "Engineering Track",
        timestamp: new Date().toISOString(),
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        imageUrl: snapUrl,
        screenshot_url: snapUrl,
        focusApp: "Active Workstation Display",
        activityScore: 95,
      };

      await dbSaveRecord("screenshot_logs", snapRecord);

      const alertChannel = supabase.channel("nexa-global-alerts");
      alertChannel.send({
        type: "broadcast",
        event: "snapshot-captured",
        payload: snapRecord,
      });

      if (ownStreamCreated) {
        setScreenMediaStream(stream);
        setRemoteSessionActive(true);
        if (screenVideoRef.current) screenVideoRef.current.srcObject = stream;
      }

      setIncomingSupervisionModal({ isOpen: false, ping: null });
      showToast("Snapshot Sent 📸", "Workstation audit snapshot dispatched to Admin!", "success");
    } catch (err) {
      console.warn("Snapshot capture error:", err);
      showToast("Notice ℹ️", "Screen capture permission was not granted.", "info");
    }
  };

  const handleStartScreenShare = async () => {
    try {
      const sEmail = (studentInfo?.email || localStorage.getItem("current_user_email") || "").toLowerCase().trim();
      const sName = studentInfo?.name || localStorage.getItem("current_user_name") || "Student";
      const sCourse = studentInfo?.course || "Engineering Track";

      const res = await startScreenBroadcast({
        userId: sEmail || `stud-${Date.now()}`,
        userName: sName,
        userEmail: sEmail,
        department: sCourse,
        role: isIntern ? "Remote Intern" : "Remote Student",
        onStreamEnded: () => {
          setScreenMediaStream(null);
          setRemoteSessionActive(false);
          showToast("Screen Sharing Stopped ⚪", "Live screen session ended.", "info");
        },
      });

      setScreenMediaStream(res.stream);
      setRemoteSessionActive(true);

      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = res.stream;
      }

      showToast("Live Screen Broadcast Started 🖥️", "Your entire screen is now streaming live for Admin supervision.", "success");
    } catch (err) {
      console.warn("Screen share error:", err);
      showToast("Notice ℹ️", "Screen capture permission was not granted or was cancelled.", "info");
    }
  };

  const handleStopScreenShare = async () => {
    await stopScreenBroadcast();
    setScreenMediaStream(null);
    setRemoteSessionActive(false);
    showToast("Work Session Ended ⚪", "Screen sharing & session ended.", "info");
  };

  const handleOpenAdminScreenViewer = () => {
    setScreenAccessModalOpen(true);
    if (!isAdminUser) return;

    if (studentViewerClientRef.current) {
      studentViewerClientRef.current.disconnect();
      studentViewerClientRef.current = null;
    }

    const targetKey = (studentInfo?.email || localStorage.getItem("current_user_email") || studentInfo?.name || "").toLowerCase().trim();
    if (!targetKey) {
      setRemoteViewerStatus("Student email not found for live stream.");
      return;
    }

    setRemoteViewerStream(null);
    setRemoteViewerFrameUrl(null);
    setRemoteViewerState("connecting");
    setRemoteViewerStatus("Establishing direct WebRTC connection to student screen...");

    const client = new WebRTCViewerClient({
      userKey: targetKey,
      onRemoteStream: (stream) => {
        setRemoteViewerStream(stream);
        setRemoteViewerState("connected");
        setRemoteViewerStatus("WebRTC Live Stream Connected 🟢");
      },
      onRemoteFrame: (frameUrl) => {
        setRemoteViewerFrameUrl(frameUrl);
        setRemoteViewerState("connected");
        setRemoteViewerStatus("Live Screen Telemetry Active 🟢");
      },
      onConnectionStateChange: (state) => {
        setRemoteViewerState(state);
      },
      onStatusMessage: (msg) => {
        setRemoteViewerStatus(msg);
      },
    });

    studentViewerClientRef.current = client;
    client.connect();
  };

  const handleCloseAdminScreenViewer = () => {
    if (studentViewerClientRef.current) {
      studentViewerClientRef.current.disconnect();
      studentViewerClientRef.current = null;
    }
    setRemoteViewerStream(null);
    setRemoteViewerState("idle");
    setRemoteViewerStatus("");
    setScreenAccessModalOpen(false);
  };

  const handleSaveProfileAvatar = (newPicUrl) => {
    if (!newPicUrl) return;
    const sEmail = (studentInfo?.email || localStorage.getItem("current_user_email") || "").toLowerCase().trim();
    if (sEmail) {
      localStorage.setItem(`user_avatar_${sEmail}`, newPicUrl);
      setUserAvatarUrl(newPicUrl);
    }
    localStorage.removeItem("current_user_avatar");
    localStorage.removeItem("user_profile_avatar");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("avatarChanged"));
    }
    setAvatarModalOpen(false);
    showToast("Profile Photo Updated 🖼️", "Student profile picture updated successfully.", "success");
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
    const savedRole = localStorage.getItem("user_role") || "student";
    const savedEmail = (localStorage.getItem("current_user_email") || "").trim().toLowerCase();
    const savedName = localStorage.getItem("current_user_name") || "";

    const isAdmin = savedRole === "admin" || savedEmail.includes("admin") || savedEmail.includes("owner");
    setIsAdminUser(isAdmin);
    setRole(savedRole);

    // Web Audio Synthesizer Chime for Instant Notice
    const playAlertChime = () => {
      try {
        if (typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext)) {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
          osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
          gain.gain.setValueAtTime(0.3, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.4);
        }
      } catch (e) {}
    };

    const isTargetForMe = (ping) => {
      if (!ping) return false;
      const targetEm = (ping.target_email || "").toLowerCase().trim();
      const targetNm = (ping.target_name || "").toLowerCase().trim();
      const myEm = (savedEmail || "").toLowerCase().trim();
      const myNm = (savedName || "").toLowerCase().trim();

      if (!targetEm && !targetNm) return true;
      if (targetEm && myEm && (targetEm === myEm || myEm.includes(targetEm) || targetEm.includes(myEm))) return true;
      if (targetNm && (myNm.includes(targetNm) || targetNm.includes(myNm) || myEm.includes(targetNm.replace(/\s+/g, "")))) return true;
      // If student is the active single student logged in and not admin, accept
      if (!isAdmin) return true;
      return false;
    };

    const checkAdminPings = () => {
      try {
        const pings = JSON.parse(localStorage.getItem("nexa_active_pings") || "[]");
        if (pings.length > 0) {
          const latestPing = pings[0];
          if (isTargetForMe(latestPing)) {
            playAlertChime();
            showToast("⚡ Admin Supervision Alert", latestPing.message, "warning");
            setIncomingSupervisionModal({ isOpen: true, ping: latestPing });
          }
        }
      } catch (e) {}
    };

    window.addEventListener("nexa_ping_received", checkAdminPings);

    // Realtime Supabase cross-device ping receiver
    const pingChannel = supabase.channel("nexa-global-alerts");
    pingChannel
      .on("broadcast", { event: "ping" }, (payload) => {
        const pingData = payload?.payload || payload;
        if (isTargetForMe(pingData)) {
          playAlertChime();
          showToast("🔔 Admin Supervision Alert", pingData.message || "Admin is reviewing your workstation.", "warning");
          setIncomingSupervisionModal({ isOpen: true, ping: pingData });
        }
      })
      .on("broadcast", { event: "snapshot-request" }, (payload) => {
        const pingData = payload?.payload || payload;
        if (isTargetForMe(pingData)) {
          playAlertChime();
          showToast("📸 Screen Audit Request", pingData.message || "Admin requested an audit screenshot of your screen.", "warning");
          setIncomingSupervisionModal({ isOpen: true, ping: { ...pingData, type: "snapshot-request" } });
        }
      })
      .subscribe();

    // Background polling fallback for DB alerts
    let lastSeenPingId = null;
    const alertPollInterval = setInterval(async () => {
      try {
        const dbPings = await dbFetch("admin_pings").catch(() => []);
        if (Array.isArray(dbPings) && dbPings.length > 0) {
          const latest = dbPings[dbPings.length - 1];
          if (latest && latest.id !== lastSeenPingId && isTargetForMe(latest)) {
            const pingAge = Date.now() - new Date(latest.timestamp || Date.now()).getTime();
            if (pingAge < 60000) { // Only show pings younger than 1 minute
              lastSeenPingId = latest.id;
              playAlertChime();
              setIncomingSupervisionModal({ isOpen: true, ping: latest });
            }
          }
        }
      } catch (e) {}
    }, 4000);

    async function fetchStudentData() {
      const allStudents = await dbFetch("students").catch(() => []);
      const allInterns = await dbFetch("interns").catch(() => []);
      const combined = [...(allStudents || []), ...(allInterns || [])];
      setAllStudentsList(combined);

      const activeTargetEmail = selectedStudentEmail 
        ? selectedStudentEmail.trim().toLowerCase()
        : savedEmail;

      let matched = combined.find(
        (s) => (s.email || "").trim().toLowerCase() === activeTargetEmail
      );

      let isInternRole = false;

      // Fallback for Admin inspection or unmatched user: pick the first student in database
      if (!matched && combined.length > 0) {
        matched = combined[0];
      }

      if (matched) {
        if (matched.intern_id || (matched.internship_mode && matched.internship_mode !== "")) {
          isInternRole = true;
        }

        const courseTitle = matched.course_name || matched.course || matched.tech_domain || "Full Stack MERN Web Development";
        const isRemote = matched.is_remote || (matched.internship_mode || "").includes("Remote") || (matched.course_name || "").includes("Remote") || (matched.batch || "").includes("Remote");
        const trackType = isInternRole 
          ? (isRemote ? "Remote Internship" : "On-Site Internship")
          : (isRemote ? "Remote Student" : "On-Site Student");
        const certType = isInternRole ? "internship" : "course";
        const startDate = matched.start_date || matched.enrollment_date || "2026-06-01";
        const endDate = matched.end_date || matched.completion_date || "2026-09-01";

        // Calculate dynamic learning week based on start date
        const sDate = new Date(startDate);
        const diffTime = Math.max(0, new Date().getTime() - sDate.getTime());
        const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));
        const weekNum = Math.min(12, Math.max(1, Math.floor(diffDays / 7) + 1));
        const progressPct = matched.progress !== undefined ? Number(matched.progress) : Math.min(100, Math.round((diffDays / 90) * 100));

        // Dynamic Instructor Assignment
        let assignedInstructor = matched.instructor || "";
        if (!assignedInstructor) {
          if (courseTitle.includes("Python") || courseTitle.includes("AI")) {
            assignedInstructor = "Dr. Bilal Ahmed (AI Specialist)";
          } else if (courseTitle.includes("UI/UX") || courseTitle.includes("Design")) {
            assignedInstructor = "Ayesha Malik (Senior UI/UX Designer)";
          } else if (courseTitle.includes("Flutter") || courseTitle.includes("Mobile")) {
            assignedInstructor = "Usman Raza (Mobile Apps Lead)";
          } else if (courseTitle.includes("Cybersecurity") || courseTitle.includes("Security")) {
            assignedInstructor = "Zain Ali (Security Consultant)";
          } else {
            assignedInstructor = "Engr. Hamza (Lead Full-Stack)";
          }
        }

        // Dynamic Learning Week Topic Mapping
        const weekTopics = [
          "Orientation & Development Setup",
          "HTML5, CSS3 & Responsive Design",
          "JavaScript ES6+ & Async Operations",
          "React Components & State Architecture",
          "Next.js App Router & Tailwind CSS",
          "Node.js Express REST APIs & Backend Security",
          "Supabase Auth & Database Architecture",
          "State Management & Custom Hooks",
          "Full-Stack Integration & API Client",
          "Testing, Debugging & Code Reviews",
          "CI/CD Pipelines & Cloud Deployment",
          "Final Capstone Presentation & Graduation",
        ];
        const topic = weekTopics[weekNum - 1] || "Production Application Engineering";
        const dynamicWeekString = `Week #${weekNum} of 12 (${topic})`;

        const targetStudentEmail = (matched?.email || activeTargetEmail || savedEmail || "").toLowerCase().trim();
        const targetStudentName = (matched?.full_name || matched?.student_name || savedName || "").toLowerCase().trim();

        // Fetch My Leave Requests
        let userLeaves = [];
        try {
          const allLeaves = await dbFetch("leaves").catch(() => []);
          userLeaves = (allLeaves || []).filter(
            (l) => {
              const lEmail = (l.applicant_email || l.email || "").toLowerCase().trim();
              const lName = (l.applicant_name || l.employee_name || "").toLowerCase().trim();
              return (targetStudentEmail && (lEmail === targetStudentEmail || lEmail.includes(targetStudentEmail))) ||
                     (targetStudentName && lName.includes(targetStudentName));
            }
          );
          setMyStudentLeaves(userLeaves);
        } catch (e) {}

        // Fetch Attendance Logs & Compute Today's Check-in Record
        const masterLogs = await dbFetch("attendance").catch(() => []);
        const studentLogs = (masterLogs || []).filter(
          (l) => {
            const lUser = (l.user_id || l.user_email || l.student_id || l.employee_id || "").toLowerCase().trim();
            const lName = (l.user_name || l.employee_name || "").toLowerCase().trim();
            return (targetStudentEmail && (lUser === targetStudentEmail || lUser.includes(targetStudentEmail) || targetStudentEmail.includes(lUser))) ||
                   (targetStudentName && (lName.includes(targetStudentName) || targetStudentName.includes(lName)));
          }
        );

        // Check Today's Attendance strictly for TODAY only
        const key = `today_attendance_${targetStudentEmail}`;
        const savedToday = localStorage.getItem(key) || (savedEmail ? localStorage.getItem(`today_attendance_${savedEmail}`) : null);
        let currentDayAttendance = null;

        if (savedToday) {
          try {
            const parsed = JSON.parse(savedToday);
            if (Array.isArray(parsed)) {
              currentDayAttendance = parsed.find(r => isRecordFromToday(r) && (r.type === "check_in" || r.check_in_time));
            } else if (isRecordFromToday(parsed)) {
              currentDayAttendance = parsed;
            }
          } catch (e) {}
        }

        if (!currentDayAttendance && studentLogs.length > 0) {
          currentDayAttendance = studentLogs.find(l => isRecordFromToday(l) && (l.type === "check_in" || l.check_in_time || l.check_in));
        }

        setTodayAttendance(currentDayAttendance || null);

        // Build Comprehensive Attendance Calendar (Sundays, Leaves, Shift Times, Absents & Presents)
        const fullCalendar = buildFullStudentAttendanceCalendar({
          rawLogs: studentLogs,
          leaves: userLeaves,
          startDate: startDate,
          todayRecord: currentDayAttendance,
        });
        setStudentAttendanceHistory(fullCalendar);

        const workingDays = fullCalendar.filter(d => !d.is_sunday);
        const presentOrLeaveDays = workingDays.filter(d => 
          (d.attendance_status || "").toLowerCase().includes("present") ||
          (d.attendance_status || "").toLowerCase().includes("leave") ||
          (d.attendance_status || "").toLowerCase().includes("on time") ||
          (d.attendance_status || "").toLowerCase().includes("late")
        );
        const studentAttendanceRate = workingDays.length > 0
          ? Math.round((presentOrLeaveDays.length / workingDays.length) * 100)
          : (matched.attendance !== undefined ? Number(matched.attendance) : 100);

        // Fetch Database-Assigned MCQ Exams & Attempts
        try {
          const examsList = await getAssignedExamsForUser(targetStudentEmail);
          const attemptsList = await getExamAttemptsForUser(targetStudentEmail);
          setAssignedExams(examsList || []);
          setExamAttempts(attemptsList || []);
        } catch (e) {}

        // Fetch Announcements & Complaints
        try {
          const [annList, compList] = await Promise.all([
            dbFetch("announcements", [], true).catch(() => []),
            dbFetch("complaints", [], true).catch(() => [])
          ]);
          setAnnouncements(annList || []);
          const myComp = (compList || []).filter(c => (c.email || c.submitted_by || "").toLowerCase().trim().includes(targetStudentEmail) || targetStudentEmail.includes((c.email || "").toLowerCase().trim()));
          setMyComplaints(myComp || []);
        } catch (e) {}

        loadStudentTasks(targetStudentEmail);

        setStudentInfo((prev) => ({
          ...prev,
          name: matched.full_name || matched.student_name || savedName || "Student / Intern",
          email: matched.email || savedEmail,
          phone: matched.phone || "0300-1234567",
          course: courseTitle,
          techDomain: matched.tech_domain || courseTitle,
          trackType: trackType,
          certificateType: certType,
          startDate: startDate,
          endDate: endDate,
          batch: matched.batch || (isInternRole ? "Internship Cohort #2026" : prev.batch),
          enrollmentNo: matched.id || matched.student_id || matched.intern_id || prev.enrollmentNo,
          progress: progressPct,
          attendance: studentAttendanceRate,
          instructor: assignedInstructor,
          currentWeek: dynamicWeekString,
        }));

        const totalFee = Number(matched.course_fee || matched.total_fee || 25000);
        const paidFee = Number(matched.fee_paid || matched.submitted_fee || 25000);
        const remFee = Math.max(0, totalFee - paidFee);

        setFeeStatus({
          dueDate: matched.next_due_date || matched.end_date || "2026-08-08",
          totalFee: totalFee,
          paidAmount: paidFee,
          remainingBalance: remFee,
          status: matched.fee_status || (remFee === 0 ? "Paid" : "Pending Due"),
          receiptNo: `REC-${matched.id || "99812"}`,
        });

        // Load 30-day fee cycles for this student
        try {
          const storedCycles = JSON.parse(
            localStorage.getItem("persistent_student_fee_cycles") || "[]"
          );
          const studentCycles = storedCycles.filter(
            (c) => c.student_id === matched.id || c.student_id === matched.student_id
          );

          if (studentCycles && studentCycles.length > 0) {
            setFeeCyclesList(studentCycles);
          } else {
            const generated = calculate30DayFeeCycles({
              studentId: matched.id || matched.student_id,
              enrollmentDate: startDate,
              totalFee: totalFee,
              submittedFee: paidFee,
              courseMonths: 3,
            });
            setFeeCyclesList(generated);
          }
        } catch (e) {}
      } else if (savedEmail) {
        setStudentInfo((prev) => ({
          ...prev,
          email: savedEmail,
          name: savedName || "Enrolled Student / Intern",
        }));
      }

      // Fetch Scheduled Meetings & Live Sessions targeted for this student
      try {
        const allMeetings = await dbFetch("meetings").catch(() => []);
        const sEmail = (savedEmail || "").toLowerCase().trim();
        const sName = (matched?.full_name || matched?.student_name || savedName || "").toLowerCase().trim();
        const targetedMeetings = (allMeetings || []).filter((m) => {
          if (!m) return false;
          const targetType = (m.target_type || "").toLowerCase();
          const targetKey = (m.target_key || "").toLowerCase();
          return (
            targetType === "all" ||
            targetType === "all_students" ||
            (sEmail && targetKey.includes(sEmail)) ||
            (sName && targetKey.includes(sName)) ||
            (m.participants || []).some(p => (p.email || "").toLowerCase().trim() === sEmail)
          );
        });
        setMyStudentMeetings(targetedMeetings);
      } catch (e) {}

      // Fetch Targeted Fee Notices & Announcements for this student
      try {
        const cloudAnn = await dbFetch("announcements").catch(() => []);
        const localAnn = JSON.parse(localStorage.getItem("software_house_master_announcements") || "[]");
        const allAnn = [...(cloudAnn || []), ...(localAnn || [])];

        const sEmail = (matched?.email || activeTargetEmail || savedEmail || "").toLowerCase().trim();
        const targetedFeeNotices = allAnn.filter((a) => {
          if (!a) return false;
          const tType = (a.target_type || "").toLowerCase();
          const tKey = (a.target_key || "").toLowerCase();
          return (
            a.is_fee_notice &&
            (tType === "all" || tType === "all_students" || (sEmail && tKey.includes(sEmail)))
          );
        });
        setMyFeeNotices(targetedFeeNotices);
      } catch (e) {}

      loadStudentTasks(savedEmail);
    };

    fetchStudentData();

    const handleDataChange = () => {
      fetchStudentData();
    };
    window.addEventListener("dataChanged", handleDataChange);
    return () => window.removeEventListener("dataChanged", handleDataChange);
  }, [selectedStudentEmail]);

  const loadStudentTasks = async (email) => {
    try {
      const tasks = await getDailyTasks(email);
      setAssignedTasks(tasks || []);
    } catch (e) {
      console.error("Error loading tasks:", e);
    }
  };

  // Remote Monitoring Workstation Live Session Timer Effect
  useEffect(() => {
    let interval = null;
    if (remoteSessionActive) {
      interval = setInterval(() => {
        setRemoteSessionSeconds((prev) => {
          const nextSec = prev + 1;
          // Synchronize with Admin Remote Monitoring session storage
          try {
            const activeSessions = JSON.parse(localStorage.getItem("software_house_remote_monitoring_sessions") || "[]");
            const mySession = {
              id: `sess-${studentInfo.email || 'user'}`,
              user_name: studentInfo.name,
              user_email: studentInfo.email,
              user_role: studentInfo.trackType || "Remote Student",
              tech_domain: studentInfo.techDomain,
              status: "Active",
              current_app: remoteFocusApp,
              session_seconds: nextSec,
              started_at: new Date(Date.now() - nextSec * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              productivity_score: Math.min(98, Math.max(78, Math.round(86 + (nextSec % 8)))),
              last_ping: new Date().toISOString()
            };
            const updated = [mySession, ...activeSessions.filter(s => s.user_email !== studentInfo.email)];
            localStorage.setItem("software_house_remote_monitoring_sessions", JSON.stringify(updated));
          } catch(e) {}
          return nextSec;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [remoteSessionActive, studentInfo, remoteFocusApp]);

  // Live Task Duration Timer Effect
  useEffect(() => {
    let timer = null;
    if (activeTaskTimerId) {
      timer = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [activeTaskTimerId]);

  // Universal Download Certificate Handler (Student Diploma vs Internship Experience)
  const handleUniversalCertificateDownload = () => {
    const isIntern = studentInfo.certificateType === "internship" || studentInfo.trackType.toLowerCase().includes("intern");
    if (isIntern) {
      generatePrintableInternshipExperienceCertificatePdf({
        intern_name: studentInfo.name,
        tech_domain: studentInfo.techDomain || studentInfo.course,
        internship_mode: studentInfo.trackType,
        start_date: studentInfo.startDate,
        end_date: studentInfo.endDate,
        cert_id: `EXP-${studentInfo.enrollmentNo.replace(/[^a-zA-Z0-9]/g, '') || '2026-9901'}`
      });
      showToast("Experience Certificate Ready 🎓", "3-Month Internship Experience Certificate generated.", "success");
    } else {
      generatePrintable3MonthStudentCertificatePdf({
        student_name: studentInfo.name,
        course_name: studentInfo.course,
        batch: studentInfo.batch,
        start_date: studentInfo.startDate,
        end_date: studentInfo.endDate,
        cert_id: `CERT-${studentInfo.enrollmentNo.replace(/[^a-zA-Z0-9]/g, '') || '2026-9901'}`
      });
      showToast("Course Certificate Ready 🎓", "3-Month Course Completion Certificate generated.", "success");
    }
  };

  // Handle Start MCQ Exam
  const handleStartMcqExam = (exam) => {
    setActiveExam(exam);
    setUserAnswers({});
    setExamSubmittedScore(null);
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
      userEmail: studentInfo.email,
      userName: studentInfo.name,
      userRole: "student",
      userAnswers: userAnswers,
      timeTakenSeconds: timeTaken,
    });

    setLatestAttemptResult(attempt);
    setExamSubmittedScore(attempt.percentage);
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

  const handleStudentCheckIn = async () => {
    if (todayAttendance?.check_in_time) {
      showToast("Already Checked In ℹ️", `Checked in today at ${todayAttendance.check_in_time}.`, "info");
      return;
    }

    setMarkingAttendance(true);
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const currentMins = now.getHours() * 60 + now.getMinutes();

    // Shift starts at 10:00 AM (600 mins). Grace period up to 10:15 AM (615 mins).
    const isLate = currentMins > 615;
    const attStatus = isLate ? "Late (Shift 10:00 AM - 06:00 PM)" : "Present (On Time)";

    const newRecord = {
      id: `att-${Date.now()}`,
      student_id: studentInfo.enrollmentNo || studentInfo.email,
      employee_id: studentInfo.enrollmentNo || studentInfo.email,
      user_id: studentInfo.email,
      user_email: studentInfo.email,
      user_name: studentInfo.name,
      employee_name: studentInfo.name,
      user_role: isIntern ? "intern" : "student",
      type: "check_in",
      check_in_time: timeStr,
      check_out_time: "Not Checked Out",
      attendance_status: attStatus,
      attendance_date: getTodayDateString(),
      date: getTodayDateString(),
      timestamp: now.toISOString(),
      public_ip: "127.0.0.1",
    };

    setTodayAttendance(newRecord);
    setStudentAttendanceHistory((prev) => [newRecord, ...prev.filter(r => r.attendance_date !== newRecord.attendance_date)]);

    try {
      const key = `today_attendance_${studentInfo.email}`;
      localStorage.setItem(key, JSON.stringify([newRecord]));
      await dbSaveRecord("attendance", newRecord).catch(() => {});
    } catch (e) {}

    setMarkingAttendance(false);
    showToast("Check-In Successful 🟢", `Checked in at ${timeStr} as ${attStatus}.`, "success");
  };

  const handleStudentCheckOut = async () => {
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
      attendance_status: "Present (Completed)",
      updated_at: now.toISOString(),
    };

    setTodayAttendance(updatedRecord);
    setStudentAttendanceHistory((prev) =>
      prev.map((r) => (r.id === updatedRecord.id || r.attendance_date === updatedRecord.attendance_date ? updatedRecord : r))
    );

    try {
      const key = `today_attendance_${studentInfo.email}`;
      localStorage.setItem(key, JSON.stringify([updatedRecord]));
      await dbSaveRecord("attendance", updatedRecord).catch(() => {});
    } catch (e) {}

    setMarkingAttendance(false);
    showToast("Check-Out Successful 🔴", `Checked out at ${timeStr}. Daily log saved to database.`, "success");
  };

  // Admin-Only Attendance Edit Function
  const handleSaveAttendanceEdit = async () => {
    if (!isAdminUser || !editAttendanceModal.date) return;
    setSavingAttendanceEdit(true);

    const editedRecord = {
      id: editAttendanceModal.record?.id || `att-manual-${editAttendanceModal.date}`,
      student_id: studentInfo.enrollmentNo || studentInfo.email,
      employee_id: studentInfo.enrollmentNo || studentInfo.email,
      user_id: studentInfo.email,
      user_email: studentInfo.email,
      user_name: studentInfo.name,
      employee_name: studentInfo.name,
      user_role: isIntern ? "intern" : "student",
      attendance_date: editAttendanceModal.date,
      date: editAttendanceModal.date,
      check_in_time: editAttendanceModal.status.includes("Absent") || editAttendanceModal.status.includes("Sunday") || editAttendanceModal.status.includes("Leave") ? "--:--" : editAttendanceModal.checkInTime,
      check_out_time: editAttendanceModal.status.includes("Absent") || editAttendanceModal.status.includes("Sunday") || editAttendanceModal.status.includes("Leave") ? "--:--" : editAttendanceModal.checkOutTime,
      attendance_status: editAttendanceModal.status,
      updated_at: new Date().toISOString(),
      edited_by: "Admin",
    };

    try {
      await dbSaveRecord("attendance", editedRecord);
      setStudentAttendanceHistory((prev) =>
        prev.map((r) => (r.attendance_date === editAttendanceModal.date ? { ...r, ...editedRecord } : r))
      );
      if (editAttendanceModal.date === getTodayDateString()) {
        setTodayAttendance(editedRecord);
      }
      showToast("Attendance Record Updated ✏️", `Record for ${editAttendanceModal.date} updated by Admin in database.`, "success");
      setEditAttendanceModal({ isOpen: false, record: null, date: "", status: "Present (On Time)", checkInTime: "10:00 AM", checkOutTime: "06:00 PM" });
    } catch (e) {
      showToast("Error 🛑", "Failed to update attendance record.", "error");
    }
    setSavingAttendanceEdit(false);
  };

  const handleStudentLeaveSubmit = async (e) => {
    e.preventDefault();
    if (!studentLeaveForm.reason.trim()) {
      showToast("Validation Error 🛑", "Please enter a reason for your leave request.", "error");
      return;
    }

    setSubmittingStudentLeave(true);

    const newLeave = {
      id: `leave-${Date.now()}`,
      applicant_name: studentInfo.name || "Student Applicant",
      employee_name: studentInfo.name || "Student Applicant",
      applicant_email: studentInfo.email,
      email: studentInfo.email,
      role: "student",
      leave_type: studentLeaveForm.leave_type,
      type: studentLeaveForm.leave_type,
      start_date: studentLeaveForm.start_date,
      end_date: studentLeaveForm.end_date,
      reason: studentLeaveForm.reason.trim(),
      status: "pending",
      salary_cut: false,
      applied_at: new Date().toISOString().split("T")[0],
    };

    setMyStudentLeaves((prev) => [newLeave, ...prev]);

    try {
      const savedLeaves = JSON.parse(localStorage.getItem("software_house_leaves") || "[]");
      localStorage.setItem("software_house_leaves", JSON.stringify([newLeave, ...savedLeaves.filter(l => l.id !== newLeave.id)]));
      window.dispatchEvent(new Event("storage"));
    } catch (err) {}

    await dbSaveRecord("leaves", newLeave).catch(() => {});

    setSubmittingStudentLeave(false);
    setStudentLeaveForm({
      leave_type: "Casual Leave",
      start_date: new Date().toISOString().split("T")[0],
      end_date: new Date().toISOString().split("T")[0],
      reason: "",
    });

    showToast("Leave Application Submitted 📝", "Submitted for Admin/HR review.", "success");
  };

  // Task Control Handlers
  const handleStartTask = async (task) => {
    const updatedTask = {
      ...task,
      status: "In Progress",
      start_time: task.start_time || new Date().toISOString(),
    };
    setActiveTaskTimerId(task.id);
    setTimerSeconds(task.total_working_seconds || 0);

    const updatedList = await saveTaskRecord(updatedTask);
    setAssignedTasks(updatedList);
    showToast("Task Started ⏱️", `Timer running for "${task.task_title}"`, "info");
  };

  const handlePauseTask = async (task) => {
    setActiveTaskTimerId(null);
    const updatedTask = {
      ...task,
      status: "Paused",
      total_working_seconds: (task.total_working_seconds || 0) + timerSeconds,
      pause_time: new Date().toISOString(),
    };

    const updatedList = await saveTaskRecord(updatedTask);
    setAssignedTasks(updatedList);
    showToast("Task Paused ⏸️", `Duration logged: ${Math.floor(timerSeconds / 60)} mins`, "warning");
  };

  const handleCompleteTask = async (task) => {
    setActiveTaskTimerId(null);
    const updatedTask = {
      ...task,
      status: "Completed",
      total_working_seconds: (task.total_working_seconds || 0) + timerSeconds,
      completion_time: new Date().toISOString(),
    };

    const updatedList = await saveTaskRecord(updatedTask);
    setAssignedTasks(updatedList);
    showToast("Task Completed 🎉", `Task "${task.task_title}" marked as complete!`, "success");
  };



  // Print Fee Receipt PDF
  const handlePrintReceipt = () => {
    try {
      generatePrintableStudentFeeReceiptPdf({
        student_name: studentInfo.name,
        student_email: studentInfo.email,
        course_name: studentInfo.course,
        batch: studentInfo.batch,
        receipt_no: feeStatus.receiptNo || "REC-2026-9018",
        amount_paid: feeStatus.paidAmount || 25000,
        remaining_balance: feeStatus.remainingBalance || 0,
        payment_date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
        payment_method: "Bank Transfer / Online Slip",
      });
    } catch (e) {
      showToast("PDF Error", "Unable to generate receipt PDF.", "error");
    }
  };

  // Print Certificate PDF
  const handlePrintCertificate = () => {
    try {
      generatePrintable3MonthStudentCertificatePdf({
        full_name: studentInfo.name,
        course_name: studentInfo.course,
        completion_date: "2026-08-01",
        certificate_no: "CERT-NEXA-2026-9901",
        grade: "A+ (98%)",
        instructor: studentInfo.instructor,
      });
    } catch (e) {
      showToast("PDF Error", "Unable to generate certificate PDF.", "error");
    }
  };

  const handleSubmitComplaint = async (e) => {
    e.preventDefault();
    if (!complaintForm.title.trim() || !complaintForm.description.trim()) {
      showToast("Validation Error ⚠️", "Please provide title and description.", "error");
      return;
    }
    setSubmittingComplaint(true);

    const userEmail = (studentInfo.email || localStorage.getItem("current_user_email") || "").toLowerCase().trim();
    const userName = studentInfo.name || localStorage.getItem("current_user_name") || "Student / Intern";

    const payload = {
      id: "comp-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      title: complaintForm.title,
      category: complaintForm.category,
      description: complaintForm.description,
      priority: complaintForm.priority,
      status: "Pending",
      submitted_by: userName,
      email: userEmail,
      created_at: new Date().toISOString()
    };

    try {
      await fetch("/api/persistence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "complaints", record: payload, action: "save" })
      });
    } catch(err) {}

    const updated = [payload, ...myComplaints];
    setMyComplaints(updated);
    setSubmittingComplaint(false);
    setComplaintModalOpen(false);
    setComplaintForm({
      title: "",
      category: "Technical / LMS",
      description: "",
      priority: "Normal"
    });
    showToast("Complaint Submitted 📩", "Your complaint / query has been submitted to Admin.", "success");
  };

  const isIntern = Boolean(
    (studentInfo.trackType || "").toLowerCase().includes("intern") ||
    (studentInfo.certificateType || "").toLowerCase().includes("intern") ||
    (studentInfo.batch || "").toLowerCase().includes("intern") ||
    (studentInfo.enrollmentNo || "").toString().startsWith("i-") ||
    role === "intern"
  );

  return (
    <div className="space-y-6 pb-12 font-sans bg-[#F8FAFC]">
      {/* Admin Student Inspector Switcher Bar */}
      {isAdminUser && (
        <div className="p-4 rounded-2xl bg-blue-50/90 border border-blue-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-2xs">
          <div className="flex items-center gap-2 text-blue-900 font-bold">
            <FaShieldAlt className="text-blue-600 text-sm" />
            <span>Admin Student Inspector Mode: Viewing student dashboard as Admin.</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">Select Student:</span>
            <select
              value={selectedStudentEmail || studentInfo.email}
              onChange={(e) => setSelectedStudentEmail(e.target.value)}
              className="px-3.5 py-1.5 rounded-xl border border-blue-300 bg-white font-bold text-slate-900 outline-none focus:border-blue-600 text-xs cursor-pointer shadow-2xs"
            >
              {allStudentsList.map((s, idx) => (
                <option key={idx} value={s.email}>
                  {s.full_name || s.student_name || s.name || s.email} ({s.course_name || s.course || "Student"})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* === STUDENT / INTERN MODERN PROFILE HEADER BANNER === */}
      {(() => {
        // Calculate 3-Month Automated Timeline Duration
        const startDateStr = studentInfo.startDate || "2026-08-29";
        const endDateStr = studentInfo.endDate || "2026-11-27";
        const startDateObj = new Date(startDateStr);
        const endDateObj = new Date(endDateStr);
        const todayObj = new Date();

        const totalCohortDays = Math.max(1, Math.round((endDateObj - startDateObj) / (1000 * 60 * 60 * 24))) || 90;
        const rawDaysPassed = Math.round((todayObj - startDateObj) / (1000 * 60 * 60 * 24));
        const daysPassed = Math.max(1, Math.min(totalCohortDays, rawDaysPassed <= 0 ? 1 : rawDaysPassed + 1));
        const daysRemaining = Math.max(0, totalCohortDays - daysPassed);
        
        // Automated Daily Timeline Percentage (Increases each day from Day 1 to Day 90)
        const timelinePct = Math.min(100, Math.max(1, Math.round((daysPassed / totalCohortDays) * 100)));

        const completedCount = assignedTasks.filter(t => t.status === "Completed").length;
        const totalCount = assignedTasks.length;

        // Blended Deliverables & Timeline Overall Score
        let finalOverallPct = timelinePct;
        if (totalCount > 0) {
          const taskPctSum = assignedTasks.reduce((acc, t) => {
            if (t.status === "Completed") return acc + 100;
            const curSecs = Number(t.timerSeconds || t.total_working_seconds || 0);
            if (t.status === "In Progress" || curSecs > 0) {
              const targetSecs = (Number(t.target_days) || 1) * 3600;
              return acc + Math.min(95, Math.max(10, Math.round((curSecs / targetSecs) * 100)));
            }
            return acc;
          }, 0);
          const taskAvg = Math.round(taskPctSum / totalCount);
          finalOverallPct = Math.min(100, Math.max(timelinePct, Math.round((timelinePct * 0.4) + (taskAvg * 0.6))));
        }

        return (
          <div className="rounded-3xl bg-gradient-to-br from-[#0F172A] via-[#1E1B4B] to-[#0F172A] text-white p-6 sm:p-7 shadow-2xl border border-indigo-500/20 relative overflow-hidden space-y-6">
            {/* Ambient Background Glows */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
            <div className="absolute bottom-0 left-0 w-60 h-60 bg-purple-500/10 rounded-full blur-2xl pointer-events-none -ml-20 -mb-20"></div>

            {/* Profile Main Row */}
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
              <div className="flex items-center gap-4 sm:gap-5">
                {/* Profile Photo Avatar with Glowing Ring */}
                <div
                  onClick={() => {
                    const sEmail = (studentInfo?.email || localStorage.getItem("current_user_email") || "").toLowerCase().trim();
                    const cur = sEmail ? (localStorage.getItem(`user_avatar_${sEmail}`) || "") : "";
                    setUserAvatarUrl(cur);
                    setInputAvatarUrl(cur);
                    setAvatarModalOpen(true);
                  }}
                  className="relative h-18 w-18 sm:h-20 sm:w-20 rounded-2xl overflow-hidden bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center text-2xl font-black shadow-lg shadow-blue-500/30 shrink-0 transition-transform hover:scale-105 cursor-pointer group border-2 border-white/20"
                  title="Click to Upload Profile Photo"
                >
                  {userAvatarUrl ? (
                    <img
                      src={userAvatarUrl}
                      alt="Student Profile"
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : null}
                  <span className="text-white text-2xl font-black uppercase">
                    {studentInfo.name ? studentInfo.name.charAt(0) : "A"}
                  </span>
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity text-white text-[10px] font-bold">
                    <span>📷</span>
                    <span>Change</span>
                  </div>
                  <span className="absolute bottom-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-slate-900 shadow-sm animate-pulse"></span>
                </div>

                {/* Name, Track & Domain Info */}
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white capitalize flex items-center gap-2">
                      {studentInfo.name}
                    </h1>
                    <span className={`px-3 py-0.5 rounded-full text-[11px] font-extrabold border uppercase tracking-wider flex items-center gap-1.5 ${
                      isIntern
                        ? "bg-purple-500/20 text-purple-200 border-purple-400/30"
                        : "bg-blue-500/20 text-blue-200 border-blue-400/30"
                    }`}>
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                      {studentInfo.trackType}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                      Active Enrollment 🟢
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm font-semibold text-cyan-300 flex items-center gap-1.5">
                    <FaLaptopCode className="text-cyan-400 text-sm" />
                    <span>{studentInfo.course}</span>
                  </p>

                  {/* Badges / Timeline Ribbon */}
                  <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-300">
                    <span className="flex items-center gap-1 font-medium">
                      <FaCalendarAlt className="text-blue-400 text-[10px]" />
                      <span>Start: <strong>{startDateStr}</strong></span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 font-medium">
                      <span>End (3 Mos): <strong>{endDateStr}</strong></span>
                    </span>
                    <span>•</span>
                    <span className="text-amber-300 font-bold bg-amber-400/10 px-2 py-0.5 rounded-md border border-amber-400/20">
                      ⏱️ Day {daysPassed} of {totalCohortDays} ({daysRemaining} Days Left)
                    </span>
                  </div>
                </div>
              </div>

              {/* View Full Profile Modal Trigger Button */}
              <div className="w-full lg:w-auto self-stretch lg:self-center">
                <button
                  type="button"
                  onClick={() => setProfileDetailModalOpen(true)}
                  className="w-full lg:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md text-white text-xs font-bold shadow-lg shadow-black/20 transition-all cursor-pointer whitespace-nowrap hover:border-white/40"
                >
                  <FaUser className="h-3.5 w-3.5 text-cyan-300" />
                  <span>View Full Profile & Documents →</span>
                </button>
              </div>
            </div>

            {/* 3-Month Dynamic Program Timeline & Deliverables Progress */}
            <div className="border-t border-white/10 pt-4 space-y-2 relative z-10">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-1 text-xs">
                <span className="text-slate-200 font-bold flex items-center gap-2">
                  <FaBookReader className="text-cyan-400" /> 
                  <span>3-Month Practical Cohort & Deliverables Progress</span>
                </span>
                <div className="flex items-center gap-2.5">
                  <span className="text-[11px] text-slate-400 font-medium">
                    (Timeline Day {daysPassed}/{totalCohortDays} • {completedCount}/{totalCount || 0} Tasks Done)
                  </span>
                  <span className="font-mono font-black text-cyan-300 text-sm">{finalOverallPct}% Completed</span>
                </div>
              </div>

              <div className="w-full bg-slate-800/80 rounded-full h-3.5 overflow-hidden p-0.5 border border-white/10 shadow-inner">
                <div
                  className="bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-400 h-full rounded-full transition-all duration-700 shadow-md shadow-cyan-500/20"
                  style={{ width: `${finalOverallPct}%` }}
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* === DEDICATED MONTHLY FEE REMINDER NOTICE (High-Priority Student Alert) === */}
      {!isIntern && Array.isArray(myFeeNotices) && myFeeNotices.length > 0 && myFeeNotices[0] && (
        <div className="p-5 rounded-3xl border border-amber-300 bg-gradient-to-r from-amber-50/90 via-white to-amber-50/40 shadow-xs space-y-3 animate-in fade-in zoom-in-95 duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/80 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 bg-amber-100 px-3 py-0.5 rounded-full border border-amber-300 flex items-center gap-1">
                <FaMoneyBillWave className="text-amber-700 text-xs" />
                <span>Monthly Fee Payment Alert 📧</span>
              </span>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                Due Date: {myFeeNotices[0]?.due_date || "End of Month"}
              </span>
            </div>
            <span className="text-xs text-amber-800 font-bold">
              Dispatched by Accounts & Finance Dept
            </span>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <span>{myFeeNotices[0]?.title || "Monthly Course Fee Reminder"}</span>
            </h3>
            <p className="text-xs text-slate-700 leading-relaxed bg-white/90 p-3.5 rounded-2xl border border-amber-200/60 font-sans whitespace-pre-line">
              {myFeeNotices[0]?.content}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-amber-200/60">
            <div className="text-[11px] font-semibold text-slate-600 space-x-2">
              <span><strong>Target Account:</strong> {studentInfo.email}</span>
              <span>•</span>
              <span><strong>Status:</strong> <span className="text-amber-700 font-bold">Pending Payment Slip</span></span>
            </div>

            <button
              onClick={() => {
                showToast("Fee Payment Instruction 💳", "Please transfer monthly fee to Nexa Official Account & present receipt.", "info");
              }}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              <FaPrint className="text-xs" />
              <span>Submit Payment Receipt / Mark Dues</span>
            </button>
          </div>
        </div>
      )}

      {/* === SCHEDULED LIVE SESSIONS & VIDEO MEETINGS (High-Priority Student Alert) === */}
      {myStudentMeetings.length > 0 && (
        <div className="p-6 rounded-3xl border border-blue-200 bg-gradient-to-r from-blue-50/80 via-white to-blue-50/50 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-100 pb-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full border border-blue-300 flex items-center gap-1">
                  <FaVideo className="text-[10px]" /> Live Video Session Alert
                </span>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {myStudentMeetings.length} Scheduled
                </span>
              </div>
              <h2 className="text-base font-bold text-[#0F172A] mt-1 flex items-center gap-2">
                <span>Official Live Meetings & Viva Sessions</span>
              </h2>
            </div>
            <span className="text-xs text-blue-700 font-semibold">
              Assigned by Management / Instructor
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {myStudentMeetings.map((m) => (
              <div
                key={m.id}
                className="p-4 rounded-2xl bg-white border border-blue-200 shadow-xs space-y-2.5 flex flex-col justify-between"
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-[#0F172A] text-sm">{m.title}</h3>
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                      {m.platform || "Google Meet"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-600">
                    <span className="font-semibold text-blue-700 flex items-center gap-1">
                      <FaClock className="text-[10px]" /> {m.date} • {m.time}
                    </span>
                    <span>•</span>
                    <span>Host: <strong className="text-slate-900">{m.host}</strong></span>
                  </div>
                  {m.target_audience_label && (
                    <p className="text-[10px] text-slate-500">
                      Target: <span className="font-semibold text-slate-700">{m.target_audience_label}</span>
                    </p>
                  )}
                </div>

                <a
                  href={m.meetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer text-center"
                >
                  <FaVideo />
                  <span>Join Live Video Session Now 🚀</span>
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === REMOTE SCREEN MONITORING & LIVE WORKSTATION CARD (REMOTE TRACK ONLY) === */}
      {Boolean((studentInfo.trackType || "").toLowerCase().includes("remote") || studentInfo.isRemote) && (
        <div className="p-6 rounded-3xl border border-purple-200 bg-white shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200 flex items-center gap-1">
                  <FaLaptopCode /> Remote Live Monitoring Station
                </span>
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                  remoteSessionActive
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-slate-100 text-slate-600 border-slate-200"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${remoteSessionActive ? 'bg-emerald-600 animate-pulse' : 'bg-slate-400'}`}></span>
                  {remoteSessionActive ? "Monitored by Admin 🟢" : "Ready to Start ⚪"}
                </span>
              </div>
              <h2 className="text-base font-bold text-[#0F172A] mt-1 flex items-center gap-2">
                <FaDesktop className="text-purple-600" /> Remote Work & Screen Access Session
              </h2>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-[10px] font-semibold text-slate-500 uppercase block">Active Session Time</span>
              <span className="font-mono text-lg font-black text-purple-700">
                {Math.floor(remoteSessionSeconds / 3600).toString().padStart(2, '0')}:
                {Math.floor((remoteSessionSeconds % 3600) / 60).toString().padStart(2, '0')}:
                {(remoteSessionSeconds % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase">Working Domain / Field</span>
              <p className="font-bold text-slate-900">{studentInfo.techDomain || "Software Engineering"}</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase">Active Application</span>
              <select
                value={remoteFocusApp}
                onChange={(e) => setRemoteFocusApp(e.target.value)}
                className="w-full bg-white rounded-lg border border-slate-200 px-2 py-1 font-bold text-slate-900 text-xs outline-none focus:border-purple-600"
              >
                <option value="VS Code (Development)">VS Code (Development)</option>
                <option value="Google Chrome (Research & Docs)">Google Chrome (Research & Docs)</option>
                <option value="Figma (UI/UX Design)">Figma (UI/UX Design)</option>
                <option value="Postman (API Testing)">Postman (API Testing)</option>
                <option value="Python / Jupyter (AI Engineering)">Python / Jupyter (AI Engineering)</option>
                <option value="Terminal / Git (DevOps)">Terminal / Git (DevOps)</option>
              </select>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase">Productivity Status</span>
              <p className="font-bold text-emerald-600">92% Highly Productive</p>
            </div>
          </div>

          {/* Live Screen Preview Window if Active */}
          {screenMediaStream && (
            <div className="rounded-2xl overflow-hidden border-2 border-purple-400 bg-slate-950 p-2 space-y-2 shadow-lg animate-in fade-in duration-300">
              <div className="flex items-center justify-between px-2 text-xs text-white">
                <span className="font-bold flex items-center gap-1.5 text-purple-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  Live Screen Stream Active • Broadcasting to Admin
                </span>
                <button
                  type="button"
                  onClick={() => setScreenAccessModalOpen(true)}
                  className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-[10px] font-bold text-white transition-all cursor-pointer"
                >
                  Expand Full Screen ⛶
                </button>
              </div>
              <video
                ref={screenVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-44 sm:h-60 object-contain bg-black rounded-xl"
              />
            </div>
          )}

          {/* Remote Session Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <p className="text-[11px] text-slate-500 italic">
              🛡️ Admin can access your live workstation screen, active tasks, and productivity in real-time.
            </p>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {/* Screen Share / Broadcast Button */}
              <button
                type="button"
                onClick={screenMediaStream ? handleStopScreenShare : handleStartScreenShare}
                className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  screenMediaStream
                    ? "bg-rose-600 hover:bg-rose-700 text-white"
                    : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
                }`}
              >
                <FaDesktop />
                <span>{screenMediaStream ? "Stop Screen Broadcast 🛑" : "Share Live Screen to Admin 🖥️"}</span>
              </button>

              {/* Admin Live Screen Viewer Trigger */}
              {isAdminUser && (
                <button
                  type="button"
                  onClick={handleOpenAdminScreenViewer}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FaEye />
                  <span>Access Remote Screen 👁️</span>
                </button>
              )}
                  <span>Access Remote Screen 👁️</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* === TODAY'S ATTENDANCE CONTROL BANNER CARD (ALWAYS INTERACTIVE) === */}
      <div className="p-6 rounded-2xl border border-blue-200 bg-white shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] bg-[#EFF6FF] px-2.5 py-0.5 rounded-full border border-blue-200">
              Student & Intern Attendance Desk
            </span>
            <h2 className="text-base font-bold text-[#0F172A] mt-1 flex items-center gap-2">
              <FaUserCheck className="text-[#2563EB]" /> My Daily Attendance Session
            </h2>
          </div>

            <span className={`text-[10px] font-bold uppercase px-3 py-1 rounded-full border ${
              todayAttendance?.check_out_time && todayAttendance.check_out_time !== "Not Checked Out" && todayAttendance.check_out_time !== "--:--"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : todayAttendance?.check_in_time
                ? "bg-blue-50 text-blue-700 border-blue-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
            }`}>
              {todayAttendance?.check_out_time && todayAttendance.check_out_time !== "Not Checked Out" && todayAttendance.check_out_time !== "--:--"
                ? "Session Completed 🟢"
                : todayAttendance?.check_in_time
                ? "Checked In 🔵"
                : "Not Checked In 🟠"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase">Check-In Time</span>
              <p className="text-base font-mono font-bold text-slate-900">
                {todayAttendance?.check_in_time || "--:--"}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase">Check-Out Time</span>
              <p className="text-base font-mono font-bold text-slate-900">
                {todayAttendance?.check_out_time && todayAttendance.check_out_time !== "Not Checked Out" && todayAttendance.check_out_time !== "--:--"
                  ? todayAttendance.check_out_time
                  : todayAttendance?.check_in_time
                  ? "Not Checked Out"
                  : "--:--"}
              </p>
            </div>
          </div>

          {/* Check-In / Check-Out Actions */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={handleStudentCheckIn}
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
              onClick={handleStudentCheckOut}
              disabled={
                markingAttendance ||
                !todayAttendance?.check_in_time ||
                Boolean(todayAttendance?.check_out_time && todayAttendance.check_out_time !== "Not Checked Out" && todayAttendance.check_out_time !== "--:--")
              }
              className={`py-3 rounded-xl font-bold text-xs shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                !todayAttendance?.check_in_time ||
                (todayAttendance?.check_out_time && todayAttendance.check_out_time !== "Not Checked Out" && todayAttendance.check_out_time !== "--:--")
                  ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                  : "bg-rose-600 hover:bg-rose-700 text-white"
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

      {/* === MY ATTENDANCE HISTORY TABLE === */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <FaCalendarAlt className="text-[#2563EB]" /> My Attendance History
          </h2>
          <span className="text-xs font-bold text-[#2563EB] bg-[#EFF6FF] px-3 py-1 rounded-full border border-blue-200">
            {studentAttendanceHistory.length} Total Logs
          </span>
        </div>

        {studentAttendanceHistory.length === 0 ? (
          <p className="text-xs text-slate-500 italic text-center py-4">No attendance records found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px]">
                  <th className="py-2.5 px-3">Date (Day)</th>
                  <th className="py-2.5 px-3">Check-In</th>
                  <th className="py-2.5 px-3">Check-Out</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {studentAttendanceHistory.map((rec) => {
                  const statusStr = (rec.attendance_status || "").toLowerCase();
                  const isSun = statusStr.includes("sunday");
                  const isLev = statusStr.includes("leave");
                  const isAbs = statusStr.includes("absent");
                  const isLate = statusStr.includes("late");
                  const isPresent = statusStr.includes("present") || statusStr.includes("on time") || statusStr.includes("completed");

                  let badgeColor = "bg-slate-100 text-slate-600 border-slate-200";
                  if (isSun) badgeColor = "bg-purple-50 text-purple-700 border-purple-200";
                  else if (isLev) badgeColor = "bg-blue-50 text-blue-700 border-blue-200";
                  else if (isAbs) badgeColor = "bg-rose-50 text-rose-700 border-rose-200 font-bold";
                  else if (isLate) badgeColor = "bg-amber-50 text-amber-700 border-amber-200 font-bold";
                  else if (isPresent) badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold";

                  return (
                    <tr key={rec.id || rec.attendance_date || rec.date} className="hover:bg-slate-50 transition-colors">
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
                        <span className={`px-2.5 py-1 rounded-full text-[10px] border uppercase flex items-center gap-1 w-fit ${badgeColor}`}>
                          {rec.attendance_status || "Present"}
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

      {/* === STUDENT & INTERN LEAVE APPLICATION SECTION (ALWAYS ACTIVE) === */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* APPLY FOR LEAVE FORM */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FaPaperPlane className="text-[#2563EB]" /> Apply for Leave
            </h2>
          </div>

          <form onSubmit={handleStudentLeaveSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-800 uppercase mb-1">Leave Type *</label>
              <select
                value={studentLeaveForm.leave_type}
                onChange={(e) => setStudentLeaveForm({ ...studentLeaveForm, leave_type: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 bg-white outline-none focus:border-[#2563EB]"
              >
                <option value="Casual Leave">Casual Leave</option>
                <option value="Sick Leave">Sick Leave</option>
                <option value="Emergency Leave">Emergency Leave</option>
                <option value="Exam / University Leave">Exam / University Leave</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-800 uppercase mb-1">Start Date</label>
                <input
                  type="date"
                  value={studentLeaveForm.start_date}
                  onChange={(e) => setStudentLeaveForm({ ...studentLeaveForm, start_date: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 uppercase mb-1">End Date</label>
                <input
                  type="date"
                  value={studentLeaveForm.end_date}
                  onChange={(e) => setStudentLeaveForm({ ...studentLeaveForm, end_date: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 uppercase mb-1">Reason / Statement *</label>
              <textarea
                rows={2}
                value={studentLeaveForm.reason}
                onChange={(e) => setStudentLeaveForm({ ...studentLeaveForm, reason: e.target.value })}
                placeholder="State reason for your leave application..."
                required
                className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-900 outline-none focus:border-[#2563EB]"
              />
            </div>

            <button
              type="submit"
              disabled={submittingStudentLeave}
              className="w-full py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs transition-colors shadow-xs cursor-pointer"
            >
              {submittingStudentLeave ? "Submitting..." : "Submit Leave Application"}
            </button>
          </form>
        </div>

        {/* MY LEAVE APPLICATIONS HISTORY */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FaClock className="text-[#2563EB]" /> My Leave Applications
            </h2>
            <span className="text-xs font-bold text-[#2563EB] bg-[#EFF6FF] px-2.5 py-0.5 rounded-full border border-blue-200">
              {myStudentLeaves.length} Submitted
            </span>
          </div>

          {myStudentLeaves.length === 0 ? (
            <p className="text-xs text-slate-500 italic text-center py-4">No leave applications submitted yet.</p>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {myStudentLeaves.map((l) => (
                <div key={l.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-bold text-slate-900">{l.leave_type}</p>
                    <p className="text-[10px] text-slate-500">{l.start_date} to {l.end_date}</p>
                    <p className="text-[11px] text-slate-600 mt-1">{l.reason}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase shrink-0 ${
                    (l.status || "").toLowerCase() === "approved"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : (l.status || "").toLowerCase() === "rejected"
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
      </div>

      {/* === ANNOUNCEMENTS & COMPLAINT / QUERY DESK (2-COLUMN GRID) === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. OFFICIAL COMPANY ANNOUNCEMENTS */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FaBullhorn className="text-[#2563EB]" /> Official Announcements
            </h2>
            <span className="text-xs font-bold text-[#2563EB] bg-[#EFF6FF] px-2.5 py-0.5 rounded-full border border-blue-200">
              {announcements.length} Active
            </span>
          </div>

          {announcements.length === 0 ? (
            <div className="p-6 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 text-xs italic">
              No new announcements posted at the moment.
            </div>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {announcements.map((a) => (
                <div key={a.id} className="p-4 rounded-2xl border border-blue-100 bg-blue-50/40 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900">{a.title}</h4>
                    <span className="text-[10px] font-semibold text-slate-500">{a.date || a.created_at?.slice(0, 10) || "Recent"}</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{a.message || a.content}</p>
                  {a.meet_url && (
                    <a
                      href={a.meet_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline pt-1"
                    >
                      <FaLink className="text-[10px]" /> Join Scheduled Meeting Link →
                    </a>
                  )}
                  <p className="text-[10px] text-blue-700 font-bold pt-0.5">Posted by: {a.posted_by || "Management"}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. HELP DESK & COMPLAINT / QUERY SYSTEM */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FaPaperPlane className="text-[#2563EB]" /> Help Desk & Query Desk
            </h2>
            <button
              onClick={() => setComplaintModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <span>+ Submit Query</span>
            </button>
          </div>

          {myComplaints.length === 0 ? (
            <div className="p-6 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 text-xs italic space-y-1">
              <p className="font-bold text-slate-700">No Queries / Complaints Submitted</p>
              <p>Facing any issue with LMS, tasks, or attendance? Click "+ Submit Query" above.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {myComplaints.map((c) => (
                <div key={c.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{c.title}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${
                      c.status === "Resolved"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : c.status === "In Review"
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}>
                      {c.status || "Pending"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{c.description}</p>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200">
                    <span>Category: <strong className="text-slate-700">{c.category || "General"}</strong></span>
                    <span>Priority: <strong className="text-blue-600">{c.priority || "Normal"}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* === DASHBOARD STATS GRID === */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-2">
          <div className="flex justify-between items-center text-xs text-slate-500">
            <span>Current Learning Week</span>
            <FaCalendarAlt className="text-blue-500" />
          </div>
          <p className="text-sm font-bold text-slate-900">{studentInfo.currentWeek}</p>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-2">
          <div className="flex justify-between items-center text-xs text-slate-500">
            <span>Attendance Rate</span>
            <FaUserCheck className="text-emerald-500" />
          </div>
          <p className="text-xl font-black text-slate-900">
            {studentInfo.attendance}%{" "}
            <span className={`text-xs font-semibold ${studentInfo.attendance >= 90 ? "text-emerald-600" : studentInfo.attendance >= 75 ? "text-blue-600" : studentInfo.attendance >= 60 ? "text-amber-600" : "text-rose-600"}`}>
              {studentInfo.attendance >= 90 ? "(Excellent)" : studentInfo.attendance >= 75 ? "(Good)" : studentInfo.attendance >= 60 ? "(Satisfactory)" : "(Needs Improvement)"}
            </span>
          </p>
        </div>

        {!isIntern ? (
          <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-2">
            <div className="flex justify-between items-center text-xs text-slate-500">
              <span>Fee Status</span>
              <FaMoneyBillWave className="text-emerald-500" />
            </div>
            <p className="text-sm font-bold text-emerald-600 flex items-center gap-1">
              <FaCheckCircle /> {feeStatus.status}
            </p>
          </div>
        ) : (
          <div className="p-5 rounded-2xl border border-purple-200 bg-purple-50/40 shadow-xs space-y-2">
            <div className="flex justify-between items-center text-xs text-purple-700 font-semibold">
              <span>Training Model</span>
              <FaAward className="text-purple-600" />
            </div>
            <p className="text-sm font-bold text-purple-700 flex items-center gap-1">
              <FaCheckCircle /> 100% Free Practical Internship
            </p>
          </div>
        )}
      </div>

      {/* === SECTION: MY PERSONAL PERFORMANCE & EVALUATION SCORE === */}
      {(() => {
        const completedTasksCount = assignedTasks.filter(t => t.status === "Completed").length;
        const totalTasksCount = assignedTasks.length;
        const realTaskScore = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : (myPerformance?.metrics?.taskCompletion || 0);
        const realAttendanceScore = Number(studentInfo.attendance) || 100;
        const realDeadlinesScore = myPerformance?.metrics?.deadlines || (totalTasksCount > 0 ? (completedTasksCount > 0 ? 100 : 50) : 100);
        const realInstructorRating = myPerformance?.metrics?.clientFeedback || myPerformance?.rating || 100;
        const overallRealScore = Math.round((realAttendanceScore + realTaskScore + realDeadlinesScore + realInstructorRating) / 4);

        return (
          <div className="rounded-3xl border border-blue-200 bg-linear-to-br from-blue-50/50 to-white p-6 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FaStar className="text-blue-600" /> My Evaluation Score & Performance Rating
                </h2>
                <p className="text-xs text-slate-500">Live performance & deliverables score based on real assigned work & attendance.</p>
              </div>
              <div className="px-3.5 py-1 bg-blue-600 text-white font-black text-xs rounded-full shadow-xs flex items-center gap-1.5">
                <FaAward className="text-amber-300" /> Overall Rating: {overallRealScore}%
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Attendance Score</span>
                <p className="text-xl font-black text-blue-700">{realAttendanceScore}%</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Task Completion</span>
                <p className="text-xl font-black text-emerald-700">{realTaskScore}%</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Deadlines Met</span>
                <p className="text-xl font-black text-purple-700">{realDeadlinesScore}%</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Instructor Rating</span>
                <p className="text-xl font-black text-amber-700">{realInstructorRating}%</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* === SECTION: 30-DAY RECURRING FEE CYCLES TRACKING (REGULAR STUDENTS ONLY) === */}
      {!isIntern ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FaMoneyBillWave className="text-emerald-600" /> My 30-Day Recurring Fee Cycles (3 Months Course)
              </h2>
              <p className="text-xs text-slate-500">Automated 30-day recurring fee cycle schedule & installment breakdown.</p>
            </div>
            <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
              Total Course Fee: PKR {feeStatus.totalFee.toLocaleString()}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {feeCyclesList.map((c) => (
              <div
                key={c.id || c.cycle_number}
                className={`p-4 rounded-2xl border ${
                  c.status === "Paid"
                    ? "border-emerald-200 bg-emerald-50/40"
                    : c.status === "Overdue"
                    ? "border-rose-200 bg-rose-50/40"
                    : "border-amber-200 bg-amber-50/40"
                } space-y-2.5 relative`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-slate-800 tracking-wider">
                    Cycle #{c.cycle_number} (30 Days)
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      c.status === "Paid"
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                        : c.status === "Overdue"
                        ? "bg-rose-100 text-rose-800 border border-rose-200"
                        : "bg-amber-100 text-amber-800 border border-amber-200"
                    }`}
                  >
                    {c.status}
                  </span>
                </div>

                <div className="text-xs space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Cycle Period:</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {c.cycle_start_date} → {c.cycle_end_date}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Due Date:</span>
                    <span className="font-mono font-bold text-slate-900">{c.due_date}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 border-t border-slate-200/60 pt-1.5 mt-1.5">
                    <span>Cycle Installment:</span>
                    <span className="font-bold text-slate-900">PKR {Number(c.amount || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Submitted Amount:</span>
                    <span className="font-bold text-emerald-700">PKR {Number(c.paid_amount || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-700 font-bold border-t border-slate-200/60 pt-1">
                    <span>Remaining Due:</span>
                    <span className={c.remaining_amount > 0 ? "text-rose-600" : "text-emerald-700"}>
                      PKR {Number(c.remaining_amount || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-purple-200 bg-gradient-to-r from-purple-50/60 via-white to-blue-50/40 p-6 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-purple-100 pb-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-100 px-2.5 py-0.5 rounded-full border border-purple-300">
                100% Free Practical Training Program
              </span>
              <h2 className="text-base font-bold text-slate-900 mt-1 flex items-center gap-2">
                <FaAward className="text-purple-600" /> Practical Internship Milestones & Work Guidelines
              </h2>
            </div>
            <span className="text-xs font-bold text-purple-700 bg-purple-50 px-3 py-1 rounded-full border border-purple-200">
              Assigned Mentor: {studentInfo.instructor || "Lead Technical Mentor"}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs pt-1">
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-1">
              <span className="font-bold text-slate-900 block">1. Live Task Deliverables</span>
              <p className="text-slate-500 text-[11px]">Work on production features assigned by Admin and log daily task time with the live stopwatch.</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-1">
              <span className="font-bold text-slate-900 block">2. Shift & Attendance Check-in</span>
              <p className="text-slate-500 text-[11px]">Ensure daily check-in from your assigned mode (On-Site biometric/IP or Remote desk).</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-1">
              <span className="font-bold text-slate-900 block">3. Experience Certificate</span>
              <p className="text-slate-500 text-[11px]">Upon 3-month completion with 80%+ deliverables score, official experience certificate is awarded.</p>
            </div>
          </div>
        </div>
      )}

      {/* === SECTION: DAILY TASK MANAGER WITH LIVE TIMER === */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FaTasks className="text-blue-600" /> My Daily Work & Assignment Tasks
            </h2>
            <p className="text-xs text-slate-500">Start task timers to record working duration and submit daily progress updates.</p>
          </div>

          <button
            onClick={() => loadStudentTasks(studentInfo.email)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors"
          >
            Refresh Tasks
          </button>
        </div>

        {/* Task Cards List */}
        {assignedTasks.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            <FaTasks className="mx-auto h-8 w-8 text-slate-400" />
            <h3 className="text-sm font-bold text-slate-800">No Tasks Assigned Yet</h3>
            <p className="text-xs text-slate-500 italic">Admin will assign your daily practical deliverables and project tasks here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {assignedTasks.map((t) => (
              <div
                key={t.id}
                className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white transition-all space-y-3"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider mb-1 ${
                      t.priority === "Urgent" || t.priority === "High"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-blue-100 text-blue-700"
                    }`}>
                      {t.priority} Priority
                    </span>
                    <h3 className="text-sm font-bold text-slate-900">{t.task_title}</h3>
                    <p className="text-xs text-slate-500">{t.description}</p>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {t.status === "Pending" && (
                      <button
                        onClick={() => handleStartTask(t)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700 transition-colors shadow-xs"
                      >
                        <FaPlay className="h-3 w-3" /> Start Task
                      </button>
                    )}

                    {t.status === "In Progress" && (
                      <>
                        <button
                          onClick={() => handlePauseTask(t)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 text-white font-semibold text-xs hover:bg-amber-600 transition-colors"
                        >
                          <FaPause className="h-3 w-3" /> Pause
                        </button>
                        <button
                          onClick={() => handleCompleteTask(t)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white font-semibold text-xs hover:bg-blue-700 transition-colors shadow-xs"
                        >
                          <FaCheckCircle className="h-3 w-3" /> Complete
                        </button>
                      </>
                    )}

                    {t.status === "Completed" && (
                      <span className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-bold">
                        <FaCheckDouble /> Completed
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-200/60 pt-3">
                  <span>Due Date: <strong>{formatSafeDueDate(t.due_date)}</strong></span>
                  <span>Assigned by: <strong>{t.assigned_by_name}</strong></span>
                  <span className="font-mono text-slate-700">Logged Time: {Math.floor((t.total_working_seconds || 0) / 60)} mins</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* === SECTION: ONLINE EXAMINATIONS & MCQ QUIZ ENGINE (REGULAR STUDENTS ONLY) === */}
      {!isIntern && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FaLaptopCode className="text-blue-600" /> Examinations & Testing Suite
              </h2>
              <p className="text-xs text-slate-500">Attempt online MCQ tests, live coding evaluations, and submit practical assignments.</p>
            </div>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
              {assignedExams.length} Exams Assigned
            </span>
          </div>

          {assignedExams.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <FaLaptopCode className="mx-auto h-8 w-8 text-slate-400" />
              <h3 className="text-sm font-bold text-slate-800">Online MCQ Exam</h3>
              <p className="text-xs text-slate-500 italic">No exam has been assigned to you yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {assignedExams.map((exam) => {
                const attempt = examAttempts.find((a) => a.exam_id === exam.id);

                return (
                  <div key={exam.id} className="p-5 rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50/50 via-white to-slate-50 space-y-3 relative">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 uppercase">
                        {exam.course || "Online MCQ Exam"}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${
                        attempt
                          ? attempt.result === "PASSED"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-blue-50 text-blue-700 border-blue-200"
                      }`}>
                        {attempt ? `Status: Completed (${attempt.result})` : "Status: Assigned"}
                      </span>
                    </div>

                    <h3 className="font-bold text-slate-900 text-sm">{exam.title}</h3>
                    <p className="text-xs text-slate-600 line-clamp-2">{exam.description || "Official evaluation test."}</p>

                    <div className="text-[11px] text-slate-500 space-y-1 bg-white/80 p-2.5 rounded-xl border border-slate-200/60">
                      <div className="flex justify-between">
                        <span>Questions: <strong>{exam.questions?.length || 0} Questions</strong></span>
                        <span>Time Limit: <strong>{exam.time_limit || 10} Mins</strong></span>
                      </div>
                      <div className="flex justify-between">
                        <span>Passing Score: <strong>{exam.passing_score || 50}%</strong></span>
                        <span>Due: <strong>{exam.due_date || "Open"}</strong></span>
                      </div>
                    </div>

                    {attempt ? (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-slate-100 font-semibold text-slate-800">
                          <span>Score: {attempt.score} ({attempt.percentage}%)</span>
                          <span className={attempt.result === "PASSED" ? "text-emerald-700" : "text-rose-700"}>{attempt.result}</span>
                        </div>
                        <button
                          onClick={() => {
                            setActiveExam(exam);
                            setLatestAttemptResult(attempt);
                            setExamSubmittedScore(attempt.percentage);
                            setMcqModalOpen(true);
                          }}
                          className="w-full py-2.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs transition-colors"
                        >
                          View Result
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleStartMcqExam(exam)}
                        className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors shadow-xs cursor-pointer"
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
      )}

      {/* === MCQ EXAM RUNNER MODAL === */}
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
                    onClick={() => setMcqModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
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
                  <p className="text-xs text-slate-500">Your score has been saved to your academic record.</p>
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

      {/* === CERTIFICATE PREVIEW & QR MODAL === */}
      {certificateModalOpen && (
        <Modal
          isOpen={certificateModalOpen}
          onClose={() => setCertificateModalOpen(false)}
          title="Official Course Certificate & Verification QR"
        >
          <div className="space-y-5 text-xs text-slate-700">
            <div className="p-6 rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50/60 via-white to-slate-50 text-center space-y-3">
              <FaAward className="mx-auto h-12 w-12 text-blue-600" />
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                Certificate of Academic Excellence
              </h3>
              <p className="text-xs text-slate-600">This certifies that <strong>{studentInfo.name}</strong> has successfully completed all requirements for <strong>{studentInfo.course}</strong>.</p>
              
              <div className="pt-2 flex justify-center">
                <div className="p-3 bg-white border border-slate-200 rounded-xl inline-block shadow-xs">
                  <FaQrcode className="h-16 w-16 text-slate-900 mx-auto" />
                  <p className="text-[9px] font-mono text-slate-500 mt-1">Scan or Visit to Verify</p>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <Link
                href="/verify-certificate?id=CERT-NEXA-2026-9901"
                target="_blank"
                className="flex items-center gap-1.5 text-blue-600 font-semibold hover:underline"
              >
                <FaQrcode /> Open Public Verification Link
              </Link>

              <button
                onClick={handlePrintCertificate}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors shadow-xs"
              >
                <FaPrint /> Download Certificate PDF
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* === STUDENT FULL PROFILE DETAILS MODAL === */}
      {profileDetailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 border border-slate-200 text-left animate-in fade-in zoom-in-95 duration-150 my-8 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                  Student Profile Record
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Active Enrollment 🟢
                </span>
              </div>
              <button
                onClick={() => setProfileDetailModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center font-bold text-lg cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Profile Identity Card */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex flex-col sm:flex-row items-center sm:items-start gap-4 relative overflow-hidden shadow-sm">
              <div className="h-20 w-20 rounded-2xl bg-white/20 backdrop-blur-md text-white flex items-center justify-center text-3xl font-black border-2 border-white/30 shrink-0 shadow-inner">
                {studentInfo.name.charAt(0)}
              </div>
              <div className="space-y-1 text-center sm:text-left flex-1">
                <h2 className="text-xl font-bold tracking-tight text-white">{studentInfo.name}</h2>
                <p className="text-xs text-blue-100 font-medium">{studentInfo.course}</p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white border border-white/30 backdrop-blur-sm">
                    {studentInfo.trackType}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white text-blue-900">
                    Roll No: {studentInfo.enrollmentNo}
                  </span>
                </div>
              </div>
            </div>

            {/* Structured Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Card 1: Academic Track */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                  <FaGraduationCap className="text-blue-600" /> Course / Tech Domain
                </span>
                <p className="font-bold text-slate-900 text-xs">{studentInfo.course}</p>
                <p className="text-[10px] text-slate-500">{studentInfo.techDomain || "Software Engineering"}</p>
              </div>

              {/* Card 2: Roll Number */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                  <FaIdCard className="text-blue-600" /> Official Roll Number
                </span>
                <p className="font-mono font-bold text-blue-700 text-xs">{studentInfo.enrollmentNo}</p>
                <p className="text-[10px] text-slate-500">{studentInfo.batch || "Cohort Batch #14"}</p>
              </div>

              {/* Card 3: Phone Number */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                  <FaPhoneAlt className="text-blue-600" /> Contact Phone
                </span>
                <p className="font-bold text-slate-900 text-xs">{studentInfo.phone || "0300-1234567"}</p>
                <p className="text-[10px] text-emerald-600 font-semibold">Verified Student Number ✓</p>
              </div>

              {/* Card 4: Email Address */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                  <FaEnvelope className="text-blue-600" /> Registered Email
                </span>
                <p className="font-bold text-slate-900 text-xs truncate">{studentInfo.email}</p>
                <p className="text-[10px] text-slate-500">Portal Login ID</p>
              </div>

              {/* Card 5: Program Duration */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                  <FaCalendarAlt className="text-blue-600" /> 3-Month Program Timeline
                </span>
                <p className="font-bold text-slate-900 text-xs">{studentInfo.startDate} to {studentInfo.endDate}</p>
                <p className="text-[10px] text-blue-600 font-semibold">{studentInfo.currentWeek}</p>
              </div>

              {/* Card 6: Assigned Instructor */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                  <FaChalkboardTeacher className="text-blue-600" /> Assigned Lead Instructor
                </span>
                <p className="font-bold text-slate-900 text-xs">{studentInfo.instructor || "Lead Industry Trainer"}</p>
                <p className="text-[10px] text-slate-500">Academic Supervisor</p>
              </div>
            </div>

            {/* Attendance & Fee / Training Snapshot */}
            <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
              <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 space-y-1">
                <span className="text-[10px] font-bold text-blue-700 uppercase">Live Attendance Rate</span>
                <p className="text-base font-black text-blue-900">{studentInfo.attendance || 100}%</p>
                <p className="text-[10px] text-blue-600">Verified System Attendance</p>
              </div>

              {!isIntern ? (
                <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase">Fee Account Status</span>
                  <p className="text-base font-black text-emerald-900">
                    {feeStatus.remainingBalance === 0 ? "Fully Paid (Rs. " + (feeStatus.paidAmount || 25000) + ")" : "Due: Rs. " + feeStatus.remainingBalance}
                  </p>
                  <p className="text-[10px] text-emerald-700 font-semibold">Receipt: {feeStatus.receiptNo || "REC-2026-9018"}</p>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-purple-50/70 border border-purple-200 space-y-1">
                  <span className="text-[10px] font-bold text-purple-700 uppercase">Training Track</span>
                  <p className="text-base font-black text-purple-900">
                    100% Free Scholarship
                  </p>
                  <p className="text-[10px] text-purple-700 font-semibold">Track: Production Software House</p>
                </div>
              )}
            </div>

            {/* Footer Action Buttons */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
              {!isIntern && (
                <button
                  type="button"
                  onClick={handlePrintReceipt}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <FaPrint className="text-xs" /> Print Fee Receipt
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setProfileDetailModalOpen(false);
                  handleUniversalCertificateDownload();
                }}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <FaAward className="text-xs" /> Download Certificate
              </button>
              <button
                type="button"
                onClick={() => setProfileDetailModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
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
                    {studentInfo.name.charAt(0)}
                  </span>
                )}
              </div>
              <div>
                <h4 className="font-bold text-[#0F172A] text-sm">{studentInfo.name || "Student"}</h4>
                <p className="text-[#64748B] text-[11px] font-mono">{studentInfo.email}</p>
                <p className="text-[10px] text-[#2563EB] font-bold mt-0.5 uppercase">Role: Student / Intern</p>
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

      {/* === SUBMIT COMPLAINT / QUERY MODAL === */}
      {complaintModalOpen && (
        <Modal
          isOpen={complaintModalOpen}
          onClose={() => setComplaintModalOpen(false)}
          title="Submit Student / Intern Query or Complaint"
        >
          <form onSubmit={handleSubmitComplaint} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Query Subject / Title *</label>
              <input
                type="text"
                value={complaintForm.title}
                onChange={(e) => setComplaintForm({ ...complaintForm, title: e.target.value })}
                placeholder="e.g. Issue with LMS video access / Task clarification"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 outline-none focus:border-blue-600 bg-white font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Category *</label>
                <select
                  value={complaintForm.category}
                  onChange={(e) => setComplaintForm({ ...complaintForm, category: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 outline-none focus:border-blue-600 bg-white font-medium"
                >
                  <option value="Technical / LMS">Technical / LMS</option>
                  <option value="Daily Task Query">Daily Task Query</option>
                  <option value="Attendance Correction">Attendance Correction</option>
                  <option value="Fee / Payment">Fee / Payment</option>
                  <option value="Instructor Guidance">Instructor Guidance</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Priority Level</label>
                <select
                  value={complaintForm.priority}
                  onChange={(e) => setComplaintForm({ ...complaintForm, priority: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 outline-none focus:border-blue-600 bg-white font-medium"
                >
                  <option value="Normal">Normal Priority</option>
                  <option value="Urgent">Urgent</option>
                  <option value="High">High</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Description / Details *</label>
              <textarea
                rows={3}
                value={complaintForm.description}
                onChange={(e) => setComplaintForm({ ...complaintForm, description: e.target.value })}
                placeholder="Describe your issue or query in detail..."
                required
                className="w-full p-3 rounded-xl border border-slate-200 text-slate-900 outline-none focus:border-blue-600 bg-white font-medium"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setComplaintModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingComplaint}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-xs cursor-pointer"
              >
                {submittingComplaint ? "Submitting..." : "Send to Admin 🚀"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* === REMOTE INTERN LIVE SCREEN VIEWER MODAL (ADMIN & STUDENT ACCESS) === */}
      {screenAccessModalOpen && (
        <Modal
          isOpen={screenAccessModalOpen}
          onClose={handleCloseAdminScreenViewer}
          title={`🖥️ Live Workstation Screen Stream: ${studentInfo.name}`}
        >
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-900 text-white rounded-2xl border border-slate-800">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${
                  (isAdminUser ? remoteViewerState === "connected" : screenMediaStream)
                    ? "bg-emerald-400 animate-ping"
                    : "bg-amber-400 animate-pulse"
                }`}></span>
                <span className="font-bold text-xs text-emerald-300">
                  {isAdminUser
                    ? remoteViewerState === "connected"
                      ? "Live Remote Stream Active 🟢"
                      : remoteViewerState === "connecting"
                      ? "Connecting Direct WebRTC Stream 🟡"
                      : "Waiting for Student to Share ⚪"
                    : "Live Workstation Broadcast Active"}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-300 font-medium">
                {isAdminUser && remoteViewerStatus && (
                  <span className="text-cyan-300">{remoteViewerStatus}</span>
                )}
                <span>Focus App: <strong className="text-white">{remoteFocusApp}</strong></span>
                <span>•</span>
                <span>Session: <strong className="text-cyan-300">{Math.floor(remoteSessionSeconds / 60)} mins</strong></span>
              </div>
            </div>

            <div className="relative rounded-2xl overflow-hidden bg-black border-2 border-purple-500/40 aspect-video flex items-center justify-center shadow-2xl">
              {isAdminUser ? (
                remoteViewerStream ? (
                  <video
                    ref={(node) => {
                      if (node && remoteViewerStream) {
                        node.srcObject = remoteViewerStream;
                      }
                    }}
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain"
                  />
                ) : remoteViewerFrameUrl ? (
                  <div className="relative w-full h-full bg-black flex items-center justify-center">
                    <img
                      src={remoteViewerFrameUrl}
                      alt="Live Remote Screen"
                      className="w-full h-full object-contain"
                    />
                    <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-emerald-600/90 text-white font-bold text-[10px] flex items-center gap-1 shadow-md">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                      Live Stream Active 🟢
                    </span>
                  </div>
                ) : (
                  <div className="text-center p-8 space-y-3">
                    <FaDesktop className="mx-auto h-12 w-12 text-purple-400 animate-pulse" />
                    <p className="text-sm font-bold text-white">
                      {remoteViewerState === "connecting"
                        ? "Connecting to Remote Workstation..."
                        : "Waiting for Live Screen Broadcast"}
                    </p>
                    <p className="text-slate-400 text-xs max-w-sm mx-auto">
                      Make sure the student has opened their dashboard and clicked <strong>&quot;Share Live Screen to Admin&quot;</strong> on their computer.
                    </p>
                    <div className="flex items-center justify-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={handleOpenAdminScreenViewer}
                        className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
                      >
                        Retry WebRTC Connection 🔄
                      </button>
                      <Link
                        href="/dashboard/remote-monitoring"
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-xs border border-slate-700 transition-all"
                      >
                        Open Remote Monitoring Hub →
                      </Link>
                    </div>
                  </div>
                )
              ) : screenMediaStream ? (
                <video
                  ref={(node) => {
                    if (node && screenMediaStream) {
                      node.srcObject = screenMediaStream;
                    }
                  }}
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-center p-8 space-y-3">
                  <FaDesktop className="mx-auto h-12 w-12 text-purple-400 animate-pulse" />
                  <p className="text-sm font-bold text-white">Remote Screen Stream Ready</p>
                  <p className="text-slate-400 text-xs max-w-sm mx-auto">
                    Click &quot;Share Live Screen to Admin&quot; on your device to broadcast your workstation display and code editor in real time.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <p className="text-[11px] text-slate-500 italic">
                🛡️ Live supervision stream secured with encrypted WebRTC & Nexa Cloud.
              </p>
              <button
                type="button"
                onClick={handleCloseAdminScreenViewer}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Close Viewer ✕
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* === INTERACTIVE ADMIN SUPERVISION / SNAPSHOT REQUEST POPUP MODAL === */}
      {incomingSupervisionModal.isOpen && (
        <Modal
          isOpen={incomingSupervisionModal.isOpen}
          onClose={() => setIncomingSupervisionModal({ isOpen: false, ping: null })}
          title={
            incomingSupervisionModal.ping?.type === "snapshot-request" ||
            incomingSupervisionModal.ping?.message?.toLowerCase().includes("snapshot")
              ? "📸 Live Screen Audit Snapshot Request"
              : "🚨 Live Screen Supervision Request"
          }
        >
          <div className="p-2 space-y-4 text-center">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center text-3xl mx-auto shadow-xl shadow-purple-500/30 animate-bounce">
              {incomingSupervisionModal.ping?.type === "snapshot-request" ||
              incomingSupervisionModal.ping?.message?.toLowerCase().includes("snapshot")
                ? "📸"
                : "🖥️"}
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-extrabold text-slate-900">
                {incomingSupervisionModal.ping?.type === "snapshot-request" ||
                incomingSupervisionModal.ping?.message?.toLowerCase().includes("snapshot")
                  ? "Admin Screen Audit Snapshot Request"
                  : "Admin Supervision Request Received"}
              </h3>
              <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                {incomingSupervisionModal.ping?.message ||
                  "Admin is requesting live screen access to review your active internship deliverables and code editor."}
              </p>
            </div>

            <div className="p-3 bg-purple-50 border border-purple-200 rounded-2xl text-xs text-purple-900 flex items-center justify-center gap-2 font-medium">
              <span className="w-2 h-2 rounded-full bg-purple-600 animate-ping"></span>
              <span>Click the button below and select <strong>&quot;Entire Screen&quot;</strong> in the browser prompt.</span>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIncomingSupervisionModal({ isOpen: false, ping: null })}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 cursor-pointer"
              >
                Later / Dismiss
              </button>

              {incomingSupervisionModal.ping?.type === "snapshot-request" ||
              incomingSupervisionModal.ping?.message?.toLowerCase().includes("snapshot") ? (
                <button
                  type="button"
                  onClick={handleCaptureAndSendSnapshot}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-extrabold text-xs shadow-lg shadow-purple-500/30 transition-all cursor-pointer flex items-center gap-2"
                >
                  <span>Grant &amp; Capture Snapshot 📸</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleAcceptSupervisionRequest}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs shadow-lg shadow-emerald-500/30 transition-all cursor-pointer flex items-center gap-2"
                >
                  <span>Accept &amp; Start Sharing Screen 🖥️</span>
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

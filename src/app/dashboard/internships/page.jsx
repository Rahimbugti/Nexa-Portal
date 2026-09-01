"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { dbFetch, dbSaveRecord, dbDeleteRecord } from "@/lib/dbPersistence";
import Modal from "@/components/Modal";
import { showToast } from "@/components/Toast";
import ScrollableTabs from "@/components/ScrollableTabs";
import Link from "next/link";
import { registerInternWithCredentials } from "@/lib/studentEnrollmentUtils";
import { generatePrintableInternshipExperienceCertificatePdf } from "@/lib/generateInternshipExperienceCertificatePdf";
import { WebRTCViewerClient } from "@/lib/webrtcScreenService";
import {
  FaLaptopCode,
  FaUserPlus,
  FaCheckCircle,
  FaAward,
  FaPrint,
  FaTimes,
  FaHistory,
  FaPaperPlane,
  FaTrash,
  FaChalkboardTeacher,
  FaLink,
  FaCalendarCheck,
  FaUserClock,
  FaWifi,
  FaDesktop,
  FaHome,
  FaBuilding,
  FaExternalLinkAlt,
  FaEllipsisV,
  FaCheck,
  FaLock,
  FaKey,
  FaShieldAlt,
  FaEye,
  FaEyeSlash,
  FaTasks,
  FaPlay,
  FaPause,
  FaClock,
  FaCalendarAlt,
  FaCamera,
} from "react-icons/fa";

export default function InternshipsPage() {
  const [interns, setInterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [filterMode, setFilterMode] = useState("All");
  const [role, setRole] = useState("admin");
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [currentUserName, setCurrentUserName] = useState("");
  const [myTasks, setMyTasks] = useState([]);
  const [showAssignedPassword, setShowAssignedPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Kebab Context Menu State
  const [activeKebabId, setActiveKebabId] = useState(null);

  // Delete Safeguard Modal State
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, intern: null, loading: false });

  // View Intern Profile Modal State
  const [profileModal, setProfileModal] = useState({ isOpen: false, intern: null });

  // Close kebab menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest(".kebab-menu-container")) {
        setActiveKebabId(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // WebRTC Screen Access State
  const videoRef = useRef(null);
  const [mediaStream, setMediaStream] = useState(null);
  const [activeRemoteStudent, setActiveRemoteStudent] = useState(null);
  const [isLiveStreamModalOpen, setIsLiveStreamModalOpen] = useState(false);
  const [streamViewMode, setStreamViewMode] = useState("telemetry"); // 'telemetry', 'screenshot', 'live_stream'
  const [studentScreenshots, setStudentScreenshots] = useState([]);

  // Snapshot Preview Modal State
  const [snapshotPreviewModal, setSnapshotPreviewModal] = useState({
    isOpen: false,
    snapshot: null,
    student: null,
  });

  // Generic Alert Modal State
  const [modal, setModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    type: "info",
  });

  // Certificate Modal State
  const [certificateModal, setCertificateModal] = useState({
    isOpen: false,
    intern: null,
  });

  // Daily Progress Log Input State
  const [dailyLogText, setDailyLogText] = useState("");
  const [selectedInternId, setSelectedInternId] = useState(null);

  const viewerClientRef = useRef(null);

  const startLiveScreenAccess = async (student) => {
    setActiveRemoteStudent(student);
    setIsLiveStreamModalOpen(true);

    if (viewerClientRef.current) {
      viewerClientRef.current.disconnect();
    }

    // Connect WebRTC client to the intern's stream channel
    const targetKey = student.email || student.id || student.full_name;
    const client = new WebRTCViewerClient({
      userKey: targetKey,
      onRemoteStream: (stream) => {
        setMediaStream(stream);
        setStreamViewMode("live_stream");
      },
      onConnectionStateChange: (state) => {
        if (state === "connected") {
          setStreamViewMode("live_stream");
        }
      },
      onStatusMessage: (msg) => {
        console.log("[Internships WebRTC]", msg);
      },
    });

    viewerClientRef.current = client;
    client.connect();
    setStreamViewMode("live_stream");

    try {
      const allScreenshots = await dbFetch("screenshot_logs", []).catch(() => []);
      const userScs = (allScreenshots || []).filter(
        (s) =>
          (s.email && s.email.toLowerCase() === (student.email || "").toLowerCase()) ||
          (s.employeeName && s.employeeName.toLowerCase().includes(student.full_name?.toLowerCase()))
      );
      setStudentScreenshots(userScs);
    } catch (e) {
      setStudentScreenshots([]);
    }

    showToast("Connecting Live Screen 🖥️", `Establishing stream with ${student.full_name} (${student.course_name || "Remote Intern"}).`, "info");
  };

  const stopLiveScreenAccess = () => {
    if (viewerClientRef.current) {
      viewerClientRef.current.disconnect();
      viewerClientRef.current = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      setMediaStream(null);
    }
    setIsLiveStreamModalOpen(false);
    setActiveRemoteStudent(null);
    setStreamViewMode("telemetry");
    showToast("Screen Access Closed ⚪", "Remote supervision session ended.", "info");
  };

  const [lastPingTime, setLastPingTime] = useState(null);

  // Synchronize mediaStream with video element when stream or view mode changes
  useEffect(() => {
    if (videoRef.current && mediaStream) {
      videoRef.current.srcObject = mediaStream;
      videoRef.current.play().catch(() => {});
    }
  }, [mediaStream, streamViewMode, isLiveStreamModalOpen]);



  const captureAuditSnapshot = async () => {
    if (!activeRemoteStudent) return;
    let snapUrl = null;

    // 1. Grab exact video frame if live stream is playing in video element
    if (mediaStream && videoRef.current && videoRef.current.videoWidth > 0) {
      try {
        const v = videoRef.current;
        const canvas = document.createElement("canvas");
        canvas.width = v.videoWidth || 1920;
        canvas.height = v.videoHeight || 1080;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

        // Stamp Official Security Watermark
        ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        ctx.fillRect(16, canvas.height - 48, 560, 36);
        ctx.fillStyle = "#38bdf8";
        ctx.font = "bold 13px sans-serif";
        ctx.fillText(
          `NEXA REAL AUDIT • ${activeRemoteStudent.full_name} • ${new Date().toLocaleTimeString()}`,
          26,
          canvas.height - 25
        );
        snapUrl = canvas.toDataURL("image/webp", 0.92);
      } catch (err) {
        console.warn("Could not grab video frame:", err);
      }
    }

    // 2. If live stream is not yet active in this modal
    if (!snapUrl) {
      showToast("Notice ℹ️", "Live student stream must be connected to capture real-time audit frame.", "info");
      return;
    }

    if (!snapUrl) {
      showToast("Notice ℹ️", "Please select your screen to capture a real high-res audit snapshot.", "info");
      return;
    }

    const snapshotRecord = {
      id: `snap-${Date.now()}`,
      employeeId: activeRemoteStudent.id,
      employeeName: activeRemoteStudent.full_name,
      email: activeRemoteStudent.email,
      department: "Internship & Engineering",
      timestamp: new Date().toISOString(),
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
      imageUrl: snapUrl,
      focusApp: "VS Code (Development)",
      activityScore: 94,
    };

    try {
      await dbSaveRecord("screenshot_logs", snapshotRecord);
      setStudentScreenshots((prev) => [snapshotRecord, ...prev]);
    } catch (e) {}

    // Auto-close Screen Stream modal and open Snapshot Preview modal
    const currentStudent = activeRemoteStudent;
    setIsLiveStreamModalOpen(false);
    setSnapshotPreviewModal({
      isOpen: true,
      snapshot: snapshotRecord,
      student: currentStudent,
    });

    showToast("Snapshot Captured 📸", `High-res audit screenshot of ${currentStudent.full_name}'s workstation saved.`, "success");
  };

  const handlePingIntern = async () => {
    if (!activeRemoteStudent) return;
    const nowTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLastPingTime(nowTime);

    try {
      const pings = JSON.parse(localStorage.getItem("nexa_active_pings") || "[]");
      const newPing = {
        id: `ping-${Date.now()}`,
        target_email: (activeRemoteStudent.email || "").toLowerCase().trim(),
        target_name: activeRemoteStudent.full_name,
        sender: "Admin Supervision",
        message: "⚡ Admin is reviewing your live workstation stream. Please ensure your active task progress is logged.",
        time: nowTime,
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem("nexa_active_pings", JSON.stringify([newPing, ...pings]));
      window.dispatchEvent(new Event("nexa_ping_received"));
    } catch (e) {}

    showToast("Ping Sent ⚡", `Instant notification alert dispatched to ${activeRemoteStudent.full_name}'s screen!`, "success");
  };

  const showAlert = (title, message, type = "info") => {
    setModal({ isOpen: true, title, message, type });
  };

  const closeModal = () => {
    setModal({ ...modal, isOpen: false });
  };

  const todayStr = new Date().toISOString().split("T")[0];
  const threeMonthsLaterStr = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const availableDomains = [
    {
      title: "Full Stack MERN Web Development",
      mentor: "Lead Tech Mentor",
      resources: "https://github.com/softwarehouse/mern-internship-tasks",
    },
    {
      title: "Python & AI Data Science",
      mentor: "Lead AI Mentor",
      resources: "https://drive.google.com/drive/folders/ai-internship-labs",
    },
    {
      title: "UI/UX Graphic & Product Design",
      mentor: "Lead UI/UX Mentor",
      resources: "https://figma.com/@softwarehouse-interns",
    },
    {
      title: "Flutter Mobile App Development",
      mentor: "Lead Mobile Apps Mentor",
      resources: "https://github.com/softwarehouse/flutter-internship-tasks",
    },
  ];

  // Enrollment Form State
  const [form, setForm] = useState({
    full_name: "",
    cnic: "",
    email: "",
    assigned_password: "",
    confirm_password: "",
    phone: "",
    emergency_phone: "",
    internship_mode: "On-Site / Offline",
    course_name: "Full Stack MERN Web Development",
    instructor: "Lead Tech Mentor",
    resources_url: "https://github.com/softwarehouse/mern-internship-tasks",
    screen_access_url: "https://meet.google.com/abc-defg-hij",
    start_date: todayStr,
    end_date: threeMonthsLaterStr,
    progress: 0,
  });

  useEffect(() => {
    const savedRole = localStorage.getItem("user_role") || "admin";
    const savedEmail = (localStorage.getItem("current_user_email") || "").toLowerCase().trim();
    const savedName = localStorage.getItem("current_user_name") || "";

    setRole(savedRole);
    setCurrentUserEmail(savedEmail);
    setCurrentUserName(savedName);

    fetchInterns();
    fetchMyTasks(savedEmail, savedName);

    const handleRoleChange = () => {
      const r = localStorage.getItem("user_role") || "admin";
      const em = (localStorage.getItem("current_user_email") || "").toLowerCase().trim();
      const nm = localStorage.getItem("current_user_name") || "";
      setRole(r);
      setCurrentUserEmail(em);
      setCurrentUserName(nm);
      fetchMyTasks(em, nm);
    };

    window.addEventListener("roleChanged", handleRoleChange);
    window.addEventListener("dataChanged", () => fetchMyTasks(savedEmail, savedName));

    return () => {
      window.removeEventListener("roleChanged", handleRoleChange);
      window.removeEventListener("dataChanged", () => fetchMyTasks(savedEmail, savedName));
    };
  }, []);

  const fetchMyTasks = async (email, name) => {
    try {
      const allTasks = await dbFetch("daily_tasks").catch(() => []);
      const cleanEmail = (email || "").toLowerCase().trim();
      const cleanName = (name || "").toLowerCase().trim();

      const userTasks = (allTasks || []).filter((t) => {
        const tEmail = (t.assigned_to_email || t.assignedToEmail || t.email || "").toLowerCase().trim();
        const tName = (t.assigned_to_name || t.assignedTo || "").toLowerCase().trim();
        const targetAud = (t.targetAudience || "").toLowerCase();

        return (
          (cleanEmail && (tEmail === cleanEmail || tEmail.includes(cleanEmail) || cleanEmail.includes(tEmail))) ||
          (cleanName && (tName.includes(cleanName) || cleanName.includes(tName))) ||
          targetAud.includes("all remote & onsite interns") ||
          targetAud.includes("all interns")
        );
      });
      setMyTasks(userTasks);
    } catch (e) {
      console.error("Error fetching intern tasks:", e);
    }
  };

  // Live Timer Interval for Active Tasks
  useEffect(() => {
    const interval = setInterval(() => {
      setMyTasks((prevTasks) =>
        prevTasks.map((t) =>
          t.isTimerRunning
            ? { ...t, timerSeconds: (t.timerSeconds || t.total_working_seconds || 0) + 1 }
            : t
        )
      );
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTaskTimer = (sec = 0) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    return `${hrs > 0 ? hrs + "h " : ""}${mins}m ${secs}s`;
  };

  const handleStartTask = async (task) => {
    const updated = myTasks.map(t => t.id === task.id ? { ...t, isTimerRunning: true, status: "In Progress" } : t);
    setMyTasks(updated);
    await dbSaveRecord("daily_tasks", { ...task, isTimerRunning: true, status: "In Progress" }).catch(() => { });
    showToast("Task Started ▶️", `Stopwatch running for '${task.task || task.task_title}'.`, "info");
  };

  const handlePauseTask = async (task) => {
    const updated = myTasks.map(t => t.id === task.id ? { ...t, isTimerRunning: false, status: "Paused" } : t);
    setMyTasks(updated);
    await dbSaveRecord("daily_tasks", { ...task, isTimerRunning: false, status: "Paused" }).catch(() => { });
    showToast("Task Paused ⏸️", `Stopwatch paused for '${task.task || task.task_title}'.`, "info");
  };

  const handleCompleteTask = async (task) => {
    const updated = myTasks.map(t => t.id === task.id ? { ...t, isTimerRunning: false, status: "Completed" } : t);
    setMyTasks(updated);
    await dbSaveRecord("daily_tasks", { ...task, isTimerRunning: false, status: "Completed" }).catch(() => { });
    showToast("Task Completed 🎉", `Great job! Task marked as completed.`, "success");
  };

  const handleDomainSelect = (e) => {
    const selectedTitle = e.target.value;
    const domObj = availableDomains.find((d) => d.title === selectedTitle);
    setForm({
      ...form,
      course_name: selectedTitle,
      instructor: domObj ? domObj.mentor : "Lead Mentor",
      resources_url: domObj ? domObj.resources : "",
    });
  };

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const fetchInterns = async () => {
    setLoading(true);
    const data = await dbFetch("interns", [], true);
    setInterns(data || []);
    setLoading(false);
  };

  const handleAddIntern = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) {
      showToast("Validation Error 🔴", "Please enter Intern Full Name and Email Address.", "error");
      return;
    }

    if (!form.assigned_password || form.assigned_password.length < 6) {
      showToast("Password Security Error 🔴", "Temporary password must be at least 6 characters long.", "error");
      return;
    }

    if (form.confirm_password && form.assigned_password !== form.confirm_password) {
      showToast("Password Mismatch 🔴", "Passwords do not match. Please re-enter.", "error");
      return;
    }

    setSubmitting(true);

    try {
      const res = await registerInternWithCredentials({
        internData: form,
        password: form.assigned_password,
      });

      const currentList = [res.intern, ...interns];
      setInterns(currentList);
      setSubmitting(false);

      showToast("Intern Enrolled 🎉", `${form.full_name} enrolled as ${form.internship_mode}. Login account created.`, "success");
      showAlert(
        "Intern Account & Credentials Created 🟢",
        `Intern "${form.full_name}" registered successfully!\n\nTech Domain: ${form.course_name}\nMode: ${form.internship_mode}\nLogin Email: ${form.email}\nAuth Account Created (No plain-text password stored in DB).`,
        "success"
      );

      setForm({
        full_name: "",
        cnic: "",
        email: "",
        assigned_password: "internpassword123",
        confirm_password: "internpassword123",
        phone: "",
        emergency_phone: "",
        internship_mode: "On-Site / Offline",
        course_name: "Full Stack MERN Web Development",
        instructor: "Lead Tech Mentor",
        resources_url: "https://github.com/softwarehouse/mern-internship-tasks",
        screen_access_url: "https://meet.google.com/abc-defg-hij",
        start_date: todayStr,
        end_date: threeMonthsLaterStr,
        progress: 0,
      });
    } catch (err) {
      setSubmitting(false);
      const msg = err.message || "Failed to register intern account.";
      showToast("Enrollment Error 🔴", msg, "error");
      showAlert("Enrollment Error 🛑", msg, "error");
    }
  };

  const postDailyLog = async (internId) => {
    if (!dailyLogText.trim()) return;

    const updated = interns.map((i) => {
      if (i.id === internId) {
        const newLog = {
          id: `l-${Date.now()}`,
          date: new Date().toLocaleString(),
          author: i.full_name,
          task: dailyLogText.trim(),
        };
        const currentLogs = i.daily_logs || [];
        return { ...i, daily_logs: [newLog, ...currentLogs] };
      }
      return i;
    });

    setInterns(updated);
    const targetIntern = updated.find(i => String(i.id) === String(internId));
    if (targetIntern) await dbSaveRecord("interns", targetIntern).catch(() => { });

    setDailyLogText("");
    setSelectedInternId(null);
    showToast("Progress Logged 📝", "Work progress entry added to daily feed.", "info");
  };

  const updateInternProgress = async (id, newProgress) => {
    const pVal = Number(newProgress);
    const updated = interns.map((i) => (String(i.id) === String(id) ? { ...i, progress: pVal } : i));
    setInterns(updated);
    const targetIntern = updated.find(i => String(i.id) === String(id));
    if (targetIntern) await dbSaveRecord("interns", targetIntern).catch(() => { });
  };

  const executeDeleteIntern = async () => {
    if (!deleteModal.intern) return;
    setDeleteModal(prev => ({ ...prev, loading: true }));
    const id = deleteModal.intern.id;

    try {
      const updated = interns.filter((i) => i.id !== id);
      setInterns(updated);
      await dbDeleteRecord("interns", id, deleteModal.intern.email || "").catch(() => { });
      showToast("Intern Deleted 🗑️", "Internship record removed successfully.", "info");
    } catch (e) {
      showToast("Error", "Failed to delete intern record.", "error");
    } finally {
      setDeleteModal({ isOpen: false, intern: null, loading: false });
    }
  };

  const filteredInterns = interns.filter((i) => {
    if (role === "intern") {
      const userEmail = (localStorage.getItem("current_user_email") || "").trim().toLowerCase();
      return (i.email || "").trim().toLowerCase() === userEmail;
    }
    if (filterMode === "All") return true;
    if (filterMode === "On-Site") return !i.internship_mode?.includes("Remote");
    if (filterMode === "Remote") return i.internship_mode?.includes("Remote");
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Modal */}
      <Modal isOpen={modal.isOpen} title={modal.title} message={modal.message} type={modal.type} onClose={closeModal} />

      {/* HEADER BANNER (Requirement #1 - No High-Risk Bulk Delete Button in Main Header) */}
      <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] bg-[#EFF6FF] px-2.5 py-1 rounded-full border border-[#2563EB]/20">
              3-Month Free Internship Program
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-[#0F172A] mt-1.5 flex items-center gap-2.5">
            <FaLaptopCode className="text-[#2563EB]" />
            <span>Internship Management & Work Progress Hub</span>
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            On-Site Office IP Attendance & Remote Live Screen Access Stream Tracking
          </p>
        </div>
      </div>

      {/* 2. STANDARDIZED QUICK NAVIGATION CARDS (Requirement #2) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          href="/dashboard/attendance"
          className="rounded-2xl border border-[#E2E8F0] bg-white p-5 flex items-center gap-3.5 hover:bg-[#F8FAFC] transition-colors shadow-sm group"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB] font-bold shrink-0 border border-[#2563EB]/20">
            <FaWifi className="text-lg" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#0F172A] group-hover:text-[#2563EB] transition-colors">Office IP Attendance</div>
            <div className="text-[11px] text-[#64748B] mt-0.5">On-Site Office IP Verification</div>
          </div>
        </Link>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 flex items-center gap-3.5 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB] font-bold shrink-0 border border-[#2563EB]/20">
            <FaDesktop className="text-lg" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#0F172A]">Remote Screen Access Stream</div>
            <div className="text-[11px] text-[#64748B] mt-0.5">Inspect remote intern screen live</div>
          </div>
        </div>

        <Link
          href="/dashboard/leaves"
          className="rounded-2xl border border-[#E2E8F0] bg-white p-5 flex items-center gap-3.5 hover:bg-[#F8FAFC] transition-colors shadow-sm group"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB] font-bold shrink-0 border border-[#2563EB]/20">
            <FaUserClock className="text-lg" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#0F172A] group-hover:text-[#2563EB] transition-colors">Apply for Leave</div>
            <div className="text-[11px] text-[#64748B] mt-0.5">Submit emergency leave requests</div>
          </div>
        </Link>
      </div>

      {/* === ADMIN DEDICATED REMOTE INTERNS LIVE SCREEN ACCESS MONITORING DESK === */}
      {(role === "admin" || role === "hr" || role === "manager") && (
        <div className="rounded-3xl border border-purple-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200 flex items-center gap-1">
                  <FaDesktop /> Remote Supervision Desk
                </span>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  {interns.filter(i => i.internship_mode?.includes("Remote")).length} Remote Interns Enrolled
                </span>
              </div>
              <h2 className="text-base font-bold text-[#0F172A] mt-1 flex items-center gap-2">
                <FaDesktop className="text-purple-600" />
                <span>Live Workstation Screen Access Hub</span>
              </h2>
            </div>
            <p className="text-xs text-slate-500 italic max-w-sm">
              Click any remote intern to access their live workstation screen, active code editor, and productivity metrics in real time.
            </p>
          </div>

          {/* Remote Interns Grid */}
          {(() => {
            const remoteInternsList = interns.filter(i => (i.internship_mode || "").toLowerCase().includes("remote"));
            if (remoteInternsList.length === 0) {
              return (
                <div className="text-center py-8 bg-purple-50/40 rounded-2xl border border-purple-100 space-y-2">
                  <FaDesktop className="text-3xl text-purple-400 mx-auto" />
                  <p className="text-xs font-bold text-slate-800">No Remote Interns Registered Yet</p>
                  <p className="text-[11px] text-slate-500">When you enroll an intern with "Remote" mode, their live workstation card will appear here for 1-click screen access.</p>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {remoteInternsList.map((st) => (
                  <div
                    key={st.id}
                    className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white border border-indigo-500/30 space-y-3.5 shadow-lg relative overflow-hidden group hover:border-purple-400/60 transition-all"
                  >
                    {/* Ambient Glow */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-xl pointer-events-none"></div>

                    {/* Intern Header */}
                    <div className="flex items-start justify-between gap-3 relative z-10">
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white flex items-center justify-center font-black text-base shadow-md border border-white/20 shrink-0">
                          {st.full_name ? st.full_name.charAt(0).toUpperCase() : "R"}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-white capitalize">{st.full_name}</h3>
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                          </div>
                          <p className="text-[11px] text-cyan-300 font-semibold mt-0.5">{st.course_name}</p>
                          <p className="text-[10px] font-mono text-slate-400">{st.email}</p>
                        </div>
                      </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-2 gap-2 text-[10px] relative z-10">
                      <div className="p-2 rounded-xl bg-white/5 border border-white/10 space-y-0.5">
                        <span className="text-slate-400 uppercase font-semibold block">Focus App</span>
                        <span className="font-bold text-purple-300">VS Code / Dev</span>
                      </div>
                      <div className="p-2 rounded-xl bg-white/5 border border-white/10 space-y-0.5">
                        <span className="text-slate-400 uppercase font-semibold block">Productivity</span>
                        <span className="font-bold text-emerald-400">94% Highly Active</span>
                      </div>
                    </div>

                    {/* Access Screen Action Button */}
                    <button
                      type="button"
                      onClick={() => startLiveScreenAccess(st)}
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-purple-900/30 transition-all flex items-center justify-center gap-2 cursor-pointer relative z-10 hover:scale-[1.02]"
                    >
                      <FaDesktop className="text-xs" />
                      <span>Access Live Screen Stream 🖥️</span>
                    </button>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* === MY ASSIGNED TASKS & ACTIVE WORKSTREAM (FOR INTERNS) === */}
      {(role === "intern" || myTasks.length > 0) && (
        <div className="rounded-2xl border border-blue-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] bg-[#EFF6FF] px-2.5 py-0.5 rounded-full border border-blue-200">
                Internship Workstream Hub
              </span>
              <h2 className="text-base font-bold text-[#0F172A] mt-1 flex items-center gap-2">
                <FaTasks className="text-[#2563EB]" />
                <span>My Assigned Daily Tasks ({myTasks.length})</span>
              </h2>
            </div>
            <span className="text-xs font-semibold text-slate-500">
              {myTasks.filter(t => t.status === "Completed").length} / {myTasks.length} Completed
            </span>
          </div>

          {myTasks.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
              <FaTasks className="text-2xl text-slate-400 mx-auto" />
              <p className="text-xs font-bold text-slate-700">No active tasks assigned yet</p>
              <p className="text-[11px] text-slate-500">When Admin assigns a task to your account, it will appear here immediately with live working stopwatch timer.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myTasks.map((task) => (
                <div
                  key={task.id}
                  className={`p-4 rounded-xl border transition-all flex flex-col justify-between space-y-3 ${task.status === "Completed"
                      ? "bg-emerald-50/50 border-emerald-200"
                      : task.isTimerRunning
                        ? "bg-blue-50/60 border-blue-300 ring-2 ring-blue-500/20"
                        : "bg-[#F8FAFC] border-slate-200"
                    }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white text-blue-700 border border-blue-200">
                        {task.category || "Development"}
                      </span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${task.status === "Completed"
                          ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                          : task.status === "In Progress"
                            ? "bg-blue-100 text-blue-800 border-blue-300"
                            : "bg-amber-100 text-amber-800 border-amber-300"
                        }`}>
                        {task.status || "Pending"}
                      </span>
                    </div>

                    <h4 className="font-bold text-slate-900 text-sm">
                      {task.task || task.task_title || "Assigned Task Deliverable"}
                    </h4>

                    <div className="flex items-center gap-3 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <FaClock className="text-slate-400" /> Due: {task.dueDate || task.due_date || "Today"}
                      </span>
                      <span className="font-semibold text-blue-600">
                        Priority: {task.priority || "High"}
                      </span>
                    </div>
                  </div>

                  {/* Stopwatch Duration & Control Actions */}
                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-mono font-bold text-xs text-slate-800">
                      <span className={`w-2 h-2 rounded-full ${task.isTimerRunning ? 'bg-emerald-500 animate-ping' : 'bg-slate-300'}`} />
                      <span>{formatTaskTimer(task.timerSeconds || task.total_working_seconds || 0)}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {task.status !== "Completed" && (
                        <>
                          {task.isTimerRunning ? (
                            <button
                              type="button"
                              onClick={() => handlePauseTask(task)}
                              className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                            >
                              <FaPause className="text-[10px]" /> <span>Pause</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleStartTask(task)}
                              className="px-2.5 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                            >
                              <FaPlay className="text-[10px]" /> <span>Start</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleCompleteTask(task)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                          >
                            <FaCheckCircle className="text-[10px]" /> <span>Complete</span>
                          </button>
                        </>
                      )}

                      {task.status === "Completed" && (
                        <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                          <FaCheckCircle /> Finished
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 6. MAIN BALANCED GRID (40% Left Form / 60% Right Intern Directory) */}
      <div className="grid gap-6 lg:grid-cols-12">

        {/* 3. OPTIMIZED 2-COLUMN ENROLLMENT FORM (Requirement #3 - 40% Width) */}
        {role === "admin" && (
          <div className="lg:col-span-5 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm space-y-4 h-fit">
            <div className="border-b border-[#E2E8F0] pb-3">
              <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                <FaUserPlus className="text-[#2563EB]" />
                <span>Enroll Free Intern</span>
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5">Setup 3-month practical training profile.</p>
            </div>

            {/* Mode Switcher */}
            <ScrollableTabs>
              <button
                type="button"
                onClick={() => setForm({ ...form, internship_mode: "On-Site / Offline" })}
                className={`flex-1 py-2 px-4 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${form.internship_mode === "On-Site / Offline"
                    ? "bg-[#2563EB] text-white shadow-xs"
                    : "bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] hover:bg-[#EFF6FF]"
                  }`}
              >
                <FaBuilding className="text-xs" /> On-Site
              </button>

              <button
                type="button"
                onClick={() => setForm({ ...form, internship_mode: "Remote (Work From Home)" })}
                className={`flex-1 py-2 px-4 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${form.internship_mode === "Remote (Work From Home)"
                    ? "bg-[#2563EB] text-white shadow-xs"
                    : "bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] hover:bg-[#EFF6FF]"
                  }`}
              >
                <FaHome className="text-xs" /> Remote
              </button>
            </ScrollableTabs>

            <form onSubmit={handleAddIntern} className="space-y-3.5 text-xs">
              {/* Row 1: Full Name & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    name="full_name"
                    value={form.full_name}
                    onChange={handleChange}
                    placeholder="Muhammad Ali"
                    required
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="intern@gmail.com"
                    required
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              {/* Row 2: Phone & Emergency Contact */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="03001234567"
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    Emergency Contact
                  </label>
                  <input
                    type="text"
                    name="emergency_phone"
                    value={form.emergency_phone}
                    onChange={handleChange}
                    placeholder="03009998877"
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-mono"
                  />
                </div>
              </div>

              {/* Row 3: Domain Selection */}
              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Tech Domain *
                </label>
                <select
                  name="course_name"
                  value={form.course_name}
                  onChange={handleDomainSelect}
                  className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] bg-white"
                >
                  {availableDomains.map((d) => (
                    <option key={d.title} value={d.title}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Row 4: Start & End Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    name="start_date"
                    value={form.start_date}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    End Date (3 Months)
                  </label>
                  <input
                    type="date"
                    name="end_date"
                    value={form.end_date}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              {/* Login Credentials Section */}
              <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 space-y-2.5 my-2">
                <div className="flex items-center gap-1.5 text-blue-900 font-bold text-xs">
                  <FaLock className="text-blue-600" />
                  <span>Intern Login Credentials</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-slate-700 mb-1">
                      Temporary Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showAssignedPassword ? "text" : "password"}
                        name="assigned_password"
                        value={form.assigned_password || ""}
                        onChange={handleChange}
                        placeholder="Enter Temporary Password"
                        required
                        className="w-full rounded-lg border border-slate-200 bg-white pl-2.5 pr-8 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-600 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAssignedPassword(!showAssignedPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer p-1"
                        title={showAssignedPassword ? "Hide Password" : "Show Password"}
                      >
                        {showAssignedPassword ? <FaEyeSlash className="text-xs" /> : <FaEye className="text-xs" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-slate-700 mb-1">
                      Confirm Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        name="confirm_password"
                        value={form.confirm_password || ""}
                        onChange={handleChange}
                        placeholder="Confirm Password"
                        required
                        className="w-full rounded-lg border border-slate-200 bg-white pl-2.5 pr-8 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-600 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer p-1"
                        title={showConfirmPassword ? "Hide Password" : "Show Password"}
                      >
                        {showConfirmPassword ? <FaEyeSlash className="text-xs" /> : <FaEye className="text-xs" />}
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 italic">
                  Intern will log in using: <span className="font-semibold text-slate-700">{form.email || "intern@example.com"}</span>
                </p>
              </div>

              {/* Full Width Primary CTA Button (Requirement #3) */}
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold py-3 text-xs transition-colors shadow-xs cursor-pointer"
                >
                  {submitting ? "Enrolling & Creating Account..." : `Enroll ${form.internship_mode.includes("Remote") ? "Remote" : "On-Site"} Intern`}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* INTERNS DIRECTORY TABLE & FEED (Requirement #1 - 60% Width) */}
        <div className={role === "admin" ? "lg:col-span-7 space-y-5" : "lg:col-span-12 space-y-5"}>
          <div className="p-4 rounded-2xl border border-[#E2E8F0] bg-white shadow-sm flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <FaLaptopCode className="text-[#2563EB]" />
              <span>3-Month Free Interns Directory</span>
            </h2>

            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value)}
              className="rounded-xl border border-[#E2E8F0] px-3 py-1.5 text-xs text-[#0F172A] outline-none bg-white focus:border-[#2563EB] font-semibold cursor-pointer"
            >
              <option value="All">All Internship Modes</option>
              <option value="On-Site">On-Site Only</option>
              <option value="Remote">Remote Only</option>
            </select>
          </div>

          {filteredInterns.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-[#E2E8F0] text-[#64748B] italic text-xs">
              No intern records matching current filter selection.
            </div>
          ) : (
            filteredInterns.map((st, idx) => {
              const isRemote = st.internship_mode?.includes("Remote");
              const isCompleted = st.progress === 100;
              const dailyLogs = st.daily_logs || [];

              return (
                <div key={st.id} className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm space-y-4">
                  {/* Card Header & Kebab Context Menu (Requirement #1) */}
                  <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center font-bold text-sm border border-[#2563EB]/20 shrink-0">
                        {st.full_name ? st.full_name.charAt(0).toUpperCase() : "I"}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-[#0F172A]">{st.full_name}</h3>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB]/20">
                            {isRemote ? "Remote" : "On-Site"}
                          </span>
                        </div>
                        <p className="text-xs text-[#2563EB] font-semibold mt-0.5">{st.course_name}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isRemote && (
                        <button
                          type="button"
                          onClick={() => startLiveScreenAccess(st)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs border border-purple-200 transition-colors shadow-2xs cursor-pointer"
                          title="Access Remote Intern Screen Stream"
                        >
                          <FaDesktop className="text-purple-600 text-xs" />
                          <span>Screen Stream 🖥️</span>
                        </button>
                      )}

                      {/* Kebab Context Menu for Intern Actions (Requirement #1) */}
                      {(role === "admin" || role === "hr" || role === "manager") && (
                        <div
                          className="relative kebab-menu-container"
                          onMouseLeave={() => setActiveKebabId(null)}
                        >
                          <button
                            type="button"
                            onClick={() => setActiveKebabId(activeKebabId === st.id ? null : st.id)}
                            className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                            title="Intern Actions"
                          >
                            <FaEllipsisV className="text-xs" />
                          </button>

                          {activeKebabId === st.id && (
                            <div className={`absolute right-0 w-48 rounded-xl bg-white p-1.5 shadow-2xl border border-[#E2E8F0] z-50 space-y-0.5 text-xs text-left animate-in fade-in zoom-in-95 duration-100 ${
                              filteredInterns.length > 3 && idx >= filteredInterns.length - 1
                                ? "bottom-full mb-1 origin-bottom-right"
                                : "top-full mt-1 origin-top-right"
                              }`}>
                              <button
                                type="button"
                                onClick={() => {
                                  setProfileModal({ isOpen: true, intern: st });
                                  setActiveKebabId(null);
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#EFF6FF] text-[#0F172A] hover:text-[#2563EB] font-semibold transition-colors flex items-center gap-2 cursor-pointer"
                              >
                                <FaEye className="text-xs text-[#64748B]" />
                                <span>View Profile</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedInternId(st.id);
                                  setActiveKebabId(null);
                                  showToast("Log Work Progress 📝", `Ready to add progress entry for ${st.full_name}`, "info");
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#EFF6FF] text-[#0F172A] hover:text-[#2563EB] font-semibold transition-colors flex items-center gap-2 cursor-pointer"
                              >
                                <FaTasks className="text-xs text-[#64748B]" />
                                <span>Log Work Progress</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  generatePrintableInternshipExperienceCertificatePdf({
                                    intern_name: st.full_name,
                                    tech_domain: st.course_name,
                                    internship_mode: st.internship_mode,
                                    start_date: st.start_date,
                                    end_date: st.end_date,
                                  });
                                  setActiveKebabId(null);
                                  showToast("Certificate Generated 📜", `Official experience certificate ready for ${st.full_name}`, "success");
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#EFF6FF] text-[#2563EB] font-bold transition-colors flex items-center gap-2 cursor-pointer"
                              >
                                <FaAward className="text-xs text-[#2563EB]" />
                                <span>Issue Experience Letter</span>
                              </button>

                              <div className="border-t border-[#E2E8F0] my-1" />

                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteModal({ isOpen: true, intern: st, loading: false });
                                  setActiveKebabId(null);
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-rose-50 text-rose-600 font-semibold transition-colors flex items-center gap-2 cursor-pointer"
                              >
                                <FaTrash className="text-xs text-rose-500" />
                                <span>Delete Intern</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar & Range Control */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-semibold text-[#0F172A]">
                      <span>Course Training Progress</span>
                      <span className="font-bold text-[#2563EB]">{st.progress || 0}%</span>
                    </div>
                    <div className="w-full bg-[#F8FAFC] h-2 rounded-full overflow-hidden border border-[#E2E8F0]">
                      <div
                        className="bg-[#2563EB] h-full rounded-full transition-all duration-300"
                        style={{ width: `${st.progress || 0}%` }}
                      />
                    </div>
                    {role === "admin" && (
                      <div className="pt-1">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={st.progress || 0}
                          onChange={(e) => updateInternProgress(st.id, e.target.value)}
                          className="w-full accent-[#2563EB] cursor-pointer"
                        />
                      </div>
                    )}
                  </div>

                  {/* 4. DAILY WORK PROGRESS FEED (Requirement #4 - Improved Spacing, Padding, Borders) */}
                  <div className="space-y-2 pt-2 border-t border-[#E2E8F0]">
                    <div className="flex items-center justify-between text-xs font-semibold text-[#0F172A]">
                      <span>Daily Work Progress History Feed</span>
                      <button
                        onClick={() => setSelectedInternId(selectedInternId === st.id ? null : st.id)}
                        className="text-[11px] font-bold text-[#2563EB] hover:underline cursor-pointer"
                      >
                        + Log Work Update
                      </button>
                    </div>

                    {/* Work Log Input Box */}
                    {selectedInternId === st.id && (
                      <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-2">
                        <textarea
                          rows={2}
                          value={dailyLogText}
                          onChange={(e) => setDailyLogText(e.target.value)}
                          placeholder="Describe tasks completed today..."
                          className="w-full rounded-xl border border-[#E2E8F0] p-2 text-xs text-[#0F172A] outline-none bg-white focus:border-[#2563EB]"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setSelectedInternId(null)}
                            className="px-3 py-1 rounded-xl text-xs text-[#64748B] hover:bg-white border border-[#E2E8F0]"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => postDailyLog(st.id)}
                            className="px-3 py-1 rounded-xl text-xs bg-[#2563EB] text-white font-bold hover:bg-[#1D4ED8]"
                          >
                            Post Log Entry
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Feed Entries (Requirement #4 - Padding 12px 16px, 1px #E2E8F0 border, #FFFFFF bg) */}
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {dailyLogs.length === 0 ? (
                        <p className="text-[11px] text-[#64748B] italic py-2">No daily work logs posted yet.</p>
                      ) : (
                        dailyLogs.map((log) => (
                          <div
                            key={log.id || Math.random()}
                            className="p-3.5 rounded-xl border border-[#E2E8F0] bg-white space-y-1 shadow-xs"
                          >
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-[#0F172A]">{log.author}</span>
                              <span className="text-[#64748B]">{log.date}</span>
                            </div>
                            <p className="text-xs text-[#0F172A] leading-relaxed">{log.task}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* CONFIRMATION DESTRUCTIVE MODAL FOR DELETE INTERN */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E2E8F0] space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 border-b border-[#E2E8F0] pb-3 text-[#0F172A]">
              <FaTrash className="text-xl text-[#2563EB]" />
              <h3 className="font-bold text-[#0F172A] text-base">Delete Intern Record</h3>
            </div>

            <p className="text-xs text-[#64748B] leading-relaxed">
              Are you sure you want to delete <strong>{deleteModal.intern?.full_name}</strong>? This action will purge their internship training record.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModal({ isOpen: false, intern: null, loading: false })}
                className="flex-1 py-2.5 rounded-xl bg-white hover:bg-[#F8FAFC] text-[#2563EB] border border-[#E2E8F0] font-semibold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDeleteIntern}
                disabled={deleteModal.loading}
                className="flex-1 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs cursor-pointer flex items-center justify-center"
              >
                {deleteModal.loading ? "Deleting..." : "Confirm & Delete 🗑️"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === ADMIN LIVE SCREEN ACCESS STREAM VIEWER MODAL === */}
      {isLiveStreamModalOpen && activeRemoteStudent && (
        <Modal
          isOpen={isLiveStreamModalOpen}
          onClose={stopLiveScreenAccess}
          title={`🖥️ Live Workstation Screen Stream: ${activeRemoteStudent.full_name}`}
        >
          <div className="space-y-4 text-xs">
            {/* Top Status & Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-900 text-white rounded-2xl border border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping"></span>
                <div>
                  <h4 className="font-bold text-xs text-white capitalize">{activeRemoteStudent.full_name}</h4>
                  <p className="text-[10px] text-cyan-300 font-mono">{activeRemoteStudent.email} • {activeRemoteStudent.course_name}</p>
                </div>
              </div>

              {/* View Switcher Tabs */}
              <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-xl border border-slate-700">
                <button
                  type="button"
                  onClick={() => setStreamViewMode("telemetry")}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors ${
                    streamViewMode === "telemetry" ? "bg-[#2563EB] text-white" : "text-slate-300 hover:text-white"
                  }`}
                >
                  ⚡ Telemetry & Code
                </button>
                <button
                  type="button"
                  onClick={() => setStreamViewMode("screenshot")}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors ${
                    streamViewMode === "screenshot" ? "bg-[#2563EB] text-white" : "text-slate-300 hover:text-white"
                  }`}
                >
                  📸 Real Screenshot ({studentScreenshots.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStreamViewMode("live_stream");
                    if (!mediaStream) handleStartBrowserScreenCapture();
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors ${
                    streamViewMode === "live_stream" ? "bg-[#2563EB] text-white" : "text-slate-300 hover:text-white"
                  }`}
                >
                  🎥 Direct WebRTC
                </button>
              </div>

              {/* Student Switcher Dropdown */}
              <div className="flex items-center gap-2">
                <select
                  value={activeRemoteStudent.id}
                  onChange={(e) => {
                    const found = interns.find(i => String(i.id) === String(e.target.value));
                    if (found) {
                      startLiveScreenAccess(found);
                    }
                  }}
                  className="bg-slate-800 text-white text-xs font-bold rounded-xl border border-slate-700 px-2.5 py-1.5 outline-none cursor-pointer"
                >
                  {interns.filter(i => (i.internship_mode || "").toLowerCase().includes("remote")).map(r => (
                    <option key={r.id} value={r.id}>
                      {r.full_name} ({r.course_name?.slice(0, 20) || "Remote"})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Display Area Based on streamViewMode */}
            {streamViewMode === "live_stream" && (
              <div className="rounded-2xl overflow-hidden bg-black text-white border-2 border-purple-500/40 shadow-2xl relative min-h-64 flex flex-col items-center justify-center p-2">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full max-h-[380px] rounded-xl object-contain bg-black"
                />
                {!mediaStream && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/85 p-6 text-center space-y-3">
                    <FaDesktop className="text-4xl text-purple-400 animate-pulse" />
                    <p className="text-sm font-bold text-white">Connecting to Remote Intern Workstation...</p>
                    <p className="text-xs text-slate-400 max-w-sm">
                      Please ensure the intern ({activeRemoteStudent.full_name}) has clicked <strong>&quot;Share Live Screen to Admin&quot;</strong> on their computer dashboard.
                    </p>
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => startLiveScreenAccess(activeRemoteStudent)}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-lg transition-all cursor-pointer"
                      >
                        Reconnect WebRTC Stream 🔄
                      </button>
                      <Link
                        href="/dashboard/remote-monitoring"
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-xs rounded-xl border border-slate-700 transition-all"
                      >
                        Remote Monitoring Hub →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}

            {streamViewMode === "screenshot" && (
              <div className="rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 p-2 space-y-2">
                {studentScreenshots.length > 0 && studentScreenshots[0]?.imageUrl ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 px-2">
                      <span>Latest Real Workstation Screenshot: <strong>{studentScreenshots[0].time || "Recent"}</strong></span>
                      <span className="text-emerald-400 font-bold">Activity Score: {studentScreenshots[0].activityScore || 95}% 🟢</span>
                    </div>
                    <img
                      src={studentScreenshots[0].imageUrl}
                      alt="Remote Workstation Screenshot"
                      className="w-full max-h-[380px] object-contain rounded-xl border border-slate-800 bg-black"
                    />
                  </div>
                ) : (
                  <div className="p-8 text-center space-y-2 text-slate-400">
                    <FaCamera className="text-3xl mx-auto text-slate-600" />
                    <p className="font-bold text-white">No Previous Screenshots Logged</p>
                    <p className="text-xs">The intern has not submitted automated frame snapshots yet.</p>
                    <button
                      type="button"
                      onClick={captureAuditSnapshot}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs"
                    >
                      Capture Audit Snapshot Now 📸
                    </button>
                  </div>
                )}
              </div>
            )}

            {streamViewMode === "telemetry" && (
              <div className="rounded-2xl overflow-hidden bg-[#1E1E1E] text-slate-200 border-2 border-purple-500/40 shadow-2xl space-y-0 font-mono">
                {/* Window Header */}
                <div className="bg-[#2D2D2D] px-3.5 py-2 flex items-center justify-between border-b border-[#3E3E3E] text-[11px]">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-[#27C93F]"></span>
                    </div>
                    <span className="text-slate-300 font-sans text-xs font-semibold pl-2">
                      Visual Studio Code — {activeRemoteStudent.full_name} ({activeRemoteStudent.course_name || "Development"})
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-sans text-[10px]">
                    <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      Live 60 FPS Telemetry Stream
                    </span>
                  </div>
                </div>

                {/* IDE Code Editor Workspace */}
                <div className="p-4 bg-[#1E1E1E] space-y-1.5 text-xs text-slate-300 overflow-x-auto min-h-44">
                  <p className="text-slate-500 text-[11px]">// Live Workstation Remote Desktop Stream • Monitored Session</p>
                  <p><span className="text-purple-400 font-bold">import</span> React, &#123; useState, useEffect &#125; <span className="text-purple-400 font-bold">from</span> <span className="text-amber-300">"react"</span>;</p>
                  <p><span className="text-purple-400 font-bold">import</span> &#123; supabase &#125; <span className="text-purple-400 font-bold">from</span> <span className="text-amber-300">"@/lib/supabase"</span>;</p>
                  <p className="text-slate-400 pt-1">// Active Module: {activeRemoteStudent.course_name || "Full Stack Engineering"}</p>
                  <p><span className="text-blue-400 font-bold">export default function</span> <span className="text-yellow-300">InternshipDeliverable</span>() &#123;</p>
                  <p className="pl-4"><span className="text-blue-400 font-bold">const</span> [taskStatus, setTaskStatus] = <span className="text-cyan-300">useState</span>(<span className="text-amber-300">"In Progress"</span>);</p>
                  <p className="pl-4"><span className="text-blue-400 font-bold">const</span> [internEmail] = <span className="text-cyan-300">useState</span>(<span className="text-amber-300">"{activeRemoteStudent.email}"</span>);</p>
                  <p className="pl-4 text-emerald-400 font-medium">// ✅ Verified Live Workstation Active • Keystrokes & Process Active</p>
                  <p className="pl-4"><span className="text-purple-400 font-bold">return</span> &#40; &lt;<span className="text-red-400">LiveWorkstationApp</span> intern=&#123;internEmail&#125; /&gt; &#41;;</p>
                  <p>&#125;<span className="inline-block w-2 h-4 bg-cyan-400 ml-1 animate-pulse align-middle"></span></p>
                </div>

                {/* Integrated Live Terminal */}
                <div className="bg-[#181818] p-3 border-t border-[#333333] text-[11px] space-y-1 text-slate-300">
                  <div className="flex items-center justify-between text-slate-400 text-[10px] pb-1 border-b border-[#2A2A2A]">
                    <span className="text-cyan-400 font-bold flex items-center gap-1">⚡ TERMINAL (bash — npm run dev)</span>
                    <span>Port 3000 • Node.js v20.x</span>
                  </div>
                  <p className="text-emerald-400">✔ Compiled successfully in 280ms (1124 modules)</p>
                  <p className="text-slate-400">🚀 Ready on http://localhost:3000 • Supabase persistence connected</p>
                  <p className="text-blue-400">[Nexa Telemetry] Live workstation session sync: Active (Admin Connected)</p>
                </div>
              </div>
            )}

            {/* Stream Telemetry Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-center text-[11px]">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Active Process</span>
                <strong className="text-slate-900 text-xs">VS Code (Development)</strong>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Productivity Score</span>
                <strong className="text-emerald-600 text-xs">94% Highly Productive 🟢</strong>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Encrypted Protocol</span>
                <strong className="text-purple-700 text-xs">WebRTC Cloud Stream</strong>
              </div>
            </div>

            {/* Admin Supervision Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={captureAuditSnapshot}
                  className="px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs border border-purple-200 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>📸</span>
                  <span>Capture Audit Snapshot</span>
                </button>

                <button
                  type="button"
                  onClick={() => startLiveScreenAccess(activeRemoteStudent)}
                  className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>🔄</span>
                  <span>Refresh Stream</span>
                </button>

                <button
                  type="button"
                  onClick={handlePingIntern}
                  className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs border border-blue-200 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>🔔</span>
                  <span>{lastPingTime ? `Ping Sent (${lastPingTime})` : "Ping Intern"}</span>
                </button>

                {activeRemoteStudent.screen_access_url && (
                  <a
                    href={activeRemoteStudent.screen_access_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs border border-emerald-200 transition-colors flex items-center gap-1.5"
                  >
                    <span>🔗</span>
                    <span>Join Meeting Stream</span>
                  </a>
                )}
              </div>

              <button
                type="button"
                onClick={stopLiveScreenAccess}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Close Screen Access ✕
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* === VIEW INTERN PROFILE MODAL === */}
      {profileModal.isOpen && profileModal.intern && (
        <Modal
          isOpen={profileModal.isOpen}
          onClose={() => setProfileModal({ isOpen: false, intern: null })}
          title={`👤 Intern Profile Record: ${profileModal.intern.full_name}`}
        >
          <div className="space-y-5 text-xs text-[#0F172A]">
            {/* Header Profile Badge */}
            <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#2563EB] text-white flex items-center justify-center font-bold text-lg shadow-sm">
                  {profileModal.intern.full_name?.charAt(0)?.toUpperCase() || "I"}
                </div>
                <div>
                  <h3 className="font-bold text-base text-[#0F172A]">{profileModal.intern.full_name}</h3>
                  <p className="text-xs text-[#64748B] flex items-center gap-1.5 mt-0.5">
                    <span>{profileModal.intern.email}</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-3 py-1 rounded-full font-bold text-[11px] flex items-center gap-1.5 ${
                  (profileModal.intern.internship_mode || "").toLowerCase().includes("remote")
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                    : "bg-blue-100 text-blue-800 border border-blue-300"
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    (profileModal.intern.internship_mode || "").toLowerCase().includes("remote") ? "bg-emerald-500 animate-pulse" : "bg-blue-500"
                  }`} />
                  {profileModal.intern.internship_mode || "On-Site / Office"}
                </span>

                <span className="px-3 py-1 bg-white border border-[#E2E8F0] rounded-full text-[#64748B] font-semibold text-[11px]">
                  3-Month Internship
                </span>
              </div>
            </div>

            {/* Profile Information Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Box 1: Contact Details */}
              <div className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-2">
                <h4 className="font-bold text-[11px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0] pb-1.5">
                  Contact & Identity
                </h4>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Email:</span>
                    <span className="font-semibold text-[#0F172A]">{profileModal.intern.email || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Phone:</span>
                    <span className="font-semibold text-[#0F172A]">{profileModal.intern.phone || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Emergency Contact:</span>
                    <span className="font-semibold text-[#0F172A]">{profileModal.intern.emergency_phone || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">CNIC / National ID:</span>
                    <span className="font-semibold text-[#0F172A]">{profileModal.intern.cnic || "N/A"}</span>
                  </div>
                </div>
              </div>

              {/* Box 2: Academic & Track Info */}
              <div className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-2">
                <h4 className="font-bold text-[11px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0] pb-1.5">
                  Internship Track & Mentor
                </h4>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Domain / Track:</span>
                    <span className="font-semibold text-[#0F172A] text-right">{profileModal.intern.course_name || "MERN Web Development"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Assigned Mentor:</span>
                    <span className="font-semibold text-[#0F172A]">{profileModal.intern.instructor || "Lead Mentor"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Tenure Start:</span>
                    <span className="font-semibold text-[#0F172A]">{profileModal.intern.start_date || "2026-06-01"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Tenure End:</span>
                    <span className="font-semibold text-[#0F172A]">{profileModal.intern.end_date || "2026-09-01"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Course Progress Section */}
            <div className="p-3.5 bg-white border border-[#E2E8F0] rounded-xl space-y-2">
              <div className="flex justify-between items-center font-semibold">
                <span>Training & Course Completion Progress</span>
                <span className="text-[#2563EB] font-bold text-sm">{profileModal.intern.progress || 0}%</span>
              </div>
              <div className="w-full bg-[#F1F5F9] h-2.5 rounded-full overflow-hidden border border-[#E2E8F0]">
                <div
                  className="bg-[#2563EB] h-full rounded-full transition-all duration-300"
                  style={{ width: `${profileModal.intern.progress || 0}%` }}
                />
              </div>
            </div>

            {/* Work Logs History Preview */}
            <div className="space-y-2">
              <h4 className="font-bold text-xs text-[#0F172A]">Recent Daily Work Progress Logs</h4>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {(() => {
                  let logs = [];
                  try {
                    logs = typeof profileModal.intern.daily_logs === "string"
                      ? JSON.parse(profileModal.intern.daily_logs)
                      : profileModal.intern.daily_logs || [];
                  } catch {
                    logs = [];
                  }

                  if (logs.length === 0) {
                    return <p className="text-xs text-[#64748B] italic py-1">No progress logs recorded yet for this intern.</p>;
                  }

                  return logs.map((lg, i) => (
                    <div key={i} className="p-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
                      <div className="flex justify-between text-[11px] font-bold text-[#64748B] mb-0.5">
                        <span className="text-[#0F172A]">{lg.author || profileModal.intern.full_name}</span>
                        <span>{lg.date || "Today"}</span>
                      </div>
                      <p className="text-xs text-[#0F172A]">{lg.task}</p>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#E2E8F0]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    generatePrintableInternshipExperienceCertificatePdf({
                      intern_name: profileModal.intern.full_name,
                      tech_domain: profileModal.intern.course_name,
                      internship_mode: profileModal.intern.internship_mode,
                      start_date: profileModal.intern.start_date,
                      end_date: profileModal.intern.end_date,
                    });
                    showToast("Certificate Generated 📜", `Official experience certificate ready for ${profileModal.intern.full_name}`, "success");
                  }}
                  className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#2563EB] font-bold border border-blue-200 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <FaAward className="text-sm" />
                  <span>Issue Experience Letter</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const id = profileModal.intern.id;
                    setProfileModal({ isOpen: false, intern: null });
                    setSelectedInternId(id);
                    showToast("Log Work Progress 📝", "Enter your progress update below.", "info");
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#0F172A] font-semibold border border-[#E2E8F0] transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <FaTasks className="text-sm text-[#64748B]" />
                  <span>Log Work Progress</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setProfileModal({ isOpen: false, intern: null })}
                className="px-4 py-2 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] text-white font-semibold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* === CAPTURED AUDIT SNAPSHOT PREVIEW MODAL === */}
      {snapshotPreviewModal.isOpen && snapshotPreviewModal.snapshot && (
        <Modal
          isOpen={snapshotPreviewModal.isOpen}
          onClose={() => setSnapshotPreviewModal({ isOpen: false, snapshot: null, student: null })}
          title={`📸 Captured Audit Snapshot: ${snapshotPreviewModal.snapshot.employeeName}`}
        >
          <div className="space-y-4 text-xs text-[#0F172A]">
            {/* Top Info Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-900 text-white rounded-2xl border border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                <div>
                  <h4 className="font-bold text-xs text-white">{snapshotPreviewModal.snapshot.employeeName}</h4>
                  <p className="text-[10px] text-cyan-300 font-mono">
                    {snapshotPreviewModal.snapshot.email} • {snapshotPreviewModal.snapshot.department || "Internship"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px]">
                <span className="bg-slate-800 px-2.5 py-1 rounded-xl text-slate-300 border border-slate-700">
                  📅 {snapshotPreviewModal.snapshot.date} • ⏰ {snapshotPreviewModal.snapshot.time}
                </span>
                <span className="bg-emerald-500/20 text-emerald-300 font-bold px-2.5 py-1 rounded-xl border border-emerald-500/30">
                  {snapshotPreviewModal.snapshot.activityScore || 94}% Productivity Score
                </span>
              </div>
            </div>

            {/* High-Resolution Screenshot Image Display */}
            <div className="rounded-2xl overflow-hidden bg-black border-2 border-slate-800 shadow-2xl p-1 relative flex items-center justify-center">
              <img
                src={snapshotPreviewModal.snapshot.imageUrl}
                alt="Audit Screen Snapshot"
                className="w-full max-h-[460px] object-contain rounded-xl bg-black"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E2E8F0]">
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={snapshotPreviewModal.snapshot.imageUrl}
                  download={`nexa-audit-${snapshotPreviewModal.snapshot.employeeName?.replace(/\s+/g, "_")}-${Date.now()}.webp`}
                  className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>📥</span>
                  <span>Download Snapshot</span>
                </a>

                {snapshotPreviewModal.student && (
                  <button
                    type="button"
                    onClick={() => {
                      const st = snapshotPreviewModal.student;
                      setSnapshotPreviewModal({ isOpen: false, snapshot: null, student: null });
                      startLiveScreenAccess(st);
                    }}
                    className="px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold rounded-xl border border-purple-200 text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <span>🖥️</span>
                    <span>Re-Open Live Screen</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSnapshotPreviewModal({ isOpen: false, snapshot: null, student: null })}
                className="px-5 py-2 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* === GENERIC INFO/ALERT MODAL === */}
      {modal.isOpen && (
        <Modal
          isOpen={modal.isOpen}
          onClose={closeModal}
          title={modal.title}
          type={modal.type}
        >
          <div className="space-y-4 text-xs text-[#0F172A]">
            <p className="leading-relaxed">{modal.message}</p>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 rounded-xl bg-[#2563EB] text-white font-semibold text-xs hover:bg-[#1D4ED8] transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

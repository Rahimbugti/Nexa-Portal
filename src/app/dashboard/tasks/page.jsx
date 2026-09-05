"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import Modal from "@/components/Modal";
import { showToast } from "@/components/Toast";
import { registerServiceWorkerAndSubscribe, triggerTestPushNotification } from "@/lib/webPushClient";
import {
  formatDateToYYYYMMDD,
  formatFriendlyDateTime,
  format12HourTime,
  calculateCompletionRate,
  SUBMISSION_TYPES,
  isValidUrl,
  safeExternalUrl
} from "@/lib/recurringTaskUtils";
import {
  FaTasks,
  FaPlay,
  FaCheckCircle,
  FaClock,
  FaPlusCircle,
  FaSearch,
  FaFilter,
  FaCalendarAlt,
  FaArrowLeft,
  FaUserCheck,
  FaExclamationTriangle,
  FaFire,
  FaTimesCircle,
  FaHistory,
  FaLayerGroup,
  FaExternalLinkAlt,
  FaPaperPlane,
  FaBan,
  FaSync,
  FaBell,
  FaUser,
  FaEye,
  FaChartPie,
  FaUserGraduate,
  FaUserTie,
  FaTrashAlt,
  FaCheck,
  FaFileAlt,
  FaLink,
  FaSpinner
} from "react-icons/fa";

export default function TasksPage() {
  const [role, setRole] = useState("employee");
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  // Data State
  const [loading, setLoading] = useState(true);
  const [cronRunning, setCronRunning] = useState(false);
  const [pushStatus, setPushStatus] = useState(null);

  // Active Tab: "today", "assignments", "history", "missed"
  const [activeTab, setActiveTab] = useState("today");

  // API Data
  const [todayDate, setTodayDate] = useState(formatDateToYYYYMMDD());
  const [todayMetrics, setTodayMetrics] = useState({ total: 0, submitted: 0, pending: 0, missed: 0 });
  const [todayInstances, setTodayInstances] = useState([]);
  const [allInstances, setAllInstances] = useState([]);
  const [groups, setGroups] = useState([]);
  const [usersWithMissedTasks, setUsersWithMissedTasks] = useState([]);
  const [allUsersTodaySummary, setAllUsersTodaySummary] = useState([]);

  // System Users for Assignment Selector
  const [systemUsers, setSystemUsers] = useState([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [userFilter, setUserFilter] = useState("all");

  // Modals
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [userStatsModalOpen, setUserStatsModalOpen] = useState(false);

  // Selected Items for Modals
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [selectedUserStats, setSelectedUserStats] = useState(null);

  // Submission Form State
  const [submissionForm, setSubmissionForm] = useState({
    submissionText: "",
    submissionUrl: "",
    fileUrl: "",
    notes: ""
  });
  const [urlValidationError, setUrlValidationError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Multi-Task Assignment Form State
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [selectedAssignee, setSelectedAssignee] = useState(null);
  const [assignmentSettings, setAssignmentSettings] = useState({
    startDate: formatDateToYYYYMMDD(),
    durationDays: 7,
    dailyDueTime: "09:00:00",
    timezone: "Asia/Karachi"
  });
  const [tasksToAssign, setTasksToAssign] = useState([
    { title: "", description: "", instructions: "", priority: "Medium", submission_type: "any", reference_url: "" }
  ]);
  const [creatingAssignment, setCreatingAssignment] = useState(false);

  // 1. Initial Load & Auth Check
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedRole = localStorage.getItem("user_role") || "employee";
      const savedEmail = (localStorage.getItem("current_user_email") || "").toLowerCase().trim();
      const savedName = localStorage.getItem("current_user_name") || savedEmail.split("@")[0] || "User";
      const adminCheck = savedRole === "admin" || savedRole === "hr" || savedEmail.includes("admin") || savedEmail === "admin@gmail.com";

      setRole(savedRole);
      setUserEmail(savedEmail);
      setUserName(savedName);
      setIsAdmin(adminCheck);

      loadSystemUsers();
      fetchTasksData(savedEmail, adminCheck);
    }
  }, []);

  // 2. Load System Users for Assignee Selection
  const loadSystemUsers = () => {
    try {
      if (typeof window !== "undefined") {
        const emps = JSON.parse(localStorage.getItem("persistent_employees") || "[]");
        const interns = JSON.parse(localStorage.getItem("persistent_interns") || "[]");
        const students = JSON.parse(localStorage.getItem("persistent_courses") || localStorage.getItem("persistent_students") || "[]");
        const registered = JSON.parse(localStorage.getItem("registered_system_users") || "[]");

        const map = new Map();
        const addUser = (u, defaultRole) => {
          if (!u) return;
          const email = (u.email || u.student_email || "").toLowerCase().trim();
          if (email && !map.has(email)) {
            map.set(email, {
              email,
              name: u.full_name || u.name || u.student_name || email.split("@")[0],
              role: u.role || defaultRole || "employee",
              department: u.department || u.course_name || u.tech_domain || "General Staff",
              designation: u.designation || (u.is_remote ? "Remote Member" : "On-Site Member"),
              avatar: localStorage.getItem(`user_avatar_${email}`) || ""
            });
          }
        };

        emps.forEach(e => addUser(e, "employee"));
        interns.forEach(i => addUser(i, "intern"));
        students.forEach(s => addUser(s, "student"));
        registered.forEach(r => addUser(r, r.role || "employee"));

        // Fallback default users if empty
        if (map.size === 0) {
          addUser({ email: "student@gmail.com", full_name: "Ali Hassan", role: "student", department: "MERN Stack" });
          addUser({ email: "sara.design@gmail.com", full_name: "Sara Khan", role: "employee", department: "UI/UX Design" });
          addUser({ email: "rahim.dev@gmail.com", full_name: "Rahim Bugti", role: "employee", department: "Engineering" });
        }

        setSystemUsers(Array.from(map.values()));
      }
    } catch (e) {
      console.debug("User directory parse notice:", e);
    }
  };

  // 3. Main Data Fetch from /api/tasks/recurring
  const fetchTasksData = useCallback(async (email = userEmail, adminMode = isAdmin) => {
    setLoading(true);
    try {
      // First, trigger background overdue check
      fetch("/api/tasks/cron", { cache: "no-store" }).catch(() => {});

      const queryParams = new URLSearchParams({
        userEmail: email,
        isAdmin: adminMode ? "true" : "false"
      });

      const res = await fetch(`/api/tasks/recurring?${queryParams.toString()}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setTodayDate(data.todayDate);
          setTodayMetrics(data.metrics || { total: 0, submitted: 0, pending: 0, missed: 0 });
          setTodayInstances(data.todayInstances || []);
          setAllInstances(data.allInstances || []);
          setGroups(data.groups || []);
          setUsersWithMissedTasks(data.usersWithMissedTasks || []);
          setAllUsersTodaySummary(data.allUsersTodaySummary || []);
        }
      }
    } catch (err) {
      console.error("fetchTasksData error:", err);
    }
    setLoading(false);
  }, [userEmail, isAdmin]);

  // 4. Manual Sync & Automation Trigger
  const handleSyncCron = async () => {
    setCronRunning(true);
    try {
      const res = await fetch("/api/tasks/cron", { method: "POST", cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        showToast("Cycle Synced ⚡", `Processed: ${data.summary?.markedMissed || 0} overdue tasks marked missed.`, "success");
        await fetchTasksData();
      }
    } catch (e) {
      showToast("Sync Notice", "Automation cycle ran.", "info");
    }
    setCronRunning(false);
  };

  // 5. Enable Web Push Notifications for Admin & Trigger Test Notification
  const handleEnableWebPush = async () => {
    const res = await registerServiceWorkerAndSubscribe(userEmail, role);
    if (res.permission === "granted" || res.subscribed) {
      setPushStatus("active");
      showToast("Web Push Enabled 🔔", "Notification permission granted! Sending test alert...", "success");
      
      // Fire live sample push notification on desktop
      setTimeout(() => {
        triggerTestPushNotification(
          "Daily Task Missed: Ahmed ⚠️",
          'Ahmed missed "LinkedIn Post" (Deadline passed at 09:00 AM).'
        );
      }, 500);
    } else if (res.permission === "denied") {
      setPushStatus("denied");
      showToast("Push Permission Denied 🛑", "Please enable notifications in your browser settings to receive alerts.", "error");
    } else {
      setPushStatus("unsupported");
      showToast("Notification Alert", res.error || "Web push notification registered.", "info");
    }
  };

  // 6. Multi-Task Form Handlers
  const handleAddTaskField = () => {
    setTasksToAssign([
      ...tasksToAssign,
      { title: "", description: "", instructions: "", priority: "Medium", submission_type: "any", reference_url: "" }
    ]);
  };

  const handleRemoveTaskField = (index) => {
    if (tasksToAssign.length <= 1) return;
    setTasksToAssign(tasksToAssign.filter((_, i) => i !== index));
  };

  const handleTaskFieldChange = (index, field, value) => {
    const updated = [...tasksToAssign];
    updated[index][field] = value;
    setTasksToAssign(updated);
  };

  // 7. Submit Multi-Task Assignment
  const handleCreateAssignmentGroup = async (e) => {
    e.preventDefault();
    if (!selectedAssignee) {
      showToast("Validation Error 🛑", "Please select an assignee user.", "error");
      return;
    }

    const validTasks = tasksToAssign.filter(t => t.title && t.title.trim().length > 0);
    if (validTasks.length === 0) {
      showToast("Validation Error 🛑", "Please provide at least one task title.", "error");
      return;
    }

    setCreatingAssignment(true);
    try {
      const payload = {
        action: "create_assignment",
        requesterEmail: userEmail,
        requesterRole: role,
        groupData: {
          user_email: selectedAssignee.email,
          user_name: selectedAssignee.name,
          user_role: selectedAssignee.role,
          start_date: assignmentSettings.startDate,
          duration_days: parseInt(assignmentSettings.durationDays, 10),
          daily_due_time: assignmentSettings.dailyDueTime,
          timezone: assignmentSettings.timezone
        },
        tasksList: validTasks
      };

      const res = await fetch("/api/tasks/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (json.success) {
        showToast("Assignment Created 🎉", json.message, "success");
        setAssignModalOpen(false);
        // Reset form
        setSelectedAssignee(null);
        setTasksToAssign([{ title: "", description: "", instructions: "", priority: "Medium", submission_type: "any", reference_url: "" }]);
        await fetchTasksData();
      } else {
        showToast("Error ⚠️", json.error || "Failed to create assignment.", "error");
      }
    } catch (err) {
      showToast("Error ⚠️", err.message || "Failed to create assignment.", "error");
    }
    setCreatingAssignment(false);
  };

  // 8. Cancel Assignment Group
  const handleCancelAssignment = async (groupId) => {
    if (!confirm("Are you sure you want to cancel this recurring assignment? Future tasks will stop, while all past history will remain preserved.")) {
      return;
    }

    try {
      const res = await fetch("/api/tasks/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel_assignment",
          groupId,
          requesterEmail: userEmail,
          requesterRole: role
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast("Assignment Cancelled 🛑", data.message, "info");
        await fetchTasksData();
      }
    } catch (e) {
      showToast("Error", "Failed to cancel assignment.", "error");
    }
  };

  // Live URL validation on input change
  const handleUrlChange = (val) => {
    setSubmissionForm(prev => ({ ...prev, submissionUrl: val }));
    const trimmed = val.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      setUrlValidationError("URL must start with https:// or http:// (e.g. https://example.com)");
    } else {
      setUrlValidationError("");
    }
  };

  // 9. Submit Task Handler
  const handleOpenSubmitModal = (instance) => {
    setSelectedInstance(instance);
    setUrlValidationError("");
    setSubmissionForm({
      submissionText: instance.submission?.submission_text || "",
      submissionUrl: instance.submission?.submission_url || "",
      fileUrl: instance.submission?.file_url || "",
      notes: instance.submission?.notes || ""
    });
    setSubmitModalOpen(true);
  };

  const handleSubmitTaskWork = async (e) => {
    e.preventDefault();
    if (!selectedInstance) return;

    const subType = selectedInstance.submission_type || "any";
    const cleanUrl = (submissionForm.submissionUrl || "").trim();
    const cleanText = (submissionForm.submissionText || "").trim();
    const cleanFile = (submissionForm.fileUrl || "").trim();
    const cleanNotes = (submissionForm.notes || "").trim();

    // Live URL check if URL is present
    if (cleanUrl) {
      if (!/^https?:\/\//i.test(cleanUrl)) {
        showToast("Invalid URL 🛑", "Please enter a valid URL starting with https:// or http://", "warning");
        setUrlValidationError("Please enter a valid URL starting with https:// or http://");
        return;
      }
    }

    const hasUrl = !!cleanUrl;
    const hasText = !!(cleanText || cleanNotes);
    const hasFile = !!cleanFile;

    if (subType === "link" && !hasUrl) {
      showToast("Link Required 🛑", "Please enter a valid submission link.", "warning");
      return;
    }
    if (subType === "file" && !hasFile) {
      showToast("File Required 🛑", "Please upload a file or provide a file URL.", "warning");
      return;
    }
    if (subType === "text" && !hasText) {
      showToast("Text Required 🛑", "Please enter your submission text/notes before submitting.", "warning");
      return;
    }
    if (subType === "link_notes") {
      if (!hasUrl) {
        showToast("Link Required 🛑", "Please enter a valid submission link.", "warning");
        return;
      }
      if (!hasText) {
        showToast("Notes Required 🛑", "Please enter your submission notes.", "warning");
        return;
      }
    }
    if (subType === "file_notes") {
      if (!hasFile) {
        showToast("File Required 🛑", "Please upload a file before submitting.", "warning");
        return;
      }
      if (!hasText) {
        showToast("Notes Required 🛑", "Please enter your submission notes.", "warning");
        return;
      }
    }
    if (subType === "any" && !hasUrl && !hasText && !hasFile) {
      showToast("Empty Submission 🛑", "Please provide a link, text, or file before submitting.", "warning");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/tasks/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceId: selectedInstance.id,
          userEmail: userEmail,
          userName: userName,
          submissionText: cleanText,
          submissionUrl: cleanUrl,
          fileUrl: cleanFile,
          notes: cleanNotes
        })
      });

      const json = await res.json();
      if (json.success) {
        showToast("Task Submitted 🚀", json.message, "success");
        setSubmitModalOpen(false);
        await fetchTasksData();
      } else {
        showToast("Submission Error ⚠️", json.error || "Failed to submit task.", "error");
      }
    } catch (err) {
      showToast("Error ⚠️", err.message, "error");
    }
    setSubmitting(false);
  };

  // 10. Open Detail View
  const handleOpenDetailModal = (instance) => {
    setSelectedInstance(instance);
    setDetailModalOpen(true);
  };

  // 11. Open User Drilldown Performance Stats
  const handleOpenUserStats = (userSummary) => {
    const userAllTasks = allInstances.filter(i => i.user_email === userSummary.user_email);
    const submittedCount = userAllTasks.filter(i => i.status === "submitted" || i.status === "late_submitted").length;
    const missedCount = userAllTasks.filter(i => i.status === "missed").length;
    const pendingCount = userAllTasks.filter(i => i.status === "pending").length;
    const totalCount = userAllTasks.length;
    const rate = calculateCompletionRate(submittedCount, totalCount);

    setSelectedUserStats({
      ...userSummary,
      totalAssigned: totalCount,
      totalSubmitted: submittedCount,
      totalMissed: missedCount,
      totalPending: pendingCount,
      completionRate: rate,
      history: userAllTasks
    });
    setUserStatsModalOpen(true);
  };

  // Filtered Instances for History / Today / Submissions Lists
  const filteredInstancesList = useMemo(() => {
    let sourceList = allInstances;
    if (activeTab === "today") {
      sourceList = todayInstances;
    } else if (activeTab === "submissions") {
      sourceList = allInstances
        .filter(i => (i.status === "submitted" || i.status === "late_submitted") && i.submission)
        .sort((a, b) => {
          const timeA = new Date(a.submission?.submitted_at || a.submitted_at || 0).getTime();
          const timeB = new Date(b.submission?.submitted_at || b.submitted_at || 0).getTime();
          return timeB - timeA;
        });
    }

    return sourceList.filter(inst => {
      // User filter (admin only)
      if (isAdmin && userFilter !== "all" && inst.user_email !== userFilter) {
        return false;
      }

      // Status filter
      if (statusFilter !== "all" && inst.status !== statusFilter) {
        return false;
      }

      // Priority filter
      if (priorityFilter !== "all" && (inst.priority || "Medium").toLowerCase() !== priorityFilter.toLowerCase()) {
        return false;
      }

      // Date filter
      if (dateFilter && inst.task_date !== dateFilter) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = (inst.task_title || "").toLowerCase().includes(q);
        const descMatch = (inst.task_description || "").toLowerCase().includes(q);
        const userMatch = (inst.user_name || inst.user_email || "").toLowerCase().includes(q);
        const notesMatch = (inst.submission?.notes || inst.submission?.submission_text || "").toLowerCase().includes(q);
        const urlMatch = (inst.submission?.submission_url || "").toLowerCase().includes(q);
        return titleMatch || descMatch || userMatch || notesMatch || urlMatch;
      }

      return true;
    });
  }, [activeTab, todayInstances, allInstances, userFilter, statusFilter, priorityFilter, dateFilter, searchQuery, isAdmin]);

  // Filtered System Users for Assign Modal Search
  const filteredAssignees = useMemo(() => {
    if (!assigneeSearch.trim()) return systemUsers;
    const q = assigneeSearch.toLowerCase();
    return systemUsers.filter(u =>
      (u.name || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.department || "").toLowerCase().includes(q)
    );
  }, [systemUsers, assigneeSearch]);

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto pb-12">
      {/* 1. HEADER BANNER */}
      <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] bg-[#EFF6FF] px-2.5 py-1 rounded-full border border-[#2563EB]/20">
              Recurring Daily Cycle System
            </span>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
              Fixed Cycle (PKT UTC+5)
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-[#0F172A] mt-1.5 flex items-center gap-2.5">
            <FaTasks className="text-[#2563EB]" />
            <span>Daily Task Manager</span>
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            {isAdmin
              ? "Automated recurring daily task cycles with permanent historical records, live deadline monitoring, and push alerts."
              : "Review today's assigned tasks, track daily deadlines, and submit deliverables before the cycle closes."}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleSyncCron}
            disabled={cronRunning}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-200 cursor-pointer shadow-xs disabled:opacity-60"
            title="Trigger background automation to evaluate overdue tasks and cycle next instances"
          >
            <FaSync className={`text-xs text-blue-600 ${cronRunning ? "animate-spin" : ""}`} />
            <span>{cronRunning ? "Syncing..." : "Sync Cycle"}</span>
          </button>

          {isAdmin && (
            <>
              <button
                type="button"
                onClick={handleEnableWebPush}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-bold transition-all border border-amber-200 cursor-pointer shadow-xs"
                title="Enable browser notifications for missed tasks"
              >
                <FaBell className="text-xs text-amber-600" />
                <span>Web Push Alerts</span>
              </button>

              <button
                type="button"
                onClick={() => setAssignModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                <FaPlusCircle className="text-xs" />
                <span>Assign Recurring Task</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2. STATS METRICS GRID (TODAY'S ACTUAL INSTANCES) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-1">
          <div className="flex justify-between items-center text-xs text-[#64748B]">
            <span className="font-semibold text-slate-700">Today's Assigned</span>
            <FaTasks className="text-blue-500" />
          </div>
          <p className="text-2xl font-black text-[#0F172A]">{todayMetrics.total}</p>
          <p className="text-[11px] text-slate-400">Total cycle items today</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-1">
          <div className="flex justify-between items-center text-xs text-[#64748B]">
            <span className="font-semibold text-slate-700">Submitted</span>
            <FaCheckCircle className="text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-600">{todayMetrics.submitted}</p>
          <p className="text-[11px] text-slate-400">Successfully delivered</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-1">
          <div className="flex justify-between items-center text-xs text-[#64748B]">
            <span className="font-semibold text-slate-700">Pending</span>
            <FaClock className="text-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-600">{todayMetrics.pending}</p>
          <p className="text-[11px] text-slate-400">Awaiting user submission</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-1">
          <div className="flex justify-between items-center text-xs text-[#64748B]">
            <span className="font-semibold text-slate-700">Missed Tasks</span>
            <FaExclamationTriangle className="text-rose-500" />
          </div>
          <p className="text-2xl font-black text-rose-600">{todayMetrics.missed}</p>
          <p className="text-[11px] text-slate-400">Deadline elapsed</p>
        </div>
      </div>

      {/* 3. ADMIN: USERS WHO MISSED TASKS TODAY (CRITICAL SECTION 12) */}
      {isAdmin && usersWithMissedTasks.length > 0 && (
        <div className="bg-rose-50/60 border border-rose-200 p-5 rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FaExclamationTriangle className="text-rose-600 text-sm" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-rose-900">
                Users with Missed Tasks Today ({usersWithMissedTasks.length})
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-rose-700">
              Click user card for complete task audit
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {usersWithMissedTasks.map((u) => (
              <div
                key={u.user_email}
                onClick={() => handleOpenUserStats(u)}
                className="bg-white p-3.5 rounded-xl border border-rose-200 hover:border-rose-400 transition-all cursor-pointer shadow-xs space-y-2 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 truncate">
                    <div className="w-7 h-7 rounded-full bg-rose-100 text-rose-700 font-bold flex items-center justify-center text-xs shrink-0">
                      {(u.name || u.user_email || "U").charAt(0).toUpperCase()}
                    </div>
                    <div className="truncate">
                      <p className="text-xs font-bold text-slate-900 truncate group-hover:text-rose-600 transition-colors">
                        {u.name || u.user_email}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">{u.user_email}</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-700 border border-rose-300">
                    {u.missed} Missed
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-slate-100">
                  <span>Assigned: <strong>{u.total}</strong></span>
                  <span>Submitted: <strong className="text-emerald-600">{u.submitted}</strong></span>
                  <span className="text-rose-600 font-bold text-[10px] group-hover:underline">Inspect →</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. NAVIGATION TABS */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1 overflow-x-auto text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab("today")}
          className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "today"
              ? "bg-[#2563EB] text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <FaTasks />
          <span>Today's Tasks ({todayInstances.length})</span>
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab("submissions")}
            className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "submissions"
                ? "bg-[#2563EB] text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <FaCheckCircle />
            <span>
              Recent Submissions (
              {allInstances.filter(i => (i.status === "submitted" || i.status === "late_submitted") && i.submission).length}
              )
            </span>
          </button>
        )}

        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab("assignments")}
            className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "assignments"
                ? "bg-[#2563EB] text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <FaLayerGroup />
            <span>Recurring Assignment Groups ({groups.length})</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "history"
              ? "bg-[#2563EB] text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <FaHistory />
          <span>{isAdmin ? "Complete Task History" : "My Task History"} ({allInstances.length})</span>
        </button>
      </div>

      {/* 5. FILTER & SEARCH CONTROLS */}
      {activeTab !== "assignments" && (
        <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-72">
            <FaSearch className="absolute left-3.5 top-3.5 text-slate-400 text-xs" />
            <input
              type="text"
              placeholder="Search by title, instructions, user..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* User Filter (Admin Only) */}
            {isAdmin && (
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white outline-none focus:border-blue-500"
              >
                <option value="all">All Users</option>
                {systemUsers.map((u) => (
                  <option key={u.email} value={u.email}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            )}

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white outline-none focus:border-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="submitted">Submitted</option>
              <option value="missed">Missed</option>
              <option value="late_submitted">Late Submitted</option>
            </select>

            {/* Priority Filter */}
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white outline-none focus:border-blue-500"
            >
              <option value="all">All Priorities</option>
              <option value="High">High Priority 🔥</option>
              <option value="Medium">Medium Priority</option>
              <option value="Low">Low Priority</option>
              <option value="Urgent">Urgent ⚡</option>
            </select>

            {/* Date Filter (History Tab) */}
            {activeTab === "history" && (
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-700 outline-none focus:border-blue-500"
              />
            )}
          </div>
        </div>
      )}

      {/* 6. TAB CONTENT: TASK INSTANCE CARDS */}
      {(activeTab === "today" || activeTab === "history" || activeTab === "submissions") && (
        <div className="space-y-3">
          {loading ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-xs text-slate-400 italic">
              Loading daily task cycles from database...
            </div>
          ) : filteredInstancesList.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-2">
              <FaTasks className="text-3xl text-slate-300 mx-auto" />
              <h3 className="font-bold text-slate-700 text-sm">
                {activeTab === "today"
                  ? "No Daily Tasks assigned today"
                  : activeTab === "submissions"
                  ? "No user task submissions matching filter"
                  : "No task history matching filter"}
              </h3>
              <p className="text-xs text-slate-400">
                {isAdmin
                  ? "When users submit deliverables, their proofs of work and links will appear here."
                  : "You're all caught up! Check back during the next daily cycle."}
              </p>
            </div>
          ) : (
            filteredInstancesList.map((inst) => {
              const isOwner = (inst.user_email || "").toLowerCase().trim() === userEmail.toLowerCase().trim();
              const canSubmit = isOwner && (inst.status === "pending" || inst.status === "missed");

              return (
                <div
                  key={inst.id}
                  className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-sm hover:border-blue-200 transition-all space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1">
                      {/* Badge line */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                          Day {inst.cycle_number} of {inst.total_cycles}
                        </span>

                        {inst.submission_type && inst.submission_type !== "any" && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                            <FaLink className="text-[9px]" />
                            <span>
                              {inst.submission_type === "link"
                                ? "Link Required"
                                : inst.submission_type === "file"
                                ? "File Required"
                                : inst.submission_type === "text"
                                ? "Text Required"
                                : inst.submission_type === "link_notes"
                                ? "Link + Notes"
                                : inst.submission_type === "file_notes"
                                ? "File + Notes"
                                : inst.submission_type}
                            </span>
                          </span>
                        )}

                        <h3 className="text-sm font-bold text-[#0F172A]">
                          {inst.task_title}
                        </h3>

                        {/* Status Badge */}
                        <span
                          className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border uppercase ${
                            inst.status === "submitted"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : inst.status === "late_submitted"
                              ? "bg-purple-50 text-purple-700 border-purple-200"
                              : inst.status === "missed"
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}
                        >
                          {inst.status === "late_submitted" ? "Late Submitted" : inst.status}
                        </span>

                        {(inst.priority === "High" || inst.priority === "Urgent") && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                            <FaFire className="text-[9px]" /> {inst.priority}
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      <p className="text-xs text-[#64748B] leading-relaxed">
                        {inst.task_description || "Complete daily deliverable guidelines as specified."}
                      </p>

                      {/* Instructions / Reference URL */}
                      {inst.reference_url && (
                        <a
                          href={inst.reference_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-blue-600 font-bold hover:underline"
                        >
                          <FaExternalLinkAlt className="text-[9px]" />
                          <span>Reference / Instructions Link</span>
                        </a>
                      )}

                      {/* Submission Deliverable Link Preview if Submitted */}
                      {inst.submission && (inst.status === "submitted" || inst.status === "late_submitted") && (
                        <div className="pt-2 flex flex-wrap items-center gap-2">
                          {(inst.submission.submission_url || inst.submission.submission_link || inst.submission_url) && (
                            <a
                              href={safeExternalUrl(inst.submission.submission_url || inst.submission.submission_link || inst.submission_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-2xs transition-colors cursor-pointer"
                              title={inst.submission.submission_url || inst.submission.submission_link || inst.submission_url}
                            >
                              <FaExternalLinkAlt className="text-[9px]" />
                              <span>Open Link</span>
                            </a>
                          )}
                          {(inst.submission.submission_file_url || inst.submission.file_url || inst.submission.file_path || inst.submission_file_url || inst.file_url) && (
                            <a
                              href={safeExternalUrl(inst.submission.submission_file_url || inst.submission.file_url || inst.submission.file_path || inst.submission_file_url || inst.file_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] shadow-2xs transition-colors cursor-pointer"
                              title={inst.submission.submission_file_url || inst.submission.file_url || inst.submission.file_path || inst.submission_file_url || inst.file_url}
                            >
                              <FaFileAlt className="text-[9px]" />
                              <span>View File</span>
                            </a>
                          )}
                          {inst.submission.notes && (
                            <span className="text-[11px] text-slate-500 italic truncate max-w-xs">
                              &ldquo;{inst.submission.notes}&rdquo;
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ACTION BUTTONS */}
                    <div className="flex items-center gap-2 self-start shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenDetailModal(inst)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
                      >
                        <FaEye className="text-[10px]" /> View
                      </button>

                      {canSubmit && (
                        <button
                          type="button"
                          onClick={() => handleOpenSubmitModal(inst)}
                          className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                        >
                          <FaPaperPlane className="text-[10px]" /> Submit Task
                        </button>
                      )}

                      {inst.status === "submitted" && (
                        <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1 px-2.5 py-1 bg-emerald-50 rounded-lg border border-emerald-200">
                          <FaCheck className="text-[9px]" /> Done
                        </span>
                      )}
                    </div>
                  </div>

                  {/* FOOTER METADATA */}
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between text-[11px] text-[#64748B] gap-2">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span>User: <strong className="text-slate-800">{inst.user_name || inst.user_email}</strong></span>
                      <span>Date: <strong className="text-slate-800">{inst.task_date}</strong></span>
                      <span>
                        Deadline: <strong className="text-rose-600">{formatFriendlyDateTime(inst.due_at)}</strong>
                      </span>
                    </div>

                    {inst.submitted_at && (
                      <span className="text-emerald-700 font-semibold">
                        Submitted at: {formatFriendlyDateTime(inst.submitted_at)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 7. TAB CONTENT 2: RECURRING ASSIGNMENT GROUPS (ADMIN ONLY) */}
      {isAdmin && activeTab === "assignments" && (
        <div className="space-y-3">
          {groups.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-2">
              <FaLayerGroup className="text-3xl text-slate-300 mx-auto" />
              <h3 className="font-bold text-slate-700 text-sm">No Assignment Groups Found</h3>
              <p className="text-xs text-slate-400">Click 'Assign Recurring Task' to create a new cycle batch.</p>
            </div>
          ) : (
            groups.map((grp) => {
              const startDateObj = new Date(grp.start_date);
              const todayObj = new Date(todayDate);
              const diffDays = Math.floor((todayObj - startDateObj) / (1000 * 60 * 60 * 24)) + 1;
              const currentDayNum = Math.min(Math.max(diffDays, 1), grp.duration_days);
              const remainingDays = Math.max(0, grp.duration_days - currentDayNum);

              return (
                <div
                  key={grp.id}
                  className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          {grp.user_name || grp.user_email}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold uppercase">
                          {grp.user_role || "employee"}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            grp.status === "active"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : grp.status === "completed"
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : "bg-slate-100 text-slate-500 border border-slate-200"
                          }`}
                        >
                          {grp.status}
                        </span>
                      </div>
                      <p className="text-xs text-[#64748B]">
                        Start Date: <strong>{grp.start_date}</strong> • Total Duration: <strong>{grp.duration_days} Days</strong> • Daily Deadline: <strong>{format12HourTime(grp.daily_due_time)}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right text-xs">
                        <p className="font-bold text-blue-600">Day {currentDayNum} of {grp.duration_days}</p>
                        <p className="text-[10px] text-slate-400">{remainingDays} days remaining</p>
                      </div>

                      {grp.status === "active" && (
                        <button
                          type="button"
                          onClick={() => handleCancelAssignment(grp.id)}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                          title="Stop future recurring daily instances"
                        >
                          <FaBan className="text-[10px]" /> Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 8. MODAL: ASSIGN RECURRING TASK (SINGLE OR MULTI-TASK) */}
      {/* ==================================================================== */}
      <Modal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title="Assign Recurring Daily Task Cycle"
      >
        <form onSubmit={handleCreateAssignmentGroup} className="space-y-5 text-xs">
          {/* USER SELECTOR WITH SEARCH */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase">
              1. Select Assignee User *
            </label>
            <div className="relative">
              <FaSearch className="absolute left-3 top-3 text-slate-400 text-xs" />
              <input
                type="text"
                placeholder="Search user by name, email, or department..."
                value={assigneeSearch}
                onChange={(e) => setAssigneeSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-blue-500 text-xs"
              />
            </div>

            <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {filteredAssignees.map((u) => {
                const isSelected = selectedAssignee?.email === u.email;
                return (
                  <div
                    key={u.email}
                    onClick={() => setSelectedAssignee(u)}
                    className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected ? "bg-blue-50 border-l-4 border-blue-600" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0">
                        {(u.name || u.email || "U").charAt(0).toUpperCase()}
                      </div>
                      <div className="truncate">
                        <p className="font-bold text-slate-900 truncate">{u.name || u.email}</p>
                        <p className="text-[10px] text-slate-400 truncate">{u.email} • {u.department || "Staff"}</p>
                      </div>
                    </div>
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold uppercase shrink-0">
                      {u.role}
                    </span>
                  </div>
                );
              })}
            </div>

            {selectedAssignee && (
              <p className="text-[11px] text-emerald-700 font-bold bg-emerald-50 p-2 rounded-lg border border-emerald-200 flex items-center gap-1.5">
                <FaUserCheck /> Selected Assignee: {selectedAssignee.name} ({selectedAssignee.email})
              </p>
            )}
          </div>

          {/* DURATION & TIMING SETTINGS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Start Date *
              </label>
              <input
                type="date"
                required
                value={assignmentSettings.startDate}
                onChange={(e) => setAssignmentSettings({ ...assignmentSettings, startDate: e.target.value })}
                className="w-full p-2 rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-500 text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Duration (Days) *
              </label>
              <input
                type="number"
                min="1"
                max="365"
                required
                value={assignmentSettings.durationDays}
                onChange={(e) => setAssignmentSettings({ ...assignmentSettings, durationDays: e.target.value })}
                className="w-full p-2 rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-500 text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Daily Deadline (Fixed) *
              </label>
              <input
                type="time"
                required
                value={assignmentSettings.dailyDueTime}
                onChange={(e) => setAssignmentSettings({ ...assignmentSettings, dailyDueTime: e.target.value })}
                className="w-full p-2 rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-500 text-xs"
              />
            </div>
          </div>

          {/* MULTI-TASK LIST FORM */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 uppercase">
                2. Tasks in this Assignment Group ({tasksToAssign.length})
              </label>
              <button
                type="button"
                onClick={handleAddTaskField}
                className="px-2.5 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold rounded-lg border border-blue-200 text-[11px] flex items-center gap-1 cursor-pointer"
              >
                <FaPlusCircle className="text-[10px]" /> Add Another Task
              </button>
            </div>

            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {tasksToAssign.map((taskItem, idx) => (
                <div key={idx} className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2.5 relative shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      Task #{idx + 1}
                    </span>
                    {tasksToAssign.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTaskField(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                        title="Remove task"
                      >
                        <FaTrashAlt className="text-xs" />
                      </button>
                    )}
                  </div>

                  <div>
                    <input
                      type="text"
                      required
                      placeholder="e.g. LinkedIn Post / Client Outreach / Daily Report"
                      value={taskItem.title}
                      onChange={(e) => handleTaskFieldChange(idx, "title", e.target.value)}
                      className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-blue-500 font-bold text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <textarea
                      rows={2}
                      placeholder="Task description & expectations..."
                      value={taskItem.description}
                      onChange={(e) => handleTaskFieldChange(idx, "description", e.target.value)}
                      className="w-full p-2 rounded-lg border border-slate-200 outline-none focus:border-blue-500 text-xs"
                    />

                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Priority</label>
                          <select
                            value={taskItem.priority}
                            onChange={(e) => handleTaskFieldChange(idx, "priority", e.target.value)}
                            className="w-full p-1.5 rounded-lg border border-slate-200 outline-none focus:border-blue-500 bg-white text-xs"
                          >
                            <option value="Medium">Medium Priority</option>
                            <option value="High">High Priority 🔥</option>
                            <option value="Urgent">Urgent ⚡</option>
                            <option value="Low">Low Priority</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Submission Required</label>
                          <select
                            value={taskItem.submission_type || "any"}
                            onChange={(e) => handleTaskFieldChange(idx, "submission_type", e.target.value)}
                            className="w-full p-1.5 rounded-lg border border-slate-200 outline-none focus:border-blue-500 bg-white text-xs font-semibold text-indigo-700"
                          >
                            {SUBMISSION_TYPES.map((st) => (
                              <option key={st.value} value={st.value}>
                                {st.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <input
                        type="url"
                        placeholder="Reference / Instructions URL (Optional)"
                        value={taskItem.reference_url}
                        onChange={(e) => handleTaskFieldChange(idx, "reference_url", e.target.value)}
                        className="w-full p-1.5 rounded-lg border border-slate-200 outline-none focus:border-blue-500 text-xs"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CALCULATION SUMMARY */}
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 font-medium">
            💡 <strong>Cycle Summary:</strong> Assigning {tasksToAssign.length} task(s) for {assignmentSettings.durationDays} day(s) will automatically manage <strong>{tasksToAssign.length * parseInt(assignmentSettings.durationDays || 1, 10)} Daily Task Instances</strong> with fixed daily deadline at {format12HourTime(assignmentSettings.dailyDueTime)}.
          </div>

          {/* FORM ACTIONS */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setAssignModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creatingAssignment}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-xs cursor-pointer disabled:opacity-60"
            >
              {creatingAssignment ? "Creating Cycle Instances..." : "Assign Tasks"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ==================================================================== */}
      {/* 9. MODAL: TASK SUBMISSION (USER) */}
      {/* ==================================================================== */}
      <Modal
        isOpen={submitModalOpen}
        onClose={() => setSubmitModalOpen(false)}
        title={`Submit Deliverable: ${selectedInstance?.task_title || "Task"}`}
      >
        <form onSubmit={handleSubmitTaskWork} className="space-y-4 text-xs">
          <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-100 space-y-1">
            <div className="flex items-center justify-between">
              <p className="font-bold text-slate-900 text-xs">{selectedInstance?.task_title}</p>
              <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px]">
                Day {selectedInstance?.cycle_number} of {selectedInstance?.total_cycles}
              </span>
            </div>
            <p className="text-slate-600 text-[11px]">{selectedInstance?.task_description}</p>
            <p className="text-rose-600 font-semibold text-[10px]">
              Daily Deadline: {formatFriendlyDateTime(selectedInstance?.due_at)}
            </p>
            {selectedInstance?.submission_type && selectedInstance?.submission_type !== "any" && (
              <p className="text-[11px] text-indigo-700 font-bold pt-1">
                Required Submission Type:{" "}
                <span className="underline uppercase">
                  {selectedInstance.submission_type.replace("_", " + ")}
                </span>
              </p>
            )}
          </div>

          {/* Submission Link (URL) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 uppercase">
                Submission Link (URL){" "}
                {selectedInstance?.submission_type === "link" || selectedInstance?.submission_type === "link_notes" ? (
                  <span className="text-rose-500 font-bold">* (Required)</span>
                ) : (
                  <span className="text-slate-400 font-normal">(Optional / Supported)</span>
                )}
              </label>
              <span className="text-[10px] text-slate-400">Google Drive, GitHub, LinkedIn, Figma, Live Link</span>
            </div>
            <div className="relative">
              <FaLink className="absolute left-3 top-3 text-slate-400 h-3.5 w-3.5" />
              <input
                type="text"
                value={submissionForm.submissionUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://example.com/your-work"
                className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-xs transition-all ${
                  urlValidationError
                    ? "border-rose-300 bg-rose-50/30 focus:ring-2 focus:ring-rose-400"
                    : "border-slate-200 bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:bg-white"
                }`}
              />
            </div>
            {urlValidationError ? (
              <p className="text-[10px] text-rose-600 font-semibold">{urlValidationError}</p>
            ) : (
              <p className="text-[10px] text-slate-400">
                Examples: Google Docs, GitHub PR, LinkedIn Post, Deployed Project URL
              </p>
            )}
          </div>

          {/* Submission Text / Notes */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700 uppercase">
              Submission Text / Work Summary{" "}
              {selectedInstance?.submission_type === "text" ||
              selectedInstance?.submission_type === "link_notes" ||
              selectedInstance?.submission_type === "file_notes" ? (
                <span className="text-rose-500 font-bold">* (Required)</span>
              ) : (
                <span className="text-slate-400 font-normal">(Optional if submitting Link/File)</span>
              )}
            </label>
            <textarea
              rows={3}
              placeholder="Describe your completed work, results, post details, or summary..."
              value={submissionForm.submissionText}
              onChange={(e) => setSubmissionForm({ ...submissionForm, submissionText: e.target.value })}
              className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none focus:border-blue-500 transition-all text-xs"
            />
          </div>

          {/* File Attachment */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700 uppercase">
              File Attachment / Screenshot Link{" "}
              {selectedInstance?.submission_type === "file" || selectedInstance?.submission_type === "file_notes" ? (
                <span className="text-rose-500 font-bold">* (Required)</span>
              ) : (
                <span className="text-slate-400 font-normal">(Optional)</span>
              )}
            </label>
            <div className="relative">
              <FaFileAlt className="absolute left-3 top-3 text-slate-400 h-3.5 w-3.5" />
              <input
                type="text"
                placeholder="https://drive.google.com/file/... or uploaded file link"
                value={submissionForm.fileUrl}
                onChange={(e) => setSubmissionForm({ ...submissionForm, fileUrl: e.target.value })}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none focus:border-blue-500 transition-all text-xs"
              />
            </div>
          </div>

          {/* Additional Notes */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-700 uppercase">
              Additional Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="Any blockers, feedback, or follow-up notes..."
              value={submissionForm.notes}
              onChange={(e) => setSubmissionForm({ ...submissionForm, notes: e.target.value })}
              className="w-full p-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none focus:border-blue-500 transition-all text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              disabled={submitting}
              onClick={() => setSubmitModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <FaSpinner className="animate-spin text-xs" />
                  <span>Submitting Deliverable...</span>
                </>
              ) : (
                <>
                  <FaPaperPlane className="text-xs" />
                  <span>Confirm & Submit Deliverable</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* ==================================================================== */}
      {/* 10. MODAL: TASK DETAIL INSPECTION */}
      {/* ==================================================================== */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title="Daily Task Instance Details"
      >
        {selectedInstance && (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                  Day {selectedInstance.cycle_number} of {selectedInstance.total_cycles}
                </span>
                <span
                  className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border uppercase ${
                    selectedInstance.status === "submitted"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : selectedInstance.status === "late_submitted"
                      ? "bg-purple-50 text-purple-700 border-purple-200"
                      : selectedInstance.status === "missed"
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}
                >
                  {selectedInstance.status === "late_submitted" ? "Late Submitted" : selectedInstance.status}
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900">{selectedInstance.task_title}</h3>
              <p className="text-slate-600 text-xs leading-relaxed">{selectedInstance.task_description}</p>
              {selectedInstance.task_instructions && (
                <div className="p-2.5 bg-white rounded-lg border border-slate-200 font-mono text-[11px] text-slate-700 whitespace-pre-wrap">
                  {selectedInstance.task_instructions}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-slate-700">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Assignee</span>
                <p className="font-bold">{selectedInstance.user_name || selectedInstance.user_email}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Date</span>
                <p className="font-bold">{selectedInstance.task_date}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Deadline</span>
                <p className="font-bold text-rose-600">{formatFriendlyDateTime(selectedInstance.due_at)}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Priority</span>
                <p className="font-bold text-blue-600">{selectedInstance.priority || "Medium"}</p>
              </div>
            </div>

            {/* Submission Section */}
            {selectedInstance.submission ? (
              <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-emerald-900 text-xs flex items-center gap-1.5">
                    <FaCheckCircle className="text-emerald-600" /> Proof of Work Submission
                  </h4>
                  <span className="text-[10px] text-emerald-700 font-mono">
                    {formatFriendlyDateTime(selectedInstance.submission.submitted_at)}
                  </span>
                </div>

                {(selectedInstance.submission.submission_url || selectedInstance.submission.submission_link || selectedInstance.submission_url) && (
                  <div>
                    <span className="text-[10px] font-bold text-emerald-800 block mb-1">
                      Submitted Link / URL:
                    </span>
                    <a
                      href={safeExternalUrl(selectedInstance.submission.submission_url || selectedInstance.submission.submission_link || selectedInstance.submission_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                    >
                      <FaExternalLinkAlt className="text-xs" />
                      <span>Open Link</span>
                    </a>
                  </div>
                )}

                {(selectedInstance.submission.submission_text || selectedInstance.submission.text) && (
                  <div>
                    <span className="text-[10px] font-bold text-emerald-800 block mb-1">
                      Work Description / Text:
                    </span>
                    <p className="text-slate-800 bg-white p-2.5 rounded-lg border border-emerald-100 whitespace-pre-wrap">
                      {selectedInstance.submission.submission_text || selectedInstance.submission.text}
                    </p>
                  </div>
                )}

                {(selectedInstance.submission.submission_file_url || selectedInstance.submission.file_url || selectedInstance.submission.file_path || selectedInstance.submission_file_url || selectedInstance.file_url) && (
                  <div>
                    <span className="text-[10px] font-bold text-emerald-800 block mb-1">
                      Attached File:
                    </span>
                    <a
                      href={safeExternalUrl(selectedInstance.submission.submission_file_url || selectedInstance.submission.file_url || selectedInstance.submission.file_path || selectedInstance.submission_file_url || selectedInstance.file_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                    >
                      <FaFileAlt className="text-xs" />
                      <span>View File</span>
                    </a>
                  </div>
                )}

                {selectedInstance.submission.notes && (
                  <div>
                    <span className="text-[10px] font-bold text-emerald-800 block mb-0.5">Notes:</span>
                    <p className="text-slate-600 text-xs bg-emerald-50/40 p-2 rounded-lg border border-emerald-100">{selectedInstance.submission.notes}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200 text-center text-amber-800">
                No submission uploaded for this daily cycle yet.
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ==================================================================== */}
      {/* 11. MODAL: USER PERFORMANCE SUMMARY & TASK AUDIT (ADMIN ONLY) */}
      {/* ==================================================================== */}
      <Modal
        isOpen={userStatsModalOpen}
        onClose={() => setUserStatsModalOpen(false)}
        title={`User Performance Summary: ${selectedUserStats?.name || "Member"}`}
      >
        {selectedUserStats && (
          <div className="space-y-4 text-xs">
            {/* Header user overview */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm">
                  {(selectedUserStats.name || selectedUserStats.user_email || "U").charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">{selectedUserStats.name || selectedUserStats.user_email}</h3>
                  <p className="text-[11px] text-slate-500">{selectedUserStats.user_email}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-black text-blue-600 block">
                  {selectedUserStats.completionRate}%
                </span>
                <span className="text-[10px] text-slate-400">Completion Rate</span>
              </div>
            </div>

            {/* Metrics cards */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-3 bg-slate-100 rounded-xl">
                <span className="text-[10px] text-slate-500 block">Total</span>
                <p className="text-base font-black text-slate-900">{selectedUserStats.totalAssigned}</p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                <span className="text-[10px] text-emerald-600 block">Submitted</span>
                <p className="text-base font-black text-emerald-700">{selectedUserStats.totalSubmitted}</p>
              </div>
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-100">
                <span className="text-[10px] text-rose-600 block">Missed</span>
                <p className="text-base font-black text-rose-700">{selectedUserStats.totalMissed}</p>
              </div>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                <span className="text-[10px] text-amber-600 block">Pending</span>
                <p className="text-base font-black text-amber-700">{selectedUserStats.totalPending}</p>
              </div>
            </div>

            {/* Permanent history records list */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                Historical Daily Cycle Records ({selectedUserStats.history?.length || 0})
              </h4>

              <div className="max-h-60 overflow-y-auto space-y-2 border border-slate-200 rounded-xl p-2 divide-y divide-slate-100">
                {(selectedUserStats.history || []).map((h) => (
                  <div key={h.id} className="pt-2 first:pt-0 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900">{h.task_title}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                          Day {h.cycle_number}/{h.total_cycles}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">Date: {h.task_date}</p>
                    </div>

                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        h.status === "submitted"
                          ? "bg-emerald-50 text-emerald-700"
                          : h.status === "missed"
                          ? "bg-rose-50 text-rose-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {h.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

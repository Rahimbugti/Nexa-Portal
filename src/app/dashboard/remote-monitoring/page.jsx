"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Modal from "@/components/Modal";
import { showToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import {
  FaDesktop,
  FaCamera,
  FaClock,
  FaChartPie,
  FaShieldAlt,
  FaSync,
  FaPlay,
  FaStop,
  FaHistory,
  FaUserCheck,
  FaCheckCircle,
  FaInfoCircle,
  FaDownload,
  FaTrash,
  FaExclamationTriangle,
  FaImage,
  FaRedo,
  FaUserGraduate,
  FaBroadcastTower,
  FaLaptopCode,
  FaKeyboard,
  FaMousePointer,
  FaLock,
  FaSearch,
  FaFilter,
  FaFileExport,
  FaChartLine,
  FaRegLightbulb,
  FaEllipsisV,
  FaExpand,
  FaCompress,
  FaBell,
  FaCircle,
  FaVideo,
  FaEye,
  FaExternalLinkAlt,
  FaUserPlus,
  FaPlusCircle,
  FaToggleOn,
  FaToggleOff,
  FaUserTimes,
  FaUser,
  FaCheck,
  FaTimes,
  FaSpinner,
} from "react-icons/fa";

import { dbFetch, dbSaveRecord } from "@/lib/dbPersistence";
import {
  getRemoteWorkSessions,
  getScreenshotLogs,
  saveScreenshotLog,
  getWorkTimelines,
  addTimelineEvent,
  getMonitoringSettings,
  saveMonitoringSettings,
  purgeExpiredScreenshots,
  getRandomScreenshotInterval,
  getClientDeviceInfo,
  INITIAL_APP_USAGE,
} from "@/lib/remoteMonitoringUtils";
import {
  startScreenBroadcast,
  stopScreenBroadcast,
  isScreenBroadcasting,
  WebRTCViewerClient,
} from "@/lib/webrtcScreenService";

export default function RemoteMonitoringPage() {
  // === Current User & Role State ===
  const [role, setRole] = useState("admin"); // 'admin' or 'employee'
  const [activeTab, setActiveTab] = useState("live_users"); // 'live_users', 'overview', 'screenshots', 'timeline', 'analytics', 'settings'
  const [userEmail, setUserEmail] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [employeeId, setEmployeeId] = useState("emp-101");
  const [department, setDepartment] = useState("Frontend Engineering");

  // === Privacy & Session State ===
  const [isConsentAccepted, setIsConsentAccepted] = useState(false);
  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isScreenSharingActive, setIsScreenSharingActive] = useState(false);
  const [isScreenPromptOpen, setIsScreenPromptOpen] = useState(false);
  const [sessionStatus, setSessionStatus] = useState("Stopped"); // 'Active', 'Idle', 'Stopped'
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // === Activity & Idle Tracker State ===
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [lastActivityTimestamp, setLastActivityTimestamp] = useState(Date.now());
  const [mouseEventsCount, setMouseEventsCount] = useState(0);
  const [keyboardEventsCount, setKeyboardEventsCount] = useState(0);
  const [currentFocusedApp, setCurrentFocusedApp] = useState("VS Code — Software House Management");

  // === Screenshot Random Capture Engine State ===
  const [nextScreenshotTimer, setNextScreenshotTimer] = useState(600);
  const [nextIntervalMinutes, setNextIntervalMinutes] = useState(10);
  const [isCapturingScreen, setIsCapturingScreen] = useState(false);
  const [screenshots, setScreenshots] = useState([]);
  const [selectedScreenshotModal, setSelectedScreenshotModal] = useState(null);

  // === Timeline & Analytics State ===
  const [workTimelines, setWorkTimelines] = useState([]);
  const [remoteSessions, setRemoteSessions] = useState([]);
  const [appUsageList, setAppUsageList] = useState(INITIAL_APP_USAGE);
  const [settings, setSettings] = useState({ retentionDays: 60, minInterval: 5, maxInterval: 15 });

  // === Registered & Live Users List (Supabase Source of Truth) ===
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [liveSessionsList, setLiveSessionsList] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  // === Remote Users Management State ===
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [userSelectionMode, setUserSelectionMode] = useState("existing"); // 'existing' or 'custom'
  const [availableSystemUsers, setAvailableSystemUsers] = useState([]);
  const [userSearchModalQuery, setUserSearchModalQuery] = useState("");
  const [newRemoteUser, setNewRemoteUser] = useState({
    name: "",
    email: "",
    department: "Software Engineering",
    designation: "Remote Developer",
    role: "employee",
    deviceName: "Windows Workstation",
  });
  const [deleteConfirmUser, setDeleteConfirmUser] = useState(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(null);

  // === Admin Filters & Search State ===
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState("All");
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [isHeaderKebabOpen, setIsHeaderKebabOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, loading: false });

  // === WebRTC Live Screen Viewer State for Admin ===
  const [liveViewerModal, setLiveViewerModal] = useState({
    isOpen: false,
    user: null,
    connectionState: "idle", // 'idle', 'connecting', 'connected', 'stopped', 'failed', 'closed'
    stream: null,
    statusMessage: "",
    lastSeen: "Just now",
  });
  const viewerClientRef = useRef(null);
  const viewerVideoRef = useRef(null);
  const [isFullscreenViewer, setIsFullscreenViewer] = useState(false);
  const viewerContainerRef = useRef(null);

  // Canvas ref for generating client compressed screenshot frames
  const canvasRef = useRef(null);

  // Load User Data & Saved Logs on Mount
  useEffect(() => {
    const savedRole = localStorage.getItem("user_role") || "admin";
    const savedEmail = localStorage.getItem("current_user_email") || "";
    const savedName = localStorage.getItem("current_user_name") || "";

    setRole(savedRole);
    setUserEmail(savedEmail);
    setEmployeeName(savedName);

    // Default tab depending on role
    if (savedRole === "employee") {
      setActiveTab("overview");
    } else {
      setActiveTab("live_users");
    }

    loadMonitoringData();

    const consent = sessionStorage.getItem("remote_monitoring_consent");
    if (consent === "accepted") {
      setIsConsentAccepted(true);
    }

    const savedSettings = getMonitoringSettings();
    setSettings(savedSettings);

    // Cleanup on window unload if broadcasting
    const handleUnload = () => {
      stopScreenBroadcast();
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      if (viewerClientRef.current) {
        viewerClientRef.current.disconnect();
      }
    };
  }, []);

  const loadMonitoringData = async () => {
    setIsLoadingUsers(true);
    try {
      const [sessionsData, screenshotsData, timelinesData, monSessions] = await Promise.all([
        getRemoteWorkSessions(),
        getScreenshotLogs(),
        getWorkTimelines(),
        dbFetch("monitoring_sessions").catch(() => []),
      ]);

      setRemoteSessions(sessionsData || []);
      setScreenshots(screenshotsData || []);
      setWorkTimelines(timelinesData || []);
      setLiveSessionsList(monSessions || []);

      // 1. Fetch Remote Users directly from Supabase / API (Persistent Source of Truth)
      let remoteUsersList = [];
      try {
        const res = await fetch("/api/remote-users", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            remoteUsersList = json.data.map((u) => ({
              id: u.id,
              user_id: u.user_id || u.id,
              name: u.user_name || u.name || (u.user_email ? u.user_email.split("@")[0] : "Remote User"),
              email: (u.user_email || u.email || "").toLowerCase().trim(),
              department: u.department || "Software Engineering",
              designation: u.designation || "Remote Member",
              role: u.role || "employee",
              status: u.status || (u.is_active ? "active" : "inactive"),
              is_active: u.is_active !== undefined ? u.is_active : u.status !== "inactive",
              is_remote: true,
              created_at: u.created_at,
            }));
          }
        }
      } catch (apiErr) {
        console.warn("Could not fetch remote users from /api/remote-users:", apiErr);
      }

      // 2. Load system registered students, interns, and employees for the "Add Remote User" selector
      const [dbStudents, dbInterns, dbEmployees] = await Promise.all([
        dbFetch("students").catch(() => []),
        dbFetch("interns").catch(() => []),
        dbFetch("employees").catch(() => []),
      ]);

      const systemMap = new Map();
      [...(dbEmployees || []), ...(dbInterns || []), ...(dbStudents || [])].forEach((u) => {
        const email = (u.email || u.student_email || "").toLowerCase().trim();
        const name = u.full_name || u.name || u.student_name || email;
        if (email && !systemMap.has(email)) {
          systemMap.set(email, {
            id: u.id || email,
            name: name,
            email: email,
            department:
              u.department ||
              u.course_name ||
              u.tech_domain ||
              u.designation ||
              (u.internship_mode ? "Internship Program" : "Software Engineering"),
            designation: u.designation || (u.internship_mode ? "Intern" : "Employee"),
            role: u.role || (u.internship_mode ? "intern" : u.course_name ? "student" : "employee"),
          });
        }
      });
      setAvailableSystemUsers(Array.from(systemMap.values()));

      // 3. Set Registered Users strictly from database (Single Source of Truth)
      setRegisteredUsers(remoteUsersList);
      if (remoteUsersList.length > 0 && !employeeName) {
        const firstUser = remoteUsersList[0];
        setEmployeeName(firstUser.name);
        setDepartment(firstUser.department);
        setEmployeeId(firstUser.id);
      }
    } catch (error) {
      console.error("Error loading remote monitoring data:", error);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // === Handlers for Remote Users Supabase Management ===
  const handleAddRemoteUser = async (e) => {
    if (e) e.preventDefault();
    if (!newRemoteUser.name?.trim() || !newRemoteUser.email?.trim()) {
      showToast("Missing Information", "Full name and email address are required.", "warning");
      return;
    }

    const cleanEmail = newRemoteUser.email.toLowerCase().trim();
    const cleanName = newRemoteUser.name.trim();

    // Check duplicate locally before sending to DB
    const alreadyExists = registeredUsers.some(
      (u) => (u.email || "").toLowerCase().trim() === cleanEmail
    );
    if (alreadyExists) {
      showToast("Duplicate User", `"${cleanName}" (${cleanEmail}) is already added to Remote Monitoring.`, "warning");
      return;
    }

    setIsAddingUser(true);
    try {
      const res = await fetch("/api/remote-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_user",
          userData: {
            name: cleanName,
            email: cleanEmail,
            department: newRemoteUser.department || "Software Engineering",
            designation: newRemoteUser.designation || "Remote Member",
            role: newRemoteUser.role || "employee",
            deviceName: newRemoteUser.deviceName || "Desktop Workstation",
          },
          requesterEmail: userEmail || "admin@gmail.com",
          requesterRole: role,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to add remote user to Supabase.");
      }

      showToast("Remote User Added 🎉", data.message || `User "${cleanName}" is now stored permanently in Supabase!`, "success");
      setIsAddUserModalOpen(false);
      setNewRemoteUser({
        name: "",
        email: "",
        department: "Software Engineering",
        designation: "Remote Developer",
        role: "employee",
        deviceName: "Windows Workstation",
      });
      setUserSearchModalQuery("");
      await loadMonitoringData();
    } catch (err) {
      console.error("Error adding remote user:", err);
      showToast("Failed to Add User ❌", err.message || "Could not save remote user.", "error");
    } finally {
      setIsAddingUser(false);
    }
  };

  const handleToggleUserStatus = async (user) => {
    const userEmailToToggle = (user.email || "").toLowerCase().trim();
    setIsTogglingStatus(user.id || userEmailToToggle);
    try {
      const res = await fetch("/api/remote-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_status",
          id: user.id,
          userEmail: userEmailToToggle,
          currentStatus: user.status || (user.is_active ? "active" : "inactive"),
          requesterEmail: userEmail || "admin@gmail.com",
          requesterRole: role,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to toggle status.");
      }
      showToast("Status Updated", data.message || `User status updated to ${data.status}.`, "success");
      await loadMonitoringData();
    } catch (err) {
      console.error("Error updating user status:", err);
      showToast("Update Failed ❌", err.message, "error");
    } finally {
      setIsTogglingStatus(null);
    }
  };

  const handleDeleteRemoteUser = async () => {
    if (!deleteConfirmUser) return;
    setIsDeletingUser(true);
    try {
      const res = await fetch("/api/remote-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_user",
          id: deleteConfirmUser.id,
          userEmail: (deleteConfirmUser.email || "").toLowerCase().trim(),
          requesterEmail: userEmail || "admin@gmail.com",
          requesterRole: role,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete user from Supabase.");
      }
      showToast("User Removed 🗑️", `User "${deleteConfirmUser.name}" permanently removed from Remote Monitoring.`, "info");
      setDeleteConfirmUser(null);
      await loadMonitoringData();
    } catch (err) {
      console.error("Error removing remote user:", err);
      showToast("Removal Failed ❌", err.message, "error");
    } finally {
      setIsDeletingUser(false);
    }
  };

  // Periodic polling for live monitoring sessions
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const monSessions = await dbFetch("monitoring_sessions").catch(() => []);
        if (monSessions) {
          setLiveSessionsList(monSessions);
        }
      } catch (e) {}
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Synchronize incoming WebRTC MediaStream with video element
  useEffect(() => {
    if (viewerVideoRef.current && liveViewerModal.stream) {
      viewerVideoRef.current.srcObject = liveViewerModal.stream;
      viewerVideoRef.current.play().catch((err) => {
        console.warn("[WebRTC Viewer] Video play error:", err);
      });
    }
  }, [liveViewerModal.isOpen, liveViewerModal.stream]);

  // === 1. Session Duration Clock & Idle Detection Engine ===
  useEffect(() => {
    let interval = null;
    if (isSessionActive) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);

        const now = Date.now();
        const timeSinceLastInput = now - lastActivityTimestamp;

        if (timeSinceLastInput > 120000) {
          // 2 minutes idle threshold
          if (sessionStatus !== "Idle") {
            setSessionStatus("Idle");
            showToast("Idle Warning ⏸️", "No input detected for 2+ minutes. Marked as Idle.", "info");

            const idleEvent = {
              id: `t-${Date.now()}`,
              employee_id: employeeId,
              employee_name: employeeName,
              time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              type: "Idle Alert",
              detail: "No mouse/keyboard interaction detected (>2m)",
              status: "Idle",
            };
            addTimelineEvent(idleEvent).then((updated) => setWorkTimelines(updated));
          }
          setIdleSeconds((prev) => prev + 1);
        } else {
          setActiveSeconds((prev) => prev + 1);
        }

        // Countdown timer for next random screenshot
        setNextScreenshotTimer((prev) => {
          if (prev <= 1) {
            triggerRandomScreenshotCapture();
            const nextSec = getRandomScreenshotInterval(settings.minInterval, settings.maxInterval);
            setNextIntervalMinutes(Math.round(nextSec / 60));
            return nextSec;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (interval) clearInterval(interval);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSessionActive, sessionStatus, lastActivityTimestamp, settings]);

  // === 2. Global Event Listeners for Activity Tracking ===
  useEffect(() => {
    const handleUserActivity = () => {
      if (!isSessionActive) return;

      const now = Date.now();
      setLastActivityTimestamp(now);

      if (sessionStatus === "Idle") {
        setSessionStatus("Active");
        showToast("Activity Resumed 🟢", "Mouse/keyboard activity detected. Marked as Active.", "success");

        const activeEvent = {
          id: `t-${Date.now()}`,
          employee_id: employeeId,
          employee_name: employeeName,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          type: "Activity Resume",
          detail: "Input detected — Resumed Active Status",
          status: "Active",
        };
        addTimelineEvent(activeEvent).then((updated) => setWorkTimelines(updated));
      }
    };

    const handleMouseMove = () => {
      setMouseEventsCount((prev) => prev + 1);
      handleUserActivity();
    };

    const handleKeyDown = () => {
      setKeyboardEventsCount((prev) => prev + 1);
      handleUserActivity();
    };

    if (isSessionActive) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("click", handleUserActivity);
      window.addEventListener("scroll", handleUserActivity);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("click", handleUserActivity);
      window.removeEventListener("scroll", handleUserActivity);
    };
  }, [isSessionActive, sessionStatus, employeeId, employeeName]);

  // === 3. Start Screen Broadcast / Work Session ===
  const handleInitiateWorkSession = () => {
    if (!isConsentAccepted) {
      setIsConsentModalOpen(true);
      return;
    }
    // Open Prompt modal guiding the user to select Entire Screen
    setIsScreenPromptOpen(true);
  };

  const handleConfirmStartBroadcast = async () => {
    setIsScreenPromptOpen(false);

    try {
      const activeEmail = (userEmail || localStorage.getItem("current_user_email") || `${employeeName.toLowerCase().replace(/\s+/g, "")}@nexa.local`).toLowerCase().trim();

      const broadcastRes = await startScreenBroadcast({
        userId: employeeId || activeEmail,
        userName: employeeName,
        userEmail: activeEmail,
        department: department,
        role: role,
        onStreamEnded: () => {
          setIsSessionActive(false);
          setIsScreenSharingActive(false);
          setSessionStatus("Stopped");
          showToast("Screen Share Ended ⚪", "Live desktop stream ended by user.", "info");
        },
      });

      const sId = broadcastRes.sessionId;
      const startTime = new Date();
      setSessionId(sId);
      setSessionStartTime(startTime);
      setIsSessionActive(true);
      setIsScreenSharingActive(true);
      setSessionStatus("Active");
      setElapsedSeconds(0);
      setActiveSeconds(0);
      setIdleSeconds(0);
      setLastActivityTimestamp(Date.now());

      const initialIntervalSec = getRandomScreenshotInterval(settings.minInterval, settings.maxInterval);
      setNextScreenshotTimer(initialIntervalSec);
      setNextIntervalMinutes(Math.round(initialIntervalSec / 60));

      const startEvent = {
        id: `t-${Date.now()}`,
        employee_id: employeeId,
        employee_name: employeeName,
        time: startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        type: "Login",
        detail: "Live WebRTC Entire Screen Broadcast started & Supervised",
        status: "Active",
      };
      addTimelineEvent(startEvent).then((updated) => setWorkTimelines(updated));

      showToast("🟢 Screen Sharing Active", "Admin can view your screen live during this work session.", "success");
    } catch (err) {
      console.warn("Screen share start error:", err);
      showToast("Notice ℹ️", "Screen capture permission was not granted or was cancelled.", "info");
    }
  };

  // === 4. Session Stop Handler ===
  const handleStopSession = async () => {
    await stopScreenBroadcast();
    setIsSessionActive(false);
    setIsScreenSharingActive(false);
    setSessionStatus("Stopped");

    const stopTime = new Date();
    const stopEvent = {
      id: `t-${Date.now()}`,
      employee_id: employeeId,
      employee_name: employeeName,
      time: stopTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      type: "Logout",
      detail: `Session ended. Total Active: ${Math.floor(activeSeconds / 60)}m, Idle: ${Math.floor(idleSeconds / 60)}m`,
      status: "Completed",
    };
    addTimelineEvent(stopEvent).then((updated) => setWorkTimelines(updated));

    showToast("Session Ended ⏹️", "Work session & screen sharing terminated.", "info");
  };

  // Consent Acceptance
  const handleAcceptConsent = () => {
    setIsConsentAccepted(true);
    sessionStorage.setItem("remote_monitoring_consent", "accepted");
    setIsConsentModalOpen(false);
    showToast("Consent Verified 🔒", "Privacy notice acknowledged. You may now start monitoring.", "success");
    setIsScreenPromptOpen(true);
  };

  // === 5. Admin WebRTC Live Screen Viewer ===
  const handleOpenLiveViewer = (user) => {
    if (viewerClientRef.current) {
      viewerClientRef.current.disconnect();
    }

    const targetKey = user.email || user.id || user.name;
    console.log(`[Admin] Opening Live Screen Viewer for ${user.name} (${targetKey})`);

    setLiveViewerModal({
      isOpen: true,
      user: user,
      connectionState: "connecting",
      stream: null,
      frameUrl: null,
      statusMessage: "Establishing WebRTC direct stream...",
      lastSeen: "Just now",
    });

    const client = new WebRTCViewerClient({
      userKey: targetKey,
      onRemoteStream: (stream) => {
        setLiveViewerModal((prev) => ({
          ...prev,
          stream: stream,
          connectionState: "connected",
          statusMessage: "WebRTC Live Stream Active 🟢",
        }));
      },
      onRemoteFrame: (frameUrl) => {
        setLiveViewerModal((prev) => ({
          ...prev,
          frameUrl: frameUrl,
          connectionState: "connected",
          statusMessage: "Live Telemetry Stream Active 🟢",
        }));
      },
      onConnectionStateChange: (st) => {
        setLiveViewerModal((prev) => ({
          ...prev,
          connectionState: st,
        }));
      },
      onStatusMessage: (msg) => {
        setLiveViewerModal((prev) => ({
          ...prev,
          statusMessage: msg,
        }));
      },
    });

    viewerClientRef.current = client;
    client.connect();
  };

  const handleCloseLiveViewer = () => {
    if (viewerClientRef.current) {
      viewerClientRef.current.disconnect();
      viewerClientRef.current = null;
    }
    setLiveViewerModal({
      isOpen: false,
      user: null,
      connectionState: "idle",
      stream: null,
      statusMessage: "",
      lastSeen: "Just now",
    });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (viewerContainerRef.current?.requestFullscreen) {
        viewerContainerRef.current.requestFullscreen();
        setIsFullscreenViewer(true);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreenViewer(false);
      }
    }
  };

  // Capture Audit Snapshot directly from Viewer Video Frame or dispatch snapshot request
  const handleCaptureViewerSnapshot = async () => {
    if (!liveViewerModal.user) return;
    const v = viewerVideoRef.current;
    let snapUrl = null;

    if (v && liveViewerModal.stream) {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = v.videoWidth || 1280;
        canvas.height = v.videoHeight || 720;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

        // Stamp Watermark
        ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        ctx.fillRect(16, canvas.height - 48, 560, 36);
        ctx.fillStyle = "#38bdf8";
        ctx.font = "bold 13px sans-serif";
        ctx.fillText(
          `NEXA AUDIT • ${liveViewerModal.user.name} • ${new Date().toLocaleTimeString()}`,
          26,
          canvas.height - 25
        );
        snapUrl = canvas.toDataURL("image/webp", 0.92);
      } catch (e) {
        console.warn("Could not grab video frame:", e);
      }
    } else if (liveViewerModal.frameUrl) {
      snapUrl = liveViewerModal.frameUrl;
    }

    if (snapUrl) {
      const snapRecord = {
        id: `snap-${Date.now()}`,
        employee_id: liveViewerModal.user.id,
        employee_name: liveViewerModal.user.name,
        department: liveViewerModal.user.department || "Engineering",
        screenshot_url: snapUrl,
        imageUrl: snapUrl,
        captured_app: "VS Code / Entire Desktop",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        date: new Date().toISOString().split("T")[0],
        activity_level: 95,
        resolution: `${v?.videoWidth || 1920}x${v?.videoHeight || 1080}`,
        device_name: "Remote Workstation",
        os: "Windows / macOS",
        ip_address: "192.168.1.45 (Remote VPN)",
        size: "145 KB",
      };

      await saveScreenshotLog(snapRecord);
      setScreenshots((prev) => [snapRecord, ...prev]);
      showToast("Snapshot Captured 📸", `High-res audit screenshot of ${liveViewerModal.user.name} saved.`, "success");
    } else {
      // Dispatch real-time snapshot request alert to remote user
      const targetEmail = (liveViewerModal.user.email || "").toLowerCase().trim();
      const snapRequest = {
        id: `snap-req-${Date.now()}`,
        type: "snapshot-request",
        target_email: targetEmail,
        target_name: liveViewerModal.user.name,
        sender: "Admin Supervision",
        message: "📸 Admin is requesting an instant audit snapshot of your screen. Click 'Grant & Capture' to send.",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        timestamp: new Date().toISOString(),
      };

      try {
        const notifChannel = supabase.channel("nexa-global-alerts");
        await notifChannel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            notifChannel.send({
              type: "broadcast",
              event: "snapshot-request",
              payload: snapRequest,
            });
            notifChannel.send({
              type: "broadcast",
              event: "ping",
              payload: snapRequest,
            });
          }
        });
      } catch (e) {}

      showToast("Snapshot Request Dispatched 📸", `Instant capture alert sent to ${liveViewerModal.user.name}'s device!`, "info");
    }
  };

  // Retention Purge Handler
  const handlePurgeRetention = async () => {
    try {
      const res = await purgeExpiredScreenshots(settings.retentionDays);
      await loadMonitoringData();
      showToast(
        "Retention Purge Complete 🗑️",
        `Purged ${res.removedCount} screenshots older than ${settings.retentionDays} days.`,
        "success"
      );
    } catch (e) {
      showToast("Purge Error ❌", "Failed to purge expired screenshots.", "error");
    }
  };

  // Format seconds to HH:MM:SS
  const formatTimeHHMMSS = (sec) => {
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  // Calculate Productivity Score %
  const totalTrackedSeconds = activeSeconds + idleSeconds;
  const productivityScore =
    totalTrackedSeconds > 0
      ? Math.round((activeSeconds / totalTrackedSeconds) * 100)
      : isSessionActive
      ? 100
      : 0;

  let productivityStatusLabel = "Ready to Track";
  let productivityStatusColor = "text-slate-500";

  if (isSessionActive || totalTrackedSeconds > 0) {
    if (productivityScore >= 90) {
      productivityStatusLabel = "High Focus Efficiency";
      productivityStatusColor = "text-emerald-600";
    } else if (productivityScore >= 75) {
      productivityStatusLabel = "Good Focus Efficiency";
      productivityStatusColor = "text-blue-600";
    } else if (productivityScore >= 50) {
      productivityStatusLabel = "Moderate Efficiency";
      productivityStatusColor = "text-amber-600";
    } else {
      productivityStatusLabel = "Low Focus / High Idle";
      productivityStatusColor = "text-rose-600";
    }
  }

  // Filtered Screenshots for Admin/Employee
  const filteredScreenshots = screenshots.filter((sc) => {
    if (role === "employee" && sc.employee_id !== employeeId) return false;
    if (selectedEmployeeFilter !== "All" && sc.employee_name !== selectedEmployeeFilter) return false;
    if (selectedDepartmentFilter !== "All" && sc.department !== selectedDepartmentFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = sc.employee_name?.toLowerCase().includes(q);
      const matchApp = sc.captured_app?.toLowerCase().includes(q);
      const matchDevice = sc.device_name?.toLowerCase().includes(q);
      if (!matchName && !matchApp && !matchDevice) return false;
    }
    return true;
  });

  // Filtered Timelines
  const filteredTimelines = workTimelines.filter((tl) => {
    if (role === "employee" && tl.employee_id !== employeeId) return false;
    if (selectedEmployeeFilter !== "All" && tl.employee_name !== selectedEmployeeFilter) return false;
    return true;
  });

  // Filtered Live Users List for Admin View
  const filteredLiveUsers = registeredUsers
    .filter((u) => {
      if (selectedDepartmentFilter !== "All" && u.department !== selectedDepartmentFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = u.name?.toLowerCase().includes(q);
        const matchEmail = u.email?.toLowerCase().includes(q);
        const matchDept = u.department?.toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchDept) return false;
      }
      return true;
    })
    .map((u) => {
      const activeSess = liveSessionsList.find(
        (s) =>
          (s.user_email && s.user_email.toLowerCase() === (u.email || "").toLowerCase()) ||
          (s.user_name && s.user_name.toLowerCase() === u.name.toLowerCase()) ||
          String(s.user_id) === String(u.id)
      );

      const isOnline = activeSess && activeSess.status === "Active";
      const isSharing = activeSess && activeSess.screen_sharing === "Active";

      let sessionDuration = "—";
      if (isOnline && activeSess.started_at) {
        const diffSec = Math.max(0, Math.floor((Date.now() - new Date(activeSess.started_at).getTime()) / 1000));
        sessionDuration = formatTimeHHMMSS(diffSec);
      }

      return {
        ...u,
        isOnline: Boolean(isOnline),
        isSharing: Boolean(isSharing),
        sessionStartTime: activeSess?.started_at ? new Date(activeSess.started_at).toLocaleTimeString() : "—",
        sessionDuration: sessionDuration,
        lastSeen: activeSess?.last_seen ? "Just now" : "Offline",
        activeSessionId: activeSess?.id || null,
      };
    });

  const liveActiveCount = filteredLiveUsers.filter((u) => u.isOnline || u.isSharing).length;

  return (
    <div className="space-y-4 sm:space-y-6 pb-12 font-sans w-full">
      {/* Hidden Canvas for Frame Processing */}
      <canvas ref={canvasRef} className="hidden" />

      {/* === STICKY FLOATING SCREEN SHARING BANNER FOR EMPLOYEE === */}
      {isScreenSharingActive && (
        <div className="sticky top-2 z-40 rounded-2xl border-2 border-emerald-500/40 bg-slate-900/95 backdrop-blur-md p-3.5 sm:p-4 text-white shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <div>
              <p className="font-bold text-xs sm:text-sm text-emerald-400 flex items-center gap-2">
                <span>🟢 Screen Sharing Active — Entire Desktop Live Stream</span>
              </p>
              <p className="text-[11px] text-slate-300">
                Admin can view your screen in real time during this work session.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-xs font-bold text-slate-200 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
              ⏱️ {formatTimeHHMMSS(elapsedSeconds)}
            </span>
            <button
              onClick={handleStopSession}
              className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <FaStop className="h-3 w-3" />
              <span>Stop Work Session</span>
            </button>
          </div>
        </div>
      )}

      {/* === TOP BANNER & ROLE SWITCHER === */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="w-full md:w-auto">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 sm:p-3 rounded-xl bg-blue-50 text-[#2563EB] shrink-0 mt-0.5 sm:mt-0">
              <FaDesktop className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                  Remote Live Screen & Monitoring Module
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <FaShieldAlt className="h-3 w-3" />
                  WebRTC P2P Direct Stream
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                Real-time entire desktop live screen access, activity tracking, automated random screenshots, and work timelines.
              </p>
            </div>
          </div>
        </div>

        {/* Role & Quick Controls */}
        <div className="w-full md:w-auto flex items-center justify-between md:justify-end gap-2 sm:gap-3">
          <div className="flex-1 md:flex-initial flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-medium">
            <button
              onClick={() => {
                setRole("admin");
                setActiveTab("live_users");
              }}
              className={`flex-1 md:flex-initial px-2.5 sm:px-3 py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                role === "admin"
                  ? "bg-white text-slate-900 shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Admin View
            </button>
            <button
              onClick={() => {
                setRole("employee");
                setActiveTab("overview");
              }}
              className={`flex-1 md:flex-initial px-2.5 sm:px-3 py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                role === "employee"
                  ? "bg-white text-slate-900 shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Employee View
            </button>
          </div>

          <button
            onClick={loadMonitoringData}
            className="p-2 sm:p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors shrink-0 cursor-pointer"
            title="Refresh Live Data"
          >
            <FaSync className="h-4 w-4" />
          </button>

          {/* Contextual 3-Dots Action Menu */}
          <div className="relative shrink-0">
            <button
              onClick={() => setIsHeaderKebabOpen(!isHeaderKebabOpen)}
              className="p-2 sm:p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              title="More Actions"
            >
              <FaEllipsisV className="h-4 w-4" />
            </button>

            {isHeaderKebabOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-xl bg-white p-1.5 shadow-lg border border-slate-200 z-30 space-y-1 text-xs">
                <button
                  onClick={() => {
                    setIsHeaderKebabOpen(false);
                    loadMonitoringData();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-slate-700 font-medium transition-colors"
                >
                  Sync Database Logs
                </button>

                <div className="border-t border-slate-100 my-1" />

                <button
                  onClick={() => {
                    setIsHeaderKebabOpen(false);
                    setConfirmModal({ isOpen: true, loading: false });
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-rose-50 text-rose-600 font-semibold transition-colors flex items-center gap-2"
                >
                  <FaTrash className="h-3 w-3" /> Clear All Data
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* === PRIVACY & TRANSPARENCY NOTICE BANNER === */}
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/80 via-white to-slate-50 p-4 sm:p-5 relative overflow-hidden">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="p-2.5 rounded-xl bg-blue-600 text-white shrink-0 shadow-xs">
            <FaShieldAlt className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="space-y-1 text-xs text-slate-600 leading-relaxed">
            <div className="flex flex-wrap items-center gap-2 font-bold text-slate-900 text-xs sm:text-sm">
              <span>Supervised Remote Work Session & Transparency Notice</span>
              <span className="text-[10px] bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded-full">
                Explicit Consent Required
              </span>
            </div>
            <p className="text-[11px] sm:text-xs">
              "When you start a work session, your entire computer desktop is streamed live to the Admin dashboard using encrypted WebRTC. Screen capture starts ONLY after you explicitly grant permission in your browser and stops immediately when you click Stop Session."
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 font-semibold text-slate-700 text-[11px] sm:text-xs">
              <span className="flex items-center gap-1 text-emerald-600">
                <FaCheckCircle className="h-3.5 w-3.5" /> Entire Desktop Live Access
              </span>
              <span className="flex items-center gap-1 text-emerald-600">
                <FaCheckCircle className="h-3.5 w-3.5" /> Real-time 60 FPS WebRTC Stream
              </span>
              <span className="flex items-center gap-1 text-emerald-600">
                <FaCheckCircle className="h-3.5 w-3.5" /> Auto-terminates on Stop or Logout
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* === WORK SESSION CONTROL PANEL (FOR EMPLOYEES & SIMULATION) === */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs space-y-4 sm:space-y-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-slate-100 pb-4 sm:pb-5">
          <div className="w-full lg:w-auto space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] sm:text-xs font-semibold text-blue-600 uppercase tracking-wider">
                Work Session Status — Select Profile:
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
              <select
                value={employeeName}
                onChange={(e) => {
                  const selectedName = e.target.value;
                  const foundUser = registeredUsers.find((u) => u.name === selectedName);
                  if (foundUser) {
                    setEmployeeName(foundUser.name);
                    setDepartment(foundUser.department);
                    setEmployeeId(foundUser.id);
                  } else {
                    setEmployeeName(selectedName);
                  }
                }}
                disabled={isSessionActive}
                className="w-full sm:w-auto px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-bold text-xs shadow-xs focus:ring-2 focus:ring-blue-500"
              >
                {registeredUsers.length === 0 ? (
                  <option value={employeeName || ""}>{employeeName || "No employee profiles available"}</option>
                ) : (
                  registeredUsers.map((u) => (
                    <option key={u.id} value={u.name}>
                      {u.name} ({u.department})
                    </option>
                  ))
                )}
              </select>

              <div className="flex items-center justify-between sm:justify-start gap-3">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 font-mono tracking-tight">
                  {formatTimeHHMMSS(elapsedSeconds)}
                </h2>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                    sessionStatus === "Active"
                      ? "bg-emerald-100 text-emerald-800 animate-pulse"
                      : sessionStatus === "Idle"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      sessionStatus === "Active"
                        ? "bg-emerald-500"
                        : sessionStatus === "Idle"
                        ? "bg-amber-500"
                        : "bg-slate-400"
                    }`}
                  />
                  {isScreenSharingActive ? "Screen Sharing 🟢" : sessionStatus}
                </span>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            {!isSessionActive ? (
              <button
                onClick={handleInitiateWorkSession}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-all shadow-md cursor-pointer"
              >
                <FaPlay className="h-3.5 w-3.5" />
                <span>Start Work Session (Share Entire Screen)</span>
              </button>
            ) : (
              <button
                onClick={handleStopSession}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 transition-all shadow-md cursor-pointer"
              >
                <FaStop className="h-3.5 w-3.5" />
                <span>Stop Work Session</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-100">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Active Productive Time</span>
              <FaClock className="text-emerald-500 h-4 w-4" />
            </div>
            <p className="text-base sm:text-lg font-bold text-slate-900 mt-2 font-mono">
              {Math.floor(activeSeconds / 60)}m {activeSeconds % 60}s
            </p>
            <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
              <div
                className="bg-emerald-500 h-1.5 rounded-full transition-all"
                style={{ width: `${Math.min(100, (activeSeconds / Math.max(1, elapsedSeconds)) * 100)}%` }}
              />
            </div>
          </div>

          <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-100">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Inactive / Idle Time</span>
              <FaClock className="text-amber-500 h-4 w-4" />
            </div>
            <p className="text-base sm:text-lg font-bold text-slate-900 mt-2 font-mono">
              {Math.floor(idleSeconds / 60)}m {idleSeconds % 60}s
            </p>
            <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
              <div
                className="bg-amber-500 h-1.5 rounded-full transition-all"
                style={{ width: `${Math.min(100, (idleSeconds / Math.max(1, elapsedSeconds)) * 100)}%` }}
              />
            </div>
          </div>

          <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-100">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Next Random Screenshot</span>
              <FaCamera className="text-blue-500 h-4 w-4" />
            </div>
            <p className="text-base sm:text-lg font-bold text-slate-900 mt-2 font-mono">
              in {Math.floor(nextScreenshotTimer / 60)}m {nextScreenshotTimer % 60}s
            </p>
            <p className="text-[10px] text-slate-400 mt-1">Randomized ({settings.minInterval}–{settings.maxInterval}m window)</p>
          </div>

          <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-100">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Productivity Score</span>
              <FaChartLine className="text-blue-600 h-4 w-4" />
            </div>
            <p className="text-base sm:text-lg font-bold text-blue-600 mt-2 font-mono">{productivityScore}%</p>
            <p className={`text-[10px] font-semibold mt-1 ${productivityStatusColor}`}>{productivityStatusLabel}</p>
          </div>
        </div>
      </div>

      {/* === DASHBOARD NAVIGATION TABS === */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-semibold overflow-x-auto no-scrollbar scroll-smooth">
        {role === "admin" && (
          <button
            onClick={() => setActiveTab("live_users")}
            className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all cursor-pointer ${
              activeTab === "live_users"
                ? "bg-blue-600 text-white shadow-sm font-bold"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <FaBroadcastTower className="h-4 w-4 text-emerald-400 animate-pulse" />
            <span>Live Users & Remote Screens</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white">
              {liveActiveCount} Live
            </span>
          </button>
        )}

        <button
          onClick={() => setActiveTab("overview")}
          className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl transition-all cursor-pointer ${
            activeTab === "overview" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <FaDesktop className="h-3.5 w-3.5" /> <span>Session Overview</span>
        </button>

        <button
          onClick={() => setActiveTab("screenshots")}
          className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl transition-all cursor-pointer ${
            activeTab === "screenshots" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <FaCamera className="h-3.5 w-3.5" /> <span>Screenshot Gallery ({filteredScreenshots.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("timeline")}
          className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl transition-all cursor-pointer ${
            activeTab === "timeline" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <FaHistory className="h-3.5 w-3.5" /> <span>Work Timeline</span>
        </button>

        <button
          onClick={() => setActiveTab("analytics")}
          className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl transition-all cursor-pointer ${
            activeTab === "analytics" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <FaChartPie className="h-3.5 w-3.5" /> <span>Productivity Analytics</span>
        </button>

        {role === "admin" && (
          <button
            onClick={() => setActiveTab("settings")}
            className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === "settings" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <FaShieldAlt className="h-3.5 w-3.5" /> <span>Retention & Rules</span>
          </button>
        )}
      </div>

      {/* === TAB 0: LIVE USERS & WEBRTC REMOTE SCREEN ACCESS (Admin Requirement) === */}
      {activeTab === "live_users" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Live Remote Users & Active Workstation Screens</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
              </h2>
              <p className="text-xs text-slate-500">
                Click <strong>"View Live Screen"</strong> to stream the user&apos;s active computer desktop in real time via encrypted WebRTC.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {role === "admin" && (
                <button
                  onClick={() => {
                    setUserSelectionMode("existing");
                    setIsAddUserModalOpen(true);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <FaUserPlus className="h-3.5 w-3.5" />
                  <span>Add Remote User</span>
                </button>
              )}

              <button
                onClick={loadMonitoringData}
                disabled={isLoadingUsers}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-60"
              >
                <FaSync className={`h-3.5 w-3.5 text-blue-600 ${isLoadingUsers ? "animate-spin" : ""}`} />
                <span>Refresh Status</span>
              </button>
            </div>
          </div>

          {/* Loading Skeletons */}
          {isLoadingUsers ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3].map((n) => (
                <div key={n} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs animate-pulse space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-200" />
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-slate-200 rounded w-1/2" />
                      <div className="h-3 bg-slate-100 rounded w-3/4" />
                    </div>
                  </div>
                  <div className="h-24 bg-slate-50 rounded-xl" />
                  <div className="h-10 bg-slate-200 rounded-xl" />
                </div>
              ))}
            </div>
          ) : filteredLiveUsers.length === 0 ? (
            /* Empty State */
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center space-y-4">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 text-2xl">
                <FaUserPlus />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">No Remote Users Found</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {searchQuery || selectedDepartmentFilter !== "All"
                    ? "No users matched your current search or filter."
                    : "No users have been registered in Remote Monitoring yet. Click below to add a user permanently to Supabase."}
                </p>
              </div>
              {role === "admin" && (
                <button
                  onClick={() => {
                    setUserSelectionMode("existing");
                    setIsAddUserModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs cursor-pointer"
                >
                  <FaUserPlus className="h-3.5 w-3.5" />
                  <span>Add First Remote User</span>
                </button>
              )}
            </div>
          ) : (
            /* Live Users Cards Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredLiveUsers.map((u) => {
                const isCurrentlyStreaming = u.isSharing;
                const isUserActive = u.status === "active" || u.is_active === true;

                return (
                  <div
                    key={u.id}
                    className={`rounded-2xl border bg-white p-5 shadow-xs transition-all relative overflow-hidden space-y-4 flex flex-col justify-between ${
                      isCurrentlyStreaming
                        ? "border-emerald-400 ring-2 ring-emerald-500/20 shadow-md"
                        : "border-slate-200 hover:border-slate-300"
                    } ${!isUserActive ? "opacity-75 bg-slate-50/50" : ""}`}
                  >
                    <div className="space-y-4">
                      {/* Top Bar: User Name & Role & Badges */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-xl text-white font-bold flex items-center justify-center text-sm shadow-xs shrink-0 ${
                            isUserActive
                              ? "bg-gradient-to-br from-blue-600 to-indigo-700"
                              : "bg-gradient-to-br from-slate-400 to-slate-600"
                          }`}>
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-slate-900 text-sm truncate">{u.name}</h3>
                            <p className="text-[11px] text-slate-500 truncate" title={u.email}>
                              {u.email}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1.5 ${
                              u.isOnline
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-slate-100 text-slate-600 border-slate-200"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                u.isOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                              }`}
                            />
                            {u.isOnline ? "Online" : "Offline"}
                          </span>

                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${
                              isUserActive
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}
                          >
                            {isUserActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </div>

                      {/* Metadata Specs Box */}
                      <div className="space-y-2 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-slate-700">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Department/Track:</span>
                          <strong className="text-slate-800 text-[11px] truncate max-w-[150px]">{u.department}</strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Designation / Role:</span>
                          <strong className="text-slate-800 text-[11px] truncate max-w-[150px]">{u.designation || u.role}</strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Screen Sharing:</span>
                          <span
                            className={`font-bold text-[11px] flex items-center gap-1 ${
                              u.isSharing ? "text-emerald-600" : "text-slate-500"
                            }`}
                          >
                            {u.isSharing ? "🟢 Sharing (Live)" : "⏸️ Inactive"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Session Duration:</span>
                          <strong className="font-mono text-slate-900 text-xs">{u.sessionDuration}</strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Last Seen:</span>
                          <span className="text-slate-600 text-[11px]">{u.lastSeen}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons & Admin Controls */}
                    <div className="space-y-2 pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleOpenLiveViewer(u)}
                        className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs ${
                          isCurrentlyStreaming
                            ? "bg-purple-600 hover:bg-purple-700 text-white shadow-purple-200 animate-pulse"
                            : "bg-slate-900 hover:bg-slate-800 text-white"
                        }`}
                      >
                        <FaDesktop className="h-3.5 w-3.5" />
                        <span>View Live Screen 🖥️</span>
                      </button>

                      {role === "admin" && (
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleToggleUserStatus(u)}
                            disabled={isTogglingStatus === (u.id || u.email)}
                            className={`flex-1 py-1.5 px-2.5 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                              isUserActive
                                ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            }`}
                            title={isUserActive ? "Deactivate User" : "Activate User"}
                          >
                            {isTogglingStatus === (u.id || u.email) ? (
                              <FaSpinner className="h-3 w-3 animate-spin" />
                            ) : isUserActive ? (
                              <>
                                <FaToggleOn className="h-3.5 w-3.5 text-amber-600" />
                                <span>Set Inactive</span>
                              </>
                            ) : (
                              <>
                                <FaToggleOff className="h-3.5 w-3.5 text-emerald-600" />
                                <span>Set Active</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteConfirmUser(u)}
                            className="p-1.5 px-2.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                            title="Remove from Remote Monitoring"
                          >
                            <FaTrash className="h-3 w-3 text-rose-600" />
                            <span>Remove</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* === TAB 1: SESSION OVERVIEW === */}
      {activeTab === "overview" && (
        <div className="space-y-4 sm:space-y-6">
          {/* Active Employee Cards Grid */}
          {remoteSessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center space-y-3">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                <FaDesktop className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">No Active Remote Work Sessions</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Click <strong>"Start Work Session"</strong> above to launch your first monitored session and record live activity.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {remoteSessions.map((sess) => (
                <div
                  key={sess.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden space-y-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">{sess.employee_name}</h3>
                      <p className="text-xs text-slate-500">{sess.department}</p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        sess.status === "Active"
                          ? "bg-emerald-100 text-emerald-800"
                          : sess.status === "Idle"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {sess.status}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Current App:</span>
                      <span className="font-semibold text-slate-800 truncate max-w-[140px]" title={sess.current_app}>
                        {sess.current_app}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Productivity:</span>
                      <span className="font-bold text-blue-600">{sess.productivity_score}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Active vs Idle:</span>
                      <span className="font-medium text-slate-700">
                        {sess.active_minutes}m / {sess.idle_minutes}m
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100 pt-3">
                    <span>{sess.device_name}</span>
                    <span>{sess.ip_address}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* App Usage Breakdown Section */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FaLaptopCode className="text-blue-600" /> Daily Application & Website Usage Summary
            </h3>
            <div className="space-y-3">
              {appUsageList.map((app) => (
                <div key={app.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span>
                      {app.app_name} <span className="text-[10px] text-slate-400 font-normal">({app.category})</span>
                    </span>
                    <span>
                      {app.usage_minutes} mins ({app.percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${app.percentage}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* === TAB 2: SCREENSHOT GALLERY === */}
      {activeTab === "screenshots" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Captured Screenshots Gallery</h2>
              <p className="text-xs text-slate-500">
                Automated random screenshots captured every 5–15 minutes with complete device metadata.
              </p>
            </div>
            {role === "admin" && (
              <button
                onClick={handlePurgeRetention}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-semibold text-xs hover:bg-rose-100 transition-colors"
              >
                <FaTrash className="h-3 w-3" /> Auto-Purge (&gt;{settings.retentionDays} Days)
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filteredScreenshots.map((sc) => (
              <div
                key={sc.id}
                className="group rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div
                  className="relative aspect-video bg-slate-900 overflow-hidden cursor-pointer"
                  onClick={() => setSelectedScreenshotModal(sc)}
                >
                  <img
                    src={sc.screenshot_url}
                    alt={sc.captured_app}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-2 font-semibold text-xs">
                    <FaImage className="h-4 w-4" /> Preview
                  </div>
                  <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-slate-900/80 text-white text-[10px] font-mono">
                    {sc.resolution}
                  </span>
                </div>

                <div className="p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 truncate max-w-[140px]">{sc.employee_name}</span>
                    <span className="text-slate-400 text-[11px]">{sc.time}</span>
                  </div>
                  <p className="text-slate-600 truncate font-medium" title={sc.captured_app}>
                    {sc.captured_app}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100 pt-2">
                    <span>OS: {sc.os}</span>
                    <span className="text-emerald-600 font-semibold">{sc.activity_level}% Active</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === TAB 3: WORK TIMELINE === */}
      {activeTab === "timeline" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Chronological Work Timeline</h2>
              <p className="text-xs text-slate-500">
                Real-time sequence of employee logins, focus apps, screenshot captures, and idle alerts.
              </p>
            </div>
          </div>

          <div className="relative border-l-2 border-slate-200 ml-4 space-y-6">
            {filteredTimelines.map((tl, idx) => (
              <div key={tl.id || idx} className="relative pl-6">
                <div
                  className={`absolute -left-[9px] top-1.5 h-4 w-4 rounded-full border-2 bg-white ${
                    tl.type === "Login"
                      ? "border-emerald-500"
                      : tl.type === "Screenshot"
                      ? "border-blue-500"
                      : tl.type === "Idle Alert"
                      ? "border-amber-500"
                      : "border-slate-400"
                  }`}
                />

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">
                      {tl.employee_name} — {tl.type}
                    </span>
                    <span className="text-slate-400 font-mono">{tl.time}</span>
                  </div>
                  <p className="text-xs text-slate-600">{tl.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === TAB 4: PRODUCTIVITY ANALYTICS === */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Average Focus Time</h3>
              <p className="text-3xl font-black text-slate-900">
                {elapsedSeconds > 0
                  ? `${Math.floor(elapsedSeconds / 3600)}h ${Math.floor((elapsedSeconds % 3600) / 60)}m`
                  : "—"}
              </p>
              <p className="text-xs text-slate-500">Current session duration</p>
            </div>

            <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Activity Score</h3>
              <p className="text-3xl font-black text-blue-600">
                {elapsedSeconds > 0 ? `${Math.round((activeSeconds / elapsedSeconds) * 100)}%` : "—"}
              </p>
              <p className="text-xs text-slate-500">Active vs total session time</p>
            </div>

            <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Screenshots Logged</h3>
              <p className="text-3xl font-black text-slate-900">{screenshots.length} Captures</p>
              <p className="text-xs text-slate-500">Randomized 5-15 min policy</p>
            </div>
          </div>
        </div>
      )}

      {/* === TAB 5: RETENTION & RULES SETTINGS === */}
      {activeTab === "settings" && role === "admin" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
          <h2 className="text-base font-bold text-slate-900">Monitoring Configuration & Retention Policy</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl text-xs">
            <div className="space-y-2">
              <label className="font-semibold text-slate-700 block">Screenshot Retention Period (Days)</label>
              <input
                type="number"
                value={settings.retentionDays}
                onChange={(e) => setSettings({ ...settings, retentionDays: Number(e.target.value) })}
                className="w-full p-2.5 rounded-xl border border-slate-200 text-xs"
              />
            </div>
            <div className="space-y-2">
              <label className="font-semibold text-slate-700 block">Minimum Interval (Minutes)</label>
              <input
                type="number"
                value={settings.minInterval}
                onChange={(e) => setSettings({ ...settings, minInterval: Number(e.target.value) })}
                className="w-full p-2.5 rounded-xl border border-slate-200 text-xs"
              />
            </div>
          </div>
          <button
            onClick={() => {
              saveMonitoringSettings(settings);
              showToast("Settings Saved ⚙️", "Monitoring policy updated.", "success");
            }}
            className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 shadow-xs cursor-pointer"
          >
            Save Settings
          </button>
        </div>
      )}

      {/* === MODAL 1: ENTIRE SCREEN SHARING GUIDE (FOR EMPLOYEE) === */}
      {isScreenPromptOpen && (
        <Modal
          isOpen={isScreenPromptOpen}
          onClose={() => setIsScreenPromptOpen(false)}
          title="🖥️ Start Work Session: Entire Screen Sharing Required"
        >
          <div className="space-y-4 text-xs text-slate-700">
            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 space-y-2">
              <h4 className="font-bold text-blue-900 text-sm flex items-center gap-2">
                <FaDesktop className="text-blue-600" /> Instructions for Screen Sharing:
              </h4>
              <p className="text-blue-800 leading-relaxed">
                When you click <strong>&quot;Grant Entire Screen &amp; Start&quot;</strong>, your browser will show a permission popup.
              </p>
              <div className="bg-white p-3 rounded-xl border border-blue-200 space-y-1.5 font-medium text-slate-800">
                <p className="text-emerald-700 font-bold">
                  👉 1. In the popup tab bar, click <u>&quot;Entire Screen&quot;</u> (NOT Chrome Tab or Window).
                </p>
                <p>👉 2. Click on your computer screen thumbnail to select it.</p>
                <p>👉 3. Click the <strong>&quot;Share&quot;</strong> button.</p>
              </div>
            </div>

            <p className="text-slate-500 text-[11px]">
              This allows Admin to view your actual desktop workspace (VS Code, terminal, browser, and tools) in real time during your active work session.
            </p>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsScreenPromptOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmStartBroadcast}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm transition-colors cursor-pointer flex items-center gap-2"
              >
                <FaPlay className="h-3 w-3" />
                <span>Grant Entire Screen &amp; Start</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* === MODAL 2: DEDICATED WEBRTC LIVE SCREEN VIEWER FOR ADMIN === */}
      {liveViewerModal.isOpen && liveViewerModal.user && (
        <Modal
          isOpen={liveViewerModal.isOpen}
          onClose={handleCloseLiveViewer}
          title={`🖥️ ${liveViewerModal.user.name} — Live Remote Screen`}
        >
          <div ref={viewerContainerRef} className="space-y-4 text-xs text-slate-900">
            {/* Top Telemetry Info Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 bg-slate-900 text-white rounded-2xl border border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center text-xs">
                  {liveViewerModal.user.name.charAt(0)}
                </div>
                <div>
                  <h4 className="font-bold text-xs text-white">{liveViewerModal.user.name}</h4>
                  <p className="text-[10px] text-cyan-300 font-mono">
                    {liveViewerModal.user.email} • {liveViewerModal.user.department}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span
                  className={`px-2.5 py-1 rounded-xl font-bold border flex items-center gap-1.5 ${
                    liveViewerModal.connectionState === "connected"
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                      : liveViewerModal.connectionState === "connecting"
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse"
                      : "bg-rose-500/20 text-rose-300 border-rose-500/40"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      liveViewerModal.connectionState === "connected"
                        ? "bg-emerald-400 animate-pulse"
                        : liveViewerModal.connectionState === "connecting"
                        ? "bg-amber-400"
                        : "bg-rose-500"
                    }`}
                  />
                  {liveViewerModal.connectionState === "connected"
                    ? "🟢 Live WebRTC (60 FPS)"
                    : liveViewerModal.connectionState === "connecting"
                    ? "🟡 Connecting..."
                    : liveViewerModal.connectionState === "stopped"
                    ? "Screen Sharing Stopped"
                    : "Reconnecting..."}
                </span>

                <span className="bg-slate-800 text-slate-300 px-2.5 py-1 rounded-xl border border-slate-700">
                  Last Seen: {liveViewerModal.lastSeen}
                </span>
              </div>
            </div>

            {/* Main Video Screen Player */}
            <div className="rounded-2xl overflow-hidden bg-black border-2 border-slate-800 shadow-2xl relative min-h-[380px] max-h-[72vh] flex flex-col items-center justify-center p-2">
              {liveViewerModal.stream ? (
                <video
                  ref={(node) => {
                    if (node && liveViewerModal.stream) {
                      node.srcObject = liveViewerModal.stream;
                      node.play().catch(() => {});
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-auto max-h-[68vh] object-contain rounded-xl bg-black block"
                />
              ) : liveViewerModal.frameUrl ? (
                <div className="relative w-full h-full flex items-center justify-center bg-black">
                  <img
                    src={liveViewerModal.frameUrl}
                    alt="Live Screen Stream"
                    className="w-full h-auto max-h-[68vh] object-contain rounded-xl"
                  />
                  <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-emerald-600 text-white font-bold text-[10px] flex items-center gap-1 shadow-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                    Live Stream Active 🟢
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center space-y-3">
                  <FaDesktop className="text-5xl text-blue-400 animate-pulse" />
                  <p className="text-sm font-bold text-white">
                    {liveViewerModal.connectionState === "connecting"
                      ? `Establishing WebRTC direct stream with ${liveViewerModal.user.name}...`
                      : liveViewerModal.connectionState === "stopped"
                      ? "Remote user stopped screen sharing."
                      : "Waiting for remote workstation stream signal..."}
                  </p>
                  <p className="text-xs text-slate-400 max-w-sm">
                    {liveViewerModal.connectionState === "connecting"
                      ? "Exchanging encrypted SDP offers and ICE candidates over Supabase Realtime."
                      : "The user has paused screen capture or the session is currently offline."}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleOpenLiveViewer(liveViewerModal.user)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-lg"
                  >
                    <FaSync className="h-3.5 w-3.5" />
                    <span>Reconnect Stream</span>
                  </button>
                </div>
              )}
            </div>

            {/* Viewer Bottom Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs border border-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {isFullscreenViewer ? <FaCompress className="h-3.5 w-3.5" /> : <FaExpand className="h-3.5 w-3.5" />}
                  <span>{isFullscreenViewer ? "Exit Fullscreen" : "Fullscreen"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCaptureViewerSnapshot}
                  disabled={liveViewerModal.connectionState !== "connected"}
                  className="px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 disabled:opacity-50 text-purple-700 font-bold text-xs border border-purple-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <FaCamera className="h-3.5 w-3.5" />
                  <span>Capture Audit Snapshot</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    try {
                      const pings = JSON.parse(localStorage.getItem("nexa_active_pings") || "[]");
                      const newPing = {
                        id: `ping-${Date.now()}`,
                        target_email: (liveViewerModal.user.email || "").toLowerCase().trim(),
                        target_name: liveViewerModal.user.name,
                        message: "Admin is reviewing your live workstation screen.",
                        timestamp: new Date().toISOString(),
                      };
                      pings.unshift(newPing);
                      localStorage.setItem("nexa_active_pings", JSON.stringify(pings.slice(0, 30)));
                      window.dispatchEvent(new Event("nexa_ping_received"));
                      showToast("Ping Sent 🔔", `Supervision alert sent to ${liveViewerModal.user.name}.`, "info");
                    } catch (e) {}
                  }}
                  className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs border border-blue-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <FaBell className="h-3.5 w-3.5" />
                  <span>Ping User</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleCloseLiveViewer}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Close Viewer ✕
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* === MODAL 3: CONSENT MODAL === */}
      {isConsentModalOpen && (
        <Modal
          isOpen={isConsentModalOpen}
          onClose={() => setIsConsentModalOpen(false)}
          title="🔒 Remote Work Monitoring Consent Notice"
        >
          <div className="space-y-4 text-xs text-slate-600">
            <div className="p-3.5 bg-blue-50 rounded-xl border border-blue-100 text-slate-800">
              <p className="font-semibold leading-relaxed">
                &quot;This work session is monitored for productivity purposes. The system collects screenshots at random intervals (5–15 minutes), activity information (mouse/keyboard input), application usage, and work timelines strictly during your active work session.&quot;
              </p>
            </div>

            <ul className="space-y-1.5 list-disc pl-5 font-medium text-slate-700">
              <li>Monitoring runs ONLY when your work session is Active.</li>
              <li>Monitoring stops automatically upon logout or clicking Stop Session.</li>
              <li>You can view all your captured screenshots and activity logs at any time.</li>
            </ul>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                onClick={() => setIsConsentModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleAcceptConsent}
                className="px-5 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
              >
                I Acknowledge &amp; Start Session
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* === MODAL 4: SCREENSHOT LIGHTBOX PREVIEW MODAL === */}
      {selectedScreenshotModal && (
        <Modal
          isOpen={!!selectedScreenshotModal}
          onClose={() => setSelectedScreenshotModal(null)}
          title={`Screenshot Metadata — ${selectedScreenshotModal.employee_name}`}
        >
          <div className="space-y-4 text-xs">
            <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-200">
              <img
                src={selectedScreenshotModal.screenshot_url}
                alt="Captured Screen"
                className="w-full h-auto max-h-[60vh] object-contain"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 bg-slate-50 p-3.5 sm:p-4 rounded-xl border border-slate-200 text-slate-700">
              <div className="truncate">
                <span className="text-slate-400">Employee:</span> <strong>{selectedScreenshotModal.employee_name}</strong>
              </div>
              <div className="truncate">
                <span className="text-slate-400">Department:</span> <strong>{selectedScreenshotModal.department}</strong>
              </div>
              <div className="truncate">
                <span className="text-slate-400">App Captured:</span> <strong>{selectedScreenshotModal.captured_app}</strong>
              </div>
              <div className="truncate">
                <span className="text-slate-400">Timestamp:</span>{" "}
                <strong>
                  {selectedScreenshotModal.time} ({selectedScreenshotModal.date})
                </strong>
              </div>
              <div className="truncate">
                <span className="text-slate-400">Device Name:</span> <strong>{selectedScreenshotModal.device_name}</strong>
              </div>
              <div className="truncate">
                <span className="text-slate-400">OS:</span> <strong>{selectedScreenshotModal.os}</strong>
              </div>
              <div className="truncate">
                <span className="text-slate-400">IP Address:</span> <strong>{selectedScreenshotModal.ip_address}</strong>
              </div>
              <div className="truncate">
                <span className="text-slate-400">Compressed Size:</span> <strong>{selectedScreenshotModal.size}</strong>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-0 justify-between items-stretch sm:items-center pt-2">
              <a
                href={selectedScreenshotModal.screenshot_url}
                target="_blank"
                rel="noreferrer"
                download
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors cursor-pointer text-center"
              >
                <FaDownload className="h-3.5 w-3.5" /> <span>Download Screenshot</span>
              </a>

              <button
                onClick={() => setSelectedScreenshotModal(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold cursor-pointer text-center"
              >
                Close Preview
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* === MODAL 6: ADD REMOTE USER (SUPABASE PERSISTENCE) === */}
      {isAddUserModalOpen && (
        <Modal
          isOpen={isAddUserModalOpen}
          onClose={() => {
            if (!isAddingUser) {
              setIsAddUserModalOpen(false);
              setUserSearchModalQuery("");
            }
          }}
          title="Add Remote User to Monitoring"
        >
          <div className="space-y-4 text-xs">
            {/* Mode Switcher */}
            <div className="flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setUserSelectionMode("existing")}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  userSelectionMode === "existing"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Select Existing System User
              </button>
              <button
                type="button"
                onClick={() => setUserSelectionMode("custom")}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  userSelectionMode === "custom"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Create Custom Remote Profile
              </button>
            </div>

            {/* TAB 1: SELECT EXISTING SYSTEM USER */}
            {userSelectionMode === "existing" && (
              <div className="space-y-3">
                <div className="relative">
                  <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
                  <input
                    type="text"
                    value={userSearchModalQuery}
                    onChange={(e) => setUserSearchModalQuery(e.target.value)}
                    placeholder="Search employees, interns, or students by name/email..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>

                <div className="max-h-60 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100">
                  {availableSystemUsers
                    .filter((u) => {
                      if (!userSearchModalQuery.trim()) return true;
                      const q = userSearchModalQuery.toLowerCase();
                      return (
                        u.name?.toLowerCase().includes(q) ||
                        u.email?.toLowerCase().includes(q) ||
                        u.department?.toLowerCase().includes(q)
                      );
                    })
                    .map((sysUser) => {
                      const isAlreadyAdded = registeredUsers.some(
                        (r) => (r.email || "").toLowerCase() === (sysUser.email || "").toLowerCase()
                      );

                      return (
                        <div
                          key={sysUser.email}
                          className="pt-2 first:pt-0 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0">
                              {sysUser.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 text-xs truncate">{sysUser.name}</p>
                              <p className="text-[10px] text-slate-500 truncate">{sysUser.email} • {sysUser.department}</p>
                            </div>
                          </div>

                          {isAlreadyAdded ? (
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold shrink-0 flex items-center gap-1">
                              <FaCheck className="h-2.5 w-2.5" /> In Monitoring
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={isAddingUser}
                              onClick={async () => {
                                setNewRemoteUser({
                                  name: sysUser.name,
                                  email: sysUser.email,
                                  department: sysUser.department || "Software Engineering",
                                  designation: sysUser.designation || "Remote Member",
                                  role: sysUser.role || "employee",
                                  deviceName: "Workstation",
                                });
                                // Execute addition directly
                                setIsAddingUser(true);
                                try {
                                  const res = await fetch("/api/remote-users", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      action: "add_user",
                                      userData: {
                                        name: sysUser.name,
                                        email: sysUser.email,
                                        department: sysUser.department || "Software Engineering",
                                        designation: sysUser.designation || "Remote Member",
                                        role: sysUser.role || "employee",
                                        deviceName: "Workstation",
                                      },
                                      requesterEmail: userEmail || "admin@gmail.com",
                                      requesterRole: role,
                                    }),
                                  });
                                  const data = await res.json();
                                  if (!res.ok || !data.success) {
                                    throw new Error(data.error || "Failed to add remote user.");
                                  }
                                  showToast("Remote User Added 🎉", `User "${sysUser.name}" added to Supabase database.`, "success");
                                  setIsAddUserModalOpen(false);
                                  setUserSearchModalQuery("");
                                  await loadMonitoringData();
                                } catch (err) {
                                  showToast("Error Adding User ❌", err.message, "error");
                                } finally {
                                  setIsAddingUser(false);
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[11px] shrink-0 transition-colors shadow-xs cursor-pointer flex items-center gap-1"
                            >
                              <FaPlusCircle className="h-3 w-3" />
                              <span>Add</span>
                            </button>
                          )}
                        </div>
                      );
                    })}

                  {availableSystemUsers.length === 0 && (
                    <p className="text-center text-slate-400 py-4">No system users found. Switch to custom tab to create one.</p>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: CREATE CUSTOM REMOTE USER */}
            {userSelectionMode === "custom" && (
              <form onSubmit={handleAddRemoteUser} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={newRemoteUser.name}
                    onChange={(e) => setNewRemoteUser({ ...newRemoteUser, name: e.target.value })}
                    placeholder="e.g. Ahmed Khan"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700">Email Address (Unique Login) *</label>
                  <input
                    type="email"
                    required
                    value={newRemoteUser.email}
                    onChange={(e) => setNewRemoteUser({ ...newRemoteUser, email: e.target.value })}
                    placeholder="e.g. ahmed@company.com"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">Department / Domain</label>
                    <input
                      type="text"
                      value={newRemoteUser.department}
                      onChange={(e) => setNewRemoteUser({ ...newRemoteUser, department: e.target.value })}
                      placeholder="e.g. Frontend Engineering"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">Designation / Role</label>
                    <input
                      type="text"
                      value={newRemoteUser.designation}
                      onChange={(e) => setNewRemoteUser({ ...newRemoteUser, designation: e.target.value })}
                      placeholder="e.g. Senior React Developer"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">User Role</label>
                    <select
                      value={newRemoteUser.role}
                      onChange={(e) => setNewRemoteUser({ ...newRemoteUser, role: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                    >
                      <option value="employee">Employee</option>
                      <option value="intern">Intern</option>
                      <option value="student">Student</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">Device Workstation</label>
                    <input
                      type="text"
                      value={newRemoteUser.deviceName}
                      onChange={(e) => setNewRemoteUser({ ...newRemoteUser, deviceName: e.target.value })}
                      placeholder="e.g. Dell XPS 15 (Remote)"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsAddUserModalOpen(false)}
                    disabled={isAddingUser}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isAddingUser}
                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    {isAddingUser ? <FaSpinner className="animate-spin h-3.5 w-3.5" /> : <FaPlusCircle className="h-3.5 w-3.5" />}
                    <span>{isAddingUser ? "Saving to Supabase..." : "Save Remote User"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </Modal>
      )}

      {/* === MODAL 7: DELETE REMOTE USER CONFIRMATION MODAL === */}
      {deleteConfirmUser && (
        <Modal
          isOpen={!!deleteConfirmUser}
          onClose={() => {
            if (!isDeletingUser) setDeleteConfirmUser(null);
          }}
          title="Remove Remote User"
        >
          <div className="space-y-4 text-xs text-slate-700">
            <div className="p-3.5 bg-rose-50 rounded-xl border border-rose-200 text-rose-800 space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <FaExclamationTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>Remove user from Remote Monitoring?</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                This will permanently delete <strong>{deleteConfirmUser.name}</strong> ({deleteConfirmUser.email}) from the Supabase <code>remote_users</code> table.
              </p>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmUser(null)}
                disabled={isDeletingUser}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteRemoteUser}
                disabled={isDeletingUser}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {isDeletingUser ? <FaSpinner className="animate-spin h-3.5 w-3.5" /> : <FaTrash className="h-3.5 w-3.5" />}
                <span>{isDeletingUser ? "Removing..." : "Permanently Remove"}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* === MODAL 8: DESTRUCTIVE ACTION CONFIRMATION MODAL === */}
      {confirmModal.isOpen && (
        <Modal
          isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal({ isOpen: false, loading: false })}
          title="Confirm Destructive Action"
        >
          <div className="space-y-4 text-xs text-slate-700">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">
              <FaExclamationTriangle className="h-5 w-5 shrink-0 text-rose-600" />
              <p className="font-semibold">
                Are you sure you want to clear all monitoring logs and sessions? This action cannot be undone.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <button
                onClick={() => setConfirmModal({ isOpen: false, loading: false })}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setConfirmModal({ ...confirmModal, loading: true });
                  if (typeof window !== "undefined") {
                    localStorage.removeItem("remote_work_sessions");
                    localStorage.removeItem("remote_screenshot_logs");
                    localStorage.removeItem("remote_work_timelines");
                    localStorage.removeItem("remote_activity_logs");
                    localStorage.removeItem("remote_app_usage_logs");
                  }
                  setRemoteSessions([]);
                  setScreenshots([]);
                  setWorkTimelines([]);
                  setConfirmModal({ isOpen: false, loading: false });
                  showToast("Data Cleared 🗑️", "All dummy monitoring sessions and logs removed.", "info");
                }}
                disabled={confirmModal.loading}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition-colors shadow-xs cursor-pointer"
              >
                {confirmModal.loading ? "Clearing..." : "Confirm & Clear All Data 🗑️"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

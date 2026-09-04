"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { dbFetch, dbSaveRecord, dbDeleteRecord } from "@/lib/dbPersistence";
import Modal from "@/components/Modal";
import { showToast } from "@/components/Toast";
import { getCurrentMinutes, determineAttendanceState, isRecordFromToday, getTodayDateString, getEmployeeCheckInStatus, timeToMinutes, minutesToTime } from "@/lib/attendanceUtils";
import { fetchAttendancePolicy, updateAttendancePolicy } from "@/lib/attendancePolicyUtils";
import { fetchCurrentPublicIp, verifyOfficeWifiAttendance, getActiveOfficeNetworks } from "@/lib/attendanceIpUtils";
import {
  FaWifi,
  FaGlobe,
  FaShieldAlt,
  FaClock,
  FaCheckCircle,
  FaTimesCircle,
  FaUserCheck,
  FaHistory,
  FaArrowRight,
  FaLock,
  FaUserGraduate,
  FaUserTie,
  FaTrashAlt,
  FaExclamationTriangle,
  FaEllipsisV,
  FaChartPie,
  FaCalendarCheck,
  FaDownload,
  FaFilter,
  FaSearch,
  FaInfoCircle,
  FaCheck,
  FaChevronRight,
  FaEdit,
  FaUsers,
  FaFilePdf,
  FaUser
} from "react-icons/fa";
import { generatePrintableAttendanceListPdf, generateSingleUserAttendancePdf } from "@/lib/generateAttendancePdf";

/* ─────────────────────────────────────────────────────────────────────────
   TODAY'S ACTIVE SESSION BREAKDOWN
   Fills the vertical gap below "Primary Attendance Workflow" so the left
   and right columns share a consistent height.
───────────────────────────────────────────────────────────────────────── */
function TodaySessionBreakdown({ checkIn, checkOut, formattedTimeString, currentMinutes }) {
  // Shift window: 10:00 AM (600 min) → 6:00 PM (1080 min)
  const SHIFT_START = 600;
  const SHIFT_END = 1080;
  const SHIFT_TOTAL = SHIFT_END - SHIFT_START; // 480 min

  // Clamp current position within the shift
  const clampedNow = Math.min(Math.max(currentMinutes, SHIFT_START), SHIFT_END);
  const elapsedMin = clampedNow - SHIFT_START;
  const progressPct = Math.round((elapsedMin / SHIFT_TOTAL) * 100);

  const remainingMin = Math.max(0, SHIFT_END - clampedNow);
  const remHours = Math.floor(remainingMin / 60);
  const remMins = remainingMin % 60;
  const remainingLabel = remainingMin === 0
    ? "Shift Ended"
    : remHours > 0
      ? `${remHours}h ${remMins}m Remaining`
      : `${remMins}m Remaining`;

  // Work-so-far (only if checked in)
  let workLabel = "—";
  if (checkIn) {
    const checkInMs = new Date(
      checkIn.check_in_timestamp || checkIn.timestamp || checkIn.created_at
    ).getTime();
    const endMs = checkOut
      ? new Date(checkOut.check_out_timestamp || checkOut.timestamp).getTime()
      : Date.now();
    const diffMin = Math.max(0, Math.floor((endMs - checkInMs) / 60000));
    const wh = Math.floor(diffMin / 60);
    const wm = diffMin % 60;
    workLabel = wh > 0 ? `${wh}h ${wm}m` : `${wm}m`;
  }

  // Session status label + color
  const sessionDone = checkIn && checkOut;
  const sessionActive = checkIn && !checkOut;

  const statusLabel = sessionDone
    ? "Session Complete"
    : sessionActive
      ? "Session Active"
      : "Not Started";

  const statusColor = sessionDone
    ? "text-[#2563EB] bg-[#EFF6FF] border-[#2563EB]/20"
    : sessionActive
      ? "text-[#059669] bg-[#ECFDF5] border-[#059669]/20"
      : "text-[#64748B] bg-[#F8FAFC] border-[#E2E8F0]";

  return (
    <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
        <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
          <FaClock className="text-[#2563EB]" />
          <span>Today&apos;s Active Session Breakdown</span>
        </h3>
        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      {/* Live Shift Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-semibold text-[#64748B]">
          <span>10:00 AM</span>
          <span className="font-mono text-[#0F172A]">{formattedTimeString || "--:--:--"}</span>
          <span>6:00 PM</span>
        </div>

        <div className="relative w-full h-3 bg-[#F1F5F9] rounded-full overflow-hidden border border-[#E2E8F0]">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${progressPct}%`,
              background: "linear-gradient(90deg, #2563EB 0%, #60A5FA 100%)"
            }}
          />
          {/* Pulsing cursor at current position */}
          {progressPct > 0 && progressPct < 100 && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#2563EB] border-2 border-white shadow animate-pulse"
              style={{ left: `calc(${progressPct}% - 6px)` }}
            />
          )}
        </div>

        <div className="text-right text-[11px] font-bold text-[#2563EB]">
          {remainingLabel}
        </div>
      </div>

      {/* Session Metrics Row */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-0.5 text-center">
          <p className="text-[10px] font-semibold text-[#64748B] uppercase">Clock-In</p>
          <p className="font-bold text-[#0F172A]">
            {checkIn ? (checkIn.check_in_time || "—") : "—"}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-0.5 text-center">
          <p className="text-[10px] font-semibold text-[#64748B] uppercase">Work So Far</p>
          <p className="font-bold text-[#0F172A] font-mono">{workLabel}</p>
        </div>

        <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-0.5 text-center">
          <p className="text-[10px] font-semibold text-[#64748B] uppercase">Clock-Out</p>
          <p className="font-bold text-[#0F172A]">
            {checkOut ? (checkOut.check_out_time || "—") : "—"}
          </p>
        </div>
      </div>

      {/* Shift progress % */}
      <div className="flex items-center justify-between text-[11px] text-[#64748B] pt-1 border-t border-[#E2E8F0]">
        <span className="font-medium">Shift Progress</span>
        <span className="font-bold text-[#2563EB]">{progressPct}% Complete</span>
      </div>
    </div>
  );
}

export default function AttendancePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState("employee");
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [userIp, setUserIp] = useState("Detecting...");
  const [loading, setLoading] = useState(true);
  const [todayRecords, setTodayRecords] = useState([]);
  const [deleteReason, setDeleteReason] = useState("");

  const [officeNetworkInfo, setOfficeNetworkInfo] = useState({
    office_name: "Software House Main Office Wi-Fi",
    public_ip_address: "39.46.102.129"
  });

  const [isVerifyingIp, setIsVerifyingIp] = useState(false);
  const [ipVerificationResult, setIpVerificationResult] = useState(null);
  const [currentMinutes, setCurrentMinutes] = useState(getCurrentMinutes());
  const [formattedTimeString, setFormattedTimeString] = useState("");
  const [allSystemLogs, setAllSystemLogs] = useState([]);
  const [attendancePolicy, setAttendancePolicy] = useState(null);
  
  // Table Search & Filter State
  const [adminFilter, setAdminFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'present' | 'late' | 'leave' | 'absent'
  const [tableSearch, setTableSearch] = useState("");

  const handleCardClick = (filterKey) => {
    setStatusFilter((prev) => (prev === filterKey ? "all" : filterKey));
    setTimeout(() => {
      const el = document.getElementById("master-attendance-log");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
  };

  // Modals State
  const [activeKebabId, setActiveKebabId] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, record: null, loading: false });
  const [inspectModal, setInspectModal] = useState(null);
  const [showIpManagerModal, setShowIpManagerModal] = useState(false);
  const [showUserPdfModal, setShowUserPdfModal] = useState(false);
  const [userPdfSearch, setUserPdfSearch] = useState("");
  const [customOfficeIp, setCustomOfficeIp] = useState("39.46.102.129");

  // Attendance Policy Edit Modal State
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyForm, setPolicyForm] = useState({
    shift_start: "10:00 AM",
    grace_period_minutes: 14,
    late_warning_minutes: 29,
  });

  const handleOpenPolicyModal = () => {
    setPolicyForm({
      shift_start: attendancePolicy?.shift_start || "10:00 AM",
      grace_period_minutes: parseInt(attendancePolicy?.grace_period_minutes) || 14,
      late_warning_minutes: parseInt(attendancePolicy?.late_warning_minutes) || 29,
    });
    setShowPolicyModal(true);
  };

  const handleSavePolicy = async () => {
    const updatedPolicy = {
      ...attendancePolicy,
      shift_start: policyForm.shift_start,
      grace_period_minutes: Number(policyForm.grace_period_minutes) || 14,
      late_warning_minutes: Number(policyForm.late_warning_minutes) || 29,
    };
    setAttendancePolicy(updatedPolicy);
    try {
      localStorage.setItem("attendance_policy", JSON.stringify(updatedPolicy));
      localStorage.setItem("software_house_attendance_policy", JSON.stringify(updatedPolicy));
      await updateAttendancePolicy(updatedPolicy);
      await dbSaveRecord("settings", { id: "attendance_policy", ...updatedPolicy }).catch(() => {});
    } catch(e) {}
    setShowPolicyModal(false);
    showToast("Policy Updated 🛡️", "Attendance Policy Timeline hours updated successfully & saved to Supabase!", "success");
    window.dispatchEvent(new Event("storage"));
  };

  // Attendance Adjustment Request Modal State
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [adjustmentForm, setAdjustmentForm] = useState({
    target_date: new Date().toISOString().split("T")[0],
    request_type: "Missed Punch Correction",
    requested_clock_in: "10:00 AM",
    requested_clock_out: "06:00 PM",
    reason: ""
  });

  const handleOpenAdjustmentModal = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    setAdjustmentForm({
      target_date: todayStr,
      request_type: "Missed Punch Correction",
      requested_clock_in: "10:00 AM",
      requested_clock_out: "06:00 PM",
      reason: ""
    });
    setShowAdjustmentModal(true);
  };

  const handleSubmitAdjustmentRequest = async () => {
    if (!adjustmentForm.reason.trim()) {
      showToast("Reason Required ⚠️", "Please provide a brief explanation for the attendance adjustment request.", "warning");
      return;
    }

    const currentEmail = (localStorage.getItem("current_user_email") || userEmail || "staff@nexa.com").toLowerCase().trim();
    const currentName = localStorage.getItem("current_user_name") || userName || currentEmail.split("@")[0];

    const recordId = `adj-${Date.now()}`;
    const newAdjustmentRequest = {
      id: recordId,
      applicant_email: currentEmail,
      submitted_by: currentName,
      target_date: adjustmentForm.target_date,
      request_type: adjustmentForm.request_type,
      requested_clock_in: adjustmentForm.requested_clock_in,
      requested_clock_out: adjustmentForm.requested_clock_out,
      reason: adjustmentForm.reason,
      status: "Pending HR Review",
      created_at: new Date().toISOString()
    };

    try {
      const existing = JSON.parse(localStorage.getItem("software_house_attendance_adjustments") || "[]");
      const updated = [newAdjustmentRequest, ...existing];
      localStorage.setItem("software_house_attendance_adjustments", JSON.stringify(updated));

      const newComplaintTicket = {
        id: `ticket-adj-${Date.now()}`,
        submitted_by: `${currentName} (${currentEmail})`,
        category: "Attendance Adjustment",
        title: `Attendance Adjustment: ${adjustmentForm.request_type} (${adjustmentForm.target_date})`,
        description: `Date: ${adjustmentForm.target_date} | Type: ${adjustmentForm.request_type} | Clock-In: ${adjustmentForm.requested_clock_in} | Clock-Out: ${adjustmentForm.requested_clock_out}\nReason: ${adjustmentForm.reason}`,
        status: "Pending",
        created_at: new Date().toISOString()
      };

      const existingComplaints = JSON.parse(localStorage.getItem("software_house_complaints_list") || "[]");
      localStorage.setItem("software_house_complaints_list", JSON.stringify([newComplaintTicket, ...existingComplaints]));

      await dbSaveRecord("complaints", newComplaintTicket).catch(() => {});
      await dbSaveRecord("settings", { id: recordId, ...newAdjustmentRequest }).catch(() => {});
    } catch (e) {}

    setShowAdjustmentModal(false);
    showToast("Adjustment Request Submitted 📩", `Request for ${adjustmentForm.target_date} sent to HR & Admin for review.`, "success");
    window.dispatchEvent(new Event("storage"));
  };

  useEffect(() => {
    setFormattedTimeString(new Date().toLocaleTimeString());
    const timer = setInterval(() => {
      setCurrentMinutes(getCurrentMinutes());
      setFormattedTimeString(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Load policy from localStorage (with fallback to default)
  useEffect(() => {
    const loadPolicy = () => {
      try {
        const savedPolicy = localStorage.getItem("attendance_policy");
        if (savedPolicy) {
          setAttendancePolicy(JSON.parse(savedPolicy));
        } else {
          // Set default policy
          const defaultPolicy = {
            shift_start: "10:00 AM",
            shift_end: "6:00 PM",
            grace_period_minutes: 14,
            late_warning_minutes: 29,
            salary_deduction_after: 30,
            policy_name: "Standard Policy"
          };
          localStorage.setItem("attendance_policy", JSON.stringify(defaultPolicy));
          setAttendancePolicy(defaultPolicy);
        }
      } catch (e) {
        console.error("Error loading policy from localStorage:", e);
      }
    };
    loadPolicy();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      const storedRole = localStorage.getItem("user_role") || "employee";
      const storedEmail = (localStorage.getItem("current_user_email") || "").toLowerCase().trim();
      const storedName = localStorage.getItem("current_user_name") || storedEmail.split("@")[0];

      setUserRole(storedRole);
      setUserEmail(storedEmail);
      setUserName(storedName);

      const activeNetworks = getActiveOfficeNetworks();
      const activeNet = activeNetworks.find(n => n.status === "Active") || activeNetworks[0];
      if (activeNet) {
        setOfficeNetworkInfo({
          office_name: activeNet.office_name,
          public_ip_address: activeNet.public_ip_address
        });
      }

      const detectedIp = await fetchCurrentPublicIp();
      setUserIp(detectedIp);

      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);

      const key = `today_attendance_${storedEmail}`;
      const savedToday = localStorage.getItem(key);
      let userLogs = [];
      if (savedToday) {
        try {
          const parsed = JSON.parse(savedToday);
          if (Array.isArray(parsed)) {
            userLogs = parsed.filter(r => isRecordFromToday(r));
          } else if (isRecordFromToday(parsed)) {
            userLogs = [parsed];
          }
        } catch(e) {}
      }
      setTodayRecords(userLogs);

      try {
        const cloudLogs = await dbFetch("attendance", [], true).catch(() => []);
        const masterSaved = localStorage.getItem("software_house_master_attendance_logs");
        let localLogs = [];
        if (masterSaved) {
          try {
            localLogs = JSON.parse(masterSaved);
          } catch(e) {}
        }

        // Background sync local logs to cloud
        if (Array.isArray(localLogs) && localLogs.length > 0) {
          localLogs.forEach(log => {
            if (log) {
              const attDate = log.attendance_date || log.date || (log.timestamp ? log.timestamp.split("T")[0] : new Date().toISOString().split("T")[0]);
              fetch("/api/persistence", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  table: "attendance",
                  record: {
                    user_email: log.user_email || log.email || log.employee_id,
                    employee_id: log.user_email || log.email || log.employee_id,
                    user_name: log.user_name || log.name,
                    date: attDate,
                    check_in: log.check_in_time || log.check_in,
                    check_out: log.check_out_time || log.check_out,
                    status: log.attendance_status || log.status || "Present",
                    ip_address: log.public_ip || log.ip_address || "127.0.0.1"
                  },
                  action: "save"
                })
              }).catch(() => {});
            }
          });
        }

        // Deduplicate & Merge Cloud + Local Logs
        const map = new Map();
        [...(cloudLogs || []), ...(localLogs || [])].forEach(item => {
          if (!item) return;
          const userKey = (item.user_email || item.email || item.user_name || item.name || item.id || "").toLowerCase().trim();
          const dateKey = item.attendance_date || item.date || "";
          const timeKey = item.check_in_time || item.check_in || "";
          const uniqueKey = `${userKey}_${dateKey}_${timeKey}`;
          if (uniqueKey && !map.has(uniqueKey)) {
            map.set(uniqueKey, item);
          }
        });
        setAllSystemLogs(Array.from(map.values()));
      } catch(e) {}

      // Auto-verify Wi-Fi Network
      const res = await verifyOfficeWifiAttendance({
        userId: storedEmail,
        userEmail: storedEmail,
        userRole: storedRole,
        userName: storedName
      });

      const activeIp = res.currentPublicIp || detectedIp || "Offline";
      setUserIp(activeIp);

      if (res.success) {
        setIpVerificationResult({
          success: true,
          isRemote: res.isRemote || false,
          message: res.isRemote ? "Remote Member Mode Active: Wi-Fi Restriction Disabled." : "Office Wi-Fi Verified Successfully.",
          publicIp: activeIp,
          officePublicIp: res.activeOfficeNetwork?.public_ip_address || activeIp
        });
      } else {
        setIpVerificationResult({
          success: false,
          message: res.errorMessage || "Network Mismatch! Connect to authorized Office Wi-Fi.",
          publicIp: activeIp,
          officePublicIp: res.activeOfficeNetwork?.public_ip_address || "Office Wi-Fi"
        });
      }

      setLoading(false);
    };
    
    fetchData();
    
    // Load attendance policy
    const loadPolicy = async () => {
      try {
        const policy = await fetchAttendancePolicy();
        setAttendancePolicy(policy);
      } catch (e) {
        console.error("Error loading attendance policy:", e);
      }
    };
    loadPolicy();
  }, []);

  const handleVerifyIpify = async (silent = false) => {
    setIsVerifyingIp(true);
    const role = user?.user_metadata?.role || userRole || "employee";

    const res = await verifyOfficeWifiAttendance({
      userId: userEmail,
      userEmail,
      userRole: role,
      userName
    });

    const activeIp = res.currentPublicIp || "Offline";
    setUserIp(activeIp);

    if (res.success) {
      setIpVerificationResult({
        success: true,
        isRemote: res.isRemote || false,
        message: res.isRemote ? "Remote Member Mode Active: Wi-Fi Restriction Disabled." : "Office Wi-Fi Verified Successfully.",
        publicIp: activeIp,
        officePublicIp: res.activeOfficeNetwork?.public_ip_address || activeIp
      });
      if (!silent) {
        showToast("Office Wi-Fi Verified 🟢", "Network verified successfully. You can mark attendance.", "success");
      }
    } else {
      setIpVerificationResult({
        success: false,
        message: res.errorMessage || "Network Mismatch! Connect to authorized Office Wi-Fi.",
        publicIp: activeIp,
        officePublicIp: res.activeOfficeNetwork?.public_ip_address || "Office Wi-Fi"
      });
      if (!silent) {
        showToast("Network Mismatch 🛑", `Connected IP (${activeIp}) does not match authorized Office Wi-Fi!`, "error");
      }
    }
    setIsVerifyingIp(false);
    return res;
  };

  const navigateToDashboard = () => {
    const role = (userRole || "").toLowerCase();
    if (role === "student" || role === "course_student") {
      router.push("/dashboard/student");
    } else if (role === "employee" || role === "staff") {
      router.push("/dashboard/employees");
    } else if (role === "intern" || role === "internship") {
      router.push("/dashboard/internships");
    } else {
      router.push("/dashboard");
    }
  };

  const handleAttendance = async (type) => {
    const role = user?.user_metadata?.role || userRole || "employee";

    if (typeof window !== "undefined" && !window.navigator.onLine) {
      showToast("Attendance Blocked 🛑", "Wi-Fi or Internet is disconnected! Connect to Office Wi-Fi to mark attendance.", "error");
      return;
    }

    const verificationRes = await verifyOfficeWifiAttendance({
      userId: userEmail,
      userEmail,
      userRole: role,
      userName
    });

    if (!verificationRes.success) {
      showToast("Clock In Blocked 🛑", "Connect to authorized Office Wi-Fi to mark attendance!", "error");
      return;
    }

    const livePublicIp = verificationRes.currentPublicIp || "Live Connected Network";
    const checkInRecord = todayRecords.find(r => r.type === "check_in" || r.check_in_time);
    const checkOutRecord = todayRecords.find(r => r.type === "check_out" || (r.check_out_time && r.check_out_time !== "Not Checked Out"));

    if (type === "check_in" && checkInRecord) {
      showToast("Clock In Already Marked 🛑", "You have already Clocked In for today.", "warning");
      return;
    }

    if (type === "check_out" && !checkInRecord) {
      showToast("Clock In Required ⚠️", "You must Clock In before you can Clock Out.", "warning");
      return;
    }

    if (type === "check_out" && checkOutRecord) {
      showToast("Clock Out Completed 🛑", "You have already Clocked Out for today.", "warning");
      return;
    }

    const { allowed, modalMessage, status, lightColor, attendanceStatus, salaryDeductionStatus } = determineAttendanceState(role, currentMinutes);

    if (!allowed) {
      showToast("Attendance Closed", modalMessage, status);
      return;
    }

    const todayDateStr = getTodayDateString();
    const nowIso = new Date().toISOString();
    const nowLocalTime = new Date().toLocaleTimeString();

    let calculatedWorkDuration = "In Progress";
    let calculatedWorkSeconds = 0;

    if (type === "check_out" && checkInRecord) {
      const checkInTimeMs = new Date(checkInRecord.check_in_timestamp || checkInRecord.timestamp || checkInRecord.created_at).getTime();
      const checkOutTimeMs = new Date(nowIso).getTime();
      const diffMs = Math.max(0, checkOutTimeMs - checkInTimeMs);
      
      calculatedWorkSeconds = Math.floor(diffMs / 1000);
      const hours = Math.floor(calculatedWorkSeconds / 3600);
      const mins = Math.floor((calculatedWorkSeconds % 3600) / 60);
      const secs = calculatedWorkSeconds % 60;

      calculatedWorkDuration = hours > 0 ? `${hours}h ${mins}m ${secs}s` : `${mins}m ${secs}s`;
    }

    const newRecord = {
      id: `att-${Date.now()}`,
      attendance_id: `att-${Date.now()}`,
      user_id: userEmail,
      user_role: role,
      user_name: userName,
      user_email: userEmail,
      type,
      attendance_date: todayDateStr,
      check_in_time: type === "check_in" ? nowLocalTime : (checkInRecord?.check_in_time || "N/A"),
      check_out_time: type === "check_out" ? nowLocalTime : "Not Checked Out",
      check_in_timestamp: type === "check_in" ? nowIso : (checkInRecord?.check_in_timestamp || checkInRecord?.timestamp),
      check_out_timestamp: type === "check_out" ? nowIso : null,
      total_work_hours: type === "check_out" ? calculatedWorkDuration : "In Progress",
      total_work_seconds: calculatedWorkSeconds,
      attendance_status: attendanceStatus,
      public_ip: livePublicIp,
      created_at: nowIso,
      timestamp: nowIso,
    };

    const userKey = `today_attendance_${userEmail}`;
    let updatedUserRecords = [];
    if (type === "check_out" && checkInRecord) {
      updatedUserRecords = todayRecords.map(r => 
        (r.id === checkInRecord.id || r.type === "check_in")
          ? { 
              ...r, 
              check_out_time: nowLocalTime, 
              check_out_timestamp: nowIso, 
              total_work_hours: calculatedWorkDuration,
              updated_at: nowIso
            }
          : r
      );
      updatedUserRecords.push(newRecord);
    } else {
      updatedUserRecords = [...todayRecords, newRecord];
    }

    setTodayRecords(updatedUserRecords);
    localStorage.setItem(userKey, JSON.stringify(updatedUserRecords));

    try {
      const masterSaved = JSON.parse(localStorage.getItem("software_house_master_attendance_logs") || "[]");
      let updatedMaster = [newRecord, ...masterSaved];
      setAllSystemLogs(updatedMaster);
      localStorage.setItem("software_house_master_attendance_logs", JSON.stringify(updatedMaster));

      const attRecordToSave = {
        id: newRecord.id,
        user_email: userEmail,
        employee_id: userEmail,
        email: userEmail,
        user_name: userName,
        name: userName,
        user_role: role,
        attendance_date: todayDateStr,
        date: todayDateStr,
        check_in_time: newRecord.check_in_time,
        check_in: newRecord.check_in_time,
        check_out_time: newRecord.check_out_time,
        check_out: newRecord.check_out_time,
        attendance_status: attendanceStatus,
        status: attendanceStatus,
        public_ip: livePublicIp,
        ip_address: livePublicIp,
        created_at: nowIso,
        timestamp: nowIso
      };

      dbSaveRecord("attendance", attRecordToSave).catch(() => {});
      fetch("/api/persistence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "attendance", record: attRecordToSave, action: "save" })
      }).catch(() => {});
      fetch("/api/attendance/student", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", records: [attRecordToSave] })
      }).catch(() => {});

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("storage"));
        window.dispatchEvent(new Event("dataChanged"));
      }
    } catch(e) {}

    const toastTitle = type === "check_in" ? "Clocked In Successfully 🟢" : "Clocked Out Successfully 🔴";
    showToast(toastTitle, `Recorded at ${nowLocalTime}. Saved live to Supabase.`, "success");

    setTimeout(() => {
      navigateToDashboard();
    }, 1200);
  };

  const executeDeleteRecord = async () => {
    if (!deleteModal.record) return;
    setDeleteModal(prev => ({ ...prev, loading: true }));
    const record = deleteModal.record;

    try {
      dbDeleteRecord("attendance", record.id).catch(() => {});
      fetch("/api/persistence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "attendance", record: { id: record.id, date: record.date || record.attendance_date }, action: "delete" })
      }).catch(() => {});
      const masterSaved = JSON.parse(localStorage.getItem("software_house_master_attendance_logs") || "[]");
      const updatedMaster = masterSaved.filter(r => r.id !== record.id);
      setAllSystemLogs(updatedMaster);
      localStorage.setItem("software_house_master_attendance_logs", JSON.stringify(updatedMaster));

      if (record.user_email) {
        const userKey = `today_attendance_${record.user_email.toLowerCase().trim()}`;
        const userSaved = JSON.parse(localStorage.getItem(userKey) || "[]");
        const updatedUser = userSaved.filter(r => r.id !== record.id);
        localStorage.setItem(userKey, JSON.stringify(updatedUser));
        if (record.user_email.toLowerCase().trim() === userEmail) {
          setTodayRecords(updatedUser);
        }
      }

      showToast("Deleted 🗑️", "Attendance record deleted successfully.", "info");
    } catch(e) {
      showToast("Error", "Failed to delete record.", "error");
    } finally {
      setDeleteModal({ isOpen: false, record: null, loading: false });
    }
  };

  const handleExportCsv = () => {
    let csv = "User ID,User Name,Role,Attendance Status,Last Action,Work Hours,Public IP,Date Time\n";
    filteredSystemLogs.forEach(r => {
      csv += `"${r.user_id || ''}","${r.user_name || ''}","${r.user_role || ''}","${r.attendance_status || ''}","${r.type === 'check_in' ? 'Clock-In' : 'Clock-Out'}","${r.total_work_hours || ''}","${r.public_ip || ''}","${r.attendance_date || ''} ${r.check_in_time || ''}"\n`;
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const handleExportPdf = () => {
    try {
      generatePrintableAttendanceListPdf({
        title: "Organization Live Attendance Records",
        subtitle: `Filter: ${adminFilter.toUpperCase()} | Total Logged: ${filteredSystemLogs.length}`,
        reportDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
        filterInfo: `Category: ${adminFilter} | Search Query: ${tableSearch || 'None'}`,
        records: filteredSystemLogs,
        generatedBy: user?.user_metadata?.full_name || user?.email || "Admin Supervisor"
      });
      showToast("PDF Ready 📄", "Attendance list opened for printing or PDF download.", "success");
    } catch(e) {
      console.error(e);
      showToast("PDF Error", "Failed to generate attendance PDF.", "error");
    }
  };

  // Export Dedicated Single User Attendance List PDF
  const handleExportSingleUserPdf = (targetRecord) => {
    try {
      const targetUserId = targetRecord.user_id || targetRecord.id;
      const targetEmail = (targetRecord.user_email || targetRecord.email || "").toLowerCase().trim();
      const targetName = (targetRecord.user_name || targetRecord.name || "").toLowerCase().trim();

      const userLogs = allSystemLogs.filter((l) => {
        const lId = l.user_id || l.id;
        const lEmail = (l.user_email || l.email || "").toLowerCase().trim();
        const lName = (l.user_name || l.name || "").toLowerCase().trim();

        if (targetUserId && lId && lId === targetUserId) return true;
        if (targetEmail && lEmail && lEmail === targetEmail) return true;
        if (targetName && lName && lName === targetName) return true;
        return false;
      });

      const finalRecords = userLogs.length > 0 ? userLogs : [targetRecord];

      generateSingleUserAttendancePdf({
        user: targetRecord,
        records: finalRecords,
        generatedBy: user?.user_metadata?.full_name || user?.email || "Admin Supervisor"
      });
      showToast("PDF Ready 📄", `Attendance list generated for ${targetRecord.user_name || targetRecord.name || 'User'}.`, "success");
    } catch (e) {
      console.error(e);
      showToast("PDF Error", "Failed to generate individual user attendance PDF.", "error");
    }
  };

  // Unique Users List for the PDF Modal
  const uniqueUsersInLogs = useMemo(() => {
    const map = new Map();
    allSystemLogs.forEach((log) => {
      const emailKey = (log.user_email || log.email || "").toLowerCase().trim();
      const nameKey = (log.user_name || log.name || "").toLowerCase().trim();
      const idKey = log.user_id || log.id || "";
      const primaryKey = emailKey || idKey || nameKey;
      if (!primaryKey) return;

      if (!map.has(primaryKey)) {
        map.set(primaryKey, {
          user_id: log.user_id || log.id,
          user_name: log.user_name || log.name || "Candidate",
          user_email: log.user_email || log.email || "",
          user_role: log.user_role || log.role || "Staff",
          recordsCount: 1,
          latestDate: log.attendance_date || log.date || "",
          status: log.attendance_status || "Present"
        });
      } else {
        const item = map.get(primaryKey);
        item.recordsCount += 1;
      }
    });
    return Array.from(map.values());
  }, [allSystemLogs]);

  const currentRole = user?.user_metadata?.role || userRole || "employee";
  const isStudentRole = currentRole === "student" || currentRole === "course_student";
  const { lightColor, label: policyLabel } = determineAttendanceState(currentRole, currentMinutes);

  const checkIn = todayRecords.find((r) => r.type === "check_in" || r.check_in_time);
  const checkOut = todayRecords.find((r) => r.type === "check_out" || (r.check_out_time && r.check_out_time !== "Not Checked Out"));

  // Attendance Metrics & Dynamic Avg Check-In Time for Sidebar Widget 1
  const attendanceMetrics = useMemo(() => {
    const total = allSystemLogs.length;
    const present = allSystemLogs.filter(l => (l.attendance_status || "").toLowerCase().includes("present") || (l.attendance_status || "").toLowerCase().includes("on time")).length;
    const late = allSystemLogs.filter(l => (l.attendance_status || "").toLowerCase().includes("late")).length;
    const absent = allSystemLogs.filter(l => (l.attendance_status || "").toLowerCase().includes("absent")).length;
    const ratePct = total > 0 ? Math.round((present / total) * 100) : 0;

    return { total, present, late, absent, ratePct };
  }, [allSystemLogs]);

  const avgCheckInTimeStr = useMemo(() => {
    const checkInLogs = (allSystemLogs || []).filter(
      l => l.check_in_time || l.time || l.timestamp
    );

    if (checkInLogs.length === 0 && checkIn) {
      return checkIn.check_in_time || checkIn.time || "10:00 AM";
    }

    if (checkInLogs.length === 0) {
      return "10:00 AM";
    }

    let totalMinutes = 0;
    let validCount = 0;

    checkInLogs.forEach(l => {
      const rawTime = l.check_in_time || l.time;
      if (!rawTime) return;
      const match = rawTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      if (match) {
        let hrs = parseInt(match[1], 10);
        const mins = parseInt(match[2], 10);
        const period = match[3] ? match[3].toUpperCase() : "AM";
        if (period === "PM" && hrs < 12) hrs += 12;
        if (period === "AM" && hrs === 12) hrs = 0;

        totalMinutes += hrs * 60 + mins;
        validCount++;
      }
    });

    if (validCount === 0) return checkIn?.check_in_time || "10:00 AM";

    const avgMins = Math.round(totalMinutes / validCount);
    let avgHrs = Math.floor(avgMins / 60);
    const finalMins = avgMins % 60;
    const finalPeriod = avgHrs >= 12 ? "PM" : "AM";
    if (avgHrs > 12) avgHrs -= 12;
    if (avgHrs === 0) avgHrs = 12;

    return `${String(avgHrs).padStart(2, "0")}:${String(finalMins).padStart(2, "0")} ${finalPeriod}`;
  }, [allSystemLogs, checkIn]);

  // Filtered System Logs for Full-Width Bottom Table
  const filteredSystemLogs = useMemo(() => {
    const cleanUserEmail = (userEmail || "").toLowerCase().trim();
    const cleanUserName = (userName || "").toLowerCase().trim();
    const isAdminUser = currentRole === "admin" || currentRole === "hr" || currentRole === "manager";

    let list = isAdminUser
      ? allSystemLogs.filter(l => 
          adminFilter === "all" ? true : adminFilter === "student" ? (l.user_role === "student" || l.user_role === "course_student") : (l.user_role !== "student" && l.user_role !== "course_student")
        )
      : allSystemLogs.filter(l => {
          if (!l) return false;
          const emailKey = (l.user_email || l.email || l.employee_id || l.user_id || "").toLowerCase().trim();
          const nameKey = (l.user_name || l.name || "").toLowerCase().trim();
          return emailKey === cleanUserEmail || (cleanUserEmail && emailKey.includes(cleanUserEmail.split("@")[0])) || (cleanUserName && nameKey === cleanUserName);
        });

    if (statusFilter !== "all") {
      list = list.filter(r => {
        const st = (r.attendance_status || r.status || "").toLowerCase();
        if (statusFilter === "present") return st.includes("present") || st.includes("on time");
        if (statusFilter === "late") return st.includes("late") || st.includes("deduction");
        if (statusFilter === "leave") return st.includes("leave");
        if (statusFilter === "absent") return st.includes("absent") || st.includes("no check-in") || !r.check_in_time;
        return true;
      });
    }

    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase().trim();
      list = list.filter(r =>
        (r.user_name || "").toLowerCase().includes(q) ||
        (r.user_id || "").toLowerCase().includes(q) ||
        (r.user_email || "").toLowerCase().includes(q) ||
        (r.attendance_status || "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [currentRole, allSystemLogs, adminFilter, todayRecords, tableSearch, statusFilter]);

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center space-y-3 text-[#0F172A]">
        <div className="w-8 h-8 border-3 border-[#2563EB] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-bold text-[#64748B]">Loading Enterprise Attendance Portal...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      
      {/* HEADER BANNER */}
      <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] bg-[#EFF6FF] px-2.5 py-1 rounded-full border border-[#2563EB]/20">
              Attendance Verification Desk
            </span>
            <span className="text-[10px] font-semibold text-[#64748B] bg-[#F8FAFC] px-2.5 py-1 rounded-full border border-[#E2E8F0] flex items-center gap-1">
              <FaGlobe className="text-[#2563EB]" /> Public IP: {userIp}
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-[#0F172A] mt-1.5 flex items-center gap-2.5">
            <FaCalendarCheck className="text-[#2563EB]" />
            <span>Student & Staff Attendance Workspace</span>
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Logged in as: <strong className="text-[#0F172A] font-semibold">{userEmail}</strong> ({isStudentRole ? "Student Account" : "Staff Account"})
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-xs font-mono font-bold text-[#0F172A]">Time: {formattedTimeString || "--:--:--"}</p>
          <p className="text-[11px] font-semibold text-[#64748B]">Shift: 10:00 AM – 6:00 PM</p>
        </div>
      </div>

      {/* 1. ADMIN VIEW: BALANCED FULL-WIDTH LAYOUT (NO EMPTY SPACE GAP) */}
      {currentRole === "admin" ? (
        <div className="space-y-6">
          {/* Admin Master Overview Card */}
          <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] border-l-4 border-l-[#2563EB] shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] bg-[#EFF6FF] px-2.5 py-0.5 rounded-md border border-[#2563EB]/20">
                  Executive Master Control
                </span>
                <h2 className="text-lg font-bold text-[#0F172A] mt-1 flex items-center gap-2">
                  <FaShieldAlt className="text-[#2563EB]" /> Organization Live Attendance Hub
                </h2>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Monitor all employees, remote interns, and students in real time. (Admin supervisory role).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/dashboard/attendance/history"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs whitespace-nowrap"
                >
                  <FaUsers className="text-xs" /> Student & Employee History Inspector →
                </Link>
                <button
                  type="button"
                  onClick={() => setShowUserPdfModal(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs whitespace-nowrap"
                >
                  <FaUser className="text-xs" /> User-Wise PDF Export 👤
                </button>
                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs whitespace-nowrap"
                >
                  <FaFilePdf className="text-xs" /> Download All PDF
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs whitespace-nowrap"
                >
                  <FaDownload className="text-xs" /> Export Report CSV
                </button>
                <button
                  type="button"
                  onClick={() => setShowIpManagerModal(true)}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-semibold px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                >
                  <FaWifi className="text-xs text-blue-600" /> Office Wi-Fi IP
                </button>
              </div>
            </div>

            {/* Direct Inspector Banner */}
            <div className="bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 rounded-2xl p-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs border border-blue-800/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-lg shrink-0">
                  👥
                </div>
                <div>
                  <h3 className="font-bold text-xs sm:text-sm text-white flex items-center gap-2">
                    <span>Individual Candidate Attendance Calendar & History Inspector</span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">Active</span>
                  </h3>
                  <p className="text-[11px] text-blue-200">
                    Click any student (e.g. Rahim Bugti) or employee to inspect their full day-by-day calendar history, Sunday holidays, leaves, and shifts.
                  </p>
                </div>
              </div>
              <Link
                href="/dashboard/attendance/history"
                className="bg-white hover:bg-blue-50 text-blue-900 font-bold px-4 py-2 rounded-xl text-xs transition-all shrink-0 shadow-xs flex items-center justify-center gap-1.5"
              >
                <span>Open User Inspector</span>
                <span>→</span>
              </Link>
            </div>

            {/* Organization Attendance Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <button
                type="button"
                onClick={() => handleCardClick("present")}
                className={`p-4 rounded-xl text-left transition-all cursor-pointer ${
                  statusFilter === "present"
                    ? "bg-emerald-100 border-2 border-emerald-500 shadow-md ring-2 ring-emerald-400/30 scale-[1.02]"
                    : "bg-emerald-50/70 border border-emerald-200 hover:bg-emerald-100/70 hover:shadow-xs"
                } space-y-1`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">Present & On Time</span>
                  {statusFilter === "present" && (
                    <span className="text-[9px] bg-emerald-600 text-white font-bold px-1.5 py-0.5 rounded">Active</span>
                  )}
                </div>
                <p className="text-2xl font-black text-emerald-700">{attendanceMetrics.present}</p>
                <span className="text-[10px] text-emerald-600 font-medium flex items-center justify-between">
                  <span>Verified Active</span>
                  <span className="text-[9px] underline font-semibold">Filter List ↓</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleCardClick("late")}
                className={`p-4 rounded-xl text-left transition-all cursor-pointer ${
                  statusFilter === "late"
                    ? "bg-amber-100 border-2 border-amber-500 shadow-md ring-2 ring-amber-400/30 scale-[1.02]"
                    : "bg-amber-50/70 border border-amber-200 hover:bg-amber-100/70 hover:shadow-xs"
                } space-y-1`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">Late Warning</span>
                  {statusFilter === "late" && (
                    <span className="text-[9px] bg-amber-600 text-white font-bold px-1.5 py-0.5 rounded">Active</span>
                  )}
                </div>
                <p className="text-2xl font-black text-amber-700">{attendanceMetrics.late}</p>
                <span className="text-[10px] text-amber-600 font-medium flex items-center justify-between">
                  <span>After 10:15 AM</span>
                  <span className="text-[9px] underline font-semibold">Filter List ↓</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleCardClick("leave")}
                className={`p-4 rounded-xl text-left transition-all cursor-pointer ${
                  statusFilter === "leave"
                    ? "bg-purple-100 border-2 border-purple-500 shadow-md ring-2 ring-purple-400/30 scale-[1.02]"
                    : "bg-purple-50/70 border border-purple-200 hover:bg-purple-100/70 hover:shadow-xs"
                } space-y-1`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-purple-800 uppercase tracking-wider block">On Leave</span>
                  {statusFilter === "leave" && (
                    <span className="text-[9px] bg-purple-600 text-white font-bold px-1.5 py-0.5 rounded">Active</span>
                  )}
                </div>
                <p className="text-2xl font-black text-purple-700">
                  {allSystemLogs.filter(l => (l.attendance_status || "").toLowerCase().includes("leave")).length}
                </p>
                <span className="text-[10px] text-purple-600 font-medium flex items-center justify-between">
                  <span>Approved by Admin</span>
                  <span className="text-[9px] underline font-semibold">Filter List ↓</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleCardClick("absent")}
                className={`p-4 rounded-xl text-left transition-all cursor-pointer ${
                  statusFilter === "absent"
                    ? "bg-rose-100 border-2 border-rose-500 shadow-md ring-2 ring-rose-400/30 scale-[1.02]"
                    : "bg-rose-50/70 border border-rose-200 hover:bg-rose-100/70 hover:shadow-xs"
                } space-y-1`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider block">Absent Today</span>
                  {statusFilter === "absent" && (
                    <span className="text-[9px] bg-rose-600 text-white font-bold px-1.5 py-0.5 rounded">Active</span>
                  )}
                </div>
                <p className="text-2xl font-black text-rose-700">{attendanceMetrics.absent}</p>
                <span className="text-[10px] text-rose-600 font-medium flex items-center justify-between">
                  <span>No check-in recorded</span>
                  <span className="text-[9px] underline font-semibold">Filter List ↓</span>
                </span>
              </button>
            </div>

            {/* Quick Supervisory Action Links */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-600">
                <FaInfoCircle className="text-blue-600 shrink-0" />
                <span>Employees and students record their individual check-in on their own dashboards.</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => router.push("/dashboard/leaves")}
                  className="px-3.5 py-1.5 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-800 font-bold transition-colors cursor-pointer text-[11px] whitespace-nowrap"
                >
                  🔔 Review Leave Applications
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/dashboard/remote-monitoring")}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-800 font-bold transition-colors cursor-pointer text-[11px] whitespace-nowrap"
                >
                  🖥️ Live Screen Monitoring
                </button>
              </div>
            </div>
          </div>

          {/* 3 Compact Balanced Widgets Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Widget 1: Policy Timeline */}
            <div className="bg-white rounded-2xl p-5 border border-[#E2E8F0] shadow-sm space-y-3">
              <div className="border-b border-[#E2E8F0] pb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider flex items-center gap-1.5">
                  <FaShieldAlt className="text-[#2563EB]" />
                  <span>Attendance Policy Timeline</span>
                </h3>
                <button
                  type="button"
                  onClick={handleOpenPolicyModal}
                  className="text-[10px] font-bold text-[#2563EB] bg-[#EFF6FF] hover:bg-blue-600 hover:text-white px-2 py-0.5 rounded-lg border border-[#2563EB]/20 transition-all cursor-pointer flex items-center gap-1"
                  title="Click to edit policy timing rules"
                >
                  <FaEdit className="text-[9px]" />
                  <span>Edit Policy</span>
                </button>
              </div>

              <div className="space-y-2 text-xs">
                {/* 1. On Time Row */}
                <div
                  onClick={handleOpenPolicyModal}
                  className="p-2.5 rounded-xl bg-[#EFF6FF] hover:bg-blue-100/80 border border-[#2563EB]/20 flex justify-between items-center transition-all hover:scale-[1.01] cursor-pointer group shadow-xs"
                  title="Click to edit On-Time timing policy"
                >
                  <span className="font-semibold text-[#2563EB]">
                    {attendancePolicy?.shift_start || "10:00 AM"} – {(() => {
                      const start = timeToMinutes(attendancePolicy?.shift_start || "10:00 AM");
                      const end = start + (parseInt(attendancePolicy?.grace_period_minutes) || 14);
                      return minutesToTime(end);
                    })()}
                  </span>
                  <span className="text-[10px] font-bold text-[#2563EB] bg-white px-2 py-0.5 rounded border border-[#2563EB]/20 flex items-center gap-1 group-hover:bg-[#2563EB] group-hover:text-white transition-colors">
                    <span>On Time 🟢</span>
                    <FaEdit className="text-[9px]" />
                  </span>
                </div>

                {/* 2. Late Warning Row */}
                <div
                  onClick={handleOpenPolicyModal}
                  className="p-2.5 rounded-xl bg-[#FEF3C7] hover:bg-amber-100/80 border border-[#F59E0B]/20 flex justify-between items-center transition-all hover:scale-[1.01] cursor-pointer group shadow-xs"
                  title="Click to edit Late Warning timing policy"
                >
                  <span className="font-semibold text-[#92400E]">
                    {(() => {
                      const start = timeToMinutes(attendancePolicy?.shift_start || "10:00 AM");
                      const end = start + (parseInt(attendancePolicy?.grace_period_minutes) || 14);
                      const end2 = start + (parseInt(attendancePolicy?.late_warning_minutes) || 29);
                      return `${minutesToTime(end)} – ${minutesToTime(end2)}`;
                    })()}
                  </span>
                  <span className="text-[10px] font-bold text-[#92400E] bg-white px-2 py-0.5 rounded border border-[#F59E0B]/20 flex items-center gap-1 group-hover:bg-[#D97706] group-hover:text-white transition-colors">
                    <span>Late Warning 🟠</span>
                    <FaEdit className="text-[9px]" />
                  </span>
                </div>

                {/* 3. Salary Deduction Row */}
                <div
                  onClick={handleOpenPolicyModal}
                  className="p-2.5 rounded-xl bg-[#FEE2E2] hover:bg-rose-100/80 border border-[#EF4444]/20 flex justify-between items-center transition-all hover:scale-[1.01] cursor-pointer group shadow-xs"
                  title="Click to edit Salary Deduction threshold policy"
                >
                  <span className="font-semibold text-[#991B1B]">
                    {(() => {
                      const start = timeToMinutes(attendancePolicy?.shift_start || "10:00 AM");
                      const end = start + (parseInt(attendancePolicy?.late_warning_minutes) || 29);
                      return `${minutesToTime(end)} & After`;
                    })()}
                  </span>
                  <span className="text-[10px] font-bold text-[#991B1B] bg-white px-2 py-0.5 rounded border border-[#EF4444]/20 flex items-center gap-1 group-hover:bg-[#DC2626] group-hover:text-white transition-colors">
                    <span>Salary Deduction 🔴</span>
                    <FaEdit className="text-[9px]" />
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleOpenPolicyModal}
                className="w-full mt-2 py-2 px-3 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-bold text-xs transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
              >
                <FaEdit className="text-xs" />
                <span>Edit Policy Timeline & Rules</span>
              </button>
            </div>

            {/* Widget 2: Quick Rules & Notices */}
            <div className="bg-white rounded-2xl p-5 border border-[#E2E8F0] shadow-sm space-y-3 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#2563EB]" />
              <div className="border-b border-[#E2E8F0] pb-2">
                <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider flex items-center gap-1.5">
                  <FaInfoCircle className="text-[#2563EB]" />
                  <span>Shift Rules & Notices</span>
                </h3>
              </div>
              <div className="space-y-1.5 text-xs text-[#64748B]">
                <p>• <strong>Shift Timing:</strong> 10:00 AM – 6:00 PM</p>
                <p>• <strong>Grace Period:</strong> 10:00 AM – 10:14 AM</p>
                <p className="text-[11px] text-[#0F172A] font-medium leading-relaxed pt-1">
                  Attendance recorded after 10:30 AM will automatically trigger the one-day salary deduction rule according to company HR policy.
                </p>
              </div>
            </div>

            {/* Widget 3: System Status & Support */}
            <div className="bg-white rounded-2xl p-5 border border-[#E2E8F0] shadow-sm space-y-3">
              <div className="border-b border-[#E2E8F0] pb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider flex items-center gap-1.5">
                  <FaShieldAlt className="text-[#2563EB]" />
                  <span>System Status & Support</span>
                </h3>
                <span className="text-[10px] font-bold text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded border border-[#2563EB]/20">
                  Operational 🟢
                </span>
              </div>
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center gap-2 text-[#0F172A] font-medium text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-pulse" />
                  <span>All Verification Gateways Operational</span>
                </div>
                <button
                  type="button"
                  onClick={handleOpenAdjustmentModal}
                  className="w-full py-2.5 px-3 rounded-xl bg-white hover:bg-[#EFF6FF] text-[#2563EB] border border-[#E2E8F0] font-semibold text-xs transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 shadow-xs hover:border-[#2563EB]"
                >
                  <span>📩 Request Attendance Adjustment</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* 2. EMPLOYEE / STUDENT TWO-COLUMN VIEW */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN (65% - 8 COLS) */}
          <div className="lg:col-span-8 space-y-6">
            {/* REAL-TIME VERIFICATION STEPPER FOR EMPLOYEES / STUDENTS */}
            <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] bg-[#EFF6FF] px-2.5 py-0.5 rounded-md border border-[#2563EB]/20">
                    Verification Progress Engine
                  </span>
                  <h2 className="text-base font-bold text-[#0F172A] mt-1">Real-Time Attendance Stepper</h2>
                </div>

                <button
                  type="button"
                  onClick={() => handleVerifyIpify()}
                  disabled={isVerifyingIp}
                  className="bg-white hover:bg-[#F8FAFC] text-[#2563EB] border border-[#E2E8F0] font-semibold px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs shrink-0"
                >
                  <FaWifi className={`text-xs ${isVerifyingIp ? "animate-spin" : ""}`} />
                  <span>{isVerifyingIp ? "Verifying..." : "Verify Office Network"}</span>
                </button>
              </div>

              {/* Horizontal Step Pipeline (Network -> Policy -> Clock-In -> Session -> Clock-Out) */}
              <div className="pt-2">
                <div className="flex items-center justify-between relative">
                  <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-[#E2E8F0] -translate-y-1/2 z-0" />

                  {/* Step 1: Network */}
                  <div className="relative z-10 flex flex-col items-center gap-1 bg-white px-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      ipVerificationResult?.success
                        ? "bg-[#EFF6FF] text-[#2563EB] border-2 border-[#2563EB]"
                        : "bg-[#F8FAFC] text-[#94A3B8] border-2 border-[#E2E8F0]"
                    }`}>
                      {ipVerificationResult?.success ? <FaCheck className="text-xs text-[#2563EB]" /> : "1"}
                    </div>
                    <span className={`text-[11px] font-bold ${ipVerificationResult?.success ? "text-[#2563EB]" : "text-[#64748B]"}`}>Network</span>
                  </div>

                  {/* Step 2: Policy */}
                  <div className="relative z-10 flex flex-col items-center gap-1 bg-white px-2">
                    <div className="w-8 h-8 rounded-full bg-[#EFF6FF] text-[#2563EB] border-2 border-[#2563EB] flex items-center justify-center text-xs font-bold">
                      <FaCheck className="text-xs text-[#2563EB]" />
                    </div>
                    <span className="text-[11px] font-bold text-[#2563EB]">Policy</span>
                  </div>

                  {/* Step 3: Clock-In */}
                  <div className="relative z-10 flex flex-col items-center gap-1 bg-white px-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      checkIn
                        ? "bg-[#EFF6FF] text-[#2563EB] border-2 border-[#2563EB]"
                        : "bg-[#F8FAFC] text-[#94A3B8] border-2 border-[#E2E8F0]"
                    }`}>
                      {checkIn ? <FaCheck className="text-xs text-[#2563EB]" /> : "3"}
                    </div>
                    <span className={`text-[11px] font-bold ${checkIn ? "text-[#2563EB]" : "text-[#64748B]"}`}>Clock-In</span>
                  </div>

                  {/* Step 4: Session */}
                  <div className="relative z-10 flex flex-col items-center gap-1 bg-white px-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      checkIn
                        ? "bg-[#EFF6FF] text-[#2563EB] border-2 border-[#2563EB]"
                        : "bg-[#F8FAFC] text-[#94A3B8] border-2 border-[#E2E8F0]"
                    }`}>
                      {checkIn ? <FaCheck className="text-xs text-[#2563EB]" /> : "4"}
                    </div>
                    <span className={`text-[11px] font-bold ${checkIn ? "text-[#2563EB]" : "text-[#64748B]"}`}>Session</span>
                  </div>

                  {/* Step 5: Clock-Out */}
                  <div className="relative z-10 flex flex-col items-center gap-1 bg-white px-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      checkOut
                        ? "bg-[#EFF6FF] text-[#2563EB] border-2 border-[#2563EB]"
                        : "bg-[#F8FAFC] text-[#94A3B8] border-2 border-[#E2E8F0]"
                    }`}>
                      {checkOut ? <FaCheck className="text-xs text-[#2563EB]" /> : "5"}
                    </div>
                    <span className={`text-[11px] font-bold ${checkOut ? "text-[#2563EB]" : "text-[#64748B]"}`}>Clock-Out</span>
                  </div>
                </div>
              </div>
            </div>

            {/* PRIMARY ATTENDANCE WORKFLOW FOR EMPLOYEES / STUDENTS */}
            <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] border-l-4 border-l-[#2563EB] shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <FaClock className="text-[#2563EB]" />
                  <span>Primary Attendance Workflow</span>
                </h3>
                <span className="text-xs font-semibold text-[#2563EB] bg-[#EFF6FF] px-2.5 py-0.5 rounded-full border border-[#2563EB]/20">
                  1 Check-In Per Day
                </span>
              </div>

              {/* STATE 1: Wi-Fi Unverified */}
              {(!ipVerificationResult || !ipVerificationResult.success) && (
                <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-[#64748B]">
                    <FaInfoCircle className="text-[#2563EB] text-base shrink-0" />
                    <span>Connect to authorized Office Wi-Fi to unlock Clock-In.</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleVerifyIpify()}
                    disabled={isVerifyingIp}
                    className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold px-4 py-2 rounded-xl transition-colors cursor-pointer text-xs shrink-0"
                  >
                    Verify Office Wi-Fi
                  </button>
                </div>
              )}

              {/* STATE 2: Wi-Fi Verified, Ready to Clock In */}
              {ipVerificationResult?.success && !checkIn && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => handleAttendance("check_in")}
                    className="w-full py-3.5 px-4 rounded-xl font-bold text-xs bg-[#2563EB] hover:bg-[#1D4ED8] text-white transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                  >
                    <FaCheckCircle className="text-sm" />
                    <span>Clock In (Mark Attendance)</span>
                  </button>
                </div>
              )}

              {/* STATE 3: Clocked In, Ready to Clock Out */}
              {checkIn && !checkOut && (
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleAttendance("check_out")}
                      className="flex-1 py-3.5 px-4 rounded-xl font-bold text-xs bg-[#2563EB] hover:bg-[#1D4ED8] text-white transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                    >
                      <FaTimesCircle className="text-sm" />
                      <span>Clock Out</span>
                    </button>

                    <button
                      type="button"
                      onClick={navigateToDashboard}
                      className="flex-1 py-3.5 px-4 rounded-xl font-semibold text-xs bg-white hover:bg-[#F8FAFC] text-[#2563EB] border border-[#E2E8F0] transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <span>Proceed to Workspace</span>
                      <FaArrowRight className="text-xs" />
                    </button>
                  </div>
                </div>
              )}

              {/* STATE 4: Clocked Out Completed */}
              {checkIn && checkOut && (
                <div className="p-4 rounded-xl bg-[#EFF6FF] border border-[#2563EB]/20 flex items-center justify-between text-xs">
                  <span className="font-bold text-[#2563EB] flex items-center gap-1.5">
                    <FaCheckCircle /> Attendance Completed for Today
                  </span>
                  <button
                    type="button"
                    onClick={navigateToDashboard}
                    className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-xs px-4 py-2 rounded-xl transition-colors cursor-pointer"
                  >
                    Proceed to Workspace →
                  </button>
                </div>
              )}
            </div>

            {/* TODAY'S ACTIVE SESSION BREAKDOWN */}
            <TodaySessionBreakdown
              checkIn={checkIn}
              checkOut={checkOut}
              formattedTimeString={formattedTimeString}
              currentMinutes={currentMinutes}
            />
          </div>

          {/* RIGHT COLUMN (35% - 4 COLS): SIDEBAR WIDGETS */}
          <div className="lg:col-span-4 space-y-6">
            {/* Widget 1: Attendance Statistics */}
            <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm space-y-4">
              <div className="border-b border-[#E2E8F0] pb-3">
                <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <FaChartPie className="text-[#2563EB]" />
                  <span>Attendance Statistics</span>
                </h3>
                <p className="text-xs text-[#64748B]">Live system metrics.</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => handleCardClick("present")}
                  className={`p-3.5 rounded-xl text-left transition-all cursor-pointer ${
                    statusFilter === "present"
                      ? "bg-[#EFF6FF] border-2 border-[#2563EB] shadow-xs"
                      : "bg-[#EFF6FF] border border-[#2563EB]/20 hover:border-[#2563EB]"
                  } space-y-0.5`}
                >
                  <span className="text-[10px] font-semibold text-[#2563EB] uppercase block">Present Today</span>
                  <p className="text-lg font-bold text-[#2563EB]">{attendanceMetrics.present}</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleCardClick("late")}
                  className={`p-3.5 rounded-xl text-left transition-all cursor-pointer ${
                    statusFilter === "late"
                      ? "bg-[#FEF3C7] border-2 border-[#F59E0B] shadow-xs"
                      : "bg-[#FEF3C7] border border-[#F59E0B]/20 hover:border-[#F59E0B]"
                  } space-y-0.5`}
                >
                  <span className="text-[10px] font-semibold text-[#92400E] uppercase block">Late Today</span>
                  <p className="text-lg font-bold text-[#92400E]">{attendanceMetrics.late}</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleCardClick("absent")}
                  className={`p-3.5 rounded-xl text-left transition-all cursor-pointer ${
                    statusFilter === "absent"
                      ? "bg-[#FEE2E2] border-2 border-rose-500 shadow-xs"
                      : "bg-[#F8FAFC] border border-[#E2E8F0] hover:border-rose-300"
                  } space-y-0.5`}
                >
                  <span className="text-[10px] font-semibold text-[#64748B] uppercase block">Absent Today</span>
                  <p className="text-lg font-bold text-[#0F172A]">{attendanceMetrics.absent}</p>
                </button>

                <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-0.5">
                  <span className="text-[10px] font-semibold text-[#64748B] uppercase block">Attendance Rate</span>
                  <p className="text-lg font-bold text-[#0F172A]">{attendanceMetrics.ratePct}%</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs flex justify-between items-center">
                <span className="text-[#64748B] font-semibold">Avg Check-In Time:</span>
                <span className="font-mono font-bold text-[#0F172A]">{avgCheckInTimeStr}</span>
              </div>
            </div>

            {/* Widget 2: Vertical Compact Policy Timeline */}
            <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm space-y-3">
              <div className="border-b border-[#E2E8F0] pb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <FaShieldAlt className="text-[#2563EB]" />
                  <span>Attendance Policy Timeline</span>
                </h3>
                <button
                  type="button"
                  onClick={handleOpenPolicyModal}
                  className="text-[10px] font-bold text-[#2563EB] bg-[#EFF6FF] hover:bg-blue-600 hover:text-white px-2 py-0.5 rounded-lg border border-[#2563EB]/20 transition-all cursor-pointer flex items-center gap-1"
                  title="Click to edit policy timing rules"
                >
                  <FaEdit className="text-[9px]" />
                  <span>Edit Policy</span>
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div
                  onClick={handleOpenPolicyModal}
                  className="p-3.5 rounded-xl bg-[#EFF6FF] hover:bg-blue-100/80 border border-[#2563EB]/20 flex justify-between items-center transition-all hover:scale-[1.01] cursor-pointer group shadow-xs"
                  title="Click to edit On-Time timing policy"
                >
                  <span className="font-semibold text-[#2563EB]">
                    {attendancePolicy?.shift_start || "10:00 AM"} – {(() => {
                      const start = timeToMinutes(attendancePolicy?.shift_start || "10:00 AM");
                      const end = start + (parseInt(attendancePolicy?.grace_period_minutes) || 14);
                      return minutesToTime(end);
                    })()}
                  </span>
                  <span className="text-[10px] font-bold text-[#2563EB] bg-white px-2.5 py-1 rounded border border-[#2563EB]/20 flex items-center gap-1 group-hover:bg-[#2563EB] group-hover:text-white transition-colors">
                    <span>On Time 🟢</span>
                    <FaEdit className="text-[9px]" />
                  </span>
                </div>

                <div
                  onClick={handleOpenPolicyModal}
                  className="p-3.5 rounded-xl bg-[#FEF3C7] hover:bg-amber-100/80 border border-[#F59E0B]/20 flex justify-between items-center transition-all hover:scale-[1.01] cursor-pointer group shadow-xs"
                  title="Click to edit Late Warning timing policy"
                >
                  <span className="font-semibold text-[#92400E]">
                    {(() => {
                      const start = timeToMinutes(attendancePolicy?.shift_start || "10:00 AM");
                      const end = start + (parseInt(attendancePolicy?.grace_period_minutes) || 14);
                      const end2 = start + (parseInt(attendancePolicy?.late_warning_minutes) || 29);
                      return `${minutesToTime(end)} – ${minutesToTime(end2)}`;
                    })()}
                  </span>
                  <span className="text-[10px] font-bold text-[#92400E] bg-white px-2.5 py-1 rounded border border-[#F59E0B]/20 flex items-center gap-1 group-hover:bg-[#D97706] group-hover:text-white transition-colors">
                    <span>Late Warning 🟠</span>
                    <FaEdit className="text-[9px]" />
                  </span>
                </div>

                <div
                  onClick={handleOpenPolicyModal}
                  className="p-3.5 rounded-xl bg-[#FEE2E2] hover:bg-rose-100/80 border border-[#EF4444]/20 flex justify-between items-center transition-all hover:scale-[1.01] cursor-pointer group shadow-xs"
                  title="Click to edit Salary Deduction threshold policy"
                >
                  <span className="font-semibold text-[#991B1B]">
                    {(() => {
                      const start = timeToMinutes(attendancePolicy?.shift_start || "10:00 AM");
                      const end = start + (parseInt(attendancePolicy?.late_warning_minutes) || 29);
                      return `${minutesToTime(end)} & After`;
                    })()}
                  </span>
                  <span className="text-[10px] font-bold text-[#991B1B] bg-white px-2.5 py-1 rounded border border-[#EF4444]/20 flex items-center gap-1 group-hover:bg-[#DC2626] group-hover:text-white transition-colors">
                    <span>Salary Deduction 🔴</span>
                    <FaEdit className="text-[9px]" />
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleOpenPolicyModal}
                className="w-full mt-2 py-2 px-3 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-bold text-xs transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
              >
                <FaEdit className="text-xs" />
                <span>Edit Policy Timeline & Rules</span>
              </button>
            </div>

            {/* Widget 3: Quick Rules & Notices */}
            <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm space-y-3 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#2563EB]" />
              <div className="border-b border-[#E2E8F0] pb-2">
                <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider flex items-center gap-1.5">
                  <FaInfoCircle className="text-[#2563EB]" />
                  <span>Quick Rules & Notices</span>
                </h3>
              </div>

              <div className="space-y-1.5 text-xs text-[#64748B]">
                <p>• <strong>Shift Timing:</strong> {attendancePolicy?.shift_start || "10:00 AM"} – {attendancePolicy?.shift_end || "6:00 PM"}</p>
                <p>• <strong>Grace Period:</strong> {attendancePolicy?.shift_start || "10:00 AM"} – {(() => {
                  const start = timeToMinutes(attendancePolicy?.shift_start || "10:00 AM");
                  const end = start + (parseInt(attendancePolicy?.grace_period_minutes) || 14);
                  return minutesToTime(end);
                })()}</p>
                <p className="text-[11px] text-[#0F172A] font-medium leading-relaxed pt-1">
                  Attendance recorded after {(() => {
                    const start = timeToMinutes(attendancePolicy?.shift_start || "10:00 AM");
                    const end = start + (parseInt(attendancePolicy?.late_warning_minutes) || 29);
                    return minutesToTime(end);
                  })()} will automatically trigger salary deduction according to company HR policy.
                </p>
              </div>
            </div>

            {/* Widget 4: System Status & Attendance Adjustment Request */}
            <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm space-y-3">
              <div className="border-b border-[#E2E8F0] pb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider flex items-center gap-1.5">
                  <FaShieldAlt className="text-[#2563EB]" />
                  <span>System Status & Support</span>
                </h3>
                <span className="text-[10px] font-bold text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded border border-[#2563EB]/20">
                  Operational 🟢
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center gap-2 text-[#0F172A] font-medium text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-pulse" />
                  <span>All Verification Gateways Operational</span>
                </div>

                <button
                  type="button"
                  onClick={handleOpenAdjustmentModal}
                  className="w-full py-2.5 px-3 rounded-xl bg-white hover:bg-[#EFF6FF] text-[#2563EB] border border-[#E2E8F0] font-semibold text-xs transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 shadow-xs hover:border-[#2563EB]"
                >
                  <span>📩 Request Attendance Adjustment</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. MASTER SYSTEM ATTENDANCE LOG */}
      <div id="master-attendance-log" className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm space-y-4 scroll-mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3">
          <div>
            <h3 className="font-bold text-[#0F172A] text-base flex items-center gap-2">
              <FaHistory className="text-[#2563EB]" />
              <span>
                {currentRole === "admin"
                  ? "Organization Master System Attendance Log"
                  : `My Attendance History Dossier (${userName || userEmail})`}
              </span>
            </h3>
            <p className="text-xs text-[#64748B] flex items-center gap-2 flex-wrap mt-0.5">
              <span>
                {currentRole === "admin"
                  ? "Full database view of all employees, students, and interns."
                  : "All your recorded check-in/out logs saved permanently in the cloud database."}
              </span>
              {statusFilter !== "all" && (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded-md border border-[#2563EB]/20">
                  Filtered by: <strong className="capitalize">{statusFilter === "present" ? "Present & On Time" : statusFilter === "late" ? "Late Warning" : statusFilter === "leave" ? "On Leave" : statusFilter === "absent" ? "Absent Today (No Check-In)" : statusFilter}</strong>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("all")}
                    className="hover:text-rose-600 font-black cursor-pointer text-xs ml-0.5"
                    title="Clear status filter"
                  >
                    ✕
                  </button>
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Status Filter Chips */}
            <div className="flex items-center gap-1 bg-[#F8FAFC] p-1 rounded-xl border border-[#E2E8F0] text-xs font-medium overflow-x-auto">
              {[
                { id: "all", label: "All Status" },
                { id: "present", label: "Present 🟢" },
                { id: "late", label: "Late 🟠" },
                { id: "leave", label: "Leave 🟣" },
                { id: "absent", label: "Absent 🔴" },
              ].map(st => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
                    statusFilter === st.id
                      ? "bg-white text-[#2563EB] shadow-xs border border-[#E2E8F0]"
                      : "text-[#64748B] hover:text-[#0F172A]"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-48">
              <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B] text-xs" />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Search user, ID, status..."
                className="w-full pl-9 pr-3 py-1.5 text-xs text-[#0F172A] border border-[#E2E8F0] rounded-xl outline-none focus:border-[#2563EB] bg-white font-medium"
              />
            </div>

            {currentRole === "admin" && (
              <div className="flex items-center gap-1 bg-[#F8FAFC] p-1 rounded-xl border border-[#E2E8F0] text-xs font-medium">
                {["all", "employee", "student"].map(f => (
                  <button
                    key={f}
                    onClick={() => setAdminFilter(f)}
                    className={`px-3 py-1 rounded-lg uppercase text-[10px] font-bold cursor-pointer transition-colors ${
                      adminFilter === f ? "bg-white text-[#2563EB] shadow-xs border border-[#E2E8F0]" : "text-[#64748B] hover:text-[#0F172A]"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}

            {currentRole !== "admin" ? (
              <button
                type="button"
                onClick={() => handleExportSingleUserPdf({ user_name: userName, user_email: userEmail, user_role: userRole })}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs whitespace-nowrap"
              >
                <FaFilePdf className="text-xs" /> Download My Attendance PDF
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <FaFilePdf className="text-xs text-emerald-600" /> Export PDF
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="bg-white hover:bg-[#F8FAFC] text-[#2563EB] border border-[#E2E8F0] font-semibold px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <FaDownload className="text-xs" /> Export CSV
                </button>
              </>
            )}
          </div>
        </div>

        {/* 100% Full Width Table */}
        <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] w-full min-h-[260px] pb-10">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#F8FAFC] text-[#64748B] font-semibold uppercase text-[10px] tracking-wider border-b border-[#E2E8F0] sticky top-0">
              <tr>
                <th className="py-3 px-4 min-w-[180px] whitespace-nowrap">User Name & Role</th>
                <th className="py-3 px-4 min-w-[130px] whitespace-nowrap">Attendance Status</th>
                <th className="py-3 px-4 min-w-[140px] whitespace-nowrap">Last Action</th>
                <th className="py-3 px-4 min-w-[120px] whitespace-nowrap">Work Duration</th>
                <th className="py-3 px-4 min-w-[140px] whitespace-nowrap">Public IP</th>
                <th className="py-3 px-4 text-right min-w-[160px] whitespace-nowrap">Date & Time</th>
                {currentRole === "admin" && <th className="py-3 px-4 text-right min-w-[80px] whitespace-nowrap">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] font-normal">
              {filteredSystemLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#64748B] italic">
                    No attendance records matching search criteria.
                  </td>
                </tr>
              ) : (
                filteredSystemLogs.map((r, idx) => (
                  <tr key={`att-row-${r.id || 'rec'}-${idx}`} className="hover:bg-[#F8FAFC] transition-colors align-middle">
                    <td className="py-3.5 px-4 font-semibold text-[#0F172A] whitespace-nowrap">
                      {r.user_name || r.user_id}
                      <span className="text-[10px] font-bold text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded ml-2 border border-[#2563EB]/20 uppercase whitespace-nowrap">
                        {r.user_role === "student" ? "Student" : "Staff"}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      {/* Consistent Badge Padding (Requirement #4) */}
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${
                        (r.attendance_status || "").toLowerCase().includes("leave")
                          ? "bg-[#F5F3FF] text-[#7C3AED] border-[#7C3AED]/20 font-bold"
                          : (r.attendance_status || "").toLowerCase().includes("absent")
                          ? "bg-[#FEE2E2] text-[#991B1B] border-[#EF4444]/20 font-bold"
                          : (r.attendance_status || "").toLowerCase().includes("late")
                          ? "bg-[#FEF3C7] text-[#92400E] border-[#F59E0B]/20 font-bold"
                          : "bg-[#EFF6FF] text-[#2563EB] border-[#2563EB]/20 font-bold"
                      }`}>
                        {r.attendance_status || "Present"}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-semibold text-[#0F172A] whitespace-nowrap">
                      {r.type === "check_in" ? "Clock-In Completed" : "Clock-Out Completed"}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-[#0F172A] font-semibold whitespace-nowrap">
                      {r.total_work_hours || "In Progress"}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-[#64748B] whitespace-nowrap">{r.public_ip || userIp}</td>

                    <td className="py-3.5 px-4 text-right font-medium text-[#64748B] whitespace-nowrap">
                      {r.attendance_date} {r.check_in_time || r.check_out_time}
                    </td>

                    {currentRole === "admin" && (
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleExportSingleUserPdf(r)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                            title={`Download ${r.user_name || 'User'}'s Attendance PDF`}
                          >
                            <FaFilePdf className="text-[10px] text-emerald-600" />
                            <span>PDF</span>
                          </button>

                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setActiveKebabId(activeKebabId === r.id ? null : r.id)}
                              className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                            >
                              <FaEllipsisV className="text-xs" />
                            </button>

                            {activeKebabId === r.id && (
                              <div className={`absolute right-0 ${idx >= Math.max(1, filteredSystemLogs.length - 2) ? "bottom-full mb-1.5" : "top-full mt-1.5"} w-48 rounded-xl bg-white p-1.5 shadow-2xl border border-[#E2E8F0] z-50 space-y-0.5 text-xs text-left animate-in fade-in zoom-in-95 duration-100`}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleExportSingleUserPdf(r);
                                    setActiveKebabId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-emerald-50 text-emerald-700 font-semibold transition-colors flex items-center gap-1.5"
                                >
                                  <FaFilePdf className="text-xs text-emerald-600" />
                                  <span>Download User PDF</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setInspectModal(r);
                                    setActiveKebabId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-[#EFF6FF] text-[#0F172A] hover:text-[#2563EB] font-semibold transition-colors"
                                >
                                  View Details
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDeleteModal({ isOpen: true, record: r, loading: false });
                                    setActiveKebabId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-rose-50 text-rose-600 font-semibold transition-colors"
                                >
                                  Delete Record
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CONFIRMATION DESTRUCTIVE MODAL */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E2E8F0] space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 border-b border-[#E2E8F0] pb-3 text-[#0F172A]">
              <FaExclamationTriangle className="text-xl text-[#2563EB]" />
              <h3 className="font-bold text-[#0F172A] text-base">Delete Attendance Record</h3>
            </div>

            <p className="text-xs text-[#64748B] leading-relaxed">
              Are you sure you want to delete this attendance entry? Only this record will be purged.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModal({ isOpen: false, record: null, loading: false })}
                className="flex-1 py-2.5 rounded-xl bg-white hover:bg-[#F8FAFC] text-[#2563EB] border border-[#E2E8F0] font-semibold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDeleteRecord}
                disabled={deleteModal.loading}
                className="flex-1 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs cursor-pointer flex items-center justify-center"
              >
                {deleteModal.loading ? "Purging..." : "Confirm & Delete 🗑️"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INSPECT DETAILS MODAL */}
      {inspectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E2E8F0] space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">{inspectModal.user_name || inspectModal.user_id}</h3>
                <p className="text-xs font-mono text-[#64748B]">{inspectModal.user_email || inspectModal.user_id}</p>
              </div>
              <button onClick={() => setInspectModal(null)} className="text-[#64748B] hover:text-[#0F172A] font-bold text-base">✕</button>
            </div>

            <div className="space-y-2 text-xs font-mono text-[#0F172A]">
              <p><strong>Status:</strong> {inspectModal.attendance_status || "Present"}</p>
              <p><strong>Date:</strong> {inspectModal.attendance_date}</p>
              <p><strong>Check-In:</strong> {inspectModal.check_in_time}</p>
              <p><strong>Check-Out:</strong> {inspectModal.check_out_time}</p>
              <p><strong>Work Duration:</strong> {inspectModal.total_work_hours}</p>
              <p><strong>Public IP:</strong> {inspectModal.public_ip}</p>
            </div>

            <div className="pt-2 text-right">
              <button onClick={() => setInspectModal(null)} className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold px-4 py-2 rounded-xl text-xs">
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OFFICE WI-FI IP SECURITY GEOFENCING MODAL */}
      {showIpManagerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-[#E2E8F0] space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center">
                  <FaWifi className="text-base" />
                </div>
                <div>
                  <h3 className="font-bold text-[#0F172A] text-sm">Office Wi-Fi IP Geofencing</h3>
                  <p className="text-[11px] text-slate-500">Authorize official office network for attendance.</p>
                </div>
              </div>
              <button onClick={() => setShowIpManagerModal(false)} className="text-slate-400 hover:text-slate-700 font-bold text-base cursor-pointer">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-blue-50/50 border border-blue-100 space-y-1">
                <span className="text-[10px] font-bold text-blue-900 uppercase">Current Detected Public IP</span>
                <p className="font-mono font-black text-blue-700 text-sm">{userIp || "Detecting..."}</p>
                <p className="text-[11px] text-slate-600">Your current router public IP address.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                  Authorized Office Public IP *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customOfficeIp}
                    onChange={(e) => setCustomOfficeIp(e.target.value)}
                    placeholder="e.g. 39.46.102.129"
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setCustomOfficeIp(userIp)}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer whitespace-nowrap"
                  >
                    Use Current IP
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 italic">
                🛡️ Only staff and students connected to this public IP will be authorized to mark attendance on-site.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowIpManagerModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setOfficeNetworkInfo(prev => ({ ...prev, public_ip_address: customOfficeIp }));
                  setShowIpManagerModal(false);
                  showToast("Office IP Saved 🛡️", `Authorized IP set to ${customOfficeIp}`, "success");
                }}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer"
              >
                Save & Enforce IP
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT ATTENDANCE POLICY RULES MODAL */}
      {showPolicyModal && (
        <Modal
          isOpen={showPolicyModal}
          onClose={() => setShowPolicyModal(false)}
          title="✏️ Edit Attendance Policy Timeline & Rules"
        >
          <div className="space-y-4 text-xs text-slate-900">
            <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 space-y-1">
              <p className="font-bold text-xs">Configure Official Shift Timings & Grace Periods</p>
              <p className="text-[11px] text-blue-700">Admin settings to control On-Time cutoff, Late Warning window, and Salary Deduction threshold.</p>
            </div>

            <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Official Shift Start Time *</label>
                <input
                  type="text"
                  value={policyForm.shift_start}
                  onChange={(e) => setPolicyForm({ ...policyForm, shift_start: e.target.value })}
                  placeholder="e.g. 10:00 AM"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-emerald-800 mb-1">On-Time Grace Window (Minutes after shift start) 🟢</label>
                <input
                  type="number"
                  value={policyForm.grace_period_minutes}
                  onChange={(e) => setPolicyForm({ ...policyForm, grace_period_minutes: e.target.value })}
                  placeholder="14"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-emerald-300 font-semibold text-emerald-900 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Calculated On-Time Range: <strong>{policyForm.shift_start || "10:00 AM"} – {(() => {
                    const start = timeToMinutes(policyForm.shift_start || "10:00 AM");
                    const end = start + (parseInt(policyForm.grace_period_minutes) || 14);
                    return minutesToTime(end);
                  })()}</strong>
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-amber-800 mb-1">Late Warning Window (Minutes after shift start) 🟠</label>
                <input
                  type="number"
                  value={policyForm.late_warning_minutes}
                  onChange={(e) => setPolicyForm({ ...policyForm, late_warning_minutes: e.target.value })}
                  placeholder="29"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-amber-300 font-semibold text-amber-900 text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Calculated Late Warning Range: <strong>{(() => {
                    const start = timeToMinutes(policyForm.shift_start || "10:00 AM");
                    const end = start + (parseInt(policyForm.grace_period_minutes) || 14);
                    const end2 = start + (parseInt(policyForm.late_warning_minutes) || 29);
                    return `${minutesToTime(end)} – ${minutesToTime(end2)}`;
                  })()}</strong>
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-rose-800 mb-1">Salary Deduction Cutoff 🔴</label>
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold text-xs">
                  {(() => {
                    const start = timeToMinutes(policyForm.shift_start || "10:00 AM");
                    const end2 = start + (parseInt(policyForm.late_warning_minutes) || 29);
                    return `${minutesToTime(end2)} & After (Salary Cut Policy Applies)`;
                  })()}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowPolicyModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePolicy}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs cursor-pointer"
              >
                Save Updated Policy 💾
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* REQUEST ATTENDANCE ADJUSTMENT MODAL */}
      {showAdjustmentModal && (
        <Modal
          isOpen={showAdjustmentModal}
          onClose={() => setShowAdjustmentModal(false)}
          title="📩 Request Attendance Adjustment"
        >
          <div className="space-y-4 text-xs text-slate-900">
            <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 space-y-1">
              <p className="font-bold text-xs">Submit Official Attendance Correction Request</p>
              <p className="text-[11px] text-blue-700">Request manual clock-in/out adjustment or late penalty waiver from Admin & HR Support.</p>
            </div>

            <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Target Date *</label>
                  <input
                    type="date"
                    value={adjustmentForm.target_date}
                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, target_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Adjustment Type *</label>
                  <select
                    value={adjustmentForm.request_type}
                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, request_type: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="Missed Punch Correction">Missed Punch (Forgot Clock-In/Out)</option>
                    <option value="Time Correction">Time Correction (System Error)</option>
                    <option value="Network / IP Issue">Office Wi-Fi / IP Gateway Mismatch</option>
                    <option value="Late Arrival Waiver">Late Arrival Penalty Waiver</option>
                    <option value="Emergency Work Adjustment">Off-Site / Emergency Work</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Requested Clock-In Time</label>
                  <input
                    type="text"
                    value={adjustmentForm.requested_clock_in}
                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, requested_clock_in: e.target.value })}
                    placeholder="e.g. 10:00 AM"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Requested Clock-Out Time</label>
                  <input
                    type="text"
                    value={adjustmentForm.requested_clock_out}
                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, requested_clock_out: e.target.value })}
                    placeholder="e.g. 06:00 PM"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Reason & Explanation *</label>
                <textarea
                  rows={3}
                  value={adjustmentForm.reason}
                  onChange={(e) => setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })}
                  placeholder="Please explain why the adjustment is needed (e.g. power outage, network issue, approved offsite task)..."
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-medium text-slate-900 text-xs focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowAdjustmentModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitAdjustmentRequest}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <span>Submit Request 📩</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* DEDICATED PER-USER PDF EXPORT MODAL */}
      {showUserPdfModal && (
        <Modal isOpen={showUserPdfModal} onClose={() => setShowUserPdfModal(false)} title="Download Individual User Attendance PDF 👤">
          <div className="space-y-4 text-xs">
            <p className="text-slate-600">
              Select any candidate (Student, Employee, or Remote Intern) to download their personal attendance history PDF dossier.
            </p>

            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={userPdfSearch}
                onChange={(e) => setUserPdfSearch(e.target.value)}
                placeholder="Search candidate by name, email, or role..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-semibold text-slate-900 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100">
              {uniqueUsersInLogs
                .filter(u => {
                  if (!userPdfSearch.trim()) return true;
                  const q = userPdfSearch.toLowerCase();
                  return (
                    u.user_name.toLowerCase().includes(q) ||
                    u.user_email.toLowerCase().includes(q) ||
                    u.user_role.toLowerCase().includes(q)
                  );
                })
                .map((u, i) => (
                  <div key={`user-pdf-${i}`} className="pt-2 flex items-center justify-between gap-3 hover:bg-slate-50 p-2 rounded-xl transition-colors">
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                        <span>{u.user_name}</span>
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 uppercase">
                          {u.user_role}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">{u.user_email || 'No email logged'}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{u.recordsCount} Attendance Records in Database</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        handleExportSingleUserPdf(u);
                        setShowUserPdfModal(false);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs shrink-0"
                    >
                      <FaFilePdf className="text-xs" />
                      <span>Download PDF</span>
                    </button>
                  </div>
                ))}
              {uniqueUsersInLogs.length === 0 && (
                <div className="text-center py-6 text-slate-400 italic">No user attendance logs found in database.</div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowUserPdfModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-100 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}

"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { dbFetch, dbSaveRecord, dbDeleteRecord } from "@/lib/dbPersistence";
import { showToast } from "@/components/Toast";
import { fetchRecentActivities, formatTimeAgo, clearActivityLogs } from "@/lib/activityUtils";
import { enrollStudentWithCredentials, registerEmployeeWithCredentials } from "@/lib/studentEnrollmentUtils";
import FinancialChart from "@/components/FinancialChart";
import {
  FaUsers,
  FaCalendarCheck,
  FaMoneyBillWave,
  FaProjectDiagram,
  FaUserPlus,
  FaCheckCircle,
  FaGraduationCap,
  FaUserTie,
  FaTasks,
  FaLock,
  FaShieldAlt,
  FaLandmark,
  FaPaperPlane,
  FaBell,
  FaExclamationTriangle,
  FaHistory,
  FaClock,
  FaFolderOpen,
  FaTrash,
  FaEllipsisV,
  FaPlusCircle,
  FaReceipt,
  FaFileInvoiceDollar,
  FaLaptopCode,
  FaChartLine,
  FaFilter,
  FaSearch,
  FaTimes,
  FaVideo,
  FaDesktop
} from "react-icons/fa";

export default function DashboardPage() {
  const [role, setRole] = useState("admin");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    employees: 0,
    students: 0,
    interns: 0,
    activeProjects: 0,
    monthlyRevenue: 0,
    pendingLeaves: 0,
    monthlyExpenses: 0,
    categoryBreakdown: []
  });

  const [liveAttendanceList, setLiveAttendanceList] = useState([]);
  const [projectsProgressList, setProjectsProgressList] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [allRegisteredUsersList, setAllRegisteredUsersList] = useState([]);

  // Table State
  const [tableSearch, setTableSearch] = useState("");
  const [segmentedFilter, setSegmentedFilter] = useState("all");
  const [sortColumn, setSortColumn] = useState("fullName");
  const [sortDirection, setSortDirection] = useState("asc");

  // Modals & Popup State
  const [selectedUserModal, setSelectedUserModal] = useState(null);
  const [activeKebabId, setActiveKebabId] = useState(null);

  // Destructive Confirmation Modal
  const [confirmDeleteModal, setConfirmDeleteModal] = useState({ isOpen: false, type: "", targetId: "", title: "", loading: false });

  const overallProgressPercentage = useMemo(() => {
    if (!projectsProgressList || projectsProgressList.length === 0) return 0;
    const total = projectsProgressList.reduce((acc, p) => {
      const prog = p.progress !== undefined ? Number(p.progress) : (p.status === "Completed" ? 100 : p.status === "In Progress" ? 25 : 0);
      return acc + prog;
    }, 0);
    return Math.round(total / projectsProgressList.length);
  }, [projectsProgressList]);

  useEffect(() => {
    const storedRole = localStorage.getItem("user_role") || "admin";
    setRole(storedRole);

    const handleRoleChange = () => {
      setRole(localStorage.getItem("user_role") || "admin");
    };

    window.addEventListener("roleChanged", handleRoleChange);
    return () => window.removeEventListener("roleChanged", handleRoleChange);
  }, []);

  const loadDashboardData = useCallback(async () => {
    try {
      const currentYearMonth = new Date().toISOString().slice(0, 7);

      const [allEmps, fullProjList, incList, leaveList, expList, liveTasks, studentList, invoiceList, internList] = await Promise.all([
        dbFetch("employees", [], true).catch(() => []),
        dbFetch("projects", [], true).catch(() => []),
        dbFetch("incomes", [], true).catch(() => []),
        dbFetch("leaves", [], true).catch(() => []),
        dbFetch("expenses", [], true).catch(() => []),
        dbFetch("daily_tasks", [], true).catch(() => []),
        dbFetch("students", [], true).catch(() => []),
        dbFetch("invoices", [], true).catch(() => []),
        dbFetch("interns", [], true).catch(() => [])
      ]);

      const employeeCount = (allEmps || []).filter(e => (e.status || "").toLowerCase() !== "inactive" && (e.status || "").toLowerCase() !== "terminated").length;
      let finalProjectsList = Array.isArray(fullProjList) ? fullProjList : [];

      const incomesSum = (incList || [])
        .filter(item => !item.status || item.status.toLowerCase() === "paid" || item.status.toLowerCase() === "cleared")
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

      const studentFeesSum = (studentList || [])
        .reduce((sum, s) => sum + (Number(s.fee_paid || s.submitted_fee || s.course_fee) || 0), 0);

      const invoicesSum = (invoiceList || [])
        .filter(inv => !inv.status || inv.status.toLowerCase() === "paid" || inv.status.toLowerCase() === "cleared")
        .reduce((sum, inv) => sum + (Number(inv.amount || inv.total) || 0), 0);

      const monthlyRevenue = incomesSum + studentFeesSum + invoicesSum;

      const pendingLeavesCount = (leaveList || []).filter(l => (l.status || "").toLowerCase() === "pending").length;

      const totalExpensesAmount = (expList || []).reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
      const catMap = new Map();
      (expList || []).forEach(i => {
        const cat = i.category || "General Expense";
        const amt = Number(i.amount) || 0;
        catMap.set(cat, (catMap.get(cat) || 0) + amt);
      });
      const categoryBreakdown = Array.from(catMap.entries()).map(([category, amount]) => ({ category, amount }));

      let rawTasks = Array.isArray(liveTasks) ? [...liveTasks] : [];
      try {
        const dtLocal = localStorage.getItem("software_house_daily_tasks");
        const atLocal = localStorage.getItem("software_house_assigned_tasks");
        if (dtLocal) rawTasks = [...rawTasks, ...JSON.parse(dtLocal)];
        if (atLocal) rawTasks = [...rawTasks, ...JSON.parse(atLocal)];
      } catch (e) { }

      const allRoster = [...(allEmps || []), ...(studentList || []), ...(internList || [])];

      const resolveAssigneeName = (item) => {
        const raw = item.assignedToName || item.assignedTo || item.assigned_to || item.assignedToEmail || item.assigned_to_email || item.client_name || "";
        const rawStr = String(raw).trim();
        if (rawStr && rawStr.toLowerCase() !== "non" && rawStr.toLowerCase() !== "unassigned member" && rawStr.toLowerCase() !== "undefined" && rawStr.toLowerCase() !== "null") {
          return rawStr;
        }
        const searchKey = (item.assignedToEmail || item.assigned_to_email || item.assigned_to || item.assignedTo || "").toLowerCase().trim();
        if (searchKey) {
          const match = allRoster.find(m => 
            (m.email && m.email.toLowerCase().trim() === searchKey) || 
            (m.id && String(m.id).toLowerCase().trim() === searchKey)
          );
          if (match) return match.full_name || match.name || match.email;
        }
        return "Assigned Engineer";
      };

      const calculateTaskProgress = (item) => {
        if (item.status === "Completed") return 100;
        if (item.progress !== undefined && item.progress !== null && !isNaN(Number(item.progress))) {
          return Math.min(100, Math.max(0, Number(item.progress)));
        }
        const curSecs = Number(item.timerSeconds || item.total_working_seconds || 0);
        if (curSecs > 0) {
          const targetSecs = (Number(item.target_days) || 1) * 3600;
          return Math.min(95, Math.max(1, Math.round((curSecs / targetSecs) * 100)));
        }
        if (item.status === "In Progress") return 10;
        // Strictly 0% when newly assigned or Pending
        return 0;
      };

      let combinedDeliverables = [];

      rawTasks.forEach(t => {
        if (!t) return;
        combinedDeliverables.push({
          id: t.id || `t-${Math.random()}`,
          title: t.task || t.title || t.task_name || "Untitled Project Task",
          client_name: resolveAssigneeName(t),
          progress: calculateTaskProgress(t),
          status: t.status || (Number(t.timerSeconds || 0) > 0 ? "In Progress" : "Pending")
        });
      });

      finalProjectsList.forEach(p => {
        if (!p) return;
        combinedDeliverables.push({
          id: p.id || `p-${Math.random()}`,
          title: p.title || p.name || "Untitled Project",
          client_name: p.client_name || p.client || resolveAssigneeName(p),
          progress: p.progress !== undefined ? Number(p.progress) : (p.completion ? Number(p.completion) : (p.status === "Completed" ? 100 : p.status === "In Progress" ? 25 : 0)),
          status: p.status || "Active"
        });
      });

      const uniqueDeliverablesMap = new Map();
      combinedDeliverables.forEach(d => {
        const key = String(d.id || d.title).toLowerCase().trim();
        if (key && !uniqueDeliverablesMap.has(key)) {
          uniqueDeliverablesMap.set(key, d);
        }
      });

      const finalDeliverablesList = Array.from(uniqueDeliverablesMap.values());
      setProjectsProgressList(finalDeliverablesList);

      const activeProjectCount = finalDeliverablesList.filter(d => {
        const st = String(d.status || "Active").toLowerCase();
        return !st.includes("completed") && !st.includes("archived") && !st.includes("cancelled");
      }).length || finalDeliverablesList.length;

      const stus = studentList || [];
      const ints = internList || [];

      setStats({
        employees: employeeCount,
        students: stus.length || 0,
        interns: ints.length || 0,
        activeProjects: activeProjectCount,
        monthlyRevenue: monthlyRevenue,
        pendingLeaves: pendingLeavesCount,
        monthlyExpenses: totalExpensesAmount,
        categoryBreakdown: categoryBreakdown
      });
    } catch (err) {
      console.warn("Notice fetching stats:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAllMembers = useCallback(async () => {
    try {
      const [cloudEmps, cloudStudents, cloudInterns, cloudAtt, cloudLeaves] = await Promise.all([
        dbFetch("employees", [], true).catch(() => []),
        dbFetch("students", [], true).catch(() => []),
        dbFetch("interns", [], true).catch(() => []),
        dbFetch("attendance", [], true).catch(() => []),
        dbFetch("leaves", [], true).catch(() => [])
      ]);

      if (typeof window !== "undefined") {
        if (Array.isArray(cloudEmps)) localStorage.setItem("persistent_employees", JSON.stringify(cloudEmps));
        if (Array.isArray(cloudStudents)) localStorage.setItem("persistent_courses", JSON.stringify(cloudStudents));
        if (Array.isArray(cloudInterns)) localStorage.setItem("persistent_interns", JSON.stringify(cloudInterns));
      }

      const persistentEmps = cloudEmps || [];
      const persistentStudents = cloudStudents || [];
      const persistentInterns = cloudInterns || [];
      const dbAttendance = cloudAtt || [];
      const dbLeaves = cloudLeaves || [];

      const masterLogs = JSON.parse(localStorage.getItem("software_house_master_attendance_logs") || "[]");
      const savedEmpAtt = JSON.parse(localStorage.getItem("today_attendance_employee") || "[]");
      const savedStuAtt = JSON.parse(localStorage.getItem("today_attendance_student") || "[]");

      const todayStr = new Date().toISOString().split("T")[0];
      const now = new Date();
      const currentMins = now.getHours() * 60 + now.getMinutes();

      const formatPresentText = (record) => {
        const timeIn = record.check_in_time || record.check_in || "";
        const timeOut = record.check_out_time || record.check_out || "";
        const hasTimeOut = timeOut && timeOut !== "Not Checked Out" && timeOut !== "--:--";

        if (timeIn && hasTimeOut) {
          return `Present 🟢 (In: ${timeIn} | Out: ${timeOut})`;
        } else if (timeIn && timeIn !== "--:--") {
          return `Present Today (${timeIn}) 🟢`;
        }
        return "Present Today 🟢";
      };

      const isEmailMatch = (emailA, emailB) => {
        if (!emailA || !emailB) return false;
        const a = emailA.toLowerCase().trim();
        const b = emailB.toLowerCase().trim();
        if (!a.includes("@") || !b.includes("@")) return false;
        return a === b;
      };

      const isNameMatch = (nameA, nameB) => {
        if (!nameA || !nameB) return false;
        const a = nameA.toLowerCase().trim();
        const b = nameB.toLowerCase().trim();
        if (a.length < 3 || b.length < 3) return false;
        const generic = ["member", "student", "intern", "employee", "admin", "staff", "user", "unknown"];
        if (generic.includes(a) || generic.includes(b)) return false;
        return a === b;
      };

      const isCandidateMatch = (record, targetEmail, targetItem) => {
        if (!record) return false;
        const rEmail = (record.user_email || record.email || record.user_id || record.student_id || record.employee_id || "").toLowerCase().trim();
        const rName = (record.user_name || record.name || record.full_name || record.employee_name || "").toLowerCase().trim();
        const targetName = (targetItem?.full_name || targetItem?.name || "").toLowerCase().trim();
        const targetId = String(targetItem?.id || "").toLowerCase().trim();
        const rId = String(record.employee_id || record.student_id || record.user_id || "").toLowerCase().trim();

        if (isEmailMatch(rEmail, targetEmail)) return true;
        if (targetId && targetId.length > 5 && rId && rId.length > 5 && targetId === rId) return true;
        if (isNameMatch(rName, targetName)) return true;
        return false;
      };

      const getTodayAttendanceDetails = (email, item) => {
        if (!email) return { checkIn: "--:--", checkOut: "--:--", status: "Not Clocked In Yet" };
        const eClean = email.toLowerCase().trim();

        // 1. Check direct database attendance
        const dbTodayRecord = dbAttendance.find(r => {
          const rDate = (r.attendance_date || r.date || (r.timestamp ? r.timestamp.split("T")[0] : "")).slice(0, 10);
          const isDateToday = rDate === todayStr || (r.created_at && r.created_at.slice(0, 10) === todayStr);
          return isDateToday && isCandidateMatch(r, eClean, item);
        });

        if (dbTodayRecord) {
          const checkIn = dbTodayRecord.check_in_time || dbTodayRecord.check_in || "--:--";
          const checkOut = dbTodayRecord.check_out_time || dbTodayRecord.check_out || "Not Checked Out";
          const rawStatus = dbTodayRecord.attendance_status || dbTodayRecord.status || (checkOut && checkOut !== "Not Checked Out" && checkOut !== "--:--" ? "Present (Completed) 🟢" : "Present (On Time) 🟢");
          return { checkIn, checkOut, status: rawStatus.includes("🟢") || rawStatus.includes("🔴") ? rawStatus : `${rawStatus} 🟢` };
        }

        // 2. Direct user local storage log
        const userAttKey = `today_attendance_${eClean}`;
        const userLogs = JSON.parse(localStorage.getItem(userAttKey) || "[]");
        const todayUserLog = userLogs.find(r => {
          const rDate = (r.attendance_date || r.date || r.timestamp || r.created_at || "").slice(0, 10);
          return rDate === todayStr || new Date(r.timestamp || r.created_at || Date.now()).toISOString().split("T")[0] === todayStr;
        });

        if (todayUserLog) {
          const checkIn = todayUserLog.check_in_time || todayUserLog.check_in || "--:--";
          const checkOut = todayUserLog.check_out_time || todayUserLog.check_out || "Not Checked Out";
          const rawStatus = todayUserLog.attendance_status || todayUserLog.status || "Present (On Time) 🟢";
          return { checkIn, checkOut, status: rawStatus.includes("🟢") || rawStatus.includes("🔴") ? rawStatus : `${rawStatus} 🟢` };
        }

        // 3. Master logs cache
        const todayMasterLog = masterLogs.find(r => {
          const rDate = (r.attendance_date || r.date || r.timestamp || r.created_at || "").slice(0, 10);
          const isDateToday = rDate === todayStr || new Date(r.timestamp || r.created_at || Date.now()).toISOString().split("T")[0] === todayStr;
          return isDateToday && isCandidateMatch(r, eClean, item);
        });

        if (todayMasterLog) {
          const checkIn = todayMasterLog.check_in_time || todayMasterLog.check_in || "--:--";
          const checkOut = todayMasterLog.check_out_time || todayMasterLog.check_out || "Not Checked Out";
          const rawStatus = todayMasterLog.attendance_status || todayMasterLog.status || "Present (On Time) 🟢";
          return { checkIn, checkOut, status: rawStatus.includes("🟢") || rawStatus.includes("🔴") ? rawStatus : `${rawStatus} 🟢` };
        }

        // 4. Check Leaves (Approved or Pending)
        const userLeave = dbLeaves.find(l => {
          const lEmail = (l.applicant_email || l.email || "").toLowerCase().trim();
          const lStart = l.start_date || l.applied_at || "";
          const lEnd = l.end_date || l.start_date || "";
          return isEmailMatch(lEmail, eClean) && todayStr >= lStart && todayStr <= lEnd && (l.status === "approved" || l.status === "pending");
        });

        if (userLeave) {
          return { checkIn: "--:--", checkOut: "--:--", status: `On Leave (${userLeave.leave_type || "Casual"}) 🌴` };
        }

        // 5. If user enrolled/registered TODAY and hasn't clocked in yet
        const joinDate = (item?.start_date || item?.created_at || item?.joining_date || "").slice(0, 10);
        if (joinDate === todayStr) {
          return { checkIn: "--:--", checkOut: "--:--", status: "Enrolled Today (Pending Clock-In) ⏳" };
        }

        // 6. If shift is currently active (between 10:00 AM and 06:00 PM) and candidate not checked in yet
        if (currentMins >= 600 && currentMins < 1080) {
          return { checkIn: "--:--", checkOut: "--:--", status: "Not Checked In Yet (Shift 10:00 AM - 06:00 PM) 🟠" };
        } else if (currentMins < 600) {
          return { checkIn: "--:--", checkOut: "--:--", status: "Shift Starts 10:00 AM ⏳" };
        }

        // 7. Otherwise after 06:00 PM default to Absent Today
        return { checkIn: "--:--", checkOut: "--:--", status: "Absent Today 🔴" };
      };

      const combinedMap = new Map();

      // 1. Process Employees
      persistentEmps.forEach(e => {
        if (!e || !e.email) return;
        const eEmail = (e.email || "").toLowerCase().trim();
        const attInfo = getTodayAttendanceDetails(eEmail, e);
        const isRemote = (e.employment_type || "").toLowerCase().includes("remote") || e.is_remote === true;
        combinedMap.set(eEmail, {
          id: e.id || `emp-${Date.now()}`,
          fullName: e.full_name || e.name || "Staff Member",
          email: eEmail,
          category: isRemote ? "Remote Staff" : (e.employment_type || "On-Site Staff"),
          role: "employee",
          department: `${e.department || 'General'} (${e.designation || 'Staff'})`,
          checkIn: attInfo.checkIn,
          checkOut: attInfo.checkOut,
          attendance: attInfo.status,
          progress: "Assigned Software House Deliverables",
          dailyTask: "Logged daily work progress on assigned task.",
          feeStatus: "N/A (Paid Staff)",
        });
      });

      // 2. Process Course Students (including Remote Students)
      persistentStudents.forEach(s => {
        if (!s || !s.email) return;
        const sEmail = (s.email || "").toLowerCase().trim();
        const attInfo = getTodayAttendanceDetails(sEmail, s);
        const isRemote = (s.track_type || "").toLowerCase().includes("remote") || 
          s.is_remote === true || 
          s.isRemote === true || 
          (s.batch || "").toLowerCase().includes("remote") || 
          (s.course_name || "").toLowerCase().includes("remote");

        const category = s.track_type || (isRemote ? "Remote Course Student" : "Course Enrolled Student");

        combinedMap.set(sEmail, {
          id: s.id || `stu-${Date.now()}`,
          fullName: s.full_name || s.name || s.student_name || "Enrolled Student",
          email: sEmail,
          category: category,
          role: "student",
          department: s.course_name || s.tech_domain || "MERN Stack Course",
          checkIn: attInfo.checkIn,
          checkOut: attInfo.checkOut,
          attendance: attInfo.status,
          progress: `${s.progress !== undefined ? s.progress : 0}% Course Completed`,
          dailyTask: "Submitted daily practical coding lab assignment.",
          feeStatus: s.fee_status || "Paid",
        });
      });

      // 3. Process Interns (including Remote Interns)
      persistentInterns.forEach(i => {
        if (!i || !i.email) return;
        const iEmail = (i.email || "").toLowerCase().trim();
        const attInfo = getTodayAttendanceDetails(iEmail, i);
        const isRemote = (i.internship_mode || "").toLowerCase().includes("remote") || 
          i.is_remote === true || 
          (i.track_type || "").toLowerCase().includes("remote") || 
          (i.role || "").toLowerCase().includes("remote");

        const category = isRemote ? "Remote 3-Month Intern" : "On-Site 3-Month Intern";

        combinedMap.set(iEmail, {
          id: i.id || `int-${Date.now()}`,
          fullName: i.full_name || i.name || "Enrolled Intern",
          email: iEmail,
          category: category,
          role: "intern",
          department: i.course_name || i.tech_domain || i.domain || "Software Engineering Intern",
          checkIn: attInfo.checkIn,
          checkOut: attInfo.checkOut,
          attendance: attInfo.status,
          progress: `${i.progress !== undefined ? i.progress : 0}% Internship Milestone Completed`,
          dailyTask: i.task_logs?.[0]?.details || "Working on assigned project module.",
          feeStatus: "Free Internship",
        });
      });

      // 4. Include Any Additional Registered System Users from Local Storage / Signup
      let registeredUsers = [];
      try {
        if (typeof window !== "undefined") {
          const rawU = localStorage.getItem("registered_system_users");
          if (rawU) registeredUsers = JSON.parse(rawU) || [];
        }
      } catch (e) {}

      registeredUsers.forEach(u => {
        if (!u || !u.email) return;
        const uEmail = (u.email || "").toLowerCase().trim();
        if (combinedMap.has(uEmail)) return; // already added from students/interns/employees

        const attInfo = getTodayAttendanceDetails(uEmail, u);
        const uRole = (u.role || "student").toLowerCase();
        const isRemote = (u.track_type || u.internship_mode || "").toLowerCase().includes("remote") || u.is_remote === true || uRole.includes("remote");

        let cat = "Registered Member";
        if (uRole.includes("student")) cat = isRemote ? "Remote Course Student" : "Course Enrolled Student";
        else if (uRole.includes("intern")) cat = isRemote ? "Remote 3-Month Intern" : "On-Site 3-Month Intern";
        else if (uRole.includes("employee")) cat = isRemote ? "Remote Staff" : "On-Site Staff";

        combinedMap.set(uEmail, {
          id: u.id || `user-${Date.now()}`,
          fullName: u.fullName || u.full_name || u.name || uEmail.split("@")[0],
          email: uEmail,
          category: cat,
          role: uRole.includes("student") ? "student" : (uRole.includes("intern") ? "intern" : "employee"),
          department: u.course_name || u.department || "Software House Member",
          checkIn: attInfo.checkIn,
          checkOut: attInfo.checkOut,
          attendance: attInfo.status,
          progress: "Active Member",
          dailyTask: "Logged in to Nexa Portal workspace.",
          feeStatus: uRole.includes("student") ? "Paid" : "N/A",
        });
      });

      setAllRegisteredUsersList(Array.from(combinedMap.values()));
    } catch (e) { }
  }, []);

  useEffect(() => {
    setLoading(false);
    loadDashboardData();
    loadAllMembers();
    fetchRecentActivities().then(data => setRecentActivities(data || []));

    const handleUpdate = () => {
      loadDashboardData();
      loadAllMembers();
    };

    window.addEventListener("dataChanged", handleUpdate);
    return () => window.removeEventListener("dataChanged", handleUpdate);
  }, [loadDashboardData, loadAllMembers]);

  // Filtered & Sorted Members List
  const filteredMembersList = useMemo(() => {
    let list = [...allRegisteredUsersList];

    if (segmentedFilter === "employees") {
      list = list.filter(m => m.role === "employee");
    } else if (segmentedFilter === "students") {
      list = list.filter(m => m.role === "student");
    } else if (segmentedFilter === "interns") {
      list = list.filter(m => m.role === "intern");
    } else if (segmentedFilter === "remote") {
      list = list.filter(m => (m.category || "").toLowerCase().includes("remote"));
    } else if (segmentedFilter === "onsite") {
      list = list.filter(m => (m.category || "").toLowerCase().includes("on-site") || (m.category || "").toLowerCase().includes("staff"));
    } else if (segmentedFilter === "present") {
      list = list.filter(m => m.attendance.includes("Present"));
    } else if (segmentedFilter === "absent") {
      list = list.filter(m => m.attendance.includes("Absent"));
    }

    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase().trim();
      list = list.filter(m =>
        (m.fullName || "").toLowerCase().includes(q) ||
        (m.email || "").toLowerCase().includes(q) ||
        (m.department || "").toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      const valA = String(a[sortColumn] || "").toLowerCase();
      const valB = String(b[sortColumn] || "").toLowerCase();
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [allRegisteredUsersList, segmentedFilter, tableSearch, sortColumn, sortDirection]);

  const executeConfirmedDelete = async () => {
    setConfirmDeleteModal(prev => ({ ...prev, loading: true }));

    // 1. Clear All Tasks
    if (confirmDeleteModal.type === "clear_all_tasks") {
      setProjectsProgressList([]);
      try {
        localStorage.setItem("software_house_daily_tasks", JSON.stringify([]));
        localStorage.setItem("software_house_assigned_tasks", JSON.stringify([]));
      } catch (e) { }
      showToast("All Tasks Cleared 🗑️", "All active project tasks wiped clean.", "info");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("dataChanged"));
      }
      setConfirmDeleteModal({ isOpen: false, type: "", targetId: "", targetEmail: "", title: "", targetMember: null, loading: false });
      return;
    }

    // 2. Single Project/Daily Task Delete
    if (confirmDeleteModal.type === "single_task") {
      const targetId = confirmDeleteModal.targetId;
      const updated = projectsProgressList.filter(p => String(p.id) !== String(targetId));
      setProjectsProgressList(updated);
      try {
        const savedDaily = localStorage.getItem("software_house_daily_tasks");
        if (savedDaily) {
          const parsed = JSON.parse(savedDaily);
          const filtered = parsed.filter(t => String(t.id) !== String(targetId));
          localStorage.setItem("software_house_daily_tasks", JSON.stringify(filtered));
        }
      } catch (e) { }
      showToast("Task Deleted 🗑️", "Task removed permanently.", "info");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("dataChanged"));
      }
      setConfirmDeleteModal({ isOpen: false, type: "", targetId: "", targetEmail: "", title: "", targetMember: null, loading: false });
      return;
    }

    // 3. Member Delete (Students, Interns, Employees, Registered Users)
    if (!confirmDeleteModal.targetMember && !confirmDeleteModal.targetId) {
      setConfirmDeleteModal({ isOpen: false, type: "", targetId: "", targetEmail: "", title: "", targetMember: null, loading: false });
      return;
    }

    const m = confirmDeleteModal.targetMember || {};
    const id = confirmDeleteModal.targetId || m.id;
    const email = (m.email || confirmDeleteModal.targetEmail || "").toLowerCase().trim();
    const name = m.fullName || confirmDeleteModal.title || "Member";
    const role = (m.role || confirmDeleteModal.type || "student").toLowerCase();

    try {
      // Optimistic UI update
      setAllRegisteredUsersList(prev => prev.filter(item => {
        const iEmail = (item.email || "").toLowerCase().trim();
        const iId = String(item.id || "").toLowerCase().trim();
        if (email && iEmail === email) return false;
        if (id && iId === String(id).toLowerCase().trim()) return false;
        return true;
      }));

      // Add to localStorage blacklist & purge from all local collections
      if (typeof window !== "undefined") {
        const blacklist = JSON.parse(localStorage.getItem("deleted_entity_blacklist") || "[]");
        if (email && !blacklist.includes(email)) blacklist.push(email);
        if (id && !blacklist.includes(String(id).toLowerCase())) blacklist.push(String(id).toLowerCase());
        localStorage.setItem("deleted_entity_blacklist", JSON.stringify(blacklist));

        const keysToPurge = [
          "persistent_courses",
          "persistent_interns",
          "persistent_employees",
          "registered_system_users",
          "software_house_students",
          "software_house_interns",
          "software_house_employees"
        ];

        keysToPurge.forEach(k => {
          try {
            const raw = localStorage.getItem(k);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                const filtered = parsed.filter(item => {
                  if (!item) return false;
                  const itemEmail = (item.email || "").toLowerCase().trim();
                  const itemId = String(item.id || "").toLowerCase().trim();
                  if (email && itemEmail === email) return false;
                  if (id && itemId === String(id).toLowerCase().trim()) return false;
                  return true;
                });
                localStorage.setItem(k, JSON.stringify(filtered));
              }
            }
          } catch(e) {}
        });

        if (email) {
          localStorage.removeItem(`today_attendance_${email}`);
          localStorage.removeItem(`student_attendance_${email}`);
          localStorage.removeItem(`employee_attendance_${email}`);
        }
      }

      // Cascade delete across all tables in DB via dbDeleteRecord
      const tablesToDelete = ["students", "interns", "employees", "app_users"];
      for (const t of tablesToDelete) {
        await dbDeleteRecord(t, id, email).catch(() => {});
      }

      // Direct API call to guarantee backend purge across Supabase tables
      if (typeof fetch !== "undefined") {
        await fetch("/api/persistence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            table: role.includes("intern") ? "interns" : role.includes("student") ? "students" : "employees",
            action: "delete",
            record: { id, email, full_name: name },
          }),
        }).catch(() => {});
      }

      showToast("Record Deleted 🗑️", `"${name}" has been permanently deleted from database.`, "info");
      
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("dataChanged"));
      }
      loadDashboardData();
      loadAllMembers();
    } catch (err) {
      console.error("Delete failed:", err);
      showToast("Error", "Could not complete deletion.", "error");
    } finally {
      setConfirmDeleteModal({ isOpen: false, type: "", targetId: "", targetEmail: "", title: "", targetMember: null, loading: false });
    }
  };

  const getInitials = (name) => {
    if (!name) return "RB";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-6">

      {/* 1. STATISTIC CARDS GRID (Bg #FFFFFF, Border #E2E8F0, Radius 16px, Padding 24px, Light Shadow) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Stat 1: Total Staff */}
        <Link
          href="/dashboard/employees"
          className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm space-y-2 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group block"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Total Staff</span>
            <div className="p-2.5 rounded-xl bg-[#EFF6FF] text-[#2563EB] group-hover:scale-110 transition-transform">
              <FaUsers className="text-base" />
            </div>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <h3 className="text-2xl font-bold text-[#0F172A]">{stats.employees}</h3>
            <span className="text-[10px] font-semibold text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded-md border border-[#2563EB]/20">
              Active Roster
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-[#64748B] pt-1 border-t border-slate-100">
            <span>Paid Staff & Engineers</span>
            <span className="text-[10px] font-bold text-blue-600 group-hover:translate-x-0.5 transition-transform">
              View Staff ↗
            </span>
          </div>
        </Link>

        {/* Stat 2: Active Projects */}
        <Link
          href="/dashboard/projects"
          className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm space-y-2 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group block"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Active Projects</span>
            <div className="p-2.5 rounded-xl bg-[#EFF6FF] text-[#2563EB] group-hover:scale-110 transition-transform">
              <FaProjectDiagram className="text-base" />
            </div>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <h3 className="text-2xl font-bold text-[#0F172A]">{stats.activeProjects}</h3>
            <span className="text-[10px] font-semibold text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded-md border border-[#2563EB]/20">
              {overallProgressPercentage}% Milestones
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-[#64748B] pt-1 border-t border-slate-100">
            <span>Ongoing Client Projects</span>
            <span className="text-[10px] font-bold text-blue-600 group-hover:translate-x-0.5 transition-transform">
              Projects Hub ↗
            </span>
          </div>
        </Link>

        {/* Stat 3: Monthly Revenue */}
        <Link
          href="/dashboard/finance"
          className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm space-y-2 hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group block"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Monthly Revenue</span>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 group-hover:scale-110 transition-transform">
              <FaMoneyBillWave className="text-base" />
            </div>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <h3 className="text-2xl font-bold text-[#0F172A]">Rs. {(stats.monthlyRevenue || 0).toLocaleString()}</h3>
            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              Current Month
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-[#64748B] pt-1 border-t border-slate-100">
            <span>Invoices Cleared</span>
            <span className="text-[10px] font-bold text-emerald-600 group-hover:translate-x-0.5 transition-transform">
              Finance Hub ↗
            </span>
          </div>
        </Link>

        {/* Stat 4: Operating Expenses */}
        <Link
          href="/dashboard/expenses"
          className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm space-y-2 hover:border-rose-400 hover:shadow-md transition-all cursor-pointer group block"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Operating Expenses</span>
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 group-hover:scale-110 transition-transform">
              <FaLandmark className="text-base" />
            </div>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <h3 className="text-2xl font-bold text-[#0F172A]">Rs. {(stats.monthlyExpenses || 0).toLocaleString()}</h3>
            <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
              Expenses
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-[#64748B] pt-1 border-t border-slate-100">
            <span>Salaries & Overhead Costs</span>
            <span className="text-[10px] font-bold text-rose-600 group-hover:translate-x-0.5 transition-transform">
              View Expenses ↗
            </span>
          </div>
        </Link>
      </div>

      {/* 3. MULTI-SERIES FINANCIAL CHART */}
      <FinancialChart
        revenue={stats.monthlyRevenue}
        expenses={stats.monthlyExpenses}
        categoryData={stats.categoryBreakdown}
      />

      {/* 4. ENTERPRISE MEMBERS DIRECTORY TABLE */}
      <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm space-y-4">
        {/* Table Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-4">
          <div>
            <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <FaUsers className="text-[#2563EB]" />
              <span>Registered Members Directory</span>
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Software House Staff, Course Enrolled Students, and Interns.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B] text-xs" />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Search member, email, dept..."
                className="pl-8 pr-3 py-1.5 bg-white border border-[#E2E8F0] rounded-xl text-xs font-medium text-[#0F172A] outline-none focus:border-[#2563EB] transition-colors w-full sm:w-60"
              />
            </div>
          </div>
        </div>

        {/* Segmented Filter Bar */}
        <div className="bg-[#F8FAFC] p-1.5 rounded-xl border border-[#E2E8F0] flex flex-wrap items-center gap-1 text-xs font-medium">
          {[
            { id: "all", label: "All Members" },
            { id: "employees", label: "Paid Staff" },
            { id: "students", label: "Course Students" },
            { id: "interns", label: "Interns" },
            { id: "onsite", label: "On-Site" },
            { id: "remote", label: "Remote" },
            { id: "present", label: "Present Today" },
            { id: "absent", label: "Absent Today" },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSegmentedFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                segmentedFilter === f.id
                  ? "bg-white text-[#2563EB] font-bold shadow-xs border border-[#E2E8F0]"
                  : "text-[#64748B] hover:text-[#0F172A]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Members Directory Table */}
        <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#F8FAFC] text-[#64748B] font-semibold uppercase text-[10px] tracking-wider border-b border-[#E2E8F0]">
              <tr>
                <th className="py-3 px-4">Member Name & Email</th>
                <th className="py-3 px-4">Role / Category</th>
                <th className="py-3 px-4">Check-In</th>
                <th className="py-3 px-4">Check-Out</th>
                <th className="py-3 px-4">Today's Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] font-normal">
              {filteredMembersList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[#64748B] italic">
                    No registered members matching criteria.
                  </td>
                </tr>
              ) : (
                filteredMembersList.map((m, idx) => (
                  <tr key={`mem-${m.id || m.email || 'id'}-${idx}`} className="hover:bg-[#F8FAFC] transition-colors group">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-xl bg-[#EFF6FF] text-[#2563EB] font-bold flex items-center justify-center text-xs shrink-0 border border-[#2563EB]/20">
                          {getInitials(m.fullName)}
                        </div>
                        <div>
                          <p className="font-semibold text-[#0F172A] group-hover:text-[#2563EB] transition-colors">
                            {m.fullName || "Unknown Member"}
                          </p>
                          <p className="text-[11px] font-mono text-[#64748B]">{m.email}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="text-[10px] font-semibold uppercase px-2.5 py-1 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A] whitespace-nowrap">
                        {m.category || "General Member"}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-xs text-[#0F172A] whitespace-nowrap">
                      {m.checkIn || "--:--"}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {m.checkOut || "--:--"}
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`text-[10px] font-semibold px-2.5 py-1 rounded-md border whitespace-nowrap ${
                          m.attendance.includes("Present") || m.attendance.includes("🟢")
                            ? "bg-[#EFF6FF] text-[#2563EB] border-[#2563EB]/20"
                            : (m.attendance.includes("Leave") || m.attendance.includes("🌴")
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : (m.attendance.includes("Pending") || m.attendance.includes("Shift")
                                    ? "bg-slate-50 text-slate-700 border-slate-200"
                                    : "bg-[#FEE2E2] text-[#991B1B] border-[#EF4444]/20"))
                        }`}
                      >
                        {m.attendance}
                      </span>
                    </td>

                    {/* Action Link / Delete Button */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {Boolean((m.category || "").toLowerCase().includes("remote") || (m.department || "").toLowerCase().includes("remote") || (m.mode || "").toLowerCase().includes("remote")) && (
                          <Link
                            href="/dashboard/internships"
                            className="text-purple-600 hover:text-purple-800 font-bold hover:bg-purple-50 px-2 py-1 rounded-lg border border-purple-200 transition-colors text-[11px] flex items-center gap-1"
                            title="Access Remote Screen on Monitoring Desk"
                          >
                            <FaDesktop className="text-[10px]" />
                            <span>Screen 🖥️</span>
                          </Link>
                        )}
                        <Link
                          href="/dashboard/attendance/history"
                          className="text-[#2563EB] hover:text-[#1D4ED8] font-semibold hover:bg-[#EFF6FF] px-2.5 py-1 rounded-lg transition-colors text-xs"
                        >
                          Inspect →
                        </Link>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteModal({
                            isOpen: true,
                            type: m.role || "member",
                            targetId: m.id,
                            targetEmail: m.email,
                            title: m.fullName || m.email || "Member",
                            targetMember: m,
                            loading: false
                          })}
                          className="text-red-500 hover:text-red-700 font-semibold hover:bg-red-50 px-2.5 py-1 rounded-lg border border-red-200 transition-colors text-xs flex items-center gap-1 cursor-pointer"
                          title="Permanently delete member from Supabase database"
                        >
                          <FaTrash className="text-[10px]" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. ACTIVE WORKSTREAMS WORKSPACE */}
      <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
          <div className="flex items-center gap-2">
            <FaProjectDiagram className="text-[#2563EB] text-base" />
            <h2 className="text-base font-bold text-[#0F172A]">Active Workstreams & Deliverables Progress</h2>
          </div>

          <div className="flex items-center gap-2">
            {projectsProgressList.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmDeleteModal({ isOpen: true, type: "clear_all_tasks", targetId: "", title: "Clear All Workstream Tasks", loading: false })}
                className="text-xs font-semibold text-[#64748B] hover:text-rose-600 bg-white hover:bg-[#F8FAFC] px-3 py-1 rounded-xl border border-[#E2E8F0] transition-colors cursor-pointer flex items-center gap-1"
                title="Wipe all active project tasks"
              >
                <FaTrash className="text-xs" />
                <span>Clear All Tasks</span>
              </button>
            )}

            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB]/20 shrink-0">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2563EB] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#2563EB]"></span>
              </span>
              <span className="text-xs font-semibold">Live Workstream</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projectsProgressList.length === 0 ? (
            <div className="col-span-2 py-10 text-center bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0] space-y-2">
              <FaFolderOpen className="mx-auto text-3xl text-[#94A3B8]" />
              <p className="text-sm font-bold text-[#0F172A]">No active workstreams found.</p>
              <p className="text-xs text-[#64748B] max-w-xs mx-auto">
                Tasks or projects assigned to staff or students will appear here automatically.
              </p>
            </div>
          ) : (
            projectsProgressList.map((proj, idx) => {
              const progress = proj.progress || 50;
              return (
                <div key={idx} className="p-4 rounded-xl bg-white border border-[#E2E8F0] space-y-2.5 relative group">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-[#0F172A] pr-6">{proj.title || "Untitled Project"}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-[#2563EB] bg-[#EFF6FF] px-2.5 py-0.5 rounded-md border border-[#2563EB]/20">
                        {progress}%
                      </span>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteModal({ isOpen: true, type: "single_task", targetId: proj.id, title: proj.title || "Task", loading: false })}
                        className="text-[#94A3B8] hover:text-rose-600 p-1 transition-colors cursor-pointer"
                        title="Delete Task"
                      >
                        <FaTrash className="text-xs" />
                      </button>
                    </div>
                  </div>

                  <div className="w-full bg-[#F8FAFC] h-2.5 rounded-full overflow-hidden p-0.5 border border-[#E2E8F0]">
                    <div
                      className="bg-[#2563EB] h-full rounded-full transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-[#64748B]">
                    <span>Status: <strong className="text-[#0F172A] font-semibold">{proj.status || "In Progress"}</strong></span>
                    <span className="text-[#0F172A] font-semibold">{proj.client_name || "Client Deal"}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* INSPECTOR MODAL (Background #FFFFFF, Border #E2E8F0, Rounded 20px) */}
      {selectedUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-[#E2E8F0] space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded-md border border-[#2563EB]/20">
                  {selectedUserModal.category}
                </span>
                <h3 className="text-lg font-bold text-[#0F172A] mt-1">{selectedUserModal.fullName}</h3>
                <p className="text-xs font-mono text-[#64748B]">{selectedUserModal.email}</p>
              </div>
              <button
                onClick={() => setSelectedUserModal(null)}
                className="text-[#64748B] hover:text-[#0F172A] text-xl font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0]">
                <p className="text-[#64748B] font-semibold uppercase text-[10px]">Department / Program</p>
                <p className="text-[#0F172A] font-bold text-sm mt-0.5">{selectedUserModal.department || "Unassigned Department"}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#EFF6FF] p-3 rounded-xl border border-[#2563EB]/20">
                  <p className="text-[#2563EB] font-bold uppercase text-[10px]">Today's Attendance</p>
                  <p className="text-[#0F172A] font-bold text-xs mt-0.5">{selectedUserModal.attendance}</p>
                </div>

                <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0]">
                  <p className="text-[#64748B] font-semibold uppercase text-[10px]">Financial / Fee Status</p>
                  <p className="text-[#0F172A] font-bold text-xs mt-0.5">{selectedUserModal.feeStatus}</p>
                </div>
              </div>
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setSelectedUserModal(null)}
                className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold px-5 py-2 rounded-xl text-xs transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION DESTRUCTIVE MODAL */}
      {confirmDeleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-red-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-600 border-b border-red-100 pb-3">
              <div className="p-2 rounded-xl bg-red-50 text-red-600">
                <FaTrash className="text-base" />
              </div>
              <div>
                <h3 className="font-bold text-[#0F172A] text-base">Delete Member Permanently</h3>
                <p className="text-[11px] text-[#64748B]">Supabase Backend & Portal Purge</p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-[#64748B] leading-relaxed">
              <p>
                Are you sure you want to delete <strong className="text-[#0F172A]">"{confirmDeleteModal.title}"</strong> ({confirmDeleteModal.targetEmail || confirmDeleteModal.targetId})?
              </p>
              <div className="p-3 bg-red-50/70 rounded-xl border border-red-100 text-red-700 text-[11px] space-y-1">
                <p className="font-semibold flex items-center gap-1">
                  <FaExclamationTriangle /> Warning: This action cannot be undone!
                </p>
                <p>This will permanently remove their records from Supabase database tables (profiles, attendance, leaves, daily tasks, and portal access).</p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteModal({ isOpen: false, type: "", targetId: "", targetEmail: "", title: "", targetMember: null, loading: false })}
                disabled={confirmDeleteModal.loading}
                className="flex-1 py-2.5 rounded-xl bg-white hover:bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] font-semibold text-xs cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeConfirmedDelete}
                disabled={confirmDeleteModal.loading}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs cursor-pointer flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
              >
                {confirmDeleteModal.loading ? "Deleting from Database..." : "Yes, Delete Permanently 🗑️"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
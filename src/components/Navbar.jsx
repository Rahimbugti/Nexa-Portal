"use client";

import { useEffect, useState, useRef } from "react";
import { logout } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { dbSaveRecord, dbFetch } from "@/lib/dbPersistence";
import Modal from "@/components/Modal";
import { showToast } from "@/components/Toast";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  FaBars,
  FaSignOutAlt,
  FaUserTie,
  FaUser,
  FaBell,
  FaCheck,
  FaTimes,
  FaCalendarPlus,
  FaExclamationTriangle,
  FaMoneyBillWave,
  FaGift,
  FaTasks,
  FaVideo,
  FaProjectDiagram,
  FaCheckCircle,
  FaBullhorn,
  FaSearch,
  FaGraduationCap,
  FaUsers,
  FaLandmark,
  FaFilter,
  FaFileInvoiceDollar,
  FaCalendarAlt,
  FaClock,
  FaFileAlt,
  FaTimesCircle,
  FaShieldAlt,
  FaInfoCircle,
  FaUserGraduate,
  FaSun,
  FaMoon
} from "react-icons/fa";

export default function Navbar({ onMenuClick, isSidebarOpen = true }) {
  const router = useRouter();
  const pathname = usePathname();
  const [role, setRole] = useState("admin");
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [userAvatarUrl, setUserAvatarUrl] = useState("");
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [modalAvatarUrlInput, setModalAvatarUrlInput] = useState("");

  const handleSaveAvatar = (newPicUrl) => {
    if (!newPicUrl) return;
    const eClean = (userEmail || localStorage.getItem("current_user_email") || "").toLowerCase().trim();
    if (eClean) {
      localStorage.setItem(`user_avatar_${eClean}`, newPicUrl);
      setUserAvatarUrl(newPicUrl);
    }
    localStorage.removeItem("current_user_avatar");
    localStorage.removeItem("user_profile_avatar");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("avatarChanged"));
    }
    setIsAvatarModalOpen(false);
    showToast("Profile Photo Updated 🖼️", "Your profile picture has been updated for your account.", "success");
  };

  const handleAvatarFileUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result) {
          handleSaveAvatar(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };
  
  // Header Date
  const [currentDateStr, setCurrentDateStr] = useState("");

  // Global Search Modal State (Ctrl + K)
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const searchInputRef = useRef(null);

  // Admin Notifications Lists
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [pendingComplaints, setPendingComplaints] = useState([]);
  const [pendingTaskAlerts, setPendingTaskAlerts] = useState([]);

  // Detail Modals for Bell Notifications
  const [selectedLeaveModal, setSelectedLeaveModal] = useState(null);
  const [selectedComplaintModal, setSelectedComplaintModal] = useState(null);

  // Student & Employee Notifications List
  const [userAlerts, setUserAlerts] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [hasSeenNotifications, setHasSeenNotifications] = useState(false);
  const [dismissedNotifIds, setDismissedNotifIds] = useState([]);
  const [activeNotifCategory, setActiveNotifCategory] = useState("all");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const notifCloseTimerRef = useRef(null);

  // Smart Auto-Hiding Navbar on Scroll (Hide on Down, Show on Up)
  const [isNavVisible, setIsNavVisible] = useState(true);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY || document.documentElement.scrollTop || 0;
          
          // Always visible near the top
          if (currentScrollY <= 40) {
            setIsNavVisible(true);
          } else if (currentScrollY > lastScrollYRef.current + 6) {
            // Scrolling DOWN -> Hide navbar smoothly
            setIsNavVisible(false);
            setShowNotifications(false);
          } else if (currentScrollY < lastScrollYRef.current - 6) {
            // Scrolling UP -> Reveal navbar smoothly
            setIsNavVisible(true);
          }

          lastScrollYRef.current = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("nexa_theme");
      if (savedTheme === "dark") {
        setIsDarkMode(true);
        document.documentElement.classList.add("dark");
      } else {
        setIsDarkMode(false);
        document.documentElement.classList.remove("dark");
      }
    }
  }, []);

  const toggleDarkMode = () => {
    const nextTheme = !isDarkMode;
    setIsDarkMode(nextTheme);
    if (nextTheme) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("nexa_theme", "dark");
      showToast("Dark Mode Active 🌙", "Sleek Dark Theme enabled across Nexa Portal.", "info");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("nexa_theme", "light");
      showToast("Light Mode Active ☀️", "Clean Light Theme enabled across Nexa Portal.", "info");
    }
  };

  const handleMouseEnterNotif = () => {
    if (notifCloseTimerRef.current) {
      clearTimeout(notifCloseTimerRef.current);
      notifCloseTimerRef.current = null;
    }
  };

  const handleMouseLeaveNotif = () => {
    if (showNotifications) {
      if (notifCloseTimerRef.current) clearTimeout(notifCloseTimerRef.current);
      notifCloseTimerRef.current = setTimeout(() => {
        setShowNotifications(false);
      }, 1000); // 1-second auto-close when mouse leaves
    }
  };

  const notifRef = useRef(null);

  // Close Notification Center on Click Outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    if (showNotifications) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showNotifications]);

  useEffect(() => {
    const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
    setCurrentDateStr(new Date().toLocaleDateString('en-US', options));
  }, []);

  // Keyboard shortcut (Ctrl + K or Cmd + K) for Global Search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const searchCloseTimerRef = useRef(null);

  const handleMouseEnterSearch = () => {
    if (searchCloseTimerRef.current) {
      clearTimeout(searchCloseTimerRef.current);
      searchCloseTimerRef.current = null;
    }
  };

  const handleMouseLeaveSearch = () => {
    if (isSearchOpen) {
      if (searchCloseTimerRef.current) clearTimeout(searchCloseTimerRef.current);
      searchCloseTimerRef.current = setTimeout(() => {
        setIsSearchOpen(false);
      }, 600); // 600ms smooth auto-close when cursor leaves search box
    }
  };

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isSearchOpen]);

  // Global Search logic (Searches Projects, Employees, Interns, Students, Tasks & Navigation)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const q = searchQuery.toLowerCase().trim();
    const results = [];

    try {
      // 1. SEARCH PROJECTS & SOFTWARE HOUSE DELIVERABLES
      const rawProjs = JSON.parse(localStorage.getItem("persistent_projects") || "[]");
      rawProjs.forEach(p => {
        if (!p) return;
        const title = (p.title || p.project_name || p.name || "").toLowerCase();
        const client = (p.client_name || p.client || "").toLowerCase();
        const tech = (p.tech_stack || p.technology || p.domain || "").toLowerCase();
        const status = (p.status || "").toLowerCase();
        if (title.includes(q) || client.includes(q) || tech.includes(q) || status.includes(q) || "projects".includes(q)) {
          results.push({
            id: `proj-${p.id || p.title}`,
            title: p.title || p.project_name || "Client Project",
            subtitle: `${p.tech_stack || "Full Stack"} • ${p.client_name || "In-House"} • ${p.status || "In Progress"}`,
            category: "Projects",
            icon: FaProjectDiagram,
            link: "/dashboard/projects"
          });
        }
      });

      // 2. SEARCH EMPLOYEES & STAFF
      const emps = JSON.parse(localStorage.getItem("persistent_employees") || "[]");
      emps.forEach(e => {
        if (!e) return;
        const name = (e.full_name || e.name || "").toLowerCase();
        const email = (e.email || "").toLowerCase();
        const dept = (e.department || "").toLowerCase();
        const desig = (e.designation || e.role || "").toLowerCase();
        if (name.includes(q) || email.includes(q) || dept.includes(q) || desig.includes(q) || "employees".includes(q)) {
          results.push({
            id: `emp-${e.id || e.email}`,
            title: e.full_name || "Employee",
            subtitle: `${e.department || "Engineering"} • ${e.designation || "Team Member"} • ${e.email}`,
            category: "Employees",
            icon: FaUsers,
            link: "/dashboard/employees"
          });
        }
      });

      // 3. SEARCH INTERNS & TRAINEES
      const internsList = JSON.parse(localStorage.getItem("persistent_interns") || localStorage.getItem("interns") || "[]");
      internsList.forEach(it => {
        if (!it) return;
        const name = (it.full_name || it.name || "").toLowerCase();
        const email = (it.email || "").toLowerCase();
        const domain = (it.course_name || it.domain || "").toLowerCase();
        const mode = (it.internship_mode || "").toLowerCase();
        if (name.includes(q) || email.includes(q) || domain.includes(q) || mode.includes(q) || "interns".includes(q) || "internship".includes(q)) {
          results.push({
            id: `intern-${it.id || it.email}`,
            title: it.full_name || "Intern",
            subtitle: `${it.course_name || "Practical Internship"} • ${it.internship_mode || "On-Site"} • ${it.email}`,
            category: "Interns",
            icon: FaUserGraduate,
            link: "/dashboard/internships"
          });
        }
      });

      // 4. SEARCH STUDENTS & COURSE ENROLLMENTS
      const stus = JSON.parse(localStorage.getItem("persistent_courses") || localStorage.getItem("persistent_students") || "[]");
      stus.forEach(s => {
        if (!s) return;
        const name = (s.full_name || s.name || "").toLowerCase();
        const email = (s.email || "").toLowerCase();
        const course = (s.course_name || s.course || "").toLowerCase();
        if (name.includes(q) || email.includes(q) || course.includes(q) || "students".includes(q)) {
          results.push({
            id: `stu-${s.id || s.email}`,
            title: s.full_name || "Student",
            subtitle: `${s.course_name || "Tech Student"} • Roll: ${s.enrollment_no || s.id || "Enrolled"}`,
            category: "Students",
            icon: FaGraduationCap,
            link: "/dashboard/student"
          });
        }
      });

      // 5. SEARCH TASKS & DELIVERABLES
      const tasks = JSON.parse(localStorage.getItem("software_house_assigned_tasks") || localStorage.getItem("daily_tasks") || "[]");
      tasks.forEach(t => {
        if (!t) return;
        const title = (t.title || t.task || "").toLowerCase();
        const assignee = (t.assignedToName || t.assignedToEmail || t.assignee || "").toLowerCase();
        if (title.includes(q) || assignee.includes(q) || "tasks".includes(q)) {
          results.push({
            id: `task-${t.id || t.title}`,
            title: t.title || t.task || "Assigned Task",
            subtitle: `Assigned: ${t.assignedToName || t.assignee || "Team"} • Status: ${t.status || "Active"}`,
            category: "Tasks",
            icon: FaTasks,
            link: "/dashboard/projects"
          });
        }
      });

      // 6. QUICK NAVIGATION SYSTEM ROUTES
      const routes = [
        { name: "Projects & Tasks Hub", desc: "Software house client deliverables and sprint tasks", path: "/dashboard/projects", keys: "project projects task tasks sprint client work" },
        { name: "Internship Practical Program", desc: "Manage 3-month on-site and remote interns", path: "/dashboard/internships", keys: "intern interns internship remote onsite training" },
        { name: "Student Learning Portal (LMS)", desc: "Student curriculum, testing suite, and daily work", path: "/dashboard/student", keys: "student students course lms exam lecture learn" },
        { name: "Employee Directory & HR", desc: "Staff profiles, salaries, shifts, and credentials", path: "/dashboard/employees", keys: "employee employees staff hr team member profile salary" },
        { name: "Attendance & Biometric Desk", desc: "Daily check-in, check-out, and attendance ledger", path: "/dashboard/attendance", keys: "attendance check in out time desk clock biometric" },
        { name: "Leave Approvals & Requests", desc: "Student and employee leave management", path: "/dashboard/leaves", keys: "leave leaves chutti holiday sick casual vacation" },
        { name: "Accounts & Financial Ledger", desc: "Revenue, expenses, fee cycles, and balance sheet", path: "/dashboard/accounts", keys: "account accounts finance fee invoice billing money ledger" },
        { name: "System Settings & Roles", desc: "Portal settings, notifications, and security", path: "/dashboard/settings", keys: "setting settings config admin access password security" }
      ];

      routes.forEach(r => {
        if (r.name.toLowerCase().includes(q) || r.keys.includes(q)) {
          results.push({
            id: `route-${r.path}`,
            title: r.name,
            subtitle: r.desc,
            category: "Navigation",
            icon: FaSearch,
            link: r.path
          });
        }
      });
    } catch(e) {}

    // Remove duplicate items by id and limit to 10 top results
    const uniqueMap = new Map();
    results.forEach(item => {
      if (!uniqueMap.has(item.id)) uniqueMap.set(item.id, item);
    });

    setSearchResults(Array.from(uniqueMap.values()).slice(0, 10));
  }, [searchQuery]);

  useEffect(() => {
    try {
      const email = localStorage.getItem("current_user_email") || "";
      const saved = localStorage.getItem(`dismissed_notifs_${email}`);
      if (saved) setDismissedNotifIds(JSON.parse(saved));
    } catch(e) {}
  }, [userEmail]);

  const handleDismissNotification = (itemId) => {
    if (!itemId) return;
    setDismissedNotifIds((prev) => {
      const updated = [...prev, itemId];
      try {
        const email = localStorage.getItem("current_user_email") || "admin";
        localStorage.setItem(`dismissed_notifs_${email}`, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const loadAllNotifications = async () => {
    try {
      const savedLeaves = localStorage.getItem("software_house_leaves");
      if (savedLeaves) {
        const list = JSON.parse(savedLeaves);
        if (Array.isArray(list)) {
          setPendingLeaves(list.filter(l => (l.status || "").toLowerCase() === "pending"));
        }
      }
    } catch(e) {}

    try {
      const savedComplaints = localStorage.getItem("software_house_complaints_list");
      if (savedComplaints) {
        const cList = JSON.parse(savedComplaints);
        setPendingComplaints(cList.filter(c => (c.status || "").toLowerCase() === "pending"));
      } else {
        setPendingComplaints([]);
      }
    } catch(e) {}

    // Async live Supabase DB fetch
    try {
      const dbLeaves = await dbFetch("leaves", []);
      if (Array.isArray(dbLeaves)) {
        const pending = dbLeaves.filter(l => (l.status || "").toLowerCase() === "pending");
        setPendingLeaves(pending);
      }
    } catch (e) {}

    // Fetch Task Notifications (Missed tasks & Submissions)
    try {
      const { data: taskNotifs } = await supabase
        .from("task_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (Array.isArray(taskNotifs)) {
        setPendingTaskAlerts(taskNotifs.filter(t => !t.is_read));
      }
    } catch (e) {}
  };

  const handleApproveLeave = async (leaveId) => {
    try {
      const savedLeaves = JSON.parse(localStorage.getItem("software_house_leaves") || "[]");
      const target = savedLeaves.find(l => l.id === leaveId);
      const updated = savedLeaves.map(l => l.id === leaveId ? { ...l, status: "approved", salary_cut: false } : l);
      localStorage.setItem("software_house_leaves", JSON.stringify(updated));
      
      if (target) {
        await dbSaveRecord("leaves", { ...target, status: "approved", salary_cut: false }).catch(() => {});

        // Auto-mark attendance as On Leave (Approved) instead of Absent
        const applicantName = target.employee_name || target.applicant_name || "Applicant";
        const todayStr = new Date().toISOString().split("T")[0];
        const leaveDate = target.start_date || todayStr;
        const leaveAttRecord = {
          id: `att-leave-${Date.now()}`,
          user_id: applicantName,
          user_name: applicantName,
          user_role: target.role || "student",
          attendance_status: "On Leave (Approved)",
          type: "check_in",
          total_work_hours: "Leave Authorized",
          attendance_date: leaveDate,
          check_in_time: "Leave Approved",
          public_ip: "Leave / Off-Site",
          created_at: new Date().toISOString()
        };

        const savedAttLogs = JSON.parse(localStorage.getItem("software_house_master_attendance_logs") || "[]");
        const filteredLogs = savedAttLogs.filter(a => !(a.user_name === applicantName && a.attendance_date === leaveDate));
        const newAttLogs = [leaveAttRecord, ...filteredLogs];
        localStorage.setItem("software_house_master_attendance_logs", JSON.stringify(newAttLogs));

        const userEmailKey = (target.applicant_email || target.email || "").trim().toLowerCase();
        if (userEmailKey) {
          localStorage.setItem(`today_attendance_${userEmailKey}`, JSON.stringify([leaveAttRecord]));
        }

        await dbSaveRecord("attendance", leaveAttRecord).catch(() => {});
      }
      
      setPendingLeaves(updated.filter(l => (l.status || "").toLowerCase() === "pending"));
      setSelectedLeaveModal(null);
      showToast("Leave Approved 🟢", `Leave approved! Attendance marked as 'On Leave' (Not Absent).`, "success");
      window.dispatchEvent(new Event("storage"));
    } catch (e) {
      showToast("Error ⚠️", "Failed to update leave status.", "error");
    }
  };

  const handleRejectLeave = async (leaveId) => {
    try {
      const savedLeaves = JSON.parse(localStorage.getItem("software_house_leaves") || "[]");
      const target = savedLeaves.find(l => l.id === leaveId);
      const updated = savedLeaves.map(l => l.id === leaveId ? { ...l, status: "rejected", salary_cut: true } : l);
      localStorage.setItem("software_house_leaves", JSON.stringify(updated));
      
      if (target) {
        await dbSaveRecord("leaves", { ...target, status: "rejected", salary_cut: true }).catch(() => {});
      }
      
      setPendingLeaves(updated.filter(l => (l.status || "").toLowerCase() === "pending"));
      setSelectedLeaveModal(null);
      showToast("Leave Rejected 🔴", `Leave application rejected.`, "info");
      window.dispatchEvent(new Event("storage"));
    } catch (e) {
      showToast("Error ⚠️", "Failed to update leave status.", "error");
    }
  };

  useEffect(() => {
    const currentRole = localStorage.getItem("user_role") || "admin";
    const email = localStorage.getItem("current_user_email") || "";
    setRole(currentRole);
    setUserEmail(email);
    loadAllNotifications();

    const handleRoleChange = () => {
      setRole(localStorage.getItem("user_role") || "admin");
      setUserEmail(localStorage.getItem("current_user_email") || "");
      loadAllNotifications();
    };

    window.addEventListener("roleChanged", handleRoleChange);
    window.addEventListener("leaveSubmitted", loadAllNotifications);
    window.addEventListener("dataChanged", loadAllNotifications);
    return () => {
      window.removeEventListener("roleChanged", handleRoleChange);
      window.removeEventListener("leaveSubmitted", loadAllNotifications);
      window.removeEventListener("dataChanged", loadAllNotifications);
    };
  }, []);

  // Resolve the signed-in user's display name from Supabase/API data.
  useEffect(() => {
    let isMounted = true;

    const loadUserProfile = async () => {
      const storedEmail = (localStorage.getItem("current_user_email") || "").trim().toLowerCase();
      let resolvedEmail = storedEmail;
      let resolvedName = "";

      // 1. Pehle localStorage mein stored name check karo (login ke waqt save hota hai)
      resolvedName = (localStorage.getItem("current_user_name") || "").trim();

      // 2. Agar nahi mila to employees/students/interns local data mein dhundho
      if (!resolvedName && resolvedEmail) {
        try {
          const emps = JSON.parse(localStorage.getItem("persistent_employees") || "[]");
          const matched = emps.find(e => (e.email || "").toLowerCase().trim() === resolvedEmail);
          if (matched) resolvedName = matched.full_name || matched.name || "";
        } catch (e) {}
      }

      if (!resolvedName && resolvedEmail) {
        try {
          const stus = JSON.parse(localStorage.getItem("persistent_courses") || "[]");
          const matched = stus.find(s => (s.email || "").toLowerCase().trim() === resolvedEmail);
          if (matched) resolvedName = matched.full_name || matched.name || "";
        } catch (e) {}
      }

      if (!resolvedName && resolvedEmail) {
        try {
          const ints = JSON.parse(localStorage.getItem("persistent_interns") || "[]");
          const matched = ints.find(i => (i.email || "").toLowerCase().trim() === resolvedEmail);
          if (matched) resolvedName = matched.full_name || matched.name || "";
        } catch (e) {}
      }

      // 3. Supabase auth metadata check karo
      if (!resolvedName) {
        try {
          const { data } = await supabase.auth.getUser();
          const authUser = data?.user;
          if (authUser?.email) resolvedEmail = authUser.email.trim().toLowerCase();
          resolvedName = authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || "";
        } catch (e) {}
      }

      // 4. Last resort — email se name banana
      if (!resolvedName && resolvedEmail) {
        resolvedName = resolvedEmail.split("@")[0].replace(/[._-]+/g, " ");
      }

      const eClean = resolvedEmail.toLowerCase().trim();
      const customAvatar = eClean ? (localStorage.getItem(`user_avatar_${eClean}`) || "") : "";

      if (isMounted) {
        setUserEmail(resolvedEmail);
        setUserName(resolvedName);
        setUserAvatarUrl(customAvatar);
      }
    };

    loadUserProfile();
    window.addEventListener("roleChanged", loadUserProfile);
    window.addEventListener("avatarChanged", loadUserProfile);

    return () => {
      isMounted = false;
      window.removeEventListener("roleChanged", loadUserProfile);
      window.removeEventListener("avatarChanged", loadUserProfile);
    };
  }, []);

  const handleToggleNotifications = () => {
    setShowNotifications(!showNotifications);
  };

  const activeComplaints = pendingComplaints.filter(c => !dismissedNotifIds.includes(c.id));
  const activeLeaves = pendingLeaves.filter(l => !dismissedNotifIds.includes(l.id));
  const activeTaskAlerts = pendingTaskAlerts.filter(t => !dismissedNotifIds.includes(t.id));
  const totalAdminCount = activeComplaints.length + activeLeaves.length + activeTaskAlerts.length;
  const isAdminRole = role === "admin" || role === "hr" || role === "manager" || role === "accounts";

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const getBreadcrumbTitle = () => {
    if (pathname === "/dashboard") return "Overview Dashboard";
    const segment = pathname.split("/").pop();
    if (!segment) return "Dashboard";
    return segment.charAt(0).toUpperCase() + segment.slice(1).replace("-", " ");
  };

  const getUserInitials = (name, email) => {
    const source = name || email.split("@")[0] || "User";
    const nameParts = source.trim().split(/\s+/);
    if (nameParts.length >= 2) return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
    const fallbackName = source;
    const parts = fallbackName.split(/[\._-]/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return fallbackName.slice(0, 2).toUpperCase();
  };

  return (
    <header className={`sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#E2E8F0] bg-white/95 backdrop-blur-md px-6 transition-all duration-300 ease-in-out ${
      isNavVisible ? "translate-y-0 opacity-100 shadow-xs" : "-translate-y-full opacity-0 pointer-events-none shadow-none"
    }`}>
      {/* Left: Hamburger & Breadcrumb */}
      <div className="flex items-center gap-4">
        {isAdminRole && (
          <button
            onClick={onMenuClick}
            className="rounded-xl p-2 text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] transition-colors border border-[#E2E8F0] cursor-pointer flex items-center justify-center"
            aria-label="Toggle Sidebar"
          >
            <FaBars className="text-sm text-[#2563EB]" />
          </button>
        )}

        <div className="hidden sm:block">
          <div className="flex items-center gap-2 text-xs font-medium text-[#64748B]">
            <span>Nexa Portal</span>
            <span>/</span>
            <span className="text-[#2563EB] font-semibold">{getBreadcrumbTitle()}</span>
          </div>
          <h1 className="text-sm font-bold text-[#0F172A] leading-tight">
            Software House Management
          </h1>
        </div>

        {isAdminRole && pathname !== "/dashboard" && (
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white border border-blue-200 text-xs font-bold transition-all shadow-xs"
            title="Return to Main Admin Dashboard"
          >
            <span>← Back to Admin</span>
          </Link>
        )}
      </div>

      {/* Center: Global Search Bar (Ctrl + K) */}
      <div className="flex-1 max-w-md mx-6 hidden md:block">
        <button
          type="button"
          onClick={() => setIsSearchOpen(true)}
          className="w-full flex items-center justify-between bg-[#F8FAFC] hover:bg-white text-[#64748B] border border-[#E2E8F0] px-3.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer group"
        >
          <div className="flex items-center gap-2">
            <FaSearch className="text-[#64748B] group-hover:text-[#2563EB] transition-colors" />
            <span className="font-normal text-[#64748B]">Search employees, students, projects...</span>
          </div>
          <kbd className="hidden lg:inline-block bg-white text-[#64748B] font-mono text-[10px] font-semibold px-2 py-0.5 rounded border border-[#E2E8F0]">
            Ctrl + K
          </kbd>
        </button>
      </div>

      {/* Right: Date, Notifications, User Badge & Logout */}
      <div className="flex items-center gap-3">
        <div className="hidden lg:block text-right pr-3 border-r border-[#E2E8F0]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">Today</p>
          <p className="text-xs font-bold text-[#0F172A]">{currentDateStr || "Aug 7, 2026"}</p>
        </div>

        {/* Global Search Mobile Button */}
        <button
          type="button"
          onClick={() => setIsSearchOpen(true)}
          className="md:hidden p-2 text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] cursor-pointer"
        >
          <FaSearch className="text-sm text-[#2563EB]" />
        </button>

        {/* Dark / Light Mode Toggle Button */}
        <button
          type="button"
          onClick={toggleDarkMode}
          className="p-2 text-[#64748B] dark:text-amber-400 hover:bg-[#F8FAFC] dark:hover:bg-slate-800 rounded-xl transition-all border border-[#E2E8F0] dark:border-slate-700 cursor-pointer flex items-center justify-center shadow-xs"
          title={isDarkMode ? "Switch to Light Mode ☀️" : "Switch to Dark Mode 🌙"}
        >
          {isDarkMode ? (
            <FaSun className="text-base text-amber-400" />
          ) : (
            <FaMoon className="text-base text-[#2563EB]" />
          )}
        </button>

        {/* Notifications Bell */}
        <div
          ref={notifRef}
          className="relative"
          onMouseEnter={handleMouseEnterNotif}
          onMouseLeave={handleMouseLeaveNotif}
        >
          <button
            onClick={handleToggleNotifications}
            className="relative p-2 text-[#64748B] hover:bg-[#F8FAFC] rounded-xl transition-colors border border-[#E2E8F0] cursor-pointer"
            title="Notification Center"
          >
            <FaBell className="text-base text-[#2563EB]" />
            {totalAdminCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#2563EB] text-[10px] font-bold text-white">
                {totalAdminCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown Panel */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-96 rounded-2xl bg-white p-4 shadow-xl border border-[#E2E8F0] space-y-3 z-50 animate-in fade-in zoom-in-95 duration-150 text-[#0F172A]">
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                    <FaBell className="text-xs" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#0F172A]">Notification Center</h4>
                    <p className="text-[10px] text-[#64748B]">Pending leaves & complaints</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold bg-[#EFF6FF] text-[#2563EB] px-2 py-0.5 rounded-full border border-[#2563EB]/20">
                  {totalAdminCount} Pending
                </span>
              </div>

              {/* Category Filter Tabs */}
              <div className="flex items-center gap-1 bg-[#F8FAFC] p-1 rounded-xl border border-[#E2E8F0] text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveNotifCategory("all")}
                  className={`flex-1 py-1 rounded-lg text-center transition-all cursor-pointer ${
                    activeNotifCategory === "all" ? "bg-white text-[#2563EB] shadow-xs" : "text-[#64748B]"
                  }`}
                >
                  All ({totalAdminCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveNotifCategory("tasks")}
                  className={`flex-1 py-1 rounded-lg text-center transition-all cursor-pointer ${
                    activeNotifCategory === "tasks" ? "bg-white text-[#2563EB] shadow-xs" : "text-[#64748B]"
                  }`}
                >
                  Tasks ({activeTaskAlerts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveNotifCategory("leaves")}
                  className={`flex-1 py-1 rounded-lg text-center transition-all cursor-pointer ${
                    activeNotifCategory === "leaves" ? "bg-white text-[#2563EB] shadow-xs" : "text-[#64748B]"
                  }`}
                >
                  Leaves ({activeLeaves.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveNotifCategory("complaints")}
                  className={`flex-1 py-1 rounded-lg text-center transition-all cursor-pointer ${
                    activeNotifCategory === "complaints" ? "bg-white text-[#2563EB] shadow-xs" : "text-[#64748B]"
                  }`}
                >
                  Complaints ({activeComplaints.length})
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto space-y-2.5 pr-1 text-xs">
                {/* 0. Tasks Section */}
                {(activeNotifCategory === "all" || activeNotifCategory === "tasks") && activeTaskAlerts.map((t) => (
                  <div
                    key={t.id}
                    className="p-3.5 rounded-2xl bg-[#EFF6FF]/60 hover:bg-[#EFF6FF] border border-[#BFDBFE] space-y-2 transition-all shadow-xs relative"
                  >
                    <div className="flex items-center justify-between font-bold text-[#0F172A] text-xs">
                      <div className="flex items-center gap-1.5 truncate">
                        <FaTasks className="text-[#2563EB] shrink-0 text-xs" />
                        <span className="truncate text-slate-900 font-bold">{t.title}</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDismissNotification(t.id);
                        }}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Dismiss notification"
                      >
                        <FaTimes className="text-xs" />
                      </button>
                    </div>

                    <p className="text-[11px] text-[#1E3A8A] leading-snug bg-white p-2 rounded-lg border border-[#BFDBFE]/60">
                      {t.message}
                    </p>

                    <div className="flex items-center justify-between text-[10px] pt-1 border-t border-[#BFDBFE]/60">
                      <span className="text-[#2563EB] font-semibold">{t.related_user_name || t.related_user_email || "System"}</span>
                      <Link
                        href="/dashboard/tasks"
                        onClick={() => setShowNotifications(false)}
                        className="text-[#2563EB] font-bold hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <span>Open Tasks Hub →</span>
                      </Link>
                    </div>
                  </div>
                ))}

                {/* 1. Leaves Section */}
                {(activeNotifCategory === "all" || activeNotifCategory === "leaves") && activeLeaves.map((l) => {
                  const applicantName = l.applicant_name || l.employee_name || "Staff / Student";
                  const leaveType = l.leave_type || l.type || "Leave Request";
                  const startDate = l.start_date || "N/A";
                  const endDate = l.end_date || "N/A";
                  const reason = l.reason || "No reason provided";
                  const isStudent = l.role === "student" || (applicantName.toLowerCase().includes("student"));

                  return (
                    <div
                      key={l.id}
                      className="p-3.5 rounded-2xl bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] space-y-2.5 transition-all shadow-xs"
                    >
                      {/* Top info */}
                      <div className="flex items-center justify-between font-bold text-[#0F172A] text-xs">
                        <div className="flex items-center gap-1.5 truncate">
                          {isStudent ? (
                            <FaUserGraduate className="text-[#2563EB] shrink-0 text-xs" />
                          ) : (
                            <FaUserTie className="text-[#2563EB] shrink-0 text-xs" />
                          )}
                          <span className="truncate text-slate-900 font-bold">{applicantName}</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-[#E2E8F0] text-[#475569]">
                            {isStudent ? "Student" : "Staff"}
                          </span>
                        </div>
                        <span className="text-[10px] bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB]/20 px-2 py-0.5 rounded-full font-bold shrink-0">
                          {leaveType}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-[#2563EB] font-semibold">
                        <FaCalendarAlt className="text-[10px] text-[#64748B]" />
                        <span>{startDate} to {endDate}</span>
                      </div>

                      <p className="text-[11px] text-[#475569] leading-snug line-clamp-2 italic bg-white p-2 rounded-lg border border-[#E2E8F0]">
                        "{reason}"
                      </p>

                      {/* Action buttons row */}
                      <div className="flex items-center gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLeaveModal(l);
                            handleDismissNotification(l.id);
                            setShowNotifications(false);
                          }}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white font-bold text-[10px] border border-blue-200 transition-all cursor-pointer shadow-xs"
                        >
                          <span>🔍 View Details</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            handleApproveLeave(l.id);
                            handleDismissNotification(l.id);
                          }}
                          className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] transition-all cursor-pointer shadow-xs"
                          title="Approve Leave"
                        >
                          <FaCheck className="text-[9px]" />
                          <span>Approve</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            handleRejectLeave(l.id);
                            handleDismissNotification(l.id);
                          }}
                          className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] transition-all cursor-pointer shadow-xs"
                          title="Reject Leave"
                        >
                          <FaTimes className="text-[9px]" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* 2. Complaints Section */}
                {(activeNotifCategory === "all" || activeNotifCategory === "complaints") && activeComplaints.map((c) => (
                  <div
                    key={c.id}
                    className="p-3.5 rounded-2xl bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] space-y-2 transition-all shadow-xs relative"
                  >
                    <div className="flex items-center justify-between font-bold text-[#0F172A] text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-900 font-bold">{c.submitted_by || "Anonymous"}</span>
                        <span className="text-[9px] bg-[#EFF6FF] text-[#2563EB] px-2 py-0.5 rounded-full font-bold">{c.category || "Complaint"}</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDismissNotification(c.id);
                        }}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Dismiss notification"
                      >
                        <FaTimes className="text-xs" />
                      </button>
                    </div>
                    <p className="text-[11px] text-[#475569] leading-snug line-clamp-2 bg-white p-2 rounded-lg border border-[#E2E8F0]">"{c.title || c.description}"</p>
                    <div className="flex items-center justify-between text-[10px] pt-1 border-t border-[#E2E8F0]/60">
                      <span className="text-amber-700 font-semibold">{c.status || "Pending"}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedComplaintModal(c);
                          handleDismissNotification(c.id);
                          setShowNotifications(false);
                        }}
                        className="text-[#2563EB] font-bold hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <span>View Ticket →</span>
                      </button>
                    </div>
                  </div>
                ))}

                {totalAdminCount === 0 && (
                  <div className="text-center py-8 space-y-1.5">
                    <FaCheckCircle className="mx-auto text-emerald-500 text-2xl" />
                    <p className="text-xs font-bold text-[#0F172A]">All caught up!</p>
                    <p className="text-[#64748B] text-[11px]">No pending leaves or complaints to review.</p>
                  </div>
                )}
              </div>

              {/* Bottom Hub Link */}
              <div className="border-t border-[#E2E8F0] pt-2 flex items-center justify-between text-[11px]">
                <Link
                  href="/dashboard/leaves"
                  onClick={() => setShowNotifications(false)}
                  className="font-bold text-[#2563EB] hover:underline flex items-center gap-1"
                >
                  <FaCalendarAlt className="text-[10px]" /> Go to Leaves Hub →
                </Link>
                <Link
                  href="/dashboard/complaints"
                  onClick={() => setShowNotifications(false)}
                  className="font-bold text-[#64748B] hover:text-[#0F172A] transition-colors"
                >
                  Complaints Hub
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Profile Avatar Badge - Click to Upload / Change Photo */}
        <div
          onClick={() => {
            setModalAvatarUrlInput(userAvatarUrl || "");
            setIsAvatarModalOpen(true);
          }}
          className="flex items-center gap-2 pl-2 border-l border-[#E2E8F0] hover:opacity-85 transition-opacity cursor-pointer group"
          title="Click to Upload / Change Profile Picture"
        >
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB] text-xs font-bold border border-[#2563EB]/20 group-hover:scale-105 transition-transform overflow-hidden shrink-0 shadow-xs">
            {userAvatarUrl ? (
              <img
                src={userAvatarUrl}
                alt={userName || "Profile"}
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : null}
            <span className="absolute inset-0 flex items-center justify-center text-[#2563EB] text-xs font-bold -z-10">
              {getUserInitials(userName, userEmail)}
            </span>
          </div>
          <div className="text-left hidden xl:block">
            <p className="text-xs font-bold text-[#0F172A] leading-tight group-hover:text-[#2563EB] transition-colors">
              {userName || userEmail.split("@")[0] || "User"}
            </p>
            <p className="text-[10px] text-[#64748B] uppercase font-medium tracking-wider">{role}</p>
          </div>
        </div>

        {/* Sign Out Button */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-xl bg-white hover:bg-[#F8FAFC] text-[#64748B] hover:text-[#0F172A] border border-[#E2E8F0] px-3 py-2 text-xs font-semibold transition-colors cursor-pointer"
          title="Sign Out"
        >
          <FaSignOutAlt className="text-xs text-[#64748B]" />
          <span className="hidden md:inline">Logout</span>
        </button>
      </div>

      {/* GLOBAL SEARCH MODAL (Ctrl + K / Auto-close on Mouse Leave / Crystal Clean Floating Dropdown) */}
      {isSearchOpen && (
        <div 
          onClick={() => setIsSearchOpen(false)}
          className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-18 p-4 bg-transparent"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={handleMouseEnterSearch}
            onMouseLeave={handleMouseLeaveSearch}
            className="bg-white/95 backdrop-blur-xl rounded-3xl max-w-2xl w-full p-5 shadow-[0_25px_60px_-15px_rgba(15,23,42,0.25)] border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150 relative ring-1 ring-slate-900/5"
          >
            {/* Search Input Bar */}
            <div className="flex items-center gap-3 border-b border-[#E2E8F0] pb-3 px-2">
              <FaSearch className="text-[#2563EB] text-lg shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects, employees, interns, students, tasks..."
                className="w-full text-sm font-bold text-[#0F172A] outline-none placeholder:text-[#94A3B8] placeholder:font-normal bg-transparent"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-slate-400 hover:text-slate-600 text-xs px-1.5 py-0.5 rounded cursor-pointer"
                >
                  ✕
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsSearchOpen(false)}
                className="text-[#64748B] text-xs font-mono font-bold px-2 py-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                title="Close Search"
              >
                ESC
              </button>
            </div>

            {/* Results Feed */}
            <div className="max-h-96 overflow-y-auto space-y-1.5 text-xs pr-1">
              {!searchQuery.trim() ? (
                <div className="py-10 text-center text-[#64748B] space-y-2">
                  <FaSearch className="mx-auto text-2xl text-blue-500/50" />
                  <p className="text-xs font-bold text-slate-700">Type any keyword to search across the entire portal.</p>
                  <p className="text-[11px] text-slate-400">Search projects, employees, practical interns, LMS students, and deliverables.</p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="py-10 text-center text-[#64748B] space-y-1">
                  <p className="text-xs font-bold text-slate-700">No matching records found for "{searchQuery}".</p>
                  <p className="text-[11px] text-slate-400">Try searching by project title, person name, email, or tech domain.</p>
                </div>
              ) : (
                searchResults.map((res) => {
                  const Icon = res.icon || FaSearch;
                  const categoryStyle =
                    res.category === "Projects"
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : res.category === "Employees"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : res.category === "Interns"
                      ? "bg-purple-50 text-purple-700 border-purple-200"
                      : res.category === "Students"
                      ? "bg-cyan-50 text-cyan-700 border-cyan-200"
                      : res.category === "Tasks"
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-slate-100 text-slate-700 border-slate-200";

                  return (
                    <Link
                      key={res.id}
                      href={res.link}
                      onClick={() => setIsSearchOpen(false)}
                      className="flex items-center justify-between p-3 rounded-2xl hover:bg-[#EFF6FF] border border-transparent hover:border-[#2563EB]/20 transition-all group cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-slate-50 group-hover:bg-[#EFF6FF] text-[#2563EB] border border-slate-200 group-hover:border-blue-200 transition-colors">
                          <Icon className="text-base" />
                        </div>
                        <div>
                          <p className="font-bold text-[#0F172A] group-hover:text-[#2563EB] text-xs leading-tight">
                            {res.title}
                          </p>
                          <p className="text-[11px] text-[#64748B] mt-0.5">{res.subtitle}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${categoryStyle}`}>
                        {res.category}
                      </span>
                    </Link>
                  );
                })
              )}
            </div>

            {/* Auto-Close Hint Footer */}
            <div className="flex items-center justify-between border-t border-[#E2E8F0] pt-3 text-[11px] text-[#64748B] px-1">
              <span className="flex items-center gap-1.5 text-slate-500 font-medium">
                <span>💡</span>
                <span>Auto-closes when cursor moves away or click outside</span>
              </span>
              <span className="font-bold text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded-md border border-blue-100">
                {searchResults.length} Results
              </span>
            </div>
          </div>
        </div>
      )}

      {/* LEAVE DETAILS & APPROVAL MODAL FROM NOTIFICATION BELL */}
      {selectedLeaveModal && (
        <Modal
          isOpen={!!selectedLeaveModal}
          onClose={() => setSelectedLeaveModal(null)}
          title={`Leave Application — ${selectedLeaveModal.applicant_name || selectedLeaveModal.employee_name || "Applicant"}`}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-[#EFF6FF] border border-[#2563EB]/20 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-[#2563EB] tracking-wider">Leave Application Details</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEF3C7] text-[#92400E] border border-[#F59E0B]/20 flex items-center gap-1">
                  <FaClock className="text-[9px]" /> Pending
                </span>
              </div>
              <h3 className="text-sm font-bold text-[#0F172A]">
                {selectedLeaveModal.applicant_name || selectedLeaveModal.employee_name || "Applicant Name"}
              </h3>
              <p className="text-[11px] text-[#64748B]">
                {selectedLeaveModal.applicant_email || selectedLeaveModal.email || "No email on record"} • {selectedLeaveModal.role === "student" || (selectedLeaveModal.applicant_name || "").toLowerCase().includes("student") ? "Enrolled Student" : "Staff Member"}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#F8FAFC] p-3.5 rounded-xl border border-[#E2E8F0]">
              <div>
                <span className="text-[#64748B] block text-[10px] font-semibold uppercase">Leave Type</span>
                <strong className="text-[#0F172A] text-xs font-bold">{selectedLeaveModal.leave_type || selectedLeaveModal.type || "Casual Leave"}</strong>
              </div>
              <div>
                <span className="text-[#64748B] block text-[10px] font-semibold uppercase">Applied Date</span>
                <span className="text-[#0F172A] text-xs font-medium">{selectedLeaveModal.applied_at || selectedLeaveModal.created_at?.split("T")[0] || "Today"}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-[#64748B] block text-[10px] font-semibold uppercase">Requested Date Range</span>
                <div className="flex items-center gap-2 mt-0.5 text-xs font-bold text-[#2563EB]">
                  <FaCalendarAlt className="text-xs" />
                  <span>{selectedLeaveModal.start_date || "N/A"}</span>
                  <span className="text-[#64748B] font-normal">to</span>
                  <span>{selectedLeaveModal.end_date || "N/A"}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1 bg-[#F8FAFC] p-3.5 rounded-xl border border-[#E2E8F0]">
              <span className="text-[#64748B] block text-[10px] font-semibold uppercase">Applicant Reason & Details:</span>
              <p className="text-xs text-[#0F172A] font-medium leading-relaxed italic bg-white p-2.5 rounded-lg border border-[#E2E8F0]">
                "{selectedLeaveModal.reason || "No details provided"}"
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-3 border-t border-[#E2E8F0]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleApproveLeave(selectedLeaveModal.id)}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors shadow-xs cursor-pointer"
                >
                  <FaCheckCircle className="text-xs" />
                  <span>Approve (No Salary Cut)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleRejectLeave(selectedLeaveModal.id)}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors shadow-xs cursor-pointer"
                >
                  <FaTimesCircle className="text-xs" />
                  <span>Reject (Salary Cut)</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedLeaveModal(null)}
                className="px-4 py-2 rounded-xl border border-[#E2E8F0] hover:bg-[#F8FAFC] text-[#64748B] font-semibold text-xs transition-colors cursor-pointer text-center"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* COMPLAINT DETAILS MODAL */}
      {selectedComplaintModal && (
        <Modal
          isOpen={!!selectedComplaintModal}
          onClose={() => setSelectedComplaintModal(null)}
          title={`Complaint / Feedback — ${selectedComplaintModal.submitted_by || "Anonymous"}`}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-[#EFF6FF] border border-[#2563EB]/20 space-y-1">
              <span className="text-[10px] uppercase font-bold text-[#2563EB] tracking-wider">Ticket Category: {selectedComplaintModal.category || "General"}</span>
              <h3 className="text-sm font-bold text-[#0F172A]">{selectedComplaintModal.title || "Complaint Title"}</h3>
              <p className="text-[11px] text-[#64748B]">Submitted By: {selectedComplaintModal.submitted_by || "Anonymous"}</p>
            </div>

            <div className="space-y-1 bg-[#F8FAFC] p-3.5 rounded-xl border border-[#E2E8F0]">
              <span className="text-[#64748B] block text-[10px] font-semibold uppercase">Description:</span>
              <p className="text-xs text-[#0F172A] font-medium leading-relaxed bg-white p-2.5 rounded-lg border border-[#E2E8F0]">
                {selectedComplaintModal.description || selectedComplaintModal.title || "No description provided"}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
              <Link
                href="/dashboard/complaints"
                onClick={() => setSelectedComplaintModal(null)}
                className="px-4 py-2 rounded-xl bg-[#2563EB] text-white font-bold text-xs hover:bg-blue-700 transition-colors"
              >
                Open in Complaints Hub →
              </Link>
              <button
                type="button"
                onClick={() => setSelectedComplaintModal(null)}
                className="px-4 py-2 rounded-xl border border-[#E2E8F0] text-[#64748B] font-semibold text-xs hover:bg-[#F8FAFC]"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* NAVBAR DIRECT PROFILE PHOTO UPLOAD MODAL */}
      {isAvatarModalOpen && (
        <Modal
          isOpen={isAvatarModalOpen}
          onClose={() => setIsAvatarModalOpen(false)}
          title="Upload Profile Picture 📷"
        >
          <div className="space-y-4 text-xs p-1">
            <div className="flex items-center gap-4 bg-[#F8FAFC] p-4 rounded-2xl border border-[#E2E8F0]">
              <div className="relative h-16 w-16 rounded-2xl overflow-hidden bg-[#EFF6FF] border border-[#2563EB]/30 shadow-xs flex items-center justify-center shrink-0">
                {userAvatarUrl ? (
                  <img src={userAvatarUrl} alt="Preview" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[#2563EB] text-lg font-bold">
                    {getUserInitials(userName, userEmail)}
                  </span>
                )}
              </div>
              <div>
                <h4 className="font-bold text-[#0F172A] text-sm">{userName || "User Account"}</h4>
                <p className="text-[#64748B] text-[11px] font-mono">{userEmail || "user@nexa.com"}</p>
                <p className="text-[10px] text-[#2563EB] font-bold mt-0.5 uppercase">Role: {role}</p>
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
                  value={modalAvatarUrlInput}
                  onChange={(e) => setModalAvatarUrlInput(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full rounded-xl border border-[#E2E8F0] px-3.5 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] bg-white font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setIsAvatarModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-[#E2E8F0] text-[#64748B] font-semibold hover:bg-[#F8FAFC] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveAvatar(modalAvatarUrlInput)}
                className="px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold transition-all shadow-xs cursor-pointer"
              >
                Save Profile Photo
              </button>
            </div>
          </div>
        </Modal>
      )}
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  FaChartPie,
  FaUsers,
  FaCalendarCheck,
  FaUserClock,
  FaWallet,
  FaGraduationCap,
  FaProjectDiagram,
  FaUserTie,
  FaLandmark,
  FaBuilding,
  FaLaptopCode,
  FaExclamationTriangle,
  FaVideo,
  FaTrophy,
  FaDesktop,
  FaBullhorn,
  FaChevronDown,
  FaChevronRight,
  FaChevronLeft,
  FaCogs,
  FaTasks
} from "react-icons/fa";

const adminMenuGroups = [
  {
    title: "Core Management",
    id: "core",
    items: [
      { name: "Overview Dashboard", href: "/dashboard", icon: FaChartPie },
      { name: "Daily Task Cycles", href: "/dashboard/tasks", icon: FaTasks },
      { name: "Staff Dashboard View", href: "/dashboard/employee", icon: FaUserTie },
      { name: "Employees Directory", href: "/dashboard/employees", icon: FaUsers },
      { name: "Projects Directory", href: "/dashboard/projects", icon: FaProjectDiagram },
      { name: "Remote Monitoring", href: "/dashboard/remote-monitoring", icon: FaDesktop },
    ]
  },
  {
    title: "Attendance & Admin",
    id: "hr",
    items: [
      { name: "Attendance Control", href: "/dashboard/attendance", icon: FaCalendarCheck },
      { name: "Leave & Admin Approvals", href: "/dashboard/leaves", icon: FaUserClock },
      { name: "Payroll & Payslips", href: "/dashboard/payroll", icon: FaWallet },
      { name: "Performance Reviews", href: "/dashboard/performance", icon: FaTrophy },
      { name: "Complaints Hub", href: "/dashboard/complaints", icon: FaExclamationTriangle },
    ]
  },
  {
    title: "Academic & Students",
    id: "academic",
    items: [
      { name: "Courses & Students", href: "/dashboard/courses", icon: FaGraduationCap },
      { name: "3-Month Internships", href: "/dashboard/internships", icon: FaLaptopCode },
      { name: "Announcement Board", href: "/dashboard/announcements", icon: FaBullhorn },
    ]
  },
  {
    title: "Finance & Accounting",
    id: "finance",
    items: [
      { name: "Finance Overview", href: "/dashboard/finance", icon: FaLandmark },
      { name: "Clients & Deals", href: "/dashboard/clients", icon: FaBuilding },
    ]
  },
  {
    title: "Administration",
    id: "admin",
    items: [
      { name: "Meeting Management", href: "/dashboard/meetings", icon: FaVideo },
      { name: "Company Settings", href: "/dashboard/settings", icon: FaCogs },
    ]
  }
];

const employeeMenuGroups = [
  {
    title: "Staff Workspace",
    id: "staff_core",
    items: [
      { name: "Employee Dashboard", href: "/dashboard/employee", icon: FaUserTie },
      { name: "Daily Tasks", href: "/dashboard/tasks", icon: FaTasks },
      { name: "My Attendance", href: "/dashboard/attendance", icon: FaCalendarCheck },
      { name: "My Projects", href: "/dashboard/projects", icon: FaProjectDiagram },
      { name: "Remote Work Monitor", href: "/dashboard/remote-monitoring", icon: FaDesktop },
    ]
  },
  {
    title: "HR & Self Service",
    id: "staff_hr",
    items: [
      { name: "Announcements", href: "/dashboard/announcements", icon: FaBullhorn },
      { name: "Apply for Leave", href: "/dashboard/leaves", icon: FaUserClock },
      { name: "My Performance", href: "/dashboard/performance", icon: FaTrophy },
      { name: "Meeting Room", href: "/dashboard/meetings", icon: FaVideo },
      { name: "Complaints Box", href: "/dashboard/complaints", icon: FaExclamationTriangle },
    ]
  }
];

const studentMenuGroups = [
  {
    title: "Academic Portal",
    id: "student_core",
    items: [
      { name: "Student Dashboard", href: "/dashboard/student", icon: FaGraduationCap },
      { name: "Daily Tasks / Assignments", href: "/dashboard/tasks", icon: FaTasks },
      { name: "My Attendance", href: "/dashboard/attendance", icon: FaCalendarCheck },
      { name: "My Projects", href: "/dashboard/projects", icon: FaProjectDiagram },
      { name: "My Internships", href: "/dashboard/internships", icon: FaLaptopCode },
    ]
  },
  {
    title: "Activities & Support",
    id: "student_support",
    items: [
      { name: "Announcements", href: "/dashboard/announcements", icon: FaBullhorn },
      { name: "Apply for Leave", href: "/dashboard/leaves", icon: FaUserClock },
      { name: "Performance Score", href: "/dashboard/performance", icon: FaTrophy },
      { name: "Meetings", href: "/dashboard/meetings", icon: FaVideo },
      { name: "Complaints Box", href: "/dashboard/complaints", icon: FaExclamationTriangle },
    ]
  }
];

export default function Sidebar({ isOpen, onClose }) {
  const pathname = usePathname();
  const [role, setRole] = useState("admin");
  const [collapsedGroups, setCollapsedGroups] = useState({});

  useEffect(() => {
    const savedRole = localStorage.getItem("user_role") || "admin";
    setRole(savedRole);

    try {
      const savedState = localStorage.getItem("sidebar_collapsed_groups");
      if (savedState) setCollapsedGroups(JSON.parse(savedState));
    } catch(e) {}

    const handleRoleChange = () => {
      setRole(localStorage.getItem("user_role") || "admin");
    };

    window.addEventListener("roleChanged", handleRoleChange);
    return () => window.removeEventListener("roleChanged", handleRoleChange);
  }, []);

  const toggleGroup = (groupId) => {
    setCollapsedGroups(prev => {
      const updated = { ...prev, [groupId]: !prev[groupId] };
      try {
        localStorage.setItem("sidebar_collapsed_groups", JSON.stringify(updated));
      } catch(e) {}
      return updated;
    });
  };

  const changeRole = (newRole) => {
    setRole(newRole);
    localStorage.setItem("user_role", newRole);
    window.dispatchEvent(new Event("roleChanged"));
  };

  const groups =
    role === "admin" || role === "hr" || role === "manager" || role === "accounts"
      ? adminMenuGroups
      : role === "student" || role === "course_student"
      ? studentMenuGroups
      : employeeMenuGroups;

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs md:hidden"
          onClick={onClose}
        />
      )}

      {/* Enterprise Blue & White Sidebar */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex w-64 flex-col bg-white text-slate-800 shadow-sm border-r border-[#E2E8F0] transition-transform duration-200 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Sidebar Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-[#E2E8F0] px-4 bg-white">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="h-9 w-9 flex items-center justify-center">
              <img
                src="/logo.jpeg"
                alt="NEXA Logo"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <span className="text-sm font-bold tracking-tight text-[#0F172A] block leading-none">
                NEXA PORTAL
              </span>
              <span className="text-[10px] text-[#2563EB] font-bold uppercase tracking-wider">
                Enterprise SaaS
              </span>
            </div>
          </Link>

          {/* Desktop & Mobile Collapse Button */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] transition-colors border border-[#E2E8F0] cursor-pointer flex items-center justify-center"
            title="Collapse Sidebar"
          >
            <FaChevronLeft className="text-xs text-[#2563EB]" />
          </button>
        </div>

        {/* Active Portal Badge */}
        <div className="border-b border-[#E2E8F0] px-4 py-2.5 bg-[#F8FAFC]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
              Portal Mode
            </span>
            <span className="text-[9px] bg-[#EFF6FF] text-[#2563EB] px-2 py-0.5 rounded-md font-bold uppercase border border-[#2563EB]/20">
              {role === "admin" ? "Admin Master" : role}
            </span>
          </div>
        </div>

        {/* Navigation Items Organized into Collapsible Sections */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {groups.map((group) => {
            const isCollapsed = collapsedGroups[group.id];

            return (
              <div key={group.id} className="space-y-1">
                {/* Section Header with Smooth Arrow Rotation */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-bold text-[#64748B] hover:text-[#0F172A] uppercase tracking-wider cursor-pointer group transition-colors"
                >
                  <span>{group.title}</span>
                  <FaChevronDown
                    className={`text-[10px] text-[#64748B] transition-transform duration-300 ease-in-out ${
                      isCollapsed ? "-rotate-90" : "rotate-0"
                    }`}
                  />
                </button>

                {/* Section Items with Smooth Slow Expansion & Fade Animation */}
                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    isCollapsed ? "max-h-0 opacity-0 pointer-events-none" : "max-h-96 opacity-100 space-y-0.5"
                  }`}
                >
                  {group.items.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={onClose}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all duration-200 ease-in-out hover:translate-x-1 active:scale-98 relative ${
                          isActive
                            ? "bg-[#EFF6FF] text-[#2563EB] font-bold shadow-xs"
                            : "text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium"
                        }`}
                      >
                        {/* Active Blue Indicator Bar */}
                        {isActive && (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#2563EB] rounded-r-full transition-all duration-200" />
                        )}
                        <Icon className={`text-sm transition-transform duration-200 group-hover:scale-110 ${isActive ? "text-[#2563EB]" : "text-[#64748B]"}`} />
                        <span className="truncate">{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="border-t border-[#E2E8F0] p-3 text-center text-[11px] text-[#64748B] bg-[#F8FAFC]">
          <p>© 2026 Enterprise SaaS System</p>
        </div>
      </aside>
    </>
  );
}

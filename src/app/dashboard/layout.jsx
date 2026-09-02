"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/Navbar";
import ToastContainer, { showToast } from "@/components/Toast";

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  // Default false so sidebar is hidden on first load
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [role, setRole] = useState("admin");
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    // On mobile, close sidebar on first load
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, []);

  useEffect(() => {
    // Auto-close sidebar on mobile when navigating to a new page
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, [pathname]);

  useEffect(() => {
    const checkAuth = () => {
      if (typeof window === "undefined") return;

      const isLoggedIn = localStorage.getItem("isLoggedIn") === "true";
      const userRole = localStorage.getItem("user_role");

      if (!isLoggedIn || !userRole) {
        setAuthorized(false);
        router.replace("/login");
        return;
      }

      const cleanRole = (userRole || "").toLowerCase().trim();
      const currentEmail = (localStorage.getItem("current_user_email") || "").toLowerCase().trim();

      // Admin, HR, Manager, Accounts roles have full unrestricted access to all routes
      const isAdminUser = ["admin", "super_admin", "hr", "manager", "accounts"].includes(cleanRole) || 
                          currentEmail === "admin@gmail.com" || 
                          currentEmail === "admin@nexa.com" || 
                          currentEmail.includes("admin") || 
                          currentEmail.includes("owner");

      if (isAdminUser) {
        setAuthorized(true);
        setRole("admin");
        return;
      }

      const currentPath = pathname ? pathname.replace(/\/$/, "") : "";

      // Default root /dashboard redirect to user's dedicated portal seamlessly
      if (currentPath === "/dashboard" || currentPath === "") {
        if (cleanRole === "intern" || cleanRole === "student") {
          router.replace("/dashboard/student");
          return;
        } else if (cleanRole === "employee" || cleanRole === "staff") {
          router.replace("/dashboard/employee");
          return;
        } else if (cleanRole === "client") {
          router.replace("/dashboard/client-portal");
          return;
        }
      }

      // RBAC Route Guarding for Restricted Admin Pages
      const adminOnlyPaths = [
        "/dashboard/finance",
        "/dashboard/settings",
        "/dashboard/payroll",
        "/dashboard/expenses",
        "/dashboard/clients"
      ];

      if (cleanRole === "employee") {
        if (adminOnlyPaths.includes(currentPath) || currentPath === "/dashboard/student") {
          router.replace("/dashboard/employee");
          return;
        }
      } else if (cleanRole === "student") {
        if (adminOnlyPaths.includes(currentPath) || currentPath === "/dashboard/employee") {
          router.replace("/dashboard/student");
          return;
        }
      } else if (cleanRole === "intern") {
        if (adminOnlyPaths.includes(currentPath) || currentPath === "/dashboard/employee") {
          router.replace("/dashboard/student");
          return;
        }
      } else if (cleanRole === "client") {
        if (adminOnlyPaths.includes(currentPath) || currentPath !== "/dashboard/client-portal") {
          router.replace("/dashboard/client-portal");
          return;
        }
      }

      setAuthorized(true);
      setRole(cleanRole);
    };

    checkAuth();

    window.addEventListener("popstate", checkAuth);
    const handleRoleChange = () => {
      if (typeof window !== "undefined") {
        setRole(localStorage.getItem("user_role") || "admin");
      }
    };
    window.addEventListener("roleChanged", handleRoleChange);

    return () => {
      window.removeEventListener("popstate", checkAuth);
      window.removeEventListener("roleChanged", handleRoleChange);
    };
  }, [pathname, router]);

  if (!authorized) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center text-[#0F172A] p-6 text-center">
        <div className="flex items-center gap-3 text-xs font-bold uppercase bg-white px-5 py-3 rounded-2xl border border-[#E2E8F0] shadow-sm">
          <span className="w-4 h-4 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin"></span>
          <span>Security Guard Active • Verifying Permissions...</span>
        </div>
      </div>
    );
  }

  const isAdminRole = role === "admin" || role === "hr" || role === "manager" || role === "accounts";

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${
        isAdminRole 
          ? (sidebarOpen ? "md:pl-64" : "md:pl-0") 
          : "pl-0"
      }`}>
        <Navbar isSidebarOpen={sidebarOpen} onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Global Toast Notification System */}
      <ToastContainer />
    </div>
  );
}
"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { dbFetch, dbSaveRecord } from "@/lib/dbPersistence";
import { logActivity } from "@/lib/activityUtils";
import Modal from "@/components/Modal";
import { showToast } from "@/components/Toast";
import {
  FaCheck,
  FaTimes,
  FaCalendarPlus,
  FaUserClock,
  FaShieldAlt,
  FaInfoCircle,
  FaCalendarCheck,
  FaCheckCircle,
  FaTimesCircle,
  FaClock,
  FaArrowRight,
  FaEllipsisV,
  FaTrashAlt,
  FaFileAlt,
  FaSearch
} from "react-icons/fa";

const StatusBadge = ({ status }) => {
  const cleanStatus = (status || "").toString().toLowerCase().trim();
  if (cleanStatus === "approved") {
    return (
      <span className="inline-flex items-center gap-1.5 bg-[#D1FAE5] text-[#065F46] border border-[#10B981]/20 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap">
        <FaCheckCircle className="text-xs text-[#065F46]" /> Approved (No Cut)
      </span>
    );
  }
  if (cleanStatus === "rejected") {
    return (
      <span className="inline-flex items-center gap-1.5 bg-[#FEE2E2] text-[#991B1B] border border-[#EF4444]/20 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap">
        <FaTimesCircle className="text-xs text-[#991B1B]" /> Rejected (Salary Cut)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 bg-[#FEF3C7] text-[#92400E] border border-[#F59E0B]/20 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap">
      <FaClock className="text-xs text-[#92400E]" /> Pending
    </span>
  );
};

export default function LeavesPage() {
  const [role, setRole] = useState("admin");
  const [isAdmin, setIsAdmin] = useState(true);
  const [user, setUser] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const formFirstInputRef = useRef(null);

  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'approved' | 'rejected' | 'pending'
  const [searchQuery, setSearchQuery] = useState("");

  const handleCardClick = (filterKey) => {
    setStatusFilter((prev) => (prev === filterKey ? "all" : filterKey));
    setTimeout(() => {
      const el = document.getElementById("leave-applications-table");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
  };

  const [form, setForm] = useState({
    applicantName: "",
    type: "Emergency Leave",
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
    reason: ""
  });
  const [modal, setModal] = useState({ isOpen: false, title: "", message: "", type: "info" });
  const [loading, setLoading] = useState(true);
  const [activeKebabId, setActiveKebabId] = useState(null);

  useEffect(() => {
    const storedRole = (localStorage.getItem("user_role") || "admin").toLowerCase().trim();
    const currentEmail = (localStorage.getItem("current_user_email") || "").toLowerCase().trim();
    const adminCheck = storedRole === "admin" || storedRole === "hr" || storedRole === "manager" || currentEmail.includes("admin") || currentEmail === "admin@gmail.com";
    
    setRole(storedRole);
    setIsAdmin(adminCheck);

    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setForm(prev => ({
        ...prev,
        applicantName: session?.user?.user_metadata?.full_name || localStorage.getItem("current_user_name") || ""
      }));
    };
    fetchSession();
  }, []);

  const fetchLeaves = async () => {
    try {
      const mergedLeaves = await dbFetch("leaves", [], true);
      setLeaves(mergedLeaves || []);
    } catch (e) {
      setLeaves([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, [role]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.reason || !form.startDate || !form.endDate) {
      showToast("Missing Info ⚠️", "Please select start date, end date, and reason for leave.", "warning");
      return;
    }

    const currentEmail = localStorage.getItem("current_user_email") || "";
    const applicant = form.applicantName || (role === "student" ? "Student Applicant" : "Employee Applicant");
    const newLeave = {
      id: `leave-${Date.now()}`,
      employee_id: user?.id || "local-user",
      employee_name: applicant,
      applicant_email: currentEmail.toLowerCase().trim(),
      type: form.type,
      start_date: form.startDate,
      end_date: form.endDate,
      reason: form.reason,
      status: "pending",
      salary_cut: false,
      created_at: new Date().toISOString()
    };

    try {
      await dbSaveRecord("leaves", newLeave);
      await supabase.from("leaves").insert([{
        employee_name: applicant,
        type: form.type,
        start_date: form.startDate,
        end_date: form.endDate,
        reason: form.reason,
        status: "pending",
        salary_cut: false
      }]).catch(() => {});
    } catch(e) {}

    const updated = [newLeave, ...leaves];
    setLeaves(updated);
    localStorage.setItem("software_house_leaves", JSON.stringify(updated));

    showToast("Application Submitted ⏳", "Your leave request has been submitted for HR review.", "success");
    setForm(prev => ({ ...prev, reason: "" }));
  };

  const handleApprove = async (id) => {
    const targetLeave = leaves.find(l => l.id === id);
    const updatedLeave = targetLeave ? { ...targetLeave, status: "Approved", salary_cut: false } : { id, status: "Approved", salary_cut: false };
    try {
      await dbSaveRecord("leaves", updatedLeave);
    } catch(e) {}

    const updated = leaves.map(l => l.id === id ? { ...l, status: "Approved", salary_cut: false } : l);
    setLeaves(updated);
    localStorage.setItem("software_house_leaves", JSON.stringify(updated));

    // Auto-mark attendance log as On Leave (Approved)
    const applicantName = targetLeave?.employee_name || targetLeave?.applicant_name || "Applicant";
    const todayStr = new Date().toISOString().split("T")[0];
    const leaveDate = targetLeave?.start_date || todayStr;
    const leaveAttRecord = {
      id: `att-leave-${Date.now()}`,
      user_id: applicantName,
      user_name: applicantName,
      user_role: targetLeave?.role || "student",
      attendance_status: "On Leave (Approved)",
      type: "check_in",
      total_work_hours: "Leave Authorized",
      attendance_date: leaveDate,
      check_in_time: "Leave Approved",
      public_ip: "Leave / Off-Site",
      created_at: new Date().toISOString()
    };

    try {
      const savedAttLogs = JSON.parse(localStorage.getItem("software_house_master_attendance_logs") || "[]");
      const filteredLogs = savedAttLogs.filter(a => !(a.user_name === applicantName && a.attendance_date === leaveDate));
      const newAttLogs = [leaveAttRecord, ...filteredLogs];
      localStorage.setItem("software_house_master_attendance_logs", JSON.stringify(newAttLogs));
      
      const userEmailKey = (targetLeave?.applicant_email || targetLeave?.email || "").trim().toLowerCase();
      if (userEmailKey) {
        localStorage.setItem(`today_attendance_${userEmailKey}`, JSON.stringify([leaveAttRecord]));
      }

      await dbSaveRecord("attendance", leaveAttRecord).catch(() => {});
      window.dispatchEvent(new Event("storage"));
    } catch (e) {}

    showToast("Leave Approved 🟢", "Approved by Admin. Attendance marked as 'On Leave' (Not Absent).", "success");
  };

  const handleReject = async (id) => {
    const targetLeave = leaves.find(l => l.id === id);
    const updatedLeave = targetLeave ? { ...targetLeave, status: "Rejected", salary_cut: true } : { id, status: "Rejected", salary_cut: true };
    try {
      await dbSaveRecord("leaves", updatedLeave);
    } catch(e) {}

    const updated = leaves.map(l => l.id === id ? { ...l, status: "Rejected", salary_cut: true } : l);
    setLeaves(updated);
    localStorage.setItem("software_house_leaves", JSON.stringify(updated));

    showToast("Leave Rejected 🔴", "Leave request rejected.", "info");
  };

  const handleDeleteLeave = async (id) => {
    if (!confirm("Are you sure you want to delete this leave application?")) return;
    const updated = leaves.filter(l => l.id !== id);
    setLeaves(updated);
    localStorage.setItem("software_house_leaves", JSON.stringify(updated));
    dbDeleteRecord("leaves", id).catch(() => {});
    fetch("/api/persistence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "leaves", record: { id }, action: "delete" })
    }).catch(() => {});
    showToast("Leave Deleted 🗑️", "Leave application removed permanently from database.", "info");
  };

  const focusForm = () => {
    if (formFirstInputRef.current) {
      formFirstInputRef.current.focus();
      formFirstInputRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const visibleLeaves = leaves.filter(l => {
    if (role === "admin" || role === "hr" || role === "manager") return true;
    const currentEmail = (localStorage.getItem("current_user_email") || "").toLowerCase().trim();
    return l.applicant_email ? l.applicant_email.toLowerCase() === currentEmail : true;
  });

  const filteredLeaves = useMemo(() => {
    let list = visibleLeaves;
    if (statusFilter !== "all") {
      list = list.filter(l => (l.status || "").toLowerCase() === statusFilter.toLowerCase());
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(l =>
        (l.applicantName || l.employee_name || "").toLowerCase().includes(q) ||
        (l.applicant_email || "").toLowerCase().includes(q) ||
        (l.type || "").toLowerCase().includes(q) ||
        (l.reason || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [visibleLeaves, statusFilter, searchQuery]);

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center space-y-3 text-[#0F172A]">
        <div className="w-8 h-8 border-3 border-[#2563EB] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-bold text-[#64748B]">Loading Leave Management Desk...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      
      {/* HEADER BANNER */}
      <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] bg-[#EFF6FF] px-2.5 py-1 rounded-full border border-[#2563EB]/20">
              Leave & Admin Approvals
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-[#0F172A] mt-1.5 flex items-center gap-2.5">
            <FaUserClock className="text-[#2563EB]" />
            <span>Leave Management & Admin Approvals</span>
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Submit leave requests with detailed reasons. Admin approves (Salary Exempt) or rejects (Salary Cut Policy).
          </p>
        </div>

      </div>

      {/* 1. TOP SUMMARY STATUS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Approved */}
        <button
          type="button"
          onClick={() => handleCardClick("approved")}
          className={`rounded-2xl p-5 border transition-all text-left cursor-pointer ${
            statusFilter === "approved"
              ? "bg-emerald-50 border-2 border-emerald-500 shadow-md ring-2 ring-emerald-400/30 scale-[1.02]"
              : "bg-white border-[#E2E8F0] hover:bg-emerald-50/50 hover:shadow-xs"
          } space-y-2`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB]/20 flex items-center justify-center text-xs shrink-0">
                <FaCheckCircle />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB]">Approved Leaves</p>
                <h3 className="text-sm font-bold text-[#0F172A]">Salary Exempt</h3>
              </div>
            </div>
            <span className="text-lg font-black text-[#2563EB]">
              {visibleLeaves.filter(l => (l.status || "").toLowerCase() === "approved").length}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-[#64748B] pt-1">
            <span>Approved leaves incur 0 salary deduction.</span>
            <span className="text-[9px] underline font-semibold shrink-0">Filter List ↓</span>
          </div>
        </button>

        {/* Card 2: Rejected */}
        <button
          type="button"
          onClick={() => handleCardClick("rejected")}
          className={`rounded-2xl p-5 border transition-all text-left cursor-pointer ${
            statusFilter === "rejected"
              ? "bg-rose-50 border-2 border-rose-500 shadow-md ring-2 ring-rose-400/30 scale-[1.02]"
              : "bg-white border-[#E2E8F0] hover:bg-rose-50/50 hover:shadow-xs"
          } space-y-2`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#FEE2E2] text-[#991B1B] border border-[#EF4444]/20 flex items-center justify-center text-xs shrink-0">
                <FaTimesCircle />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#991B1B]">Rejected Leaves</p>
                <h3 className="text-sm font-bold text-[#0F172A]">Salary Cut Applied</h3>
              </div>
            </div>
            <span className="text-lg font-black text-[#991B1B]">
              {visibleLeaves.filter(l => (l.status || "").toLowerCase() === "rejected").length}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-[#64748B] pt-1">
            <span>Unapproved absences incur daily salary deduction.</span>
            <span className="text-[9px] underline font-semibold shrink-0">Filter List ↓</span>
          </div>
        </button>

        {/* Card 3: Pending */}
        <button
          type="button"
          onClick={() => handleCardClick("pending")}
          className={`rounded-2xl p-5 border transition-all text-left cursor-pointer ${
            statusFilter === "pending"
              ? "bg-amber-50 border-2 border-amber-500 shadow-md ring-2 ring-amber-400/30 scale-[1.02]"
              : "bg-white border-[#E2E8F0] hover:bg-amber-50/50 hover:shadow-xs"
          } space-y-2`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#FEF3C7] text-[#92400E] border border-[#F59E0B]/20 flex items-center justify-center text-xs shrink-0">
                <FaClock />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#92400E]">Pending Review</p>
                <h3 className="text-sm font-bold text-[#0F172A]">Awaiting Admin Decision</h3>
              </div>
            </div>
            <span className="text-lg font-black text-[#92400E]">
              {visibleLeaves.filter(l => (l.status || "").toLowerCase() === "pending").length}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-[#64748B] pt-1">
            <span>Awaiting review and decision by Admin.</span>
            <span className="text-[9px] underline font-semibold shrink-0">Filter List ↓</span>
          </div>
        </button>
      </div>

      {/* 2. APPLY FOR LEAVE FORM (ONLY FOR STAFF / STUDENTS - HIDDEN ON ADMIN PANEL) */}
      {!isAdmin && (
        <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm space-y-5">
          <div className="border-b border-[#E2E8F0] pb-3">
            <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <FaCalendarPlus className="text-[#2563EB]" />
              <span>Apply for Leave Request</span>
            </h2>
            <p className="text-xs text-[#64748B]">Fill in the leave application details for approval.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] uppercase mb-1">Applicant Name *</label>
                <input
                  ref={formFirstInputRef}
                  type="text"
                  name="applicantName"
                  value={form.applicantName}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter your full name"
                  className="w-full rounded-xl border border-[#E2E8F0] px-3.5 py-2.5 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-medium bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0F172A] uppercase mb-1">Leave Type *</label>
                <select
                  name="type"
                  value={form.type}
                  onChange={handleInputChange}
                  required
                  className="w-full rounded-xl border border-[#E2E8F0] px-3.5 py-2.5 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-medium bg-white"
                >
                  <option value="Emergency Leave">Emergency Leave</option>
                  <option value="Sick Leave">Sick Leave</option>
                  <option value="Annual Leave">Annual Leave</option>
                  <option value="Casual Leave">Casual Leave</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] uppercase mb-1">Start Date *</label>
                <input
                  type="date"
                  name="startDate"
                  value={form.startDate}
                  onChange={handleInputChange}
                  required
                  className="w-full rounded-xl border border-[#E2E8F0] px-3.5 py-2.5 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-medium bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] uppercase mb-1">End Date *</label>
                <input
                  type="date"
                  name="endDate"
                  value={form.endDate}
                  onChange={handleInputChange}
                  required
                  className="w-full rounded-xl border border-[#E2E8F0] px-3.5 py-2.5 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-medium bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0F172A] uppercase mb-1">Reason & Details *</label>
              <textarea
                name="reason"
                value={form.reason}
                onChange={handleInputChange}
                required
                rows={3}
                placeholder="State the detailed reason for your leave request..."
                className="w-full rounded-xl border border-[#E2E8F0] px-3.5 py-2.5 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-medium bg-white min-h-[100px] resize-y"
              />
            </div>

            {/* Right-Aligned Prominent Primary CTA Button */}
            <div className="flex justify-end pt-2 border-t border-[#E2E8F0]">
              <button
                type="submit"
                className="w-full sm:w-auto bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold px-6 py-3 rounded-xl text-xs transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Submit Leave Request</span>
                <FaArrowRight className="text-xs" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. LEAVE APPLICATIONS TABLE & MODERN EMPTY STATE */}
      <div id="leave-applications-table" className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm space-y-4 scroll-mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
          <div>
            <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <FaFileAlt className="text-[#2563EB]" />
              <span>Leave Applications & Approval Status</span>
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">Filter by status or search employee names to manage applications.</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleCardClick("all")}
              className={`text-xs font-semibold px-3.5 py-1.5 rounded-full border transition-all cursor-pointer ${
                statusFilter === "all"
                  ? "bg-[#2563EB] text-white border-[#2563EB] shadow-xs"
                  : "bg-[#EFF6FF] text-[#2563EB] border-[#2563EB]/20 hover:bg-[#2563EB] hover:text-white"
              }`}
              title="Click to reset status filter and view all requests"
            >
              Total Requests: {visibleLeaves.length}
            </button>
          </div>
        </div>

        {/* STATUS FILTER CHIPS & SEARCH BAR */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0]">
          {/* Status Filter Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mr-1">Filter Status:</span>
            {[
              { id: "all", label: "All Status" },
              { id: "approved", label: "Approved 🟢" },
              { id: "rejected", label: "Rejected 🔴" },
              { id: "pending", label: "Pending 🟠" },
            ].map(tab => (
              <button
                key={`tab-${tab.id}`}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`text-xs font-bold px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  statusFilter === tab.id
                    ? "bg-[#2563EB] text-white shadow-xs"
                    : "bg-white text-[#64748B] hover:text-[#0F172A] border border-[#E2E8F0]"
                }`}
              >
                {tab.label}
              </button>
            ))}

            {statusFilter !== "all" && (
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className="text-[11px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer border border-rose-200 ml-1"
              >
                ✕ Clear Filter ({statusFilter})
              </button>
            )}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <FaSearch className="absolute left-3 top-2.5 text-[#64748B] text-xs" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search applicant name / reason..."
              className="w-full bg-white border border-[#E2E8F0] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-medium"
            />
          </div>
        </div>

        {filteredLeaves.length === 0 ? (
          /* MODERN CENTERED EMPTY STATE CARD */
          <div className="py-12 px-4 text-center flex flex-col items-center justify-center space-y-3 bg-[#F8FAFC] rounded-xl border border-dashed border-[#E2E8F0]">
            <div className="w-12 h-12 rounded-full bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center text-xl border border-[#2563EB]/20">
              <FaCalendarCheck />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#0F172A]">No Leave Requests Found</h3>
              <p className="text-xs text-[#64748B] mt-0.5 max-w-sm">
                {statusFilter !== "all"
                  ? `No leave records matching status "${statusFilter.toUpperCase()}".`
                  : "You're all caught up! Submitted leave requests will appear here once they are created."}
              </p>
            </div>
            {statusFilter !== "all" && (
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className="mt-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors cursor-pointer"
              >
                Show All {visibleLeaves.length} Requests
              </button>
            )}
            {!isAdmin && statusFilter === "all" && (
              <button
                type="button"
                onClick={focusForm}
                className="mt-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <FaCalendarPlus className="text-xs" />
                <span>Apply for Leave</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#F8FAFC] text-[#64748B] font-semibold uppercase text-[10px] tracking-wider border-b border-[#E2E8F0]">
                <tr>
                  <th className="py-3 px-4 whitespace-nowrap">Applicant Name</th>
                  <th className="py-3 px-4 whitespace-nowrap">Type & Dates</th>
                  <th className="py-3 px-4 min-w-[200px]">Reason & Details</th>
                  <th className="py-3 px-4 whitespace-nowrap">Approval Status</th>
                  {(role === "admin" || role === "hr" || role === "manager") && (
                    <th className="py-3 px-4 text-right whitespace-nowrap">Admin Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {filteredLeaves.map((l, idx) => (
                  <tr key={`leave-row-${l.id || 'rec'}-${idx}`} className="hover:bg-[#F8FAFC] transition-colors align-middle">
                    <td className="py-3.5 px-4 font-semibold text-[#0F172A] whitespace-nowrap">
                      {l.employee_name || "Staff / Student"}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <p className="font-bold text-[#0F172A]">{l.type}</p>
                      <p className="text-[11px] text-[#64748B] font-mono">{l.start_date} to {l.end_date}</p>
                    </td>

                    <td className="py-3.5 px-4 text-[#64748B] text-xs">
                      {l.reason}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <StatusBadge status={l.status} />
                    </td>

                    {(role === "admin" || role === "hr" || role === "manager") && (
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleApprove(l.id)}
                            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
                          >
                            <FaCheck /> Approve (No Cut)
                          </button>

                          <button
                            type="button"
                            onClick={() => handleReject(l.id)}
                            className="bg-white hover:bg-rose-50 text-rose-600 border border-[#E2E8F0] hover:border-rose-200 font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <FaTimes /> Reject (Salary Cut)
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteLeave(l.id)}
                            title="Delete Leave Application"
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <FaTrashAlt className="text-xs" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onClose={() => setModal({ ...modal, isOpen: false })}
      />
    </div>
  );
}

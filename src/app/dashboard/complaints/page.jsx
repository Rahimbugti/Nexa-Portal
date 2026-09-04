"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Modal from "@/components/Modal";
import { showToast } from "@/components/Toast";
import {
  FaExclamationTriangle,
  FaPlusCircle,
  FaWifi,
  FaUserShield,
  FaChalkboardTeacher,
  FaBug,
  FaClock,
  FaSpinner,
  FaCheckCircle,
  FaTrashAlt,
  FaFilter,
  FaCommentDots,
  FaEllipsisV,
  FaTicketAlt,
  FaSearch,
  FaLock,
  FaUserSecret,
  FaUser
} from "react-icons/fa";

import { dbFetch, dbSaveList } from "@/lib/dbPersistence";

export default function ComplaintsPage() {
  const [role, setRole] = useState("student");
  const [userEmail, setUserEmail] = useState("");
  const initialComplaints = [];
  const [complaints, setComplaints] = useState([]);

  const [filterCategory, setFilterCategory] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");

  // New Complaint Form Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState({ title: "", description: "" });

  // Delete Safeguard Modal State
  const [activeKebabId, setActiveKebabId] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, record: null, loading: false });
  const [adminNoteModal, setAdminNoteModal] = useState({ isOpen: false, ticket: null, note: "" });
  const [seenTicketIds, setSeenTicketIds] = useState([]);

  // Modal Notification
  const [modal, setModal] = useState({ isOpen: false, title: "", message: "", type: "info" });

  const showAlert = (title, message, type = "info") => {
    setModal({ isOpen: true, title, message, type });
  };

  const closeModal = () => {
    setModal({ ...modal, isOpen: false });
  };

  useEffect(() => {
    const savedRole = localStorage.getItem("user_role") || "student";
    const savedEmail = localStorage.getItem("current_user_email") || "";
    setRole(savedRole);
    setUserEmail(savedEmail);

    try {
      const savedSeen = JSON.parse(localStorage.getItem("software_house_seen_tickets") || "[]");
      setSeenTicketIds(savedSeen);
    } catch(e) {}

    dbFetch("complaints", []).then(data => {
      // Filter out any stale demo complaints (comp-101, comp-102, comp-103)
      const cleanData = (data || []).filter(c =>
        c &&
        !c.title?.includes("Optix Fiber") &&
        !c.title?.includes("Overtime calculation query") &&
        !c.title?.includes("Request for extra lab session") &&
        c.id !== "comp-101" &&
        c.id !== "comp-102" &&
        c.id !== "comp-103"
      );
      setComplaints(cleanData);
      dbSaveList("complaints", cleanData);
    });
  }, []);

  const saveComplaintsState = (newList) => {
    setComplaints(newList);
    dbSaveList("complaints", newList);
  };

  const [form, setForm] = useState({
    category: "Internet Issues",
    title: "",
    description: "",
    is_anonymous: false,
    attachment: null,
  });

  // Strict Validation Engine (Requirement #4)
  const validateForm = () => {
    const errors = { title: "", description: "" };
    let isValid = true;

    const trimmedTitle = form.title.trim();
    const trimmedDesc = form.description.trim();

    if (!trimmedTitle || trimmedTitle.length < 10) {
      errors.title = "Title must contain at least 10 meaningful characters.";
      isValid = false;
    } else if (trimmedTitle.length > 100) {
      errors.title = "Title must not exceed 100 characters.";
      isValid = false;
    }

    if (!trimmedDesc || trimmedDesc.length < 20) {
      errors.description = "Description must contain at least 20 meaningful characters.";
      isValid = false;
    } else if (trimmedDesc.length > 1000) {
      errors.description = "Description must not exceed 1000 characters.";
      isValid = false;
    }

    setValidationErrors(errors);
    return isValid;
  };

  const handleCreateComplaint = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      showToast("Validation Failed ⚠️", "Please resolve inline title and description length errors.", "warning");
      return;
    }

    const ticketId = `TICKET-${Math.floor(100000 + Math.random() * 900000)}`;
    const nowIso = new Date().toISOString();
    const nowLocal = new Date().toLocaleString();

    const isAdminUser = role === "admin" || role === "hr" || role === "manager";
    const newObj = {
      id: "comp-" + Date.now(),
      ticket_id: ticketId,
      is_anonymous: form.is_anonymous,
      submitted_by: form.is_anonymous ? "Anonymous Complainant 🔒" : (userEmail ? `${userEmail.split("@")[0]} (${role.toUpperCase()})` : `User (${role})`),
      email: form.is_anonymous ? "Confidential 🔒" : (userEmail || "user@gmail.com"),
      category: form.category,
      title: form.title.trim(),
      description: form.description.trim(),
      attachment_name: form.attachment ? form.attachment.name : null,
      status: "Pending",
      created_at: nowLocal,
      created_by_role: role,
      is_admin_notice: isAdminUser,
      admin_note: isAdminUser ? "📢 Official Admin Notice / Announcement Broadcast" : "Complaint ticket generated successfully. Awaiting HR/Admin assignment.",
    };

    const updated = [newObj, ...complaints];
    saveComplaintsState(updated);

    try {
      const res = await fetch("/api/persistence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "complaints", record: newObj, action: "save" })
      });
      const json = await res.json();
      if (json.error) {
        console.error("Complaints DB persistence error:", json.error);
        showToast("Database Notice ⚠️", `Ticket saved locally! DB note: ${json.error}`, "warning");
      }
    } catch (dbErr) {
      console.error("Failed to post complaint to /api/persistence:", dbErr);
    }

    setIsModalOpen(false);
    setForm({ category: "Internet Issues", title: "", description: "", is_anonymous: false, attachment: null });
    setValidationErrors({ title: "", description: "" });

    showToast(`Ticket Generated (${ticketId}) 📩`, isAdminUser ? "Broadcast notice posted to all user dashboards." : "Your complaint ticket has been submitted to Admin.", "success");
  };

  const handleMarkAsSeen = (ticketIdKey) => {
    if (!ticketIdKey) return;
    const updatedSeen = [...seenTicketIds, ticketIdKey];
    setSeenTicketIds(updatedSeen);
    try {
      localStorage.setItem("software_house_seen_tickets", JSON.stringify(updatedSeen));
    } catch(e) {}
    showToast("Notice Seen 👁️", "Broadcast notice acknowledged and dismissed.", "info");
  };

  const handleUpdateStatus = (id, newStatus) => {
    const updated = complaints.map((c) =>
      c.id === id ? { ...c, status: newStatus } : c
    );
    saveComplaintsState(updated);
    showToast("Status Updated 🔄", `Ticket status changed to ${newStatus}.`, "info");
  };

  const handleSaveAdminNote = (e) => {
    e.preventDefault();
    if (!adminNoteModal.ticket) return;
    const updated = complaints.map((c) =>
      c.id === adminNoteModal.ticket.id ? { ...c, admin_note: adminNoteModal.note } : c
    );
    saveComplaintsState(updated);
    setAdminNoteModal({ isOpen: false, ticket: null, note: "" });
    showToast("Resolution Note Saved 📝", "Admin response updated for complaint ticket.", "success");
  };

  const executeDeleteRecord = async () => {
    if (!deleteModal.record) return;
    setDeleteModal(prev => ({ ...prev, loading: true }));
    const id = deleteModal.record.id;

    try {
      const updated = complaints.filter((c) => c.id !== id);
      saveComplaintsState(updated);
      showToast("Ticket Deleted 🗑️", "Complaint ticket record purged successfully.", "info");
    } catch(e) {
      showToast("Error", "Failed to delete complaint ticket.", "error");
    } finally {
      setDeleteModal({ isOpen: false, record: null, loading: false });
    }
  };

  const filteredComplaints = complaints.filter((c) => {
    const matchesCategory = filterCategory === "All" || c.category === filterCategory;
    const matchesStatus = filterStatus === "All" || c.status === filterStatus;

    const ticketIdKey = c.id || c.ticket_id;
    const isSeenByUser = seenTicketIds.includes(ticketIdKey);
    const isAdminNotice = c.is_admin_notice || c.created_by_role === "admin" || c.created_by_role === "hr" || c.created_by_role === "manager";
    const isAdminUser = role === "admin" || role === "hr" || role === "manager";

    // 1. Admin Broadcast Notice: Visible to all, but automatically disappears for user once marked as "Seen"!
    if (isAdminNotice) {
      if (!isAdminUser && isSeenByUser) {
        return false; // Auto-disappears for user after seen!
      }
      return matchesCategory && matchesStatus;
    }

    // 2. Student / Employee Complaint Privacy: Visible ONLY to Admin and the creator student/employee!
    const cleanUserEmail = (userEmail || "").toLowerCase().trim();
    const cleanTicketEmail = (c.email || "").toLowerCase().trim();
    const isOwner = cleanTicketEmail && cleanTicketEmail === cleanUserEmail;

    const matchesUser = isAdminUser || isOwner;
    return matchesCategory && matchesStatus && matchesUser;
  });

  const getCategoryIcon = (category) => {
    switch (category) {
      case "Internet Issues": return <FaWifi className="text-[#2563EB]" />;
      case "HR Complaints": return <FaUserShield className="text-[#2563EB]" />;
      case "Teacher Complaints": return <FaChalkboardTeacher className="text-[#2563EB]" />;
      case "System Bugs": return <FaBug className="text-[#2563EB]" />;
      default: return <FaExclamationTriangle className="text-[#64748B]" />;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "Pending":
        return (
          <span className="bg-[#FEF3C7] text-[#92400E] border border-[#F59E0B]/20 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap">
            <FaClock className="text-xs text-[#92400E]" />
            <span>Pending Review</span>
          </span>
        );
      case "In Progress":
        return (
          <span className="bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB]/20 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap">
            <FaSpinner className="text-xs text-[#2563EB] animate-spin" />
            <span>In Progress</span>
          </span>
        );
      case "Resolved":
        return (
          <span className="bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB]/20 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap">
            <FaCheckCircle className="text-xs text-[#2563EB]" />
            <span>Resolved</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 w-full">
      {/* Modal */}
      <Modal isOpen={modal.isOpen} title={modal.title} message={modal.message} type={modal.type} onClose={closeModal} />

      {/* 1. STANDARDIZED BLUE & WHITE HEADER BANNER (Requirement #1) */}
      <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] bg-[#EFF6FF] px-2.5 py-1 rounded-full border border-[#2563EB]/20">
              Official Helpdesk System
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-[#0F172A] mt-1.5 flex items-center gap-2.5 whitespace-nowrap">
            <FaTicketAlt className="text-[#2563EB] shrink-0" />
            <span className="whitespace-nowrap font-bold text-[#0F172A]">Complaint & Feedback Portal</span>
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Report Internet Issues, HR Queries, Instructor Feedback & PC Bugs with real-time ticket tracking.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer shrink-0"
        >
          <FaPlusCircle className="text-sm" />
          <span>+ Submit New Complaint Ticket</span>
        </button>
      </div>

      {/* FILTER & CATEGORY CONTROLS */}
      <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-[#64748B] uppercase text-[10px] flex items-center gap-1">
            <FaFilter /> Category:
          </span>
          {["All", "Internet Issues", "HR Complaints", "Teacher Complaints", "System Bugs"].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-xl font-semibold transition-colors border ${
                filterCategory === cat
                  ? "bg-[#2563EB] text-white border-[#2563EB] shadow-xs"
                  : "bg-white text-[#64748B] border-[#E2E8F0] hover:bg-[#F8FAFC]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-[#64748B] uppercase text-[10px]">Status:</span>
          {["All", "Pending", "In Progress", "Resolved"].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1 rounded-xl font-semibold transition-colors border text-xs ${
                filterStatus === st
                  ? "bg-[#2563EB] text-white border-[#2563EB] shadow-xs"
                  : "bg-white text-[#64748B] border-[#E2E8F0] hover:bg-[#F8FAFC]"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* COMPLAINTS CARDS LIST */}
      <div className="space-y-4">
        {filteredComplaints.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-2xl border border-[#E2E8F0] text-[#64748B] italic text-xs">
            No complaint tickets matching selected filter criteria.
          </div>
        ) : (
          filteredComplaints.map((c, idx) => (
            <div key={`comp-card-${c.id || idx}`} className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-[#EFF6FF] rounded-xl text-base border border-[#2563EB]/20 shrink-0">
                    {getCategoryIcon(c.category)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB]/20 whitespace-nowrap">
                        {c.category}
                      </span>
                      <span className="text-[10px] font-mono text-[#64748B]">{c.ticket_id || c.id}</span>
                    </div>
                    <h3 className="font-bold text-[#0F172A] text-base mt-1">{c.title}</h3>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {getStatusBadge(c.status)}

                  {/* Single Dropdown Selector for Status (Requirement #2) */}
                  {(role === "admin" || role === "hr" || role === "manager") && (
                    <select
                      value={c.status}
                      onChange={(e) => handleUpdateStatus(c.id, e.target.value)}
                      className="bg-white text-[#0F172A] border border-[#E2E8F0] rounded-xl px-2.5 py-1 text-xs font-semibold outline-none focus:border-[#2563EB] cursor-pointer"
                    >
                      <option value="Pending">Pending</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Resolved">Resolved</option>
                    </select>
                  )}

                  {/* Kebab (⋮) Context Menu for Delete (Requirement #3) */}
                  {(role === "admin" || role === "hr" || role === "manager") && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setActiveKebabId(activeKebabId === c.id ? null : c.id)}
                        className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                      >
                        <FaEllipsisV className="text-xs" />
                      </button>

                      {activeKebabId === c.id && (
                        <div className={`absolute right-0 w-44 rounded-xl bg-white p-1.5 shadow-xl border border-[#E2E8F0] z-50 space-y-0.5 text-xs text-left animate-in fade-in zoom-in-95 duration-100 ${
                          idx >= Math.max(0, filteredComplaints.length - 2)
                            ? "bottom-full mb-1 origin-bottom-right"
                            : "top-full mt-1 origin-top-right"
                        }`}>
                          <button
                            type="button"
                            onClick={() => {
                              showToast("Ticket History 📋", `Ticket created on ${c.created_at}. Submitted by ${c.submitted_by}.`, "info");
                              setActiveKebabId(null);
                            }}
                            className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-[#EFF6FF] text-[#0F172A] hover:text-[#2563EB] font-semibold transition-colors"
                          >
                            View Ticket History
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteModal({ isOpen: true, record: c, loading: false });
                              setActiveKebabId(null);
                            }}
                            className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-rose-50 text-rose-600 font-semibold transition-colors"
                          >
                            Delete Ticket
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <p className="text-xs text-[#0F172A] leading-relaxed bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0]">
                {c.description}
              </p>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs pt-1">
                <div className="text-[11px] text-[#64748B] space-x-2">
                  <span><strong>Submitted By:</strong> {c.submitted_by}</span>
                  <span>•</span>
                  <span><strong>Email:</strong> {c.email}</span>
                  <span>•</span>
                  <span>{c.created_at}</span>
                </div>
              </div>

              {(role === "admin" || role === "hr" || role === "manager") && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-500">Update Status:</span>
                    <select
                      value={c.status || "Pending"}
                      onChange={(e) => handleUpdateStatus(c.id, e.target.value)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-900 bg-white outline-none focus:border-blue-600"
                    >
                      <option value="Pending">⏳ Pending Review</option>
                      <option value="In Investigation">🔍 In Investigation</option>
                      <option value="Resolved">✔️ Resolved</option>
                      <option value="Closed">✖️ Closed</option>
                    </select>
                  </div>

                  <button
                    onClick={() => setAdminNoteModal({ isOpen: true, ticket: c, note: c.admin_note || "" })}
                    className="px-3 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold border border-blue-200 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <FaCommentDots /> {c.admin_note ? "Edit Resolution Note" : "+ Add Admin Note"}
                  </button>
                </div>
              )}

              {/* Non-Admin User "Mark as Seen & Dismiss" button for Admin Notices */}
              {(role !== "admin" && role !== "hr" && role !== "manager") && (c.is_admin_notice || c.created_by_role === "admin" || c.created_by_role === "hr" || c.created_by_role === "manager") && (
                <div className="flex items-center justify-end pt-2 border-t border-slate-100">
                  <button
                    onClick={() => handleMarkAsSeen(c.id || c.ticket_id)}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-extrabold text-xs border border-emerald-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <FaCheckCircle className="text-emerald-600" />
                    <span>Mark as Seen & Dismiss ✔️</span>
                  </button>
                </div>
              )}

              {c.admin_note && (
                <div className="p-3 bg-[#EFF6FF] border border-[#2563EB]/20 rounded-xl text-xs space-y-0.5">
                  <span className="font-bold text-[#2563EB] flex items-center gap-1.5">
                    <FaCommentDots className="text-[#2563EB]" />
                    <span>Admin Resolution Note:</span>
                  </span>
                  <p className="text-[#0F172A] text-[11px]">{c.admin_note}</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* NEW COMPLAINT TICKET MODAL WITH STRICT VALIDATION (Requirement #4) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E2E8F0] space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="font-bold text-[#0F172A] text-base flex items-center gap-2">
                <FaTicketAlt className="text-[#2563EB]" />
                <span>Submit Complaint Ticket</span>
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-[#64748B] hover:text-[#0F172A] text-lg font-bold">✕</button>
            </div>

            <form onSubmit={handleCreateComplaint} className="space-y-4 text-xs">
              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Complaint Category *
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-xl border border-[#E2E8F0] px-3.5 py-2.5 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-medium bg-white"
                >
                  <option value="Internet Issues">📡 Internet & WiFi Issues</option>
                  <option value="HR Complaints">🧑‍💼 HR & Salary Queries</option>
                  <option value="Teacher Complaints">👨‍🏫 Instructor & Lab Feedback</option>
                  <option value="System Bugs">🐛 PC & Software Bugs</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Ticket Subject / Title * (Min 10 chars)
                </label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => {
                    setForm({ ...form, title: e.target.value });
                    if (validationErrors.title) setValidationErrors(prev => ({ ...prev, title: "" }));
                  }}
                  placeholder="e.g. WiFi latency spike in Lab #3 Station 12"
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-xs text-[#0F172A] outline-none font-medium bg-white ${
                    validationErrors.title ? "border-rose-500" : "border-[#E2E8F0] focus:border-[#2563EB]"
                  }`}
                />
                {validationErrors.title && (
                  <p className="text-[11px] text-rose-600 font-semibold mt-1">{validationErrors.title}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Detailed Description * (Min 20 chars)
                </label>
                <textarea
                  rows={4}
                  required
                  value={form.description}
                  onChange={(e) => {
                    setForm({ ...form, description: e.target.value });
                    if (validationErrors.description) setValidationErrors(prev => ({ ...prev, description: "" }));
                  }}
                  placeholder="Provide detailed description of your issue..."
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-xs text-[#0F172A] outline-none font-medium bg-white min-h-[100px] resize-y ${
                    validationErrors.description ? "border-rose-500" : "border-[#E2E8F0] focus:border-[#2563EB]"
                  }`}
                />
                {validationErrors.description && (
                  <p className="text-[11px] text-rose-600 font-semibold mt-1">{validationErrors.description}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Submission Privacy Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, is_anonymous: false })}
                    className={`px-3 py-2 rounded-xl font-semibold border text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      !form.is_anonymous
                        ? "bg-[#EFF6FF] text-[#2563EB] border-[#2563EB]/20 font-bold"
                        : "bg-white text-[#64748B] border-[#E2E8F0]"
                    }`}
                  >
                    <FaUser className="text-xs" />
                    <span>Public Ticket</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setForm({ ...form, is_anonymous: true })}
                    className={`px-3 py-2 rounded-xl font-semibold border text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      form.is_anonymous
                        ? "bg-[#EFF6FF] text-[#2563EB] border-[#2563EB]/20 font-bold"
                        : "bg-white text-[#64748B] border-[#E2E8F0]"
                    }`}
                  >
                    <FaUserSecret className="text-xs" />
                    <span>Anonymous (Secret)</span>
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold py-3 rounded-xl transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-2 text-xs"
                >
                  <FaTicketAlt />
                  <span>Submit Ticket & Track Status</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMATION DESTRUCTIVE MODAL FOR DELETE (Requirement #3) */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E2E8F0] space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 border-b border-[#E2E8F0] pb-3 text-[#0F172A]">
              <FaExclamationTriangle className="text-xl text-[#2563EB]" />
              <h3 className="font-bold text-[#0F172A] text-base">Delete Complaint Ticket</h3>
            </div>

            <p className="text-xs text-[#64748B] leading-relaxed">
              Are you sure you want to delete this complaint ticket? This action cannot be undone.
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

      {/* ADMIN RESOLUTION NOTE MODAL */}
      {adminNoteModal.isOpen && adminNoteModal.ticket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-[#E2E8F0] space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="font-bold text-[#0F172A] text-base flex items-center gap-2">
                <FaCommentDots className="text-[#2563EB]" />
                <span>Admin Resolution Note</span>
              </h3>
              <button onClick={() => setAdminNoteModal({ isOpen: false, ticket: null, note: "" })} className="text-[#64748B] text-lg font-bold">✕</button>
            </div>

            <form onSubmit={handleSaveAdminNote} className="space-y-4 text-xs">
              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Official Resolution / Investigation Response *
                </label>
                <textarea
                  rows="4"
                  required
                  value={adminNoteModal.note}
                  onChange={(e) => setAdminNoteModal({ ...adminNoteModal, note: e.target.value })}
                  placeholder="Enter official resolution details or investigation update for the applicant..."
                  className="w-full rounded-xl border border-[#E2E8F0] p-3 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] bg-white font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setAdminNoteModal({ isOpen: false, ticket: null, note: "" })}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] font-semibold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs cursor-pointer shadow-xs"
                >
                  Save Resolution Response
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

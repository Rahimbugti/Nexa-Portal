"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Modal from "@/components/Modal";
import { showToast } from "@/components/Toast";
import {
  FaBullhorn,
  FaPlusCircle,
  FaCalendarTimes,
  FaVideo,
  FaShieldAlt,
  FaBell,
  FaTrash,
  FaClock,
  FaUserShield,
  FaCheckCircle,
  FaInfoCircle,
  FaEllipsisV,
  FaExclamationTriangle
} from "react-icons/fa";

import { dbFetch, dbSaveList } from "@/lib/dbPersistence";

export default function AnnouncementsPage() {
  const [role, setRole] = useState("admin");
  const [userEmail, setUserEmail] = useState("");
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  // Kebab Context Menu State
  const [activeKebabId, setActiveKebabId] = useState(null);

  // Delete Safeguard Modal State
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, item: null, loading: false });

  // Create Announcement Modal State (Admin Only)
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState({ title: "", content: "" });

  // Custom Modal
  const [modal, setModal] = useState({ isOpen: false, title: "", message: "", type: "info" });

  const showAlert = (title, message, type = "info") => {
    setModal({ isOpen: true, title, message, type });
  };

  const closeModal = () => {
    setModal({ ...modal, isOpen: false });
  };

  useEffect(() => {
    const savedRole = localStorage.getItem("user_role") || "admin";
    const savedEmail = localStorage.getItem("current_user_email") || "";
    setRole(savedRole);
    setUserEmail(savedEmail);

    dbFetch("announcements", [], true).then(data => {
      const todayStr = new Date().toISOString().split("T")[0];
      const validUnexpired = (data || []).filter((a) => {
        if (!a.expiry_date) return true;
        return a.expiry_date >= todayStr;
      });
      setAnnouncements(validUnexpired);
      setLoading(false);
    });
  }, []);

  const saveAnnouncementsState = (newList) => {
    setAnnouncements(newList);
    dbSaveList("announcements", newList);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("storage"));
    }
  };

  const [form, setForm] = useState({
    title: "",
    category: "Tomorrow Holiday",
    priority: "Urgent",
    target_audience: "All Users",
    start_date: new Date().toISOString().split("T")[0],
    expiry_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    content: "",
    broadcastNotification: true,
  });

  // Strict Validation Rules (Requirement #2)
  const validateForm = () => {
    const errors = { title: "", content: "" };
    let isValid = true;

    const trimmedTitle = form.title.trim();
    const trimmedContent = form.content.trim();

    if (!trimmedTitle || trimmedTitle.length < 10) {
      errors.title = "Announcement title must contain at least 10 meaningful characters.";
      isValid = false;
    } else if (trimmedTitle.length > 150) {
      errors.title = "Announcement title must not exceed 150 characters.";
      isValid = false;
    }

    if (!trimmedContent || trimmedContent.length < 20) {
      errors.content = "Announcement description must contain at least 20 meaningful characters.";
      isValid = false;
    } else if (trimmedContent.length > 2000) {
      errors.content = "Announcement description must not exceed 2000 characters.";
      isValid = false;
    }

    setValidationErrors(errors);
    return isValid;
  };

  const handleCreateAnnouncement = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      showToast("Validation Failed ⚠️", "Please resolve title and description length errors.", "warning");
      return;
    }

    const now = new Date();
    const nowIso = now.toISOString();

    const newObj = {
      id: "ann-" + Date.now(),
      title: form.title.trim(),
      category: form.category,
      priority: form.priority,
      target_audience: form.target_audience,
      start_date: form.start_date,
      expiry_date: form.expiry_date,
      postedBy: userEmail ? `${userEmail.split("@")[0]} (Admin)` : "Admin Officer",
      date: now.toISOString().split("T")[0],
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdTimestampMs: now.getTime(),
      content: form.content.trim(),
      broadcastNotification: form.broadcastNotification,
    };

    const updated = [newObj, ...announcements];
    saveAnnouncementsState(updated);

    try {
      await supabase.from("announcements").insert([
        {
          title: form.title.trim(),
          category: form.category,
          priority: form.priority,
          target_audience: form.target_audience,
          content: form.content.trim(),
          start_date: form.start_date,
          expiry_date: form.expiry_date,
          created_at: nowIso
        }
      ]);
    } catch (dbErr) { }

    setCreateModalOpen(false);
    setForm({
      title: "",
      category: "Tomorrow Holiday",
      priority: "Urgent",
      target_audience: "All Users",
      start_date: new Date().toISOString().split("T")[0],
      expiry_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      content: "",
      broadcastNotification: true,
    });
    setValidationErrors({ title: "", content: "" });

    showToast("Announcement Published 📢", `Published broadcast to ${form.target_audience}.`, "success");
  };

  const executeDeleteAnnouncement = async () => {
    if (!deleteModal.item) return;
    setDeleteModal(prev => ({ ...prev, loading: true }));
    const id = deleteModal.item.id;

    try {
      const updated = announcements.filter((a) => a.id !== id);
      saveAnnouncementsState(updated);
      showToast("Announcement Deleted 🗑️", "Broadcast record removed successfully.", "info");
    } catch (e) {
      showToast("Error", "Failed to delete announcement.", "error");
    } finally {
      setDeleteModal({ isOpen: false, item: null, loading: false });
    }
  };

  const getCategoryBadge = (cat) => {
    switch (cat) {
      case "Tomorrow Holiday":
        return (
          <span className="bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB]/20 font-semibold px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5 whitespace-nowrap">
            <FaCalendarTimes className="text-[#2563EB]" />
            <span>Tomorrow Holiday</span>
          </span>
        );
      case "Office Meeting":
        return (
          <span className="bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB]/20 font-semibold px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5 whitespace-nowrap">
            <FaVideo className="text-[#2563EB]" />
            <span>Office Meeting</span>
          </span>
        );
      case "New Policy":
        return (
          <span className="bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB]/20 font-semibold px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5 whitespace-nowrap">
            <FaShieldAlt className="text-[#2563EB]" />
            <span>New Policy</span>
          </span>
        );
      default:
        return (
          <span className="bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB]/20 font-semibold px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5 whitespace-nowrap">
            <FaBullhorn className="text-[#2563EB]" />
            <span>Announcement</span>
          </span>
        );
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
              Official Company Broadcast
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-[#0F172A] mt-1.5 flex items-center gap-2.5">
            <FaBullhorn className="text-[#2563EB]" />
            <span>Announcement Board</span>
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Official Broadcasts: Tomorrow Holiday Alerts • Office Meeting Notices • New Company Policies
          </p>
        </div>

        {(role === "admin" || role === "hr" || role === "manager") && (
          <button
            onClick={() => setCreateModalOpen(true)}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <FaPlusCircle className="text-sm" />
            <span>+ Post Official Announcement</span>
          </button>
        )}
      </div>

      {/* ANNOUNCEMENTS FEED (Requirement #4 - Modern Spacing & Hierarchy) */}
      <div className="space-y-4">
        {announcements.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-2xl border border-[#E2E8F0] text-[#64748B] italic text-xs">
            No active announcements found.
          </div>
        ) : (
          announcements.map((a) => (
            <div key={a.id} className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-sm space-y-3 text-xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  {getCategoryBadge(a.category)}
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB]/20">
                    {a.priority || "Normal"} Priority
                  </span>
                  <h3 className="font-bold text-[#0F172A] text-base">{a.title}</h3>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] text-[#64748B] font-semibold flex items-center gap-1">
                    <FaClock className="text-[#64748B]" /> {a.date} at {a.time}
                  </span>

                  {/* Kebab Context Menu for Delete (Requirement #3) */}
                  {(role === "admin" || role === "hr" || role === "manager") && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setActiveKebabId(activeKebabId === a.id ? null : a.id)}
                        className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                      >
                        <FaEllipsisV className="text-xs" />
                      </button>

                      {activeKebabId === a.id && (
                        <div className="absolute right-0 mt-1 w-44 rounded-xl bg-white p-1.5 shadow-2xl border border-[#E2E8F0] z-50 space-y-0.5 text-xs text-left animate-in fade-in zoom-in-95 duration-100">
                          <button
                            type="button"
                            onClick={() => {
                              showToast("Announcement Details 📢", `Target Audience: ${a.target_audience || a.target_type || "All Users"}. Posted by: ${a.posted_by || a.postedBy || a.author || "System Admin / Management"}.`, "info");
                              setActiveKebabId(null);
                            }}
                            className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-[#EFF6FF] text-[#0F172A] hover:text-[#2563EB] font-semibold transition-colors"
                          >
                            View Details
                          </button>
                          <div className="border-t border-[#E2E8F0] my-1" />
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteModal({ isOpen: true, item: a, loading: false });
                              setActiveKebabId(null);
                            }}
                            className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-rose-50 text-rose-600 font-semibold transition-colors"
                          >
                            Delete Announcement
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <p className="text-xs text-[#0F172A] leading-relaxed bg-[#F8FAFC] p-4 rounded-xl border border-[#E2E8F0]">
                {a.content}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#64748B] pt-1">
                <span><strong>Posted By:</strong> {a.posted_by || a.postedBy || a.author || "System Admin / Management"}</span>
                <span className="text-[#2563EB] font-semibold bg-[#EFF6FF] px-2.5 py-0.5 rounded-full border border-[#2563EB]/20 flex items-center gap-1">
                  <FaCheckCircle className="text-[#2563EB]" /> Target: {a.target_audience || a.target_type || "All Users"}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* CREATE ANNOUNCEMENT MODAL WITH STRICT VALIDATION (Requirement #2) */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 border border-[#E2E8F0] text-left animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="font-bold text-[#0F172A] text-base flex items-center gap-2">
                <FaBullhorn className="text-[#2563EB]" />
                <span>Post Official Announcement</span>
              </h3>
              <button onClick={() => setIsModalOpen ? setIsModalOpen(false) : setCreateModalOpen(false)} className="text-[#64748B] hover:text-[#0F172A] text-lg font-bold">✕</button>
            </div>

            <form onSubmit={handleCreateAnnouncement} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Category *
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-xl border border-[#E2E8F0] px-3.5 py-2.5 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] bg-white font-medium"
                >
                  <option value="Tomorrow Holiday">🎉 Tomorrow Holiday Alert</option>
                  <option value="Office Meeting">📹 Office Meeting Notice</option>
                  <option value="New Policy">📜 New Company Policy</option>
                  <option value="General Announcement"> General Announcement</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    Priority *
                  </label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] bg-white"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Important">Important</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    Target Audience *
                  </label>
                  <select
                    value={form.target_audience}
                    onChange={(e) => setForm({ ...form, target_audience: e.target.value })}
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] bg-white"
                  >
                    <option value="All Users">👥 All Users</option>
                    <option value="Employees Only">👔 Employees Only</option>
                    <option value="Students Only">🎓 Students Only</option>
                    <option value="HR Department">🧑‍💼 HR & Management</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Announcement Title * (Min 10 chars)
                </label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => {
                    setForm({ ...form, title: e.target.value });
                    if (validationErrors.title) setValidationErrors(prev => ({ ...prev, title: "" }));
                  }}
                  placeholder="e.g. Tomorrow Official Office Holiday Notice"
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-xs text-[#0F172A] outline-none font-medium bg-white ${validationErrors.title ? "border-rose-500" : "border-[#E2E8F0] focus:border-[#2563EB]"
                    }`}
                />
                {validationErrors.title && (
                  <p className="text-[11px] text-rose-600 font-semibold mt-1">{validationErrors.title}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Announcement Description * (Min 20 chars)
                </label>
                <textarea
                  rows={3}
                  required
                  value={form.content}
                  onChange={(e) => {
                    setForm({ ...form, content: e.target.value });
                    if (validationErrors.content) setValidationErrors(prev => ({ ...prev, content: "" }));
                  }}
                  placeholder="Type complete details for targeted users..."
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-xs text-[#0F172A] outline-none font-medium bg-white min-h-[90px] resize-y ${validationErrors.content ? "border-rose-500" : "border-[#E2E8F0] focus:border-[#2563EB]"
                    }`}
                />
                {validationErrors.content && (
                  <p className="text-[11px] text-rose-600 font-semibold mt-1">{validationErrors.content}</p>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold py-3 rounded-xl transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-2 text-xs"
                >
                  <FaBullhorn />
                  <span>Publish Announcement & Broadcast Alert</span>
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
              <h3 className="font-bold text-[#0F172A] text-base">Delete Announcement?</h3>
            </div>

            <p className="text-xs text-[#64748B] leading-relaxed">
              Are you sure you want to permanently delete this announcement? This action cannot be undone.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModal({ isOpen: false, item: null, loading: false })}
                className="flex-1 py-2.5 rounded-xl bg-white hover:bg-[#F8FAFC] text-[#2563EB] border border-[#E2E8F0] font-semibold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDeleteAnnouncement}
                disabled={deleteModal.loading}
                className="flex-1 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs cursor-pointer flex items-center justify-center"
              >
                {deleteModal.loading ? "Deleting..." : "Confirm & Delete 🗑️"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

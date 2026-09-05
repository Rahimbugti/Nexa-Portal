"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import Modal from "@/components/Modal";
import { showToast } from "@/components/Toast";
import {
  formatFriendlyDateTime,
  format12HourTime,
  formatDateToYYYYMMDD,
  safeExternalUrl
} from "@/lib/recurringTaskUtils";
import {
  FaTasks,
  FaCheckCircle,
  FaClock,
  FaExclamationTriangle,
  FaExternalLinkAlt,
  FaFileAlt,
  FaSearch,
  FaFilter,
  FaSync,
  FaEye,
  FaLink,
  FaUserCheck,
  FaCalendarAlt,
  FaChevronRight,
  FaLayerGroup
} from "react-icons/fa";

export default function AdminRecentSubmissionsWidget({ className = "" }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [todayDate, setTodayDate] = useState(formatDateToYYYYMMDD());

  const [metrics, setMetrics] = useState({
    total: 0,
    submitted: 0,
    pending: 0,
    missed: 0
  });

  const [allInstances, setAllInstances] = useState([]);
  const [selectedSubmissionModal, setSelectedSubmissionModal] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("submitted"); // default to "submitted" for this recent submissions monitor
  const [userFilter, setUserFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  // Fetch all tasks and submissions across all users from Supabase API
  const fetchSubmissionsData = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const res = await fetch("/api/tasks/recurring?isAdmin=true", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setTodayDate(json.todayDate || formatDateToYYYYMMDD());
          setMetrics(json.metrics || { total: 0, submitted: 0, pending: 0, missed: 0 });
          setAllInstances(json.allInstances || []);
        }
      }
    } catch (err) {
      console.error("[AdminRecentSubmissionsWidget] Fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchSubmissionsData();
  }, [fetchSubmissionsData]);

  // Real-time Supabase channel for instant live updates when user submits
  useEffect(() => {
    let channel = null;
    try {
      channel = supabase
        .channel("admin-realtime-task-submissions")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "daily_task_instances"
          },
          () => {
            fetchSubmissionsData(true);
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "task_submissions"
          },
          () => {
            fetchSubmissionsData(true);
          }
        )
        .subscribe();
    } catch (e) {
      console.debug("Supabase realtime notice:", e);
    }

    // Periodic backup sync every 20 seconds
    const interval = setInterval(() => {
      fetchSubmissionsData(true);
    }, 20000);

    return () => {
      if (channel) supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchSubmissionsData]);

  // Extract unique users list for filter dropdown
  const uniqueUsers = useMemo(() => {
    const map = new Map();
    allInstances.forEach((inst) => {
      const email = (inst.user_email || "").toLowerCase().trim();
      if (email && !map.has(email)) {
        map.set(email, {
          email,
          name: inst.user_name || email.split("@")[0]
        });
      }
    });
    return Array.from(map.values());
  }, [allInstances]);

  // Filtered Task Instances
  const filteredSubmissions = useMemo(() => {
    return allInstances.filter((inst) => {
      // Status Filter
      if (statusFilter === "submitted") {
        if (inst.status !== "submitted" && inst.status !== "late_submitted") return false;
      } else if (statusFilter !== "all") {
        if (inst.status !== statusFilter) return false;
      }

      // User Filter
      if (userFilter !== "all" && (inst.user_email || "").toLowerCase().trim() !== userFilter) {
        return false;
      }

      // Date Filter
      if (dateFilter && inst.task_date !== dateFilter) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const userNameMatch = (inst.user_name || "").toLowerCase().includes(q);
        const emailMatch = (inst.user_email || "").toLowerCase().includes(q);
        const titleMatch = (inst.task_title || "").toLowerCase().includes(q);
        const notesMatch = (inst.submission?.notes || inst.submission?.submission_text || "").toLowerCase().includes(q);
        const urlMatch = (inst.submission?.submission_url || "").toLowerCase().includes(q);
        return userNameMatch || emailMatch || titleMatch || notesMatch || urlMatch;
      }

      return true;
    });
  }, [allInstances, statusFilter, userFilter, dateFilter, searchQuery]);

  return (
    <div className={`bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-5 sm:p-6 space-y-5 ${className}`}>
      {/* 1. HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-50 text-blue-600 shadow-2xs">
              <FaTasks className="h-4 w-4" />
            </span>
            <h2 className="text-base font-bold text-[#0F172A] tracking-tight">
              Recent Task Submissions
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Live Supabase Sync
            </span>
          </div>
          <p className="text-xs text-[#64748B] mt-1">
            Real-time deliverables, submitted work URLs, and task notes submitted across all team members.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchSubmissionsData()}
            disabled={refreshing}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
            title="Refresh submissions"
          >
            <FaSync className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-blue-600" : ""}`} />
          </button>

          <Link
            href="/dashboard/tasks"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs"
          >
            <span>Tasks Hub</span>
            <FaChevronRight className="h-2.5 w-2.5" />
          </Link>
        </div>
      </div>

      {/* 2. ADMIN DASHBOARD SUMMARY COUNTS (LIVE SUPABASE COUNTS) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Tasks Today</span>
          <p className="text-xl font-bold font-mono text-slate-900">{metrics.total}</p>
          <span className="text-[10px] text-slate-400">Daily assignments</span>
        </div>

        <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-100 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Submitted</span>
          <p className="text-xl font-bold font-mono text-emerald-700">{metrics.submitted}</p>
          <span className="text-[10px] text-emerald-600 font-medium">
            {metrics.total > 0 ? `${Math.round((metrics.submitted / metrics.total) * 100)}% completed` : "0% completed"}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-100 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Pending</span>
          <p className="text-xl font-bold font-mono text-amber-700">{metrics.pending}</p>
          <span className="text-[10px] text-amber-600">Awaiting user action</span>
        </div>

        <div className="p-3.5 rounded-xl bg-rose-50/60 border border-rose-100 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Missed</span>
          <p className="text-xl font-bold font-mono text-rose-700">{metrics.missed}</p>
          <span className="text-[10px] text-rose-600 font-medium">Deadline elapsed</span>
        </div>
      </div>

      {/* 3. FILTER & SEARCH CONTROLS */}
      <div className="bg-[#F8FAFC] p-3 rounded-xl border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative w-full md:w-64">
          <FaSearch className="absolute left-3 top-2.5 text-slate-400 text-xs" />
          <input
            type="text"
            placeholder="Search by user, task, link, notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 outline-none focus:border-blue-500"
          >
            <option value="submitted">Submitted Only 🟢</option>
            <option value="all">All Statuses</option>
            <option value="pending">Pending Only ⏳</option>
            <option value="missed">Missed Only 🔴</option>
            <option value="late_submitted">Late Submitted 🟣</option>
          </select>

          {/* User Filter */}
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 outline-none focus:border-blue-500"
          >
            <option value="all">All Users ({uniqueUsers.length})</option>
            {uniqueUsers.map((u) => (
              <option key={u.email} value={u.email}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>

          {/* Date Filter */}
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* 4. SUBMISSIONS TABLE */}
      {loading ? (
        <div className="p-8 text-center text-xs text-slate-400 italic">
          Loading user task deliverables from Supabase...
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="p-8 rounded-xl border border-dashed border-slate-200 text-center space-y-2 bg-slate-50/50">
          <FaCheckCircle className="h-6 w-6 text-slate-300 mx-auto" />
          <h3 className="text-xs font-bold text-slate-700">No Submissions Found</h3>
          <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
            {statusFilter === "submitted"
              ? "No submitted deliverables match the current filter. When users submit their daily links or notes, they will appear here instantly."
              : "No tasks found matching your filter selection."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Task Deliverable</th>
                <th className="py-3 px-4">Cycle</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Submitted At</th>
                <th className="py-3 px-4">Proof of Work</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredSubmissions.map((inst) => {
                const isSubmitted = inst.status === "submitted" || inst.status === "late_submitted";
                const submission = inst.submission;

                return (
                  <tr key={inst.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* User */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0">
                          {(inst.user_name || inst.user_email || "U").charAt(0).toUpperCase()}
                        </div>
                        <div className="truncate max-w-[150px]">
                          <p className="font-bold text-slate-900 truncate">
                            {inst.user_name || inst.user_email.split("@")[0]}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">{inst.user_email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Task Title */}
                    <td className="py-3 px-4">
                      <div className="max-w-[200px]">
                        <p className="font-bold text-slate-900 truncate">{inst.task_title}</p>
                        <p className="text-[10px] text-slate-400">Date: {inst.task_date}</p>
                      </div>
                    </td>

                    {/* Cycle */}
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[10px] border border-blue-200">
                        Day {inst.cycle_number}/{inst.total_cycles}
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 ${
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
                    </td>

                    {/* Submitted At */}
                    <td className="py-3 px-4 text-slate-600">
                      {isSubmitted && (submission?.submitted_at || inst.submitted_at) ? (
                        <div className="text-[11px]">
                          <p className="font-semibold text-emerald-800">
                            {formatFriendlyDateTime(submission?.submitted_at || inst.submitted_at)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Proof of Work Deliverables */}
                    <td className="py-3 px-4">
                      {isSubmitted && submission ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* 1. URL Link */}
                          {(submission.submission_url || submission.submission_link || inst.submission_url) && (
                            <a
                              href={safeExternalUrl(submission.submission_url || submission.submission_link || inst.submission_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-2xs transition-colors cursor-pointer"
                              title={submission.submission_url || submission.submission_link || inst.submission_url}
                            >
                              <FaExternalLinkAlt className="text-[9px]" />
                              <span>Open Link</span>
                            </a>
                          )}

                          {/* 2. File Attachment */}
                          {(submission.submission_file_url || submission.file_url || submission.file_path || inst.submission_file_url || inst.file_url) && (
                            <a
                              href={safeExternalUrl(submission.submission_file_url || submission.file_url || submission.file_path || inst.submission_file_url || inst.file_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] shadow-2xs transition-colors cursor-pointer"
                              title={submission.submission_file_url || submission.file_url || submission.file_path || inst.submission_file_url || inst.file_url}
                            >
                              <FaFileAlt className="text-[9px]" />
                              <span>View File</span>
                            </a>
                          )}

                          {/* 3. Text Only Deliverable: Show [View Submission] */}
                          {!submission.submission_url && !submission.submission_link && !inst.submission_url && !submission.submission_file_url && !submission.file_url && !inst.file_url && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedSubmissionModal(inst);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] border border-slate-200 transition-colors cursor-pointer"
                            >
                              <FaFileAlt className="text-[9px]" />
                              <span>View Submission</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedSubmissionModal(inst)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition-colors cursor-pointer border border-slate-200 inline-flex items-center gap-1"
                      >
                        <FaEye className="text-[9px]" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. SUBMISSION INSPECTION MODAL */}
      {selectedSubmissionModal && (
        <Modal
          isOpen={!!selectedSubmissionModal}
          onClose={() => setSelectedSubmissionModal(null)}
          title={`Task Submission Audit — ${selectedSubmissionModal.task_title}`}
        >
          <div className="space-y-4 text-xs">
            {/* Header info */}
            <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-xl space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-sm">
                  {selectedSubmissionModal.task_title}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                    selectedSubmissionModal.status === "submitted"
                      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                      : selectedSubmissionModal.status === "late_submitted"
                      ? "bg-purple-100 text-purple-800 border-purple-200"
                      : selectedSubmissionModal.status === "missed"
                      ? "bg-rose-100 text-rose-800 border-rose-200"
                      : "bg-amber-100 text-amber-800 border-amber-200"
                  }`}
                >
                  {selectedSubmissionModal.status}
                </span>
              </div>
              <p className="text-slate-600 text-xs">{selectedSubmissionModal.task_description}</p>
            </div>

            {/* Metadata grid */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700">
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">Assignee</span>
                <p className="font-bold">{selectedSubmissionModal.user_name || selectedSubmissionModal.user_email}</p>
                <p className="text-[10px] text-slate-400">{selectedSubmissionModal.user_email}</p>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">Cycle Schedule</span>
                <p className="font-bold">
                  Day {selectedSubmissionModal.cycle_number} of {selectedSubmissionModal.total_cycles}
                </p>
                <p className="text-[10px] text-slate-400">Assigned: {selectedSubmissionModal.task_date}</p>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">Daily Deadline</span>
                <p className="font-bold text-rose-600">
                  {formatFriendlyDateTime(selectedSubmissionModal.due_at)}
                </p>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block font-bold uppercase">Submission Method</span>
                <p className="font-bold text-indigo-700 uppercase">
                  {selectedSubmissionModal.submission_type || "Any Method"}
                </p>
              </div>
            </div>

            {/* Instructions if available */}
            {selectedSubmissionModal.task_instructions && (
              <div className="space-y-1">
                <span className="font-bold text-slate-700 block text-[11px] uppercase">Instructions</span>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-700 whitespace-pre-wrap">
                  {selectedSubmissionModal.task_instructions}
                </div>
              </div>
            )}

            {/* Proof of Work Submission details */}
            {selectedSubmissionModal.submission ? (
              <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between font-bold text-emerald-900 text-xs">
                  <span className="flex items-center gap-1.5">
                    <FaCheckCircle className="text-emerald-600" /> Submitted Proof of Work
                  </span>
                  <span className="text-[10px] text-emerald-700 font-mono">
                    {formatFriendlyDateTime(selectedSubmissionModal.submission.submitted_at)}
                  </span>
                </div>

                {/* 1. Submitted Link */}
                {(selectedSubmissionModal.submission.submission_url || selectedSubmissionModal.submission.submission_link || selectedSubmissionModal.submission_url) && (
                  <div>
                    <span className="text-[10px] font-bold text-emerald-800 block mb-1">
                      Submitted URL / Deliverable Link:
                    </span>
                    <a
                      href={safeExternalUrl(selectedSubmissionModal.submission.submission_url || selectedSubmissionModal.submission.submission_link || selectedSubmissionModal.submission_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                    >
                      <FaExternalLinkAlt className="text-xs" />
                      <span>Open Link</span>
                    </a>
                  </div>
                )}

                {/* 2. Attached File */}
                {(selectedSubmissionModal.submission.submission_file_url || selectedSubmissionModal.submission.file_url || selectedSubmissionModal.submission.file_path || selectedSubmissionModal.submission_file_url || selectedSubmissionModal.file_url) && (
                  <div>
                    <span className="text-[10px] font-bold text-emerald-800 block mb-1">
                      Attached Deliverable File:
                    </span>
                    <a
                      href={safeExternalUrl(selectedSubmissionModal.submission.submission_file_url || selectedSubmissionModal.submission.file_url || selectedSubmissionModal.submission.file_path || selectedSubmissionModal.submission_file_url || selectedSubmissionModal.file_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                    >
                      <FaFileAlt className="text-xs" />
                      <span>View File</span>
                    </a>
                  </div>
                )}

                {/* 3. Submitted Text */}
                {(selectedSubmissionModal.submission.submission_text || selectedSubmissionModal.submission.text) && (
                  <div>
                    <span className="text-[10px] font-bold text-emerald-800 block mb-1">
                      Submission Notes / Description:
                    </span>
                    <p className="text-slate-800 bg-white p-2.5 rounded-lg border border-emerald-100 whitespace-pre-wrap">
                      {selectedSubmissionModal.submission.submission_text || selectedSubmissionModal.submission.text}
                    </p>
                  </div>
                )}

                {/* 4. Notes */}
                {selectedSubmissionModal.submission.notes && (
                  <div>
                    <span className="text-[10px] font-bold text-emerald-800 block mb-0.5">Additional Notes:</span>
                    <p className="text-slate-600 text-xs bg-emerald-50/40 p-2 rounded-lg border border-emerald-100">{selectedSubmissionModal.submission.notes}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl text-center text-amber-800">
                This daily task cycle has not been submitted yet.
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedSubmissionModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
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

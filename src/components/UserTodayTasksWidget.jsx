"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import Modal from "@/components/Modal";
import { showToast } from "@/components/Toast";
import {
  formatFriendlyDateTime,
  format12HourTime,
  getRemainingTimeFormatted,
  safeExternalUrl
} from "@/lib/recurringTaskUtils";
import {
  FaTasks,
  FaClock,
  FaCheckCircle,
  FaExclamationTriangle,
  FaCalendarAlt,
  FaUserCheck,
  FaPaperPlane,
  FaExternalLinkAlt,
  FaFileAlt,
  FaSpinner,
  FaEye,
  FaArrowRight,
  FaSync,
  FaChevronRight,
  FaLink,
  FaInfoCircle,
} from "react-icons/fa";

export default function UserTodayTasksWidget({
  userEmail: propUserEmail,
  userName: propUserName,
  userRole: propUserRole,
  className = "",
}) {
  const [userEmail, setUserEmail] = useState(propUserEmail || "");
  const [userName, setUserName] = useState(propUserName || "");
  const [role, setRole] = useState(propUserRole || "employee");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("today"); // 'today' | 'history'

  const [todayMetrics, setTodayMetrics] = useState({
    assigned: 0,
    submitted: 0,
    pending: 0,
    missed: 0,
  });

  const [todayTasks, setTodayTasks] = useState([]);
  const [historyTasks, setHistoryTasks] = useState([]);

  // Modals State
  const [selectedTaskModal, setSelectedTaskModal] = useState(null);
  const [submitModalTask, setSubmitModalTask] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [urlValidationError, setUrlValidationError] = useState("");
  const [submissionForm, setSubmissionForm] = useState({
    submissionText: "",
    submissionUrl: "",
    fileUrl: "",
    notes: "",
  });

  // Ticking state for countdown updates every 10 seconds
  const [, setTick] = useState(0);

  // Sync user details from props or localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedEmail = propUserEmail || localStorage.getItem("current_user_email") || "";
      const storedName = propUserName || localStorage.getItem("current_user_name") || "";
      const storedRole = propUserRole || localStorage.getItem("user_role") || "employee";

      setUserEmail(storedEmail.toLowerCase().trim());
      setUserName(storedName);
      setRole(storedRole.toLowerCase().trim());
    }
  }, [propUserEmail, propUserName, propUserRole]);

  // Fetch today's and historical tasks from Supabase API
  const fetchTasks = useCallback(async (isSilent = false) => {
    if (!userEmail) return;
    if (!isSilent) setRefreshing(true);

    try {
      const queryParam = `userEmail=${encodeURIComponent(userEmail)}&isAdmin=false`;

      const res = await fetch(`/api/tasks/recurring?${queryParam}`, {
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Failed to load assigned tasks from Supabase");

      const json = await res.json();
      if (json.success) {
        setTodayMetrics(json.todayMetrics || { assigned: 0, submitted: 0, pending: 0, missed: 0 });
        setTodayTasks(json.todayInstances || []);
        setHistoryTasks(json.instances || []);
      }
    } catch (err) {
      console.error("[UserTodayTasksWidget] Error fetching tasks:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userEmail]);

  // Load on mount and on userEmail change
  useEffect(() => {
    if (userEmail) {
      fetchTasks();
    }
  }, [userEmail, fetchTasks]);

  // Countdown clock ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Supabase Realtime channel subscription
  useEffect(() => {
    if (!userEmail) return;

    let channel = null;
    try {
      channel = supabase
        .channel(`dashboard-tasks-${userEmail}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "daily_task_instances",
            filter: `user_email=eq.${userEmail}`,
          },
          () => {
            fetchTasks(true);
          }
        )
        .subscribe();
    } catch (e) {
      console.debug("Supabase realtime notice:", e);
    }

    // Periodic backup sync every 25 seconds
    const interval = setInterval(() => {
      fetchTasks(true);
    }, 25000);

    return () => {
      if (channel) supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [userEmail, fetchTasks]);

  // Handle URL change with live validation
  const handleUrlChange = (val) => {
    setSubmissionForm((prev) => ({ ...prev, submissionUrl: val }));
    const trimmed = val.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      setUrlValidationError("URL must start with https:// or http:// (e.g. https://example.com)");
    } else {
      setUrlValidationError("");
    }
  };

  // Open Submit Modal Helper
  const handleOpenSubmitModal = (task) => {
    setSubmitModalTask(task);
    setUrlValidationError("");
    setSubmissionForm({
      submissionText: task.submission?.submission_text || "",
      submissionUrl: task.submission?.submission_url || "",
      fileUrl: task.submission?.file_url || "",
      notes: task.submission?.notes || "",
    });
  };

  // Handle Submit Task with strict anti-blank validation
  const handleSubmitTask = async (e) => {
    if (e) e.preventDefault();
    if (!submitModalTask) return;

    const subType = submitModalTask.submission_type || "any";
    const cleanUrl = submissionForm.submissionUrl.trim();
    const cleanText = submissionForm.submissionText.trim();
    const cleanFile = submissionForm.fileUrl.trim();
    const cleanNotes = submissionForm.notes.trim();

    // URL format check if URL entered
    if (cleanUrl) {
      if (!/^https?:\/\//i.test(cleanUrl)) {
        showToast("Invalid URL 🛑", "Please enter a valid URL starting with https:// or http://", "warning");
        setUrlValidationError("Please enter a valid URL starting with https:// or http://");
        return;
      }
    }

    // Strict type checks
    const hasUrl = !!cleanUrl;
    const hasText = !!(cleanText || cleanNotes);
    const hasFile = !!cleanFile;

    if (subType === "link" && !hasUrl) {
      showToast("Link Required 🛑", "Please enter a valid submission link.", "warning");
      return;
    }
    if (subType === "file" && !hasFile) {
      showToast("File Required 🛑", "Please upload a file or provide a file URL.", "warning");
      return;
    }
    if (subType === "text" && !hasText) {
      showToast("Text Required 🛑", "Please enter your submission notes before submitting.", "warning");
      return;
    }
    if (subType === "link_notes") {
      if (!hasUrl) {
        showToast("Link Required 🛑", "Please enter a valid submission link.", "warning");
        return;
      }
      if (!hasText) {
        showToast("Notes Required 🛑", "Please enter your submission notes.", "warning");
        return;
      }
    }
    if (subType === "file_notes") {
      if (!hasFile) {
        showToast("File Required 🛑", "Please upload a file before submitting.", "warning");
        return;
      }
      if (!hasText) {
        showToast("Notes Required 🛑", "Please enter your submission notes.", "warning");
        return;
      }
    }
    if (subType === "any" && !hasUrl && !hasText && !hasFile) {
      showToast("Empty Submission 🛑", "Please provide a link, text, or file before submitting.", "warning");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/tasks/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceId: submitModalTask.id,
          submissionText: cleanText,
          submissionUrl: cleanUrl,
          fileUrl: cleanFile,
          notes: cleanNotes,
          userEmail: userEmail,
          userName: userName || userEmail.split("@")[0],
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to submit task to Supabase.");
      }

      showToast("Task Submitted 🎉", data.message || "Your deliverable has been recorded permanently.", "success");
      setSubmitModalTask(null);
      setSubmissionForm({ submissionText: "", submissionUrl: "", fileUrl: "", notes: "" });
      setUrlValidationError("");
      await fetchTasks();
    } catch (err) {
      console.error("Task submission error:", err);
      showToast("Submission Failed ❌", err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const actionableTasks = activeTab === "today" ? todayTasks : historyTasks;

  return (
    <div className={`rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs space-y-5 ${className}`}>
      {/* === HEADER & TABS === */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-50 text-blue-600 shadow-xs">
              <FaTasks className="h-4 w-4" />
            </span>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Today&apos;s Assigned Tasks
            </h2>
            {todayMetrics.pending > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
                {todayMetrics.pending} Pending
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Real-time daily task deliverables assigned by management.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab Filter */}
          <div className="flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("today")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === "today"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Today ({todayTasks.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === "history"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              History ({historyTasks.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => fetchTasks()}
            disabled={refreshing}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
            title="Refresh Tasks"
          >
            <FaSync className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-blue-600" : ""}`} />
          </button>

          <Link
            href="/dashboard/tasks"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-blue-200 bg-blue-50/60 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors shadow-xs"
          >
            <span>Full Hub</span>
            <FaChevronRight className="h-2.5 w-2.5" />
          </Link>
        </div>
      </div>

      {/* === METRICS SUMMARY STATS BAR === */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100/80 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Today</span>
          <p className="text-xl font-bold font-mono text-slate-900">{todayMetrics.assigned}</p>
        </div>
        <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-100 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Submitted</span>
          <p className="text-xl font-bold font-mono text-emerald-700">{todayMetrics.submitted}</p>
        </div>
        <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-100 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Pending</span>
          <p className="text-xl font-bold font-mono text-amber-700">{todayMetrics.pending}</p>
        </div>
        <div className="p-3.5 rounded-xl bg-rose-50/60 border border-rose-100 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Missed</span>
          <p className="text-xl font-bold font-mono text-rose-700">{todayMetrics.missed}</p>
        </div>
      </div>

      {/* === TASKS LIST === */}
      {loading ? (
        /* Loading Skeletons */
        <div className="space-y-3">
          {[1, 2].map((n) => (
            <div key={n} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 animate-pulse space-y-3">
              <div className="flex justify-between">
                <div className="h-4 bg-slate-200 rounded w-1/3" />
                <div className="h-4 bg-slate-200 rounded w-16" />
              </div>
              <div className="h-3 bg-slate-200 rounded w-2/3" />
              <div className="h-8 bg-slate-200 rounded w-full" />
            </div>
          ))}
        </div>
      ) : actionableTasks.length === 0 ? (
        /* Empty State */
        <div className="p-8 rounded-2xl border border-dashed border-slate-200 text-center space-y-2 bg-slate-50/50">
          <div className="mx-auto w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <FaCheckCircle className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">
            {activeTab === "today" ? "No Tasks Assigned for Today" : "No Task History Found"}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {activeTab === "today"
              ? "You are all caught up! When management assigns daily recurring deliverables, they will appear here automatically."
              : "Completed and submitted tasks will be permanently archived here."}
          </p>
        </div>
      ) : (
        /* Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {actionableTasks.map((task) => {
            const isSubmitted = task.status === "submitted" || task.status === "late_submitted";
            const isMissed = task.status === "missed";
            const isPending = task.status === "pending";

            const remaining = getRemainingTimeFormatted(task.due_at);
            const isDueSoon = !remaining.isPassed && remaining.diffMs < 2 * 3600 * 1000;

            return (
              <div
                key={task.id}
                className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-3.5 relative overflow-hidden ${
                  isSubmitted
                    ? "bg-white border-emerald-200 hover:border-emerald-300 shadow-xs"
                    : isMissed
                    ? "bg-rose-50/30 border-rose-200 hover:border-rose-300"
                    : isDueSoon
                    ? "bg-amber-50/40 border-amber-300 ring-2 ring-amber-400/20 shadow-xs"
                    : "bg-white border-slate-200 hover:border-slate-300 shadow-xs"
                }`}
              >
                {/* Card Top: Badges */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                        Day {task.cycle_number || 1} of {task.total_cycles || 1}
                      </span>
                      {task.submission_type && task.submission_type !== "any" && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                          <FaLink className="h-2.5 w-2.5" />
                          <span>
                            {task.submission_type === "link"
                              ? "Link Required"
                              : task.submission_type === "file"
                              ? "File Required"
                              : task.submission_type === "text"
                              ? "Text Required"
                              : task.submission_type === "link_notes"
                              ? "Link + Notes"
                              : task.submission_type === "file_notes"
                              ? "File + Notes"
                              : task.submission_type}
                          </span>
                        </span>
                      )}
                      {task.priority && (
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            task.priority.toLowerCase() === "urgent" || task.priority.toLowerCase() === "high"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {task.priority}
                        </span>
                      )}
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                        isSubmitted
                          ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                          : isMissed
                          ? "bg-rose-100 text-rose-800 border-rose-200"
                          : "bg-amber-100 text-amber-800 border-amber-200"
                      }`}
                    >
                      {isSubmitted ? (
                        <>
                          <FaCheckCircle className="h-2.5 w-2.5" />
                          <span>{task.status === "late_submitted" ? "Late Submitted" : "Submitted"}</span>
                        </>
                      ) : isMissed ? (
                        <>
                          <FaExclamationTriangle className="h-2.5 w-2.5" />
                          <span>Missed</span>
                        </>
                      ) : (
                        <>
                          <FaClock className="h-2.5 w-2.5" />
                          <span>Pending</span>
                        </>
                      )}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm leading-snug">{task.task_title}</h3>
                    {task.task_description && (
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                        {task.task_description}
                      </p>
                    )}
                  </div>

                  {/* Metadata Specs Box */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-slate-600 text-[11px] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Assigned Date:</span>
                      <strong className="text-slate-800">{task.task_date || "Today"}</strong>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Deadline:</span>
                      <strong className="text-slate-900 font-medium">
                        {formatFriendlyDateTime(task.due_at)}
                      </strong>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                      <span className="text-slate-400">Time Remaining:</span>
                      <span
                        className={`font-mono font-bold text-xs ${
                          remaining.isPassed
                            ? "text-rose-600"
                            : isDueSoon
                            ? "text-amber-600 animate-pulse"
                            : "text-blue-600"
                        }`}
                      >
                        {remaining.text}
                      </span>
                    </div>

                    {isSubmitted && task.submission && (
                      <div className="pt-2 border-t border-emerald-100 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between text-emerald-800 font-semibold text-[11px]">
                          <span>Status: Submitted</span>
                          <span>{formatFriendlyDateTime(task.submission.submitted_at)}</span>
                        </div>

                        {(task.submission.submission_url || task.submission.submission_link || task.submission_url) && (
                          <div className="pt-0.5">
                            <a
                              href={safeExternalUrl(task.submission.submission_url || task.submission.submission_link || task.submission_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                            >
                              <FaExternalLinkAlt className="h-3 w-3" />
                              <span>Open Link</span>
                            </a>
                          </div>
                        )}

                        {(task.submission.submission_file_url || task.submission.file_url || task.submission.file_path || task.submission_file_url || task.file_url) && (
                          <div className="pt-0.5">
                            <a
                              href={safeExternalUrl(task.submission.submission_file_url || task.submission.file_url || task.submission_file_path || task.submission_file_url || task.file_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                            >
                              <FaFileAlt className="h-3 w-3" />
                              <span>View File</span>
                            </a>
                          </div>
                        )}

                        {task.submission.notes && (
                          <p className="text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-emerald-100 line-clamp-2">
                            <strong>Notes:</strong> {task.submission.notes}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setSelectedTaskModal(task)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <FaEye className="h-3 w-3 text-slate-500" />
                    <span>View Details</span>
                  </button>

                  {isPending || isMissed ? (
                    <button
                      type="button"
                      onClick={() => handleOpenSubmitModal(task)}
                      className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                    >
                      <FaPaperPlane className="h-3 w-3" />
                      <span>Submit Task</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectedTaskModal(task)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <FaCheckCircle className="h-3 w-3" />
                      <span>View Submission</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer Mobile Quick Link */}
      <div className="sm:hidden pt-2 border-t border-slate-100 text-center">
        <Link
          href="/dashboard/tasks"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline"
        >
          <span>Open Full Daily Tasks Page</span>
          <FaArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* === MODAL 1: VIEW FULL TASK DETAILS MODAL === */}
      {selectedTaskModal && (
        <Modal
          isOpen={!!selectedTaskModal}
          onClose={() => setSelectedTaskModal(null)}
          title={`Task Details — ${selectedTaskModal.task_title}`}
        >
          <div className="space-y-4 text-xs text-slate-700">
            {/* Header info */}
            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-100 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">
                  Cycle Schedule
                </span>
                <p className="font-bold text-slate-900 text-sm">
                  Day {selectedTaskModal.cycle_number} of {selectedTaskModal.total_cycles}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Priority
                </span>
                <span className="font-bold text-blue-700">{selectedTaskModal.priority || "Medium"}</span>
              </div>
            </div>

            {/* Description & Instructions */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-900">Task Overview</h4>
              <p className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-slate-700 leading-relaxed">
                {selectedTaskModal.task_description || "No overview provided."}
              </p>
            </div>

            {selectedTaskModal.instructions && (
              <div className="space-y-2">
                <h4 className="font-bold text-slate-900">Detailed Instructions</h4>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-slate-700 whitespace-pre-line leading-relaxed font-mono text-[11px]">
                  {selectedTaskModal.instructions}
                </div>
              </div>
            )}

            {/* Timings */}
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 text-slate-700">
              <div>
                <span className="text-slate-400 text-[10px] block">Task Date:</span>
                <strong>{selectedTaskModal.task_date}</strong>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">Deadline:</span>
                <strong className="text-rose-600">{formatFriendlyDateTime(selectedTaskModal.due_at)}</strong>
              </div>
            </div>

            {selectedTaskModal.reference_url && (
              <div>
                <span className="text-slate-400 text-[10px] block mb-1">Reference Deliverable Link:</span>
                <a
                  href={safeExternalUrl(selectedTaskModal.reference_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-blue-600 hover:underline font-semibold"
                >
                  <FaExternalLinkAlt className="h-3 w-3" />
                  <span className="truncate max-w-xs">{selectedTaskModal.reference_url}</span>
                </a>
              </div>
            )}

            {/* Previous Submission info if submitted */}
            {selectedTaskModal.submission && (
              <div className="space-y-3 p-4 rounded-xl bg-emerald-50/70 border border-emerald-200">
                <div className="flex items-center justify-between font-bold text-emerald-900 text-xs">
                  <span className="flex items-center gap-1.5">
                    <FaCheckCircle className="text-emerald-600" /> Proof of Work Submission
                  </span>
                  <span className="text-[10px] text-emerald-700 font-mono">
                    {formatFriendlyDateTime(selectedTaskModal.submission.submitted_at)}
                  </span>
                </div>

                {(selectedTaskModal.submission.submission_url || selectedTaskModal.submission.submission_link || selectedTaskModal.submission_url) && (
                  <div>
                    <span className="text-[10px] font-bold text-emerald-800 block mb-1">
                      Submitted Link / URL:
                    </span>
                    <a
                      href={safeExternalUrl(selectedTaskModal.submission.submission_url || selectedTaskModal.submission.submission_link || selectedTaskModal.submission_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                    >
                      <FaExternalLinkAlt className="h-3 w-3" />
                      <span>Open Link</span>
                    </a>
                  </div>
                )}

                {(selectedTaskModal.submission.submission_text || selectedTaskModal.submission.text) && (
                  <div>
                    <span className="text-[10px] font-bold text-emerald-800 block mb-1">
                      Work Details / Description:
                    </span>
                    <p className="text-slate-700 text-xs bg-white/90 p-2.5 rounded-lg border border-emerald-100 whitespace-pre-wrap">
                      {selectedTaskModal.submission.submission_text || selectedTaskModal.submission.text}
                    </p>
                  </div>
                )}

                {(selectedTaskModal.submission.submission_file_url || selectedTaskModal.submission.file_url || selectedTaskModal.submission.file_path || selectedTaskModal.submission_file_url || selectedTaskModal.file_url) && (
                  <div>
                    <span className="text-[10px] font-bold text-emerald-800 block mb-1">
                      Attached File:
                    </span>
                    <a
                      href={safeExternalUrl(selectedTaskModal.submission.submission_file_url || selectedTaskModal.submission.file_url || selectedTaskModal.submission.file_path || selectedTaskModal.submission_file_url || selectedTaskModal.file_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                    >
                      <FaFileAlt className="h-3 w-3" />
                      <span>View File</span>
                    </a>
                  </div>
                )}

                {selectedTaskModal.submission.notes && (
                  <div>
                    <span className="text-[10px] font-bold text-emerald-800 block mb-0.5">Notes:</span>
                    <p className="text-slate-600 text-xs bg-emerald-50/40 p-2 rounded-lg border border-emerald-100">{selectedTaskModal.submission.notes}</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedTaskModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Close
              </button>

              {(selectedTaskModal.status === "pending" || selectedTaskModal.status === "missed") && (
                <button
                  type="button"
                  onClick={() => {
                    handleOpenSubmitModal(selectedTaskModal);
                    setSelectedTaskModal(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <FaPaperPlane className="h-3 w-3" />
                  <span>Submit Task Now</span>
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* === MODAL 2: DIRECT SUBMIT TASK MODAL === */}
      {submitModalTask && (
        <Modal
          isOpen={!!submitModalTask}
          onClose={() => {
            if (!submitting) setSubmitModalTask(null);
          }}
          title={`Submit Deliverable — ${submitModalTask.task_title}`}
        >
          <form onSubmit={handleSubmitTask} className="space-y-4 text-xs">
            <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl space-y-1">
              <div className="flex items-center justify-between">
                <p className="font-bold text-slate-900 text-xs">{submitModalTask.task_title}</p>
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px]">
                  Day {submitModalTask.cycle_number} of {submitModalTask.total_cycles}
                </span>
              </div>
              <p className="text-[11px] text-slate-600">
                Deadline: <strong>{formatFriendlyDateTime(submitModalTask.due_at)}</strong>
              </p>
              {submitModalTask.submission_type && submitModalTask.submission_type !== "any" && (
                <p className="text-[11px] text-indigo-700 font-bold pt-1">
                  Required Submission Type:{" "}
                  <span className="underline uppercase">
                    {submitModalTask.submission_type.replace("_", " + ")}
                  </span>
                </p>
              )}
            </div>

            {/* Submission Link (URL) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-800 block">
                  Submission Link (URL){" "}
                  {submitModalTask.submission_type === "link" || submitModalTask.submission_type === "link_notes" ? (
                    <span className="text-rose-500 font-bold">* (Required)</span>
                  ) : (
                    <span className="text-slate-400 font-normal">(Optional / Supported)</span>
                  )}
                </label>
                <span className="text-[10px] text-slate-400">Google Drive, GitHub, LinkedIn, Figma, Live Link</span>
              </div>
              <div className="relative">
                <FaLink className="absolute left-3 top-3 text-slate-400 h-3.5 w-3.5" />
                <input
                  type="text"
                  value={submissionForm.submissionUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  placeholder="https://example.com/your-work"
                  className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-xs transition-all ${
                    urlValidationError
                      ? "border-rose-300 bg-rose-50/30 focus:ring-2 focus:ring-rose-400"
                      : "border-slate-200 bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  }`}
                />
              </div>
              {urlValidationError ? (
                <p className="text-[10px] text-rose-600 font-semibold">{urlValidationError}</p>
              ) : (
                <p className="text-[10px] text-slate-400">
                  Examples: Google Docs, GitHub PR, LinkedIn Post, Deployed Project URL
                </p>
              )}
            </div>

            {/* Submission Text / Notes */}
            <div className="space-y-1">
              <label className="font-bold text-slate-800 block">
                Work Summary / Submission Notes{" "}
                {submitModalTask.submission_type === "text" ||
                submitModalTask.submission_type === "link_notes" ||
                submitModalTask.submission_type === "file_notes" ? (
                  <span className="text-rose-500 font-bold">* (Required)</span>
                ) : (
                  <span className="text-slate-400 font-normal">(Optional if submitting Link/File)</span>
                )}
              </label>
              <textarea
                rows={3}
                value={submissionForm.submissionText}
                onChange={(e) =>
                  setSubmissionForm({ ...submissionForm, submissionText: e.target.value })
                }
                placeholder="Describe your work, completed checklist items, or test results..."
                className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
              />
            </div>

            {/* File URL or Attachment */}
            <div className="space-y-1">
              <label className="font-bold text-slate-800 block">
                File / Document Link{" "}
                {submitModalTask.submission_type === "file" || submitModalTask.submission_type === "file_notes" ? (
                  <span className="text-rose-500 font-bold">* (Required)</span>
                ) : (
                  <span className="text-slate-400 font-normal">(Optional)</span>
                )}
              </label>
              <div className="relative">
                <FaFileAlt className="absolute left-3 top-3 text-slate-400 h-3.5 w-3.5" />
                <input
                  type="text"
                  value={submissionForm.fileUrl}
                  onChange={(e) => setSubmissionForm({ ...submissionForm, fileUrl: e.target.value })}
                  placeholder="https://drive.google.com/file/... or uploaded file link"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Additional Notes */}
            <div className="space-y-1">
              <label className="font-bold text-slate-700 block text-[11px]">
                Additional Notes / Comments (Optional)
              </label>
              <input
                type="text"
                value={submissionForm.notes}
                onChange={(e) => setSubmissionForm({ ...submissionForm, notes: e.target.value })}
                placeholder="Any additional remarks for management..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setSubmitModalTask(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <FaSpinner className="animate-spin h-3.5 w-3.5" />
                    <span>Submitting Deliverable...</span>
                  </>
                ) : (
                  <>
                    <FaPaperPlane className="h-3.5 w-3.5" />
                    <span>Submit to Management</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

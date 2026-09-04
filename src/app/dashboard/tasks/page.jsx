"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { dbFetch, dbSaveRecord, dbSaveList } from "@/lib/dbPersistence";
import Modal from "@/components/Modal";
import { showToast } from "@/components/Toast";
import {
  FaTasks,
  FaPlay,
  FaPause,
  FaCheckCircle,
  FaClock,
  FaPlusCircle,
  FaSearch,
  FaFilter,
  FaCalendarAlt,
  FaArrowLeft,
  FaUserCheck,
  FaExclamationTriangle,
  FaFire
} from "react-icons/fa";

export default function TasksPage() {
  const [role, setRole] = useState("employee");
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  // Task Lists
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  // Create Task Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    task: "",
    description: "",
    priority: "Normal",
    assignedToEmail: "",
    assignedToName: "",
    dueDate: new Date().toISOString().split("T")[0],
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedRole = localStorage.getItem("user_role") || "employee";
      const savedEmail = (localStorage.getItem("current_user_email") || "").toLowerCase().trim();
      const savedName = localStorage.getItem("current_user_name") || savedEmail.split("@")[0] || "User";
      const adminCheck = savedRole === "admin" || savedRole === "hr" || savedEmail.includes("admin") || savedEmail === "admin@gmail.com";

      setRole(savedRole);
      setUserEmail(savedEmail);
      setUserName(savedName);
      setIsAdmin(adminCheck);

      loadTasks(savedEmail, adminCheck);
    }
  }, []);

  const loadTasks = async (email, adminMode) => {
    setLoading(true);
    try {
      const rawTasks = await dbFetch("daily_tasks", []).catch(() => []);
      setTasks(rawTasks || []);
    } catch (e) {
      setTasks([]);
    }
    setLoading(false);
  };

  // Filter Tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const taskEmail = (t.assigned_to_email || t.assignedToEmail || t.email || "").toLowerCase().trim();
      const isTargetedToMe = !isAdmin
        ? taskEmail === userEmail || taskEmail.includes(userEmail) || (t.targetAudience || "").toLowerCase().includes("all staff") || (t.targetAudience || "").toLowerCase().includes("all employees")
        : true;

      if (!isTargetedToMe) return false;

      const titleMatch = (t.task || t.task_title || t.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.description || "").toLowerCase().includes(searchQuery.toLowerCase());
      
      const statusMatch = statusFilter === "all"
        ? true
        : statusFilter === "completed"
        ? t.status === "Completed"
        : statusFilter === "in_progress"
        ? t.status === "In Progress"
        : t.status === "Pending" || !t.status;

      const priorityMatch = priorityFilter === "all"
        ? true
        : (t.priority || "Normal").toLowerCase() === priorityFilter.toLowerCase();

      return titleMatch && statusMatch && priorityMatch;
    });
  }, [tasks, userEmail, isAdmin, searchQuery, statusFilter, priorityFilter]);

  // Metrics
  const metrics = useMemo(() => {
    const total = filteredTasks.length;
    const inProgress = filteredTasks.filter((t) => t.status === "In Progress").length;
    const completed = filteredTasks.filter((t) => t.status === "Completed").length;
    const pending = filteredTasks.filter((t) => t.status === "Pending" || !t.status).length;
    return { total, inProgress, completed, pending };
  }, [filteredTasks]);

  // Status Change Handler
  const handleUpdateStatus = async (taskId, newStatus) => {
    const updated = tasks.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          status: newStatus,
          isTimerRunning: newStatus === "In Progress",
          progress: newStatus === "Completed" ? 100 : t.progress || 0,
        };
      }
      return t;
    });

    setTasks(updated);
    const target = updated.find((t) => t.id === taskId);
    if (target) {
      await dbSaveRecord("daily_tasks", target).catch(() => {});
    }
    showToast("Task Updated 📝", `Status changed to '${newStatus}'.`, "success");
  };

  // Create Task Handler
  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newTask.task.trim()) {
      showToast("Validation Error 🛑", "Please enter a task title.", "error");
      return;
    }

    setCreating(true);
    const record = {
      id: `task-${Date.now()}`,
      task: newTask.task.trim(),
      task_title: newTask.task.trim(),
      description: newTask.description.trim() || "Assigned task deliverable.",
      priority: newTask.priority,
      status: "Pending",
      assigned_to_email: newTask.assignedToEmail.trim() || userEmail,
      assignedToEmail: newTask.assignedToEmail.trim() || userEmail,
      assigned_to_name: newTask.assignedToName.trim() || userName,
      assignedToName: newTask.assignedToName.trim() || userName,
      dueDate: newTask.dueDate,
      due_date: newTask.dueDate,
      created_at: new Date().toISOString(),
    };

    const updated = [record, ...tasks];
    setTasks(updated);
    await dbSaveRecord("daily_tasks", record).catch(() => {});

    setCreating(false);
    setCreateModalOpen(false);
    setNewTask({
      task: "",
      description: "",
      priority: "Normal",
      assignedToEmail: "",
      assignedToName: "",
      dueDate: new Date().toISOString().split("T")[0],
    });
    showToast("Task Created 🎉", "New task assigned successfully.", "success");
  };

  return (
    <div className="space-y-6 w-full">
      {/* HEADER BANNER */}
      <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] bg-[#EFF6FF] px-2.5 py-1 rounded-full border border-[#2563EB]/20">
              Task & Deliverable Management
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-[#0F172A] mt-1.5 flex items-center gap-2.5">
            <FaTasks className="text-[#2563EB]" />
            <span>Task Manager Hub</span>
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            Track daily work items, start live execution timers, and log progress in real time.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/employee"
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-200"
          >
            <FaArrowLeft className="text-xs text-blue-600" />
            <span>Workspace</span>
          </Link>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <FaPlusCircle className="text-xs" />
              <span>Assign New Task</span>
            </button>
          )}
        </div>
      </div>

      {/* STATS METRICS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-1">
          <div className="flex justify-between items-center text-xs text-[#64748B]">
            <span className="font-semibold text-slate-700">Total Tasks</span>
            <FaTasks className="text-blue-500" />
          </div>
          <p className="text-2xl font-black text-[#0F172A]">{metrics.total}</p>
          <p className="text-[11px] text-slate-400">Assigned work items</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-1">
          <div className="flex justify-between items-center text-xs text-[#64748B]">
            <span className="font-semibold text-slate-700">In Progress</span>
            <FaPlay className="text-amber-500 text-xs" />
          </div>
          <p className="text-2xl font-black text-amber-600">{metrics.inProgress}</p>
          <p className="text-[11px] text-slate-400">Currently active work</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-1">
          <div className="flex justify-between items-center text-xs text-[#64748B]">
            <span className="font-semibold text-slate-700">Pending Review</span>
            <FaClock className="text-slate-400" />
          </div>
          <p className="text-2xl font-black text-slate-700">{metrics.pending}</p>
          <p className="text-[11px] text-slate-400">Awaiting start</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-1">
          <div className="flex justify-between items-center text-xs text-[#64748B]">
            <span className="font-semibold text-slate-700">Completed</span>
            <FaCheckCircle className="text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-600">{metrics.completed}</p>
          <p className="text-[11px] text-slate-400">Finished deliverables</p>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <FaSearch className="absolute left-3.5 top-3.5 text-slate-400 text-xs" />
          <input
            type="text"
            placeholder="Search tasks by title or details..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white outline-none focus:border-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white outline-none focus:border-blue-500"
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority 🔥</option>
            <option value="normal">Normal Priority</option>
            <option value="low">Low Priority</option>
          </select>
        </div>
      </div>

      {/* TASK CARDS LIST */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-xs text-slate-400 italic">
            Loading tasks from database...
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-2">
            <FaTasks className="text-3xl text-slate-300 mx-auto" />
            <h3 className="font-bold text-slate-700 text-sm">No tasks matching your filter</h3>
            <p className="text-xs text-slate-400">Check back later or change your search filter.</p>
          </div>
        ) : (
          filteredTasks.map((t) => (
            <div
              key={t.id}
              className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-sm hover:border-blue-200 transition-all space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-[#0F172A]">
                      {t.task || t.task_title || "Assigned Task"}
                    </h3>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase ${
                        t.status === "Completed"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : t.status === "In Progress"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}
                    >
                      {t.status || "Pending"}
                    </span>
                    {(t.priority === "High" || t.priority === "Urgent") && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                        <FaFire className="text-[9px]" /> High Priority
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#64748B] leading-relaxed">
                    {t.description || "Complete assigned project deliverables as per specifications."}
                  </p>
                </div>

                {/* ACTION BUTTONS */}
                <div className="flex items-center gap-2 self-start shrink-0">
                  {t.status !== "In Progress" && t.status !== "Completed" && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(t.id, "In Progress")}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <FaPlay className="text-[9px]" /> Start
                    </button>
                  )}

                  {t.status === "In Progress" && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(t.id, "Pending")}
                      className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <FaPause className="text-[9px]" /> Pause
                    </button>
                  )}

                  {t.status !== "Completed" && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(t.id, "Completed")}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <FaCheckCircle className="text-[9px]" /> Complete
                    </button>
                  )}
                </div>
              </div>

              {/* FOOTER META */}
              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between text-[11px] text-[#64748B] gap-2">
                <div className="flex items-center gap-3">
                  <span>Assigned To: <strong className="text-slate-800">{t.assigned_to_name || t.assignedToName || t.assigned_to_email || "Me"}</strong></span>
                  <span>Due: <strong className="text-slate-800">{t.dueDate || t.due_date || "Today"}</strong></span>
                </div>
                <span className="font-semibold text-blue-600">
                  Priority: {t.priority || "Normal"}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* CREATE TASK MODAL */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Assign New Task"
      >
        <form onSubmit={handleCreateTask} className="space-y-4 text-xs">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Task Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Build Authentication API"
              value={newTask.task}
              onChange={(e) => setNewTask({ ...newTask, task: e.target.value })}
              className="w-full p-2.5 rounded-xl border border-slate-200 outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Description
            </label>
            <textarea
              rows={3}
              placeholder="Provide clear deliverable guidelines..."
              value={newTask.description}
              onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
              className="w-full p-2.5 rounded-xl border border-slate-200 outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Priority
              </label>
              <select
                value={newTask.priority}
                onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                className="w-full p-2.5 rounded-xl border border-slate-200 outline-none focus:border-blue-500 bg-white"
              >
                <option value="Normal">Normal</option>
                <option value="High">High 🔥</option>
                <option value="Urgent">Urgent ⚡</option>
                <option value="Low">Low</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={newTask.dueDate}
                onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                className="w-full p-2.5 rounded-xl border border-slate-200 outline-none focus:border-blue-500 bg-white"
              >
              </input>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Assignee Email
            </label>
            <input
              type="email"
              placeholder="e.g. employee@company.com"
              value={newTask.assignedToEmail}
              onChange={(e) => setNewTask({ ...newTask, assignedToEmail: e.target.value })}
              className="w-full p-2.5 rounded-xl border border-slate-200 outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-xs cursor-pointer"
            >
              {creating ? "Assigning..." : "Assign Task"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

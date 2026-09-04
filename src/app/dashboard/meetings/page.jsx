"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { showToast } from "@/components/Toast";
import {
  FaVideo,
  FaPlusCircle,
  FaCalendarAlt,
  FaUsers,
  FaCheckCircle,
  FaTimesCircle,
  FaFileSignature,
  FaTasks,
  FaClock,
  FaUserCheck,
  FaUserTimes,
  FaStickyNote,
  FaTrash,
  FaLink,
  FaChalkboardTeacher,
  FaEllipsisV,
  FaExclamationTriangle,
  FaGraduationCap,
  FaBriefcase,
  FaUserTag,
  FaSearch,
  FaBell
} from "react-icons/fa";

import { dbFetch, dbSaveList } from "@/lib/dbPersistence";

export default function MeetingsPage() {
  const [role, setRole] = useState("admin");
  const [userEmail, setUserEmail] = useState("");
  const [meetings, setMeetings] = useState([]);

  // Directory for Employees & Students
  const [employeesList, setEmployeesList] = useState([]);
  const [studentsList, setStudentsList] = useState([]);
  const [targetSearchQuery, setTargetSearchQuery] = useState("");

  // Kebab Context Menu State
  const [activeKebabId, setActiveKebabId] = useState(null);

  // Delete Safeguard Modal State
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, meeting: null, loading: false });

  // Create Meeting Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    host: "",
    date: new Date().toISOString().split("T")[0],
    time: "10:00 AM – 11:00 AM",
    platform: "Google Meet",
    location: "Google Meet / Online",
    meetUrl: "",
    targetType: "all", // "all" | "all_employees" | "specific_employees" | "all_students" | "specific_students" | "custom"
    selectedEmployees: [], // array of employee objects or emails
    selectedStudents: [], // array of student objects or emails
    invitedEmails: "",
    notes: "",
    actionItemsInput: "",
  });

  // Active Workspace Modal State
  const [activeMeetingModal, setActiveMeetingModal] = useState(null);
  const [newActionInput, setNewActionInput] = useState("");
  const [noteEditInput, setNoteEditInput] = useState("");

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
    const savedName = localStorage.getItem("current_user_name") || savedEmail || "Lead Trainer";
    setRole(savedRole);
    setUserEmail(savedEmail);

    setForm((prev) => ({
      ...prev,
      host: prev.host || savedName,
    }));

    // Fetch Meetings
    dbFetch("meetings", []).then((data) => {
      const cleanData = (data || []).filter(
        (m) =>
          m &&
          !m.host?.includes("Engr. Hamza") &&
          m.id !== "meet-101" &&
          m.id !== "meet-102"
      );
      setMeetings(cleanData);
    });

    // Fetch Employees
    dbFetch("employees", []).then((data) => {
      setEmployeesList(data || []);
    });

    // Fetch Students & Interns
    Promise.all([
      dbFetch("students", []).catch(() => []),
      dbFetch("interns", []).catch(() => [])
    ]).then(([sData, iData]) => {
      const combined = [...(sData || []), ...(iData || [])];
      setStudentsList(combined);
    });
  }, []);

  const saveMeetingsState = (newList) => {
    setMeetings(newList);
    dbSaveList("meetings", newList);
  };

  // Toggle selection for specific employee
  const toggleEmployeeSelection = (emp) => {
    const email = (emp.email || emp.user_id || `${emp.name?.toLowerCase().replace(/\s+/g, "")}@gmail.com`).trim();
    setForm((prev) => {
      const exists = prev.selectedEmployees.some((e) => e.email === email);
      if (exists) {
        return {
          ...prev,
          selectedEmployees: prev.selectedEmployees.filter((e) => e.email !== email),
        };
      } else {
        return {
          ...prev,
          selectedEmployees: [
            ...prev.selectedEmployees,
            { name: emp.name || "Employee", email, role: emp.role || emp.department || "Staff" },
          ],
        };
      }
    });
  };

  // Toggle selection for specific student
  const toggleStudentSelection = (stu) => {
    const email = (stu.email || stu.student_email || `${stu.name?.toLowerCase().replace(/\s+/g, "")}@student.com`).trim();
    setForm((prev) => {
      const exists = prev.selectedStudents.some((s) => s.email === email);
      if (exists) {
        return {
          ...prev,
          selectedStudents: prev.selectedStudents.filter((s) => s.email !== email),
        };
      } else {
        return {
          ...prev,
          selectedStudents: [
            ...prev.selectedStudents,
            { name: stu.name || stu.student_name || "Student", email, course: stu.course || stu.domain || "Enrolled" },
          ],
        };
      }
    });
  };

  const handleCreateMeeting = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.date || !form.time || !form.meetUrl.trim()) {
      showToast("Missing Fields ⚠️", "Please fill in Title, Date, Time, and Meeting Link.", "warning");
      return;
    }

    const todayZero = new Date();
    todayZero.setHours(0, 0, 0, 0);
    const selectedDate = new Date(form.date);
    if (selectedDate < todayZero) {
      showToast("Invalid Date 🛑", "Meeting date cannot be in the past.", "warning");
      return;
    }

    const isDuplicate = meetings.some(
      (m) =>
        m.title.trim().toLowerCase() === form.title.trim().toLowerCase() &&
        m.date === form.date &&
        m.time.trim().toLowerCase() === form.time.trim().toLowerCase()
    );

    if (isDuplicate) {
      showToast("Duplicate Error 🛑", "A meeting with identical title, date, and time already exists.", "error");
      return;
    }

    // Determine target participants based on selected Target Type
    let participantObjs = [];
    let targetAudienceLabel = "All Organization (Everyone)";
    let notificationTargetKey = "all";

    if (form.targetType === "all") {
      targetAudienceLabel = "All Organization (Employees & Students)";
      notificationTargetKey = "all";
      const empParticipants = employeesList.map((e) => ({
        name: e.name || "Employee",
        email: e.email || `${e.name?.toLowerCase().replace(/\s+/g, "")}@gmail.com`,
        attendance: "Pending",
      }));
      const stuParticipants = studentsList.map((s) => ({
        name: s.name || s.student_name || "Student",
        email: s.email || s.student_email || `${s.name?.toLowerCase().replace(/\s+/g, "")}@student.com`,
        attendance: "Pending",
      }));
      participantObjs = [...empParticipants, ...stuParticipants];
    } else if (form.targetType === "all_employees") {
      targetAudienceLabel = `All Employees (${employeesList.length} Staff)`;
      notificationTargetKey = "all_employees";
      participantObjs = employeesList.map((e) => ({
        name: e.name || "Employee",
        email: e.email || `${e.name?.toLowerCase().replace(/\s+/g, "")}@gmail.com`,
        attendance: "Pending",
      }));
    } else if (form.targetType === "specific_employees") {
      if (form.selectedEmployees.length === 0) {
        showToast("No Employee Selected ⚠️", "Please select at least one employee from the list.", "warning");
        return;
      }
      const names = form.selectedEmployees.map((e) => e.name).join(", ");
      targetAudienceLabel = `Specific Staff: ${names}`;
      notificationTargetKey = form.selectedEmployees.map((e) => e.email.toLowerCase()).join(",");
      participantObjs = form.selectedEmployees.map((e) => ({
        name: e.name,
        email: e.email,
        attendance: "Pending",
      }));
    } else if (form.targetType === "all_students") {
      targetAudienceLabel = `All Students & Interns (${studentsList.length} Enrolled)`;
      notificationTargetKey = "all_students";
      participantObjs = studentsList.map((s) => ({
        name: s.name || s.student_name || "Student",
        email: s.email || s.student_email || `${s.name?.toLowerCase().replace(/\s+/g, "")}@student.com`,
        attendance: "Pending",
      }));
    } else if (form.targetType === "specific_students") {
      if (form.selectedStudents.length === 0) {
        showToast("No Student Selected ⚠️", "Please select at least one student from the list.", "warning");
        return;
      }
      const names = form.selectedStudents.map((s) => s.name).join(", ");
      targetAudienceLabel = `Specific Student(s): ${names}`;
      notificationTargetKey = form.selectedStudents.map((s) => s.email.toLowerCase()).join(",");
      participantObjs = form.selectedStudents.map((s) => ({
        name: s.name,
        email: s.email,
        attendance: "Pending",
      }));
    } else if (form.targetType === "custom") {
      const emailList = form.invitedEmails.split(",").map((e) => e.trim()).filter(Boolean);
      targetAudienceLabel = `Custom: ${emailList.join(", ") || "Invited Attendees"}`;
      notificationTargetKey = emailList.join(",");
      participantObjs = emailList.map((email) => ({
        name: email.split("@")[0],
        email: email,
        attendance: "Pending",
      }));
    }

    // Default host as participant if empty
    if (participantObjs.length === 0) {
      participantObjs = [{ name: userEmail.split("@")[0] || "Host", email: userEmail, attendance: "Present" }];
    }

    const parsedActionItems = form.actionItemsInput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((itemStr, idx) => ({
        id: `act-${Date.now()}-${idx}`,
        item: itemStr,
        assignedTo: participantObjs[0]?.email || userEmail,
        status: "Pending",
      }));

    const newMeeting = {
      id: "meet-" + Date.now(),
      title: form.title,
      host: form.host || userEmail || "Management",
      date: form.date,
      time: form.time,
      platform: form.platform || "Google Meet",
      location: `${form.platform || "Google Meet"} / Online`,
      meetUrl: form.meetUrl,
      target_type: form.targetType,
      target_audience_label: targetAudienceLabel,
      target_key: notificationTargetKey,
      participants: participantObjs,
      notes: form.notes,
      actionItems: parsedActionItems,
      created_at: new Date().toISOString(),
    };

    const updated = [newMeeting, ...meetings];
    saveMeetingsState(updated);

    // ==========================================
    // DISPATCH TARGETED NOTIFICATION TO ANNOUNCEMENT FEED
    // ==========================================
    try {
      const existingAnnouncements = await dbFetch("announcements", []).catch(() => []);
      const newNotification = {
        id: `ann-meet-${Date.now()}`,
        title: `📅 New Meeting: ${form.title}`,
        message: `Admin has scheduled a meeting for ${form.date} (${form.time}) via ${form.platform}.\nTarget: ${targetAudienceLabel}\nLink: ${form.meetUrl}`,
        content: `Meeting on ${form.date} at ${form.time} via ${form.platform}. Join Link: ${form.meetUrl}`,
        posted_by: "Admin / Management",
        target: notificationTargetKey,
        target_audience: form.targetType,
        target_label: targetAudienceLabel,
        meet_url: form.meetUrl,
        type: "meeting",
        date: form.date,
        created_at: new Date().toISOString(),
      };

      const updatedAnnouncements = [newNotification, ...existingAnnouncements];
      dbSaveList("announcements", updatedAnnouncements);
      window.dispatchEvent(new Event("storage"));
    } catch (err) {
      console.warn("Could not dispatch meeting notification:", err);
    }

    setCreateModalOpen(false);
    setForm({
      title: "",
      host: userEmail || "Management",
      date: new Date().toISOString().split("T")[0],
      time: "10:00 AM – 11:00 AM",
      platform: "Google Meet",
      location: "Google Meet / Online",
      meetUrl: "",
      targetType: "all",
      selectedEmployees: [],
      selectedStudents: [],
      invitedEmails: "",
      notes: "",
      actionItemsInput: "",
    });

    showToast(
      "Meeting Scheduled & Notification Sent 🚀",
      `Meeting arranged for ${targetAudienceLabel}. Notification dispatched!`,
      "success"
    );
  };

  const executeDeleteMeeting = async () => {
    if (!deleteModal.meeting) return;
    setDeleteModal(prev => ({ ...prev, loading: true }));
    const id = deleteModal.meeting.id;

    try {
      const updated = meetings.filter((m) => m.id !== id);
      saveMeetingsState(updated);
      showToast("Meeting Deleted 🗑️", "Meeting session canceled successfully.", "info");
    } catch(e) {
      showToast("Error", "Failed to delete meeting.", "error");
    } finally {
      setDeleteModal({ isOpen: false, meeting: null, loading: false });
    }
  };

  return (
    <div className="space-y-6 w-full">
      {/* Modal */}
      <Modal isOpen={modal.isOpen} title={modal.title} message={modal.message} type={modal.type} onClose={closeModal} />

      {/* HEADER BANNER */}
      <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] bg-[#EFF6FF] px-2.5 py-1 rounded-full border border-[#2563EB]/20">
              Official Meeting Hub
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-[#0F172A] mt-1.5 flex items-center gap-2.5">
            <FaVideo className="text-[#2563EB]" />
            <span>Meeting Management System</span>
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Create Meetings • Attendance Tracking • Minutes of Meeting (MOM) • Action Items Engine
          </p>
        </div>

        {(role === "admin" || role === "hr" || role === "manager") && (
          <button
            onClick={() => setCreateModalOpen(true)}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <FaPlusCircle className="text-sm" />
            <span>+ Create New Meeting</span>
          </button>
        )}
      </div>

      {/* MEETINGS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {meetings.length === 0 ? (
          <div className="md:col-span-2 bg-white p-12 text-center rounded-2xl border border-[#E2E8F0] text-[#64748B] italic text-xs">
            No scheduled meetings. Click "+ Create New Meeting" to schedule one.
          </div>
        ) : (
          meetings.map((m, idx) => {
            const presentCount = (m.participants || []).filter((p) => p.attendance === "Present").length;
            const totalCount = (m.participants || []).length;

            return (
              <div key={m.id} className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-sm space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB]/20">
                          {m.date} • {m.time}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                          {m.platform || "Google Meet"}
                        </span>
                      </div>
                      <h3 className="font-bold text-[#0F172A] text-base mt-1.5">{m.title}</h3>
                    </div>

                    {/* Kebab Context Menu for Delete Safeguard */}
                    {(role === "admin" || role === "hr" || role === "manager") && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setActiveKebabId(activeKebabId === m.id ? null : m.id)}
                          className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                        >
                          <FaEllipsisV className="text-xs" />
                        </button>

                        {activeKebabId === m.id && (
                          <div className={`absolute right-0 w-44 rounded-xl bg-white p-1.5 shadow-xl border border-[#E2E8F0] z-50 space-y-0.5 text-xs text-left animate-in fade-in zoom-in-95 duration-100 ${
                            idx >= Math.max(0, meetings.length - 2)
                              ? "bottom-full mb-1 origin-bottom-right"
                              : "top-full mt-1 origin-top-right"
                          }`}>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMeetingModal(m);
                                setNoteEditInput(m.notes || "");
                                setActiveKebabId(null);
                              }}
                              className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-[#EFF6FF] text-[#0F172A] hover:text-[#2563EB] font-semibold transition-colors"
                            >
                              Open Workspace
                            </button>
                            <div className="border-t border-[#E2E8F0] my-1" />
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteModal({ isOpen: true, meeting: m, loading: false });
                                setActiveKebabId(null);
                              }}
                              className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-rose-50 text-rose-600 font-semibold transition-colors"
                            >
                              Delete Meeting
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 text-[#64748B]">
                    {/* Target Audience Badge */}
                    <div className="p-2.5 rounded-xl bg-blue-50/60 border border-blue-100 text-xs text-blue-900 flex items-start gap-2">
                      <FaUserTag className="text-[#2563EB] text-sm mt-0.5 shrink-0" />
                      <div>
                        <span className="text-[10px] font-bold text-[#2563EB] uppercase block">Target Audience:</span>
                        <p className="font-semibold text-xs text-[#0F172A]">
                          {m.target_audience_label || m.attendee_type || "All Organization"}
                        </p>
                      </div>
                    </div>

                    <p><strong>Host:</strong> <span className="text-[#0F172A] font-medium">{m.host}</span></p>
                    <p>
                      <strong>Meeting Link:</strong>{" "}
                      <a
                        href={m.meetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#2563EB] font-bold inline-flex items-center gap-1 hover:underline"
                      >
                        <FaLink className="text-[10px]" /> {m.meetUrl}
                      </a>
                    </p>
                    <p>
                      <strong>Confirmed Attendees:</strong>{" "}
                      <span className="font-semibold text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded-full border border-[#2563EB]/20">
                        {presentCount} / {totalCount} Present
                      </span>
                    </p>
                  </div>

                  {/* Notes Preview */}
                  <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-1">
                    <span className="font-bold text-[#0F172A] flex items-center gap-1.5 text-[11px]">
                      <FaStickyNote className="text-[#2563EB]" />
                      <span>Meeting Notes (Minutes of Meeting):</span>
                    </span>
                    <p className="text-[#64748B] text-[11px] line-clamp-2">{m.notes || "No notes recorded yet."}</p>
                  </div>
                </div>

                {/* Open Workspace Button */}
                <button
                  onClick={() => {
                    setActiveMeetingModal(m);
                    setNoteEditInput(m.notes || "");
                  }}
                  className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold py-2.5 rounded-xl transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer text-xs"
                >
                  <FaFileSignature />
                  <span>Open Meeting Workspace</span>
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* CREATE MEETING MODAL (Enhanced with Student / Employee Target Selector) */}
      {createModalOpen && (
        <div 
          onClick={() => setCreateModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 text-left animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh] overflow-hidden"
          >
            {/* Modal Fixed Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-6 pb-4 shrink-0 bg-white">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] bg-[#EFF6FF] px-2.5 py-0.5 rounded-full border border-[#2563EB]/20">
                  Meeting Scheduler
                </span>
                <h3 className="font-bold text-[#0F172A] text-lg flex items-center gap-2 mt-1">
                  <FaVideo className="text-[#2563EB]" />
                  <span>Create & Schedule New Meeting</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Scrollable Form Body */}
            <form onSubmit={handleCreateMeeting} className="p-6 pt-4 space-y-4 text-xs overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Meeting Title *
                </label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. MERN Architecture & Sprint Sync / Student Viva"
                  className="w-full rounded-xl border border-[#E2E8F0] px-3.5 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                />
              </div>

              {/* Target Audience / Notification Recipient Selector */}
              <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase text-[#0F172A] flex items-center gap-1.5">
                    <FaBell className="text-[#2563EB]" />
                    <span>Who is this meeting for? (Target Audience & Notification) *</span>
                  </label>
                </div>

                {/* Target Type Selector Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: "all", label: "All Organization", icon: FaUsers },
                    { id: "all_employees", label: "All Employees", icon: FaBriefcase },
                    { id: "specific_employees", label: "Specific Employee(s)", icon: FaUserCheck },
                    { id: "all_students", label: "All Students", icon: FaGraduationCap },
                    { id: "specific_students", label: "Specific Student(s)", icon: FaChalkboardTeacher },
                    { id: "custom", label: "Custom Emails", icon: FaLink },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setForm({ ...form, targetType: t.id });
                        setTargetSearchQuery("");
                      }}
                      className={`p-2.5 rounded-xl border text-left flex items-center gap-2 font-medium transition-colors cursor-pointer text-xs ${
                        form.targetType === t.id
                          ? "bg-[#2563EB] text-white border-[#2563EB] shadow-xs"
                          : "bg-white text-[#0F172A] border-[#E2E8F0] hover:bg-blue-50/50"
                      }`}
                    >
                      <t.icon className={`text-xs shrink-0 ${form.targetType === t.id ? "text-white" : "text-[#2563EB]"}`} />
                      <span className="text-[11px] leading-tight">{t.label}</span>
                    </button>
                  ))}
                </div>

                {/* 1. If Specific Employee(s) is selected */}
                {form.targetType === "specific_employees" && (
                  <div className="bg-white p-3.5 rounded-xl border border-[#E2E8F0] space-y-2.5 animate-in fade-in">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-[#0F172A]">
                        Select Employee(s) to Invite ({form.selectedEmployees.length} selected):
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (form.selectedEmployees.length === employeesList.length) {
                            setForm((prev) => ({ ...prev, selectedEmployees: [] }));
                          } else {
                            setForm((prev) => ({
                              ...prev,
                              selectedEmployees: employeesList.map((e) => ({
                                name: e.name || "Employee",
                                email: (e.email || `${e.name?.toLowerCase().replace(/\s+/g, "")}@gmail.com`).trim(),
                                role: e.role || "Staff",
                              })),
                            }));
                          }
                        }}
                        className="text-[10px] font-bold text-[#2563EB] hover:underline"
                      >
                        {form.selectedEmployees.length === employeesList.length ? "Deselect All" : "Select All"}
                      </button>
                    </div>

                    {/* Search bar */}
                    <div className="relative">
                      <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]" />
                      <input
                        type="text"
                        value={targetSearchQuery}
                        onChange={(e) => setTargetSearchQuery(e.target.value)}
                        placeholder="Search employee name or role..."
                        className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-blue-600 bg-slate-50"
                      />
                    </div>

                    {/* Employee Directory List */}
                    <div className="max-h-40 overflow-y-auto space-y-1 pr-1 divide-y divide-slate-100">
                      {employeesList
                        .filter((emp) =>
                          (emp.name || "").toLowerCase().includes(targetSearchQuery.toLowerCase()) ||
                          (emp.role || "").toLowerCase().includes(targetSearchQuery.toLowerCase())
                        )
                        .map((emp) => {
                          const empEmail = (emp.email || `${emp.name?.toLowerCase().replace(/\s+/g, "")}@gmail.com`).trim();
                          const isSelected = form.selectedEmployees.some((e) => e.email === empEmail);

                          return (
                            <div
                              key={emp.id || empEmail}
                              onClick={() => toggleEmployeeSelection(emp)}
                              className={`p-2 rounded-lg flex items-center justify-between cursor-pointer text-xs transition-colors ${
                                isSelected ? "bg-blue-50 border border-blue-200" : "hover:bg-slate-50"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  className="rounded accent-blue-600 cursor-pointer"
                                />
                                <div>
                                  <p className="font-bold text-[#0F172A] text-xs">{emp.name}</p>
                                  <p className="text-[10px] text-slate-500">{emp.role || emp.department || "Staff"} • {empEmail}</p>
                                </div>
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isSelected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                                {isSelected ? "Invited ✓" : "Add +"}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* 2. If Specific Student(s) is selected */}
                {form.targetType === "specific_students" && (
                  <div className="bg-white p-3.5 rounded-xl border border-[#E2E8F0] space-y-2.5 animate-in fade-in">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-[#0F172A]">
                        Select Student(s) to Invite ({form.selectedStudents.length} selected):
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (form.selectedStudents.length === studentsList.length) {
                            setForm((prev) => ({ ...prev, selectedStudents: [] }));
                          } else {
                            setForm((prev) => ({
                              ...prev,
                              selectedStudents: studentsList.map((s) => ({
                                name: s.name || s.student_name || "Student",
                                email: (s.email || s.student_email || `${s.name?.toLowerCase().replace(/\s+/g, "")}@student.com`).trim(),
                                course: s.course || s.domain || "Enrolled",
                              })),
                            }));
                          }
                        }}
                        className="text-[10px] font-bold text-[#2563EB] hover:underline"
                      >
                        {form.selectedStudents.length === studentsList.length ? "Deselect All" : "Select All"}
                      </button>
                    </div>

                    {/* Search bar */}
                    <div className="relative">
                      <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]" />
                      <input
                        type="text"
                        value={targetSearchQuery}
                        onChange={(e) => setTargetSearchQuery(e.target.value)}
                        placeholder="Search student name or course..."
                        className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-blue-600 bg-slate-50"
                      />
                    </div>

                    {/* Student Directory List */}
                    <div className="max-h-40 overflow-y-auto space-y-1 pr-1 divide-y divide-slate-100">
                      {studentsList
                        .filter((stu) =>
                          (stu.name || stu.student_name || "").toLowerCase().includes(targetSearchQuery.toLowerCase()) ||
                          (stu.course || stu.domain || "").toLowerCase().includes(targetSearchQuery.toLowerCase())
                        )
                        .map((stu) => {
                          const stuName = stu.name || stu.student_name || "Student";
                          const stuEmail = (stu.email || stu.student_email || `${stuName.toLowerCase().replace(/\s+/g, "")}@student.com`).trim();
                          const isSelected = form.selectedStudents.some((s) => s.email === stuEmail);

                          return (
                            <div
                              key={stu.id || stuEmail}
                              onClick={() => toggleStudentSelection(stu)}
                              className={`p-2 rounded-lg flex items-center justify-between cursor-pointer text-xs transition-colors ${
                                isSelected ? "bg-blue-50 border border-blue-200" : "hover:bg-slate-50"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  className="rounded accent-blue-600 cursor-pointer"
                                />
                                <div>
                                  <p className="font-bold text-[#0F172A] text-xs">{stuName}</p>
                                  <p className="text-[10px] text-slate-500">{stu.course || stu.domain || "Enrolled Course"} • {stuEmail}</p>
                                </div>
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isSelected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                                {isSelected ? "Invited ✓" : "Add +"}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* 3. If Broadcast / All is selected */}
                {(form.targetType === "all" || form.targetType === "all_employees" || form.targetType === "all_students") && (
                  <div className="bg-blue-50/80 p-3 rounded-xl border border-blue-200 text-xs text-blue-900 flex items-center gap-2">
                    <FaBell className="text-blue-600 text-base shrink-0 animate-bounce" />
                    <p className="leading-relaxed">
                      {form.targetType === "all" && `📢 Notification will automatically be broadcasted to all ${employeesList.length} employees and all ${studentsList.length} students/interns.`}
                      {form.targetType === "all_employees" && `📢 Notification will automatically be broadcasted to all ${employeesList.length} active employees.`}
                      {form.targetType === "all_students" && `📢 Notification will automatically be broadcasted to all ${studentsList.length} enrolled students & interns.`}
                    </p>
                  </div>
                )}

                {/* 4. If Custom Emails is selected */}
                {form.targetType === "custom" && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                      Invited Attendee Emails (Comma Separated)
                    </label>
                    <input
                      type="text"
                      value={form.invitedEmails}
                      onChange={(e) => setForm({ ...form, invitedEmails: e.target.value })}
                      placeholder="student@gmail.com, employee@gmail.com"
                      className="w-full rounded-xl border border-slate-200 p-2 text-xs text-slate-900 outline-none focus:border-blue-600 font-mono bg-white"
                    />
                  </div>
                )}
              </div>

              {/* 2-Column Responsive Grid for Date & Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    Meeting Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    Time Slot *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                    placeholder="11:00 AM – 12:00 PM"
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    Platform *
                  </label>
                  <select
                    value={form.platform}
                    onChange={(e) => setForm({ ...form, platform: e.target.value })}
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] bg-white font-medium"
                  >
                    <option value="Google Meet">Google Meet</option>
                    <option value="Zoom Cloud">Zoom Cloud</option>
                    <option value="Microsoft Teams">Microsoft Teams</option>
                    <option value="Physical Boardroom">Physical Boardroom</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    Meeting Link URL *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.meetUrl}
                    onChange={(e) => setForm({ ...form, meetUrl: e.target.value })}
                    placeholder="https://meet.google.com/xyz-abc"
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-mono"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold py-3 rounded-xl transition-colors shadow-xs cursor-pointer text-xs flex items-center justify-center gap-2"
                >
                  <FaVideo className="text-xs" />
                  <span>Schedule Meeting & Dispatch Targeted Notifications 🚀</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMATION DESTRUCTIVE MODAL FOR DELETE MEETING */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E2E8F0] space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 border-b border-[#E2E8F0] pb-3 text-[#0F172A]">
              <FaExclamationTriangle className="text-xl text-[#2563EB]" />
              <h3 className="font-bold text-[#0F172A] text-base">Delete Meeting Session?</h3>
            </div>

            <p className="text-xs text-[#64748B] leading-relaxed">
              Are you sure you want to permanently cancel and delete <strong>{deleteModal.meeting?.title}</strong>? This action cannot be undone.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModal({ isOpen: false, meeting: null, loading: false })}
                className="flex-1 py-2.5 rounded-xl bg-white hover:bg-[#F8FAFC] text-[#2563EB] border border-[#E2E8F0] font-semibold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDeleteMeeting}
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

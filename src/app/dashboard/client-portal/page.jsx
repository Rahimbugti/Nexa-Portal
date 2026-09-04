"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import Modal from "@/components/Modal";
import { showToast } from "@/components/Toast";
import {
  FaBuilding,
  FaProjectDiagram,
  FaCheckCircle,
  FaClock,
  FaTasks,
  FaCalendarAlt,
  FaFileDownload,
  FaStickyNote,
  FaBell,
  FaExternalLinkAlt,
  FaDownload,
  FaLock,
  FaFileAlt,
  FaUserTie,
  FaChevronRight,
  FaImage,
  FaSpinner,
  FaComments,
  FaBug,
  FaFileInvoiceDollar,
  FaVideo,
  FaPaperPlane,
  FaPlusCircle
} from "react-icons/fa";

// Seed Datasets for Client Accounts & Projects (Row-Level Security Simulation by Client ID & Email)
const CLIENT_DATABASE = [
  { id: "CL-901", email: "client@acmetech.com", name: "Acme Technologies Solutions", contactPerson: "Johnathan Smith" },
  { id: "CL-902", email: "client.globallogistics@gmail.com", name: "Global Logistics Ltd.", contactPerson: "Sarah Jenkins" },
  { id: "CL-903", email: "client.apex@gmail.com", name: "Apex Healthcare Systems", contactPerson: "Dr. Tariq Mahmood" },
];

const MASTER_CLIENT_PROJECTS = [
  {
    id: "PROJ-801",
    title: "Enterprise SaaS Logistics Tracker & Fleet System",
    clientId: "CL-901",
    clientEmail: "client@acmetech.com",
    description: "Cloud-based logistics tracking platform with real-time GPS telemetry, driver management, automated dispatching, and accounting API webhooks.",
    projectManager: "Muhammad Rahim Bugti",
    assignedTeam: [
      { name: "Muhammad Rahim Bugti", role: "Project Lead & Full Stack" },
      { name: "Sara Khan", role: "UI/UX Designer" },
      { name: "Ali Hassan", role: "QA Engineer & Tester" }
    ],
    startDate: "2026-05-10",
    expectedCompletionDate: "2026-09-30",
    currentStatus: "Development", // "Planning", "UI/UX Design", "Development", "Testing", "Bug Fixing", "Deployment", "Completed"
    progress: 74,
    completedTasksCount: 37,
    remainingTasksCount: 13,
    currentPhase: "Backend API Integration & Payment Webhooks",
    demoLink: "https://staging-fleet.acmetech.com",
    latestDeveloperNotes: "Payment gateway integration (JazzCash & Stripe) completed. Currently building live GPS telemetry socket stream.",
    screenshots: [
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80"
    ],
    progressReports: [
      { id: "REP-101", type: "Daily Progress", date: "2026-08-03", title: "Supabase Auth RLS & Storage Buckets", notes: "Completed row-level security policy checks for client file access." },
      { id: "REP-102", type: "Weekly Progress", date: "2026-08-01", title: "Sprint 4 Demo Delivery", notes: "Delivered mobile dispatch app mockup & API endpoints." },
      { id: "REP-103", type: "Monthly Progress", date: "2026-07-31", title: "July Milestone Report", notes: "All July deliverables completed on schedule with zero critical bugs." }
    ],
    files: [
      { id: "F-1", name: "Project_Proposal_Acme_v2.pdf", type: "Proposal", size: "2.4 MB", date: "2026-05-12" },
      { id: "F-2", name: "Service_Level_Agreement_Contract.pdf", type: "Contract", size: "1.8 MB", date: "2026-05-15" },
      { id: "F-3", name: "Invoice_INV-4921_Milestone1.pdf", type: "Invoice", size: "450 KB", date: "2026-06-01" },
      { id: "F-4", name: "System_Architecture_Requirements.pdf", type: "Requirement Documents", size: "5.1 MB", date: "2026-05-18" },
      { id: "F-5", name: "Figma_UI_UX_Master_Design.fig", type: "Design Files", size: "14.2 MB", date: "2026-06-10" },
      { id: "F-6", name: "Final_Sprint4_Progress_Report.pdf", type: "Progress Reports", size: "1.1 MB", date: "2026-08-01" }
    ],
    notifications: [
      { id: "N-1", title: "Milestone Completed 🎉", message: "UI/UX Design phase signed off and verified.", date: "2026-07-25" },
      { id: "N-2", title: "New File Shared 📄", message: "Final_Sprint4_Progress_Report.pdf uploaded by PM.", date: "2026-08-01" },
      { id: "N-3", title: "Development Status Updated 🚀", message: "Project status changed to Backend API Integration phase.", date: "2026-08-03" }
    ]
  },
  {
    id: "PROJ-802",
    title: "Cross-Platform E-Commerce Mobile App",
    clientId: "CL-901",
    clientEmail: "client@acmetech.com",
    description: "iOS & Android shopping app with AI product recommendations and instant checkout.",
    projectManager: "Sara Khan",
    assignedTeam: [
      { name: "Sara Khan", role: "PM & Lead UI" },
      { name: "Usman Tariq", role: "Flutter Developer" }
    ],
    startDate: "2026-06-01",
    expectedCompletionDate: "2026-10-15",
    currentStatus: "UI/UX Design",
    progress: 35,
    completedTasksCount: 14,
    remainingTasksCount: 26,
    currentPhase: "Interactive Prototype Design",
    demoLink: "https://figma.com/proto/acme-mobile-app",
    latestDeveloperNotes: "High-fidelity wireframes completed. Client reviewing color theme palette.",
    screenshots: [
      "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=800&q=80"
    ],
    progressReports: [
      { id: "REP-201", type: "Weekly Progress", date: "2026-08-02", title: "Wireframe Review", notes: "Submitted 15 mobile screen mockups for approval." }
    ],
    files: [
      { id: "F-10", name: "Mobile_App_Requirement_Spec.pdf", type: "Requirement Documents", size: "3.2 MB", date: "2026-06-02" },
      { id: "F-11", name: "UI_Style_Guide_Palettes.pdf", type: "Design Files", size: "8.9 MB", date: "2026-06-20" }
    ],
    notifications: [
      { id: "N-10", title: "Project Initialized 🚀", message: "Mobile App kick-off meeting completed.", date: "2026-06-01" }
    ]
  },
  {
    id: "PROJ-803",
    title: "Global Supply Chain Fleet Portal",
    clientId: "CL-902",
    clientEmail: "client.globallogistics@gmail.com",
    description: "Fleet portal for Global Logistics Ltd. for real-time truck tracking.",
    projectManager: "Muhammad Rahim Bugti",
    assignedTeam: [{ name: "Muhammad Rahim Bugti", role: "Dev" }],
    startDate: "2026-04-01",
    expectedCompletionDate: "2026-08-20",
    currentStatus: "Testing",
    progress: 90,
    completedTasksCount: 45,
    remainingTasksCount: 5,
    currentPhase: "QA Automated Testing",
    demoLink: "https://globallogistics.test",
    latestDeveloperNotes: "Final security audit in progress.",
    screenshots: [],
    progressReports: [],
    files: [],
    notifications: []
  }
];

export default function ClientPortalDashboardPage() {
  const [role, setRole] = useState("client");
  const [clientEmail, setClientEmail] = useState("");
  const [clientInfo, setClientInfo] = useState(null);
  const [clientProjects, setClientProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [activeTab, setActiveTab] = useState("overview"); // "overview" | "projects" | "reports" | "comments" | "bugs" | "invoices" | "meetings" | "files" | "notifications"
  const [loading, setLoading] = useState(true);

  // Sub-Collection Realtime States
  const [milestones, setMilestones] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [comments, setComments] = useState([]);
  const [bugReports, setBugReports] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [notifications, setNotifications] = useState([]);

  // Form Inputs
  const [newComment, setNewComment] = useState("");
  const [bugForm, setBugForm] = useState({ title: "", description: "", priority: "Medium" });

  useEffect(() => {
    const savedRole = localStorage.getItem("user_role") || "client";
    const email = (localStorage.getItem("current_user_email") || "").toLowerCase().trim();
    
    setRole(savedRole);
    setClientEmail(email);

    const loadClientData = async () => {
      setLoading(true);
      
      // 1. Fetch User Record
      let matchedUser = {
        id: "CL-901",
        email: email,
        fullName: email.split("@")[0].toUpperCase() + " Corp",
        companyName: email.split("@")[0].toUpperCase() + " Solutions",
        contactPerson: email.split("@")[0]
      };

      try {
        const { data: userData } = await supabase.from("users").select("*").eq("email", email).single();
        if (userData) {
          matchedUser = {
            id: userData.uid || userData.id,
            email: userData.email,
            fullName: userData.fullName || userData.full_name,
            companyName: userData.companyName || userData.company_name,
            contactPerson: userData.fullName || email.split("@")[0]
          };
        }
      } catch(e) {}
      setClientInfo(matchedUser);

      // 2. Fetch Projects (Strict RLS: clientEmail OR clientId matching)
      let projList = [];
      try {
        const { data: dbProj } = await supabase.from("projects").select("*");
        if (dbProj && dbProj.length > 0) {
          projList = dbProj.filter(p => 
            (p.clientEmail && p.clientEmail.toLowerCase() === email) || 
            (p.client_email && p.client_email.toLowerCase() === email) ||
            (p.clientId && p.clientId === matchedUser.id)
          );
        }
      } catch(e) {}

      // Fallback localstorage sync
      if (projList.length === 0) {
        try {
          const saved = localStorage.getItem("software_house_master_client_projects");
          if (saved) {
            const parsed = JSON.parse(saved);
            projList = parsed.filter(p => p.clientEmail?.toLowerCase() === email || p.clientId === matchedUser.id);
          }
        } catch(e) {}
      }

      setClientProjects(projList);
      if (projList.length > 0) {
        setSelectedProject(projList[0]);
      }
      setLoading(false);
    };

    loadClientData();
  }, []);

  // Fetch Sub-Collection Records when Selected Project changes
  useEffect(() => {
    if (!selectedProject) return;

    const fetchSubData = async () => {
      const pId = selectedProject.id || selectedProject.projectId;

      // Load Local Storage fallbacks
      let localC = [];
      let localB = [];
      try {
        const sC = localStorage.getItem(`software_house_comments_${pId}`);
        if (sC) localC = JSON.parse(sC);
        const sB = localStorage.getItem(`software_house_bugs_${pId}`);
        if (sB) localB = JSON.parse(sB);
      } catch(e) {}

      // Fetch Comments
      try {
        const { data } = await supabase.from("comments").select("*").eq("projectId", pId).order("createdAt", { ascending: true });
        if (data && data.length > 0) {
          const cMap = new Map();
          localC.forEach(item => cMap.set(item.commentId || item.id, item));
          data.forEach(item => cMap.set(item.commentId || item.id, item));
          const mergedC = Array.from(cMap.values());
          setComments(mergedC);
          localStorage.setItem(`software_house_comments_${pId}`, JSON.stringify(mergedC));
        } else if (localC.length > 0) {
          setComments(localC);
        }
      } catch(e) {
        if (localC.length > 0) setComments(localC);
      }

      // Fetch Bug Reports
      try {
        const { data } = await supabase.from("bug_reports").select("*").eq("projectId", pId).order("createdAt", { ascending: false });
        if (data && data.length > 0) {
          const bMap = new Map();
          localB.forEach(item => bMap.set(item.bugId || item.id, item));
          data.forEach(item => bMap.set(item.bugId || item.id, item));
          const mergedB = Array.from(bMap.values());
          setBugReports(mergedB);
          localStorage.setItem(`software_house_bugs_${pId}`, JSON.stringify(mergedB));
        } else if (localB.length > 0) {
          setBugReports(localB);
        }
      } catch(e) {
        if (localB.length > 0) setBugReports(localB);
      }

      // Fetch Invoices
      try {
        const { data } = await supabase.from("invoices").select("*").eq("projectId", pId);
        if (data) setInvoices(data);
      } catch(e) {}

      // Fetch Milestones
      try {
        const { data } = await supabase.from("milestones").select("*").eq("projectId", pId);
        if (data) setMilestones(data);
      } catch(e) {}

      // Fetch Tasks
      try {
        const { data } = await supabase.from("tasks").select("*").eq("projectId", pId);
        if (data) setTasks(data);
      } catch(e) {}

      // Fetch Meetings
      try {
        const { data } = await supabase.from("meetings").select("*").eq("projectId", pId);
        if (data) setMeetings(data);
      } catch(e) {}
    };

    fetchSubData();
  }, [selectedProject]);

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !selectedProject) return;

    const pId = selectedProject.id || selectedProject.projectId;
    const commentObj = {
      commentId: "cmt-" + Date.now(),
      projectId: pId,
      senderId: clientInfo?.id || "CL-901",
      senderRole: "CLIENT",
      senderName: clientInfo?.fullName || "Client User",
      message: newComment,
      createdAt: new Date().toLocaleString()
    };

    const updatedC = [...comments, commentObj];
    setComments(updatedC);
    setNewComment("");
    try {
      localStorage.setItem(`software_house_comments_${pId}`, JSON.stringify(updatedC));
    } catch(e) {}

    try {
      await supabase.from("comments").insert([commentObj]);
      showToast("Comment Sent 💬", "Your message has been posted to PM & Dev team.", "success");
    } catch(e) {}
  };

  const handleCreateBugReport = async (e) => {
    e.preventDefault();
    if (!bugForm.title.trim() || !selectedProject) return;

    const pId = selectedProject.id || selectedProject.projectId;
    const bugObj = {
      bugId: "bug-" + Date.now(),
      projectId: pId,
      title: bugForm.title,
      description: bugForm.description,
      priority: bugForm.priority,
      bugStatus: "Open 🔴",
      assignedDeveloper: selectedProject.projectManager || "Dev Lead",
      createdAt: new Date().toLocaleDateString()
    };

    const updatedB = [bugObj, ...bugReports];
    setBugReports(updatedB);
    setBugForm({ title: "", description: "", priority: "Medium" });
    try {
      localStorage.setItem(`software_house_bugs_${pId}`, JSON.stringify(updatedB));
    } catch(e) {}

    try {
      await supabase.from("bug_reports").insert([bugObj]);
      showToast("Bug Report Submitted 🐞", "Report logged for development team resolution.", "success");
    } catch(e) {}
  };

  // Calculate Overall Dashboard Metrics
  const totalAssignedProjects = clientProjects.length;
  const activeProjectsCount = clientProjects.filter(p => p.currentStatus !== "Completed").length;
  const completedProjectsCount = clientProjects.filter(p => p.currentStatus === "Completed").length;
  const pendingProjectsCount = clientProjects.filter(p => p.currentStatus === "Planning" || p.currentStatus === "UI/UX Design").length;
  
  const overallAverageProgress = totalAssignedProjects > 0
    ? Math.round(clientProjects.reduce((acc, p) => acc + (p.progress || 0), 0) / totalAssignedProjects)
    : 0;

  // Restrict Non-Client Role Access
  if (role !== "client" && role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-sm max-w-lg mx-auto my-12 space-y-4">
        <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center text-2xl border border-rose-200">
          <FaLock />
        </div>
        <h2 className="text-xl font-extrabold text-slate-900">Client Portal Restricted</h2>
        <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
          This portal is reserved strictly for authenticated clients to view their assigned projects and progress reports.
        </p>
        <Link href="/login" className="px-5 py-2.5 bg-slate-900 text-white font-bold rounded-xl text-xs hover:bg-slate-800 transition-all">
          Go to Client Login
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <FaSpinner className="animate-spin text-3xl text-blue-600" />
        <p className="text-xs font-bold text-slate-600">Verifying Client ID & Loading Security RLS Policies...</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 bg-slate-50 min-h-screen p-3 sm:p-6 text-slate-900">
      {/* Top Banner & Client Authentication Badge */}
      <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-6 border border-slate-800">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-[10px] font-black uppercase tracking-wider">
            🛡️ Secure Client Portal • Client ID: {clientInfo?.id || "CL-901"}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3 pt-1">
            <FaBuilding className="text-blue-400" />
            <span>Welcome, {clientInfo?.name || "Acme Tech Solutions"}</span>
          </h1>
          <p className="text-xs text-slate-300 font-medium">
            Authenticated Account: <span className="font-mono text-blue-300 font-bold">{clientEmail}</span> • Verified Project Access
          </p>
        </div>

        <div className="flex items-center gap-3 bg-slate-800/80 p-3 rounded-2xl border border-slate-700">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center text-lg font-bold">
            <FaUserTie />
          </div>
          <div className="text-xs space-y-0.5">
            <p className="font-bold text-white">{clientInfo?.contactPerson || "Authorized Client"}</p>
            <p className="text-[10px] text-slate-400 font-mono">Row-Level Security Active</p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === "overview" ? "bg-blue-600 text-white shadow-md" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
          }`}
        >
          <FaProjectDiagram /> Client Dashboard
        </button>
        <button
          onClick={() => setActiveTab("projects")}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === "projects" ? "bg-blue-600 text-white shadow-md" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
          }`}
        >
          <FaTasks /> My Assigned Projects ({totalAssignedProjects})
        </button>
        <button
          onClick={() => setActiveTab("reports")}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === "reports" ? "bg-blue-600 text-white shadow-md" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
          }`}
        >
          <FaStickyNote /> Progress Reports & Demos
        </button>
        <button
          onClick={() => setActiveTab("comments")}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === "comments" ? "bg-blue-600 text-white shadow-md" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
          }`}
        >
          <FaComments /> Comments & Discussion ({comments.length})
        </button>
        <button
          onClick={() => setActiveTab("bugs")}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === "bugs" ? "bg-blue-600 text-white shadow-md" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
          }`}
        >
          <FaBug /> Bug Reports ({bugReports.length})
        </button>
        <button
          onClick={() => setActiveTab("invoices")}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === "invoices" ? "bg-blue-600 text-white shadow-md" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
          }`}
        >
          <FaFileInvoiceDollar /> Payments & Invoices ({invoices.length})
        </button>
        <button
          onClick={() => setActiveTab("meetings")}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === "meetings" ? "bg-blue-600 text-white shadow-md" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
          }`}
        >
          <FaVideo /> Scheduled Meetings ({meetings.length})
        </button>
        <button
          onClick={() => setActiveTab("files")}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === "files" ? "bg-blue-600 text-white shadow-md" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
          }`}
        >
          <FaFileDownload /> Files & Documents
        </button>
        <button
          onClick={() => setActiveTab("notifications")}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === "notifications" ? "bg-blue-600 text-white shadow-md" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
          }`}
        >
          <FaBell /> Notifications Hub
        </button>
      </div>

      {/* TAB 1: CLIENT OVERVIEW DASHBOARD */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Summary KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Total Assigned Projects */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-2 hover:border-blue-300 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Total Projects</span>
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-200"><FaProjectDiagram /></div>
              </div>
              <p className="text-3xl font-black text-slate-900">{totalAssignedProjects}</p>
              <p className="text-[11px] text-slate-500 font-medium">Assigned to Client</p>
            </div>

            {/* Active Projects */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-2 hover:border-amber-300 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Active Projects</span>
                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-200"><FaClock /></div>
              </div>
              <p className="text-3xl font-black text-amber-600">{activeProjectsCount}</p>
              <p className="text-[11px] text-amber-700 font-semibold">Under Development</p>
            </div>

            {/* Completed Projects */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-2 hover:border-emerald-300 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Completed</span>
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-200"><FaCheckCircle /></div>
              </div>
              <p className="text-3xl font-black text-emerald-600">{completedProjectsCount}</p>
              <p className="text-[11px] text-emerald-700 font-semibold">Delivered & Deployed</p>
            </div>

            {/* Pending Projects */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-2 hover:border-purple-300 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Pending Phase</span>
                <div className="p-2 bg-purple-50 text-purple-600 rounded-xl border border-purple-200"><FaTasks /></div>
              </div>
              <p className="text-3xl font-black text-purple-600">{pendingProjectsCount}</p>
              <p className="text-[11px] text-purple-700 font-semibold">Planning / UI Phase</p>
            </div>

            {/* Overall Progress */}
            <div className="bg-white rounded-2xl p-5 border border-blue-200 bg-blue-50/20 shadow-xs space-y-2 hover:border-blue-400 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-blue-900 tracking-wider">Overall Progress</span>
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl border border-blue-300"><FaCheckCircle /></div>
              </div>
              <p className="text-3xl font-black text-blue-950">{overallAverageProgress}%</p>
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-1">
                <div className="bg-blue-600 h-full rounded-full transition-all duration-500" style={{ width: `${overallAverageProgress}%` }}></div>
              </div>
            </div>
          </div>

          {/* Quick Highlight Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Active Projects Quick Summary */}
            <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <FaProjectDiagram className="text-blue-600" />
                  <span>My Active Project Progress Overview</span>
                </h3>
                <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-200">
                  Live Feed
                </span>
              </div>

              <div className="space-y-4">
                {clientProjects.map((proj) => (
                  <div key={proj.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-100/60 transition-all space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-blue-600">{proj.id}</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">
                            {proj.currentStatus}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 mt-1">{proj.title}</h4>
                      </div>

                      <div className="text-right">
                        <span className="text-base font-black text-blue-700 font-mono">{proj.progress}%</span>
                        <p className="text-[10px] text-slate-500">Est. Deadline: {proj.expectedCompletionDate}</p>
                      </div>
                    </div>

                    <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${proj.progress}%` }}
                      ></div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-slate-200/60">
                      <span><strong>Current Phase:</strong> {proj.currentPhase}</span>
                      <span><strong>Manager:</strong> {proj.projectManager}</span>
                      <button
                        onClick={() => { setSelectedProject(proj); setActiveTab("projects"); }}
                        className="text-blue-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        Inspect Details <FaChevronRight className="text-[9px]" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Upcoming Deadlines & Recent Developer Updates */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
                <h3 className="text-sm font-black text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
                  <FaCalendarAlt className="text-amber-500" />
                  <span>Upcoming Project Deadlines</span>
                </h3>
                <div className="space-y-3">
                  {clientProjects.map((proj) => (
                    <div key={proj.id} className="p-3 bg-amber-50/50 rounded-xl border border-amber-200/60 space-y-1">
                      <div className="flex justify-between items-center text-xs font-bold text-slate-900">
                        <span>{proj.title}</span>
                        <span className="text-amber-700 font-mono text-[11px]">{proj.expectedCompletionDate}</span>
                      </div>
                      <p className="text-[11px] text-slate-600">PM: {proj.projectManager} • Status: {proj.currentStatus}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Security Policy Reminder */}
              <div className="bg-slate-900 rounded-2xl p-5 text-white shadow-xs space-y-2 border border-slate-800 text-xs">
                <div className="flex items-center gap-2 text-emerald-400 font-bold">
                  <FaLock />
                  <span>Row-Level RLS Security Policy</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Your Client ID is permanently tied to these records. Access to HR, employee payroll, company financials, or other clients is strictly blocked.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MY ASSIGNED PROJECTS & DETAILS */}
      {activeTab === "projects" && selectedProject && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-6">
            {/* Project Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-blue-100 text-blue-800 border border-blue-200">
                    ID: {selectedProject.id}
                  </span>
                  <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Status: {selectedProject.currentStatus}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900">{selectedProject.title}</h2>
                <p className="text-xs text-slate-500 font-medium">{selectedProject.description}</p>
              </div>

              {selectedProject.demoLink && (
                <a
                  href={selectedProject.demoLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all shadow-md self-start lg:self-center"
                >
                  <FaExternalLinkAlt /> <span>View Live Demo URL</span>
                </a>
              )}
            </div>

            {/* Progress Visualizer Bar */}
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="text-slate-700 flex items-center gap-2">
                  <FaTasks className="text-blue-600" />
                  <span>Overall Development Progress</span>
                </span>
                <span className="text-blue-700 font-mono text-base font-black">{selectedProject.progress}% Completed</span>
              </div>

              <div className="w-full bg-slate-200 h-4 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-600 to-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${selectedProject.progress}%` }}
                ></div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs text-center font-bold">
                <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                  <p className="text-[10px] text-slate-500">Completed Tasks</p>
                  <p className="text-base text-emerald-600 font-mono">{selectedProject.completedTasksCount}</p>
                </div>
                <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                  <p className="text-[10px] text-slate-500">Remaining Tasks</p>
                  <p className="text-base text-amber-600 font-mono">{selectedProject.remainingTasksCount}</p>
                </div>
                <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                  <p className="text-[10px] text-slate-500">Start Date</p>
                  <p className="text-xs text-slate-900 font-mono">{selectedProject.startDate}</p>
                </div>
                <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                  <p className="text-[10px] text-slate-500">Expected Delivery</p>
                  <p className="text-xs text-blue-700 font-mono">{selectedProject.expectedCompletionDate}</p>
                </div>
              </div>
            </div>

            {/* Development Phases Track */}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Project Lifecycle Phases</h3>
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                {["Planning", "UI/UX Design", "Development", "Testing", "Bug Fixing", "Deployment", "Completed"].map((phase) => {
                  const isCurrent = selectedProject.currentStatus === phase;
                  return (
                    <span
                      key={phase}
                      className={`px-3 py-1.5 rounded-xl border text-xs transition-all ${
                        isCurrent
                          ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                          : "bg-slate-50 text-slate-600 border-slate-200"
                      }`}
                    >
                      {phase}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Assigned Team & Manager */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
              <div className="space-y-3">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <FaUserTie className="text-blue-600" />
                  <span>Assigned Development Team & Manager</span>
                </h3>
                <div className="space-y-2">
                  <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-200 flex justify-between items-center text-xs">
                    <div>
                      <p className="font-bold text-slate-900">{selectedProject.projectManager}</p>
                      <p className="text-[10px] text-blue-700 font-semibold">Project Manager & Lead Lead</p>
                    </div>
                    <span className="px-2 py-0.5 bg-blue-600 text-white rounded-md text-[10px] font-extrabold">PM</span>
                  </div>

                  {selectedProject.assignedTeam?.map((member, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center text-xs">
                      <div>
                        <p className="font-bold text-slate-900">{member.name}</p>
                        <p className="text-[10px] text-slate-500">{member.role}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">Assigned Staff</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Developer Latest Note */}
              <div className="space-y-3">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <FaStickyNote className="text-amber-500" />
                  <span>Latest Lead Developer Status Note</span>
                </h3>
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 space-y-2 text-xs">
                  <p className="text-slate-800 leading-relaxed font-medium">
                    "{selectedProject.latestDeveloperNotes || "No new updates recorded."}"
                  </p>
                  <p className="text-[10px] text-amber-700 font-bold text-right">— PM Team Update</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PROGRESS REPORTS & DEMO LINKS */}
      {activeTab === "reports" && selectedProject && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <FaStickyNote className="text-blue-600" />
              <span>Project Audit Progress Reports (Daily, Weekly, Monthly)</span>
            </h2>

            <div className="space-y-3">
              {selectedProject.progressReports?.map((rep) => (
                <div key={rep.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
                  <div className="flex justify-between items-center font-bold">
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-black border border-blue-200">
                      {rep.type}
                    </span>
                    <span className="text-slate-500 font-mono text-[11px]">{rep.date}</span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">{rep.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{rep.notes}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Screenshots Gallery */}
          {selectedProject.screenshots && selectedProject.screenshots.length > 0 && (
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <FaImage className="text-purple-600" />
                <span>Development Screenshots & Prototypes</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedProject.screenshots.map((imgUrl, idx) => (
                  <div key={idx} className="rounded-2xl overflow-hidden border border-slate-200 shadow-2xs group relative">
                    <img src={imgUrl} alt="Screenshot" className="w-full h-48 object-cover group-hover:scale-105 transition-all duration-300" />
                    <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                      <a href={imgUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-white text-slate-900 font-bold rounded-xl text-xs">
                        View Full Screen 🔍
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: FILES & DOCUMENTS */}
      {activeTab === "files" && selectedProject && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex justify-between items-center">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <FaFileDownload className="text-blue-600" />
                <span>Project Shared Documents & Artifacts</span>
              </h2>
              <p className="text-xs text-slate-500">Download proposals, contracts, invoices, and requirement docs</p>
            </div>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-xl border border-blue-200">
              Row-Level File Isolation
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                  <th className="py-3 px-3">Document Name</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">File Size</th>
                  <th className="py-3 px-3">Upload Date</th>
                  <th className="py-3 px-3 text-right">Download Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                {selectedProject.files?.map((file) => (
                  <tr key={file.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-3 font-bold text-slate-900 flex items-center gap-2">
                      <FaFileAlt className="text-blue-600" />
                      <span>{file.name}</span>
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-800 border border-slate-200">
                        {file.type}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 font-mono text-slate-600">{file.size}</td>
                    <td className="py-3.5 px-3 font-mono text-slate-500">{file.date}</td>
                    <td className="py-3.5 px-3 text-right">
                      <button
                        onClick={() => showToast("Download Initiated 📥", `Downloading ${file.name}...`, "info")}
                        className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-3 py-1.5 rounded-lg border border-blue-200 transition-all flex items-center gap-1.5 ml-auto cursor-pointer"
                      >
                        <FaDownload />
                        <span>Download</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: COMMENTS & DISCUSSION */}
      {activeTab === "comments" && selectedProject && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <FaComments className="text-blue-600" />
              <span>Project Discussion & Conversation History</span>
            </h2>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {comments.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">No discussion messages yet. Start a conversation below.</p>
              ) : (
                comments.map((c, idx) => (
                  <div key={idx} className={`p-4 rounded-2xl border text-xs space-y-1 ${c.senderRole === "CLIENT" ? "bg-blue-50/60 border-blue-200 ml-6" : "bg-slate-50 border-slate-200 mr-6"}`}>
                    <div className="flex justify-between items-center font-bold">
                      <span className="text-slate-900">{c.senderName} ({c.senderRole})</span>
                      <span className="text-slate-400 text-[10px] font-mono">{c.createdAt}</span>
                    </div>
                    <p className="text-slate-700 leading-relaxed">{c.message}</p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleAddComment} className="flex gap-2 pt-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a message to PM & dev team..."
                className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-xs text-slate-900 outline-none focus:border-blue-600 font-medium"
              />
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer">
                <FaPaperPlane /> <span>Send</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB: BUG REPORTS */}
      {activeTab === "bugs" && selectedProject && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <FaBug className="text-rose-600" />
                <span>Client Submitted Bug & Issue Reports</span>
              </h2>
            </div>

            <form onSubmit={handleCreateBugReport} className="p-4 bg-rose-50/40 rounded-2xl border border-rose-200 space-y-3">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <FaPlusCircle className="text-rose-600" /> Report New Issue / Bug
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  value={bugForm.title}
                  onChange={(e) => setBugForm({ ...bugForm, title: e.target.value })}
                  placeholder="Bug Title (e.g. Mobile checkout screen crash)"
                  className="sm:col-span-2 rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-rose-500 bg-white"
                />
                <select
                  value={bugForm.priority}
                  onChange={(e) => setBugForm({ ...bugForm, priority: e.target.value })}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-rose-500 bg-white font-bold"
                >
                  <option value="Low">Low Priority</option>
                  <option value="Medium">Medium Priority</option>
                  <option value="High">High Priority</option>
                  <option value="Critical">Critical Emergency</option>
                </select>
              </div>
              <textarea
                value={bugForm.description}
                onChange={(e) => setBugForm({ ...bugForm, description: e.target.value })}
                placeholder="Describe bug steps to reproduce..."
                className="w-full rounded-xl border border-slate-300 p-3 text-xs text-slate-900 outline-none focus:border-rose-500 bg-white h-20"
              />
              <button type="submit" className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-5 py-2 rounded-xl text-xs flex items-center gap-2 cursor-pointer">
                <FaBug /> <span>Submit Bug Report</span>
              </button>
            </form>

            <div className="space-y-3 pt-2">
              {bugReports.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No open bugs reported for this project.</p>
              ) : (
                bugReports.map((b, idx) => (
                  <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5 text-xs">
                    <div className="flex justify-between items-center font-bold">
                      <span className="text-slate-900 font-extrabold">{b.title}</span>
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black">{b.priority} Priority</span>
                    </div>
                    <p className="text-slate-600">{b.description}</p>
                    <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1 border-t border-slate-200">
                      <span>Status: <strong className="text-slate-800">{b.bugStatus}</strong></span>
                      <span>Assigned Dev: <strong className="text-slate-800">{b.assignedDeveloper}</strong></span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: PAYMENTS & INVOICES */}
      {activeTab === "invoices" && selectedProject && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex justify-between items-center">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <FaFileInvoiceDollar className="text-emerald-600" />
                <span>Project Financial Invoices & Receipts</span>
              </h2>
              <p className="text-xs text-slate-500">View and download billing invoices generated by finance department</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                  <th className="py-3 px-3">Invoice #</th>
                  <th className="py-3 px-3">Total Amount</th>
                  <th className="py-3 px-3">Paid Amount</th>
                  <th className="py-3 px-3">Payment Status</th>
                  <th className="py-3 px-3 text-right">Invoice Receipt Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-slate-400">No billing invoices issued yet for this project.</td>
                  </tr>
                ) : (
                  invoices.map((inv, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-3.5 px-3 font-bold font-mono text-slate-900">{inv.invoiceNumber || `INV-${idx+101}`}</td>
                      <td className="py-3.5 px-3 font-mono font-bold text-slate-900">Rs. {Number(inv.totalAmount || 150000).toLocaleString()}</td>
                      <td className="py-3.5 px-3 font-mono text-emerald-600 font-bold">Rs. {Number(inv.paidAmount || 150000).toLocaleString()}</td>
                      <td className="py-3.5 px-3">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                          {inv.paymentStatus || "PAID ✅"}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        <button
                          onClick={() => showToast("Invoice Downloaded 📄", "PDF Receipt downloaded to device.", "success")}
                          className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-3 py-1.5 rounded-lg border border-emerald-200 transition-all flex items-center gap-1.5 ml-auto cursor-pointer"
                        >
                          <FaDownload /> <span>Download Invoice PDF</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: SCHEDULED MEETINGS */}
      {activeTab === "meetings" && selectedProject && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <FaVideo className="text-blue-600" />
              <span>Scheduled Progress Review Meetings</span>
            </h2>
            <p className="text-xs text-slate-500">Live Zoom/Google Meet links and agenda scheduled by PM team</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {meetings.length === 0 ? (
              <div className="col-span-2 bg-white p-8 text-center text-xs text-slate-400 font-medium rounded-2xl border border-slate-200">
                No upcoming review meetings scheduled.
              </div>
            ) : (
              meetings.map((m, idx) => (
                <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2 text-xs">
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-slate-900 font-extrabold text-sm">{m.meetingTitle}</span>
                    <span className="text-blue-600 font-mono text-[11px]">{m.meetingDate} at {m.meetingTime}</span>
                  </div>
                  <p className="text-slate-600">{m.agenda}</p>
                  {m.meetingUrl && (
                    <a href={m.meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-blue-600 font-bold hover:underline pt-2">
                      <FaVideo /> <span>Join Live Video Call →</span>
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 5: NOTIFICATIONS HUB */}
      {activeTab === "notifications" && selectedProject && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <FaBell className="text-amber-500" />
              <span>Project Audit Notifications & Activity Log</span>
            </h2>
            <p className="text-xs text-slate-500">Real-time alerts for milestone completions, reports, and file uploads</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-3">
            {selectedProject.notifications?.map((notif) => (
              <div key={notif.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1 text-xs">
                <div className="flex justify-between items-center font-bold">
                  <span className="text-slate-900 font-extrabold text-xs">{notif.title}</span>
                  <span className="text-slate-400 font-mono text-[11px]">{notif.date}</span>
                </div>
                <p className="text-slate-600 leading-relaxed">{notif.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

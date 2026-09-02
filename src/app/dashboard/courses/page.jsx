"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { dbFetch, dbSaveRecord, dbDeleteRecord } from "@/lib/dbPersistence";
import Modal from "@/components/Modal";
import { showToast } from "@/components/Toast";
import { generatePrintableStudentFeeReceiptPdf } from "@/lib/generateStudentReceiptPdf";
import { generatePrintable3MonthStudentCertificatePdf } from "@/lib/generate3MonthStudentCertificatePdf";
import { enrollStudentWithCredentials } from "@/lib/studentEnrollmentUtils";
import {
  getAllMcqExams,
  saveMcqExam,
  deleteMcqExam,
  getAllExamAttempts
} from "@/lib/mcqExamUtils";
import {
  FaGraduationCap,
  FaUserPlus,
  FaEnvelope,
  FaCheckCircle,
  FaExclamationTriangle,
  FaTrash,
  FaCalendarAlt,
  FaPaperPlane,
  FaChalkboardTeacher,
  FaLink,
  FaAward,
  FaPrint,
  FaTimes,
  FaHistory,
  FaLock,
  FaKey,
  FaShieldAlt,
  FaMoneyBillWave,
  FaEye,
  FaEyeSlash,
  FaVideo,
  FaTasks,
  FaEllipsisV,
  FaSearch,
  FaFilter,
  FaChevronRight
} from "react-icons/fa";

export default function CoursesPage() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [role, setRole] = useState("admin");
  const [showAssignedPassword, setShowAssignedPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Kebab Context Menu State
  const [activeKebabId, setActiveKebabId] = useState(null);

  // Delete Safeguard Modal State
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, student: null, loading: false });

  // Custom Modal State
  const [modal, setModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    type: "info",
  });

  // Fee Receipt Modal State
  const [feeReceiptModal, setFeeReceiptModal] = useState({
    isOpen: false,
    receiptData: null,
  });

  // Certificate Modal State
  const [certificateModal, setCertificateModal] = useState({
    isOpen: false,
    student: null,
  });

  // MCQ Exams & Attempts State
  const [mcqExams, setMcqExams] = useState([]);
  const [allAttempts, setAllAttempts] = useState([]);
  const [activeTab, setActiveTab] = useState("students"); // "students" | "mcq_exams" | "mcq_results"
  const [showExamModal, setShowExamModal] = useState(false);
  const [examForm, setExamForm] = useState({
    id: "",
    title: "",
    description: "",
    course: "Full Stack MERN Web Development",
    time_limit: 10,
    passing_score: 50,
    due_date: "2026-08-30",
    assigned_to_email: "all",
    questions: [
      {
        id: "q1",
        question: "",
        option_a: "",
        option_b: "",
        option_c: "",
        option_d: "",
        correct_answer: "option_a",
      },
    ],
  });

  const showAlert = (title, message, type = "info") => {
    setModal({ isOpen: true, title, message, type });
  };

  const closeModal = () => {
    setModal({ ...modal, isOpen: false });
  };

  const calculate30DaysLater = (dateString) => {
    const date = new Date(dateString || new Date());
    date.setDate(date.getDate() + 30);
    return date.toISOString().split("T")[0];
  };

  const todayStr = new Date().toISOString().split("T")[0];
  const threeMonthsLaterStr = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const availableCourses = [
    {
      title: "Full Stack MERN Web Development",
      defaultFee: 25000,
      instructor: "Lead Full-Stack Instructor",
      resources: "https://github.com/softwarehouse/mern-course-materials",
    },
    {
      title: "Python & Artificial Intelligence",
      defaultFee: 30000,
      instructor: "Lead AI Instructor",
      resources: "https://drive.google.com/drive/folders/ai-python-resources",
    },
    {
      title: "UI/UX Graphic & Product Design",
      defaultFee: 20000,
      instructor: "Lead UI/UX Instructor",
      resources: "https://figma.com/@softwarehouse-design-system",
    },
    {
      title: "Mobile App Development (Flutter)",
      defaultFee: 28000,
      instructor: "Lead Mobile Apps Instructor",
      resources: "https://github.com/softwarehouse/flutter-mobile-course",
    },
    {
      title: "Cybersecurity & Ethical Hacking",
      defaultFee: 35000,
      instructor: "Lead Security Instructor",
      resources: "https://drive.google.com/drive/folders/cyber-security-labs",
    },
  ];

  // 2-Column Responsive Enrollment Form State
  const [form, setForm] = useState({
    full_name: "",
    cnic: "",
    email: "",
    assigned_password: "",
    confirm_password: "",
    phone: "",
    track_type: "Remote Student",
    tech_domain: "Full Stack MERN Web Development",
    batch: "Batch #14 (Morning Tech)",
    guardian_name: "",
    guardian_phone: "",
    emergency_phone: "",
    assignments_count: 5,
    completed_assignments: 3,
    course_name: "Full Stack MERN Web Development",
    instructor: "Lead Full-Stack Instructor",
    resources_url: "https://github.com/softwarehouse/mern-course-materials",
    start_date: todayStr,
    end_date: threeMonthsLaterStr,
    progress: 0,
    course_fee: "25000",
    fee_paid: "25000",
    last_payment_date: todayStr,
    next_due_date: calculate30DaysLater(todayStr),
  });

  const [inspectStudentModal, setInspectStudentModal] = useState(null);

  useEffect(() => {
    setRole(localStorage.getItem("user_role") || "admin");
    const handleRoleChange = () => setRole(localStorage.getItem("user_role") || "admin");
    window.addEventListener("roleChanged", handleRoleChange);

    const initialDefaultStudents = [
      {
        id: "s-101",
        full_name: "Muhammad Ali",
        cnic: "35201-1234567-1",
        email: "ali.student@gmail.com",
        phone: "03001234567",
        enrollment_type: "Paid Course Student",
        course_name: "Full Stack MERN Web Development",
        instructor: "Lead Full-Stack Instructor",
        start_date: "2026-05-01",
        end_date: "2026-08-01",
        progress: 100,
        course_fee: 25000,
        fee_paid: 25000,
        last_payment_date: "2026-07-01",
        next_due_date: "2026-08-01",
        fee_status: "Paid",
        batch: "Batch #14 (Morning Tech)",
      },
      {
        id: "s-102",
        full_name: "Sara Khan",
        cnic: "35201-9876543-2",
        email: "sara.design@gmail.com",
        phone: "03219876543",
        enrollment_type: "Paid Course Student",
        course_name: "UI/UX Graphic & Product Design",
        instructor: "Ayesha Malik (Senior UI/UX Designer)",
        start_date: "2026-06-01",
        end_date: "2026-09-01",
        progress: 65,
        course_fee: 20000,
        fee_paid: 20000,
        last_payment_date: "2026-07-01",
        next_due_date: "2026-08-01",
        fee_status: "Pending Due",
        batch: "Batch #15 (Afternoon Lab)",
      },
    ];

    dbFetch("students", [], true).then((data) => {
      let blacklist = [];
      try {
        blacklist = JSON.parse(localStorage.getItem("deleted_entity_blacklist") || "[]");
      } catch (e) {}

      // Deduplicate students list by unique email and ID, excluding blacklisted records
      const uniqueStudents = [];
      const seenEmails = new Set();
      const seenIds = new Set();

      (data || []).forEach((s) => {
        if (!s) return;
        const cleanEm = (s.email || "").toLowerCase().trim();
        const cleanId = (s.id || s.student_id || "").toString();

        if (cleanEm && (seenEmails.has(cleanEm) || blacklist.includes(cleanEm))) return;
        if (cleanId && seenIds.has(cleanId)) return;

        if (cleanEm) seenEmails.add(cleanEm);
        if (cleanId) seenIds.add(cleanId);
        uniqueStudents.push(s);
      });

      setStudents(uniqueStudents);
      setLoading(false);
    });

    // Fetch MCQ Exams and Attempt Results
    async function loadMcqData() {
      try {
        const exams = await getAllMcqExams();
        const attempts = await getAllExamAttempts();
        setMcqExams(exams || []);
        setAllAttempts(attempts || []);
      } catch (e) {}
    }
    loadMcqData();

    return () => window.removeEventListener("roleChanged", handleRoleChange);
  }, []);

  // MCQ Question Form Handlers
  const handleAddQuestion = () => {
    setExamForm((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        {
          id: `q-${Date.now()}-${prev.questions.length + 1}`,
          question: "",
          option_a: "",
          option_b: "",
          option_c: "",
          option_d: "",
          correct_answer: "option_a",
        },
      ],
    }));
  };

  const handleRemoveQuestion = (idx) => {
    if (examForm.questions.length <= 1) {
      showToast("Question Minimum", "At least one question is required.", "info");
      return;
    }
    setExamForm((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== idx),
    }));
  };

  const handleQuestionChange = (idx, field, value) => {
    setExamForm((prev) => {
      const updatedQuestions = [...prev.questions];
      updatedQuestions[idx] = { ...updatedQuestions[idx], [field]: value };
      return { ...prev, questions: updatedQuestions };
    });
  };

  const handleSaveExamSubmit = async (e) => {
    e.preventDefault();
    if (!examForm.title.trim()) {
      showToast("Validation Error 🛑", "Please enter Exam Title.", "error");
      return;
    }

    const validQuestions = examForm.questions.filter((q) => q.question.trim() !== "");
    if (validQuestions.length === 0) {
      showToast("Validation Error 🛑", "Please enter at least one valid question text.", "error");
      return;
    }

    const examData = {
      ...examForm,
      id: examForm.id || `exam-${Date.now()}`,
      questions: validQuestions,
      created_at: new Date().toISOString(),
    };

    const updated = await saveMcqExam(examData);
    setMcqExams(updated);
    setShowExamModal(false);
    showToast("MCQ Exam Saved 🟢", `Exam "${examForm.title}" assigned successfully.`, "success");
    setExamForm({
      id: "",
      title: "",
      description: "",
      course: "Full Stack MERN Web Development",
      time_limit: 10,
      passing_score: 50,
      due_date: "2026-08-30",
      assigned_to_email: "all",
      questions: [
        {
          id: "q1",
          question: "",
          option_a: "",
          option_b: "",
          option_c: "",
          option_d: "",
          correct_answer: "option_a",
        },
      ],
    });
  };

  const handleDeleteExamAction = async (examId) => {
    if (!confirm("Are you sure you want to delete this MCQ Exam?")) return;
    const updated = await deleteMcqExam(examId);
    setMcqExams(updated);
    showToast("Exam Deleted 🔴", "MCQ Exam removed.", "info");
  };

  const handleCourseSelect = (e) => {
    const selectedTitle = e.target.value;
    const courseObj = availableCourses.find((c) => c.title === selectedTitle);
    const fee = courseObj ? courseObj.defaultFee.toString() : "25000";
    const inst = courseObj ? courseObj.instructor : "Internal Lead Trainer";
    const res = courseObj ? courseObj.resources : "";

    setForm((prev) => ({
      ...prev,
      course_name: selectedTitle,
      tech_domain: selectedTitle,
      course_fee: fee,
      fee_paid: fee,
      instructor: inst,
      resources_url: res,
    }));
  };

  const handleTechDomainSelect = (e) => {
    const selectedDomain = e.target.value;
    let courseObj = availableCourses.find((c) => c.title === selectedDomain);
    if (!courseObj) {
      courseObj = availableCourses.find((c) => selectedDomain.toLowerCase().includes(c.title.split(" ")[0].toLowerCase())) || availableCourses[0];
    }
    const fee = courseObj ? courseObj.defaultFee.toString() : "25000";
    const inst = courseObj ? courseObj.instructor : "Internal Lead Trainer";
    const res = courseObj ? courseObj.resources : "";

    setForm((prev) => ({
      ...prev,
      tech_domain: selectedDomain,
      course_name: courseObj.title,
      course_fee: fee,
      fee_paid: fee,
      instructor: inst,
      resources_url: res,
    }));
  };

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) {
      showToast("Validation Error 🔴", "Please enter Student Name and Email Address.", "error");
      return;
    }

    const targetPassword = form.assigned_password && form.assigned_password.trim().length >= 6 
      ? form.assigned_password.trim() 
      : "student123";

    if (form.confirm_password && form.assigned_password && form.assigned_password !== form.confirm_password) {
      showToast("Password Mismatch 🔴", "Passwords do not match. Please re-enter.", "error");
      return;
    }

    setSubmitting(true);

    try {
      const res = await enrollStudentWithCredentials({
        studentData: form,
        password: targetPassword,
      });

      setStudents(prev => {
        const cleanEm = (res.student?.email || "").toLowerCase().trim();
        const cleanId = res.student?.id;
        const filteredPrev = prev.filter(s => s.id !== cleanId && (cleanEm ? (s.email || "").toLowerCase().trim() !== cleanEm : true));
        return [res.student, ...filteredPrev];
      });
      setSubmitting(false);

      showToast(
        "Student Enrolled 🎉",
        `${form.full_name} enrolled in ${form.course_name}. 30-day fee cycle active.`,
        "success"
      );

      showAlert(
        "Student Enrolled & Account Created 🟢",
        `Student "${form.full_name}" enrolled successfully!\n\nCourse: ${form.course_name}\nBatch: ${form.batch}\nLogin Email: ${form.email}\n30-Day Recurring Fee Cycles Generated: 3 Cycles\nAuth Account Created (No plain-text password stored in DB).`,
        "success"
      );

      setForm({
        full_name: "",
        cnic: "",
        email: "",
        assigned_password: "",
        confirm_password: "",
        phone: "",
        batch: "Batch #14 (Morning Tech)",
        guardian_name: "",
        guardian_phone: "",
        emergency_phone: "",
        assignments_count: 5,
        completed_assignments: 3,
        course_name: "Full Stack MERN Web Development",
        instructor: "Lead Full-Stack Instructor",
        resources_url: "https://github.com/softwarehouse/mern-course-materials",
        start_date: todayStr,
        end_date: threeMonthsLaterStr,
        progress: 0,
        course_fee: "25000",
        fee_paid: "25000",
        last_payment_date: todayStr,
        next_due_date: calculate30DaysLater(todayStr),
      });
    } catch (err) {
      setSubmitting(false);
      const msg = err.message || "Failed to enroll student.";
      showToast("Enrollment Error 🔴", msg, "error");
      showAlert("Enrollment Error 🛑", msg, "error");
    }
  };

  const updateStudentProgress = async (studentId, newProgress) => {
    const val = Math.min(100, Math.max(0, Number(newProgress) || 0));
    const updatedList = students.map((s) => (s.id === studentId ? { ...s, progress: val } : s));
    setStudents(updatedList);
    const targetStudent = updatedList.find(s => s.id === studentId);
    if (targetStudent) dbSaveRecord("students", targetStudent).catch(() => {});
  };

  const handleRecordFeeSubmission = async (studentId) => {
    const today = new Date().toISOString().split("T")[0];
    const newNextDueDate = calculate30DaysLater(today);

    let updatedObj = null;
    const updatedList = students.map((s) => {
      if (s.id === studentId) {
        updatedObj = {
          ...s,
          last_payment_date: today,
          next_due_date: newNextDueDate,
          fee_status: "Paid",
          reminder_sent: false,
        };
        return updatedObj;
      }
      return s;
    });

    setStudents(updatedList);
    if (updatedObj) dbSaveRecord("students", updatedObj).catch(() => {});

    const studentObj = students.find((s) => s.id === studentId);
    showToast("Fee Recorded & 30-Day Cycle Reset 🟢", `Next due date set to ${newNextDueDate} for ${studentObj?.full_name}.`, "success");
  };

  const sendFeeReminderEmail = async (student) => {
    const studentEmail = (student.email || "").toLowerCase().trim();
    const rawName = student.full_name || student.student_name || "Student";
    const studentName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    const courseTitle = student.course_name || student.course || "Enrolled Course";
    const calcNextDueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dueDateStr = student.next_due_date || calcNextDueDate;

    // 1. Create Targeted Fee Notice Record for Student Portal
    const feeNotice = {
      id: `fee-notice-${Date.now()}`,
      title: `💳 Monthly Fee Reminder Alert: ${courseTitle}`,
      content: `Dear ${studentName},\n\nThis is an official fee reminder that your monthly tuition fee (PKR ${student.course_fee || '25,000'}) is due for cycle ${dueDateStr}.\n\nPlease clear your fee balance or submit your payment slip to maintain active student privileges.\n\nNexa Enterprise Accounts & Finance Dept`,
      target_type: "specific_user",
      target_key: studentEmail,
      author: "Finance & Accounts Dept",
      is_fee_notice: true,
      due_date: dueDateStr,
      created_at: new Date().toISOString()
    };

    // 2. Persist to announcements cloud table & master local storage
    try {
      dbSaveRecord("announcements", feeNotice).catch(() => {});
      const existingMaster = JSON.parse(localStorage.getItem("software_house_master_announcements") || "[]");
      const updatedMaster = [feeNotice, ...existingMaster.filter(a => a.id !== feeNotice.id)];
      localStorage.setItem("software_house_master_announcements", JSON.stringify(updatedMaster));
    } catch (e) {}

    // 3. Trigger Server-Side Email Dispatch API (Pure TLS Gmail SMTP Mailer)
    let apiRes = null;
    try {
      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: studentEmail,
          studentName: studentName,
          subject: `💳 Monthly Fee Reminder Alert - ${courseTitle}`,
          content: feeNotice.content
        })
      });
      apiRes = await response.json().catch(() => null);
    } catch (e) {}

    // 4. Open Direct Web Gmail Composer as backup
    const subjectStr = `💳 Monthly Fee Reminder Alert - ${courseTitle}`;
    const gmailWebUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(studentEmail)}&su=${encodeURIComponent(subjectStr)}&body=${encodeURIComponent(feeNotice.content)}`;

    if (typeof window !== "undefined") {
      window.open(gmailWebUrl, "_blank");
    }

    // 5. Update student record
    dbSaveRecord("students", { ...student, reminder_sent: true, last_reminder_at: new Date().toISOString() }).catch(() => {});

    // 6. Show confirmation alert based on direct TLS SMTP mailer result
    if (apiRes?.smtpResult?.success) {
      showAlert(
        "Fee Email Delivered Directly to Inbox 🎉",
        `Physical HTML fee reminder email delivered directly to ${studentName}'s Gmail Inbox (${studentEmail})!\n\nNo manual send needed! Student Portal notice is also active.`,
        "success"
      );
    } else {
      const errorMsg = apiRes?.smtpResult?.reason || "SMTP Server response pending";
      const userUsed = apiRes?.smtpUser || "None";
      showAlert(
        "SMTP Dispatch Status Diagnostic 📧",
        `Target Recipient: ${studentEmail}\nConfigured SMTP Sender: ${userUsed}\nServer Diagnostics: ${errorMsg}\n\n(Web Gmail Compose backup tab launched as fallback).`,
        "info"
      );
    }
  };

  const executeDeleteStudent = async () => {
    if (!deleteModal.student) return;
    setDeleteModal(prev => ({ ...prev, loading: true }));
    const id = deleteModal.student.id;
    const email = (deleteModal.student.email || "").toLowerCase().trim();
    const name = deleteModal.student.full_name || deleteModal.student.name || "";

    try {
      const filtered = students.filter((s) => s.id !== id && (email ? (s.email || "").toLowerCase().trim() !== email : true));
      setStudents(filtered);
      dbDeleteRecord("students", id, email || "").catch(() => {});
      dbDeleteRecord("interns", id, email || "").catch(() => {});
      
      fetch("/api/persistence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "students", record: { id, email, full_name: name }, action: "delete" })
      }).catch(() => {});

      // Clean up local system user registration caches
      if (email) {
        try {
          const sysUsers = JSON.parse(localStorage.getItem("registered_system_users") || "[]");
          const updatedSys = sysUsers.filter(u => (u.email || "").toLowerCase().trim() !== email);
          localStorage.setItem("registered_system_users", JSON.stringify(updatedSys));

          const masterStu = JSON.parse(localStorage.getItem("software_house_master_students") || "[]");
          const updatedMaster = masterStu.filter(s => (s.email || "").toLowerCase().trim() !== email && s.id !== id);
          localStorage.setItem("software_house_master_students", JSON.stringify(updatedMaster));

          // Clear today attendance cache for this student
          localStorage.removeItem(`today_attendance_${email}`);
        } catch (e) {}
      }

      showToast("Student Removed 🗑️", `${name || "Student"} removed permanently from database.`, "info");
    } catch(e) {
      showToast("Error", "Failed to delete student record.", "error");
    } finally {
      setDeleteModal({ isOpen: false, student: null, loading: false });
    }
  };

  const dueStudents = students.filter((s) => {
    if (!s.next_due_date) return false;
    const dueDate = new Date(s.next_due_date);
    return dueDate <= new Date();
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Modal */}
      <Modal isOpen={modal.isOpen} title={modal.title} message={modal.message} type={modal.type} onClose={closeModal} />

      {/* HEADER BANNER */}
      <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] bg-[#EFF6FF] px-2.5 py-1 rounded-full border border-[#2563EB]/20">
              Academic & Course Management
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-[#0F172A] mt-1.5 flex items-center gap-2.5">
            <FaGraduationCap className="text-[#2563EB]" />
            <span>Course Students & 30-Day Fee Engine</span>
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            3-Month Progress Tracking • 30-Day Auto Fee Cycle • Verified Certificate Generation Engine
          </p>
        </div>
      </div>

      {/* SUMMARY STATISTICS CARDS (Requirement #3 - Improved Padding & Spacing) */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Total Enrolled Students
            </p>
            <p className="mt-2 text-2xl font-bold text-[#0F172A]">{loading ? "..." : students.length}</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB]/20">
            <FaGraduationCap className="text-lg" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#2563EB]">
              3-Month Certificate Unlocked
            </p>
            <p className="mt-2 text-2xl font-bold text-[#0F172A]">
              {loading ? "..." : students.filter((s) => s.progress === 100).length}
            </p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB]/20">
            <FaAward className="text-lg" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#92400E]">
              30-Day Fee Cycle Due
            </p>
            <p className="mt-2 text-2xl font-bold text-[#0F172A]">{loading ? "..." : dueStudents.length}</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FEF3C7] text-[#92400E] border border-[#F59E0B]/20">
            <FaExclamationTriangle className="text-lg" />
          </div>
        </div>
      </div>

      {/* SECTION TABS */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("students")}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === "students"
              ? "bg-[#2563EB] text-white shadow-xs"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <FaGraduationCap />
          <span>Course Students & Fees</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("mcq_exams")}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === "mcq_exams"
              ? "bg-[#2563EB] text-white shadow-xs"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <FaTasks />
          <span>MCQ Exam Creator & Assignment ({mcqExams.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("mcq_results")}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === "mcq_results"
              ? "bg-[#2563EB] text-white shadow-xs"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <FaCheckCircle />
          <span>Exam Attempts & Grades ({allAttempts.length})</span>
        </button>
      </div>

      {activeTab === "students" && (
        <div className="grid gap-6 lg:grid-cols-12">
        
        {/* 2-COLUMN RESPONSIVE ENROLLMENT FORM (Requirement #2 - 40% Width) */}
        {role === "admin" && (
          <div className="lg:col-span-5 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm space-y-4 h-fit">
            <div className="border-b border-[#E2E8F0] pb-3">
              <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                <FaUserPlus className="text-[#2563EB]" />
                <span>Enroll Course Student</span>
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5">Setup 30-day recurring fee cycle & credentials.</p>
            </div>

            <form onSubmit={handleAddStudent} className="space-y-3.5 text-xs">
              {/* Row 1: Name & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    Student Name *
                  </label>
                  <input
                    type="text"
                    name="full_name"
                    value={form.full_name}
                    onChange={handleChange}
                    placeholder="Sara Ahmed"
                    required
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="student@gmail.com"
                    required
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              {/* Row 2: Phone & Emergency Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="03001234567"
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    Emergency Contact
                  </label>
                  <input
                    type="text"
                    name="emergency_phone"
                    value={form.emergency_phone}
                    onChange={handleChange}
                    placeholder="03009998877"
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-mono"
                  />
                </div>
              </div>

              {/* Row: Track Mode & Tech Domain Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    Enrollment Track / Mode *
                  </label>
                  <select
                    name="track_type"
                    value={form.track_type || "Remote Student"}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] bg-white font-bold text-blue-700"
                  >
                    <option value="Remote Student">🌐 Remote Student (Online & Screen Monitored)</option>
                    <option value="On-Site Student">🏫 On-Site Student (Campus)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    Tech Domain / Role
                  </label>
                  <select
                    name="tech_domain"
                    value={form.tech_domain || form.course_name}
                    onChange={handleTechDomainSelect}
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] bg-white font-semibold"
                  >
                    {availableCourses.map((c) => (
                      <option key={c.title} value={c.title}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: Course & Batch Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    Course Selection *
                  </label>
                  <select
                    name="course_name"
                    value={form.course_name}
                    onChange={handleCourseSelect}
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] bg-white"
                  >
                    {availableCourses.map((c) => (
                      <option key={c.title} value={c.title}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    Batch Selection
                  </label>
                  <select
                    name="batch"
                    value={form.batch}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] bg-white"
                  >
                    <option value="Batch #14 (Morning Tech)">Batch #14 (Morning)</option>
                    <option value="Batch #15 (Afternoon Lab)">Batch #15 (Afternoon)</option>
                    <option value="Batch #16 (Evening Pro)">Batch #16 (Evening)</option>
                  </select>
                </div>
              </div>

              {/* Row 4: Total Fee & Submitted Fee */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    Total Fee (PKR)
                  </label>
                  <input
                    type="number"
                    name="course_fee"
                    value={form.course_fee}
                    onChange={handleChange}
                    required
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    Submitted Fee
                  </label>
                  <input
                    type="number"
                    name="fee_paid"
                    value={form.fee_paid}
                    onChange={handleChange}
                    required
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              {/* Row 5: Start & End Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    Enrollment Date
                  </label>
                  <input
                    type="date"
                    name="start_date"
                    value={form.start_date}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                    Completion (3 Months)
                  </label>
                  <input
                    type="date"
                    name="end_date"
                    value={form.end_date}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              {/* Login Credentials Section */}
              <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 space-y-2.5 my-2">
                <div className="flex items-center gap-1.5 text-blue-900 font-bold text-xs">
                  <FaLock className="text-blue-600" />
                  <span>Student Login Credentials</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-slate-700 mb-1">
                      Temporary Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showAssignedPassword ? "text" : "password"}
                        name="assigned_password"
                        value={form.assigned_password || ""}
                        onChange={handleChange}
                        placeholder="Enter Temporary Password"
                        required
                        className="w-full rounded-lg border border-slate-200 bg-white pl-2.5 pr-8 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-600 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAssignedPassword(!showAssignedPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer p-1"
                        title={showAssignedPassword ? "Hide Password" : "Show Password"}
                      >
                        {showAssignedPassword ? <FaEyeSlash className="text-xs" /> : <FaEye className="text-xs" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-slate-700 mb-1">
                      Confirm Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        name="confirm_password"
                        value={form.confirm_password || ""}
                        onChange={handleChange}
                        placeholder="Confirm Password"
                        required
                        className="w-full rounded-lg border border-slate-200 bg-white pl-2.5 pr-8 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-600 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer p-1"
                        title={showConfirmPassword ? "Hide Password" : "Show Password"}
                      >
                        {showConfirmPassword ? <FaEyeSlash className="text-xs" /> : <FaEye className="text-xs" />}
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 italic">
                  Student will log in using: <span className="font-semibold text-slate-700">{form.email || "student@example.com"}</span>
                </p>
              </div>

              {/* Full Width Primary Submit CTA Button (Requirement #2) */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold py-3 text-xs transition-colors shadow-xs cursor-pointer"
                >
                  {submitting ? "Enrolling & Creating Account..." : "Enroll Student & Set 30-Day Cycle"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ENROLLED STUDENTS DIRECTORY TABLE (Requirement #1 - 60% Width & Clean Action Column) */}
        <div className={`rounded-2xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden flex flex-col ${role === "admin" ? "lg:col-span-7" : "lg:col-span-12"}`}>
            <div className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#0F172A]">Enrolled Course Students Directory</h2>
              <span className="text-xs font-semibold text-[#64748B]">Auto 30-Day Fee Engine Active</span>
            </div>

            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-xs text-[#0F172A]">
                <thead className="bg-[#F8FAFC] text-[11px] font-bold uppercase text-[#64748B] border-b border-[#E2E8F0]">
                  <tr>
                    <th className="px-4 py-3">Student & Course</th>
                    <th className="px-4 py-3">3-Month Progress</th>
                    <th className="px-4 py-3">30-Day Fee Due</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {students.map((st, idx) => {
                    const isCompleted = st.progress === 100;
                    const dueDate = new Date(st.next_due_date || todayStr);
                    const isFeeOverdue = dueDate <= new Date();

                    return (
                      <tr key={st.id} className="hover:bg-[#F8FAFC]">
                        <td className="px-4 py-3.5 space-y-0.5">
                          <div className="font-bold text-[#0F172A]">{st.full_name}</div>
                          <div className="text-[11px] text-[#2563EB] font-semibold">{st.course_name}</div>
                          <div className="text-[10px] text-[#64748B] font-mono">{st.email}</div>
                        </td>

                        <td className="px-4 py-3.5 min-w-[150px]">
                          <div className="flex items-center justify-between text-xs font-semibold text-[#0F172A] mb-1">
                            <span>Progress</span>
                            <span className="font-bold text-[#2563EB]">{st.progress || 0}%</span>
                          </div>
                          <div className="w-full bg-[#F8FAFC] h-2 rounded-full overflow-hidden border border-[#E2E8F0]">
                            <div
                              className="bg-[#2563EB] h-full rounded-full transition-all duration-300"
                              style={{ width: `${st.progress || 0}%` }}
                            />
                          </div>
                          {/* Clean percentage label scale (Requirement #3) */}
                          <div className="flex justify-between text-[9px] text-[#64748B] mt-1 font-mono">
                            <span>0%</span>
                            <span>50%</span>
                            <span>100%</span>
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-xs font-mono text-[#0F172A]">
                            {st.next_due_date || "—"}
                          </div>
                          {isFeeOverdue ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#92400E] bg-[#FEF3C7] px-2 py-0.5 rounded-full border border-[#F59E0B]/20 mt-1 whitespace-nowrap">
                              <FaExclamationTriangle className="text-[9px]" /> 30-Day Due
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded-full border border-[#2563EB]/20 mt-1 whitespace-nowrap">
                              <FaCheckCircle className="text-[9px]" /> Cycle Active
                            </span>
                          )}
                        </td>

                        {/* Simplified Action Column: Single Royal Blue Primary Action + Kebab Menu (Requirement #1) */}
                        <td className="px-4 py-3.5 text-right shrink-0">
                          <div className="flex items-center justify-end gap-2">
                            {/* Visible Primary Action Button */}
                            <button
                              onClick={() => handleRecordFeeSubmission(st.id)}
                              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-colors shadow-xs cursor-pointer whitespace-nowrap"
                            >
                              Submit Fee
                            </button>

                            {/* Contextual 3-Dots Menu (⋮) */}
                            <div
                              className="relative kebab-menu-container"
                              onMouseLeave={() => setActiveKebabId(null)}
                            >
                              <button
                                type="button"
                                onClick={() => setActiveKebabId(activeKebabId === st.id ? null : st.id)}
                                className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                              >
                                <FaEllipsisV className="text-xs" />
                              </button>

                              {activeKebabId === st.id && (
                                <div className={`absolute right-0 w-44 rounded-xl bg-white p-1.5 shadow-2xl border border-[#E2E8F0] z-50 space-y-0.5 text-xs text-left animate-in fade-in zoom-in-95 duration-100 ${
                                  students.length > 3 && idx >= students.length - 1
                                    ? "bottom-full mb-1 origin-bottom-right"
                                    : "top-full mt-1 origin-top-right"
                                }`}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setInspectStudentModal(st);
                                      setActiveKebabId(null);
                                    }}
                                    className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-[#EFF6FF] text-[#0F172A] hover:text-[#2563EB] font-semibold transition-colors"
                                  >
                                    View Student Record
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      sendFeeReminderEmail(st);
                                      setActiveKebabId(null);
                                    }}
                                    className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-[#EFF6FF] text-[#0F172A] hover:text-[#2563EB] font-semibold transition-colors"
                                  >
                                    Send Fee Email
                                  </button>

                                  {isCompleted && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCertificateModal({ isOpen: true, student: st });
                                        setActiveKebabId(null);
                                      }}
                                      className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-[#EFF6FF] text-[#0F172A] hover:text-[#2563EB] font-semibold transition-colors"
                                    >
                                      Certificate Details
                                    </button>
                                  )}

                                  <div className="border-t border-[#E2E8F0] my-1" />

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeleteModal({ isOpen: true, student: st, loading: false });
                                      setActiveKebabId(null);
                                    }}
                                    className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-rose-50 text-rose-600 font-semibold transition-colors"
                                  >
                                    Delete Student
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MCQ EXAMS TAB */}
      {activeTab === "mcq_exams" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FaTasks className="text-[#2563EB]" /> Admin MCQ Exam Management
              </h2>
              <p className="text-xs text-slate-500">Create, edit, assign online MCQ evaluation tests to students and employees.</p>
            </div>
            <button
              onClick={() => {
                setExamForm({
                  id: "",
                  title: "",
                  description: "",
                  course: "Full Stack MERN Web Development",
                  time_limit: 10,
                  passing_score: 50,
                  due_date: "2026-08-30",
                  assigned_to_email: "all",
                  questions: [
                    {
                      id: "q1",
                      question: "",
                      option_a: "",
                      option_b: "",
                      option_c: "",
                      option_d: "",
                      correct_answer: "option_a",
                    },
                  ],
                });
                setShowExamModal(true);
              }}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-xs cursor-pointer flex items-center gap-2"
            >
              + Create & Assign New MCQ Exam
            </button>
          </div>

          {/* ASSIGNED EXAMS DIRECTORY TABLE */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Active & Assigned MCQ Exams</h3>
            {mcqExams.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-4 text-center">No exams created yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px]">
                      <th className="py-3 px-3">Exam Title</th>
                      <th className="py-3 px-3">Course / Domain</th>
                      <th className="py-3 px-3">Time Limit</th>
                      <th className="py-3 px-3">Pass %</th>
                      <th className="py-3 px-3">Assigned To</th>
                      <th className="py-3 px-3">Questions</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {mcqExams.map((ex) => (
                      <tr key={ex.id} className="hover:bg-slate-50">
                        <td className="py-3 px-3 font-bold text-slate-900">{ex.title}</td>
                        <td className="py-3 px-3 text-slate-600">{ex.course}</td>
                        <td className="py-3 px-3 font-mono font-semibold text-slate-800">{ex.time_limit} Mins</td>
                        <td className="py-3 px-3 font-semibold text-blue-700">{ex.passing_score}%</td>
                        <td className="py-3 px-3 font-mono text-slate-700">{ex.assigned_to_email || "all"}</td>
                        <td className="py-3 px-3 font-bold text-slate-900">{ex.questions?.length || 0} MCQs</td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => handleDeleteExamAction(ex.id)}
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Delete Exam"
                          >
                            <FaTrash />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MCQ RESULTS TAB */}
      {activeTab === "mcq_results" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FaCheckCircle className="text-[#2563EB]" /> Student & Employee Exam Attempt Results
              </h2>
              <p className="text-xs text-slate-500">Live evaluation scorecards, grades, and completion metrics.</p>
            </div>
            <span className="text-xs font-bold text-slate-800 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
              Total Attempts Logged: {allAttempts.length}
            </span>
          </div>

          {allAttempts.length === 0 ? (
            <p className="text-xs text-slate-500 italic text-center py-6">No exam attempts recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px]">
                    <th className="py-3 px-3">Applicant Name</th>
                    <th className="py-3 px-3">Role</th>
                    <th className="py-3 px-3">Exam Title</th>
                    <th className="py-3 px-3">Score</th>
                    <th className="py-3 px-3">Percentage</th>
                    <th className="py-3 px-3">Result</th>
                    <th className="py-3 px-3">Time Taken</th>
                    <th className="py-3 px-3">Attempt Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allAttempts.map((att) => (
                    <tr key={att.id} className="hover:bg-slate-50">
                      <td className="py-3 px-3">
                        <p className="font-bold text-slate-900">{att.user_name}</p>
                        <p className="text-[10px] text-slate-500">{att.user_email}</p>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border uppercase">
                          {att.user_role || "Student"}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-900">{att.exam_title}</td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-900">{att.score}</td>
                      <td className="py-3 px-3 font-mono font-bold text-blue-700">{att.percentage}%</td>
                      <td className="py-3 px-3">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${
                          att.result === "PASSED"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                        }`}>
                          {att.result}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600">{att.time_taken_seconds || 0} Secs</td>
                      <td className="py-3 px-3 text-slate-500 text-[11px]">
                        {att.submitted_at ? new Date(att.submitted_at).toLocaleString() : "Recently"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MCQ EXAM CREATOR MODAL */}
      {showExamModal && (
        <Modal
          isOpen={showExamModal}
          onClose={() => setShowExamModal(false)}
          title="Create & Assign New MCQ Exam"
        >
          <form onSubmit={handleSaveExamSubmit} className="space-y-4 text-xs text-left">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-800 uppercase mb-1">Exam Title *</label>
                <input
                  type="text"
                  value={examForm.title}
                  onChange={(e) => setExamForm({ ...examForm, title: e.target.value })}
                  placeholder="e.g. MERN Stack Mid-Term Evaluation"
                  required
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 uppercase mb-1">Course / Subject *</label>
                <select
                  value={examForm.course}
                  onChange={(e) => setExamForm({ ...examForm, course: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 bg-white outline-none focus:border-[#2563EB]"
                >
                  {availableCourses.map((c) => (
                    <option key={c.title} value={c.title}>{c.title}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 uppercase mb-1">Description / Instructions</label>
              <input
                type="text"
                value={examForm.description}
                onChange={(e) => setExamForm({ ...examForm, description: e.target.value })}
                placeholder="Short description or exam guidelines..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 outline-none focus:border-[#2563EB]"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-800 uppercase mb-1">Time Limit (Mins)</label>
                <input
                  type="number"
                  value={examForm.time_limit}
                  onChange={(e) => setExamForm({ ...examForm, time_limit: Number(e.target.value) })}
                  min={1}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 uppercase mb-1">Passing Score (%)</label>
                <input
                  type="number"
                  value={examForm.passing_score}
                  onChange={(e) => setExamForm({ ...examForm, passing_score: Number(e.target.value) })}
                  min={1}
                  max={100}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 uppercase mb-1">Due Date</label>
                <input
                  type="date"
                  value={examForm.due_date}
                  onChange={(e) => setExamForm({ ...examForm, due_date: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 uppercase mb-1">Assign To (Student / Employee Email)</label>
              <input
                type="text"
                value={examForm.assigned_to_email}
                onChange={(e) => setExamForm({ ...examForm, assigned_to_email: e.target.value })}
                placeholder="Type 'all' or specific student/employee email..."
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 outline-none focus:border-[#2563EB]"
              />
            </div>

            {/* DYNAMIC QUESTIONS BUILDER */}
            <div className="space-y-4 pt-2 border-t border-slate-200">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Multiple Choice Questions ({examForm.questions.length})</h4>
                <button
                  type="button"
                  onClick={handleAddQuestion}
                  className="px-3 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold text-xs hover:bg-blue-100 transition-colors"
                >
                  + Add Question
                </button>
              </div>

              <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
                {examForm.questions.map((q, idx) => (
                  <div key={q.id || idx} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5 relative">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-800">Q{idx + 1}. Question Details</span>
                      {examForm.questions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveQuestion(idx)}
                          className="text-rose-600 hover:text-rose-800 font-bold text-xs"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <input
                      type="text"
                      value={q.question}
                      onChange={(e) => handleQuestionChange(idx, "question", e.target.value)}
                      placeholder="Type question text..."
                      className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-900 bg-white outline-none focus:border-blue-500"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={q.option_a}
                        onChange={(e) => handleQuestionChange(idx, "option_a", e.target.value)}
                        placeholder="Option A"
                        className="rounded-lg border border-slate-200 p-1.5 text-xs text-slate-900 bg-white"
                      />
                      <input
                        type="text"
                        value={q.option_b}
                        onChange={(e) => handleQuestionChange(idx, "option_b", e.target.value)}
                        placeholder="Option B"
                        className="rounded-lg border border-slate-200 p-1.5 text-xs text-slate-900 bg-white"
                      />
                      <input
                        type="text"
                        value={q.option_c}
                        onChange={(e) => handleQuestionChange(idx, "option_c", e.target.value)}
                        placeholder="Option C"
                        className="rounded-lg border border-slate-200 p-1.5 text-xs text-slate-900 bg-white"
                      />
                      <input
                        type="text"
                        value={q.option_d}
                        onChange={(e) => handleQuestionChange(idx, "option_d", e.target.value)}
                        placeholder="Option D"
                        className="rounded-lg border border-slate-200 p-1.5 text-xs text-slate-900 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Correct Answer</label>
                      <select
                        value={q.correct_answer}
                        onChange={(e) => handleQuestionChange(idx, "correct_answer", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 p-1.5 text-xs text-slate-900 bg-white font-bold text-blue-700"
                      >
                        <option value="option_a">Option A</option>
                        <option value="option_b">Option B</option>
                        <option value="option_c">Option C</option>
                        <option value="option_d">Option D</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs transition-colors shadow-xs cursor-pointer"
            >
              Save & Assign Exam
            </button>
          </form>
        </Modal>
      )}

      {/* FULL STUDENT RECORD INSPECTION MODAL */}
      {inspectStudentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-[#E2E8F0] space-y-4 text-left animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] bg-[#EFF6FF] px-2.5 py-0.5 rounded-full border border-[#2563EB]/20">
                  Full Student Record
                </span>
                <h3 className="text-lg font-bold text-[#0F172A] mt-1">{inspectStudentModal.full_name}</h3>
                <p className="text-xs font-mono text-[#64748B]">{inspectStudentModal.email}</p>
              </div>
              <button
                onClick={() => setInspectStudentModal(null)}
                className="text-[#64748B] hover:text-[#0F172A] text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0] space-y-0.5">
                <p className="text-[#64748B] font-semibold uppercase text-[10px]">Course Name</p>
                <p className="text-[#0F172A] font-bold text-xs">{inspectStudentModal.course_name}</p>
              </div>

              <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0] space-y-0.5">
                <p className="text-[#64748B] font-semibold uppercase text-[10px]">Assigned Batch</p>
                <p className="text-[#2563EB] font-bold text-xs">{inspectStudentModal.batch || "Batch #14 (Morning Tech)"}</p>
              </div>

              <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0] space-y-0.5">
                <p className="text-[#64748B] font-semibold uppercase text-[10px]">CNIC / B-Form</p>
                <p className="text-[#0F172A] font-bold text-xs">{inspectStudentModal.cnic || "35201-1234567-1"}</p>
              </div>

              <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0] space-y-0.5">
                <p className="text-[#64748B] font-semibold uppercase text-[10px]">Guardian Name & Phone</p>
                <p className="text-[#0F172A] font-bold text-xs">{inspectStudentModal.guardian_name || "Tariq Hassan"} ({inspectStudentModal.guardian_phone || "03009988776"})</p>
              </div>

              <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0] space-y-0.5">
                <p className="text-[#64748B] font-semibold uppercase text-[10px]">Emergency Contact</p>
                <p className="text-[#0F172A] font-bold text-xs">{inspectStudentModal.emergency_phone || "03219988776"}</p>
              </div>

              <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0] space-y-0.5">
                <p className="text-[#64748B] font-semibold uppercase text-[10px]">Total Fee & Status</p>
                <p className="text-[#0F172A] font-bold text-xs">Rs. {Number(inspectStudentModal.course_fee || 25000).toLocaleString()} ({inspectStudentModal.fee_status || "Paid"})</p>
              </div>
            </div>

            <div className="pt-3 border-t border-[#E2E8F0] flex justify-between items-center">
              <button
                type="button"
                onClick={() => {
                  generatePrintable3MonthStudentCertificatePdf({
                    full_name: inspectStudentModal.full_name,
                    course_name: inspectStudentModal.course_name,
                    completion_date: inspectStudentModal.end_date || "2026-08-01",
                    certificate_no: `CERT-${inspectStudentModal.id || "9901"}`,
                    grade: "A+ (98%)",
                    instructor: inspectStudentModal.instructor || "Lead Course Instructor",
                  });
                }}
                className="bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#2563EB] font-bold px-3 py-2 rounded-xl text-xs transition-colors flex items-center gap-1.5"
              >
                <FaAward /> Generate Certificate
              </button>

              <button
                onClick={() => setInspectStudentModal(null)}
                className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors shadow-xs cursor-pointer"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION DESTRUCTIVE MODAL FOR DELETE STUDENT */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E2E8F0] space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 border-b border-[#E2E8F0] pb-3 text-[#0F172A]">
              <FaExclamationTriangle className="text-xl text-[#2563EB]" />
              <h3 className="font-bold text-[#0F172A] text-base">Delete Student Record</h3>
            </div>

            <p className="text-xs text-[#64748B] leading-relaxed">
              Are you sure you want to delete <strong>{deleteModal.student?.full_name}</strong>? This action will purge their enrollment record.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModal({ isOpen: false, student: null, loading: false })}
                className="flex-1 py-2.5 rounded-xl bg-white hover:bg-[#F8FAFC] text-[#2563EB] border border-[#E2E8F0] font-semibold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDeleteStudent}
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

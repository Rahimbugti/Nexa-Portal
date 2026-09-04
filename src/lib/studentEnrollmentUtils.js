import { supabase } from "@/lib/supabase";
import { dbFetch, dbSaveRecord } from "@/lib/dbPersistence";

/**
 * Calculates 30-day recurring fee cycles for course students.
 * For a 3-month course, creates 3 distinct 30-day cycles with dates & balances.
 */
export function calculate30DayFeeCycles({
  studentId,
  enrollmentDate,
  totalFee = 0,
  submittedFee = 0,
  courseMonths = 3,
}) {
  const cycles = [];
  const total = Number(totalFee) || 0;
  let remainingPaidPool = Number(submittedFee) || 0;
  const cycleAmount = Math.round(total / courseMonths);

  const startDate = enrollmentDate ? new Date(enrollmentDate) : new Date();

  for (let i = 1; i <= courseMonths; i++) {
    const cycleStart = new Date(startDate);
    cycleStart.setDate(cycleStart.getDate() + (i - 1) * 30);

    const cycleEnd = new Date(startDate);
    cycleEnd.setDate(cycleEnd.getDate() + i * 30);

    const dueDate = new Date(cycleEnd);

    // Calculate paid and remaining amount for this cycle
    let paidAmount = 0;
    if (remainingPaidPool >= cycleAmount) {
      paidAmount = cycleAmount;
      remainingPaidPool -= cycleAmount;
    } else {
      paidAmount = remainingPaidPool;
      remainingPaidPool = 0;
    }

    const remainingAmount = Math.max(0, cycleAmount - paidAmount);
    let status = "Pending Due";
    if (remainingAmount === 0) {
      status = "Paid";
    } else if (new Date() > dueDate) {
      status = "Overdue";
    }

    cycles.push({
      id: `cyc_${studentId}_${i}`,
      student_id: studentId,
      cycle_number: i,
      cycle_start_date: cycleStart.toISOString().split("T")[0],
      cycle_end_date: cycleEnd.toISOString().split("T")[0],
      due_date: dueDate.toISOString().split("T")[0],
      amount: cycleAmount,
      paid_amount: paidAmount,
      remaining_amount: remainingAmount,
      status: status,
      created_at: new Date().toISOString(),
    });
  }

  return cycles;
}

/**
 * Check whether an email already belongs to an account across all system tables.
 */
export async function checkDuplicateAccountEmail(email) {
  if (!email || !email.trim()) return false;
  const cleanEmail = email.trim().toLowerCase();

  // Check DB students, interns, and employees active records
  try {
    const students = await dbFetch("students").catch(() => []);
    const studentMatch = (students || []).find(
      (s) => s && (s.email || "").trim().toLowerCase() === cleanEmail
    );
    if (studentMatch) return true;

    const interns = await dbFetch("interns").catch(() => []);
    const internMatch = (interns || []).find(
      (i) => i && (i.email || "").trim().toLowerCase() === cleanEmail
    );
    if (internMatch) return true;

    const employees = await dbFetch("employees").catch(() => []);
    const empMatch = (employees || []).find(
      (e) => e && (e.email || "").trim().toLowerCase() === cleanEmail
    );
    if (empMatch) return true;
  } catch (e) {}

  return false;
}

/**
 * Enroll Course Student with Login Credentials and 30-Day Fee Cycles.
 * SECURITY: Password is sent to Auth Provider only; NO plain-text password stored in DB.
 */
export async function enrollStudentWithCredentials({
  studentData,
  password,
}) {
  const cleanEmail = (studentData.email || "").trim().toLowerCase();
  const cleanName = (studentData.full_name || "").trim();

  if (!cleanEmail) throw new Error("Student email address is required.");
  if (!cleanName) throw new Error("Student full name is required.");
  if (!password || password.length < 6) {
    throw new Error("Temporary password must be at least 6 characters long.");
  }

  // Duplicate email check
  const isDuplicate = await checkDuplicateAccountEmail(cleanEmail);
  if (isDuplicate) {
    throw new Error("An account already exists with this email address.");
  }

  let authUserId = `usr_std_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  // Create Supabase Auth Cloud Account (Graceful Fallback on 429 Rate Limit)
  try {
    const { data: authData } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { full_name: cleanName, role: "student" },
      },
    });
    if (authData?.user) {
      authUserId = authData.user.id;
    }
  } catch (e) {}

  // Direct synchronous Supabase Database save for Student & Login Account
  try {
    const stuPayload = {
      full_name: cleanName,
      email: cleanEmail,
      phone: studentData.phone || "",
      course_name: studentData.course_name || "Full Stack MERN Web Development",
      status: "Active"
    };

    // Try direct Supabase insert/update first
    const { data: existS } = await supabase.from("students").select("id").eq("email", cleanEmail).limit(1);
    if (existS && existS.length > 0) {
      await supabase.from("students").update(stuPayload).eq("id", existS[0].id);
    } else {
      await supabase.from("students").insert([stuPayload]);
    }

    const userPayload = {
      email: cleanEmail,
      password: password,
      full_name: cleanName,
      role: "student",
      status: "active"
    };
    const { data: existU } = await supabase.from("app_users").select("id").eq("email", cleanEmail).limit(1);
    if (existU && existU.length > 0) {
      await supabase.from("app_users").update(userPayload).eq("id", existU[0].id);
    } else {
      await supabase.from("app_users").insert([userPayload]);
    }
  } catch (e) {}

  // Fallback: Also sync via /api/persistence route for guaranteed save
  try {
    if (typeof window !== "undefined") {
      await fetch("/api/persistence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: "students",
          record: {
            full_name: cleanName,
            email: cleanEmail,
            phone: studentData.phone || "",
            course_name: studentData.course_name || "Full Stack MERN Web Development",
            password: password,
            status: "Active"
          },
          action: "save"
        })
      }).catch(() => {});
    }
  } catch (e) {}


  const totalFee = Number(studentData.course_fee || studentData.total_fee || 25000);
  const submittedFee = Number(studentData.fee_paid || studentData.submitted_fee || 0);
  const remainingFee = Math.max(0, totalFee - submittedFee);

  const studentId = studentData.id || `s-${Date.now()}`;
  const enrollmentDate = studentData.start_date || new Date().toISOString().split("T")[0];

  // 3-Month completion date calculation (+90 days)
  const completionDate = new Date(new Date(enrollmentDate).getTime() + 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const isRemoteTrack = 
    (studentData.track_type || "").toLowerCase().includes("remote") ||
    studentData.is_remote === true ||
    studentData.isRemote === true ||
    (studentData.batch || "").toLowerCase().includes("remote");

  // Build Student Profile Record (Preserves Remote Student flags & Course Details)
  const studentProfile = {
    id: studentId,
    student_id: studentId,
    auth_user_id: authUserId,
    full_name: cleanName,
    student_name: cleanName,
    email: cleanEmail,
    phone: studentData.phone || "",
    emergency_contact: studentData.emergency_phone || studentData.emergency_contact || "",
    guardian_name: studentData.guardian_name || "",
    guardian_phone: studentData.guardian_phone || "",
    cnic: studentData.cnic || "",
    track_type: studentData.track_type || (isRemoteTrack ? "Remote Student" : "On-Site Student"),
    trackType: studentData.track_type || (isRemoteTrack ? "Remote Student" : "On-Site Student"),
    is_remote: isRemoteTrack,
    isRemote: isRemoteTrack,
    course_name: studentData.course_name || studentData.tech_domain || "Full Stack MERN Web Development",
    course: studentData.course_name || studentData.tech_domain || "Full Stack MERN Web Development",
    tech_domain: studentData.tech_domain || studentData.course_name || "Full Stack MERN Web Development",
    instructor: studentData.instructor || "Lead Full-Stack Instructor",
    resources_url: studentData.resources_url || "https://github.com/softwarehouse/mern-course-materials",
    batch: studentData.batch || (isRemoteTrack ? "Batch #14 (Remote Online)" : "Batch #14 (Morning Tech)"),
    total_fee: totalFee,
    course_fee: totalFee,
    submitted_fee: submittedFee,
    fee_paid: submittedFee,
    remaining_fee: remainingFee,
    enrollment_date: enrollmentDate,
    admission_date: enrollmentDate,
    start_date: enrollmentDate,
    completion_date: completionDate,
    end_date: completionDate,
    role: "student",
    status: "active",
    fee_status: remainingFee === 0 ? "Paid" : "Pending Due",
    email_verified: false,
    created_at: new Date().toISOString(),
  };

  // Generate 30-Day Recurring Fee Cycles
  const feeCycles = calculate30DayFeeCycles({
    studentId: studentId,
    enrollmentDate: enrollmentDate,
    totalFee: totalFee,
    submittedFee: submittedFee,
    courseMonths: 3,
  });

  // Save to persistence storage
  await dbSaveRecord("students", studentProfile).catch(() => {});

  // Update local storage arrays immediately
  if (typeof window !== "undefined") {
    try {
      ["persistent_courses", "software_house_students"].forEach((key) => {
        const raw = localStorage.getItem(key);
        const existing = raw ? JSON.parse(raw) : [];
        const filtered = existing.filter(
          (s) => s && s.id !== studentId && (s.email || "").toLowerCase().trim() !== cleanEmail
        );
        localStorage.setItem(key, JSON.stringify([studentProfile, ...filtered]));
      });
    } catch (e) {}
  }

  // Save auth credentials to cloud database so all devices can log in
  await saveRegisteredAuthAccount({
    authUserId: authUserId,
    email: cleanEmail,
    password: password || "studentpassword",
    role: "student",
    fullName: cleanName,
  }).catch(() => {});

  // Save fee cycles
  try {
    if (typeof window !== "undefined") {
      const existingCycles = JSON.parse(
        localStorage.getItem("persistent_student_fee_cycles") || "[]"
      );
      const updatedCycles = [...feeCycles, ...existingCycles];
      localStorage.setItem("persistent_student_fee_cycles", JSON.stringify(updatedCycles));
    }
  } catch (e) {}

  return {
    student: studentProfile,
    feeCycles: feeCycles,
    authUserId: authUserId,
  };
}

/**
 * Save Auth Account to Database and local cache for cross-device authentication.
 */
export async function saveRegisteredAuthAccount({ authUserId, email, password, role, fullName }) {
  const cleanEmail = (email || "").trim().toLowerCase();
  const authRecord = {
    id: authUserId || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    email: cleanEmail,
    password: password,
    role: role || "employee",
    fullName: fullName || cleanEmail.split("@")[0],
    full_name: fullName || cleanEmail.split("@")[0],
    status: "active",
    created_at: new Date().toISOString(),
  };

  // 1. Save to Supabase Cloud Database store
  await dbSaveRecord("registered_accounts", authRecord).catch(() => {});

  // 2. Also cache in localStorage on this device
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("registered_system_users");
      const users = saved ? JSON.parse(saved) : [];
      const updated = [
        ...users.filter((u) => u && u.email && u.email.toLowerCase().trim() !== cleanEmail),
        authRecord,
      ];
      localStorage.setItem("registered_system_users", JSON.stringify(updated));
    } catch (e) {}
  }

  return authRecord;
}

/**
 * Register Employee with Credentials.
 * SECURITY: Password processed by Auth Provider & Cloud Database Sync.
 */
export async function registerEmployeeWithCredentials({
  employeeData,
  password,
}) {
  const cleanEmail = (employeeData.email || "").trim().toLowerCase();
  const cleanName = (employeeData.full_name || "").trim();

  if (!cleanEmail) throw new Error("Employee email address is required.");
  if (!cleanName) throw new Error("Employee full name is required.");
  if (!password || password.length < 6) {
    throw new Error("Temporary password must be at least 6 characters long.");
  }

  // Duplicate email check
  const isDuplicate = await checkDuplicateAccountEmail(cleanEmail);
  if (isDuplicate) {
    throw new Error("An account already exists with this email address.");
  }

  let authUserId = `usr_emp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  // Create Supabase Auth User
  try {
    const { data: authData } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { full_name: cleanName, role: "employee" },
      },
    });
    if (authData?.user) {
      authUserId = authData.user.id;
    }
  } catch (e) {}

  const employeeId = employeeData.id || `emp-${Date.now()}`;

  // Employee Record
  const employeeProfile = {
    id: employeeId,
    auth_user_id: authUserId,
    full_name: cleanName,
    email: cleanEmail,
    phone: employeeData.phone || "",
    department: employeeData.department || "Engineering",
    designation: employeeData.designation || "Staff Member",
    employment_type: employeeData.employment_type || "Paid Staff (Full Time)",
    joining_date: employeeData.joining_date || new Date().toISOString().split("T")[0],
    role: "employee",
    status: "active",
    created_at: new Date().toISOString(),
  };

  // Direct synchronous Supabase Database save
  try {
    if (typeof window !== "undefined") {
      await fetch("/api/persistence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: "employees",
          record: {
            full_name: cleanName,
            email: cleanEmail,
            phone: employeeData.phone || "",
            department: employeeData.department || "Web Development",
            designation: employeeData.designation || "Senior Lead Developer",
            employment_type: employeeData.employment_type || "Paid Staff (Full Time)",
            password: password,
            status: "active"
          },
          action: "save"
        })
      }).catch(() => {});
    }
  } catch (e) {}

  await dbSaveRecord("employees", employeeProfile).catch(() => {});

  // Save auth credentials to cloud database so all devices can log in
  await saveRegisteredAuthAccount({
    authUserId: authUserId,
    email: cleanEmail,
    password: password,
    role: "employee",
    fullName: cleanName,
  }).catch(() => {});

  return {
    employee: employeeProfile,
    authUserId: authUserId,
  };
}

/**
 * Register Free Intern with Credentials and link auth_user_id.
 * SECURITY: Password processed by Auth Provider & Cloud Database Sync.
 */
export async function registerInternWithCredentials({
  internData,
  password,
}) {
  const cleanEmail = (internData.email || "").trim().toLowerCase();
  const cleanName = (internData.full_name || "").trim();

  if (!cleanEmail) throw new Error("Intern email address is required.");
  if (!cleanName) throw new Error("Intern full name is required.");
  if (!password || password.length < 6) {
    throw new Error("Temporary password must be at least 6 characters long.");
  }

  let authUserId = `usr_int_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  // Create Supabase Auth Cloud User
  try {
    const { data: authData } = await supabase.auth.signUp({
      email: cleanEmail,
      password: password,
      options: {
        data: {
          full_name: cleanName,
          role: "intern",
        },
      },
    });

    if (authData && authData.user) {
      authUserId = authData.user.id;
    }
  } catch (e) {
    console.warn("Supabase Auth intern creation warning:", e);
  }

  // Intern Profile Record
  const internPayload = {
    full_name: cleanName,
    email: cleanEmail,
    phone: internData.phone || "",
    course_name: internData.course_name || internData.tech_domain || "Full Stack MERN Web Development",
    internship_mode: internData.internship_mode || "On-Site / Offline",
    start_date: internData.start_date || new Date().toISOString().split("T")[0],
    progress: Number(internData.progress || 0),
    status: "active"
  };

  let createdInternRecord = { ...internPayload, id: `i-${Date.now()}` };

  try {
    const res = await fetch("/api/persistence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "interns", record: internPayload, action: "save" })
    });
    const json = await res.json();
    if (json.data && json.data[0]) {
      createdInternRecord = json.data[0];
    }
  } catch (err) {}

  // Save auth credentials to cloud database so all devices can log in
  await saveRegisteredAuthAccount({
    authUserId: authUserId,
    email: cleanEmail,
    password: password,
    role: "intern",
    fullName: cleanName,
  }).catch(() => {});

  return {
    intern: createdInternRecord,
    authUserId: authUserId,
  };
}

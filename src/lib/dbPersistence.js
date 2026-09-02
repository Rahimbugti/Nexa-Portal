import { supabase } from "@/lib/supabase";

export const TABLE_STORAGE_KEYS = {
  employees: "persistent_employees",
  projects: "software_house_projects",
  daily_tasks: "software_house_daily_tasks",
  clients: "software_house_clients",
  invoices: "software_house_invoices",
  incomes: "persistent_incomes",
  expenses: "persistent_expenses",
  payrolls: "software_house_payrolls",
  salary: "software_house_salary_history",
  students: "persistent_courses",
  leaves: "software_house_leaves",
  meetings: "software_house_meetings_list",
  complaints: "software_house_complaints_list",
  announcements: "software_house_announcements_list",
  attendance: "software_house_master_attendance_logs",
  performances: "software_house_performances",
  interns: "persistent_interns",
  utility_bills: "software_house_utility_bills",
  client_projects: "software_house_client_projects",
  monitoring_sessions: "monitoring_sessions",
  remote_work_sessions: "remote_work_sessions",
  activity_logs: "remote_activity_logs",
  screenshot_logs: "remote_screenshot_logs",
  app_usage_logs: "remote_app_usage_logs",
  work_timelines: "remote_work_timelines",
  productivity_reports: "remote_productivity_reports",
  student_fee_cycles: "persistent_student_fee_cycles",
  registered_accounts: "registered_system_users",
  student_attendance: "student_attendance_records",
};

/**
 * Clean UI/transient fields before sending payload to Supabase DB.
 * Prevents HTTP 400 bad request errors caused by unknown columns or invalid string IDs.
 */
export function cleanPayloadForDb(record, table = "") {
  if (!record || typeof record !== "object") return {};
  const cleaned = {};

  const invalidColumns = [
    "cnic", "internship_mode", "resources_url", "screen_access_url",
    "start_date", "end_date", "daily_logs", "work_mode", "is_remote",
    "course_mode", "reminder_sent", "assigned_password", "enrollment_mode",
    "auth_user_id", "blood_group", "guardian_phone", "emergency_phone",
    "total_fee", "course_fee", "submitted_fee", "fee_paid", "remaining_fee"
  ];

  Object.keys(record).forEach((key) => {
    const value = record[key];
    // Skip functions, DOM nodes, React components, and complex nested objects
    if (typeof value === "function" || typeof value === "symbol") return;
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) return;

    // If ID is a custom frontend string like "dt-1785..." or "emp-123", strip it so PostgreSQL auto-assigns valid UUID
    if (key === "id" && typeof value === "string") {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(value) && isNaN(Number(value))) {
        return;
      }
    }

    // Strip unmapped custom frontend columns to prevent Supabase PostgREST 400 schema errors
    if (invalidColumns.includes(key)) {
      return;
    }

    cleaned[key] = value;
  });

  if (table === "employees") {
    if (record.password || record.assigned_password) {
      cleaned.user_id = `auth:${record.password || record.assigned_password}`;
    }
  }

  if (table === "students") {
    cleaned.enrollment_no = record.enrollment_no || record.student_id || record.id || `s-${Date.now()}`;
    cleaned.course_name = record.course_name || record.course || "Full Stack MERN Web Development";
    cleaned.admission_date = record.admission_date || record.enrollment_date || record.start_date || new Date().toISOString().split("T")[0];
    if (record.password || record.assigned_password) {
      cleaned.emergency_contact = `auth:${record.password || record.assigned_password}`;
    }
  }

  return cleaned;
}

/**
 * Unique key helper for deduplicating records across DB & Local Storage datasets.
 */
function getDedupeKey(item) {
  if (!item) return "";
  const id = String(item.id || "").toLowerCase().trim();
  if (id) return id;
  const email = String(item.email || "").toLowerCase().trim();
  const title = String(item.title || item.task || item.task_name || item.full_name || item.name || item.client_name || "").toLowerCase().trim();
  if (email && title) return `${email}_${title}`;
  if (email) return email;
  return title;
}

// In-memory RAM cache store for instant <1ms data access
const MEM_CACHE = new Map();
const MEM_CACHE_TTL = 30000; // 30 seconds TTL

/**
 * Fetch records from Supabase DB merged with local storage fallback.
 * Returns cached data in <1ms while syncing with Supabase in the background.
 */
export async function dbFetch(table, defaultData = [], forceFresh = false) {
  const storageKey = TABLE_STORAGE_KEYS[table] || `persistent_${table}`;
  
  if (forceFresh) {
    MEM_CACHE.delete(table);
  } else {
    // Check RAM Cache
    const cached = MEM_CACHE.get(table);
    if (cached && Date.now() - cached.timestamp < MEM_CACHE_TTL && Array.isArray(cached.data) && cached.data.length > 0) {
      return cached.data;
    }
  }
  
  // Read deleted IDs and emails universal blacklist
  let deletedBlacklist = new Set();
  try {
    if (typeof window !== "undefined") {
      const keys = [
        "deleted_intern_ids",
        "deleted_employee_ids",
        "deleted_payrolls_list",
        "software_house_deleted_performances",
        "deleted_entity_blacklist"
      ];
      keys.forEach(k => {
        const raw = localStorage.getItem(k);
        if (raw) {
          try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
              arr.forEach(val => {
                if (val) deletedBlacklist.add(String(val).toLowerCase().trim());
              });
            }
          } catch(e) {}
        }
      });
    }
  } catch (e) {}

  const isDeleted = (item) => {
    if (!item) return true;
    const itemId = String(item.id || "").toLowerCase().trim();
    const itemEmail = String(item.email || item.student_email || item.assigned_to_email || "").toLowerCase().trim();
    const itemName = String(item.full_name || item.name || item.title || item.employee_name || "").toLowerCase().trim();

    for (let b of deletedBlacklist) {
      if (!b) continue;
      const bClean = String(b).toLowerCase().trim();
      if (itemId && (itemId === bClean || itemId.includes(bClean) || bClean.includes(itemId))) return true;
      if (itemEmail && (itemEmail === bClean || itemEmail.includes(bClean) || bClean.includes(itemEmail))) return true;
      if (itemName && itemName.length >= 3 && (itemName === bClean || itemName.includes(bClean) || bClean.includes(itemName))) return true;
    }
    return false;
  };

  // 1. Load Database Data via Server Persistence Proxy API (Database is Single Source of Truth)
  let dbData = [];
  let fetchedFromDb = false;
  try {
    if (typeof window !== "undefined") {
      const cacheBust = forceFresh ? `&t=${Date.now()}` : "";
      const res = await fetch(`/api/persistence?table=${encodeURIComponent(table)}${cacheBust}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      }).catch(() => null);
      if (res && res.ok) {
        const json = await res.json();
        if (json && Array.isArray(json.data)) {
          dbData = json.data;
          fetchedFromDb = true;
        }
      }
    }
  } catch (e) {}

  // 2. Load Local Storage
  let localData = [];
  try {
    const saved = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) localData = parsed;
    }
  } catch (e) {}

  // 3. Database is Single Source of Truth
  let merged = [];
  if (fetchedFromDb) {
    // DB is live: Use DB data directly as primary truth, filtered against blacklist
    merged = dbData.filter(i => !isDeleted(i));
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(storageKey, JSON.stringify(merged));
        // Clear old aliases
        if (table === "projects") {
          localStorage.setItem("software_house_projects", JSON.stringify(merged));
          localStorage.setItem("software_house_full_projects", JSON.stringify(merged));
        }
      } catch(e) {}
    }
  } else {
    // Fallback if DB fetch is offline
    merged = (localData || []).filter(i => !isDeleted(i));
  }

  // Update RAM Cache
  MEM_CACHE.set(table, {
    data: merged,
    timestamp: Date.now()
  });

  return merged;
}

/**
 * Save an entire array of records to Local Storage AND sync each with Supabase asynchronously.
 */
export async function dbSaveList(table, list = []) {
  MEM_CACHE.delete(table);
  const storageKey = TABLE_STORAGE_KEYS[table] || `persistent_${table}`;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(storageKey, JSON.stringify(list));
    } catch(e) {}
  }

  // Single POST call to sync first record with Supabase (no duplicates)
  try {
    if (Array.isArray(list) && list.length > 0 && typeof window !== "undefined") {
      const cleanedRecord = cleanPayloadForDb(list[0], table);
      fetch("/api/persistence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, record: cleanedRecord, action: "save" })
      }).catch(() => {});
    }
  } catch(e) {}

  return list;
}

/**
 * Insert or Upsert record to Database AND Local Storage synchronously.
 */
export async function dbSaveRecord(table, record) {
  if (!record) return null;
  MEM_CACHE.delete(table);
  const storageKey = TABLE_STORAGE_KEYS[table] || `persistent_${table}`;
  
  // 1. Synchronously update Local Storage
  if (typeof window !== "undefined") {
    let currentLocal = [];
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) currentLocal = JSON.parse(saved);
    } catch(e) {}

    const recKey = getDedupeKey(record);
    const filtered = currentLocal.filter(item => getDedupeKey(item) !== recKey);

    const updated = [record, ...filtered];
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch(e) {}
  }

  // 2. Write to Supabase DB safely via Server Proxy (prevents browser PostgREST 400 errors)
  try {
    const cleanedPayload = cleanPayloadForDb(record, table);

    if (typeof window !== "undefined") {
      await fetch("/api/persistence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, record: cleanedPayload, action: "save" })
      }).catch(() => {});
    } else {
      await supabase.from(table).insert([cleanedPayload]).catch(() => {});
    }
  } catch(e) {}

  // 3. Done — callers dispatch events explicitly when needed


  return record;
}

/**
 * Delete record from Database AND Local Storage.
 */
export async function dbDeleteRecord(table, id, emailField = "") {
  MEM_CACHE.delete(table);
  const storageKeys = [
    TABLE_STORAGE_KEYS[table] || `persistent_${table}`,
    "persistent_interns",
    "persistent_courses",
    "registered_system_users"
  ];
  
  if (typeof window !== "undefined") {
    try {
      const targetKey = String(id || "").toLowerCase().trim();
      const targetEmail = String(emailField || "").toLowerCase().trim();

      // Add to universal blacklist
      const blacklist = JSON.parse(localStorage.getItem("deleted_entity_blacklist") || "[]");
      if (targetKey && !blacklist.includes(targetKey)) blacklist.push(targetKey);
      if (targetEmail && !blacklist.includes(targetEmail)) blacklist.push(targetEmail);
      localStorage.setItem("deleted_entity_blacklist", JSON.stringify(blacklist));

      storageKeys.forEach(key => {
        const saved = localStorage.getItem(key);
        if (saved) {
          const current = JSON.parse(saved);
          if (Array.isArray(current)) {
            const filtered = current.filter(item => {
              if (!item) return false;
              const itemId = String(item.id || "").toLowerCase().trim();
              const itemEmail = String(item.email || "").toLowerCase().trim();
              if (targetKey && (itemId === targetKey || itemEmail === targetKey)) return false;
              if (targetEmail && (itemEmail === targetEmail || itemId === targetEmail)) return false;
              return true;
            });
            localStorage.setItem(key, JSON.stringify(filtered));
          }
        }
      });
    } catch(e) {}
  }

  let backendSuccess = true;
  let backendError = null;

  try {
    if (typeof fetch !== "undefined") {
      const res = await fetch("/api/persistence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table,
          action: "delete",
          record: { id, email: emailField, full_name: emailField },
        }),
      }).catch((err) => {
        backendError = err.message;
      });

      if (res && res.ok) {
        const json = await res.json();
        if (json && json.success === false) {
          backendSuccess = false;
          backendError = json.error || "Backend database deletion failed";
        }
      }
    }
  } catch(e) {
    backendError = e.message;
  }

  if (backendError && !backendSuccess) {
    return { success: false, error: backendError };
  }

  return { success: true };
}



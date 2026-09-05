/**
 * Recurring Daily Task Cycle System Utilities
 * Software House Enterprise Portal
 */

export const TASK_STATUSES = {
  PENDING: "pending",
  SUBMITTED: "submitted",
  MISSED: "missed",
  CANCELLED: "cancelled",
  LATE_SUBMITTED: "late_submitted",
};

export const TASK_PRIORITIES = ["Low", "Medium", "High", "Urgent"];

export const SUBMISSION_TYPES = [
  { value: "any", label: "Any Method (Link, Text, or File)", shortLabel: "Any Method" },
  { value: "link", label: "Link / URL Required", shortLabel: "Link Required" },
  { value: "text", label: "Text / Notes Required", shortLabel: "Text Required" },
  { value: "file", label: "File Required", shortLabel: "File Required" },
  { value: "link_notes", label: "Link + Notes Required", shortLabel: "Link + Notes" },
  { value: "file_notes", label: "File + Notes Required", shortLabel: "File + Notes" }
];

/**
 * Ensures an external URL has a valid absolute protocol (https:// or http://)
 * to prevent the browser from treating it as an internal relative Next.js route.
 */
export function safeExternalUrl(urlString) {
  if (!urlString || typeof urlString !== "string") return "";
  const trimmed = urlString.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Validates if a given string is a valid web URL (http or https)
 */
export function isValidUrl(urlString) {
  if (!urlString || typeof urlString !== "string") return false;
  const trimmed = urlString.trim();
  if (!trimmed) return false;

  const urlWithProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(urlWithProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    // Hostname must be at least 3 chars and contain a dot or localhost
    if (!parsed.hostname || (parsed.hostname !== "localhost" && !parsed.hostname.includes("."))) {
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Validates a task submission according to the task's required submission type
 */
export function validateTaskSubmission({
  submissionType = "any",
  submissionUrl = "",
  submissionText = "",
  fileUrl = "",
  notes = ""
}) {
  const cleanUrl = (submissionUrl || "").trim();
  const cleanText = (submissionText || "").trim();
  const cleanFile = (fileUrl || "").trim();
  const cleanNotes = (notes || "").trim();

  // If a URL was entered, it must always be a valid URL
  if (cleanUrl && !isValidUrl(cleanUrl)) {
    return {
      isValid: false,
      error: "Please enter a valid URL (starting with https:// or http://).",
      cleaned: null
    };
  }

  const hasValidUrl = !!cleanUrl && isValidUrl(cleanUrl);
  const hasValidText = cleanText.length > 0;
  const hasValidFile = cleanFile.length > 0;
  const hasValidNotes = cleanNotes.length > 0;
  const hasMeaningfulText = hasValidText || hasValidNotes;

  const normalizedType = (submissionType || "any").toLowerCase().replace("-", "_").trim();

  switch (normalizedType) {
    case "link":
      if (!hasValidUrl) {
        return {
          isValid: false,
          error: "Please enter a valid submission link (e.g. https://example.com/your-work).",
          cleaned: null
        };
      }
      break;

    case "file":
      if (!hasValidFile) {
        return {
          isValid: false,
          error: "Please upload a file or provide a file attachment link before submitting.",
          cleaned: null
        };
      }
      break;

    case "text":
      if (!hasMeaningfulText) {
        return {
          isValid: false,
          error: "Please enter your submission text/notes before submitting the task.",
          cleaned: null
        };
      }
      break;

    case "link_notes":
      if (!hasValidUrl) {
        return {
          isValid: false,
          error: "Please enter a valid submission link.",
          cleaned: null
        };
      }
      if (!hasMeaningfulText) {
        return {
          isValid: false,
          error: "Please enter your submission notes/summary.",
          cleaned: null
        };
      }
      break;

    case "file_notes":
      if (!hasValidFile) {
        return {
          isValid: false,
          error: "Please upload a file before submitting the task.",
          cleaned: null
        };
      }
      if (!hasMeaningfulText) {
        return {
          isValid: false,
          error: "Please enter your submission notes/summary.",
          cleaned: null
        };
      }
      break;

    case "any":
    default:
      if (!hasValidUrl && !hasMeaningfulText && !hasValidFile) {
        return {
          isValid: false,
          error: "Please provide a link, text, or file before submitting the task.",
          cleaned: null
        };
      }
      break;
  }

  return {
    isValid: true,
    error: null,
    cleaned: {
      submissionUrl: cleanUrl,
      submissionText: cleanText,
      fileUrl: cleanFile,
      notes: cleanNotes
    }
  };
}

/**
 * Format a Date object into YYYY-MM-DD string in local/Pakistan timezone
 */
export function formatDateToYYYYMMDD(dateObj = new Date()) {
  const d = new Date(dateObj);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Calculate due timestamp (ISO string) for a given calendar date and daily due time.
 * e.g. dateStr: '2026-09-05', timeStr: '09:00' (in PKT / local)
 */
export function calculateDueTimestamp(dateStr, timeStr = "09:00:00") {
  if (!dateStr) dateStr = formatDateToYYYYMMDD();
  
  // Normalize time string e.g. "09:00" -> "09:00:00"
  let cleanTime = timeStr.trim();
  if (/^\d{1,2}:\d{2}$/.test(cleanTime)) {
    cleanTime = `${cleanTime.padStart(5, "0")}:00`;
  }

  // Create Date object in local time and export as ISO string
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hours, minutes, seconds = 0] = cleanTime.split(":").map(Number);

  const localDate = new Date(year, month - 1, day, hours, minutes, seconds);
  return localDate.toISOString();
}

/**
 * Generate cycle dates array for N days starting from startDate
 */
export function generateCycleSchedule(startDateStr, durationDays, dailyDueTime = "09:00:00") {
  const schedule = [];
  const start = new Date(startDateStr);

  for (let i = 0; i < durationDays; i++) {
    const current = new Date(start);
    current.setDate(start.getDate() + i);
    const dateStr = formatDateToYYYYMMDD(current);
    const dueAt = calculateDueTimestamp(dateStr, dailyDueTime);

    schedule.push({
      cycleNumber: i + 1,
      taskDate: dateStr,
      dueAt: dueAt,
    });
  }

  return schedule;
}

/**
 * Format timestamp into friendly 12-hour format e.g. "Sep 5, 2026, 09:00 AM"
 */
export function formatFriendlyDateTime(isoStr) {
  if (!isoStr) return "N/A";
  try {
    const d = new Date(isoStr);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch (e) {
    return isoStr;
  }
}

/**
 * Format 24-hour time to friendly 12-hour time e.g. "09:00:00" -> "09:00 AM"
 */
export function format12HourTime(timeStr) {
  if (!timeStr) return "--:--";
  const parts = String(timeStr).split(":");
  if (parts.length < 2) return timeStr;
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  const modifier = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${String(hours).padStart(2, "0")}:${minutes} ${modifier}`;
}

/**
 * Calculate completion rate percentage safely
 */
export function calculateCompletionRate(submittedCount, totalAssignedCount) {
  if (!totalAssignedCount || totalAssignedCount <= 0) return 0;
  return Math.round((submittedCount / totalAssignedCount) * 100);
}

/**
 * Calculate human-readable countdown remaining time
 */
export function getRemainingTimeFormatted(dueIsoStr) {
  if (!dueIsoStr) return { text: "No deadline", isPassed: false, diffMs: 0 };
  const due = new Date(dueIsoStr).getTime();
  const now = Date.now();
  const diffMs = due - now;
  if (diffMs <= 0) {
    return { text: "Deadline Passed", isPassed: true, diffMs };
  }
  const diffSecs = Math.floor(diffMs / 1000);
  const hours = Math.floor(diffSecs / 3600);
  const mins = Math.floor((diffSecs % 3600) / 60);
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;

  if (days > 0) {
    return { text: `${days}d ${remHours}h ${mins}m`, isPassed: false, diffMs };
  }
  return { text: `${String(hours).padStart(2, "0")}h ${String(mins).padStart(2, "0")}m`, isPassed: false, diffMs };
}


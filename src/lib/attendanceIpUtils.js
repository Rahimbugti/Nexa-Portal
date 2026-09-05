// Office Authorized Networks & Public IP Verification Engine (via ipify API)
// Enterprise Security Standard for Student Attendance

export const AUTHORIZED_OFFICE_NETWORK_CONFIG = {
  office_name: "Software House Main Office Wi-Fi",
  wifi_name: "Campus High-Speed Office Wi-Fi",
  authorized_ipv4: "192.168.100.144",
  subnet_mask: "255.255.255.0",
  default_gateway: "192.168.100.1",
  public_ip_address: "39.46.69.123",
  status: "Active"
};

export function getActiveOfficeNetworks() {
  return [AUTHORIZED_OFFICE_NETWORK_CONFIG];
}


/**
 * Fetches the user's current Public IP strictly using the ipify API
 * Fallback to seeip only if ipify is temporarily unreachable
 * Returns null if internet is disconnected or both fail (Fail-Closed)
 */
export async function fetchCurrentPublicIp() {
  if (typeof window !== "undefined" && !window.navigator.onLine) {
    return null;
  }

  // 1. Primary: ipify API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch("https://api.ipify.org?format=json", {
      cache: "no-store",
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data && data.ip && typeof data.ip === "string") {
        return data.ip.trim();
      }
    }
  } catch (err) {
    console.debug("ipify fetch notice:", err?.message);
  }

  // 2. Secondary fallback: seeip.org
  try {
    const controller2 = new AbortController();
    const timeoutId2 = setTimeout(() => controller2.abort(), 4000);
    const res2 = await fetch("https://api.seeip.org/jsonip", {
      cache: "no-store",
      signal: controller2.signal
    });
    clearTimeout(timeoutId2);
    if (res2.ok) {
      const data2 = await res2.json();
      if (data2 && data2.ip && typeof data2.ip === "string") {
        return data2.ip.trim();
      }
    }
  } catch (err2) {
    console.debug("seeip fetch notice:", err2?.message);
  }

  return null;
}

/**
 * Fetches the currently authorized Office Public IP from Supabase / API
 */
export async function fetchAuthorizedOfficePublicIp() {
  try {
    const res = await fetch("/api/attendance/office-ip", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data && data.office_public_ip) {
        return data.office_public_ip.trim();
      }
    }
  } catch (e) {
    console.debug("Office IP fetch notice:", e?.message);
  }

  try {
    const saved = localStorage.getItem("software_house_office_public_ip");
    if (saved) return saved.trim();
  } catch (e) {}

  return AUTHORIZED_OFFICE_NETWORK_CONFIG.public_ip_address.trim();
}

/**
 * Detect user's current network details (Local host, Public IP via ipify)
 */
export async function detectCurrentNetworkDetails() {
  const publicIp = await fetchCurrentPublicIp();
  const localIpv4 = typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
    ? window.location.hostname
    : "192.168.100.144";

  return {
    localIpv4,
    defaultGateway: "192.168.100.1",
    subnetMask: "255.255.255.0",
    publicIp: publicIp || "Disconnected / Offline"
  };
}

/**
 * Log attendance network attempt in local audit storage
 */
export function logAttendanceAttempt(attemptObj) {
  try {
    const savedLogs = localStorage.getItem("software_house_attendance_audit_logs");
    const existing = savedLogs ? JSON.parse(savedLogs) : [];
    const newLog = {
      id: `att-log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      date: new Date().toISOString().split("T")[0],
      ...attemptObj
    };
    const updated = [newLog, ...existing.slice(0, 49)];
    localStorage.setItem("software_house_attendance_audit_logs", JSON.stringify(updated));
    return newLog;
  } catch (e) {
    return null;
  }
}

/**
 * Verify Office Wi-Fi Attendance strictly based on User Role & ipify Public IP
 * 
 * Rules:
 * - Student role: STRICT IP MATCH REQUIRED (Must match authorized Office Public IP)
 * - If ipify fails / offline: FAIL CLOSED (Attendance Blocked)
 * - Employees/Admins/Interns: Allowed with audit logging
 */
export async function verifyOfficeWifiAttendance({ userId, userEmail, userRole, userName }) {
  const cleanRole = String(userRole || "").toLowerCase().trim();
  const isStudent = cleanRole === "student" || cleanRole === "course_student";

  const currentPublicIp = await fetchCurrentPublicIp();
  const authorizedOfficeIp = await fetchAuthorizedOfficePublicIp();

  // 1. Connection / IP Detection Check (Fail Closed)
  if (!currentPublicIp) {
    logAttendanceAttempt({
      userId: userId || userEmail,
      userEmail,
      userName,
      userRole,
      attemptIp: "Offline / Unable to Verify",
      officePublicIp: authorizedOfficeIp,
      status: "FAILED ❌",
      reason: "ipify verification failed or internet disconnected"
    });

    return {
      success: false,
      isVerified: false,
      currentPublicIp: "Offline / Disconnected",
      officePublicIp: authorizedOfficeIp,
      errorMessage: "Unable to verify office network. Please check your internet connection and try again."
    };
  }

  // 2. Strict Student Role Verification
  if (isStudent) {
    const isIpMatch = currentPublicIp.trim().toLowerCase() === authorizedOfficeIp.trim().toLowerCase();

    if (!isIpMatch) {
      logAttendanceAttempt({
        userId: userId || userEmail,
        userEmail,
        userName,
        userRole,
        attemptIp: currentPublicIp,
        officePublicIp: authorizedOfficeIp,
        status: "REJECTED 🛑",
        reason: "Public IP does not match Office Wi-Fi IP"
      });

      return {
        success: false,
        isVerified: false,
        currentPublicIp,
        officePublicIp: authorizedOfficeIp,
        errorMessage: "Attendance can only be marked while connected to the office network."
      };
    }

    // IP Matched Successfully for Student
    logAttendanceAttempt({
      userId: userId || userEmail,
      userEmail,
      userName,
      userRole,
      attemptIp: currentPublicIp,
      officePublicIp: authorizedOfficeIp,
      status: "VERIFIED 🟢",
      reason: "Office Public IP Matched via ipify"
    });

    return {
      success: true,
      isVerified: true,
      isStudent: true,
      currentPublicIp,
      officePublicIp: authorizedOfficeIp,
      message: "Office Wi-Fi network verified successfully."
    };
  }

  // 3. Employee / Staff / Admin / Intern Flow
  logAttendanceAttempt({
    userId: userId || userEmail,
    userEmail,
    userName,
    userRole,
    attemptIp: currentPublicIp,
    officePublicIp: authorizedOfficeIp,
    status: "VERIFIED 🟢",
    reason: "Staff / Remote Mode"
  });

  return {
    success: true,
    isVerified: true,
    isStudent: false,
    currentPublicIp,
    officePublicIp: authorizedOfficeIp,
    message: "Network verified."
  };
}

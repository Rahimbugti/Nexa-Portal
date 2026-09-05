/**
 * Attendance PDF Generator
 * Bulletproof print/PDF generation for:
 * 1. Global / Filtered Attendance List PDF
 * 2. Individual User's Dedicated Attendance List / History PDF
 * 3. Monthly Student / Employee Performance Statement PDF
 */

/**
 * Universal print handler that works even if browser popups are blocked
 */
function openHtmlInPrintWindow(htmlContent) {
  try {
    const printWindow = window.open("", "_blank");
    if (printWindow && printWindow.document) {
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      return;
    }
  } catch (err) {
    console.warn("window.open blocked or failed, falling back to hidden iframe printing", err);
  }

  // Fallback: Invisible iframe printing
  try {
    let iframe = document.getElementById("attendance-print-iframe");
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = "attendance-print-iframe";
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      document.body.appendChild(iframe);
    }

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(htmlContent);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }, 400);
  } catch (fallbackErr) {
    console.error("Iframe print fallback error:", fallbackErr);
    // As a final fallback, create a blob URL and open
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.location.href = url;
  }
}

/**
 * 1. Generate Dedicated Individual User Attendance List PDF
 * (For a single employee / student with all their attendance logs)
 */
export function generateSingleUserAttendancePdf({
  user = {},
  records = [],
  generatedBy = "Administrator"
} = {}) {
  const userName = user.user_name || user.name || user.full_name || user.student_name || "Employee / Student";
  const userRole = (user.user_role || user.role || user.department || "Staff").toUpperCase();
  const userEmail = user.user_email || user.email || "—";
  const userId = user.user_id || user.id || "NEXA-USER";
  const reportDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  // Calculate user specific metrics
  const totalLogs = records.length;
  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;
  let leaveCount = 0;
  let totalHoursSum = 0;

  records.forEach((r) => {
    const status = (r.attendance_status || r.status || "").toLowerCase();
    if (status.includes("leave")) {
      leaveCount++;
    } else if (status.includes("absent")) {
      absentCount++;
    } else if (status.includes("late") || status.includes("deduction")) {
      lateCount++;
    } else {
      presentCount++;
    }

    const hours = parseFloat(r.total_work_hours || r.work_hours || 0);
    if (!isNaN(hours)) totalHoursSum += hours;
  });

  const attendanceRate = totalLogs > 0 ? Math.round(((presentCount + lateCount) / totalLogs) * 100) : 100;

  const rowsHtml = records.map((r, index) => {
    const dateStr = r.attendance_date || r.date || "—";
    const status = r.attendance_status || r.status || "Present (On Time)";
    const checkIn = r.check_in_time || r.time || (r.created_at ? new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—");
    const checkOut = r.check_out_time || (r.type === "check_out" ? checkIn : "—");
    const workDuration = r.total_work_hours || r.work_hours || "—";
    const ip = r.public_ip || r.ip_address || "Office Network";
    const action = r.type === "check_in" ? "Clock-In" : (r.type === "check_out" ? "Clock-Out" : "Recorded");

    let badgeBg = "#ecfdf5";
    let badgeColor = "#047857";
    let badgeBorder = "#a7f3d0";
    const sLower = status.toLowerCase();

    if (sLower.includes("late")) {
      badgeBg = "#fffbeb";
      badgeColor = "#b45309";
      badgeBorder = "#fde68a";
    } else if (sLower.includes("absent")) {
      badgeBg = "#fef2f2";
      badgeColor = "#b91c1c";
      badgeBorder = "#fecaca";
    } else if (sLower.includes("leave")) {
      badgeBg = "#f5f3ff";
      badgeColor = "#6d28d9";
      badgeBorder = "#ddd6fe";
    }

    return `
      <tr>
        <td style="text-align: center; color: #64748b; font-weight: 600;">${index + 1}</td>
        <td style="font-weight: 700; color: #0f172a;">${dateStr}</td>
        <td>
          <span style="display: inline-block; font-size: 11px; font-weight: 700; color: ${badgeColor}; background: ${badgeBg}; border: 1px solid ${badgeBorder}; padding: 3px 9px; border-radius: 6px;">
            ${status}
          </span>
        </td>
        <td style="font-family: monospace; font-size: 11px; font-weight: 600; color: #059669;">${checkIn}</td>
        <td style="font-family: monospace; font-size: 11px; font-weight: 600; color: #dc2626;">${checkOut}</td>
        <td style="font-weight: 700; color: #2563eb;">${workDuration}</td>
        <td style="color: #475569;">${action}</td>
        <td style="font-family: monospace; font-size: 11px; color: #64748b;">${ip}</td>
      </tr>
    `;
  }).join("");

  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Individual Attendance Report - ${userName}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
            padding: 30px; 
            color: #0f172a; 
            background: #f8fafc; 
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact; 
          }
          .container { 
            background: #ffffff; 
            border: 1px solid #cbd5e1; 
            padding: 32px; 
            max-width: 1000px; 
            margin: 0 auto; 
            border-radius: 12px; 
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          }
          .header { 
            display: flex; 
            justify-content: space-between; 
            align-items: flex-start; 
            border-bottom: 2px solid #2563eb; 
            padding-bottom: 18px; 
            margin-bottom: 20px; 
          }
          .brand-title { font-size: 22px; font-weight: 900; color: #1e3a8a; }
          .brand-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
          .badge-box { text-align: right; }
          .badge-title { background: #eff6ff; color: #1d4ed8; font-size: 11px; font-weight: 800; padding: 5px 12px; border-radius: 6px; border: 1px solid #bfdbfe; text-transform: uppercase; }
          .badge-date { font-size: 11px; color: #64748b; margin-top: 4px; font-weight: 600; }
          
          .user-card { 
            background: #f8fafc; 
            border: 1px solid #e2e8f0; 
            border-radius: 10px; 
            padding: 16px 20px; 
            margin-bottom: 20px; 
            display: grid; 
            grid-template-columns: repeat(2, 1fr); 
            gap: 12px; 
            font-size: 12px; 
          }
          .user-card div strong { color: #334155; }
          
          .stats-grid { 
            display: grid; 
            grid-template-columns: repeat(5, 1fr); 
            gap: 10px; 
            margin-bottom: 24px; 
          }
          .stat-card { 
            background: #ffffff; 
            border: 1px solid #e2e8f0; 
            border-radius: 8px; 
            padding: 10px; 
            text-align: center; 
          }
          .stat-label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; }
          .stat-value { font-size: 18px; font-weight: 900; color: #0f172a; margin-top: 2px; }
          
          table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 26px; }
          th { background: #f1f5f9; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; padding: 10px; border-top: 1px solid #cbd5e1; border-bottom: 2px solid #cbd5e1; text-align: left; }
          td { padding: 9px 10px; border-bottom: 1px solid #f1f5f9; }
          tr:nth-child(even) { background: #fafbfc; }
          
          .signatures { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 36px; padding-top: 20px; border-top: 1px dashed #cbd5e1; font-size: 11px; }
          .sign-box { text-align: center; min-width: 170px; }
          .sign-line { border-bottom: 1px solid #0f172a; margin-bottom: 6px; height: 26px; }
          .seal-box { border: 2px dashed #2563eb; padding: 6px 14px; border-radius: 8px; background: #eff6ff; color: #1e40af; text-align: center; }
          
          @media print {
            body { padding: 0; background: #fff; }
            .container { border: none; box-shadow: none; padding: 0; max-width: 100%; }
            .no-print { display: none !important; }
            @page { margin: 12mm 10mm; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="no-print" style="display: flex; justify-content: flex-end; margin-bottom: 14px; gap: 10px;">
            <button onclick="window.print()" style="background: #2563eb; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; font-size: 12px; cursor: pointer;">
              🖨️ Print / Save as PDF
            </button>
            <button onclick="window.close()" style="background: #e2e8f0; color: #334155; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; font-size: 12px; cursor: pointer;">
              ✕ Close
            </button>
          </div>

          <div class="header">
            <div>
              <div class="brand-title">NEXA IT SOLUTIONS & SOFTWARE HOUSE</div>
              <div class="brand-sub">Individual Candidate Attendance & Activity Dossier</div>
            </div>
            <div class="badge-box">
              <div class="badge-title">INDIVIDUAL ATTENDANCE RECORD</div>
              <div class="badge-date">Date: ${reportDate}</div>
            </div>
          </div>

          <div class="user-card">
            <div><strong>Candidate Name:</strong> ${userName}</div>
            <div><strong>Designation / Role:</strong> ${userRole}</div>
            <div><strong>Candidate Email:</strong> ${userEmail}</div>
            <div><strong>Generated By:</strong> ${generatedBy}</div>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Total Logs</div>
              <div class="stat-value">${totalLogs}</div>
            </div>
            <div class="stat-card" style="border-bottom: 3px solid #10b981;">
              <div class="stat-label">Present</div>
              <div class="stat-value" style="color: #059669;">${presentCount}</div>
            </div>
            <div class="stat-card" style="border-bottom: 3px solid #f59e0b;">
              <div class="stat-label">Late</div>
              <div class="stat-value" style="color: #d97706;">${lateCount}</div>
            </div>
            <div class="stat-card" style="border-bottom: 3px solid #ef4444;">
              <div class="stat-label">Absent / Leave</div>
              <div class="stat-value" style="color: #dc2626;">${absentCount + leaveCount}</div>
            </div>
            <div class="stat-card" style="border-bottom: 3px solid #2563eb;">
              <div class="stat-label">Attendance Rate</div>
              <div class="stat-value" style="color: #2563eb;">${attendanceRate}%</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 30px; text-align: center;">#</th>
                <th>Attendance Date</th>
                <th>Status</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Work Hours</th>
                <th>Action</th>
                <th>Network IP</th>
              </tr>
            </thead>
            <tbody>
              ${records.length > 0 ? rowsHtml : `
                <tr>
                  <td colspan="8" style="text-align: center; padding: 25px; color: #64748b;">
                    No attendance records logged for this user yet.
                  </td>
                </tr>
              `}
            </tbody>
          </table>

          <div class="signatures">
            <div class="sign-box">
              <div class="sign-line"></div>
              <div style="font-weight: 700;">Candidate Signature</div>
            </div>
            <div class="seal-box">
              <div style="font-weight: 900; font-size: 11px;">OFFICIAL DOSSIER</div>
              <div style="font-size: 9px;">Nexa Administration</div>
            </div>
            <div class="sign-box">
              <div class="sign-line"></div>
              <div style="font-weight: 700;">HR / Admin Verification</div>
            </div>
          </div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 250);
          }
        </script>
      </body>
    </html>
  `;

  openHtmlInPrintWindow(html);
}

/**
 * 2. Generate Master / Global Attendance List PDF
 */
export function generatePrintableAttendanceListPdf({
  title = "Official Attendance Report",
  subtitle = "Daily & Organization-Wide Attendance Logs",
  reportDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
  filterInfo = "All Records",
  records = [],
  generatedBy = "Administrator"
} = {}) {
  const total = records.length;
  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;
  let halfDayCount = 0;

  records.forEach((r) => {
    const status = (r.attendance_status || r.status || "").toLowerCase();
    if (status.includes("late")) {
      lateCount++;
    } else if (status.includes("absent")) {
      absentCount++;
    } else if (status.includes("half")) {
      halfDayCount++;
    } else {
      presentCount++;
    }
  });

  const attendanceRate = total > 0 ? Math.round(((presentCount + lateCount) / total) * 100) : 0;

  const tableRowsHtml = records.map((r, index) => {
    const name = r.user_name || r.name || r.full_name || r.student_name || "Unknown User";
    const role = (r.user_role || r.role || r.department || "Employee").toUpperCase();
    const status = r.attendance_status || r.status || "Present (On Time)";
    const action = r.type === "check_in" ? "Clock-In" : (r.type === "check_out" ? "Clock-Out" : (r.last_action || "Logged"));
    const workHours = r.total_work_hours || r.work_hours || r.duration || "—";
    const ip = r.public_ip || r.ip_address || "Office Network";
    const dateStr = r.attendance_date || r.date || reportDate;
    const timeStr = r.check_in_time || r.time || (r.created_at ? new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—");

    let badgeBg = "#ecfdf5";
    let badgeColor = "#047857";
    let badgeBorder = "#a7f3d0";
    const sLower = status.toLowerCase();

    if (sLower.includes("late")) {
      badgeBg = "#fffbeb";
      badgeColor = "#b45309";
      badgeBorder = "#fde68a";
    } else if (sLower.includes("absent")) {
      badgeBg = "#fef2f2";
      badgeColor = "#b91c1c";
      badgeBorder = "#fecaca";
    } else if (sLower.includes("half")) {
      badgeBg = "#f5f3ff";
      badgeColor = "#6d28d9";
      badgeBorder = "#ddd6fe";
    }

    return `
      <tr>
        <td style="text-align: center; color: #64748b; font-weight: 600;">${index + 1}</td>
        <td>
          <div style="font-weight: 700; color: #0f172a;">${name}</div>
          <div style="font-size: 11px; color: #64748b;">${r.user_id ? `ID: ${r.user_id.slice(0, 8)}...` : (r.email || '')}</div>
        </td>
        <td>
          <span style="display: inline-block; font-size: 11px; font-weight: 700; color: #334155; background: #f1f5f9; padding: 2px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">
            ${role}
          </span>
        </td>
        <td>
          <span style="display: inline-block; font-size: 11px; font-weight: 700; color: ${badgeColor}; background: ${badgeBg}; border: 1px solid ${badgeBorder}; padding: 3px 9px; border-radius: 6px;">
            ${status}
          </span>
        </td>
        <td style="font-weight: 600; color: #334155;">${action}</td>
        <td style="font-weight: 700; color: #2563eb;">${workHours}</td>
        <td style="font-family: monospace; font-size: 11px; color: #475569;">${ip}</td>
        <td style="text-align: right; color: #334155; font-weight: 500;">
          <div>${dateStr}</div>
          <div style="font-size: 11px; color: #64748b;">${timeStr}</div>
        </td>
      </tr>
    `;
  }).join("");

  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>${title} - ${reportDate}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
            padding: 30px; 
            color: #0f172a; 
            background: #f8fafc; 
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact; 
          }
          .report-container { 
            background: #ffffff; 
            border: 1px solid #cbd5e1; 
            padding: 32px; 
            max-width: 1050px; 
            margin: 0 auto; 
            border-radius: 12px; 
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          }
          .header { 
            display: flex; 
            justify-content: space-between; 
            align-items: flex-start; 
            border-bottom: 2px solid #2563eb; 
            padding-bottom: 20px; 
            margin-bottom: 24px; 
          }
          .brand-title { font-size: 22px; font-weight: 900; color: #1e3a8a; }
          .brand-sub { font-size: 12px; color: #64748b; margin-top: 3px; font-weight: 500; }
          .report-badge { text-align: right; }
          .report-badge-title { background: #eff6ff; color: #1d4ed8; font-size: 12px; font-weight: 800; padding: 6px 14px; border-radius: 8px; border: 1px solid #bfdbfe; display: inline-block; text-transform: uppercase; }
          .report-date { font-size: 11px; color: #64748b; margin-top: 6px; font-weight: 600; }
          .meta-bar { display: flex; justify-content: space-between; align-items: center; background: #f1f5f9; padding: 12px 18px; border-radius: 8px; font-size: 12px; margin-bottom: 22px; border: 1px solid #e2e8f0; }
          .stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 24px; }
          .stat-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; text-align: center; }
          .stat-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
          .stat-value { font-size: 20px; font-weight: 900; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 28px; }
          th { background: #f8fafc; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; padding: 10px 12px; border-top: 1px solid #e2e8f0; border-bottom: 2px solid #cbd5e1; text-align: left; }
          td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
          tr:nth-child(even) { background: #fafbfc; }
          .signatures { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 36px; padding-top: 20px; border-top: 1px dashed #cbd5e1; font-size: 11px; }
          .sign-box { text-align: center; min-width: 180px; }
          .sign-line { border-bottom: 1px solid #0f172a; margin-bottom: 6px; height: 30px; }
          .seal-box { border: 2px dashed #3b82f6; padding: 8px 16px; border-radius: 8px; background: #eff6ff; color: #1e40af; text-align: center; }
          @media print {
            body { padding: 0; background: #fff; }
            .report-container { border: none; box-shadow: none; padding: 0; max-width: 100%; }
            .no-print { display: none !important; }
            @page { margin: 15mm 10mm; }
          }
        </style>
      </head>
      <body>
        <div class="report-container">
          <div class="no-print" style="display: flex; justify-content: flex-end; margin-bottom: 16px; gap: 10px;">
            <button onclick="window.print()" style="background: #2563eb; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; font-size: 12px; cursor: pointer;">
              🖨️ Print / Save as PDF
            </button>
            <button onclick="window.close()" style="background: #e2e8f0; color: #334155; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; font-size: 12px; cursor: pointer;">
              ✕ Close
            </button>
          </div>

          <div class="header">
            <div>
              <div class="brand-title">NEXA IT SOLUTIONS & SOFTWARE HOUSE</div>
              <div class="brand-sub">Official Human Resource & Student Attendance Management Department</div>
            </div>
            <div class="report-badge">
              <div class="report-badge-title">ATTENDANCE REPORT</div>
              <div class="report-date">Generated: ${reportDate}</div>
            </div>
          </div>

          <div class="meta-bar">
            <div><strong>Report Scope:</strong> ${title} (${subtitle})</div>
            <div><strong>Filter Applied:</strong> ${filterInfo}</div>
            <div><strong>Generated By:</strong> ${generatedBy}</div>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Total Logged</div>
              <div class="stat-value">${total}</div>
            </div>
            <div class="stat-card" style="border-bottom: 3px solid #10b981;">
              <div class="stat-label">Present (On Time)</div>
              <div class="stat-value" style="color: #059669;">${presentCount}</div>
            </div>
            <div class="stat-card" style="border-bottom: 3px solid #f59e0b;">
              <div class="stat-label">Late Arrivals</div>
              <div class="stat-value" style="color: #d97706;">${lateCount}</div>
            </div>
            <div class="stat-card" style="border-bottom: 3px solid #ef4444;">
              <div class="stat-label">Absent / Half Day</div>
              <div class="stat-value" style="color: #dc2626;">${absentCount + halfDayCount}</div>
            </div>
            <div class="stat-card" style="border-bottom: 3px solid #3b82f6;">
              <div class="stat-label">Attendance Rate</div>
              <div class="stat-value" style="color: #2563eb;">${attendanceRate}%</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 35px; text-align: center;">#</th>
                <th>Candidate / User Name</th>
                <th>Role / Dept</th>
                <th>Status</th>
                <th>Action</th>
                <th>Work Duration</th>
                <th>Network IP</th>
                <th style="text-align: right;">Date & Time</th>
              </tr>
            </thead>
            <tbody>
              ${records.length > 0 ? tableRowsHtml : `
                <tr>
                  <td colspan="8" style="text-align: center; padding: 30px; color: #64748b;">
                    No attendance records found matching this criteria.
                  </td>
                </tr>
              `}
            </tbody>
          </table>

          <div class="signatures">
            <div class="sign-box">
              <div class="sign-line"></div>
              <div style="font-weight: 700; color: #334155;">HR & Attendance In-charge</div>
              <div style="color: #64748b; font-size: 10px;">Verification Signature</div>
            </div>
            <div class="seal-box">
              <div style="font-weight: 900; font-size: 12px; letter-spacing: 1px;">OFFICIAL RECORD</div>
              <div style="font-size: 10px; margin-top: 2px;">Nexa Administration Seal</div>
            </div>
            <div class="sign-box">
              <div class="sign-line"></div>
              <div style="font-weight: 700; color: #334155;">Director / System Admin</div>
              <div style="color: #64748b; font-size: 10px;">Authorized Approval</div>
            </div>
          </div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 250);
          }
        </script>
      </body>
    </html>
  `;

  openHtmlInPrintWindow(html);
}

/**
 * 3. Individual Student / Employee Monthly Statement PDF
 */
export function generatePrintableUserMonthlyAttendancePdf({
  user = {},
  month = new Date().toLocaleString("en-US", { month: "long", year: "numeric" }),
  calendarDays = [],
  generatedBy = "Administrator"
} = {}) {
  const userName = user.name || user.full_name || "Employee";
  const userEmail = user.email || "—";
  const userRole = (user.role || user.type || "Staff").toUpperCase();
  const department = user.department || user.course_name || "Development & Engineering";

  let presentDays = 0;
  let lateDays = 0;
  let absentDays = 0;
  let leaveDays = 0;
  let totalHoursNum = 0;

  calendarDays.forEach((day) => {
    const s = (day.status || "").toLowerCase();
    if (s.includes("leave")) {
      leaveDays++;
    } else if (s.includes("absent")) {
      absentDays++;
    } else if (s.includes("late")) {
      lateDays++;
      if (day.hours) totalHoursNum += parseFloat(day.hours) || 0;
    } else if (s.includes("present") || s.includes("on time")) {
      presentDays++;
      if (day.hours) totalHoursNum += parseFloat(day.hours) || 0;
    }
  });

  const totalWorkingDays = calendarDays.filter(d => !d.isWeekend).length || 22;
  const attendanceRate = totalWorkingDays > 0 ? Math.min(100, Math.round(((presentDays + lateDays) / totalWorkingDays) * 100)) : 0;

  const dayRowsHtml = calendarDays.map((d, index) => {
    let badgeBg = "#ecfdf5";
    let badgeColor = "#047857";
    let badgeBorder = "#a7f3d0";
    const s = (d.status || "").toLowerCase();

    if (s.includes("late")) {
      badgeBg = "#fffbeb";
      badgeColor = "#b45309";
      badgeBorder = "#fde68a";
    } else if (s.includes("absent")) {
      badgeBg = "#fef2f2";
      badgeColor = "#b91c1c";
      badgeBorder = "#fecaca";
    } else if (s.includes("leave")) {
      badgeBg = "#f0fdf4";
      badgeColor = "#15803d";
      badgeBorder = "#bbf7d0";
    } else if (d.isWeekend) {
      badgeBg = "#f8fafc";
      badgeColor = "#94a3b8";
      badgeBorder = "#e2e8f0";
    }

    return `
      <tr style="${d.isWeekend ? 'background: #f8fafc; color: #94a3b8;' : ''}">
        <td style="text-align: center; font-weight: 600;">${index + 1}</td>
        <td style="font-weight: 700;">${d.date}</td>
        <td>${d.dayName || '—'}</td>
        <td>
          <span style="display: inline-block; font-size: 10px; font-weight: 700; color: ${badgeColor}; background: ${badgeBg}; border: 1px solid ${badgeBorder}; padding: 2px 8px; border-radius: 4px;">
            ${d.status || (d.isWeekend ? 'Off Day' : 'Absent')}
          </span>
        </td>
        <td style="font-family: monospace; font-size: 11px;">${d.checkIn || '—'}</td>
        <td style="font-family: monospace; font-size: 11px;">${d.checkOut || '—'}</td>
        <td style="font-weight: 700; color: #2563eb;">${d.hours ? `${d.hours} hrs` : '—'}</td>
        <td style="font-size: 11px; color: #64748b;">${d.notes || d.ip || '—'}</td>
      </tr>
    `;
  }).join("");

  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Attendance Statement - ${userName} (${month})</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            padding: 30px; 
            color: #0f172a; 
            background: #f8fafc; 
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact; 
          }
          .container { background: #fff; border: 1px solid #cbd5e1; padding: 32px; max-width: 960px; margin: 0 auto; border-radius: 12px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 22px; }
          .emp-box { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px; font-size: 12px; }
          .stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 24px; }
          .stat-card { background: #fff; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px; text-align: center; }
          .stat-label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; }
          .stat-val { font-size: 18px; font-weight: 900; color: #0f172a; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 24px; }
          th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; color: #475569; border-top: 1px solid #cbd5e1; border-bottom: 2px solid #cbd5e1; }
          td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; }
          .signatures { display: flex; justify-content: space-between; margin-top: 36px; padding-top: 20px; border-top: 1px dashed #cbd5e1; font-size: 11px; }
          .sign-box { text-align: center; min-width: 170px; }
          .sign-line { border-bottom: 1px solid #0f172a; margin-bottom: 6px; height: 26px; }
          @media print {
            body { padding: 0; background: #fff; }
            .container { border: none; padding: 0; max-width: 100%; }
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="no-print" style="display: flex; justify-content: flex-end; margin-bottom: 14px; gap: 10px;">
            <button onclick="window.print()" style="background: #2563eb; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; font-size: 12px; cursor: pointer;">
              🖨️ Print / Save as PDF
            </button>
            <button onclick="window.close()" style="background: #e2e8f0; color: #334155; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; font-size: 12px; cursor: pointer;">
              ✕ Close
            </button>
          </div>

          <div class="header">
            <div>
              <div style="font-size: 20px; font-weight: 900; color: #1e3a8a;">NEXA IT SOLUTIONS & SOFTWARE HOUSE</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Monthly Individual Attendance Performance Record</div>
            </div>
            <div style="text-align: right;">
              <div style="background: #eff6ff; color: #1d4ed8; padding: 5px 12px; border-radius: 6px; font-weight: 800; font-size: 11px; border: 1px solid #bfdbfe;">
                ${month}
              </div>
            </div>
          </div>

          <div class="emp-box">
            <div><strong>Candidate Name:</strong> ${userName}</div>
            <div><strong>Designation / Role:</strong> ${userRole}</div>
            <div><strong>Official Email:</strong> ${userEmail}</div>
            <div><strong>Department / Batch:</strong> ${department}</div>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Present</div>
              <div class="stat-val" style="color: #059669;">${presentDays} Days</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Late</div>
              <div class="stat-val" style="color: #d97706;">${lateDays} Days</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Absent</div>
              <div class="stat-val" style="color: #dc2626;">${absentDays} Days</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Leaves</div>
              <div class="stat-val" style="color: #6366f1;">${leaveDays} Days</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Attendance Rate</div>
              <div class="stat-val" style="color: #2563eb;">${attendanceRate}%</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 30px; text-align: center;">#</th>
                <th>Date</th>
                <th>Day</th>
                <th>Status</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Duration</th>
                <th>Remarks / IP</th>
              </tr>
            </thead>
            <tbody>
              ${dayRowsHtml}
            </tbody>
          </table>

          <div class="signatures">
            <div class="sign-box">
              <div class="sign-line"></div>
              <div style="font-weight: bold;">Candidate Signature</div>
            </div>
            <div class="sign-box">
              <div class="sign-line"></div>
              <div style="font-weight: bold;">HR / Supervisor Signature</div>
            </div>
          </div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 250);
          }
        </script>
      </body>
    </html>
  `;

  openHtmlInPrintWindow(html);
}

/**
 * 4. Generate Dedicated Student Attendance Report PDF
 * Official Student Attendance Statement with Period Summary & Daily Records
 */
export function generateStudentAttendancePdf({
  student = {},
  period = "Current Term",
  records = [],
  summary = null,
  generatedBy = "Administrator"
} = {}) {
  const studentName = student.full_name || student.name || student.student_name || "Student Candidate";
  const studentEmail = student.email || student.user_email || student.student_id || "—";
  const enrollmentNo = student.enrollment_no || student.student_id || student.id || "NEXA-STU";
  const courseName = student.course_name || student.course || student.department || "Full Stack Software Development";
  const batch = student.batch || "Regular Batch";
  const admissionDate = student.admission_date || student.startDate || "—";
  const reportDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  // Calculate or use provided summary
  let totalWorkingDays = 0;
  let presentDays = 0;
  let absentDays = 0;
  let lateDays = 0;
  let leaveDays = 0;
  let holidays = 0;

  if (summary) {
    totalWorkingDays = summary.total_working_days ?? 0;
    presentDays = summary.present_days ?? 0;
    absentDays = summary.absent_days ?? 0;
    lateDays = summary.late_days ?? 0;
    leaveDays = summary.leave_days ?? 0;
    holidays = summary.holidays ?? 0;
  } else {
    records.forEach((r) => {
      const st = (r.status || r.attendance_status || "").toLowerCase();
      const isSun = r.day_name === "Sunday" || r.is_sunday;
      if (st.includes("holiday") || isSun) {
        holidays++;
      } else {
        totalWorkingDays++;
        if (st.includes("absent")) {
          absentDays++;
        } else if (st.includes("late")) {
          lateDays++;
        } else if (st.includes("leave")) {
          leaveDays++;
        } else {
          presentDays++;
        }
      }
    });
  }

  const attendancePercentage = summary?.attendance_percentage !== undefined
    ? summary.attendance_percentage
    : (totalWorkingDays > 0 ? Number((((presentDays + lateDays) / totalWorkingDays) * 100).toFixed(2)) : 100);

  const rowsHtml = records.length > 0
    ? records.map((r, index) => {
        const dateStr = r.attendance_date || r.date || "—";
        const dayName = r.day_name || (dateStr !== "—" ? new Date(dateStr).toLocaleDateString("en-US", { weekday: "long" }) : "—");
        const status = r.status || r.attendance_status || "Present";
        const checkIn = r.check_in_time || r.check_in || "—";
        const checkOut = r.check_out_time || r.check_out || "—";
        const networkStatus = r.network_verified || r.public_ip ? "Office Verified 🟢" : "Standard";

        let badgeBg = "#ecfdf5";
        let badgeColor = "#047857";
        let badgeBorder = "#a7f3d0";
        const sLower = status.toLowerCase();

        if (sLower.includes("absent")) {
          badgeBg = "#fef2f2";
          badgeColor = "#b91c1c";
          badgeBorder = "#fecaca";
        } else if (sLower.includes("late")) {
          badgeBg = "#fffbeb";
          badgeColor = "#b45309";
          badgeBorder = "#fde68a";
        } else if (sLower.includes("leave")) {
          badgeBg = "#f5f3ff";
          badgeColor = "#6d28d9";
          badgeBorder = "#ddd6fe";
        } else if (sLower.includes("holiday") || sLower.includes("sunday")) {
          badgeBg = "#f1f5f9";
          badgeColor = "#475569";
          badgeBorder = "#cbd5e1";
        }

        return `
          <tr>
            <td style="text-align: center; color: #64748b; font-weight: 600; font-size: 11px;">${index + 1}</td>
            <td style="font-weight: 700; color: #0f172a; font-size: 11px;">${dateStr}</td>
            <td style="color: #475569; font-size: 11px;">${dayName}</td>
            <td>
              <span style="display: inline-block; font-size: 10px; font-weight: 800; color: ${badgeColor}; background: ${badgeBg}; border: 1px solid ${badgeBorder}; padding: 3px 8px; border-radius: 6px; text-transform: uppercase;">
                ${status}
              </span>
            </td>
            <td style="font-family: monospace; font-size: 11px; font-weight: 700; color: #059669;">${checkIn}</td>
            <td style="font-family: monospace; font-size: 11px; font-weight: 700; color: #475569;">${checkOut}</td>
            <td style="font-size: 10px; font-weight: 700; color: #2563eb;">${networkStatus}</td>
          </tr>
        `;
      }).join("")
    : `
      <tr>
        <td colspan="7" style="text-align: center; padding: 24px; color: #64748b; font-style: italic;">
          No attendance records found for this period.
        </td>
      </tr>
    `;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Student Attendance Report - ${studentName}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
            padding: 30px; 
            color: #0f172a; 
            background: #f8fafc; 
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact; 
          }
          .container { 
            background: #ffffff; 
            border: 1px solid #cbd5e1; 
            padding: 32px; 
            max-width: 1000px; 
            margin: 0 auto; 
            border-radius: 12px; 
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          }
          .header { 
            display: flex; 
            justify-content: space-between; 
            align-items: flex-start; 
            border-bottom: 2px solid #2563eb; 
            padding-bottom: 16px; 
            margin-bottom: 20px; 
          }
          .brand-title { font-size: 20px; font-weight: 900; color: #1e3a8a; letter-spacing: -0.5px; }
          .brand-sub { font-size: 12px; color: #64748b; margin-top: 3px; font-weight: 600; }
          .badge-box { text-align: right; }
          .badge-title { background: #eff6ff; color: #1d4ed8; font-size: 11px; font-weight: 800; padding: 5px 12px; border-radius: 6px; border: 1px solid #bfdbfe; text-transform: uppercase; letter-spacing: 0.5px; }
          .badge-date { font-size: 11px; color: #64748b; margin-top: 4px; font-weight: 600; }
          
          .student-card { 
            background: #f8fafc; 
            border: 1px solid #e2e8f0; 
            border-radius: 10px; 
            padding: 16px 20px; 
            margin-bottom: 20px; 
            display: grid; 
            grid-template-columns: repeat(3, 1fr); 
            gap: 12px; 
            font-size: 12px; 
          }
          .student-card div strong { color: #334155; }
          
          .stats-grid { 
            display: grid; 
            grid-template-columns: repeat(6, 1fr); 
            gap: 10px; 
            margin-bottom: 24px; 
          }
          .stat-card { 
            background: #ffffff; 
            border: 1px solid #e2e8f0; 
            border-radius: 8px; 
            padding: 12px 8px; 
            text-align: center; 
          }
          .stat-label { font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; }
          .stat-value { font-size: 18px; font-weight: 900; color: #0f172a; margin-top: 3px; }
          
          table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 26px; }
          th { background: #f1f5f9; color: #475569; font-weight: 800; text-transform: uppercase; font-size: 10px; padding: 10px; border-top: 1px solid #cbd5e1; border-bottom: 2px solid #cbd5e1; text-align: left; }
          td { padding: 9px 10px; border-bottom: 1px solid #f1f5f9; }
          tr:nth-child(even) { background: #fafbfc; }
          
          .signatures { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 36px; padding-top: 20px; border-top: 1px dashed #cbd5e1; font-size: 11px; }
          .sign-box { text-align: center; min-width: 170px; }
          .sign-line { border-bottom: 1px solid #0f172a; margin-bottom: 6px; height: 26px; }
          .seal-box { border: 2px dashed #2563eb; padding: 8px 18px; border-radius: 8px; background: #eff6ff; color: #1e40af; text-align: center; font-weight: 800; }
          
          @media print {
            body { padding: 0; background: #fff; }
            .container { border: none; box-shadow: none; padding: 0; max-width: 100%; }
            .no-print { display: none !important; }
            @page { size: A4 portrait; margin: 12mm 10mm; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="no-print" style="display: flex; justify-content: flex-end; margin-bottom: 14px; gap: 10px;">
            <button onclick="window.print()" style="background: #2563eb; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; font-size: 12px; cursor: pointer;">
              🖨️ Print / Save as PDF
            </button>
            <button onclick="window.close()" style="background: #e2e8f0; color: #334155; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; font-size: 12px; cursor: pointer;">
              ✕ Close
            </button>
          </div>

          <div class="header">
            <div>
              <div class="brand-title">NEXA IT SOLUTIONS & SOFTWARE HOUSE</div>
              <div class="brand-sub">Academic & Professional Student Attendance Record</div>
            </div>
            <div class="badge-box">
              <div class="badge-title">STUDENT ATTENDANCE REPORT</div>
              <div class="badge-date">Report Date: ${reportDate}</div>
            </div>
          </div>

          <div class="student-card">
            <div><strong>Student Name:</strong> ${studentName}</div>
            <div><strong>Official Email:</strong> ${studentEmail}</div>
            <div><strong>Enrollment No:</strong> ${enrollmentNo}</div>
            <div><strong>Course / Domain:</strong> ${courseName}</div>
            <div><strong>Batch:</strong> ${batch}</div>
            <div><strong>Report Period:</strong> <span style="color: #2563eb; font-weight: bold;">${period}</span></div>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Working Days</div>
              <div class="stat-value" style="color: #0f172a;">${totalWorkingDays}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Present</div>
              <div class="stat-value" style="color: #059669;">${presentDays}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Absent</div>
              <div class="stat-value" style="color: #dc2626;">${absentDays}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Late</div>
              <div class="stat-value" style="color: #d97706;">${lateDays}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Holidays</div>
              <div class="stat-value" style="color: #64748b;">${holidays}</div>
            </div>
            <div class="stat-card" style="background: #eff6ff; border-color: #bfdbfe;">
              <div class="stat-label" style="color: #1d4ed8;">Attendance %</div>
              <div class="stat-value" style="color: #1d4ed8;">${attendancePercentage}%</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 35px; text-align: center;">#</th>
                <th style="width: 90px;">Date</th>
                <th style="width: 95px;">Day</th>
                <th style="width: 110px;">Status</th>
                <th style="width: 95px;">Check-In</th>
                <th style="width: 95px;">Check-Out</th>
                <th>Network Verification</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="signatures">
            <div class="sign-box">
              <div class="sign-line"></div>
              <div style="font-weight: 700; color: #334155;">Student Signature</div>
            </div>
            <div class="seal-box">
              <div>OFFICIAL VERIFIED RECORD</div>
              <div style="font-size: 9px; font-weight: normal; margin-top: 2px;">Nexa Academic Affairs</div>
            </div>
            <div class="sign-box">
              <div class="sign-line"></div>
              <div style="font-weight: 700; color: #334155;">Academic Registrar / Admin</div>
            </div>
          </div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 250);
          }
        </script>
      </body>
    </html>
  `;

  openHtmlInPrintWindow(html);
}


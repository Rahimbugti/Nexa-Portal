"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/Toast";
import { dbFetch } from "@/lib/dbPersistence";
import {
  fetchAllStudents,
  getStudentAttendanceByDate,
  markBulkStudentAttendance,
  exportAttendanceToCSV,
  getAttendanceStatusColor,
  calculateAttendancePercentage,
  timeToMinutes,
  minutesToTime
} from "@/lib/studentAttendanceUtils";
import { fetchAttendancePolicy } from "@/lib/attendancePolicyUtils";
import {
  FaUserGraduate,
  FaCheckCircle,
  FaTimesCircle,
  FaClock,
  FaCalendarAlt,
  FaDownload,
  FaSearch,
  FaChevronLeft,
  FaChevronRight,
  FaTable,
  FaChartBar,
  FaSave,
  FaFilter,
  FaEllipsisV,
  FaTrashAlt,
  FaInfoCircle,
  FaExclamationTriangle,
  FaFilePdf
} from "react-icons/fa";
import { generatePrintableAttendanceListPdf } from "@/lib/generateAttendancePdf";

export default function StudentAttendancePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [students, setStudents] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [attendanceState, setAttendanceState] = useState({}); // studentId -> status
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [attendancePolicy, setAttendancePolicy] = useState(null);

  // Load policy on mount
  useEffect(() => {
    const loadPolicy = async () => {
      try {
        const policy = await fetchAttendancePolicy();
        setAttendancePolicy(policy);
      } catch (e) {
        console.error("Error loading attendance policy:", e);
      }
    };
    loadPolicy();
  }, []);

  // Load students and attendance for selected date
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      
      try {
        // Load students
        const allStudents = await dbFetch("students").catch(() => []);
        setStudents(allStudents || []);

        // Load attendance for selected date
        if (selectedDate) {
          const attendance = await getStudentAttendanceByDate(selectedDate);
          setAttendanceRecords(attendance || []);

          // Initialize attendance state
          const state = {};
          (attendance || []).forEach(record => {
            const studentId = record.student_id || record.user_email || record.user_id || "";
            state[studentId] = record.status || record.attendance_status || "Present";
          });
          setAttendanceState(state);
        }
      } catch (e) {
        console.error("Error loading data:", e);
        showToast("Error", "Failed to load data", "error");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedDate]);

  // Filter students based on search
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students;
    
    const query = searchQuery.toLowerCase().trim();
    return students.filter(student =>
      (student.full_name || "").toLowerCase().includes(query) ||
      (student.email || "").toLowerCase().includes(query) ||
      (student.student_name || "").toLowerCase().includes(query)
    );
  }, [students, searchQuery]);

  // Calculate attendance stats
  const attendanceStats = useMemo(() => {
    const present = Object.values(attendanceState).filter(s => 
      (s || "").toLowerCase().includes("present") || (s || "").toLowerCase().includes("on time")
    ).length;
    const absent = Object.values(attendanceState).filter(s => 
      (s || "").toLowerCase().includes("absent")
    ).length;
    const late = Object.values(attendanceState).filter(s => 
      (s || "").toLowerCase().includes("late")
    ).length;
    const leave = Object.values(attendanceState).filter(s => 
      (s || "").toLowerCase().includes("leave")
    ).length;

    return { present, absent, late, leave, total: Object.keys(attendanceState).length };
  }, [attendanceState]);

  // Handle attendance status change
  const handleStatusChange = (studentId, newStatus) => {
    setAttendanceState(prev => ({
      ...prev,
      [studentId]: newStatus
    }));
  };

  // Save attendance
  const handleSaveAttendance = async () => {
    const hasChanges = Object.keys(attendanceState).length > 0;
    
    if (!hasChanges) {
      showToast("No Changes", "No attendance changes to save", "info");
      return;
    }

    setSaving(true);

    try {
      const attendanceData = students.map(student => {
        const studentId = student.email || student.id || student.student_id || "";
        return {
          student_id: studentId,
          student_name: student.full_name || student.student_name || "",
          date: selectedDate,
          status: attendanceState[studentId] || "Present",
          ip_address: "127.0.0.1"
        };
      });

      const result = await markBulkStudentAttendance(attendanceData);

      if (result.success || (result.data && result.data.length > 0)) {
        showToast("Saved Successfully", `${result.saved || result.data.length || 0} attendance records saved`, "success");
        
        // Reload attendance records
        const updatedRecords = await getStudentAttendanceByDate(selectedDate);
        setAttendanceRecords(updatedRecords || []);
        
        // Update state
        const newState = {};
        (updatedRecords || []).forEach(record => {
          const studentId = record.student_id || record.user_email || record.user_id || "";
          newState[studentId] = record.status || record.attendance_status || "Present";
        });
        setAttendanceState(newState);
      } else {
        showToast("Save Failed", result.error || "Failed to save attendance", "error");
      }
    } catch (e) {
      console.error("Error saving attendance:", e);
      showToast("Error", e.message || "Failed to save attendance", "error");
    } finally {
      setSaving(false);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const attendanceData = students.map(student => {
      const studentId = student.email || student.id || student.student_id || "";
      return {
        student_id: studentId,
        student_name: student.full_name || student.student_name || "",
        date: selectedDate,
        status: attendanceState[studentId] || "Present",
        ip_address: "127.0.0.1"
      };
    });

    const filename = `student_attendance_${selectedDate}.csv`;
    exportAttendanceToCSV(attendanceData, filename);
    showToast("Exported", `Attendance exported to ${filename}`, "success");
  };

  // Export to PDF
  const handleExportPDF = () => {
    try {
      const formattedRecords = students.map(student => {
        const studentId = student.email || student.id || student.student_id || "";
        const status = attendanceState[studentId] || "Present";
        return {
          user_name: student.full_name || student.student_name || "Student",
          email: student.email || "",
          user_id: student.id || studentId,
          user_role: student.course_name || "Course Student",
          attendance_status: status,
          type: status === "Present" || status === "Late" ? "check_in" : "absent",
          total_work_hours: "2.5 hrs",
          public_ip: "Student Portal / Campus",
          attendance_date: selectedDate,
          check_in_time: "10:00 AM"
        };
      });

      generatePrintableAttendanceListPdf({
        title: "Student Daily Attendance Report",
        subtitle: `Attendance Date: ${selectedDate}`,
        reportDate: selectedDate,
        filterInfo: `Total Students Enrolled: ${students.length}`,
        records: formattedRecords,
        generatedBy: "Course Instructor / Admin"
      });
      showToast("PDF Ready 📄", "Student attendance list opened for printing or PDF download.", "success");
    } catch(e) {
      showToast("PDF Error", "Failed to generate student attendance PDF.", "error");
    }
  };

  // Handle date change
  const handleDateChange = (daysOffset) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + daysOffset);
    setSelectedDate(date.toISOString().split("T")[0]);
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center space-y-3 text-[#0F172A]">
        <div className="w-8 h-8 border-3 border-[#2563EB] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-bold text-[#64748B]">Loading Student Attendance Portal...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      {/* HEADER */}
      <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] bg-[#EFF6FF] px-2.5 py-1 rounded-full border border-[#2563EB]/20">
              Student Attendance
            </span>
            <span className="text-[10px] font-semibold text-[#64748B] bg-[#F8FAFC] px-2.5 py-1 rounded-full border border-[#E2E8F0] flex items-center gap-1">
              <FaCalendarAlt className="text-[#2563EB]" /> {selectedDate}
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-[#0F172A] mt-1.5 flex items-center gap-2.5">
            <FaUserGraduate className="text-[#2563EB]" />
            <span>Student Daily Attendance Workspace</span>
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Mark attendance for all students with a single click. Status: Present, Absent, Late, or Leave.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleDateChange(-1)}
            className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-semibold transition-colors"
          >
            <FaChevronLeft />
          </button>
          <button
            type="button"
            onClick={() => handleDateChange(1)}
            className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-semibold transition-colors"
          >
            <FaChevronRight />
          </button>
          <button
            type="button"
            onClick={handleSaveAttendance}
            disabled={saving}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-slate-300 text-white font-bold px-6 py-2 rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
          >
            <FaSave className="text-xs" /> {saving ? "Saving..." : "Save Attendance"}
          </button>
          <button
            type="button"
            onClick={handleExportPDF}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
          >
            <FaFilePdf className="text-xs" /> Export PDF
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-semibold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <FaDownload className="text-xs" /> Export CSV
          </button>
        </div>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-[#E2E8F0] shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-green-100 text-green-700">
              <FaCheckCircle className="text-lg" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-[#64748B]">Present</p>
              <p className="text-xl font-bold text-[#0F172A]">{attendanceStats.present}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[#E2E8F0] shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-red-100 text-red-700">
              <FaTimesCircle className="text-lg" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-[#64748B]">Absent</p>
              <p className="text-xl font-bold text-[#0F172A]">{attendanceStats.absent}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[#E2E8F0] shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-yellow-100 text-yellow-700">
              <FaClock className="text-lg" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-[#64748B]">Late</p>
              <p className="text-xl font-bold text-[#0F172A]">{attendanceStats.late}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[#E2E8F0] shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-100 text-blue-700">
              <FaInfoCircle className="text-lg" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-[#64748B]">On Leave</p>
              <p className="text-xl font-bold text-[#0F172A]">{attendanceStats.leave}</p>
            </div>
          </div>
        </div>
      </div>

      {/* SEARCH AND FILTER */}
      <div className="bg-white rounded-2xl p-4 border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="flex-1 relative">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8] text-sm" />
          <input
            type="text"
            placeholder="Search students..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E2E8F0] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 outline-none transition-all text-sm"
          />
        </div>
        
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[#64748B]">Total:</span>
          <span className="font-bold text-[#0F172A]">{filteredStudents.length} Students</span>
        </div>
      </div>

      {/* ATTENDANCE GRID */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <th className="p-4 text-left text-[10px] font-bold uppercase text-[#64748B]">Student</th>
                <th className="p-4 text-center text-[10px] font-bold uppercase text-[#64748B]">Present</th>
                <th className="p-4 text-center text-[10px] font-bold uppercase text-[#64748B]">Absent</th>
                <th className="p-4 text-center text-[10px] font-bold uppercase text-[#64748B]">Late</th>
                <th className="p-4 text-center text-[10px] font-bold uppercase text-[#64748B]">Leave</th>
                <th className="p-4 text-center text-[10px] font-bold uppercase text-[#64748B]">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-[#64748B]">
                    <FaUserGraduate className="mx-auto mb-2 text-3xl text-[#cbd5e1]" />
                    <p className="text-sm">No students found</p>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => {
                  const studentId = student.email || student.id || student.student_id || "";
                  const status = attendanceState[studentId] || "Present";
                  const record = attendanceRecords.find(r => 
                    (r.student_id || r.user_email || r.user_id || "") === studentId
                  );

                  return (
                    <tr key={studentId} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center font-bold text-sm shrink-0">
                            {student.full_name?.charAt(0) || student.student_name?.charAt(0) || student.email?.charAt(0) || "S"}
                          </div>
                          <div>
                            <p className="font-semibold text-[#0F172A] text-sm">{student.full_name || student.student_name || "Unknown Student"}</p>
                            <p className="text-xs text-[#64748B]">{student.email || studentId}</p>
                          </div>
                        </div>
                      </td>
                      
                      <td className="p-4">
                        <button
                          type="button"
                          onClick={() => handleStatusChange(studentId, "Present")}
                          className={`w-full py-2 rounded-lg text-xs font-semibold transition-all ${
                            status === "Present" 
                              ? "bg-green-600 text-white shadow-md" 
                              : "bg-[#F1F5F9] text-[#64748B] hover:bg-green-50"
                          }`}
                        >
                          Present
                        </button>
                      </td>
                      
                      <td className="p-4">
                        <button
                          type="button"
                          onClick={() => handleStatusChange(studentId, "Absent")}
                          className={`w-full py-2 rounded-lg text-xs font-semibold transition-all ${
                            status === "Absent" 
                              ? "bg-red-600 text-white shadow-md" 
                              : "bg-[#F1F5F9] text-[#64748B] hover:bg-red-50"
                          }`}
                        >
                          Absent
                        </button>
                      </td>
                      
                      <td className="p-4">
                        <button
                          type="button"
                          onClick={() => handleStatusChange(studentId, "Late")}
                          className={`w-full py-2 rounded-lg text-xs font-semibold transition-all ${
                            status === "Late" 
                              ? "bg-yellow-500 text-white shadow-md" 
                              : "bg-[#F1F5F9] text-[#64748B] hover:bg-yellow-50"
                          }`}
                        >
                          Late
                        </button>
                      </td>
                      
                      <td className="p-4">
                        <button
                          type="button"
                          onClick={() => handleStatusChange(studentId, "Leave")}
                          className={`w-full py-2 rounded-lg text-xs font-semibold transition-all ${
                            status === "Leave" 
                              ? "bg-blue-600 text-white shadow-md" 
                              : "bg-[#F1F5F9] text-[#64748B] hover:bg-blue-50"
                          }`}
                        >
                          Leave
                        </button>
                      </td>
                      
                      <td className="p-4 text-center">
                        {record ? (
                          <p className="text-xs text-[#64748B]">
                            {new Date(record.created_at || record.updated_at || record.timestamp).toLocaleTimeString([], { 
                              hour: "2-digit", 
                              minute: "2-digit" 
                            })}
                          </p>
                        ) : (
                          <p className="text-xs text-[#cbd5e1]">—</p>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* INSTRUCTIONS */}
      <div className="bg-blue-50 rounded-2xl p-6 border border-blue-100">
        <div className="flex items-start gap-3">
          <FaInfoCircle className="text-blue-600 text-xl shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-blue-900 text-sm mb-1">How to use this attendance system:</h3>
            <ul className="text-xs text-blue-800 space-y-1 list-disc pl-5">
              <li>Select the date using the calendar controls in the header</li>
              <li>Click on "Present", "Absent", "Late", or "Leave" for each student</li>
              <li>Use the search bar to quickly find specific students</li>
              <li>Click "Save Attendance" to save all changes to Supabase</li>
              <li>Click "Export CSV" to download a report of today's attendance</li>
              <li>Attendance stats are shown at the top for quick overview</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

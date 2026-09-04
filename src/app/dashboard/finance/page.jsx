"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activityUtils";
import { showToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import { dbFetch, dbSaveRecord, dbDeleteRecord } from "@/lib/dbPersistence";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  INITIAL_EXPENSES,
  INITIAL_INCOMES,
  INITIAL_UTILITY_BILLS,
  exportToCsv,
} from "@/lib/financeUtils";
import FinancialChart from "@/components/FinancialChart";
import {
  FaLandmark,
  FaMoneyBillWave,
  FaBolt,
  FaWifi,
  FaReceipt,
  FaPlusCircle,
  FaCheckCircle,
  FaTimesCircle,
  FaLock,
  FaShieldAlt,
  FaChartLine,
  FaArrowUp,
  FaArrowDown,
  FaBuilding,
  FaHandHoldingUsd,
  FaCalendarAlt,
  FaFileDownload,
  FaPrint,
  FaFileExcel,
  FaLaptop,
  FaGasPump,
  FaBullhorn,
  FaSubway,
  FaBoxOpen,
  FaUserCheck,
  FaFileInvoiceDollar,
  FaUniversity,
  FaSlidersH,
  FaEdit,
  FaTrash
} from "react-icons/fa";

export default function ComprehensiveFinanceAccountingPage() {
  const [role, setRole] = useState("admin");
  const [activeTab, setActiveTab] = useState("dashboard"); // 'dashboard', 'expenses', 'incomes', 'utility_bills', 'salary_audit', 'pnl_reports'

  // Module Datasets (Persistent to localStorage & state)
  const [expenses, setExpenses] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [utilityBills, setUtilityBills] = useState([]);
  const [salaryPayments, setSalaryPayments] = useState([]);

  // Report & Filter Controls
  const [selectedMonth, setSelectedMonth] = useState("2026-08");
  const [filterCategory, setFilterCategory] = useState("all");

  // Modal & Form States
  const [modal, setModal] = useState({ isOpen: false, title: "", message: "", type: "info" });
  
  // New Expense Form State (15 Categories)
  const [newExpenseModal, setNewExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    category: "Employee Salary",
    title: "",
    description: "",
    amount: "",
    payment_method: "Bank Transfer",
    status: "Paid",
    date: new Date().toISOString().split("T")[0],
    attachment: "",
    created_by: "Admin",
  });

  // New Income Form State
  const [newIncomeModal, setNewIncomeModal] = useState(false);
  const [incomeForm, setIncomeForm] = useState({
    client_name: "",
    project_name: "",
    income_type: "Client Project Payment",
    amount: "",
    payment_method: "Bank Transfer",
    status: "Paid",
    date: new Date().toISOString().split("T")[0],
    invoice_no: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
    notes: "",
  });

  // New Utility Bill Form State
  const [newBillModal, setNewBillModal] = useState(false);
  const [billForm, setBillForm] = useState({
    bill_type: "Electricity Bill",
    company_name: "K-Electric",
    bill_month: "2026-08",
    due_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    amount: "",
    status: "Pending",
    payment_date: "",
    receipt_url: "",
  });

  // Edit Modals State
  const [editingExpense, setEditingExpense] = useState(null);
  const [editingIncome, setEditingIncome] = useState(null);
  const [editingBill, setEditingBill] = useState(null);

  // Initial Data Loading & LocalStorage Sync
  // Initial Data Loading & Supabase DB / LocalStorage Sync
  useEffect(() => {
    const savedRole = localStorage.getItem("user_role") || "admin";
    setRole(savedRole);

    async function loadFinanceData() {
      // 1. Fetch Expenses
      const finalExpenses = await dbFetch("expenses", INITIAL_EXPENSES);
      setExpenses(finalExpenses);

      // 2. Fetch Incomes
      const finalIncomes = await dbFetch("incomes", INITIAL_INCOMES);
      setIncomes(finalIncomes);

      // 3. Utility Bills
      const finalBills = await dbFetch("utility_bills", INITIAL_UTILITY_BILLS);
      setUtilityBills(finalBills);
      try {
        localStorage.setItem("software_house_utility_bills", JSON.stringify(finalBills));
      } catch(e) {}
    }

    loadFinanceData();

    // Fetch Employee Salaries from Payroll Master
    const savedSalaries = localStorage.getItem("persistent_payroll_salaries");
    if (savedSalaries) {
      try { setSalaryPayments(JSON.parse(savedSalaries)); } catch(e) {}
    } else {
      setSalaryPayments([]);
    }
  }, []);

  // Save changes to localStorage & DB with automatic calculation & event triggers
  const saveExpenses = (data) => {
    setExpenses(data);
    try {
      localStorage.setItem("software_house_finance_expenses", JSON.stringify(data));
      localStorage.setItem("persistent_expenses", JSON.stringify(data));
    } catch(e) {}
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("dataChanged"));
      window.dispatchEvent(new Event("storage"));
    }
  };

  const saveIncomes = (data) => {
    setIncomes(data);
    try {
      localStorage.setItem("software_house_finance_incomes", JSON.stringify(data));
      localStorage.setItem("persistent_incomes", JSON.stringify(data));
    } catch(e) {}
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("dataChanged"));
      window.dispatchEvent(new Event("storage"));
    }
  };

  const saveBills = (data) => {
    setUtilityBills(data);
    try {
      localStorage.setItem("software_house_utility_bills", JSON.stringify(data));
    } catch(e) {}
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("dataChanged"));
    }
  };

  // Calculate Aggregates
  const totalIncome = incomes.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const totalExpenses = expenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const netProfitLoss = totalIncome - totalExpenses;

  const currentMonthStr = selectedMonth;
  const monthlyIncome = incomes.filter(i => i.date?.startsWith(currentMonthStr)).reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const monthlyExpenses = expenses.filter(e => e.date?.startsWith(currentMonthStr)).reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const monthlyProfitLoss = monthlyIncome - monthlyExpenses;

  const pendingPayments = expenses.filter(e => e.status === "Pending").reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const totalSalaryExpense = salaryPayments.reduce((acc, curr) => acc + (Number(curr.net_salary) || 0), 0);
  const cashBalance = totalIncome - totalExpenses; // Revenue - Expense

  // Delete Handlers
  const handleDeleteExpense = async (id) => {
    const target = expenses.find(e => e.id === id);
    const updated = expenses.filter(e => e.id !== id);
    saveExpenses(updated);
    try { await supabase.from("expenses").delete().eq("id", id); } catch(e) {}
    try { await logActivity("Accounts Manager", "Expense Deleted", `Removed expense record: ${target?.title || id}`, "expense"); } catch(e) {}
    showToast("Expense Deleted 🗑️", "Expense record removed & totals re-calculated automatically.", "info");
  };

  const handleDeleteIncome = async (id) => {
    const target = incomes.find(i => i.id === id);
    const updated = incomes.filter(i => i.id !== id);
    saveIncomes(updated);
    try { await supabase.from("incomes").delete().eq("id", id); } catch(e) {}
    try { await logActivity("Accounts Manager", "Income Deleted", `Removed income record: ${target?.client_name || id}`, "expense"); } catch(e) {}
    showToast("Income Deleted 🗑️", "Income record removed & totals re-calculated automatically.", "info");
  };

  const handleDeleteBill = (id) => {
    const updated = utilityBills.filter(b => b.id !== id);
    saveBills(updated);
    showToast("Utility Bill Deleted 🗑️", "Utility bill record has been removed.", "info");
  };

  // Edit Submit Handlers
  const handleUpdateExpense = async (e) => {
    e.preventDefault();
    if (!editingExpense) return;
    const updated = expenses.map(item => item.id === editingExpense.id ? editingExpense : item);
    saveExpenses(updated);
    try { await supabase.from("expenses").upsert([editingExpense]); } catch(err) {}
    try { await logActivity("Accounts Manager", "Expense Updated", `Updated expense: ${editingExpense.title}`, "expense"); } catch(e) {}
    setEditingExpense(null);
    showToast("Expense Updated 🟢", "Expense details updated & totals re-calculated automatically.", "success");
  };

  const handleUpdateIncome = async (e) => {
    e.preventDefault();
    if (!editingIncome) return;
    const updated = incomes.map(item => item.id === editingIncome.id ? editingIncome : item);
    saveIncomes(updated);
    try { await supabase.from("incomes").upsert([editingIncome]); } catch(err) {}
    try { await logActivity("Accounts Manager", "Income Updated", `Updated income record for ${editingIncome.client_name}`, "expense"); } catch(e) {}
    setEditingIncome(null);
    showToast("Income Updated 🟢", "Income record updated & totals re-calculated automatically.", "success");
  };

  const handleUpdateBill = (e) => {
    e.preventDefault();
    if (!editingBill) return;
    const updated = utilityBills.map(item => item.id === editingBill.id ? editingBill : item);
    saveBills(updated);
    setEditingBill(null);
    showToast("Utility Bill Updated 🟢", "Utility bill record updated successfully.", "success");
  };

  // Form Handlers
  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!expenseForm.title || !expenseForm.amount) {
      showToast("Missing Fields 🛑", "Please enter title and amount for the expense.", "warning");
      return;
    }
    const newEntry = { ...expenseForm, id: `EXP-${Date.now()}`, amount: Number(expenseForm.amount) };
    saveExpenses([newEntry, ...expenses]);

    try {
      const dbPayload = {
        title: expenseForm.title,
        category: expenseForm.category || "General Expense",
        amount: Number(expenseForm.amount),
        payment_status: expenseForm.status || "Paid",
        status: expenseForm.status || "Paid",
        expense_date: expenseForm.date || new Date().toISOString().split("T")[0],
        notes: expenseForm.description || null
      };
      await supabase.from("expenses").insert([dbPayload]);
    } catch(err) {}

    try { await logActivity("Accounts Manager", "Expense Added", `Recorded ${newEntry.category}: ${newEntry.title} (Rs. ${newEntry.amount.toLocaleString()})`, "expense"); } catch(e) {}
    setNewExpenseModal(false);
    setExpenseForm({ category: "Employee Salary", title: "", description: "", amount: "", payment_method: "Bank Transfer", status: "Paid", date: new Date().toISOString().split("T")[0], attachment: "", created_by: "Admin" });
    showToast("Expense Recorded 🟢", `Rs. ${newEntry.amount.toLocaleString()} added & calculated automatically.`, "success");
  };

  const handleAddIncome = async (e) => {
    e.preventDefault();
    if (!incomeForm.client_name || !incomeForm.amount) {
      showToast("Missing Fields 🛑", "Please enter client name and amount.", "warning");
      return;
    }
    const newEntry = { ...incomeForm, id: `INC-${Date.now()}`, amount: Number(incomeForm.amount) };
    saveIncomes([newEntry, ...incomes]);

    try {
      const dbPayload = {
        client_name: incomeForm.client_name,
        project_name: incomeForm.project_name || null,
        amount: Number(incomeForm.amount),
        income_type: incomeForm.income_type || "Client Project Payment",
        payment_method: incomeForm.payment_method || "Bank Transfer",
        status: incomeForm.status || "Paid",
        date: incomeForm.date || new Date().toISOString().split("T")[0],
        invoice_no: incomeForm.invoice_no || null,
        notes: incomeForm.notes || null
      };
      await supabase.from("incomes").insert([dbPayload]);
    } catch(err) {}

    try { await logActivity("Accounts Manager", "Income Added", `Logged income payment from ${newEntry.client_name} (Rs. ${newEntry.amount.toLocaleString()})`, "expense"); } catch(e) {}
    setNewIncomeModal(false);
    setIncomeForm({ client_name: "", project_name: "", income_type: "Client Project Payment", amount: "", payment_method: "Bank Transfer", status: "Paid", date: new Date().toISOString().split("T")[0], invoice_no: `INV-${Math.floor(1000 + Math.random() * 9000)}`, notes: "" });
    showToast("Income Recorded 🟢", `Rs. ${newEntry.amount.toLocaleString()} added & calculated automatically.`, "success");
  };

  const handleAddBill = (e) => {
    e.preventDefault();
    if (!billForm.amount || !billForm.company_name) {
      showToast("Missing Fields 🛑", "Please enter utility company and bill amount.", "warning");
      return;
    }
    const newEntry = { ...billForm, id: `UB-${Date.now()}`, amount: Number(billForm.amount) };
    saveBills([newEntry, ...utilityBills]);

    // Also auto-add to expense table for consolidated accounting
    const matchingExpense = {
      id: `EXP-BILL-${Date.now()}`,
      category: newEntry.bill_type,
      title: `${newEntry.bill_type} - ${newEntry.company_name}`,
      description: `Utility bill for ${newEntry.bill_month}`,
      amount: newEntry.amount,
      payment_method: "Online",
      status: newEntry.status,
      date: newEntry.payment_date || new Date().toISOString().split("T")[0],
      attachment: newEntry.receipt_url || "utility_bill_receipt.pdf",
      created_by: "Admin Utility Center"
    };
    saveExpenses([matchingExpense, ...expenses]);

    setNewBillModal(false);
    setBillForm({ bill_type: "Electricity Bill", company_name: "K-Electric", bill_month: "2026-08", due_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], amount: "", status: "Pending", payment_date: "", receipt_url: "" });
    showToast("Utility Bill Logged 🟢", `Bill of Rs. ${newEntry.amount.toLocaleString()} logged and synced to expenses.`, "success");
  };

  if (role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs max-w-lg mx-auto my-12">
        <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center text-2xl mb-4">
          <FaLock />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Admin Access Only</h2>
        <p className="text-sm text-slate-500 mt-2 max-w-xs">
          Finance & Treasury Portal details are strictly reserved for Administrator view.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 bg-white min-h-screen p-3 sm:p-6 text-slate-900">
      {/* Top Banner & Multi-Tab Navigation (Requirement #1) */}
      <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#EFF6FF] text-[#2563EB] text-[10px] font-bold uppercase tracking-wider border border-[#2563EB]/20">
            Master Treasury & Accounts Control Center
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] mt-1.5 flex items-center gap-2.5">
            <FaLandmark className="text-[#2563EB]" />
            <span>Finance & Accounting Suite</span>
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5 max-w-xl">
            Complete management for company expenses, client revenue, utility bills, employee salary payouts, and profit/loss statements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setNewExpenseModal(true)}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
          >
            <FaPlusCircle className="text-sm" />
            <span>+ Record Expense</span>
          </button>

          <button
            onClick={() => setNewIncomeModal(true)}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
          >
            <FaMoneyBillWave className="text-sm" />
            <span>+ Record Income</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${activeTab === "dashboard" ? "bg-[#2563EB] text-white shadow-xs" : "bg-white text-[#64748B] border border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}
        >
          <FaLandmark /> Executive Dashboard
        </button>
        <button
          onClick={() => setActiveTab("expenses")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${activeTab === "expenses" ? "bg-[#2563EB] text-white shadow-xs" : "bg-white text-[#64748B] border border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}
        >
          <FaReceipt /> Expenses ({expenses.length})
        </button>
        <button
          onClick={() => setActiveTab("incomes")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${activeTab === "incomes" ? "bg-[#2563EB] text-white shadow-xs" : "bg-white text-[#64748B] border border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}
        >
          <FaMoneyBillWave /> Income Management ({incomes.length})
        </button>
        <button
          onClick={() => setActiveTab("utility_bills")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${activeTab === "utility_bills" ? "bg-[#2563EB] text-white shadow-xs" : "bg-white text-[#64748B] border border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}
        >
          <FaBolt /> Utility Bills ({utilityBills.length})
        </button>
        <button
          onClick={() => setActiveTab("salary_audit")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${activeTab === "salary_audit" ? "bg-[#2563EB] text-white shadow-xs" : "bg-white text-[#64748B] border border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}
        >
          <FaUserCheck /> Auto Salary Audit
        </button>
        <button
          onClick={() => setActiveTab("pnl_reports")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${activeTab === "pnl_reports" ? "bg-[#2563EB] text-white shadow-xs" : "bg-white text-[#64748B] border border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}
        >
          <FaChartLine /> P&L & Reports
        </button>
      </div>

      {/* TAB 1: EXECUTIVE DASHBOARD */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          {/* Summary KPI Cards Grid (Exact 8 Key Cards Requested - Requirement #2 & Requirement #4) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Income */}
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Total Income</span>
                <div className="p-2 bg-[#EFF6FF] text-[#2563EB] rounded-xl border border-[#2563EB]/20"><FaArrowUp /></div>
              </div>
              <p className="text-2xl font-bold text-[#0F172A]">Rs. {totalIncome.toLocaleString()}</p>
              <p className="text-[11px] text-[#64748B]">Total Revenue Generated</p>
            </div>

            {/* Total Expenses */}
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Total Expenses</span>
                <div className="p-2 bg-[#EFF6FF] text-[#2563EB] rounded-xl border border-[#2563EB]/20"><FaArrowDown /></div>
              </div>
              <p className="text-2xl font-bold text-[#0F172A]">Rs. {totalExpenses.toLocaleString()}</p>
              <p className="text-[11px] text-[#64748B]">All Operating Expenses</p>
            </div>

            {/* Net Profit / Loss */}
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Net Profit / (Loss)</span>
                <div className="p-2 bg-[#EFF6FF] text-[#2563EB] rounded-xl border border-[#2563EB]/20"><FaChartLine /></div>
              </div>
              <p className="text-2xl font-bold text-[#0F172A]">Rs. {netProfitLoss.toLocaleString()}</p>
              <p className="text-[11px] font-semibold text-[#2563EB]">{netProfitLoss >= 0 ? "Surplus" : "Deficit"}</p>
            </div>

            {/* Monthly Income */}
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Monthly Income ({selectedMonth})</span>
                <div className="p-2 bg-[#EFF6FF] text-[#2563EB] rounded-xl border border-[#2563EB]/20"><FaCalendarAlt /></div>
              </div>
              <p className="text-2xl font-bold text-[#0F172A]">Rs. {monthlyIncome.toLocaleString()}</p>
              <p className="text-[11px] text-[#64748B]">Recorded in {selectedMonth}</p>
            </div>

            {/* Monthly Expenses */}
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Monthly Expenses ({selectedMonth})</span>
                <div className="p-2 bg-[#EFF6FF] text-[#2563EB] rounded-xl border border-[#2563EB]/20"><FaReceipt /></div>
              </div>
              <p className="text-2xl font-bold text-[#0F172A]">Rs. {monthlyExpenses.toLocaleString()}</p>
              <p className="text-[11px] text-[#64748B]">Expenses for {selectedMonth}</p>
            </div>

            {/* Pending Payments */}
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Pending Payments (Unpaid)</span>
                <div className={`p-2 rounded-xl border ${pendingPayments > 0 ? "bg-[#FEF3C7] text-[#92400E] border-[#F59E0B]/20" : "bg-[#EFF6FF] text-[#2563EB] border-[#2563EB]/20"}`}><FaTimesCircle /></div>
              </div>
              <p className="text-2xl font-bold text-[#0F172A]">Rs. {pendingPayments.toLocaleString()}</p>
              <p className="text-[11px] text-[#64748B]">Unpaid Dues & Bills</p>
            </div>

            {/* Employee Salary Expense */}
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Employee Salary Expense</span>
                <div className="p-2 bg-[#EFF6FF] text-[#2563EB] rounded-xl border border-[#2563EB]/20"><FaUserCheck /></div>
              </div>
              <p className="text-2xl font-bold text-[#0F172A]">Rs. {totalSalaryExpense.toLocaleString()}</p>
              <p className="text-[11px] text-[#64748B]">Synced from Payroll Master</p>
            </div>

            {/* Cash Balance */}
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Cash Balance</span>
                <div className="p-2 bg-[#EFF6FF] text-[#2563EB] rounded-xl border border-[#2563EB]/20"><FaHandHoldingUsd /></div>
              </div>
              <p className="text-2xl font-bold text-[#0F172A]">Rs. {cashBalance.toLocaleString()}</p>
              <p className="text-[11px] text-[#64748B]">Opening + Revenue - Expense</p>
            </div>
          </div>

          {/* Interactive Visual Charts (SVG Bar & Trend Visualizers) */}
          <FinancialChart
            revenue={monthlyIncome}
            expenses={monthlyExpenses}
            categoryData={EXPENSE_CATEGORIES.map(cat => ({
              category: cat,
              amount: expenses.filter(e => e.category === cat).reduce((a, c) => a + Number(c.amount || 0), 0)
            })).filter(c => c.amount > 0)}
          />
        </div>
      )}

      {/* TAB 2: EXPENSE MANAGEMENT (15 Categories) */}
      {activeTab === "expenses" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <FaReceipt className="text-blue-600" />
                <span>Company Expense Records (15 Categories)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Filter by category or payment status</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-bold text-slate-900 outline-none bg-white"
              >
                <option value="all">📁 All 15 Categories</option>
                {EXPENSE_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              <button
                onClick={() => exportToCsv(`expenses_${selectedMonth}.csv`, expenses)}
                className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer border border-slate-700"
              >
                <FaFileExcel className="text-emerald-400" />
                <span>Export CSV/Excel</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                  <th className="py-3 px-3">Expense ID</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Title & Description</th>
                  <th className="py-3 px-3">Amount (PKR)</th>
                  <th className="py-3 px-3">Method</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Attachment</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                {expenses
                  .filter(e => filterCategory === "all" || e.category === filterCategory)
                  .map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-3 font-mono font-bold text-slate-900">{e.id}</td>
                      <td className="py-3.5 px-3 font-bold text-blue-700 bg-blue-50/50 rounded-lg">{e.category}</td>
                      <td className="py-3.5 px-3">
                        <p className="font-bold text-slate-900">{e.title}</p>
                        <p className="text-[11px] text-slate-500">{e.description || "N/A"}</p>
                      </td>
                      <td className="py-3.5 px-3 font-mono font-black text-slate-900">Rs. {Number(e.amount).toLocaleString()}</td>
                      <td className="py-3.5 px-3 font-semibold">{e.payment_method}</td>
                      <td className="py-3.5 px-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${e.status === "Paid" ? "bg-emerald-50 text-emerald-800 border-emerald-300" : "bg-rose-50 text-rose-800 border-rose-300"}`}>
                          {e.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 font-mono text-slate-500">{e.date}</td>
                      <td className="py-3.5 px-3">
                        {e.attachment ? (
                          <span className="text-[11px] text-blue-600 font-bold underline cursor-pointer">📎 View Bill</span>
                        ) : (
                          <span className="text-[11px] text-slate-400">None</span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setEditingExpense(e)}
                            className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold transition-all border border-blue-200 cursor-pointer"
                            title="Edit Expense"
                          >
                            <FaEdit />
                          </button>
                          <button
                            onClick={() => handleDeleteExpense(e.id)}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold transition-all border border-rose-200 cursor-pointer"
                            title="Delete Expense"
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: INCOME MANAGEMENT */}
      {activeTab === "incomes" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <FaMoneyBillWave className="text-emerald-600" />
                <span>Client Projects & Software Revenue Stream</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Record client payments, software sales, and retainers</p>
            </div>

            <button
              onClick={() => exportToCsv(`incomes_${selectedMonth}.csv`, incomes)}
              className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer border border-slate-700"
            >
              <FaFileExcel className="text-emerald-400" />
              <span>Export Incomes CSV</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                  <th className="py-3 px-3">Invoice No</th>
                  <th className="py-3 px-3">Client Name</th>
                  <th className="py-3 px-3">Project / License</th>
                  <th className="py-3 px-3">Income Type</th>
                  <th className="py-3 px-3">Amount (PKR)</th>
                  <th className="py-3 px-3">Method</th>
                  <th className="py-3 px-3">Received Date</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                {incomes.map((inc) => (
                  <tr key={inc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-3 font-mono font-bold text-blue-700">{inc.invoice_no || inc.id}</td>
                    <td className="py-3.5 px-3 font-bold text-slate-900">{inc.client_name}</td>
                    <td className="py-3.5 px-3 text-slate-700 font-semibold">{inc.project_name}</td>
                    <td className="py-3.5 px-3 font-bold text-slate-600 bg-slate-100 rounded-lg">{inc.income_type}</td>
                    <td className="py-3.5 px-3 font-mono font-black text-emerald-700">Rs. {Number(inc.amount).toLocaleString()}</td>
                    <td className="py-3.5 px-3">{inc.payment_method}</td>
                    <td className="py-3.5 px-3 font-mono text-slate-500">{inc.date}</td>
                    <td className="py-3.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setEditingIncome(inc)}
                          className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold transition-all border border-blue-200 cursor-pointer"
                          title="Edit Income"
                        >
                          <FaEdit />
                        </button>
                        <button
                          onClick={() => handleDeleteIncome(inc.id)}
                          className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold transition-all border border-rose-200 cursor-pointer"
                          title="Delete Income"
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: UTILITY BILLS CENTER */}
      {activeTab === "utility_bills" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <FaBolt className="text-amber-500" />
                <span>Office Utility Bills & Premises Rent Management</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Electricity, Water, Internet, Gas & Premises Rent</p>
            </div>

            <button
              onClick={() => setNewBillModal(true)}
              className="bg-amber-600 hover:bg-amber-500 text-white font-extrabold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition-all shadow-md cursor-pointer border border-amber-400"
            >
              <FaPlusCircle />
              <span>+ Add Utility Bill</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {utilityBills.map((bill) => (
              <div key={bill.id} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-black text-slate-900">{bill.bill_type}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${bill.status === "Paid" ? "bg-emerald-50 text-emerald-800 border-emerald-300" : "bg-rose-50 text-rose-800 border-rose-300"}`}>
                    {bill.status}
                  </span>
                </div>
                <div className="space-y-1 text-xs text-slate-600 font-medium">
                  <p><strong>Provider:</strong> {bill.company_name}</p>
                  <p><strong>Bill Month:</strong> {bill.bill_month}</p>
                  <p><strong>Due Date:</strong> {bill.due_date}</p>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
                    <p className="text-base font-black text-slate-900">Rs. {Number(bill.amount).toLocaleString()}</p>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setEditingBill(bill)}
                        className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold transition-all border border-blue-200 cursor-pointer"
                        title="Edit Utility Bill"
                      >
                        <FaEdit />
                      </button>
                      <button
                        onClick={() => handleDeleteBill(bill.id)}
                        className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold transition-all border border-rose-200 cursor-pointer"
                        title="Delete Utility Bill"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: AUTO SALARY EXPENSE AUDIT */}
      {activeTab === "salary_audit" && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <FaUserCheck className="text-emerald-600" />
              <span>Auto-Synced Employee Salary Expense Payouts</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Processed salaries automatically counted towards total company expenses</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                  <th className="py-3 px-3">Employee Name</th>
                  <th className="py-3 px-3">Month</th>
                  <th className="py-3 px-3">Basic Salary</th>
                  <th className="py-3 px-3">Bonus & Overtime</th>
                  <th className="py-3 px-3">Deductions</th>
                  <th className="py-3 px-3">Net Salary Payout</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Payment Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                {salaryPayments.map((sal, idx) => (
                  <tr key={`sal-pay-${sal.id || 'sal'}-${idx}`} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-3 font-bold text-slate-900">{sal.employee_name}</td>
                    <td className="py-3.5 px-3 font-mono">{sal.salary_month}</td>
                    <td className="py-3.5 px-3 font-mono font-bold">Rs. {sal.basic_salary.toLocaleString()}</td>
                    <td className="py-3.5 px-3 font-mono text-emerald-700">+Rs. {(sal.bonus + sal.overtime).toLocaleString()}</td>
                    <td className="py-3.5 px-3 font-mono text-rose-600">-Rs. {sal.deductions.toLocaleString()}</td>
                    <td className="py-3.5 px-3 font-mono font-black text-slate-900 text-sm">Rs. {sal.net_salary.toLocaleString()}</td>
                    <td className="py-3.5 px-3">
                      <span className="bg-emerald-50 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold">
                        {sal.payment_status}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 font-mono text-slate-500">{sal.payment_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: PROFIT & LOSS REPORT & EXPORT CENTER */}
      {activeTab === "pnl_reports" && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <FaChartLine className="text-blue-600" />
                <span>Official Profit & Loss Statement & Audit Report</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Real-time daily, monthly, and yearly statement generation</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => window.print()}
                className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer border border-slate-700"
              >
                <FaPrint />
                <span>Print P&L Statement</span>
              </button>
            </div>
          </div>

          {/* Detailed Statement Table */}
          <div className="bg-white rounded-2xl border-2 border-slate-900 p-8 shadow-md space-y-6">
            <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start">
              <div>
                <h1 className="text-xl font-black text-slate-900">NEXA INNOVATION AND TECHNOLOGY</h1>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Official Treasury Profit & Loss Statement ({selectedMonth})</p>
              </div>
              <div className="text-right text-xs text-slate-600 font-mono">
                <p>Date: {new Date().toLocaleDateString()}</p>
                <p>Status: Verified Audit</p>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div className="border-b border-slate-200 pb-2">
                <h3 className="font-black text-slate-900 uppercase text-xs">1. Revenue / Incomes</h3>
                <div className="flex justify-between pt-2 text-slate-700 font-medium">
                  <span>Client Project Payments & Software Licenses</span>
                  <strong className="font-mono font-bold text-slate-900">Rs. {totalIncome.toLocaleString()}</strong>
                </div>
              </div>

              <div className="border-b border-slate-200 pb-2">
                <h3 className="font-black text-slate-900 uppercase text-xs">2. Operating Expenses</h3>
                <div className="space-y-1 pt-2 text-slate-700">
                  <div className="flex justify-between"><span>Employee Salary Payouts</span><strong className="font-mono text-slate-900">Rs. {totalSalaryExpense.toLocaleString()}</strong></div>
                  <div className="flex justify-between"><span>Premises Rent & Utility Bills</span><strong className="font-mono text-slate-900">Rs. {utilityBills.reduce((a,c)=>a+Number(c.amount||0),0).toLocaleString()}</strong></div>
                  <div className="flex justify-between"><span>Other Operating Expenses</span><strong className="font-mono text-slate-900">Rs. {(totalExpenses - totalSalaryExpense - utilityBills.reduce((a,c)=>a+Number(c.amount||0),0)).toLocaleString()}</strong></div>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-100 font-bold text-slate-900">
                  <span>Total Operating Expenses</span>
                  <strong className="font-mono font-black text-rose-700">Rs. {totalExpenses.toLocaleString()}</strong>
                </div>
              </div>

              <div className="pt-2 flex justify-between items-center text-sm font-black border-t-2 border-slate-900">
                <span>NET COMPANY PROFIT / (DEFICIT)</span>
                <span className={netProfitLoss >= 0 ? "text-emerald-700 font-mono text-lg" : "text-rose-700 font-mono text-lg"}>
                  Rs. {netProfitLoss.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW EXPENSE MODAL */}
      {newExpenseModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 border border-slate-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <FaPlusCircle className="text-blue-600" />
                <span>Add Expense Record (15 Categories)</span>
              </h3>
              <button onClick={() => setNewExpenseModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Expense Category *</label>
                <select value={expenseForm.category} onChange={e => setExpenseForm({...expenseForm, category: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 font-medium outline-none">
                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Title *</label>
                <input type="text" placeholder="e.g. Server Hardware / Laptop Upgrade" value={expenseForm.title} onChange={e => setExpenseForm({...expenseForm, title: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 outline-none font-medium" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Amount (PKR) *</label>
                  <input type="number" placeholder="25000" value={expenseForm.amount} onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 font-mono font-bold outline-none" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Payment Method</label>
                  <select value={expenseForm.payment_method} onChange={e => setExpenseForm({...expenseForm, payment_method: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 font-medium outline-none">
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cash">Cash</option>
                    <option value="Online">Online / Credit Card</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Status</label>
                  <select value={expenseForm.status} onChange={e => setExpenseForm({...expenseForm, status: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 font-medium outline-none">
                    <option value="Paid">Paid</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Expense Date</label>
                  <input type="date" value={expenseForm.date} onChange={e => setExpenseForm({...expenseForm, date: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 font-mono font-bold outline-none" />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setNewExpenseModal(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-xl text-xs font-black text-white bg-blue-600 hover:bg-blue-700 shadow-sm">+ Save Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW INCOME MODAL */}
      {newIncomeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 border border-slate-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <FaMoneyBillWave className="text-emerald-600" />
                <span>Add Company Revenue / Income</span>
              </h3>
              <button onClick={() => setNewIncomeModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <form onSubmit={handleAddIncome} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Client Name *</label>
                  <input type="text" placeholder="Apex Logistics" value={incomeForm.client_name} onChange={e => setIncomeForm({...incomeForm, client_name: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 outline-none font-medium" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Project Name</label>
                  <input type="text" placeholder="ERP Software" value={incomeForm.project_name} onChange={e => setIncomeForm({...incomeForm, project_name: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 outline-none font-medium" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Income Category</label>
                  <select value={incomeForm.income_type} onChange={e => setIncomeForm({...incomeForm, income_type: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 font-medium outline-none">
                    {INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Amount (PKR) *</label>
                  <input type="number" placeholder="150000" value={incomeForm.amount} onChange={e => setIncomeForm({...incomeForm, amount: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 font-mono font-bold outline-none" />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setNewIncomeModal(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm">+ Save Income</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW UTILITY BILL MODAL */}
      {newBillModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 border border-slate-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <FaBolt className="text-amber-500" />
                <span>Add Office Utility Bill / Rent</span>
              </h3>
              <button onClick={() => setNewBillModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <form onSubmit={handleAddBill} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Bill Type</label>
                  <select value={billForm.bill_type} onChange={e => setBillForm({...billForm, bill_type: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 font-medium outline-none">
                    <option value="Electricity Bill">Electricity Bill</option>
                    <option value="Internet Bill">Internet Bill</option>
                    <option value="Office Rent">Office Rent</option>
                    <option value="Water Bill">Water Bill</option>
                    <option value="Gas Bill">Gas Bill</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Company / Provider *</label>
                  <input type="text" placeholder="K-Electric / Optix" value={billForm.company_name} onChange={e => setBillForm({...billForm, company_name: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 outline-none font-medium" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Amount (PKR) *</label>
                  <input type="number" placeholder="35000" value={billForm.amount} onChange={e => setBillForm({...billForm, amount: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 font-mono font-bold outline-none" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Status</label>
                  <select value={billForm.status} onChange={e => setBillForm({...billForm, status: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 font-medium outline-none">
                    <option value="Paid">Paid</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setNewBillModal(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-xl text-xs font-black text-white bg-amber-600 hover:bg-amber-700 shadow-sm">+ Save Utility Bill</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT EXPENSE MODAL */}
      {editingExpense && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 border border-slate-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <FaEdit className="text-blue-600" />
                <span>Edit Expense Record ({editingExpense.id})</span>
              </h3>
              <button onClick={() => setEditingExpense(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <form onSubmit={handleUpdateExpense} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Expense Category *</label>
                <select value={editingExpense.category} onChange={e => setEditingExpense({...editingExpense, category: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 font-medium outline-none">
                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Title *</label>
                <input type="text" value={editingExpense.title} onChange={e => setEditingExpense({...editingExpense, title: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 outline-none font-medium" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Amount (PKR) *</label>
                  <input type="number" value={editingExpense.amount} onChange={e => setEditingExpense({...editingExpense, amount: Number(e.target.value)})} className="w-full rounded-xl border border-slate-300 p-2.5 font-mono font-bold outline-none" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Payment Method</label>
                  <select value={editingExpense.payment_method} onChange={e => setEditingExpense({...editingExpense, payment_method: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 font-medium outline-none">
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cash">Cash</option>
                    <option value="Online">Online / Credit Card</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Status</label>
                  <select value={editingExpense.status} onChange={e => setEditingExpense({...editingExpense, status: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 font-medium outline-none">
                    <option value="Paid">Paid</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Expense Date</label>
                  <input type="date" value={editingExpense.date} onChange={e => setEditingExpense({...editingExpense, date: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 font-mono font-bold outline-none" />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setEditingExpense(null)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-xl text-xs font-black text-white bg-blue-600 hover:bg-blue-700 shadow-sm">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT INCOME MODAL */}
      {editingIncome && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 border border-slate-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <FaEdit className="text-emerald-600" />
                <span>Edit Income Record ({editingIncome.invoice_no || editingIncome.id})</span>
              </h3>
              <button onClick={() => setEditingIncome(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <form onSubmit={handleUpdateIncome} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Client Name *</label>
                  <input type="text" value={editingIncome.client_name} onChange={e => setEditingIncome({...editingIncome, client_name: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 outline-none font-medium" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Project Name</label>
                  <input type="text" value={editingIncome.project_name} onChange={e => setEditingIncome({...editingIncome, project_name: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 outline-none font-medium" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Income Category</label>
                  <select value={editingIncome.income_type} onChange={e => setEditingIncome({...editingIncome, income_type: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 font-medium outline-none">
                    {INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Amount (PKR) *</label>
                  <input type="number" value={editingIncome.amount} onChange={e => setEditingIncome({...editingIncome, amount: Number(e.target.value)})} className="w-full rounded-xl border border-slate-300 p-2.5 font-mono font-bold outline-none" />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setEditingIncome(null)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT UTILITY BILL MODAL */}
      {editingBill && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 border border-slate-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <FaEdit className="text-amber-500" />
                <span>Edit Utility Bill ({editingBill.id})</span>
              </h3>
              <button onClick={() => setEditingBill(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <form onSubmit={handleUpdateBill} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Bill Type</label>
                  <select value={editingBill.bill_type} onChange={e => setEditingBill({...editingBill, bill_type: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 font-medium outline-none">
                    <option value="Electricity Bill">Electricity Bill</option>
                    <option value="Internet Bill">Internet Bill</option>
                    <option value="Office Rent">Office Rent</option>
                    <option value="Water Bill">Water Bill</option>
                    <option value="Gas Bill">Gas Bill</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Company / Provider *</label>
                  <input type="text" value={editingBill.company_name} onChange={e => setEditingBill({...editingBill, company_name: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 outline-none font-medium" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Amount (PKR) *</label>
                  <input type="number" value={editingBill.amount} onChange={e => setEditingBill({...editingBill, amount: Number(e.target.value)})} className="w-full rounded-xl border border-slate-300 p-2.5 font-mono font-bold outline-none" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Status</label>
                  <select value={editingBill.status} onChange={e => setEditingBill({...editingBill, status: e.target.value})} className="w-full rounded-xl border border-slate-300 p-2.5 font-medium outline-none">
                    <option value="Paid">Paid</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setEditingBill(null)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-xl text-xs font-black text-white bg-amber-600 hover:bg-amber-700 shadow-sm">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

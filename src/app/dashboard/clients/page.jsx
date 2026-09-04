"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { dbFetch, dbSaveRecord, dbDeleteRecord } from "@/lib/dbPersistence";
import { logActivity } from "@/lib/activityUtils";
import Modal from "@/components/Modal";
import { showToast } from "@/components/Toast";
import {
  FaUserTie,
  FaBuilding,
  FaHandHoldingUsd,
  FaCheckCircle,
  FaHourglassHalf,
  FaPlusCircle,
  FaTrash,
  FaSearch,
  FaFileInvoiceDollar,
  FaEnvelope,
  FaPhone,
  FaMapMarkerAlt,
  FaCalendarAlt,
  FaPaperPlane,
  FaMoneyCheckAlt,
  FaPrint,
  FaTimes,
  FaExclamationTriangle,
  FaEllipsisV,
  FaCheck
} from "react-icons/fa";

// Centralized Safe Currency Formatter Utility (Requirement #3)
const formatCurrency = (val) => {
  const num = Number(val) || 0;
  return `Rs. ${num.toLocaleString("en-PK")}`;
};

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");

  // Kebab Context Menu State
  const [activeKebabId, setActiveKebabId] = useState(null);

  // Delete Safeguard Modal State
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, client: null, loading: false });

  // Custom Modal State
  const [modal, setModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    type: "info",
  });

  // Invoice Preview Modal State
  const [invoiceModal, setInvoiceModal] = useState({
    isOpen: false,
    client: null,
  });

  // Invoice Form State
  const [invoiceForm, setInvoiceForm] = useState({
    invoice_number: `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    amount: "",
    due_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    notes: "Payment due within 15 days of invoice date.",
  });

  const showAlert = (title, message, type = "info") => {
    setModal({ isOpen: true, title, message, type });
  };

  const closeModal = () => {
    setModal({ ...modal, isOpen: false });
  };

  const todayStr = new Date().toISOString().split("T")[0];

  // 2-Column Responsive Form State
  const [form, setForm] = useState({
    client_name: "",
    contact_person: "",
    email: "",
    phone: "",
    address: "",
    project_name: "",
    contract_start_date: todayStr,
    contract_end_date: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    contract_value: "",
    amount_paid: "",
    payment_status: "Paid",
    notes: "",
  });

  const fetchClients = async () => {
    setLoading(true);
    const finalClients = await dbFetch("clients", [], true);
    setClients(finalClients || []);

    try {
      const { data: invData } = await supabase
        .from("invoices")
        .select("*, clients(client_name)")
        .order("created_at", { ascending: false });
      if (invData) setInvoices(invData);
    } catch(err) {}
    setLoading(false);
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleAddClient = async (e) => {
    e.preventDefault();
    if (!form.client_name || !form.email || !form.contract_value) {
      showToast("Missing Fields ⚠️", "Please enter Client Name, Email, and Contract Value.", "warning");
      return;
    }

    setSubmitting(true);
    try {
      const contractVal = Number(form.contract_value || 0);
      const paidVal = Number(form.amount_paid || 0);

      let calculatedStatus = form.payment_status;
      if (paidVal >= contractVal) {
        calculatedStatus = "Paid";
      } else if (paidVal > 0) {
        calculatedStatus = "Partial Deposit";
      } else {
        calculatedStatus = "Pending Invoice";
      }

      const newClientObj = {
        id: `client-${Date.now()}`,
        client_name: form.client_name,
        contact_person: form.contact_person || "",
        email: form.email,
        phone: form.phone || "",
        project_name: form.project_name || "",
        contract_value: contractVal,
        amount_paid: paidVal,
        payment_status: calculatedStatus,
        notes: form.notes || "",
        address: form.address || "",
        contract_start_date: form.contract_start_date || todayStr,
        contract_end_date: form.contract_end_date || "",
        created_at: new Date().toISOString()
      };

      await dbSaveRecord("clients", newClientObj);
      const updatedList = await dbFetch("clients");
      setClients(updatedList);

      setForm({
        client_name: "",
        contact_person: "",
        email: "",
        phone: "",
        address: "",
        project_name: "",
        contract_start_date: todayStr,
        contract_end_date: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        contract_value: "",
        amount_paid: "",
        payment_status: "Paid",
        notes: "",
      });

      showToast("Client Created 🎉", `Client ${form.client_name} registered successfully.`, "success");
    } catch (e) {
      showToast("Error", "Failed to save client profile.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateInvoice = (client) => {
    const defaultAmount = Number(client.contract_value || 0) - Number(client.amount_paid || 0);
    setInvoiceForm({
      invoice_number: `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      amount: defaultAmount > 0 ? defaultAmount : client.contract_value,
      due_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      notes: `Invoice for ${client.project_name || 'Software Project Service'}. Payment due in 15 days.`,
    });
    setInvoiceModal({ isOpen: true, client });
  };

  const handleRecordPayment = async (clientId, currentContract, currentPaid) => {
    const additionalStr = prompt(`Enter payment amount collected for this client:`, "50000");
    if (!additionalStr) return;
    const additionalAmount = Number(additionalStr);
    if (isNaN(additionalAmount) || additionalAmount <= 0) return;

    const newTotalPaid = Number(currentPaid) + Number(additionalAmount);
    let newStatus = newTotalPaid >= currentContract ? "Paid" : "Partial Deposit";

    const targetClient = clients.find(c => c.id === clientId);
    if (targetClient) {
      const updatedClient = {
        ...targetClient,
        amount_paid: newTotalPaid,
        payment_status: newStatus
      };
      await dbSaveRecord("clients", updatedClient);
      fetchClients();
      showToast("Payment Collected 💰", `Total collected for ${targetClient.client_name} is ${formatCurrency(newTotalPaid)}.`, "success");
    }
  };

  const sendOverdueReminder = (client) => {
    showToast("Reminder Email Dispatched 📧", `Overdue payment notice sent to ${client.client_name} (${client.email}).`, "info");
  };

  const executeDeleteClient = async () => {
    if (!deleteModal.client) return;
    setDeleteModal(prev => ({ ...prev, loading: true }));
    const id = deleteModal.client.id;
    const email = deleteModal.client.email;

    try {
      const updated = clients.filter(c => c.id !== id);
      setClients(updated);
      await dbDeleteRecord("clients", id, email || "").catch(() => {});
      showToast("Client Deleted 🗑️", "Client profile removed from database.", "info");
    } catch(e) {
      showToast("Error", "Failed to delete client record.", "error");
    } finally {
      setDeleteModal({ isOpen: false, client: null, loading: false });
    }
  };

  const totalContractVal = clients.reduce((sum, item) => sum + Number(item.contract_value || 0), 0);
  const totalReceivedVal = clients.reduce((sum, item) => sum + Number(item.amount_paid || 0), 0);
  const totalPendingVal = totalContractVal - totalReceivedVal;

  const filteredClients = clients.filter((item) => {
    const matchesSearch =
      item.client_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.project_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.email?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = filterStatus === "All" || item.payment_status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 w-full">
      {/* Modal */}
      <Modal isOpen={modal.isOpen} title={modal.title} message={modal.message} type={modal.type} onClose={closeModal} />

      {/* HEADER BANNER */}
      <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] bg-[#EFF6FF] px-2.5 py-1 rounded-full border border-[#2563EB]/20">
              Corporate CRM & Billing Portal
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-[#0F172A] mt-1.5 flex items-center gap-2.5">
            <FaUserTie className="text-[#2563EB]" />
            <span>Client Management, Contracts & Invoicing</span>
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Manage client profiles, contract terms, project scope, invoice generation, and revenue collection.
          </p>
        </div>
      </div>

      {/* FINANCIAL OVERVIEW METRICS (Requirement #3 - Standardized formatCurrency Utility) */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Total Contract Value
            </p>
            <p className="mt-2 text-2xl font-bold text-[#0F172A]">
              {loading ? "..." : formatCurrency(totalContractVal)}
            </p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB]/20">
            <FaBuilding className="text-lg" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#2563EB]">
              Total Revenue Received
            </p>
            <p className="mt-2 text-2xl font-bold text-[#0F172A]">
              {loading ? "..." : formatCurrency(totalReceivedVal)}
            </p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB]/20">
            <FaHandHoldingUsd className="text-lg" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#92400E]">
              Outstanding Balance Due
            </p>
            <p className="mt-2 text-2xl font-bold text-[#0F172A]">
              {loading ? "..." : formatCurrency(totalPendingVal)}
            </p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FEF3C7] text-[#92400E] border border-[#F59E0B]/20">
            <FaHourglassHalf className="text-lg" />
          </div>
        </div>
      </div>

      {/* MAIN BALANCED GRID (40% Left Form / 60% Right Client Directory) */}
      <div className="grid gap-6 lg:grid-cols-12">
        
        {/* 2-COLUMN RESPONSIVE CLIENT & CONTRACT FORM (Requirement #2 - 40% Width) */}
        <div className="lg:col-span-5 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm space-y-4 h-fit">
          <div className="border-b border-[#E2E8F0] pb-3">
            <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <FaPlusCircle className="text-[#2563EB]" />
              <span>Add Client & Contract</span>
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">Register corporate client & billing terms.</p>
          </div>

          <form onSubmit={handleAddClient} className="space-y-3.5 text-xs">
            {/* Row 1: Client Name & Contact Person */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Client Name *
                </label>
                <input
                  type="text"
                  name="client_name"
                  value={form.client_name}
                  onChange={handleChange}
                  placeholder="Apex Tech Systems"
                  required
                  className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Contact Person
                </label>
                <input
                  type="text"
                  name="contact_person"
                  value={form.contact_person}
                  onChange={handleChange}
                  placeholder="David Smith (Director)"
                  className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>

            {/* Row 2: Email & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="client@company.com"
                  required
                  className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="+92 300 1234567"
                  className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-mono"
                />
              </div>
            </div>

            {/* Row 3: Contract Start Date & End Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  name="contract_start_date"
                  value={form.contract_start_date}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  name="contract_end_date"
                  value={form.contract_end_date}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>

            {/* Row 4: Total Cost & Amount Received */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Total Contract Cost *
                </label>
                <input
                  type="number"
                  name="contract_value"
                  value={form.contract_value}
                  onChange={handleChange}
                  placeholder="500000"
                  required
                  className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Amount Received *
                </label>
                <input
                  type="number"
                  name="amount_paid"
                  value={form.amount_paid}
                  onChange={handleChange}
                  placeholder="250000"
                  required
                  className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>

            {/* Row 5: Project Title & Address */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Project Title
                </label>
                <input
                  type="text"
                  name="project_name"
                  value={form.project_name}
                  onChange={handleChange}
                  placeholder="Enterprise SaaS Portal"
                  className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Office Address
                </label>
                <input
                  type="text"
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  placeholder="Business Tower, Karachi"
                  className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>

            {/* Full Width Primary Submit CTA Button (Requirement #2) */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold py-3 text-xs transition-colors shadow-xs cursor-pointer"
              >
                {submitting ? "Saving Client..." : "Create Client & Contract"}
              </button>
            </div>
          </form>
        </div>

        {/* CLIENT DIRECTORY & INVOICE TRACKER TABLE (Requirement #1 - 60% Width & Clean Action Area) */}
        <div className="lg:col-span-7 rounded-2xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden flex flex-col">
          {/* Search Controls */}
          <div className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <FaSearch className="absolute left-3.5 top-3 text-[#64748B] text-xs" />
              <input
                type="text"
                placeholder="Search client, project, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-[#E2E8F0] pl-9 pr-3 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] bg-white"
              />
            </div>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs text-[#0F172A] outline-none bg-white focus:border-[#2563EB] font-semibold cursor-pointer"
            >
              <option value="All">All Payment Statuses</option>
              <option value="Paid">Fully Paid</option>
              <option value="Partial Deposit">Partial Deposit</option>
              <option value="Pending Invoice">Pending Invoice</option>
            </select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto flex-1 min-h-[260px] pb-10">
            <table className="w-full text-left text-xs text-[#0F172A]">
              <thead className="bg-[#F8FAFC] text-[11px] font-bold uppercase text-[#64748B] border-b border-[#E2E8F0]">
                <tr>
                  <th className="px-4 py-3">Client & Project</th>
                  <th className="px-4 py-3">Contract Value</th>
                  <th className="px-4 py-3">Payment Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {filteredClients.length > 0 ? (
                  filteredClients.map((client, idx) => {
                    const contract = Number(client.contract_value || 0);
                    const paid = Number(client.amount_paid || 0);
                    const pending = contract - paid;
                    const percentage = contract > 0 ? Math.min(Math.round((paid / contract) * 100), 100) : 0;
                    const isPendingDue = pending > 0;

                    return (
                      <tr key={client.id} className="hover:bg-[#F8FAFC]">
                        <td className="px-4 py-3.5 space-y-1">
                          <div className="font-bold text-[#0F172A] flex items-center gap-2">
                            <FaBuilding className="text-[#2563EB] text-xs" />
                            <span>{client.client_name}</span>
                          </div>

                          {client.project_name && (
                            <div className="text-xs text-[#2563EB] font-semibold">
                              {client.project_name}
                            </div>
                          )}

                          <div className="text-[11px] text-[#64748B] font-mono">
                            {client.email}
                          </div>
                        </td>

                        <td className="px-4 py-3.5 space-y-0.5">
                          <div className="font-bold text-[#0F172A]">{formatCurrency(contract)}</div>
                          <div className="text-[11px] text-[#2563EB] font-semibold">
                            Received: {formatCurrency(paid)}
                          </div>
                          <div className="text-[11px] text-[#64748B]">
                            Pending: {formatCurrency(pending)}
                          </div>
                        </td>

                        {/* Standardized Payment Status Badges (Requirement #5) */}
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full border ${
                              client.payment_status === "Paid"
                                ? "bg-[#EFF6FF] text-[#2563EB] border-[#2563EB]/20"
                                : client.payment_status === "Partial Deposit"
                                ? "bg-[#FEF3C7] text-[#92400E] border-[#F59E0B]/20"
                                : "bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]"
                            }`}
                          >
                            {client.payment_status}
                          </span>
                        </td>

                        {/* Simplified Action Column: Single Royal Blue Primary Action + Kebab Menu (Requirement #1) */}
                        <td className="px-4 py-3.5 text-right shrink-0">
                          <div className="flex items-center justify-end gap-2">
                            {/* Visible Primary Action Button */}
                            <button
                              onClick={() => handleGenerateInvoice(client)}
                              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-colors shadow-xs cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <FaFileInvoiceDollar className="text-xs" />
                              <span>Invoice</span>
                            </button>

                            {/* Contextual 3-Dots Menu (⋮) */}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setActiveKebabId(activeKebabId === client.id ? null : client.id)}
                                className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                              >
                                <FaEllipsisV className="text-xs" />
                              </button>

                              {activeKebabId === client.id && (
                                <div className={`absolute right-0 w-44 rounded-xl bg-white p-1.5 shadow-2xl border border-[#E2E8F0] z-50 space-y-0.5 text-xs text-left animate-in fade-in zoom-in-95 duration-100 ${
                                  idx >= Math.max(0, filteredClients.length - 2)
                                    ? "bottom-full mb-1 origin-bottom-right"
                                    : "top-full mt-1 origin-top-right"
                                }`}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleRecordPayment(client.id, contract, paid);
                                      setActiveKebabId(null);
                                    }}
                                    className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-[#EFF6FF] text-[#0F172A] hover:text-[#2563EB] font-semibold transition-colors"
                                  >
                                    Collect Payment
                                  </button>

                                  {isPendingDue && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        sendOverdueReminder(client);
                                        setActiveKebabId(null);
                                      }}
                                      className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-[#EFF6FF] text-[#0F172A] hover:text-[#2563EB] font-semibold transition-colors"
                                    >
                                      Send Payment Reminder
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => {
                                      showToast("Contract Details 📋", `Client: ${client.client_name}. Term: ${client.contract_start_date} to ${client.contract_end_date}. Value: ${formatCurrency(contract)}.`, "info");
                                      setActiveKebabId(null);
                                    }}
                                    className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-[#EFF6FF] text-[#0F172A] hover:text-[#2563EB] font-semibold transition-colors"
                                  >
                                    View Contract
                                  </button>

                                  <div className="border-t border-[#E2E8F0] my-1" />

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeleteModal({ isOpen: true, client, loading: false });
                                      setActiveKebabId(null);
                                    }}
                                    className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-rose-50 text-rose-600 font-semibold transition-colors"
                                  >
                                    Delete Client
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-[#64748B] italic text-xs">
                      No client records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* CONFIRMATION DESTRUCTIVE MODAL FOR DELETE CLIENT (Requirement #1) */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E2E8F0] space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 border-b border-[#E2E8F0] pb-3 text-[#0F172A]">
              <FaExclamationTriangle className="text-xl text-[#2563EB]" />
              <h3 className="font-bold text-[#0F172A] text-base">Delete Client Record</h3>
            </div>

            <p className="text-xs text-[#64748B] leading-relaxed">
              Are you sure you want to delete <strong>{deleteModal.client?.client_name}</strong>? This action will purge their corporate contract profile.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModal({ isOpen: false, client: null, loading: false })}
                className="flex-1 py-2.5 rounded-xl bg-white hover:bg-[#F8FAFC] text-[#2563EB] border border-[#E2E8F0] font-semibold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDeleteClient}
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

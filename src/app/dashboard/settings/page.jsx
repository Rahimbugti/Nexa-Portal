"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Modal from "@/components/Modal";
import { showToast } from "@/components/Toast";
import { getCompanyInfo, updateCompanyInfo } from "@/lib/companyUtils";
import {
  FaBuilding,
  FaCoins,
  FaMapMarkerAlt,
  FaPhoneAlt,
  FaEnvelope,
  FaGlobe,
  FaFileContract,
  FaSave,
  FaImage,
  FaWifi,
  FaHistory,
  FaShieldAlt,
  FaCheckCircle,
  FaKey,
  FaLock,
  FaTrash
} from "react-icons/fa";

export default function SettingsPage() {
  const [role, setRole] = useState("admin");
  const [userEmail, setUserEmail] = useState("");
  const [officeIp, setOfficeIp] = useState("39.46.118.183");

  const [companyForm, setCompanyForm] = useState({
    company_name: "",
    company_logo: "",
    currency_symbol: "Rs.",
    company_address: "",
    contact_number: "",
    email_address: "",
    website_url: "",
    tax_registration_no: "",
  });

  // Change Password State
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: ""
  });

  const [auditInfo, setAuditInfo] = useState({
    updated_at: "",
    updated_by: ""
  });

  // Image Fallback Error State
  const [imageError, setImageError] = useState(false);

  // Modal Notification State
  const [modal, setModal] = useState({ isOpen: false, title: "", message: "", type: "info" });

  const showAlert = (title, message, type = "info") => {
    setModal({ isOpen: true, title, message, type });
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    const { currentPassword, newPassword, confirmNewPassword } = passwordForm;

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      showToast("Missing Fields ⚠️", "Please fill in all password fields.", "warning");
      return;
    }

    const emailKey = (userEmail || "admin@gmail.com").toLowerCase().trim();
    const savedPassKey = `user_password_${emailKey}`;
    const storedPassword = localStorage.getItem(savedPassKey) || "admin123";

    // Admin can change password without current password verification
    const userRole = localStorage.getItem("user_role") || "admin";
    const isAdmin = userRole === "admin" || userRole === "hr" || userRole === "manager";

    if (!isAdmin && currentPassword !== storedPassword) {
      showToast("Incorrect Password 🛑", "Current password does not match.", "error");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      showToast("Password Mismatch ⚠️", "New passwords do not match.", "warning");
      return;
    }

    // Admin can set any password without strict requirements
    if (!isAdmin) {
      const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
      if (!strongPasswordRegex.test(newPassword)) {
        showToast(
          "Weak Password Policy 🛑",
          "Must be 8+ chars with uppercase, lowercase, number, & special char.",
          "warning"
        );
        return;
      }
    }

    localStorage.setItem(savedPassKey, newPassword);

    try {
      await supabase.from("user_profiles").upsert({
        email: emailKey,
        password_hash: newPassword,
        updated_at: new Date().toISOString()
      });
    } catch (e) {}

    setPasswordForm({ currentPassword: "", newPassword: "", confirmNewPassword: "" });
    showToast("Password Updated 🔑", "Password updated successfully.", "success");
  };

  useEffect(() => {
    const storedRole = localStorage.getItem("user_role") || "admin";
    const storedEmail = localStorage.getItem("current_user_email") || "";
    setRole(storedRole);
    setUserEmail(storedEmail);

    const companyData = getCompanyInfo();
    setCompanyForm({
      company_name: companyData.company_name || "",
      company_logo: companyData.company_logo || "",
      currency_symbol: companyData.currency_symbol || "Rs.",
      company_address: companyData.company_address || "",
      contact_number: companyData.contact_number || "",
      email_address: companyData.email_address || "",
      website_url: companyData.website_url || "",
      tax_registration_no: companyData.tax_registration_no || "",
    });

    setAuditInfo({
      updated_at: companyData.updated_at ? new Date(companyData.updated_at).toLocaleString() : "Never",
      updated_by: companyData.updated_by || "System Initializer"
    });
  }, []);

  const handleUseCurrentIp = async () => {
    try {
      const res = await fetch("https://api.ipify.org?format=json");
      const json = await res.json();
      if (json.ip) {
        setOfficeIp(json.ip);
        const updatedNet = [{
          id: "net-101",
          office_name: "Software House Main Office Wi-Fi",
          wifi_name: "Campus High-Speed Office Wi-Fi",
          authorized_ipv4: "192.168.100.144",
          subnet_mask: "255.255.255.0",
          default_gateway: "192.168.100.1",
          public_ip_address: json.ip,
          status: "Active",
          created_at: new Date().toISOString().split("T")[0],
          updated_at: new Date().toISOString().split("T")[0],
        }];
        localStorage.setItem("software_house_office_networks", JSON.stringify(updatedNet));
        showToast("IP Updated 📡", `Office Public IP (${json.ip}) saved.`, "success");
      }
    } catch (e) {
      showToast("Error ❌", "Failed to detect public IP address.", "error");
    }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCompanyForm(prev => ({ ...prev, company_logo: reader.result }));
        setImageError(false);
        showToast("Logo Uploaded 🖼️", "Company logo preview updated.", "info");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    setCompanyForm(prev => ({ ...prev, company_logo: "" }));
    setImageError(false);
    showToast("Logo Removed 🗑️", "Company logo cleared.", "info");
  };

  const handleSaveCompanyInfo = async (e) => {
    e.preventDefault();

    if (role !== "admin" && role !== "super_admin" && role !== "manager") {
      showToast("Access Denied 🛑", "Only Authorized Admins can update settings.", "error");
      return;
    }

    if (!companyForm.company_name.trim() || !companyForm.company_address.trim() || !companyForm.contact_number.trim() || !companyForm.email_address.trim()) {
      showToast("Missing Fields ⚠️", "Please fill in all required company details.", "warning");
      return;
    }

    const updated = await updateCompanyInfo(companyForm, userEmail);

    setAuditInfo({
      updated_at: new Date(updated.updated_at).toLocaleString(),
      updated_by: updated.updated_by
    });

    showToast("Branding Updated 🏢", "Company branding saved & synced system-wide.", "success");
  };

  return (
    <div className="space-y-6 w-full text-[#0F172A]">
      <Modal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onClose={() => setModal({ ...modal, isOpen: false })}
      />

      {/* 1. STANDARDIZED BLUE & WHITE HEADER BANNER (Requirement #1) */}
      <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB] bg-[#EFF6FF] px-2.5 py-1 rounded-full border border-[#2563EB]/20">
              Admin Governance & Portal Settings
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-[#0F172A] mt-1.5 flex items-center gap-2.5">
            <FaBuilding className="text-[#2563EB]" />
            <span>Company Branding & System Settings</span>
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Manage Organization Details • Logo Upload • Currency Symbol • Office IP Restrictions
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Company Info Form */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-sm space-y-6">
          <div className="border-b border-[#E2E8F0] pb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <FaBuilding className="text-[#2563EB]" />
              <span>Company Information & Branding Settings</span>
            </h2>
            <span className="text-xs text-[#64748B] font-semibold">Strict Admin Control</span>
          </div>

          <form onSubmit={handleSaveCompanyInfo} className="space-y-4 text-xs">
            {/* Logo Upload Section with Image Fallback (Requirement #5) */}
            <div className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-3">
              <label className="block text-xs font-bold uppercase text-[#0F172A]">
                Company Official Logo
              </label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="w-16 h-16 rounded-xl border border-[#E2E8F0] bg-white p-2 flex items-center justify-center overflow-hidden shadow-xs shrink-0">
                  {companyForm.company_logo && !imageError ? (
                    <img
                      src={companyForm.company_logo}
                      alt="Company Logo"
                      onError={() => setImageError(true)}
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <div className="text-center">
                      <FaImage className="text-[#64748B] text-xl mx-auto" />
                      <span className="text-[9px] text-[#64748B]">No Preview</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="text-xs text-[#64748B] file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#EFF6FF] file:text-[#2563EB] hover:file:bg-[#2563EB] hover:file:text-white cursor-pointer"
                    />
                    {companyForm.company_logo && (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 font-bold hover:bg-rose-100 text-xs cursor-pointer flex items-center gap-1"
                      >
                        <FaTrash className="text-xs" /> Remove
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-[#64748B]">
                    Uploaded logo will automatically render on Payslips, Receipts, Certificates & Header.
                  </p>
                </div>
              </div>
            </div>

            {/* Row 1: Company Name & Currency Symbol (Requirement #3 - 16px gap-4) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Company Name *
                </label>
                <div className="relative flex items-center">
                  <FaBuilding className="absolute left-3 text-[#64748B]" />
                  <input
                    type="text"
                    required
                    value={companyForm.company_name}
                    onChange={(e) => setCompanyForm({ ...companyForm, company_name: e.target.value })}
                    placeholder="Antigravity Software House (Pvt) Ltd"
                    className="w-full rounded-xl border border-[#E2E8F0] pl-9 pr-3.5 py-2.5 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-bold bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Currency Symbol *
                </label>
                <div className="relative flex items-center">
                  <FaCoins className="absolute left-3 text-[#2563EB]" />
                  <select
                    value={companyForm.currency_symbol}
                    onChange={(e) => setCompanyForm({ ...companyForm, currency_symbol: e.target.value })}
                    className="w-full rounded-xl border border-[#E2E8F0] pl-9 pr-3.5 py-2.5 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-bold bg-white cursor-pointer"
                  >
                    <option value="Rs.">Rs. (Pakistani Rupee)</option>
                    <option value="$">$ (USD Dollar)</option>
                    <option value="€">€ (Euro)</option>
                    <option value="£">£ (British Pound)</option>
                    <option value="AED">AED (UAE Dirham)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                Official Address *
              </label>
              <div className="relative flex items-center">
                <FaMapMarkerAlt className="absolute left-3 text-[#2563EB]" />
                <input
                  type="text"
                  required
                  value={companyForm.company_address}
                  onChange={(e) => setCompanyForm({ ...companyForm, company_address: e.target.value })}
                  placeholder="Corporate Tech Campus, Phase 6..."
                  className="w-full rounded-xl border border-[#E2E8F0] pl-9 pr-3.5 py-2.5 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-semibold bg-white"
                />
              </div>
            </div>

            {/* Row 2: Phone & Email (Requirement #3 - gap-4) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Contact Phone Number *
                </label>
                <div className="relative flex items-center">
                  <FaPhoneAlt className="absolute left-3 text-[#64748B]" />
                  <input
                    type="text"
                    required
                    value={companyForm.contact_number}
                    onChange={(e) => setCompanyForm({ ...companyForm, contact_number: e.target.value })}
                    placeholder="+92 300 1234567"
                    className="w-full rounded-xl border border-[#E2E8F0] pl-9 pr-3.5 py-2.5 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-mono bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Company Email Address *
                </label>
                <div className="relative flex items-center">
                  <FaEnvelope className="absolute left-3 text-[#64748B]" />
                  <input
                    type="email"
                    required
                    value={companyForm.email_address}
                    onChange={(e) => setCompanyForm({ ...companyForm, email_address: e.target.value })}
                    placeholder="info@softwarehouse.com"
                    className="w-full rounded-xl border border-[#E2E8F0] pl-9 pr-3.5 py-2.5 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-mono bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Row 3: Website & Tax ID (Requirement #3 - gap-4) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Website URL
                </label>
                <div className="relative flex items-center">
                  <FaGlobe className="absolute left-3 text-[#64748B]" />
                  <input
                    type="url"
                    value={companyForm.website_url}
                    onChange={(e) => setCompanyForm({ ...companyForm, website_url: e.target.value })}
                    placeholder="https://softwarehouse.com"
                    className="w-full rounded-xl border border-[#E2E8F0] pl-9 pr-3.5 py-2.5 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-mono bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Tax Registration Number
                </label>
                <div className="relative flex items-center">
                  <FaFileContract className="absolute left-3 text-[#64748B]" />
                  <input
                    type="text"
                    value={companyForm.tax_registration_no}
                    onChange={(e) => setCompanyForm({ ...companyForm, tax_registration_no: e.target.value })}
                    placeholder="TRN-99887766-PAK"
                    className="w-full rounded-xl border border-[#E2E8F0] pl-9 pr-3.5 py-2.5 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-mono bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold py-3 rounded-xl transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-2 text-xs"
              >
                <FaSave className="text-sm" />
                <span>Save & Apply Company Branding</span>
              </button>
            </div>
          </form>
        </div>

        {/* Sidebar Settings: Password & IP Config */}
        <div className="space-y-6">
          {/* 2. CHANGE PASSWORD SECTION WITH ROYAL BLUE CTA (Requirement #2) */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-[#0F172A] text-sm flex items-center gap-2 border-b border-[#E2E8F0] pb-2">
              <FaKey className="text-[#2563EB]" />
              <span>Change Account Password</span>
            </h3>

            <form onSubmit={handleChangePassword} className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Current Password *
                </label>
                <div className="relative flex items-center">
                  <FaLock className="absolute left-3 text-[#64748B]" />
                  <input
                    type="password"
                    required
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-[#E2E8F0] pl-9 pr-3.5 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-mono bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  New Password *
                </label>
                <div className="relative flex items-center">
                  <FaLock className="absolute left-3 text-[#64748B]" />
                  <input
                    type="password"
                    required
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    placeholder="Min 8 chars (A-Z, a-z, 0-9, @#$)"
                    className="w-full rounded-xl border border-[#E2E8F0] pl-9 pr-3.5 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-mono bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-[#0F172A] mb-1">
                  Confirm New Password *
                </label>
                <div className="relative flex items-center">
                  <FaLock className="absolute left-3 text-[#64748B]" />
                  <input
                    type="password"
                    required
                    value={passwordForm.confirmNewPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmNewPassword: e.target.value })}
                    placeholder="Re-type new password"
                    className="w-full rounded-xl border border-[#E2E8F0] pl-9 pr-3.5 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-mono bg-white"
                  />
                </div>
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold py-2.5 rounded-xl transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-2 text-xs"
                >
                  <FaKey />
                  <span>Update Account Password</span>
                </button>
              </div>
            </form>
          </div>

          {/* Audit Trail Card */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-sm space-y-3">
            <h3 className="font-bold text-[#0F172A] text-sm flex items-center gap-2 border-b border-[#E2E8F0] pb-2">
              <FaHistory className="text-[#2563EB]" />
              <span>Settings Audit Trail</span>
            </h3>

            <div className="text-xs space-y-2 text-[#64748B] bg-[#F8FAFC] p-3.5 rounded-xl border border-[#E2E8F0]">
              <p>
                <strong>Last Updated At:</strong><br />
                <span className="text-[#0F172A] font-mono text-[11px]">{auditInfo.updated_at}</span>
              </p>
              <p>
                <strong>Updated Administrator:</strong><br />
                <span className="text-[#2563EB] font-semibold">{auditInfo.updated_by}</span>
              </p>
            </div>
          </div>

          {/* Office Public IP Settings */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-[#0F172A] text-sm flex items-center gap-2 border-b border-[#E2E8F0] pb-2">
              <FaWifi className="text-[#2563EB]" />
              <span>Office Public IP Restrictions</span>
            </h3>

            <div className="space-y-2 text-xs">
              <label className="block text-xs font-semibold uppercase text-[#0F172A]">
                Authorized Office Public IP
              </label>
              <input
                type="text"
                value={officeIp}
                onChange={(e) => setOfficeIp(e.target.value)}
                placeholder="39.46.118.183"
                className="w-full rounded-xl border border-[#E2E8F0] px-3.5 py-2 text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-mono bg-white"
              />

              <button
                type="button"
                onClick={handleUseCurrentIp}
                className="w-full bg-[#EFF6FF] hover:bg-[#2563EB] hover:text-white text-[#2563EB] font-bold py-2 rounded-xl text-xs transition-colors border border-[#2563EB]/20 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FaWifi />
                <span>Auto-Detect Current Public IP</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

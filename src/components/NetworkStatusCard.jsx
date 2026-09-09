"use client";

import { useState, useEffect, useCallback } from "react";
import { FaWifi, FaCheckCircle, FaTimesCircle, FaSyncAlt, FaShieldAlt, FaExclamationTriangle } from "react-icons/fa";
import { fetchCurrentPublicIp, fetchAuthorizedOfficePublicIp, DEFAULT_OFFICE_PUBLIC_IP } from "@/lib/attendanceIpUtils";

/**
 * Reusable Network Status Card Component
 * Dynamically detects the current device's public IP from the live network.
 * Compares with the fixed Authorized Office IP (39.46.75.147).
 * Updates automatically on network switch, tab focus, visibility change, and periodic heartbeat.
 */
export default function NetworkStatusCard({
  onStatusChange = null,
  compact = false,
  className = "",
  title = "Office Network Verification"
}) {
  const [currentPublicIp, setCurrentPublicIp] = useState(null);
  const [authorizedOfficeIp, setAuthorizedOfficeIp] = useState(DEFAULT_OFFICE_PUBLIC_IP);
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState(null);

  const checkNetwork = useCallback(async () => {
    setIsChecking(true);
    setError(null);

    try {
      // 1. Fetch live dynamic public IP of this specific device
      const detectedIp = await fetchCurrentPublicIp();

      // 2. Fetch configured authorized office IP
      const authIp = await fetchAuthorizedOfficePublicIp().catch(() => DEFAULT_OFFICE_PUBLIC_IP);
      const cleanAuthIp = (authIp || DEFAULT_OFFICE_PUBLIC_IP).trim();

      setAuthorizedOfficeIp(cleanAuthIp);
      setCurrentPublicIp(detectedIp);

      // Strict match: both must be present and equal
      const isMatched = Boolean(
        detectedIp &&
        cleanAuthIp &&
        detectedIp.trim().toLowerCase() === cleanAuthIp.toLowerCase()
      );

      if (!detectedIp) {
        setError("Unable to detect network public IP. Please check your connection.");
      }

      if (onStatusChange) {
        onStatusChange({
          isMatched,
          detectedIp: detectedIp || "Unable to detect",
          authorizedIp: cleanAuthIp,
          isChecking: false,
          attendanceAllowed: isMatched
        });
      }
    } catch (err) {
      console.error("NetworkStatusCard check error:", err);
      setError("Network verification failed.");
      setCurrentPublicIp(null);
      if (onStatusChange) {
        onStatusChange({
          isMatched: false,
          detectedIp: "Unable to detect",
          authorizedIp: DEFAULT_OFFICE_PUBLIC_IP,
          isChecking: false,
          attendanceAllowed: false
        });
      }
    } finally {
      setIsChecking(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    // Initial check
    checkNetwork();

    // Recheck when tab gains focus or visibility changes
    const handleRecheck = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        checkNetwork();
      }
    };

    window.addEventListener("focus", checkNetwork);
    window.addEventListener("online", checkNetwork);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleRecheck);
    }

    // Periodic 30s network refresh
    const intervalId = setInterval(() => {
      checkNetwork();
    }, 30000);

    return () => {
      window.removeEventListener("focus", checkNetwork);
      window.removeEventListener("online", checkNetwork);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleRecheck);
      }
      clearInterval(intervalId);
    };
  }, [checkNetwork]);

  const isMatched = Boolean(
    currentPublicIp &&
    authorizedOfficeIp &&
    currentPublicIp.trim().toLowerCase() === authorizedOfficeIp.trim().toLowerCase()
  );

  // Status Themes
  let statusTheme = {
    cardBg: "bg-amber-50/90 border-amber-200 text-amber-900",
    badgeBg: "bg-amber-100 text-amber-800 border-amber-300",
    badgeText: "Checking Network ⏳",
    attendanceText: "Checking...",
    attendanceColor: "text-amber-700",
    icon: <FaSyncAlt className="animate-spin text-amber-600" />
  };

  if (!isChecking) {
    if (!currentPublicIp) {
      statusTheme = {
        cardBg: "bg-rose-50/90 border-rose-200 text-rose-950",
        badgeBg: "bg-rose-100 text-rose-800 border-rose-300",
        badgeText: "Network Verification Failed 🛑",
        attendanceText: "Blocked ❌",
        attendanceColor: "text-rose-700 font-bold",
        icon: <FaTimesCircle className="text-rose-600 text-base" />
      };
    } else if (isMatched) {
      statusTheme = {
        cardBg: "bg-emerald-50/90 border-emerald-200 text-emerald-950",
        badgeBg: "bg-emerald-100 text-emerald-800 border-emerald-300",
        badgeText: "Connected to Authorized Office Network ✅",
        attendanceText: "You can mark attendance ✅",
        attendanceColor: "text-emerald-700 font-bold",
        icon: <FaCheckCircle className="text-emerald-600 text-base" />
      };
    } else {
      statusTheme = {
        cardBg: "bg-rose-50/90 border-rose-200 text-rose-950",
        badgeBg: "bg-rose-100 text-rose-800 border-rose-300",
        badgeText: "Unauthorized Network ❌",
        attendanceText: "Attendance cannot be marked from this network ❌",
        attendanceColor: "text-rose-700 font-bold",
        icon: <FaTimesCircle className="text-rose-600 text-base" />
      };
    }
  }

  if (compact) {
    return (
      <div className={`rounded-xl border p-3 transition-all ${statusTheme.cardBg} ${className}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <FaWifi className="text-[#2563EB]" />
            <span className="font-semibold">IP Check:</span>
            <span className="font-mono font-bold">
              {isChecking ? "Checking..." : (currentPublicIp || "Unable to detect")}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${statusTheme.badgeBg}`}>
              {isChecking ? "Checking..." : (isMatched ? "Matched ✅" : "Not Matched ❌")}
            </span>
            <button
              type="button"
              onClick={checkNetwork}
              disabled={isChecking}
              title="Refresh Network"
              className="p-1 rounded-md hover:bg-white/60 transition text-[#64748B] hover:text-[#0F172A] cursor-pointer"
            >
              <FaSyncAlt className={`text-[10px] ${isChecking ? "animate-spin text-blue-600" : ""}`} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border p-4 sm:p-5 transition-all shadow-sm ${statusTheme.cardBg} ${className}`}>
      {/* Card Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-white shadow-sm border border-black/5">
            <FaShieldAlt className="text-[#2563EB] text-sm" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-bold tracking-tight text-[#0F172A]">
              {title}
            </h4>
            <p className="text-[11px] text-[#64748B]">
              Real-time Wi-Fi Public IP verification for attendance security
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border shadow-2xs ${statusTheme.badgeBg}`}>
            {statusTheme.icon}
            <span>{statusTheme.badgeText}</span>
          </span>

          <button
            type="button"
            onClick={checkNetwork}
            disabled={isChecking}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-slate-50 text-[#0F172A] border border-[#E2E8F0] shadow-2xs transition disabled:opacity-50 cursor-pointer active:scale-95"
            title="Refresh Network IP"
          >
            <FaSyncAlt className={`text-xs ${isChecking ? "animate-spin text-[#2563EB]" : "text-[#2563EB]"}`} />
            <span className="font-bold">Refresh Network</span>
          </button>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 text-xs">
        {/* Current Network Public IP */}
        <div className="bg-white/80 backdrop-blur-xs p-3 rounded-xl border border-black/5 space-y-1">
          <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">
            Current Network IP
          </span>
          <p className="font-mono font-bold text-sm text-[#0F172A]">
            {isChecking ? (
              <span className="text-amber-600 animate-pulse">Checking...</span>
            ) : (
              currentPublicIp || <span className="text-rose-600">Unable to detect</span>
            )}
          </p>
        </div>

        {/* Authorized Office IP */}
        <div className="bg-white/80 backdrop-blur-xs p-3 rounded-xl border border-black/5 space-y-1">
          <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">
            Authorized Office IP
          </span>
          <p className="font-mono font-bold text-sm text-[#2563EB]">
            {authorizedOfficeIp}
          </p>
        </div>

        {/* Network Match Status */}
        <div className="bg-white/80 backdrop-blur-xs p-3 rounded-xl border border-black/5 space-y-1">
          <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">
            Network Match
          </span>
          <p className="font-semibold text-sm">
            {isChecking ? (
              <span className="text-amber-600">Checking...</span>
            ) : !currentPublicIp ? (
              <span className="text-rose-700 font-bold flex items-center gap-1">
                <FaTimesCircle className="text-rose-600 text-xs" /> Failed
              </span>
            ) : isMatched ? (
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <FaCheckCircle className="text-emerald-600 text-xs" /> Matched
              </span>
            ) : (
              <span className="text-rose-700 font-bold flex items-center gap-1">
                <FaTimesCircle className="text-rose-600 text-xs" /> Not Matched
              </span>
            )}
          </p>
        </div>

        {/* Attendance Access */}
        <div className="bg-white/80 backdrop-blur-xs p-3 rounded-xl border border-black/5 space-y-1">
          <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">
            Attendance Access
          </span>
          <p className={`text-xs sm:text-sm ${statusTheme.attendanceColor}`}>
            {isChecking ? "Checking..." : (isMatched ? "Allowed ✅" : "Blocked ❌")}
          </p>
        </div>
      </div>

      {/* Error or Warning Notice */}
      {!isChecking && !isMatched && (
        <div className="mt-3 p-2.5 rounded-xl bg-rose-100/90 border border-rose-300 text-rose-900 text-xs flex items-start gap-2">
          <FaExclamationTriangle className="text-rose-600 text-sm shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">
              Attendance cannot be marked from this network.
            </p>
            <p className="text-[11px] text-rose-800 mt-0.5">
              Please connect to the official office Wi-Fi network (Authorized IP: <strong className="font-mono">{authorizedOfficeIp}</strong>). Detected public IP: <strong className="font-mono">{currentPublicIp || "Unable to detect"}</strong>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

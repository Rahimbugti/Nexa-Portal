import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder"))
  ? process.env.NEXT_PUBLIC_SUPABASE_URL
  : "https://uzwmwtkldgchnuqxamov.supabase.co";

const LIVE_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6d213dGtsZGdjaG51cXhhbW92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MDUxMjYsImV4cCI6MjEwMDk4MTEyNn0.dTw41DhaS-qDVqX4jj3WsrAvYE9CLigjOLZFiDt_7Rk";
const supabaseKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.includes("placeholder"))
  ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  : LIVE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const DEFAULT_OFFICE_IP = process.env.OFFICE_PUBLIC_IP || "39.46.69.123";

/**
 * GET /api/attendance/office-ip
 * Retrieves the currently authorized Office Public IP from Supabase system_settings
 */
export async function GET(request) {
  try {
    // 1. Fetch from Supabase system_settings table
    const { data: setting, error } = await supabase
      .from("system_settings")
      .select("*")
      .eq("key", "office_public_ip")
      .maybeSingle();

    let officeIp = DEFAULT_OFFICE_IP;
    let label = "Software House Main Office Wi-Fi";
    let isActive = true;

    if (!error && setting && setting.value) {
      if (typeof setting.value === "object") {
        officeIp = (setting.value.ip || setting.value.office_public_ip || DEFAULT_OFFICE_IP).trim();
        label = setting.value.label || label;
        isActive = setting.value.is_active !== undefined ? setting.value.is_active : true;
      } else if (typeof setting.value === "string") {
        officeIp = setting.value.trim();
      }
    }

    return NextResponse.json({
      success: true,
      office_public_ip: officeIp,
      label: label,
      is_active: isActive
    }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" }
    });
  } catch (err) {
    console.error("GET /api/attendance/office-ip error:", err);
    return NextResponse.json({
      success: true,
      office_public_ip: DEFAULT_OFFICE_IP,
      label: "Software House Main Office Wi-Fi",
      is_active: true
    });
  }
}

/**
 * POST /api/attendance/office-ip
 * Admin-only endpoint to update and persist the authorized Office Public IP in Supabase
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { officePublicIp, label = "Software House Main Office Wi-Fi", requesterRole, requesterEmail } = body;

    const isRequesterAdmin =
      requesterRole === "admin" ||
      requesterRole === "hr" ||
      (requesterEmail && (requesterEmail.includes("admin") || requesterEmail === "admin@gmail.com"));

    if (!isRequesterAdmin) {
      return NextResponse.json({ error: "403 Forbidden: Only administrators can update the Office Public IP." }, { status: 403 });
    }

    if (!officePublicIp || typeof officePublicIp !== "string" || !officePublicIp.trim()) {
      return NextResponse.json({ error: "A valid Office Public IP is required." }, { status: 400 });
    }

    const cleanIp = officePublicIp.trim();

    const payload = {
      key: "office_public_ip",
      value: {
        ip: cleanIp,
        label: label.trim(),
        is_active: true
      },
      description: "Configured Office Public IP for student attendance network verification",
      updated_by: requesterEmail || "admin@gmail.com",
      updated_at: new Date().toISOString()
    };

    const { data: updated, error: upsertErr } = await supabase
      .from("system_settings")
      .upsert([payload], { onConflict: "key" })
      .select()
      .single();

    if (upsertErr) {
      console.error("Upsert system_settings error:", upsertErr);
      throw new Error(upsertErr.message);
    }

    return NextResponse.json({
      success: true,
      message: `Authorized Office Public IP updated to "${cleanIp}" and stored permanently in Supabase.`,
      office_public_ip: cleanIp
    });
  } catch (err) {
    console.error("POST /api/attendance/office-ip error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

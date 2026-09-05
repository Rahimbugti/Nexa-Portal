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

export async function GET(request) {
  try {
    // 1. Fetch remote users directly from Supabase remote_users table
    const { data: remoteUsers, error } = await supabase
      .from("remote_users")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("GET /api/remote-users query error:", error);
      // Return empty list gracefully with error log for debugging
      return NextResponse.json({
        success: false,
        data: [],
        error: error.message
      }, { status: 200 });
    }

    return NextResponse.json({
      success: true,
      data: remoteUsers || []
    }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" }
    });
  } catch (err) {
    console.error("GET /api/remote-users error:", err);
    return NextResponse.json({ success: false, data: [], error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, userData, id, userEmail, requesterEmail, requesterRole } = body;

    const isRequesterAdmin =
      requesterRole === "admin" ||
      requesterRole === "hr" ||
      (requesterEmail && (requesterEmail.includes("admin") || requesterEmail === "admin@gmail.com"));

    // 1. ACTION: ADD REMOTE USER
    if (action === "add_user") {
      if (!isRequesterAdmin) {
        return NextResponse.json({ error: "403 Forbidden: Only admins can register remote users." }, { status: 403 });
      }

      const {
        email,
        name,
        department = "Software Engineering",
        designation = "Remote Member",
        role = "employee",
        deviceName = "Desktop Workstation"
      } = userData || {};

      if (!email || !name) {
        return NextResponse.json({ error: "Email and Full Name are required." }, { status: 400 });
      }

      const cleanEmail = email.toLowerCase().trim();
      const cleanName = name.trim();

      // Check for duplicate user
      const { data: existing } = await supabase
        .from("remote_users")
        .select("id, user_email")
        .eq("user_email", cleanEmail)
        .limit(1);

      if (existing && existing.length > 0) {
        return NextResponse.json({
          success: false,
          error: "User is already added to Remote Monitoring."
        }, { status: 409 });
      }

      // Insert new remote user into Supabase
      const payload = {
        user_email: cleanEmail,
        user_name: cleanName,
        department: department,
        designation: designation,
        role: role,
        device_name: deviceName,
        status: "active",
        is_active: true,
        added_by_email: requesterEmail || "admin@gmail.com",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: insertedUser, error: insertErr } = await supabase
        .from("remote_users")
        .insert([payload])
        .select()
        .single();

      if (insertErr || !insertedUser) {
        throw new Error(insertErr?.message || "Failed to insert remote user into database.");
      }

      // Also ensure profile exists in employees or app_users so user can log in
      try {
        await supabase.from("app_users").upsert([{
          email: cleanEmail,
          full_name: cleanName,
          role: role,
          status: "active"
        }], { onConflict: "email" });

        await supabase.from("employees").upsert([{
          email: cleanEmail,
          full_name: cleanName,
          department: department,
          designation: designation,
          employment_type: "Remote Member",
          status: "active"
        }], { onConflict: "email" });
      } catch (profileErr) {
        console.debug("Profile sync notice:", profileErr);
      }

      return NextResponse.json({
        success: true,
        message: `Remote user "${cleanName}" added and stored successfully in Supabase!`,
        data: insertedUser
      });
    }

    // 2. ACTION: TOGGLE STATUS (Active / Inactive)
    if (action === "toggle_status") {
      if (!isRequesterAdmin) {
        return NextResponse.json({ error: "403 Forbidden: Only admins can update user status." }, { status: 403 });
      }

      const { currentStatus } = body;
      const nextStatus = currentStatus === "active" ? "inactive" : "active";
      const nextIsActive = nextStatus === "active";

      let query = supabase.from("remote_users").update({
        status: nextStatus,
        is_active: nextIsActive,
        updated_at: new Date().toISOString()
      });

      if (id) {
        query = query.eq("id", id);
      } else if (userEmail) {
        query = query.eq("user_email", userEmail.toLowerCase().trim());
      } else {
        return NextResponse.json({ error: "User id or email is required." }, { status: 400 });
      }

      const { error: updateErr } = await query;
      if (updateErr) {
        throw new Error(updateErr.message);
      }

      return NextResponse.json({
        success: true,
        status: nextStatus,
        is_active: nextIsActive,
        message: `Remote user status updated to ${nextStatus}.`
      });
    }

    // 3. ACTION: DELETE REMOTE USER
    if (action === "delete_user") {
      if (!isRequesterAdmin) {
        return NextResponse.json({ error: "403 Forbidden: Only admins can remove remote users." }, { status: 403 });
      }

      let deleteQuery = supabase.from("remote_users").delete();

      if (id) {
        deleteQuery = deleteQuery.eq("id", id);
      } else if (userEmail) {
        deleteQuery = deleteQuery.eq("user_email", userEmail.toLowerCase().trim());
      } else {
        return NextResponse.json({ error: "User id or email is required to delete." }, { status: 400 });
      }

      const { error: delErr } = await deleteQuery;
      if (delErr) {
        throw new Error(delErr.message);
      }

      return NextResponse.json({
        success: true,
        deleted: true,
        message: "Remote user removed permanently from database."
      });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (err) {
    console.error("POST /api/remote-users error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

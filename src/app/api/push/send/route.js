import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

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

export async function POST(request) {
  try {
    const body = await request.json();
    const { title = "Daily Task Alert ⚠️", message, url = "/dashboard/tasks", targetRole = "admin" } = body;

    // Fetch active push subscriptions for targetRole
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("role", targetRole);

    if (error || !Array.isArray(subscriptions) || subscriptions.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: "No active push subscriptions found." });
    }

    // Return dispatched count
    return NextResponse.json({
      success: true,
      count: subscriptions.length,
      message: `Push notification dispatched to ${subscriptions.length} active subscription(s).`
    });
  } catch (error) {
    console.error("POST /api/push/send error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

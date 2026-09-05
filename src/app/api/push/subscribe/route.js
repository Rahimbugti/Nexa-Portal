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
    const { subscription, userEmail, role = "admin" } = body;

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json({ error: "Invalid subscription payload." }, { status: 400 });
    }

    const cleanEmail = (userEmail || "admin@gmail.com").toLowerCase().trim();
    const endpoint = subscription.endpoint;
    const p256dh = subscription.keys?.p256dh || "";
    const auth = subscription.keys?.auth || "";

    const payload = {
      user_email: cleanEmail,
      role: role,
      endpoint: endpoint,
      p256dh: p256dh,
      auth: auth,
      updated_at: new Date().toISOString()
    };

    // Upsert subscription into push_subscriptions
    const { data, error } = await supabase
      .from("push_subscriptions")
      .upsert([payload], { onConflict: "endpoint" })
      .select();

    if (error) {
      console.error("Failed to store push subscription:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Push subscription saved successfully." });
  } catch (error) {
    console.error("POST /api/push/subscribe error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

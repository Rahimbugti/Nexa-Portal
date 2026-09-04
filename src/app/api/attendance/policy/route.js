import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const LIVE_SUPABASE_URL = "https://uzwmwtkldgchnuqxamov.supabase.co";
const LIVE_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6d213dGtsZGdjaG51cXhhbW92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MDUxMjYsImV4cCI6MjEwMDk4MTEyNn0.dTw41DhaS-qDVqX4jj3WsrAvYE9CLigjOLZFiDt_7Rk";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
  ? process.env.NEXT_PUBLIC_SUPABASE_URL
  : LIVE_SUPABASE_URL;

const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.includes("placeholder")
  ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  : LIVE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`
    }
  }
});

// Default attendance policy
const DEFAULT_POLICY = {
  shift_start: "10:00 AM",
  shift_end: "6:00 PM",
  grace_period_minutes: 14,
  late_warning_minutes: 29,
  salary_deduction_after: 30,
  policy_name: "Standard Policy",
  description: "Standard attendance policy for employees and students"
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key") || "attendance_policy";
    
    // Check cache first
    let policy = null;
    
    try {
      if (typeof window !== "undefined") {
        const cached = localStorage.getItem(key);
        if (cached) {
          policy = JSON.parse(cached);
        }
      }
    } catch (e) {}
    
    // If no cache, fetch from Supabase
    if (!policy) {
      try {
        const { data, error } = await supabase
          .from("attendance_policy")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1);
        
        if (!error && data && data.length > 0) {
          policy = data[0];
          // Cache for 5 minutes
          try {
            if (typeof window !== "undefined") {
              localStorage.setItem(key, JSON.stringify(policy));
            }
          } catch (e) {}
        } else {
          // Table exists but no data - insert default
          const { error: insertError } = await supabase
            .from("attendance_policy")
            .insert({
              id: "policy_1",
              shift_start: "10:00 AM",
              shift_end: "6:00 PM",
              grace_period_minutes: 14,
              late_warning_minutes: 29,
              salary_deduction_after: 30,
              policy_name: "Standard Policy",
              description: "Standard attendance policy for employees and students",
              created_at: new Date().toISOString()
            })
            .select()
            .limit(1);
          
          if (!insertError && insertError === null) {
            policy = DEFAULT_POLICY;
          } else {
            policy = DEFAULT_POLICY;
          }
        }
      } catch (e) {
        console.error("Supabase error in GET policy:", e.message);
        // Table might not exist yet, use default
        policy = DEFAULT_POLICY;
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      policy: policy,
      defaultPolicy: DEFAULT_POLICY
    });
  } catch (e) {
    console.error("Error fetching attendance policy:", e);
    return NextResponse.json({ 
      success: true, 
      policy: DEFAULT_POLICY,
      defaultPolicy: DEFAULT_POLICY
    });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, policy } = body;
    
    if (!action) {
      return NextResponse.json({ error: "Action required" }, { status: 400 });
    }
    
    // 1. UPDATE POLICY ACTION
    if (action === "update" && policy) {
      try {
        const { data, error } = await supabase
          .from("attendance_policy")
          .upsert({
            id: "policy_1", // Fixed ID for single policy record
            shift_start: policy.shift_start,
            shift_end: policy.shift_end,
            grace_period_minutes: parseInt(policy.grace_period_minutes) || 14,
            late_warning_minutes: parseInt(policy.late_warning_minutes) || 29,
            salary_deduction_after: parseInt(policy.salary_deduction_after) || 30,
            policy_name: policy.policy_name || "Standard Policy",
            description: policy.description || "Standard attendance policy",
            updated_at: new Date().toISOString()
          })
          .select();
        
        if (error) {
          // If table doesn't exist, try creating it
          console.log("Policy update error (table may not exist):", error.message);
          
          // Create table first
          try {
            const createTableSql = `
              CREATE TABLE IF NOT EXISTS attendance_policy (
                id TEXT PRIMARY KEY,
                shift_start TEXT DEFAULT '10:00 AM',
                shift_end TEXT DEFAULT '6:00 PM',
                grace_period_minutes INTEGER DEFAULT 14,
                late_warning_minutes INTEGER DEFAULT 29,
                salary_deduction_after INTEGER DEFAULT 30,
                policy_name TEXT DEFAULT 'Standard Policy',
                description TEXT DEFAULT 'Standard attendance policy',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
              );
            `;
            // Note: Supabase doesn't support direct SQL execution from anon key
            // This needs to be done in Supabase SQL Editor
            return NextResponse.json({ 
              success: false, 
              error: "attendance_policy table not found. Please create it in Supabase SQL Editor.",
              createTableSql: `
-- Run this in Supabase SQL Editor to create the attendance_policy table:
CREATE TABLE IF NOT EXISTS attendance_policy (
  id TEXT PRIMARY KEY DEFAULT 'policy_1',
  shift_start TEXT DEFAULT '10:00 AM',
  shift_end TEXT DEFAULT '6:00 PM',
  grace_period_minutes INTEGER DEFAULT 14,
  late_warning_minutes INTEGER DEFAULT 29,
  salary_deduction_after INTEGER DEFAULT 30,
  policy_name TEXT DEFAULT 'Standard Policy',
  description TEXT DEFAULT 'Standard attendance policy for employees and students',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Insert default record
INSERT INTO attendance_policy (id, shift_start, shift_end, grace_period_minutes, late_warning_minutes, salary_deduction_after, policy_name, description)
VALUES ('policy_1', '10:00 AM', '6:00 PM', 14, 29, 30, 'Standard Policy', 'Standard attendance policy for employees and students')
ON CONFLICT (id) DO NOTHING;
              `
            }, { status: 500 });
          } catch (createErr) {
            return NextResponse.json({ 
              success: false, 
              error: "attendance_policy table not found. Create it in Supabase SQL Editor.",
              createTableSql: `-- Create attendance_policy table in Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS attendance_policy (
  id TEXT PRIMARY KEY,
  shift_start TEXT DEFAULT '10:00 AM',
  shift_end TEXT DEFAULT '6:00 PM',
  grace_period_minutes INTEGER DEFAULT 14,
  late_warning_minutes INTEGER DEFAULT 29,
  salary_deduction_after INTEGER DEFAULT 30,
  policy_name TEXT DEFAULT 'Standard Policy',
  description TEXT DEFAULT 'Standard attendance policy',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);`
            }, { status: 500 });
          }
        }
        
        if (!error && data) {
          // Clear cache
          try {
            if (typeof window !== "undefined") {
              localStorage.removeItem("attendance_policy");
            }
          } catch (e) {}
          
          return NextResponse.json({ 
            success: true, 
            message: "Attendance policy updated successfully",
            policy: data[0]
          });
        }
      } catch (e) {
        console.error("Error updating policy:", e);
        return NextResponse.json({ success: false, error: e.message }, { status: 400 });
      }
    }
    
    // 2. RESET TO DEFAULT ACTION
    if (action === "reset") {
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("attendance_policy");
        }
      } catch (e) {}
      
      return NextResponse.json({ 
        success: true, 
        message: "Policy reset to default",
        policy: DEFAULT_POLICY
      });
    }
    
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    console.error("Error in attendance policy API:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

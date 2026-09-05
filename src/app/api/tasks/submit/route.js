import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateTaskSubmission } from "@/lib/recurringTaskUtils";

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

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      instanceId,
      userEmail,
      userName,
      submissionText = "",
      submissionUrl = "",
      deliverableLinks = "",
      fileUrl = "",
      submissionFileUrl = "",
      submission_file_url = "",
      submission_url = "",
      notes = ""
    } = body;

    const effectiveFileUrl = (fileUrl || submissionFileUrl || submission_file_url || "").trim();
    const effectiveSubmissionUrl = (submissionUrl || submission_url || deliverableLinks || "").trim();

    if (!instanceId || !userEmail) {
      return NextResponse.json({ error: "instanceId and userEmail are required." }, { status: 400 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();

    // 1. Fetch the targeted Daily Task Instance
    const { data: instance, error: fetchErr } = await supabase
      .from("daily_task_instances")
      .select("*")
      .eq("id", instanceId)
      .single();

    if (fetchErr || !instance) {
      return NextResponse.json({ error: "Task instance not found." }, { status: 404 });
    }

    // 2. Authorization Check: User must only submit their own assigned task
    if (instance.user_email.toLowerCase().trim() !== cleanEmail) {
      return NextResponse.json(
        { error: "403 Forbidden: You cannot submit a task assigned to another user." },
        { status: 403 }
      );
    }

    // 3. Prevent duplicate submissions if already completed
    if (instance.status === "submitted" || instance.status === "late_submitted") {
      return NextResponse.json({
        success: true,
        message: "This task has already been submitted.",
        status: instance.status
      });
    }

    // 4. Determine required submission type
    const requiredSubmissionType = instance.submission_type || "any";
    // 5. SERVER-SIDE STRICT VALIDATION
    const validation = validateTaskSubmission({
      submissionType: requiredSubmissionType,
      submissionUrl: effectiveSubmissionUrl,
      submissionText: submissionText,
      fileUrl: effectiveFileUrl,
      notes: notes
    });

    if (!validation.isValid) {
      // Critical: Do NOT change status to submitted, reject invalid or blank submission
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const cleaned = validation.cleaned;
    const newStatus = instance.status === "missed" ? "late_submitted" : "submitted";
    const nowIso = new Date().toISOString();

    // 6. Update daily_task_instances record (only after validation passes)
    const { error: updateErr } = await supabase
      .from("daily_task_instances")
      .update({
        status: newStatus,
        submitted_at: nowIso,
        updated_at: nowIso
      })
      .eq("id", instanceId);

    if (updateErr) {
      throw new Error(`Failed to update task status: ${updateErr.message}`);
    }

    // 7. Permanently Upsert submission payload into task_submissions
    const submissionPayload = {
      daily_task_instance_id: instanceId,
      assignment_id: instance.assignment_id,
      group_id: instance.group_id,
      user_email: cleanEmail,
      user_name: userName || instance.user_name || cleanEmail.split("@")[0],
      submission_text: cleaned.submissionText,
      submission_url: cleaned.submissionUrl,
      file_url: cleaned.fileUrl,
      notes: cleaned.notes,
      submitted_at: nowIso,
      updated_at: nowIso
    };

    const { data: submissionData, error: subErr } = await supabase
      .from("task_submissions")
      .upsert([submissionPayload], { onConflict: "daily_task_instance_id" })
      .select()
      .single();

    if (subErr) {
      console.error("Upsert submission error:", subErr);
    }

    // 8. Send In-App Notification to Admin(s)
    try {
      const linkNote = cleaned.submissionUrl ? `\nLink: ${cleaned.submissionUrl}` : "";
      await supabase.from("task_notifications").insert([{
        recipient_email: "admin@gmail.com",
        recipient_role: "admin",
        type: "task_submitted",
        title: `Task Submitted: ${instance.task_title} 🚀`,
        message: `${userName || cleanEmail.split("@")[0]} submitted "${instance.task_title}" (Day ${instance.cycle_number} of ${instance.total_cycles}).${linkNote}`,
        related_user_email: cleanEmail,
        related_user_name: userName || instance.user_name,
        related_task_id: instance.assignment_id,
        related_daily_instance_id: instance.id
      }]);
    } catch (notifErr) {
      console.debug("Notification error on submission:", notifErr);
    }

    return NextResponse.json({
      success: true,
      message: `Task successfully marked as ${newStatus === "late_submitted" ? "Late Submitted" : "Submitted"}!`,
      status: newStatus,
      submittedAt: nowIso,
      submission: submissionData || submissionPayload
    });
  } catch (error) {
    console.error("POST /api/tasks/submit error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

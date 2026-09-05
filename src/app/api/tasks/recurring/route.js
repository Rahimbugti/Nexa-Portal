import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateCycleSchedule, formatDateToYYYYMMDD, calculateDueTimestamp } from "@/lib/recurringTaskUtils";

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
    const { searchParams } = new URL(request.url);
    const userEmail = (searchParams.get("userEmail") || "").toLowerCase().trim();
    const isAdmin = searchParams.get("isAdmin") === "true";
    const dateFilter = searchParams.get("date") || "";
    const statusFilter = searchParams.get("status") || "all";
    const targetUser = (searchParams.get("targetUser") || "").toLowerCase().trim();

    const todayDateStr = formatDateToYYYYMMDD(new Date());

    // 1. Fetch Task Assignment Groups
    let groupsQuery = supabase.from("task_assignment_groups").select("*").order("created_at", { ascending: false });
    if (!isAdmin && userEmail) {
      groupsQuery = groupsQuery.eq("user_email", userEmail);
    }
    const { data: groupsData, error: groupsErr } = await groupsQuery;

    // 2. Fetch Task Assignments Templates
    let assignmentsQuery = supabase.from("task_assignments").select("*").order("created_at", { ascending: false });
    if (!isAdmin && userEmail) {
      assignmentsQuery = assignmentsQuery.eq("user_email", userEmail);
    }
    const { data: assignmentsData, error: assignmentsErr } = await assignmentsQuery;

    // 3. Fetch Daily Task Instances
    let instancesQuery = supabase.from("daily_task_instances").select("*").order("task_date", { ascending: false }).order("created_at", { ascending: false });
    if (!isAdmin && userEmail) {
      instancesQuery = instancesQuery.eq("user_email", userEmail);
    } else if (isAdmin && targetUser) {
      instancesQuery = instancesQuery.eq("user_email", targetUser);
    }

    if (dateFilter) {
      instancesQuery = instancesQuery.eq("task_date", dateFilter);
    }
    if (statusFilter && statusFilter !== "all") {
      instancesQuery = instancesQuery.eq("status", statusFilter);
    }

    const { data: instancesData, error: instancesErr } = await instancesQuery;

    // 4. Fetch Submissions
    let submissionsQuery = supabase.from("task_submissions").select("*").order("submitted_at", { ascending: false });
    if (!isAdmin && userEmail) {
      submissionsQuery = submissionsQuery.eq("user_email", userEmail);
    }
    const { data: submissionsData } = await submissionsQuery;

    // Build Submissions Map with normalized field aliases
    const submissionMap = new Map();
    (submissionsData || []).forEach(s => {
      if (s.daily_task_instance_id) {
        const fileUrlValue = s.submission_file_url || s.file_url || s.file_path || "";
        const urlValue = s.submission_url || s.submission_link || "";
        const textValue = s.submission_text || s.text || "";
        submissionMap.set(s.daily_task_instance_id, {
          ...s,
          submission_url: urlValue,
          submission_file_url: fileUrlValue,
          file_url: fileUrlValue,
          submission_text: textValue,
          notes: s.notes || ""
        });
      }
    });

    // Attach submission details to instances
    const enrichedInstances = (instancesData || []).map(inst => {
      const sub = submissionMap.get(inst.id) || null;
      return {
        ...inst,
        submission: sub,
        submission_url: sub?.submission_url || inst.submission_url || "",
        submission_file_url: sub?.submission_file_url || inst.submission_file_url || inst.file_url || "",
        file_url: sub?.file_url || inst.file_url || ""
      };
    });

    // Today's specific instances
    const todayInstances = enrichedInstances.filter(i => i.task_date === todayDateStr);

    // Calculate Summary Metrics for Today
    const todayAssigned = todayInstances.length;
    const todaySubmitted = todayInstances.filter(i => i.status === "submitted" || i.status === "late_submitted").length;
    const todayPending = todayInstances.filter(i => i.status === "pending").length;
    const todayMissed = todayInstances.filter(i => i.status === "missed").length;

    // Aggregate Users who missed tasks (for Admin view)
    const missedUsersMap = new Map();
    todayInstances.forEach(inst => {
      const email = inst.user_email;
      if (!missedUsersMap.has(email)) {
        missedUsersMap.set(email, {
          user_email: email,
          user_name: inst.user_name || email.split("@")[0],
          total: 0,
          submitted: 0,
          pending: 0,
          missed: 0,
          tasks: []
        });
      }
      const record = missedUsersMap.get(email);
      record.total += 1;
      if (inst.status === "submitted" || inst.status === "late_submitted") record.submitted += 1;
      else if (inst.status === "pending") record.pending += 1;
      else if (inst.status === "missed") record.missed += 1;
      record.tasks.push(inst);
    });

    const usersWithMissedTasks = Array.from(missedUsersMap.values()).filter(u => u.missed > 0);
    const allUsersTodaySummary = Array.from(missedUsersMap.values());

    return NextResponse.json({
      success: true,
      todayDate: todayDateStr,
      metrics: {
        total: todayAssigned,
        submitted: todaySubmitted,
        pending: todayPending,
        missed: todayMissed
      },
      todayInstances,
      allInstances: enrichedInstances,
      groups: groupsData || [],
      assignments: assignmentsData || [],
      usersWithMissedTasks,
      allUsersTodaySummary
    });
  } catch (error) {
    console.error("GET /api/tasks/recurring error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, groupData, tasksList, groupId, requesterEmail, requesterRole } = body;

    const isRequesterAdmin =
      requesterRole === "admin" ||
      requesterRole === "hr" ||
      (requesterEmail && (requesterEmail.includes("admin") || requesterEmail === "admin@gmail.com"));

    // 1. ACTION: CREATE RECURRING ASSIGNMENT
    if (action === "create_assignment") {
      if (!isRequesterAdmin) {
        return NextResponse.json({ error: "403 Forbidden: Only admins can assign recurring tasks." }, { status: 403 });
      }

      const {
        user_email,
        user_name,
        user_role = "employee",
        start_date = formatDateToYYYYMMDD(),
        duration_days = 7,
        daily_due_time = "09:00:00",
        timezone = "Asia/Karachi"
      } = groupData || {};

      if (!user_email || !tasksList || !Array.isArray(tasksList) || tasksList.length === 0) {
        return NextResponse.json({ error: "Invalid payload: user_email and at least one task are required." }, { status: 400 });
      }

      const cleanEmail = user_email.toLowerCase().trim();
      const numDays = Math.max(1, parseInt(duration_days, 10) || 1);

      // A. Create Task Assignment Group Record
      const groupPayload = {
        user_email: cleanEmail,
        user_name: user_name || cleanEmail.split("@")[0],
        user_role: user_role,
        created_by_email: requesterEmail || "admin@gmail.com",
        start_date: start_date,
        duration_days: numDays,
        daily_due_time: daily_due_time,
        timezone: timezone,
        status: "active"
      };

      const { data: createdGroup, error: groupInsertErr } = await supabase
        .from("task_assignment_groups")
        .insert([groupPayload])
        .select()
        .single();

      if (groupInsertErr || !createdGroup) {
        throw new Error(groupInsertErr?.message || "Failed to create assignment group.");
      }

      const newGroupId = createdGroup.id;

      // B. Create Task Assignment Templates
      const templatesToInsert = tasksList.map(t => ({
        group_id: newGroupId,
        user_email: cleanEmail,
        title: (t.title || t.task || "Untitled Task").trim(),
        description: t.description || "",
        instructions: t.instructions || "",
        priority: t.priority || "Medium",
        submission_type: t.submission_type || t.submissionType || "any",
        reference_url: t.reference_url || t.referenceUrl || "",
        attachment_url: t.attachment_url || t.attachmentUrl || "",
        status: "active"
      }));

      const { data: createdAssignments, error: assignInsertErr } = await supabase
        .from("task_assignments")
        .insert(templatesToInsert)
        .select();

      if (assignInsertErr || !createdAssignments) {
        throw new Error(assignInsertErr?.message || "Failed to create task assignments.");
      }

      // C. Generate All Daily Task Instances with Idempotency
      const cycleSchedule = generateCycleSchedule(start_date, numDays, daily_due_time);
      const instancesToInsert = [];

      createdAssignments.forEach(assignment => {
        cycleSchedule.forEach(cycle => {
          instancesToInsert.push({
            assignment_id: assignment.id,
            group_id: newGroupId,
            user_email: cleanEmail,
            user_name: user_name || cleanEmail.split("@")[0],
            task_title: assignment.title,
            task_description: assignment.description,
            task_instructions: assignment.instructions,
            priority: assignment.priority,
            submission_type: assignment.submission_type || "any",
            reference_url: assignment.reference_url,
            attachment_url: assignment.attachment_url,
            cycle_number: cycle.cycleNumber,
            total_cycles: numDays,
            task_date: cycle.taskDate,
            due_at: cycle.dueAt,
            status: "pending"
          });
        });
      });

      const { data: createdInstances, error: instancesInsertErr } = await supabase
        .from("daily_task_instances")
        .upsert(instancesToInsert, { onConflict: "assignment_id,task_date" })
        .select();

      // D. Create In-App Notification for User
      try {
        await supabase.from("task_notifications").insert([{
          recipient_email: cleanEmail,
          recipient_role: user_role,
          type: "task_assigned",
          title: "New Daily Tasks Assigned 📋",
          message: `Admin assigned ${createdAssignments.length} recurring daily task(s) for ${numDays} days starting ${start_date}.`,
          related_user_email: requesterEmail || "admin@gmail.com",
          related_user_name: "Admin"
        }]);
      } catch (notifErr) {
        console.debug("Notification error:", notifErr);
      }

      return NextResponse.json({
        success: true,
        message: `Successfully created recurring assignment group with ${createdAssignments.length} tasks for ${numDays} days.`,
        group: createdGroup,
        assignments: createdAssignments,
        instancesCount: createdInstances?.length || instancesToInsert.length
      });
    }

    // 2. ACTION: CANCEL ASSIGNMENT GROUP
    if (action === "cancel_assignment") {
      if (!isRequesterAdmin) {
        return NextResponse.json({ error: "403 Forbidden: Only admins can cancel recurring tasks." }, { status: 403 });
      }

      if (!groupId) {
        return NextResponse.json({ error: "groupId is required to cancel assignment." }, { status: 400 });
      }

      // Mark group as cancelled
      await supabase
        .from("task_assignment_groups")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", groupId);

      // Cancel future pending instances without deleting or altering submitted/missed history
      const todayDateStr = formatDateToYYYYMMDD();
      await supabase
        .from("daily_task_instances")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("group_id", groupId)
        .eq("status", "pending")
        .gte("task_date", todayDateStr);

      return NextResponse.json({
        success: true,
        message: "Assignment group cancelled successfully. Historical submitted/missed records remain preserved."
      });
    }

    return NextResponse.json({ error: "Invalid action requested" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/tasks/recurring error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

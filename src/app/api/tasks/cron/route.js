import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formatDateToYYYYMMDD, generateCycleSchedule } from "@/lib/recurringTaskUtils";

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
  return await runAutomationProcess();
}

export async function POST(request) {
  return await runAutomationProcess();
}

async function runAutomationProcess() {
  const now = new Date();
  const nowIso = now.toISOString();
  const todayDateStr = formatDateToYYYYMMDD(now);

  const logs = {
    executedAt: nowIso,
    overdueTasksFound: 0,
    markedMissed: 0,
    missedNotificationsCreated: 0,
    groupsCompleted: 0,
    newInstancesGenerated: 0,
    pushDispatched: 0,
    errors: []
  };

  try {
    // -------------------------------------------------------------
    // 1. FIND AND PROCESS OVERDUE PENDING DAILY TASK INSTANCES
    // -------------------------------------------------------------
    const { data: overdueTasks, error: overdueErr } = await supabase
      .from("daily_task_instances")
      .select("*")
      .eq("status", "pending")
      .lte("due_at", nowIso);

    if (overdueErr) {
      logs.errors.push(`Overdue query error: ${overdueErr.message}`);
    }

    if (Array.isArray(overdueTasks) && overdueTasks.length > 0) {
      logs.overdueTasksFound = overdueTasks.length;
      const overdueIds = overdueTasks.map(t => t.id);

      // Mark all overdue instances as 'missed'
      const { error: updateErr } = await supabase
        .from("daily_task_instances")
        .update({
          status: "missed",
          updated_at: nowIso
        })
        .in("id", overdueIds);

      if (updateErr) {
        logs.errors.push(`Status update to missed error: ${updateErr.message}`);
      } else {
        logs.markedMissed = overdueIds.length;
      }

      // Group missed tasks per user for intelligent admin notification (no spam)
      const unnotifiedTasks = overdueTasks.filter(t => !t.missed_notified);
      if (unnotifiedTasks.length > 0) {
        const userMissedMap = new Map();
        unnotifiedTasks.forEach(task => {
          const email = task.user_email;
          if (!userMissedMap.has(email)) {
            userMissedMap.set(email, {
              name: task.user_name || email.split("@")[0],
              tasks: [],
              taskIds: []
            });
          }
          userMissedMap.get(email).tasks.push(task.task_title);
          userMissedMap.get(email).taskIds.push(task.id);
        });

        // Insert grouped notifications
        for (const [email, info] of userMissedMap.entries()) {
          const count = info.tasks.length;
          const taskTitles = info.tasks.join(", ");
          const title = count === 1 
            ? `Daily Task Missed: ${info.name} ⚠️` 
            : `${count} Daily Tasks Missed: ${info.name} ⚠️`;
          const message = count === 1
            ? `${info.name} missed "${info.tasks[0]}" (Deadline passed).`
            : `${info.name} missed ${count} tasks: ${taskTitles}.`;

          await supabase.from("task_notifications").insert([{
            recipient_email: "admin@gmail.com",
            recipient_role: "admin",
            type: "task_missed",
            title,
            message,
            related_user_email: email,
            related_user_name: info.name
          }]).catch(() => {});

          logs.missedNotificationsCreated += 1;
        }

        // Mark instances as missed_notified = true so we don't repeat notifications on next run
        await supabase
          .from("daily_task_instances")
          .update({ missed_notified: true })
          .in("id", unnotifiedTasks.map(t => t.id))
          .catch(() => {});
      }
    }

    // -------------------------------------------------------------
    // 2. CHECK ACTIVE ASSIGNMENT GROUPS AND COMPLETE COMPLETED ONES
    // -------------------------------------------------------------
    const { data: activeGroups, error: groupsErr } = await supabase
      .from("task_assignment_groups")
      .select("*, task_assignments(*)")
      .eq("status", "active");

    if (groupsErr) {
      logs.errors.push(`Active groups query error: ${groupsErr.message}`);
    }

    if (Array.isArray(activeGroups)) {
      for (const group of activeGroups) {
        // Fetch all instances for this group
        const { data: groupInstances } = await supabase
          .from("daily_task_instances")
          .select("id, cycle_number, status, due_at")
          .eq("group_id", group.id);

        const totalExpected = (group.duration_days || 1) * ((group.task_assignments || []).length || 1);
        const instances = groupInstances || [];

        // If all instances exist and either duration days have ended or all tasks are finished (submitted/missed)
        const pendingCount = instances.filter(i => i.status === "pending").length;
        const finalCycle = Math.max(...instances.map(i => i.cycle_number || 0), 0);

        if (finalCycle >= group.duration_days && pendingCount === 0) {
          await supabase
            .from("task_assignment_groups")
            .update({ status: "completed", updated_at: nowIso })
            .eq("id", group.id);
          logs.groupsCompleted += 1;
        }
      }
    }

    // -------------------------------------------------------------
    // 3. RETURN SUMMARY REPORT
    // -------------------------------------------------------------
    return NextResponse.json({
      success: true,
      summary: logs
    });
  } catch (err) {
    console.error("Cron execution error:", err);
    return NextResponse.json({
      success: false,
      error: err.message,
      summary: logs
    }, { status: 500 });
  }
}

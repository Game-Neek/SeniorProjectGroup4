import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { addDays, format, parseISO, differenceInDays, isWeekend, isBefore, startOfDay } from "date-fns";

export interface MicroSession {
  id: string;
  date: string; // yyyy-MM-dd
  className: string;
  focusAreaTopic: string;
  moduleId: string;
  moduleTitle: string;
  moduleType: "lesson" | "practice" | "quiz";
  durationMinutes: number;
  isCompleted: boolean;
  calendarEventId?: string;
}

interface ScheduleConfig {
  dailyMinutes: number;       // target study time per day (default 30)
  skipWeekends: boolean;      // avoid scheduling on weekends
  startDate: Date;            // when to begin scheduling
  bufferDaysBeforeExam: number; // finish material N days before first exam
}

const DEFAULT_CONFIG: ScheduleConfig = {
  dailyMinutes: 30,
  skipWeekends: true,
  startDate: new Date(),
  bufferDaysBeforeExam: 3,
};

export const useMicrolearningSchedule = (className: string) => {
  const [sessions, setSessions] = useState<MicroSession[]>([]);
  const [isScheduling, setIsScheduling] = useState(false);
  const [config, setConfig] = useState<ScheduleConfig>(DEFAULT_CONFIG);
  const { toast } = useToast();

  // Load existing microlearning calendar events
  const loadSchedule = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !className) return;

    const { data: events } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("event_type", "microlearning")
      .order("event_date", { ascending: true });

    if (!events) return;

    // Parse microlearning metadata from description field
    const parsed: MicroSession[] = events
      .filter(e => {
        try {
          const meta = JSON.parse(e.description || "{}");
          return meta.className === className;
        } catch { return false; }
      })
      .map(e => {
        const meta = JSON.parse(e.description || "{}");
        return {
          id: e.id,
          date: e.event_date,
          className: meta.className,
          focusAreaTopic: meta.focusAreaTopic || "",
          moduleId: meta.moduleId || "",
          moduleTitle: e.title.replace("📚 ", "").replace("✏️ ", "").replace("📝 ", ""),
          moduleType: meta.moduleType || "lesson",
          durationMinutes: meta.durationMinutes || 15,
          isCompleted: meta.isCompleted || false,
          calendarEventId: e.id,
        };
      });

    setSessions(parsed);
  }, [className]);

  useEffect(() => { loadSchedule(); }, [loadSchedule]);

  // Generate the microlearning schedule from study plan modules
  const generateSchedule = useCallback(async (customConfig?: Partial<ScheduleConfig>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !className) return;

    setIsScheduling(true);
    const cfg = { ...config, ...customConfig };

    try {
      // 1. Fetch study plan modules (incomplete ones)
      const { data: areas } = await supabase
        .from("study_focus_areas")
        .select("id, topic, topic_order, quiz_passed, estimated_time_minutes")
        .eq("user_id", session.user.id)
        .eq("class_name", className)
        .order("topic_order", { ascending: true });

      if (!areas || areas.length === 0) {
        toast({ title: "No Study Plan", description: "Generate a study plan first to create microlearning sessions.", variant: "destructive" });
        return;
      }

      const incompleteAreas = areas.filter(a => !a.quiz_passed);
      if (incompleteAreas.length === 0) {
        toast({ title: "All Done!", description: "All topics are already mastered." });
        return;
      }

      const areaIds = incompleteAreas.map(a => a.id);
      const { data: modules } = await supabase
        .from("study_modules")
        .select("id, focus_area_id, module_type, title, is_completed, estimated_time_minutes, module_order")
        .eq("user_id", session.user.id)
        .in("focus_area_id", areaIds)
        .eq("is_completed", false)
        .order("module_order", { ascending: true });

      if (!modules || modules.length === 0) {
        toast({ title: "No Pending Modules", description: "All modules are already completed." });
        return;
      }

      // 2. Find earliest exam/test deadline for this class to set end boundary
      const { data: exams } = await supabase
        .from("calendar_events")
        .select("event_date")
        .eq("user_id", session.user.id)
        .in("event_type", ["exam", "test", "midterm", "final", "quiz"])
        .gte("event_date", format(new Date(), "yyyy-MM-dd"))
        .order("event_date", { ascending: true })
        .limit(1);

      let deadlineDate: Date | null = null;
      if (exams && exams.length > 0) {
        deadlineDate = addDays(parseISO(exams[0].event_date), -cfg.bufferDaysBeforeExam);
      }

      // 3. Segment modules into daily micro-sessions
      // Each module gets split if > dailyMinutes
      interface PendingChunk {
        focusAreaTopic: string;
        moduleId: string;
        moduleTitle: string;
        moduleType: "lesson" | "practice" | "quiz";
        durationMinutes: number;
      }

      const areaMap = new Map(incompleteAreas.map(a => [a.id, a.topic]));
      const chunks: PendingChunk[] = [];

      for (const mod of modules) {
        const duration = mod.estimated_time_minutes || 15;
        const topic = areaMap.get(mod.focus_area_id) || "General";

        if (duration <= cfg.dailyMinutes) {
          chunks.push({
            focusAreaTopic: topic,
            moduleId: mod.id,
            moduleTitle: mod.title,
            moduleType: mod.module_type as "lesson" | "practice" | "quiz",
            durationMinutes: duration,
          });
        } else {
          // Split large modules into sub-sessions
          const parts = Math.ceil(duration / cfg.dailyMinutes);
          const partDuration = Math.ceil(duration / parts);
          for (let p = 0; p < parts; p++) {
            chunks.push({
              focusAreaTopic: topic,
              moduleId: mod.id,
              moduleTitle: `${mod.title} (Part ${p + 1}/${parts})`,
              moduleType: mod.module_type as "lesson" | "practice" | "quiz",
              durationMinutes: Math.min(partDuration, cfg.dailyMinutes),
            });
          }
        }
      }

      // 4. Assign chunks to calendar days
      let currentDate = startOfDay(cfg.startDate);
      let dailyBudget = cfg.dailyMinutes;
      const scheduled: Array<PendingChunk & { date: string }> = [];

      for (const chunk of chunks) {
        // Skip weekends if configured
        while (cfg.skipWeekends && isWeekend(currentDate)) {
          currentDate = addDays(currentDate, 1);
          dailyBudget = cfg.dailyMinutes;
        }

        // Check deadline
        if (deadlineDate && isBefore(deadlineDate, currentDate)) {
          // Compress: disable weekend skipping and reduce daily budget constraint
          while (isWeekend(currentDate)) {
            currentDate = addDays(currentDate, 1);
          }
        }

        if (chunk.durationMinutes > dailyBudget) {
          // Move to next day
          currentDate = addDays(currentDate, 1);
          dailyBudget = cfg.dailyMinutes;
          while (cfg.skipWeekends && isWeekend(currentDate)) {
            currentDate = addDays(currentDate, 1);
          }
        }

        scheduled.push({ ...chunk, date: format(currentDate, "yyyy-MM-dd") });
        dailyBudget -= chunk.durationMinutes;

        if (dailyBudget <= 0) {
          currentDate = addDays(currentDate, 1);
          dailyBudget = cfg.dailyMinutes;
        }
      }

      // 5. Clear old microlearning events for this class
      const { data: oldEvents } = await supabase
        .from("calendar_events")
        .select("id, description")
        .eq("user_id", session.user.id)
        .eq("event_type", "microlearning");

      if (oldEvents) {
        const toDelete = oldEvents.filter(e => {
          try {
            return JSON.parse(e.description || "{}").className === className;
          } catch { return false; }
        });
        if (toDelete.length > 0) {
          await supabase
            .from("calendar_events")
            .delete()
            .in("id", toDelete.map(e => e.id));
        }
      }

      // 6. Insert new calendar events
      const typeEmoji: Record<string, string> = { lesson: "📚", practice: "✏️", quiz: "📝" };
      const inserts = scheduled.map(s => ({
        user_id: session.user.id,
        title: `${typeEmoji[s.moduleType] || "📚"} ${s.moduleTitle}`,
        description: JSON.stringify({
          className,
          focusAreaTopic: s.focusAreaTopic,
          moduleId: s.moduleId,
          moduleType: s.moduleType,
          durationMinutes: s.durationMinutes,
          isCompleted: false,
        }),
        event_date: s.date,
        event_type: "microlearning",
        start_time: null,
        end_time: null,
      }));

      // Insert in batches of 50
      for (let i = 0; i < inserts.length; i += 50) {
        await supabase.from("calendar_events").insert(inserts.slice(i, i + 50));
      }

      await loadSchedule();

      const totalDays = scheduled.length > 0
        ? differenceInDays(parseISO(scheduled[scheduled.length - 1].date), parseISO(scheduled[0].date)) + 1
        : 0;

      toast({
        title: "Microlearning Scheduled! 🎯",
        description: `${scheduled.length} sessions across ${totalDays} days (${cfg.dailyMinutes} min/day)`,
      });
    } catch (error) {
      console.error("Microlearning schedule error:", error);
      toast({ title: "Scheduling Failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsScheduling(false);
    }
  }, [className, config, loadSchedule, toast]);

  // Mark a session as completed
  const completeSession = useCallback(async (sessionId: string) => {
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession) return;

    // Update the calendar event description
    const target = sessions.find(s => s.id === sessionId);
    if (!target) return;

    const updatedMeta = JSON.stringify({
      className,
      focusAreaTopic: target.focusAreaTopic,
      moduleId: target.moduleId,
      moduleType: target.moduleType,
      durationMinutes: target.durationMinutes,
      isCompleted: true,
    });

    await supabase
      .from("calendar_events")
      .update({ description: updatedMeta })
      .eq("id", sessionId);

    await loadSchedule();
  }, [className, sessions, loadSchedule]);

  // Clear all microlearning events for this class
  const clearSchedule = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const ids = sessions.map(s => s.id);
    if (ids.length > 0) {
      await supabase.from("calendar_events").delete().in("id", ids);
    }
    setSessions([]);
    toast({ title: "Schedule Cleared", description: "Microlearning sessions removed from calendar." });
  }, [sessions, toast]);

  // Stats
  const totalSessions = sessions.length;
  const completedSessions = sessions.filter(s => s.isCompleted).length;
  const totalMinutes = sessions.reduce((s, c) => s + c.durationMinutes, 0);
  const remainingMinutes = sessions.filter(s => !s.isCompleted).reduce((s, c) => s + c.durationMinutes, 0);
  const todaySessions = sessions.filter(s => s.date === format(new Date(), "yyyy-MM-dd"));
  const upcomingSessions = sessions.filter(s => s.date >= format(new Date(), "yyyy-MM-dd") && !s.isCompleted);

  return {
    sessions,
    todaySessions,
    upcomingSessions,
    isScheduling,
    config,
    setConfig,
    generateSchedule,
    completeSession,
    clearSchedule,
    loadSchedule,
    totalSessions,
    completedSessions,
    totalMinutes,
    remainingMinutes,
  };
};

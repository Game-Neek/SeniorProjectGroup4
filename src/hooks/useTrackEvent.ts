import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LearningEventType =
  | "quiz_attempt"
  | "quiz_completed"
  | "exercise_completed"
  | "module_started"
  | "module_completed"
  | "lesson_step_viewed"
  | "practice_submitted"
  | "placement_quiz_completed"
  | "confidence_rated";

interface TrackEventParams {
  eventType: LearningEventType;
  className: string;
  topic?: string;
  bloomLevel?: string;
  outcome?: string;
  score?: number;
  total?: number;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

export const useTrackEvent = () => {
  const track = useCallback(async (params: TrackEventParams) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await (supabase.from("learning_events") as any).insert({
        user_id: session.user.id,
        class_name: params.className,
        event_type: params.eventType,
        topic: params.topic || null,
        bloom_level: params.bloomLevel || null,
        outcome: params.outcome || null,
        score: params.score ?? null,
        total: params.total ?? null,
        latency_ms: params.latencyMs ?? null,
        metadata: params.metadata || {},
      });
    } catch (err) {
      console.error("Failed to track event:", err);
    }
  }, []);

  const snapshotWeek = useCallback(async (className: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const now = new Date();
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(now.setDate(diff));
      weekStart.setHours(0, 0, 0, 0);
      const weekStartStr = weekStart.toISOString().split("T")[0];

      // Gather this week's data
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const { data: events } = await (supabase.from("learning_events") as any)
        .select("*")
        .eq("user_id", session.user.id)
        .eq("class_name", className)
        .gte("created_at", weekStart.toISOString())
        .lt("created_at", weekEnd.toISOString());

      if (!events || events.length === 0) return;

      const quizEvents = events.filter((e: any) => e.event_type === "quiz_attempt" || e.event_type === "quiz_completed");
      const exerciseEvents = events.filter((e: any) => e.event_type === "exercise_completed");
      const moduleEvents = events.filter((e: any) => e.event_type === "module_completed");

      const scores = quizEvents.filter((e: any) => e.score != null && e.total != null && e.total > 0);
      const avgScore = scores.length > 0
        ? Math.round(scores.reduce((a: number, e: any) => a + (e.score / e.total) * 100, 0) / scores.length)
        : 0;

      const topics = new Set<string>();
      const bloomLevels: Record<string, number> = {};
      events.forEach((e: any) => {
        if (e.topic) topics.add(e.topic);
        if (e.bloom_level) {
          bloomLevels[e.bloom_level] = (bloomLevels[e.bloom_level] || 0) + 1;
        }
      });

      // Upsert snapshot
      await (supabase.from("weekly_performance_snapshots") as any).upsert({
        user_id: session.user.id,
        class_name: className,
        week_start: weekStartStr,
        quizzes_taken: quizEvents.length,
        avg_score: avgScore,
        exercises_completed: exerciseEvents.length,
        modules_completed: moduleEvents.length,
        topics_studied: Array.from(topics),
        bloom_levels_reached: bloomLevels,
        mastery_pct: avgScore,
      }, { onConflict: "user_id,class_name,week_start" });
    } catch (err) {
      console.error("Failed to snapshot week:", err);
    }
  }, []);

  return { track, snapshotWeek };
};

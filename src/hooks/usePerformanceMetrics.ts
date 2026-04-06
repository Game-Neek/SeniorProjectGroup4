import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths, format } from "date-fns";

export interface PerformanceMetrics {
  totalEvents: number;
  quizzesTaken: number;
  avgQuizScore: number;
  exercisesCompleted: number;
  modulesCompleted: number;
  topicsStudied: string[];
  avgLatencyMs: number;
  taskCompletionRate: number;
  bloomDistribution: Record<string, number>;
  scoresByTopic: Record<string, { avg: number; count: number }>;
  dailyActivity: { date: string; count: number }[];
  improvementTrend: number; // % change vs previous period
}

export type ReportGranularity = "weekly" | "monthly" | "semester";

const emptyMetrics: PerformanceMetrics = {
  totalEvents: 0,
  quizzesTaken: 0,
  avgQuizScore: 0,
  exercisesCompleted: 0,
  modulesCompleted: 0,
  topicsStudied: [],
  avgLatencyMs: 0,
  taskCompletionRate: 0,
  bloomDistribution: {},
  scoresByTopic: {},
  dailyActivity: [],
  improvementTrend: 0,
};

export const usePerformanceMetrics = (className: string) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>(emptyMetrics);
  const [previousMetrics, setPreviousMetrics] = useState<PerformanceMetrics>(emptyMetrics);
  const [loading, setLoading] = useState(false);
  const [granularity, setGranularity] = useState<ReportGranularity>("weekly");

  const getPeriodRange = useCallback((gran: ReportGranularity, offset = 0) => {
    const now = new Date();
    if (gran === "weekly") {
      const base = offset ? subWeeks(now, offset) : now;
      return { start: startOfWeek(base, { weekStartsOn: 1 }), end: endOfWeek(base, { weekStartsOn: 1 }) };
    }
    if (gran === "monthly") {
      const base = offset ? subMonths(now, offset) : now;
      return { start: startOfMonth(base), end: endOfMonth(base) };
    }
    // semester: ~16 weeks back
    const semesterWeeks = offset ? 32 : 16;
    const start = subWeeks(now, semesterWeeks);
    const end = offset ? subWeeks(now, 16) : now;
    return { start, end };
  }, []);

  const computeMetrics = useCallback((events: any[]): PerformanceMetrics => {
    if (!events.length) return emptyMetrics;

    const quizEvents = events.filter(e => e.event_type === "quiz_attempt" || e.event_type === "quiz_completed");
    const exerciseEvents = events.filter(e => e.event_type === "exercise_completed");
    const moduleEvents = events.filter(e => e.event_type === "module_completed");

    const scores = quizEvents.filter(e => e.score != null && e.total != null && e.total > 0);
    const avgQuizScore = scores.length
      ? Math.round(scores.reduce((a: number, e: any) => a + (e.score / e.total) * 100, 0) / scores.length)
      : 0;

    const latencies = events.filter(e => e.latency_ms != null);
    const avgLatencyMs = latencies.length
      ? Math.round(latencies.reduce((a: number, e: any) => a + e.latency_ms, 0) / latencies.length)
      : 0;

    const completedEvents = events.filter(e =>
      e.event_type?.includes("completed") || e.outcome === "correct" || e.outcome === "pass"
    );
    const taskCompletionRate = events.length > 0
      ? Math.round((completedEvents.length / events.length) * 100)
      : 0;

    const topics = new Set<string>();
    const bloomDistribution: Record<string, number> = {};
    const topicScores: Record<string, { total: number; count: number }> = {};
    const dailyMap: Record<string, number> = {};

    events.forEach((e: any) => {
      if (e.topic) {
        topics.add(e.topic);
        if (e.score != null && e.total != null && e.total > 0) {
          if (!topicScores[e.topic]) topicScores[e.topic] = { total: 0, count: 0 };
          topicScores[e.topic].total += (e.score / e.total) * 100;
          topicScores[e.topic].count += 1;
        }
      }
      if (e.bloom_level) {
        bloomDistribution[e.bloom_level] = (bloomDistribution[e.bloom_level] || 0) + 1;
      }
      const day = e.created_at?.split("T")[0];
      if (day) dailyMap[day] = (dailyMap[day] || 0) + 1;
    });

    const scoresByTopic: Record<string, { avg: number; count: number }> = {};
    Object.entries(topicScores).forEach(([topic, data]) => {
      scoresByTopic[topic] = { avg: Math.round(data.total / data.count), count: data.count };
    });

    const dailyActivity = Object.entries(dailyMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalEvents: events.length,
      quizzesTaken: quizEvents.length,
      avgQuizScore,
      exercisesCompleted: exerciseEvents.length,
      modulesCompleted: moduleEvents.length,
      topicsStudied: Array.from(topics),
      avgLatencyMs,
      taskCompletionRate,
      bloomDistribution,
      scoresByTopic,
      dailyActivity,
      improvementTrend: 0,
    };
  }, []);

  const loadMetrics = useCallback(async (gran?: ReportGranularity) => {
    const g = gran || granularity;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const current = getPeriodRange(g, 0);
      const previous = getPeriodRange(g, 1);

      const [currentRes, previousRes] = await Promise.all([
        (supabase.from("learning_events") as any)
          .select("*")
          .eq("user_id", session.user.id)
          .eq("class_name", className)
          .gte("created_at", current.start.toISOString())
          .lte("created_at", current.end.toISOString()),
        (supabase.from("learning_events") as any)
          .select("*")
          .eq("user_id", session.user.id)
          .eq("class_name", className)
          .gte("created_at", previous.start.toISOString())
          .lte("created_at", previous.end.toISOString()),
      ]);

      const currentMetrics = computeMetrics(currentRes.data || []);
      const prevMetrics = computeMetrics(previousRes.data || []);

      // Calculate improvement trend based on avg quiz score
      const trend = prevMetrics.avgQuizScore > 0
        ? Math.round(((currentMetrics.avgQuizScore - prevMetrics.avgQuizScore) / prevMetrics.avgQuizScore) * 100)
        : 0;

      currentMetrics.improvementTrend = trend;
      setMetrics(currentMetrics);
      setPreviousMetrics(prevMetrics);

      // Persist report
      await (supabase.from("performance_reports") as any).insert({
        user_id: session.user.id,
        class_name: className,
        report_type: g,
        period_start: format(current.start, "yyyy-MM-dd"),
        period_end: format(current.end, "yyyy-MM-dd"),
        metrics: currentMetrics,
        summary: `${currentMetrics.quizzesTaken} quizzes, ${currentMetrics.avgQuizScore}% avg, ${currentMetrics.exercisesCompleted} exercises`,
      });
    } catch (err) {
      console.error("Failed to load performance metrics:", err);
    } finally {
      setLoading(false);
    }
  }, [className, granularity, getPeriodRange, computeMetrics]);

  return {
    metrics,
    previousMetrics,
    loading,
    granularity,
    setGranularity,
    loadMetrics,
  };
};

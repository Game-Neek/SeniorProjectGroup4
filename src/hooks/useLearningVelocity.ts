import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { subDays, format, parseISO } from "date-fns";

export interface VelocityData {
  /** Events per day for last 14 days */
  dailyVelocity: { date: string; count: number }[];
  /** Rolling 7-day avg */
  currentVelocity: number;
  /** Previous 7-day avg */
  previousVelocity: number;
  /** % change */
  velocityTrend: number;
  /** Days since last activity (null if today) */
  daysSinceActivity: number | null;
  /** Engagement status */
  engagementStatus: "active" | "slowing" | "at_risk" | "disengaged";
  /** Avg score last 7 days */
  recentAvgScore: number;
  /** Avg score prior 7 days */
  priorAvgScore: number;
  /** Score trend */
  scoreTrend: number;
  /** Stalled knowledge gaps count */
  stalledGaps: number;
  /** Per-class breakdown */
  classSummaries: ClassVelocitySummary[];
}

export interface ClassVelocitySummary {
  className: string;
  eventsLast7: number;
  eventsPrior7: number;
  velocityChange: number;
  lastActivityDate: string | null;
  avgScore: number;
}

const emptyData: VelocityData = {
  dailyVelocity: [],
  currentVelocity: 0,
  previousVelocity: 0,
  velocityTrend: 0,
  daysSinceActivity: null,
  engagementStatus: "active",
  recentAvgScore: 0,
  priorAvgScore: 0,
  scoreTrend: 0,
  stalledGaps: 0,
  classSummaries: [],
};

function getEngagementStatus(
  velocity: number,
  prevVelocity: number,
  daysSince: number | null,
): VelocityData["engagementStatus"] {
  if (daysSince !== null && daysSince >= 5) return "disengaged";
  if (daysSince !== null && daysSince >= 3) return "at_risk";
  if (prevVelocity > 0.5 && velocity < prevVelocity * 0.6) return "slowing";
  return "active";
}

export const useLearningVelocity = () => {
  const [data, setData] = useState<VelocityData>(emptyData);
  const [loading, setLoading] = useState(false);

  const loadVelocity = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const now = new Date();
      const day14Ago = subDays(now, 14).toISOString();
      const day7Ago = subDays(now, 7).toISOString();
      const day5Ago = subDays(now, 5).toISOString();

      // Fetch events
      const { data: events } = await supabase
        .from("learning_events")
        .select("created_at, event_type, class_name, topic, score, total")
        .eq("user_id", session.user.id)
        .gte("created_at", day14Ago)
        .order("created_at", { ascending: true })
        .limit(1000);

      if (!events || events.length === 0) {
        setData({ ...emptyData, engagementStatus: "disengaged", daysSinceActivity: null });
        setLoading(false);
        return;
      }

      // Daily velocity
      const dailyMap: Record<string, number> = {};
      for (let i = 13; i >= 0; i--) {
        dailyMap[format(subDays(now, i), "yyyy-MM-dd")] = 0;
      }
      for (const e of events) {
        const d = (e.created_at as string).split("T")[0];
        if (d in dailyMap) dailyMap[d]++;
      }
      const dailyVelocity = Object.entries(dailyMap).map(([date, count]) => ({
        date,
        count,
      }));

      // Split events
      const recent7 = events.filter((e) => e.created_at >= day7Ago);
      const prior7 = events.filter(
        (e) => e.created_at < day7Ago && e.created_at >= day14Ago
      );

      const currentVelocity = +(recent7.length / 7).toFixed(1);
      const previousVelocity = +(prior7.length / 7).toFixed(1);
      const velocityTrend =
        previousVelocity > 0
          ? Math.round(
              ((currentVelocity - previousVelocity) / previousVelocity) * 100
            )
          : 0;

      // Days since last activity
      const lastEvent = events[events.length - 1];
      const lastDate = lastEvent ? new Date(lastEvent.created_at as string) : null;
      const todayStr = format(now, "yyyy-MM-dd");
      const lastDateStr = lastDate ? format(lastDate, "yyyy-MM-dd") : null;
      const daysSinceActivity =
        lastDateStr === todayStr
          ? null
          : lastDate
          ? Math.floor((now.getTime() - lastDate.getTime()) / 86_400_000)
          : null;

      // Scores
      const scoredRecent = recent7.filter(
        (e) => e.score != null && e.total != null && (e.total as number) > 0
      );
      const scoredPrior = prior7.filter(
        (e) => e.score != null && e.total != null && (e.total as number) > 0
      );
      const recentAvgScore = scoredRecent.length
        ? Math.round(
            scoredRecent.reduce(
              (s, e) => s + ((e.score as number) / (e.total as number)) * 100,
              0
            ) / scoredRecent.length
          )
        : 0;
      const priorAvgScore = scoredPrior.length
        ? Math.round(
            scoredPrior.reduce(
              (s, e) => s + ((e.score as number) / (e.total as number)) * 100,
              0
            ) / scoredPrior.length
          )
        : 0;
      const scoreTrend = priorAvgScore > 0
        ? recentAvgScore - priorAvgScore
        : 0;

      // Stalled gaps
      const { data: mastery } = await supabase
        .from("knowledge_mastery")
        .select("mastery_score, last_practiced_at")
        .eq("user_id", session.user.id)
        .lt("mastery_score", 50);

      const stalledGaps = (mastery || []).filter(
        (m) => !m.last_practiced_at || m.last_practiced_at < day5Ago
      ).length;

      // Per-class breakdown
      const classMap = new Map<string, { recent: any[]; prior: any[] }>();
      for (const e of events) {
        const cn = e.class_name;
        if (!classMap.has(cn)) classMap.set(cn, { recent: [], prior: [] });
        const bucket = classMap.get(cn)!;
        if (e.created_at >= day7Ago) bucket.recent.push(e);
        else bucket.prior.push(e);
      }

      const classSummaries: ClassVelocitySummary[] = Array.from(
        classMap.entries()
      ).map(([className, { recent, prior }]) => {
        const priorV = prior.length / 7;
        const recentV = recent.length / 7;
        const scored = recent.filter(
          (e) => e.score != null && e.total != null && e.total > 0
        );
        const avg = scored.length
          ? Math.round(
              scored.reduce((s, e) => s + (e.score / e.total) * 100, 0) /
                scored.length
            )
          : 0;
        const allClassEvents = [...recent, ...prior];
        const last = allClassEvents.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];

        return {
          className,
          eventsLast7: recent.length,
          eventsPrior7: prior.length,
          velocityChange:
            priorV > 0
              ? Math.round(((recentV - priorV) / priorV) * 100)
              : 0,
          lastActivityDate: last?.created_at?.split("T")[0] || null,
          avgScore: avg,
        };
      });

      const engagementStatus = getEngagementStatus(
        currentVelocity,
        previousVelocity,
        daysSinceActivity
      );

      setData({
        dailyVelocity,
        currentVelocity,
        previousVelocity,
        velocityTrend,
        daysSinceActivity,
        engagementStatus,
        recentAvgScore,
        priorAvgScore,
        scoreTrend,
        stalledGaps,
        classSummaries,
      });
    } catch (err) {
      console.error("Failed to load learning velocity:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const triggerMonitor = useCallback(async () => {
    try {
      await supabase.functions.invoke("learning-velocity-monitor", {
        body: {},
      });
    } catch (err) {
      console.error("Failed to trigger velocity monitor:", err);
    }
  }, []);

  return { data, loading, loadVelocity, triggerMonitor };
};

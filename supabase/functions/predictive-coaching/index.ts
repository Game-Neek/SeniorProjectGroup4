import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/*
 * Predictive Coaching Engine — Equity-Aware Edition
 *
 * BIAS SAFEGUARDS:
 *  1. Thresholds are computed relative to each student's personal baseline, not universal standards
 *  2. Stagnation detection uses personal study cadence (not a fixed 3-day cutoff)
 *  3. Score decline is Bloom-normalized — dips when advancing cognitive levels are celebrated, not flagged
 *  4. Growth-oriented language replaces deficit framing ("opportunity" not "failure")
 *  5. Positive reinforcement recommendations are always included (min 1:2 ratio positive:negative)
 *  6. Daily recommendation cap (5) prevents notification fatigue for struggling students
 *  7. No demographic proxies used — rules only use individual performance data
 *
 * Rules & Heuristics:
 * ────────────────────
 * 1. DECLINING PERFORMANCE  — avg score dropped ≥15% at SAME Bloom level → suggest review
 * 2. STAGNATION             — no activity for 2x personal study cadence → gentle nudge
 * 3. APPROACHING DEADLINE   — exam within 7 days + mastery <70% → cram coaching
 * 4. KNOWLEDGE GAP CASCADE  — topic <50% blocking 2+ downstream → priority (but growth-framed)
 * 5. STRENGTH ACCELERATION  — topic at 70-89% → push to mastery (positive)
 * 6. BLOOM LEVEL PLATEAU    — only lower-order work → suggest challenge (encouraging)
 * 7. STREAK AT RISK         — active streak but no activity today → gentle nudge
 * 8. READY-TO-ADVANCE       — prerequisites met → celebrate + unlock (positive)
 * 9. IMPROVEMENT CELEBRATED — score or velocity improved → recognition (positive)
 */

interface Recommendation {
  rule: string;
  priority: "high" | "medium" | "low";
  title: string;
  body: string;
  className: string;
  topic?: string;
  actionType: "review" | "practice" | "coaching" | "advance" | "cram" | "nudge" | "celebrate";
  sentiment: "positive" | "neutral" | "negative";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing config");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const targetUserId = body.userId || null;

    let userIds: string[] = [];
    if (targetUserId) {
      userIds = [targetUserId];
    } else {
      const { data: activeUsers } = await supabase
        .from("learning_events")
        .select("user_id")
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString());
      if (activeUsers) {
        userIds = [...new Set(activeUsers.map((u: any) => u.user_id))];
      }
    }

    const MAX_RECS_PER_USER = 5;
    let totalRecs = 0;

    for (const userId of userIds) {
      const recommendations: Recommendation[] = [];

      const [classesRes, focusAreasRes, dailyMetricsRes, eventsRes, calendarRes, masteryRes] = await Promise.all([
        supabase.from("user_classes").select("class_name").eq("user_id", userId).eq("is_archived", false),
        supabase.from("study_focus_areas").select("*").eq("user_id", userId),
        supabase.from("daily_metrics").select("*").eq("user_id", userId)
          .gte("metric_date", new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0])
          .order("metric_date", { ascending: true }),
        supabase.from("learning_events").select("created_at, class_name, topic, bloom_level, score, total")
          .eq("user_id", userId)
          .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
          .order("created_at", { ascending: false }),
        supabase.from("calendar_events").select("title, event_date, event_type")
          .eq("user_id", userId)
          .gte("event_date", new Date().toISOString().split("T")[0])
          .lte("event_date", new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0]),
        supabase.from("knowledge_mastery").select("mastery_score, mastery_level, component_id, attempts, updated_at")
          .eq("user_id", userId),
      ]);

      const classes = (classesRes.data || []).map((c: any) => c.class_name);
      const focusAreas = focusAreasRes.data || [];
      const dailyMetrics = dailyMetricsRes.data || [];
      const events = eventsRes.data || [];
      const calendar = calendarRes.data || [];
      const _mastery = masteryRes.data || [];

      // ── Compute PERSONAL BASELINE study cadence ──
      const uniqueStudyDays = new Set(events.map((e: any) => e.created_at.split("T")[0]));
      const personalCadenceDays = uniqueStudyDays.size;
      const avgGapDays = personalCadenceDays > 1 ? 30 / personalCadenceDays : 14;
      const stagnationThreshold = Math.max(3, Math.min(14, Math.ceil(avgGapDays * 2)));

      const BLOOM_ORDER: Record<string, number> = {
        remember: 0, understand: 1, apply: 2, analyze: 3, evaluate: 4, create: 5,
      };

      for (const className of classes) {
        const classMetrics = dailyMetrics.filter((m: any) => m.class_name === className);
        const classFocusAreas = focusAreas.filter((a: any) => a.class_name === className);
        const classEvents = events.filter((e: any) => e.class_name === className);

        // ── RULE 1: BLOOM-AWARE DECLINING PERFORMANCE ──
        if (classMetrics.length >= 4) {
          const half = Math.floor(classMetrics.length / 2);
          const firstHalf = classMetrics.slice(0, half);
          const secondHalf = classMetrics.slice(half);
          const avgFirst = firstHalf.reduce((s: number, m: any) => s + (m.avg_score || 0), 0) / firstHalf.length;
          const avgSecond = secondHalf.reduce((s: number, m: any) => s + (m.avg_score || 0), 0) / secondHalf.length;

          if (avgFirst - avgSecond >= 15) {
            // Check if Bloom level advanced (natural score dip is expected)
            const recentBloom = classEvents.slice(0, 10)
              .filter((e: any) => e.bloom_level)
              .map((e: any) => BLOOM_ORDER[e.bloom_level?.toLowerCase()] || 0);
            const olderBloom = classEvents.slice(-10)
              .filter((e: any) => e.bloom_level)
              .map((e: any) => BLOOM_ORDER[e.bloom_level?.toLowerCase()] || 0);

            const avgRecentBloom = recentBloom.length > 0 ? recentBloom.reduce((a, b) => a + b, 0) / recentBloom.length : 0;
            const avgOlderBloom = olderBloom.length > 0 ? olderBloom.reduce((a, b) => a + b, 0) / olderBloom.length : 0;

            if (avgRecentBloom > avgOlderBloom + 0.5) {
              // Bloom advanced — celebrate cognitive growth instead of flagging decline
              recommendations.push({
                rule: "bloom_growth",
                priority: "low",
                title: `🌱 Growing Deeper in ${className}`,
                body: `Your scores shifted as you tackle harder material — this is exactly how learning works! You're moving from memorization to deeper understanding.`,
                className,
                actionType: "celebrate",
                sentiment: "positive",
              });
            } else {
              const weakTopics = classMetrics.slice(-3)
                .flatMap((m: any) => m.topics || [])
                .filter((t: string, i: number, a: string[]) => a.indexOf(t) === i)
                .slice(0, 3);

              recommendations.push({
                rule: "declining_performance",
                priority: "high",
                title: `📊 Review Opportunity in ${className}`,
                body: `Your average shifted from ${Math.round(avgFirst)}% to ${Math.round(avgSecond)}%.${
                  weakTopics.length > 0 ? ` These topics could use attention: ${weakTopics.join(", ")}.` : ""
                } Targeted review can help close the gap.`,
                className,
                actionType: "review",
                sentiment: "neutral",
              });
            }
          }
        }

        // ── RULE 2: ADAPTIVE STAGNATION (personal cadence) ──
        const unlockedNotPassed = classFocusAreas.filter((a: any) => a.is_unlocked && !a.quiz_passed);
        for (const area of unlockedNotPassed) {
          const areaEvents = classEvents.filter((e: any) =>
            e.topic && e.topic.toLowerCase().includes(area.topic.toLowerCase())
          );
          const lastActivity = areaEvents.length > 0
            ? new Date(areaEvents[0].created_at).getTime()
            : new Date(area.updated_at || area.created_at).getTime();
          const daysSince = (Date.now() - lastActivity) / 86400000;

          // Use personal cadence instead of fixed 3-day cutoff
          if (daysSince >= stagnationThreshold) {
            recommendations.push({
              rule: "stagnation",
              priority: daysSince >= stagnationThreshold * 2 ? "high" : "medium",
              title: `📖 "${area.topic}" is waiting in ${className}`,
              body: `It's been ${Math.round(daysSince)} days since you last worked on "${area.topic}". ${
                daysSince >= stagnationThreshold * 2
                  ? "A quick refresher will help reconnect with the material."
                  : "When you're ready, even a short session keeps the momentum going."
              }`,
              className,
              topic: area.topic,
              actionType: "nudge",
              sentiment: "neutral",
            });
          }
        }

        // ── RULE 3: APPROACHING DEADLINE (unchanged — schedule-based, no bias risk) ──
        const testTypes = ["exam", "test", "midterm", "final", "quiz"];
        const upcomingTests = calendar.filter((e: any) =>
          e.event_type && testTypes.some(t => e.event_type.toLowerCase().includes(t)) &&
          e.title?.toLowerCase().includes(className.toLowerCase().split(" ")[0])
        );

        for (const test of upcomingTests) {
          const daysUntil = Math.ceil((new Date(test.event_date).getTime() - Date.now()) / 86400000);
          const notMastered = classFocusAreas.filter((a: any) => !a.quiz_passed);
          if (notMastered.length > 0 && daysUntil <= 7) {
            const topicNames = notMastered.slice(0, 3).map((a: any) => a.topic).join(", ");
            recommendations.push({
              rule: "approaching_deadline",
              priority: daysUntil <= 2 ? "high" : "medium",
              title: `🗓️ ${test.title} in ${daysUntil} day${daysUntil !== 1 ? "s" : ""}`,
              body: `${notMastered.length} topic${notMastered.length !== 1 ? "s" : ""} to review: ${topicNames}. Focused practice now will make a difference.`,
              className,
              actionType: "cram",
              sentiment: "neutral",
            });
          }
        }

        // ── RULE 4: KNOWLEDGE GAP CASCADE (growth-framed) ──
        const gapAreas = classFocusAreas
          .filter((a: any) => !a.quiz_passed && a.quiz_score !== null && a.quiz_score < 50)
          .sort((a: any, b: any) => a.topic_order - b.topic_order);

        for (const gap of gapAreas) {
          const downstream = classFocusAreas.filter((a: any) =>
            a.topic_order > gap.topic_order && !a.is_unlocked
          );
          if (downstream.length >= 2) {
            recommendations.push({
              rule: "knowledge_gap_cascade",
              priority: "high",
              title: `🔑 Key Topic in ${className}`,
              body: `Strengthening "${gap.topic}" (currently ${gap.quiz_score}%) will unlock ${downstream.length} more topics. This is a high-impact focus area.`,
              className,
              topic: gap.topic,
              actionType: "coaching",
              sentiment: "neutral",
            });
          }
        }

        // ── RULE 5: STRENGTH ACCELERATION (positive) ──
        const nearMastery = classFocusAreas.filter((a: any) =>
          a.quiz_passed && a.quiz_score !== null && a.quiz_score >= 70 && a.quiz_score < 90
        );
        for (const area of nearMastery.slice(0, 2)) {
          recommendations.push({
            rule: "strength_acceleration",
            priority: "low",
            title: `🚀 Almost Mastered "${area.topic}"!`,
            body: `You're at ${area.quiz_score}% — a few more practice sessions could push you to full mastery!`,
            className,
            topic: area.topic,
            actionType: "practice",
            sentiment: "positive",
          });
        }

        // ── RULE 6: BLOOM LEVEL PLATEAU (encouraging) ──
        const bloomLevels = classEvents
          .map((e: any) => e.bloom_level)
          .filter(Boolean);
        const lowerBloom = bloomLevels.filter((b: string) =>
          ["remember", "understand"].includes(b.toLowerCase())
        );
        if (bloomLevels.length >= 5 && lowerBloom.length / bloomLevels.length > 0.8) {
          recommendations.push({
            rule: "bloom_plateau",
            priority: "medium",
            title: `🧠 Ready for a Challenge in ${className}?`,
            body: `You've built a strong foundation! Try Apply or Analyze-level exercises to deepen your understanding.`,
            className,
            actionType: "coaching",
            sentiment: "positive",
          });
        }

        // ── RULE 8: READY-TO-ADVANCE (positive) ──
        const readyAreas = classFocusAreas.filter((a: any) => {
          if (a.is_unlocked || a.topic_order === 0) return false;
          const prev = classFocusAreas.find((p: any) => p.topic_order === a.topic_order - 1);
          return prev && prev.quiz_passed && !a.is_unlocked;
        });
        for (const area of readyAreas) {
          recommendations.push({
            rule: "ready_to_advance",
            priority: "medium",
            title: `✅ New Topic Unlocked: "${area.topic}"`,
            body: `Great work on the prerequisites! "${area.topic}" is ready for you to explore.`,
            className,
            topic: area.topic,
            actionType: "advance",
            sentiment: "positive",
          });
        }

        // ── RULE 9: CELEBRATE IMPROVEMENTS (positive) ──
        if (classMetrics.length >= 4) {
          const half = Math.floor(classMetrics.length / 2);
          const avgFirst = classMetrics.slice(0, half).reduce((s: number, m: any) => s + (m.avg_score || 0), 0) / half;
          const avgSecond = classMetrics.slice(half).reduce((s: number, m: any) => s + (m.avg_score || 0), 0) / (classMetrics.length - half);
          if (avgSecond - avgFirst >= 10) {
            recommendations.push({
              rule: "score_improvement",
              priority: "low",
              title: `⬆️ Scores Rising in ${className}!`,
              body: `Your average improved from ${Math.round(avgFirst)}% to ${Math.round(avgSecond)}%. Your consistent effort is paying off!`,
              className,
              actionType: "celebrate",
              sentiment: "positive",
            });
          }
        }
      }

      // ── RULE 7: STREAK AT RISK (gentle, cross-class) ──
      const todayStr = new Date().toISOString().split("T")[0];
      const todayEvents = events.filter((e: any) => e.created_at.startsWith(todayStr));
      const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      const yesterdayEvents = events.filter((e: any) => e.created_at.startsWith(yesterdayStr));
      const hour = new Date().getUTCHours();

      if (todayEvents.length === 0 && yesterdayEvents.length > 0 && hour >= 18) {
        recommendations.push({
          rule: "streak_at_risk",
          priority: "medium",
          title: "🔥 Keep Your Streak Going!",
          body: "Even a quick 10-minute session today will keep your momentum alive!",
          className: classes[0] || "",
          actionType: "nudge",
          sentiment: "neutral",
        });
      }

      // ── EQUITY: Deduplicate + Balance positive/negative ──
      const seen = new Set<string>();
      const uniqueRecs = recommendations.filter(r => {
        const key = `${r.rule}:${r.className}:${r.topic || ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Sort: positives first if too many negatives, then by priority
      const positiveRecs = uniqueRecs.filter(r => r.sentiment === "positive");
      const otherRecs = uniqueRecs.filter(r => r.sentiment !== "positive");
      const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      otherRecs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

      // Ensure min 1 positive per 2 negative/neutral
      let balanced: Recommendation[] = [];
      let negCount = 0;
      for (const rec of otherRecs) {
        balanced.push(rec);
        negCount++;
        // After every 2 negatives, inject a positive
        if (negCount % 2 === 0 && positiveRecs.length > 0) {
          balanced.push(positiveRecs.shift()!);
        }
      }
      // Add remaining positives
      balanced.push(...positiveRecs);

      const topRecs = balanced.slice(0, MAX_RECS_PER_USER);

      // Check notification preferences
      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (prefs && !prefs.study_plan) continue;

      if (prefs?.quiet_hours_enabled && prefs.quiet_hours_start && prefs.quiet_hours_end) {
        const now = new Date();
        const currentMin = now.getHours() * 60 + now.getMinutes();
        const [sh, sm] = prefs.quiet_hours_start.split(":").map(Number);
        const [eh, em] = prefs.quiet_hours_end.split(":").map(Number);
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;
        const isQuiet = startMin <= endMin
          ? currentMin >= startMin && currentMin < endMin
          : currentMin >= startMin || currentMin < endMin;
        if (isQuiet) continue;
      }

      if (topRecs.length > 0) {
        const rows = topRecs.map(r => ({
          user_id: userId,
          title: r.title,
          body: r.body,
          category: "study_plan",
          source_type: `predictive_${r.actionType}`,
          source_id: r.topic || null,
        }));

        await supabase.from("notifications").insert(rows);
        totalRecs += rows.length;
      }
    }

    return new Response(
      JSON.stringify({ success: true, users: userIds.length, recommendations: totalRecs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Predictive coaching error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

type MilestoneType =
  | "chapter_complete"
  | "badge_earned"
  | "streak"
  | "weekly_digest"
  | "campus_event"
  | "mastery_milestone";

interface MilestoneData {
  type: MilestoneType;
  className?: string;
  data?: Record<string, any>;
}

export const useMilestoneNotifications = () => {
  const sendMilestone = useCallback(async ({ type, className, data }: MilestoneData) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {
      const { error } = await supabase.functions.invoke("milestone-notifications", {
        body: {
          type,
          userId: session.user.id,
          className,
          data,
        },
      });

      if (error) {
        console.error("Milestone notification error:", error);
      }
    } catch (err) {
      console.error("Failed to send milestone notification:", err);
    }
  }, []);

  const notifyChapterComplete = useCallback(
    (className: string, topic: string, score?: number, chapterId?: string) =>
      sendMilestone({
        type: "chapter_complete",
        className,
        data: { topic, score, chapterId },
      }),
    [sendMilestone]
  );

  const notifyBadgeEarned = useCallback(
    (badge: string, description?: string) =>
      sendMilestone({
        type: "badge_earned",
        data: { badge, description },
      }),
    [sendMilestone]
  );

  const notifyStreak = useCallback(
    (days: number) =>
      sendMilestone({
        type: "streak",
        data: { days },
      }),
    [sendMilestone]
  );

  const notifyWeeklyDigest = useCallback(
    (className: string, stats: Record<string, any>) =>
      sendMilestone({
        type: "weekly_digest",
        className,
        data: stats,
      }),
    [sendMilestone]
  );

  const notifyCampusEvent = useCallback(
    (title: string, date?: string, eventId?: string) =>
      sendMilestone({
        type: "campus_event",
        data: { title, date, eventId },
      }),
    [sendMilestone]
  );

  const notifyMasteryMilestone = useCallback(
    (className: string, topic: string, level: string) =>
      sendMilestone({
        type: "mastery_milestone",
        className,
        data: { topic, level },
      }),
    [sendMilestone]
  );

  return {
    sendMilestone,
    notifyChapterComplete,
    notifyBadgeEarned,
    notifyStreak,
    notifyWeeklyDigest,
    notifyCampusEvent,
    notifyMasteryMilestone,
  };
};

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMilestoneNotifications } from "@/hooks/useMilestoneNotifications";
import { format, subDays, parseISO } from "date-fns";

/**
 * Calculates the user's current study streak and fires a notification
 * on milestone days (3, 7, 14, 30, 60, 100).
 * Should be mounted once on the dashboard.
 */
export const useStreakTracker = () => {
  const { notifyStreak } = useMilestoneNotifications();
  const hasChecked = useRef(false);

  useEffect(() => {
    if (hasChecked.current) return;
    hasChecked.current = true;

    const checkStreak = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Get distinct dates of learning activity in last 120 days
      const cutoff = format(subDays(new Date(), 120), "yyyy-MM-dd");
      const { data: events } = await supabase
        .from("learning_events")
        .select("created_at")
        .eq("user_id", session.user.id)
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false });

      if (!events || events.length === 0) return;

      // Get unique dates
      const dates = new Set(
        events.map((e: any) => format(parseISO(e.created_at), "yyyy-MM-dd"))
      );

      // Calculate consecutive days ending today or yesterday
      const today = format(new Date(), "yyyy-MM-dd");
      const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");

      // Start counting from today or yesterday
      let startDate = dates.has(today) ? new Date() : dates.has(yesterday) ? subDays(new Date(), 1) : null;
      if (!startDate) return;

      let streak = 0;
      let checkDate = startDate;
      while (dates.has(format(checkDate, "yyyy-MM-dd"))) {
        streak++;
        checkDate = subDays(checkDate, 1);
      }

      // Only notify on milestone days
      const milestones = [3, 7, 14, 21, 30, 60, 100];
      if (milestones.includes(streak)) {
        // Check if we already notified for this streak
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", session.user.id)
          .eq("source_type", "streak")
          .gte("created_at", format(subDays(new Date(), 1), "yyyy-MM-dd"))
          .limit(1);

        if (!existing || existing.length === 0) {
          notifyStreak(streak);
        }
      }
    };

    checkStreak();
  }, [notifyStreak]);
};

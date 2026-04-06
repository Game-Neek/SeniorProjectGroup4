import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface NotificationPreferences {
  id: string;
  user_id: string;
  assignment_due: boolean;
  exam_reminder: boolean;
  quiz_results: boolean;
  study_plan: boolean;
  course_updates: boolean;
  system_alerts: boolean;
  channel_in_app: boolean;
  channel_email: boolean;
  channel_push: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  frequency: string;
  disabled_classes: string[];
}

const defaults: Omit<NotificationPreferences, "id" | "user_id"> = {
  assignment_due: true,
  exam_reminder: true,
  quiz_results: true,
  study_plan: true,
  course_updates: true,
  system_alerts: true,
  channel_in_app: true,
  channel_email: false,
  channel_push: false,
  quiet_hours_enabled: false,
  quiet_hours_start: "22:00:00",
  quiet_hours_end: "07:00:00",
  frequency: "realtime",
  disabled_classes: [],
};

export const useNotificationPreferences = () => {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPreferences = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data, error } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!error && data) {
      setPreferences(data as unknown as NotificationPreferences);
    } else if (!data) {
      // Create default preferences
      const { data: newData } = await supabase
        .from("notification_preferences")
        .insert({ user_id: session.user.id })
        .select()
        .single();

      if (newData) {
        setPreferences(newData as unknown as NotificationPreferences);
      }
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const updatePreference = useCallback(
    async (key: string, value: any) => {
      if (!preferences) return;

      const { error } = await supabase
        .from("notification_preferences")
        .update({ [key]: value, updated_at: new Date().toISOString() })
        .eq("id", preferences.id);

      if (!error) {
        setPreferences((prev) => (prev ? { ...prev, [key]: value } : prev));
      }
    },
    [preferences]
  );

  return { preferences, isLoading, updatePreference, refetch: fetchPreferences };
};

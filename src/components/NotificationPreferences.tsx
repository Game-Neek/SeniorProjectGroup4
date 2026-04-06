import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, Mail, Smartphone, Moon, Clock, BookOpen } from "lucide-react";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";
import { supabase } from "@/integrations/supabase/client";

const categories = [
  { key: "assignment_due", label: "Assignment Due Dates", icon: "📝", description: "Reminders for upcoming assignment deadlines" },
  { key: "exam_reminder", label: "Exam Reminders", icon: "📋", description: "Alerts for upcoming exams and tests" },
  { key: "quiz_results", label: "Quiz Results", icon: "✅", description: "Notifications when quiz results are available" },
  { key: "study_plan", label: "Study Plan Updates", icon: "📚", description: "Changes and suggestions to your study plan" },
  { key: "course_updates", label: "Course Updates", icon: "📖", description: "New content or changes to your courses" },
  { key: "system_alerts", label: "System Alerts", icon: "⚙️", description: "Important system announcements" },
];

export const NotificationPreferences = () => {
  const { preferences, isLoading, updatePreference } = useNotificationPreferences();
  const [classes, setClasses] = useState<{ id: string; class_name: string }[]>([]);

  useEffect(() => {
    const fetchClasses = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from("user_classes")
        .select("id, class_name")
        .eq("user_id", session.user.id);
      if (data) setClasses(data);
    };
    fetchClasses();
  }, []);

  if (isLoading) {
    return (
      <Card className="p-6 shadow-[var(--shadow-medium)]">
        <Skeleton className="h-6 w-48 mb-4" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (!preferences) return null;

  const toggleClass = (className: string) => {
    const current = preferences.disabled_classes || [];
    const updated = current.includes(className)
      ? current.filter((c) => c !== className)
      : [...current, className];
    updatePreference("disabled_classes", updated);
  };

  return (
    <Card className="p-6 shadow-[var(--shadow-medium)]">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10">
          <Bell className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">Notification Preferences</h2>
          <p className="text-sm text-muted-foreground">Manage how and when you receive notifications</p>
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-1 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">Categories</h3>
        {categories.map((cat) => (
          <div
            key={cat.key}
            className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">{cat.icon}</span>
              <div>
                <p className="text-sm font-medium text-foreground">{cat.label}</p>
                <p className="text-xs text-muted-foreground">{cat.description}</p>
              </div>
            </div>
            <Switch
              checked={(preferences as any)[cat.key]}
              onCheckedChange={(v) => updatePreference(cat.key, v)}
            />
          </div>
        ))}
      </div>

      <Separator className="my-4" />

      {/* Channels */}
      <div className="space-y-1 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">Delivery Channels</h3>
        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30">
          <div className="flex items-center gap-3">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">In-App Notifications</p>
              <p className="text-xs text-muted-foreground">Show in the notification bell</p>
            </div>
          </div>
          <Switch
            checked={preferences.channel_in_app}
            onCheckedChange={(v) => updatePreference("channel_in_app", v)}
          />
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30">
          <div className="flex items-center gap-3">
            <Mail className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Email Notifications</p>
              <p className="text-xs text-muted-foreground">Send to your registered email</p>
            </div>
          </div>
          <Switch
            checked={preferences.channel_email}
            onCheckedChange={(v) => updatePreference("channel_email", v)}
          />
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30">
          <div className="flex items-center gap-3">
            <Smartphone className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Push Notifications</p>
              <p className="text-xs text-muted-foreground">Browser push notifications</p>
            </div>
          </div>
          <Switch
            checked={preferences.channel_push}
            onCheckedChange={(v) => updatePreference("channel_push", v)}
          />
        </div>
      </div>

      <Separator className="my-4" />

      {/* Quiet Hours */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">Quiet Hours / Do Not Disturb</h3>
        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 mb-3">
          <div className="flex items-center gap-3">
            <Moon className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Enable Quiet Hours</p>
              <p className="text-xs text-muted-foreground">Silence notifications during set hours</p>
            </div>
          </div>
          <Switch
            checked={preferences.quiet_hours_enabled}
            onCheckedChange={(v) => updatePreference("quiet_hours_enabled", v)}
          />
        </div>
        {preferences.quiet_hours_enabled && (
          <div className="flex items-center gap-3 px-3">
            <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={preferences.quiet_hours_start?.slice(0, 5) || "22:00"}
                onChange={(e) => updatePreference("quiet_hours_start", e.target.value + ":00")}
                className="w-[120px]"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="time"
                value={preferences.quiet_hours_end?.slice(0, 5) || "07:00"}
                onChange={(e) => updatePreference("quiet_hours_end", e.target.value + ":00")}
                className="w-[120px]"
              />
            </div>
          </div>
        )}
      </div>

      <Separator className="my-4" />

      {/* Frequency */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">Notification Frequency</h3>
        <Select
          value={preferences.frequency}
          onValueChange={(v) => updatePreference("frequency", v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="realtime">Real-Time</SelectItem>
            <SelectItem value="daily">Daily Digest</SelectItem>
            <SelectItem value="weekly">Weekly Digest</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-2">
          {preferences.frequency === "realtime"
            ? "Get notified immediately as events happen"
            : preferences.frequency === "daily"
            ? "Receive a summary email once per day"
            : "Receive a summary email once per week"}
        </p>
      </div>

      <Separator className="my-4" />

      {/* Per-Class Controls */}
      {classes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Per-Class Notifications</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Disable notifications for specific classes
          </p>
          <div className="space-y-1">
            {classes.map((cls) => {
              const isDisabled = (preferences.disabled_classes || []).includes(cls.class_name);
              return (
                <div
                  key={cls.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">{cls.class_name}</p>
                  </div>
                  <Switch
                    checked={!isDisabled}
                    onCheckedChange={() => toggleClass(cls.class_name)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
};

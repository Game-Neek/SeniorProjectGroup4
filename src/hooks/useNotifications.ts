import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  category: string;
  source_type: string | null;
  source_id: string | null;
  is_read: boolean;
  created_at: string;
}

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      setNotifications(data as Notification[]);
      setUnreadCount(data.filter((n: any) => !n.is_read).length);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchNotifications();

    // Subscribe to realtime notifications
    const channel = supabase
      .channel("user-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const newNotif = payload.new as Notification;
          // Check if it belongs to current user
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session && newNotif.user_id === session.user.id) {
              setNotifications((prev) => [newNotif, ...prev]);
              setUnreadCount((prev) => prev + 1);
              toast(newNotif.title, {
                description: newNotif.body || undefined,
              });
            }
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications" },
        (payload) => {
          const updated = payload.new as Notification;
          setNotifications((prev) =>
            prev.map((n) => (n.id === updated.id ? updated : n))
          );
          // Recalc unread
          setNotifications((prev) => {
            setUnreadCount(prev.filter((n) => !n.is_read).length);
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications]);

  const markAsRead = useCallback(async (notificationId: string) => {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId);

    if (!error) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", session.user.id)
      .eq("is_read", false);

    if (!error) {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    }
  }, []);

  const deleteNotification = useCallback(async (notificationId: string) => {
    const notif = notifications.find((n) => n.id === notificationId);
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", notificationId);

    if (!error) {
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      if (notif && !notif.is_read) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    }
  }, [notifications]);

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refetch: fetchNotifications,
  };
};

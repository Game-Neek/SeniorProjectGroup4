import { useState, useRef, useEffect } from "react";
import { Bell, Check, CheckCheck, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotifications, Notification } from "@/hooks/useNotifications";
import { useNavigate } from "react-router-dom";
import { format, isToday, isYesterday, parseISO } from "date-fns";

const categoryIcons: Record<string, string> = {
  assignment_due: "📝",
  exam_reminder: "📋",
  quiz_results: "✅",
  study_plan: "📚",
  course_updates: "📖",
  system_alerts: "⚙️",
  general: "🔔",
};

const groupByDate = (notifications: Notification[]) => {
  const groups: Record<string, Notification[]> = {};
  for (const n of notifications) {
    const date = parseISO(n.created_at);
    let label: string;
    if (isToday(date)) label = "Today";
    else if (isYesterday(date)) label = "Yesterday";
    else label = format(date, "MMMM d, yyyy");

    if (!groups[label]) groups[label] = [];
    groups[label].push(n);
  }
  return groups;
};

export const NotificationBell = () => {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const grouped = groupByDate(notifications.slice(0, 20));

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="relative"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-card border border-border rounded-xl shadow-[var(--shadow-elevated)] z-[60] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="font-semibold text-foreground">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markAllAsRead}
                  className="text-xs h-7"
                >
                  <CheckCheck className="h-3 w-3 mr-1" />
                  Mark All Read
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsOpen(false);
                  navigate("/notifications");
                }}
                className="text-xs h-7"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                View All
              </Button>
            </div>
          </div>

          {/* Content */}
          <ScrollArea className="max-h-[400px]">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="w-8 h-8 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-3xl mb-2">🎉</p>
                <p className="text-sm font-medium text-foreground">You're all caught up!</p>
                <p className="text-xs text-muted-foreground mt-1">No new notifications</p>
              </div>
            ) : (
              <div>
                {Object.entries(grouped).map(([dateLabel, items]) => (
                  <div key={dateLabel}>
                    <div className="px-4 py-2 bg-muted/50">
                      <p className="text-xs font-medium text-muted-foreground">{dateLabel}</p>
                    </div>
                    {items.map((notif) => (
                      <div
                        key={notif.id}
                        className={`flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer border-b border-border/50 last:border-0 ${
                          !notif.is_read ? "bg-primary/5" : ""
                        }`}
                        onClick={() => {
                          if (!notif.is_read) markAsRead(notif.id);
                        }}
                      >
                        <span className="text-lg mt-0.5">
                          {categoryIcons[notif.category] || categoryIcons.general}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm ${
                              !notif.is_read ? "font-semibold text-foreground" : "text-foreground/80"
                            }`}
                          >
                            {notif.title}
                          </p>
                          {notif.body && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {notif.body}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {format(parseISO(notif.created_at), "h:mm a")}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {!notif.is_read && (
                            <div className="w-2 h-2 rounded-full bg-primary" />
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(notif.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
};

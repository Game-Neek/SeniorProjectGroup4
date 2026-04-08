import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Search, CheckCheck, Trash2, Bell } from "lucide-react";
import { useNotifications, Notification } from "@/hooks/useNotifications";
import { format, parseISO, isToday, isYesterday } from "date-fns";

const categoryLabels: Record<string, string> = {
  assignment_due: "Assignment Due",
  exam_reminder: "Exam Reminder",
  quiz_results: "Quiz Results",
  study_plan: "Study Plan",
  course_updates: "Course Updates",
  system_alerts: "System",
  general: "General",
};

const categoryIcons: Record<string, string> = {
  assignment_due: "📝",
  exam_reminder: "📋",
  quiz_results: "✅",
  study_plan: "📚",
  course_updates: "📖",
  system_alerts: "⚙️",
  general: "🔔",
};


const PAGE_SIZE = 15;

export default function NotificationsPage() {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [readFilter, setReadFilter] = useState("all");
  const [page, setPage] = useState(1);

  // Filter
  let filtered = notifications;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        (n.body && n.body.toLowerCase().includes(q))
    );
  }
  if (categoryFilter !== "all") {
    filtered = filtered.filter((n) => n.category === categoryFilter);
  }
  if (readFilter === "unread") {
    filtered = filtered.filter((n) => !n.is_read);
  } else if (readFilter === "read") {
    filtered = filtered.filter((n) => n.is_read);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Group by date
  const grouped: Record<string, Notification[]> = {};
  for (const n of paginated) {
    const date = parseISO(n.created_at);
    let label: string;
    if (isToday(date)) label = "Today";
    else if (isYesterday(date)) label = "Yesterday";
    else label = format(date, "MMMM d, yyyy");
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(n);
  }

  const formatTime = (dateStr: string) => {
    return format(parseISO(dateStr), "h:mm a");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                <h1 className="text-xl font-bold text-foreground">Notifications</h1>
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {unreadCount} unread
                  </Badge>
                )}
              </div>
            </div>
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={markAllAsRead}>
                <CheckCheck className="h-4 w-4 mr-1" />
                Mark All as Read
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6 max-w-3xl">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search notifications..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
          <Select
            value={categoryFilter}
            onValueChange={(v) => {
              setCategoryFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {Object.entries(categoryLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={readFilter}
            onValueChange={(v) => {
              setReadFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="read">Read</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Notifications */}
        {isLoading ? (
          <Card className="divide-y divide-border">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-3 p-4">
                <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-4xl mb-3">🎉</p>
            <p className="text-lg font-semibold text-foreground">You're all caught up!</p>
            <p className="text-sm text-muted-foreground mt-1">
              {search || categoryFilter !== "all" || readFilter !== "all"
                ? "No notifications match your filters"
                : "No notifications yet"}
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([dateLabel, items]) => (
              <div key={dateLabel}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
                  {dateLabel}
                </p>
                <Card className="divide-y divide-border overflow-hidden">
                  {items.map((notif) => (
                    <div
                      key={notif.id}
                      className={`flex items-start gap-3 p-4 hover:bg-muted/30 transition-colors ${
                        !notif.is_read ? "bg-primary/5" : ""
                      }`}
                    >
                      <span className="text-2xl mt-0.5">
                        {categoryIcons[notif.category] || categoryIcons.general}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p
                            className={`text-sm ${
                              !notif.is_read
                                ? "font-semibold text-foreground"
                                : "text-foreground/80"
                            }`}
                          >
                            {notif.title}
                          </p>
                          {!notif.is_read && (
                            <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                          )}
                        </div>
                        {notif.body && (
                          <p className="text-sm text-muted-foreground mt-1">{notif.body}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs text-muted-foreground">
                            {formatTime(notif.created_at)}
                          </span>
                          <Badge variant="outline" className="text-[10px] h-5">
                            {categoryLabels[notif.category] || notif.category}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!notif.is_read && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Mark as read"
                            onClick={() => markAsRead(notif.id)}
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title="Delete"
                          onClick={() => deleteNotification(notif.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </Card>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

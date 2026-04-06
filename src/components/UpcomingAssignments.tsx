import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { ClipboardList, AlertTriangle, Clock } from "lucide-react";
import { format, differenceInHours, parseISO } from "date-fns";

interface Assignment {
  id: string;
  assignment_title: string;
  class_name: string;
  due_date: string | null;
}

export const UpcomingAssignments = () => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUpcoming();
  }, []);

  const fetchUpcoming = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const today = new Date().toISOString().split("T")[0];

    const { data } = await supabase
      .from("assignments")
      .select("id, assignment_title, class_name, due_date")
      .gte("due_date", today)
      .order("due_date", { ascending: true })
      .limit(10);

    setAssignments(data || []);
    setLoading(false);
  };

  const getHoursUntilDue = (dueDate: string): number => {
    const now = new Date();
    const due = parseISO(dueDate);
    return differenceInHours(due, now);
  };

  const urgentAssignments = assignments.filter(
    (a) => a.due_date && getHoursUntilDue(a.due_date) <= 48 && getHoursUntilDue(a.due_date) >= 0
  );

  const upcomingAssignments = assignments.filter(
    (a) => a.due_date && getHoursUntilDue(a.due_date) > 48
  );

  if (loading) return null;

  return (
    <Card className="p-6 shadow-[var(--shadow-medium)] border-border">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-primary/10">
          <ClipboardList className="w-6 h-6 text-primary" />
        </div>
        <h3 className="text-xl font-semibold text-foreground">Upcoming Assignments</h3>
      </div>

      {/* Urgent Section */}
      {urgentAssignments.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-semibold text-destructive">Urgent — Due Within 48 Hours</span>
          </div>
          <div className="space-y-2">
            {urgentAssignments.map((a) => {
              const hoursLeft = getHoursUntilDue(a.due_date!);
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-destructive/30 bg-destructive/5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{a.assignment_title}</p>
                    <p className="text-xs text-muted-foreground">{a.class_name}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <Badge variant="destructive" className="text-xs">
                      {hoursLeft <= 0 ? "Due Today" : `${hoursLeft}h left`}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(parseISO(a.due_date!), "MMM d")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upcoming Section */}
      {upcomingAssignments.length > 0 ? (
        <div>
          {urgentAssignments.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-muted-foreground">Coming Up</span>
            </div>
          )}
          <div className="space-y-2">
            {upcomingAssignments.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{a.assignment_title}</p>
                  <p className="text-xs text-muted-foreground">{a.class_name}</p>
                </div>
                <span className="text-xs text-muted-foreground ml-3 shrink-0">
                  {format(parseISO(a.due_date!), "MMM d, yyyy")}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : urgentAssignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No upcoming assignments</p>
      ) : null}
    </Card>
  );
};

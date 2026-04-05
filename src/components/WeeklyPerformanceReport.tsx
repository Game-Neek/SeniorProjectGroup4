import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart3, TrendingUp, TrendingDown, Minus, Clock, Target, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, endOfWeek, subWeeks, format, isWithinInterval } from "date-fns";

interface WeeklyStats {
  quizzesTaken: number;
  avgScore: number;
  exercisesCompleted: number;
  modulesCompleted: number;
  topicsStudied: string[];
}

interface WeeklyPerformanceReportProps {
  className: string;
}

const emptyStats: WeeklyStats = {
  quizzesTaken: 0,
  avgScore: 0,
  exercisesCompleted: 0,
  modulesCompleted: 0,
  topicsStudied: [],
};

export const WeeklyPerformanceReport = ({ className }: WeeklyPerformanceReportProps) => {
  const [thisWeek, setThisWeek] = useState<WeeklyStats>(emptyStats);
  const [lastWeek, setLastWeek] = useState<WeeklyStats>(emptyStats);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const now = new Date();
      const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
      const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
      const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

      // Fetch practice history for last 2 weeks
      const { data: practice } = await supabase
        .from("practice_history")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("class_name", className)
        .gte("completed_at", lastWeekStart.toISOString())
        .order("completed_at", { ascending: false });

      // Fetch modules completed in last 2 weeks
      const { data: modules } = await supabase
        .from("study_modules")
        .select("completed_at, focus_area_id")
        .eq("user_id", session.user.id)
        .eq("is_completed", true)
        .gte("completed_at", lastWeekStart.toISOString());

      // Filter modules to this class
      const { data: areas } = await supabase
        .from("study_focus_areas")
        .select("id")
        .eq("user_id", session.user.id)
        .eq("class_name", className);

      const areaIds = new Set((areas || []).map(a => a.id));

      const computeStats = (
        practiceItems: typeof practice,
        moduleItems: typeof modules,
        start: Date,
        end: Date
      ): WeeklyStats => {
        const interval = { start, end };
        const weekPractice = (practiceItems || []).filter(p =>
          isWithinInterval(new Date(p.completed_at), interval)
        );
        const weekModules = (moduleItems || []).filter(m =>
          m.completed_at && areaIds.has(m.focus_area_id) &&
          isWithinInterval(new Date(m.completed_at), interval)
        );

        const quizzes = weekPractice.filter(p => p.practice_type === "mini-quiz");
        const exercises = weekPractice.filter(p => p.practice_type !== "mini-quiz");

        const scores = quizzes
          .filter(q => q.total && q.total > 0)
          .map(q => ((q.score || 0) / q.total!) * 100);

        const topics = new Set<string>();
        weekPractice.forEach(p => (p.topics_practiced || []).forEach((t: string) => topics.add(t)));

        return {
          quizzesTaken: quizzes.length,
          avgScore: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
          exercisesCompleted: exercises.reduce((acc, e) => acc + (e.score || 1), 0),
          modulesCompleted: weekModules.length,
          topicsStudied: Array.from(topics),
        };
      };

      setThisWeek(computeStats(practice || [], modules || [], thisWeekStart, thisWeekEnd));
      setLastWeek(computeStats(practice || [], modules || [], lastWeekStart, lastWeekEnd));
    } catch (err) {
      console.error("Weekly report error:", err);
    } finally {
      setLoading(false);
    }
  }, [className]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = () => load();
    window.addEventListener("syllabus-reparsed", handler);
    return () => window.removeEventListener("syllabus-reparsed", handler);
  }, [load]);

  if (loading) {
    return (
      <Card className="p-6 border-border shadow-[var(--shadow-soft)]">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-1/3" />
          <div className="h-24 bg-muted rounded" />
        </div>
      </Card>
    );
  }

  const hasActivity = thisWeek.quizzesTaken > 0 || thisWeek.exercisesCompleted > 0 || thisWeek.modulesCompleted > 0;
  const hadActivity = lastWeek.quizzesTaken > 0 || lastWeek.exercisesCompleted > 0 || lastWeek.modulesCompleted > 0;

  if (!hasActivity && !hadActivity) return null;

  const delta = (current: number, previous: number) => {
    if (previous === 0 && current === 0) return { value: 0, direction: "same" as const };
    if (previous === 0) return { value: 100, direction: "up" as const };
    const pct = Math.round(((current - previous) / previous) * 100);
    return { value: Math.abs(pct), direction: pct > 0 ? "up" as const : pct < 0 ? "down" as const : "same" as const };
  };

  const scoreDelta = delta(thisWeek.avgScore, lastWeek.avgScore);
  const quizDelta = delta(thisWeek.quizzesTaken, lastWeek.quizzesTaken);
  const moduleDelta = delta(thisWeek.modulesCompleted, lastWeek.modulesCompleted);

  const DeltaBadge = ({ d }: { d: { value: number; direction: "up" | "down" | "same" } }) => {
    if (d.direction === "same") return <Minus className="w-3 h-3 text-muted-foreground" />;
    const isUp = d.direction === "up";
    return (
      <span className={`flex items-center gap-0.5 text-xs font-medium ${isUp ? "text-green-600" : "text-destructive"}`}>
        {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {d.value}%
      </span>
    );
  };

  const weekLabel = `${format(startOfWeek(new Date(), { weekStartsOn: 1 }), "MMM d")} – ${format(endOfWeek(new Date(), { weekStartsOn: 1 }), "MMM d")}`;

  return (
    <Card className="p-6 border-border shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Weekly Performance</h3>
            <p className="text-sm text-muted-foreground">{weekLabel}</p>
          </div>
        </div>
        {hasActivity && (
          <Badge variant="outline" className="text-xs">
            {thisWeek.topicsStudied.length} topic{thisWeek.topicsStudied.length !== 1 ? "s" : ""} studied
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-muted/50">
          <div className="flex items-center justify-between mb-1">
            <Target className="w-4 h-4 text-primary" />
            <DeltaBadge d={quizDelta} />
          </div>
          <p className="text-2xl font-bold text-foreground">{thisWeek.quizzesTaken}</p>
          <p className="text-xs text-muted-foreground">Quizzes Taken</p>
        </div>

        <div className="p-4 rounded-lg bg-muted/50">
          <div className="flex items-center justify-between mb-1">
            <Zap className="w-4 h-4 text-secondary" />
            <DeltaBadge d={scoreDelta} />
          </div>
          <p className="text-2xl font-bold text-foreground">{thisWeek.avgScore}%</p>
          <p className="text-xs text-muted-foreground">Avg Score</p>
        </div>

        <div className="p-4 rounded-lg bg-muted/50">
          <div className="flex items-center justify-between mb-1">
            <Clock className="w-4 h-4 text-accent" />
          </div>
          <p className="text-2xl font-bold text-foreground">{thisWeek.exercisesCompleted}</p>
          <p className="text-xs text-muted-foreground">Exercises Done</p>
        </div>

        <div className="p-4 rounded-lg bg-muted/50">
          <div className="flex items-center justify-between mb-1">
            <BarChart3 className="w-4 h-4 text-primary" />
            <DeltaBadge d={moduleDelta} />
          </div>
          <p className="text-2xl font-bold text-foreground">{thisWeek.modulesCompleted}</p>
          <p className="text-xs text-muted-foreground">Modules Done</p>
        </div>
      </div>

      {/* Week-over-week comparison bar */}
      {hadActivity && (
        <div className="mt-5 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground mb-3">vs. Last Week</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">This week score</span>
                <span className="font-medium text-foreground">{thisWeek.avgScore}%</span>
              </div>
              <Progress value={thisWeek.avgScore} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Last week score</span>
                <span className="font-medium text-foreground">{lastWeek.avgScore}%</span>
              </div>
              <Progress value={lastWeek.avgScore} className="h-2" />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

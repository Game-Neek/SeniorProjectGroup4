import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3, TrendingUp, TrendingDown, Minus, Target, Zap, Clock,
  Brain, BookOpen, RefreshCw, Activity, Download
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePerformanceMetrics, ReportGranularity } from "@/hooks/usePerformanceMetrics";

interface PerformanceAnalyticsProps {
  className: string;
}

const bloomOrder = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"];

const TrendIcon = ({ value }: { value: number }) => {
  if (value > 0) return <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />;
  if (value < 0) return <TrendingDown className="w-4 h-4 text-destructive" />;
  return <Minus className="w-4 h-4 text-muted-foreground" />;
};

export const PerformanceAnalytics = ({ className }: PerformanceAnalyticsProps) => {
  const { metrics, previousMetrics, loading, granularity, setGranularity, loadMetrics } = usePerformanceMetrics(className);
  const { toast } = useToast();

  useEffect(() => {
    loadMetrics();
  }, [className]);

  const handleGranularityChange = (value: string) => {
    const g = value as ReportGranularity;
    setGranularity(g);
    loadMetrics(g);
  };

  const handleExportCSV = async () => {
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const typeMap = { weekly: "weekly", monthly: "daily", semester: "daily" };
      const params = new URLSearchParams({
        type: typeMap[granularity] || "daily",
        class: className,
        export: "csv",
      });

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/reports?${params}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${className}-${granularity}-report.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: "Report exported", description: "CSV downloaded successfully." });
    } catch {
      toast({ title: "Export failed", description: "Unable to export report.", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <Card className="p-6 shadow-[var(--shadow-medium)]">
        <div className="space-y-4">
          <Skeleton className="h-6 w-48" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
        </div>
      </Card>
    );
  }

  const metricCards = [
    {
      label: "Quiz Score",
      value: `${metrics.avgQuizScore}%`,
      prev: previousMetrics.avgQuizScore,
      current: metrics.avgQuizScore,
      icon: Target,
      color: "text-primary",
    },
    {
      label: "Completion Rate",
      value: `${metrics.taskCompletionRate}%`,
      prev: previousMetrics.taskCompletionRate,
      current: metrics.taskCompletionRate,
      icon: Zap,
      color: "text-green-600 dark:text-green-400",
    },
    {
      label: "Activities",
      value: `${metrics.totalEvents}`,
      prev: previousMetrics.totalEvents,
      current: metrics.totalEvents,
      icon: Activity,
      color: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "Response Time",
      value: metrics.avgLatencyMs > 0 ? `${(metrics.avgLatencyMs / 1000).toFixed(1)}s` : "—",
      prev: previousMetrics.avgLatencyMs,
      current: metrics.avgLatencyMs,
      icon: Clock,
      color: "text-amber-600 dark:text-amber-400",
      invertTrend: true,
    },
  ];

  const totalBloomEvents = Object.values(metrics.bloomDistribution).reduce((a, b) => a + b, 0);

  return (
    <Card className="p-6 shadow-[var(--shadow-medium)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Performance Analytics</h3>
            <p className="text-xs text-muted-foreground">
              {granularity === "weekly" ? "This Week" : granularity === "monthly" ? "This Month" : "This Semester"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={granularity} onValueChange={handleGranularityChange}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="semester">Semester</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => loadMetrics()} title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleExportCSV} title="Export CSV">
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {metricCards.map((card) => {
          const diff = card.current - card.prev;
          const trendVal = card.invertTrend ? -diff : diff;
          return (
            <div key={card.label} className="p-3 rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between mb-1">
                <card.icon className={`w-4 h-4 ${card.color}`} />
                <TrendIcon value={trendVal} />
              </div>
              <p className="text-xl font-bold text-foreground">{card.value}</p>
              <p className="text-xs text-muted-foreground">{card.label}</p>
            </div>
          );
        })}
      </div>

      {/* Improvement Trend */}
      {metrics.improvementTrend !== 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-border mb-5">
          <TrendIcon value={metrics.improvementTrend} />
          <span className="text-sm text-foreground">
            {metrics.improvementTrend > 0 ? "+" : ""}{metrics.improvementTrend}% score change vs. previous {granularity === "weekly" ? "week" : granularity === "monthly" ? "month" : "semester"}
          </span>
        </div>
      )}

      {/* Bloom's Taxonomy Distribution */}
      {totalBloomEvents > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4 text-muted-foreground" />
            <h4 className="text-sm font-medium text-foreground">Bloom's Taxonomy Coverage</h4>
          </div>
          <div className="space-y-2">
            {bloomOrder.map((level) => {
              const count = metrics.bloomDistribution[level] || 0;
              const pct = totalBloomEvents > 0 ? Math.round((count / totalBloomEvents) * 100) : 0;
              return (
                <div key={level} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">{level}</span>
                  <Progress value={pct} className="h-2 flex-1" />
                  <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Topics Breakdown */}
      {Object.keys(metrics.scoresByTopic).length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            <h4 className="text-sm font-medium text-foreground">Score by Topic</h4>
          </div>
          <div className="space-y-2">
            {Object.entries(metrics.scoresByTopic)
              .sort(([, a], [, b]) => b.avg - a.avg)
              .slice(0, 6)
              .map(([topic, data]) => (
                <div key={topic} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground truncate w-32 shrink-0" title={topic}>{topic}</span>
                  <Progress value={data.avg} className="h-2 flex-1" />
                  <span className="text-xs font-medium text-foreground w-10 text-right">{data.avg}%</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5">{data.count}</Badge>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Daily Activity Heatmap (simplified) */}
      {metrics.dailyActivity.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <h4 className="text-sm font-medium text-foreground">Daily Activity</h4>
          </div>
          <div className="flex gap-1 flex-wrap">
            {metrics.dailyActivity.map((day) => {
              const intensity = Math.min(day.count / 10, 1);
              return (
                <div
                  key={day.date}
                  className="w-6 h-6 rounded-sm border border-border flex items-center justify-center text-[9px] text-foreground"
                  style={{ backgroundColor: `hsl(var(--primary) / ${0.1 + intensity * 0.7})` }}
                  title={`${day.date}: ${day.count} events`}
                >
                  {day.count}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {metrics.totalEvents === 0 && (
        <div className="text-center py-6 text-muted-foreground">
          <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No activity data yet for this period.</p>
          <p className="text-xs">Complete quizzes and exercises to see your analytics.</p>
        </div>
      )}
    </Card>
  );
};

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, BarChart3, TrendingUp, TrendingDown, Minus, Target, Zap,
  Clock, Brain, Activity, Download, RefreshCw, BookOpen, AlertTriangle,
  ArrowUpDown, Filter, Info, ChevronDown, ChevronUp
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, subDays, subWeeks, subMonths, startOfWeek, endOfWeek } from "date-fns";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Area, AreaChart
} from "recharts";

interface DailyMetric {
  metric_date: string;
  class_name: string;
  events_count: number;
  quizzes_taken: number;
  avg_score: number;
  exercises_completed: number;
  modules_completed: number;
  completion_rate: number;
  avg_latency_ms: number;
  topics: string[];
  bloom_distribution: Record<string, number>;
}

interface ClassSummary {
  class_name: string;
  total_events: number;
  total_quizzes: number;
  avg_score: number;
  total_exercises: number;
  total_modules: number;
  active_days: number;
}

type DateRange = "7d" | "14d" | "30d" | "90d";
type SortKey = "class_name" | "avg_score" | "total_events" | "total_quizzes";

const TrendIcon = ({ value }: { value: number }) => {
  if (value > 0) return <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />;
  if (value < 0) return <TrendingDown className="w-4 h-4 text-destructive" />;
  return <Minus className="w-4 h-4 text-muted-foreground" />;
};

const AnalyticsPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [classes, setClasses] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetric[]>([]);
  const [classSummaries, setClassSummaries] = useState<ClassSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("avg_score");
  const [sortAsc, setSortAsc] = useState(false);
  const [drilldownClass, setDrilldownClass] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareClasses, setCompareClasses] = useState<string[]>([]);

  // Threshold alerts
  const [alertThreshold, setAlertThreshold] = useState(70);

  const getDateStart = useCallback((range: DateRange) => {
    const now = new Date();
    switch (range) {
      case "7d": return subDays(now, 7);
      case "14d": return subDays(now, 14);
      case "30d": return subMonths(now, 1);
      case "90d": return subMonths(now, 3);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }

      const startDate = format(getDateStart(dateRange), "yyyy-MM-dd");

      // Fetch classes and daily metrics in parallel
      const [classesRes, metricsRes] = await Promise.all([
        supabase.from("user_classes").select("class_name").eq("user_id", session.user.id),
        (supabase.from("daily_metrics") as any)
          .select("*")
          .eq("user_id", session.user.id)
          .gte("metric_date", startDate)
          .order("metric_date", { ascending: true }),
      ]);

      const classNames = (classesRes.data || []).map((c: any) => c.class_name);
      setClasses(classNames);

      let metrics = metricsRes.data || [];
      if (selectedClass !== "all") {
        metrics = metrics.filter((m: any) => m.class_name === selectedClass);
      }
      setDailyMetrics(metrics);

      // Compute per-class summaries
      const byClass: Record<string, any> = {};
      metrics.forEach((m: any) => {
        if (!byClass[m.class_name]) {
          byClass[m.class_name] = { events: 0, quizzes: 0, scoreSum: 0, scoreCount: 0, exercises: 0, modules: 0, days: 0 };
        }
        const c = byClass[m.class_name];
        c.events += m.events_count || 0;
        c.quizzes += m.quizzes_taken || 0;
        if (m.quizzes_taken > 0) { c.scoreSum += m.avg_score || 0; c.scoreCount++; }
        c.exercises += m.exercises_completed || 0;
        c.modules += m.modules_completed || 0;
        c.days++;
      });

      const summaries: ClassSummary[] = Object.entries(byClass).map(([name, c]: [string, any]) => ({
        class_name: name,
        total_events: c.events,
        total_quizzes: c.quizzes,
        avg_score: c.scoreCount > 0 ? Math.round(c.scoreSum / c.scoreCount) : 0,
        total_exercises: c.exercises,
        total_modules: c.modules,
        active_days: c.days,
      }));
      setClassSummaries(summaries);
    } catch (err) {
      console.error("Analytics load error:", err);
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedClass, navigate, getDateStart]);

  useEffect(() => { loadData(); }, [loadData]);

  // Aggregate KPIs
  const totalEvents = dailyMetrics.reduce((a, m) => a + m.events_count, 0);
  const totalQuizzes = dailyMetrics.reduce((a, m) => a + m.quizzes_taken, 0);
  const scoredDays = dailyMetrics.filter(m => m.quizzes_taken > 0);
  const overallAvgScore = scoredDays.length
    ? Math.round(scoredDays.reduce((a, m) => a + m.avg_score, 0) / scoredDays.length)
    : 0;
  const totalExercises = dailyMetrics.reduce((a, m) => a + m.exercises_completed, 0);
  const avgCompletion = dailyMetrics.length
    ? Math.round(dailyMetrics.reduce((a, m) => a + m.completion_rate, 0) / dailyMetrics.length)
    : 0;

  // Chart data: aggregate by date across classes
  const chartData = Object.values(
    dailyMetrics.reduce((acc: Record<string, any>, m) => {
      if (!acc[m.metric_date]) {
        acc[m.metric_date] = { date: m.metric_date, events: 0, score: 0, scoreCount: 0, exercises: 0 };
      }
      acc[m.metric_date].events += m.events_count;
      acc[m.metric_date].exercises += m.exercises_completed;
      if (m.quizzes_taken > 0) {
        acc[m.metric_date].score += m.avg_score;
        acc[m.metric_date].scoreCount++;
      }
      return acc;
    }, {})
  ).map((d: any) => ({
    date: d.date,
    events: d.events,
    score: d.scoreCount > 0 ? Math.round(d.score / d.scoreCount) : null,
    exercises: d.exercises,
  }));

  // Comparison chart data
  const comparisonData = compareMode && compareClasses.length >= 2
    ? Object.values(
        dailyMetrics
          .filter(m => compareClasses.includes(m.class_name))
          .reduce((acc: Record<string, any>, m) => {
            if (!acc[m.metric_date]) acc[m.metric_date] = { date: m.metric_date };
            acc[m.metric_date][m.class_name] = m.avg_score || 0;
            return acc;
          }, {})
      )
    : [];

  // Sorted class table
  const sortedSummaries = [...classSummaries].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (typeof aVal === "string") return sortAsc ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
    return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  // Alerts
  const alertClasses = classSummaries.filter(c => c.avg_score > 0 && c.avg_score < alertThreshold);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const handleExport = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const startDate = format(getDateStart(dateRange), "yyyy-MM-dd");
      const params = new URLSearchParams({ type: "daily", start: startDate, export: "csv" });
      if (selectedClass !== "all") params.set("class", selectedClass);

      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/reports?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics-${dateRange}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exported", description: "CSV downloaded." });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const toggleCompareClass = (cls: string) => {
    setCompareClasses(prev =>
      prev.includes(cls) ? prev.filter(c => c !== cls) : prev.length < 3 ? [...prev, cls] : prev
    );
  };

  const kpiCards = [
    { label: "Total Activities", value: totalEvents, icon: Activity, color: "text-primary" },
    { label: "Avg Quiz Score", value: `${overallAvgScore}%`, icon: Target, color: "text-green-600 dark:text-green-400" },
    { label: "Quizzes Taken", value: totalQuizzes, icon: BookOpen, color: "text-blue-600 dark:text-blue-400" },
    { label: "Exercises Done", value: totalExercises, icon: Zap, color: "text-amber-600 dark:text-amber-400" },
    { label: "Completion Rate", value: `${avgCompletion}%`, icon: TrendingUp, color: "text-primary" },
    { label: "Active Days", value: dailyMetrics.length, icon: Clock, color: "text-muted-foreground" },
  ];

  const classColors = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(210, 70%, 50%)"];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-foreground">Performance Analytics</h1>
                <p className="text-xs text-muted-foreground">Cross-course insights and reporting</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadData}>
                <RefreshCw className="w-4 h-4 mr-1" /> Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="w-4 h-4 mr-1" /> Export CSV
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={selectedClass} onValueChange={v => setSelectedClass(v)}>
              <SelectTrigger className="w-44 h-9 text-sm">
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            {(["7d", "14d", "30d", "90d"] as DateRange[]).map(r => (
              <Button key={r} variant={dateRange === r ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setDateRange(r)}>
                {r === "7d" ? "7 Days" : r === "14d" ? "2 Weeks" : r === "30d" ? "30 Days" : "90 Days"}
              </Button>
            ))}
          </div>
          <Button variant={compareMode ? "default" : "outline"} size="sm" className="h-8 text-xs ml-auto" onClick={() => setCompareMode(!compareMode)}>
            {compareMode ? "Exit Compare" : "Compare Classes"}
          </Button>
        </div>

        {/* Threshold Alerts */}
        {alertClasses.length > 0 && (
          <Card className="p-4 border-destructive/30 bg-destructive/5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">Performance Alert</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {alertClasses.map(c => c.class_name).join(", ")} — average score below {alertThreshold}% threshold.
                </p>
              </div>
              <Input
                type="number"
                value={alertThreshold}
                onChange={e => setAlertThreshold(Number(e.target.value))}
                className="w-16 h-7 text-xs ml-auto"
                min={0}
                max={100}
              />
            </div>
          </Card>
        )}

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : dailyMetrics.length === 0 ? (
          <Card className="p-12 text-center">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
            <h3 className="text-lg font-medium text-foreground mb-1">No Data Yet</h3>
            <p className="text-sm text-muted-foreground">Complete quizzes and exercises to generate analytics data.</p>
            <p className="text-xs text-muted-foreground mt-2">
              Metrics are aggregated from your daily learning activities across all courses.
            </p>
          </Card>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {kpiCards.map(card => (
                <Card key={card.label} className="p-4">
                  <card.icon className={`w-5 h-5 mb-2 ${card.color}`} />
                  <p className="text-2xl font-bold text-foreground">{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                </Card>
              ))}
            </div>

            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="classes">By Class</TabsTrigger>
                {compareMode && <TabsTrigger value="compare">Compare</TabsTrigger>}
                <TabsTrigger value="guide">Guide</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6">
                {/* Activity Time Series */}
                <Card className="p-6">
                  <h3 className="text-sm font-medium text-foreground mb-4">Daily Activity & Score Trend</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => format(new Date(v), "MMM d")} />
                      <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <Tooltip labelFormatter={v => format(new Date(v as string), "MMM d, yyyy")} />
                      <Legend />
                      <Area yAxisId="left" type="monotone" dataKey="events" name="Activities" fill="hsl(var(--primary) / 0.2)" stroke="hsl(var(--primary))" />
                      <Line yAxisId="right" type="monotone" dataKey="score" name="Avg Score %" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} connectNulls />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>

                {/* Exercises Bar Chart */}
                <Card className="p-6">
                  <h3 className="text-sm font-medium text-foreground mb-4">Daily Exercises Completed</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => format(new Date(v), "MMM d")} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip labelFormatter={v => format(new Date(v as string), "MMM d")} />
                      <Bar dataKey="exercises" name="Exercises" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </TabsContent>

              {/* Classes Tab — Drill-down */}
              <TabsContent value="classes" className="space-y-4">
                <Card className="p-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          {[
                            { key: "class_name" as SortKey, label: "Class" },
                            { key: "avg_score" as SortKey, label: "Avg Score" },
                            { key: "total_events" as SortKey, label: "Activities" },
                            { key: "total_quizzes" as SortKey, label: "Quizzes" },
                          ].map(col => (
                            <th key={col.key} className="text-left py-2 px-3 text-muted-foreground font-medium cursor-pointer hover:text-foreground" onClick={() => handleSort(col.key)}>
                              <div className="flex items-center gap-1">
                                {col.label}
                                {sortKey === col.key ? (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                              </div>
                            </th>
                          ))}
                          <th className="text-left py-2 px-3 text-muted-foreground font-medium">Exercises</th>
                          <th className="text-left py-2 px-3 text-muted-foreground font-medium">Days</th>
                          {compareMode && <th className="text-left py-2 px-3 text-muted-foreground font-medium">Compare</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedSummaries.map(cls => (
                          <tr
                            key={cls.class_name}
                            className={`border-b border-border/50 hover:bg-muted/50 cursor-pointer ${drilldownClass === cls.class_name ? "bg-primary/5" : ""}`}
                            onClick={() => setDrilldownClass(drilldownClass === cls.class_name ? null : cls.class_name)}
                          >
                            <td className="py-3 px-3 font-medium text-foreground">{cls.class_name}</td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <span className={cls.avg_score < alertThreshold && cls.avg_score > 0 ? "text-destructive font-medium" : "text-foreground"}>{cls.avg_score}%</span>
                                <Progress value={cls.avg_score} className="w-16 h-1.5" />
                              </div>
                            </td>
                            <td className="py-3 px-3 text-foreground">{cls.total_events}</td>
                            <td className="py-3 px-3 text-foreground">{cls.total_quizzes}</td>
                            <td className="py-3 px-3 text-foreground">{cls.total_exercises}</td>
                            <td className="py-3 px-3 text-muted-foreground">{cls.active_days}</td>
                            {compareMode && (
                              <td className="py-3 px-3" onClick={e => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={compareClasses.includes(cls.class_name)}
                                  onChange={() => toggleCompareClass(cls.class_name)}
                                  className="rounded"
                                />
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* Drill-down detail */}
                {drilldownClass && (
                  <Card className="p-6">
                    <h3 className="text-sm font-medium text-foreground mb-4">
                      Daily Breakdown — {drilldownClass}
                    </h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={dailyMetrics.filter(m => m.class_name === drilldownClass).map(m => ({
                        date: m.metric_date,
                        score: m.avg_score,
                        events: m.events_count,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => format(new Date(v), "MMM d")} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="score" name="Avg Score" stroke="hsl(var(--primary))" strokeWidth={2} />
                        <Line type="monotone" dataKey="events" name="Events" stroke="hsl(var(--accent))" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>

                    {/* Bloom distribution for this class */}
                    {(() => {
                      const bloomAgg: Record<string, number> = {};
                      dailyMetrics.filter(m => m.class_name === drilldownClass).forEach(m => {
                        Object.entries(m.bloom_distribution || {}).forEach(([k, v]) => {
                          bloomAgg[k] = (bloomAgg[k] || 0) + (v as number);
                        });
                      });
                      const bloomTotal = Object.values(bloomAgg).reduce((a, b) => a + b, 0);
                      if (bloomTotal === 0) return null;
                      return (
                        <div className="mt-4">
                          <h4 className="text-xs font-medium text-muted-foreground mb-2">Bloom's Taxonomy Coverage</h4>
                          <div className="space-y-1.5">
                            {["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"].map(level => {
                              const pct = bloomTotal > 0 ? Math.round(((bloomAgg[level] || 0) / bloomTotal) * 100) : 0;
                              return (
                                <div key={level} className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground w-20">{level}</span>
                                  <Progress value={pct} className="h-1.5 flex-1" />
                                  <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </Card>
                )}
              </TabsContent>

              {/* Compare Tab */}
              {compareMode && (
                <TabsContent value="compare" className="space-y-4">
                  {compareClasses.length < 2 ? (
                    <Card className="p-8 text-center">
                      <p className="text-sm text-muted-foreground">Select 2-3 classes from the "By Class" tab to compare.</p>
                    </Card>
                  ) : (
                    <Card className="p-6">
                      <h3 className="text-sm font-medium text-foreground mb-1">
                        Score Comparison: {compareClasses.join(" vs ")}
                      </h3>
                      <p className="text-xs text-muted-foreground mb-4">Daily average quiz scores side by side</p>
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={comparisonData}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => format(new Date(v), "MMM d")} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Legend />
                          {compareClasses.map((cls, i) => (
                            <Line key={cls} type="monotone" dataKey={cls} name={cls} stroke={classColors[i]} strokeWidth={2} connectNulls />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>

                      {/* Side-by-side summary */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
                        {compareClasses.map(cls => {
                          const summary = classSummaries.find(c => c.class_name === cls);
                          if (!summary) return null;
                          return (
                            <Card key={cls} className="p-3 border-border">
                              <p className="text-xs font-medium text-foreground truncate">{cls}</p>
                              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                <div className="flex justify-between"><span>Avg Score</span><span className="font-medium text-foreground">{summary.avg_score}%</span></div>
                                <div className="flex justify-between"><span>Quizzes</span><span className="font-medium text-foreground">{summary.total_quizzes}</span></div>
                                <div className="flex justify-between"><span>Exercises</span><span className="font-medium text-foreground">{summary.total_exercises}</span></div>
                                <div className="flex justify-between"><span>Active Days</span><span className="font-medium text-foreground">{summary.active_days}</span></div>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    </Card>
                  )}
                </TabsContent>
              )}

              {/* Guide Tab */}
              <TabsContent value="guide">
                <Card className="p-6 space-y-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-semibold text-foreground">How to Read Your Reports</h3>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-1">📊 KPI Cards</h4>
                    <p className="text-xs text-muted-foreground">
                      Top-level summary of your learning activity for the selected time period. "Activities" counts every tracked event (quizzes, exercises, lessons viewed). "Avg Quiz Score" is weighted by quiz attempts across all courses.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-1">📈 Activity & Score Trend</h4>
                    <p className="text-xs text-muted-foreground">
                      The area chart shows daily event volume (left axis) with a score trend line (right axis, 0-100%). Look for upward score trends as you study more consistently.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-1">📋 Class Table</h4>
                    <p className="text-xs text-muted-foreground">
                      Click any column header to sort. Click a row to drill down into that class's daily chart and Bloom's Taxonomy coverage. Red scores are below your alert threshold.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-1">⚖️ Compare Mode</h4>
                    <p className="text-xs text-muted-foreground">
                      Toggle "Compare Classes" to select 2-3 courses and see their score trends overlaid. Useful for identifying which courses need more attention.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-1">🔔 Alerts</h4>
                    <p className="text-xs text-muted-foreground">
                      A warning banner appears when any class's average score drops below your threshold (default: 70%). Adjust the threshold in the alert banner's input field.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-1">📥 Data Pipeline</h4>
                    <p className="text-xs text-muted-foreground">
                      Raw learning events are aggregated daily into precomputed metrics. Weekly snapshots provide additional rollups. All data is scoped to your account — no other users can see your metrics. Data older than one semester is automatically anonymized.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-1">📤 CSV Export</h4>
                    <p className="text-xs text-muted-foreground">
                      Click "Export CSV" to download the current view's data. Exports respect your selected filters (class, date range).
                    </p>
                  </div>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
};

export default AnalyticsPage;

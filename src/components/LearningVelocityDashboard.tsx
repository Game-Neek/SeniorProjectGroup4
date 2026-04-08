import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Activity, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Zap, Clock, Brain, ArrowRight, RefreshCw, Loader2, Minus,
} from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useLearningVelocity, type VelocityData } from "@/hooks/useLearningVelocity";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip as RechartsTooltip,
} from "recharts";
import { useNavigate } from "react-router-dom";

const statusConfig: Record<
  VelocityData["engagementStatus"],
  { label: string; color: string; bg: string; icon: typeof CheckCircle2; description: string }
> = {
  active: {
    label: "Active",
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-500/10 border-green-500/20",
    icon: CheckCircle2,
    description: "You're studying consistently — keep it up!",
  },
  slowing: {
    label: "Pace Shifting",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    icon: Clock,
    description: "Your study pace has changed. Short daily sessions can help when life gets busy.",
  },
  at_risk: {
    label: "Time to Reconnect",
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/20",
    icon: AlertTriangle,
    description: "It's been a few days — a quick review session keeps concepts fresh.",
  },
  disengaged: {
    label: "Ready to Return",
    color: "text-muted-foreground",
    bg: "bg-muted/50 border-border",
    icon: AlertTriangle,
    description: "It's been a while. Start with a small, achievable task to rebuild momentum at your own pace.",
  },
};

const TrendArrow = ({ value, suffix = "%" }: { value: number; suffix?: string }) => {
  if (value === 0)
    return (
      <span className="flex items-center text-xs text-muted-foreground gap-0.5">
        <Minus className="w-3 h-3" /> 0{suffix}
      </span>
    );
  return value > 0 ? (
    <span className="flex items-center text-xs text-green-600 gap-0.5">
      <TrendingUp className="w-3 h-3" /> +{value}{suffix}
    </span>
  ) : (
    <span className="flex items-center text-xs text-destructive gap-0.5">
      <TrendingDown className="w-3 h-3" /> {value}{suffix}
    </span>
  );
};

export const LearningVelocityDashboard = () => {
  const { data, loading, loadVelocity, triggerMonitor } = useLearningVelocity();
  const navigate = useNavigate();

  useEffect(() => {
    loadVelocity();
  }, [loadVelocity]);

  const status = statusConfig[data.engagementStatus];
  const StatusIcon = status.icon;

  // Chart data — format dates for display
  const chartData = data.dailyVelocity.map((d) => ({
    ...d,
    label: d.date.slice(5), // "MM-DD"
  }));

  const handleRefresh = async () => {
    await triggerMonitor();
    await loadVelocity();
  };

  if (loading) {
    return (
      <Card className="p-6 border-border">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 border-border space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Learning Velocity
            </h3>
            <p className="text-xs text-muted-foreground">
              Real-time engagement & pace monitoring
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="w-4 h-4 mr-1" /> Check Now
        </Button>
      </div>

      {/* Engagement status banner */}
      <div
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg border",
          status.bg
        )}
      >
        <StatusIcon className={cn("w-5 h-5 flex-shrink-0", status.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("text-sm font-semibold", status.color)}>
              {status.label}
            </span>
            {data.daysSinceActivity !== null && (
              <Badge
                variant="outline"
                className="text-[10px] h-5"
              >
                {data.daysSinceActivity}d inactive
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{status.description}</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="rounded-lg border border-border p-3 text-center space-y-1">
                <Zap className="w-4 h-4 text-primary mx-auto" />
                <p className="text-xl font-bold text-foreground">
                  {data.currentVelocity}
                </p>
                <p className="text-[10px] text-muted-foreground">Sessions/Day</p>
                <TrendArrow value={data.velocityTrend} />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Average daily study sessions over the last 7 days</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="rounded-lg border border-border p-3 text-center space-y-1">
                <Brain className="w-4 h-4 text-secondary mx-auto" />
                <p className="text-xl font-bold text-foreground">
                  {data.recentAvgScore || "—"}%
                </p>
                <p className="text-[10px] text-muted-foreground">Avg Score</p>
                <TrendArrow value={data.scoreTrend} suffix="pts" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Average quiz/practice score this week vs last</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="rounded-lg border border-border p-3 text-center space-y-1">
                <AlertTriangle
                  className={cn(
                    "w-4 h-4 mx-auto",
                    data.stalledGaps > 0 ? "text-destructive" : "text-green-600"
                  )}
                />
                <p className="text-xl font-bold text-foreground">
                  {data.stalledGaps}
                </p>
                <p className="text-[10px] text-muted-foreground">Stalled Gaps</p>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Topics below 50% mastery with no recent practice</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="rounded-lg border border-border p-3 text-center space-y-1">
                <Activity className="w-4 h-4 text-accent mx-auto" />
                <p className="text-xl font-bold text-foreground">
                  {data.dailyVelocity.reduce((s, d) => s + d.count, 0)}
                </p>
                <p className="text-[10px] text-muted-foreground">14-Day Total</p>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Total learning events in the last 14 days</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Velocity chart */}
      {chartData.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Daily Activity — Last 14 Days
          </p>
          <div className="h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="velocityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="100%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <RechartsTooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value: number) => [`${value} events`, "Activity"]}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#velocityGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Per-class breakdown */}
      {data.classSummaries.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Per-Course Breakdown
          </p>
          <div className="space-y-2">
            {data.classSummaries.map((cs) => {
              const pct = Math.min(
                100,
                cs.eventsLast7 > 0 ? Math.round((cs.eventsLast7 / Math.max(cs.eventsPrior7, cs.eventsLast7)) * 100) : 0
              );
              return (
                <div
                  key={cs.className}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() =>
                    navigate(`/course/${encodeURIComponent(cs.className)}`)
                  }
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {cs.className}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-muted-foreground">
                        {cs.eventsLast7} events
                      </span>
                      <TrendArrow value={cs.velocityChange} />
                      {cs.avgScore > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {cs.avgScore}% avg
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="w-16">
                    <Progress value={pct} className="h-1.5" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CTA for notifications */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <p className="text-[10px] text-muted-foreground">
          Alerts are sent automatically when disengagement or gaps are detected
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7"
          onClick={() => navigate("/notifications")}
        >
          View Alerts <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </div>
    </Card>
  );
};

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Lightbulb, TrendingDown, Pause, AlertTriangle, Link2,
  Rocket, Brain, Flame, ArrowRight, RefreshCw, X, ChevronDown, ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Props {
  className: string;
  onNavigateToTopic?: (topic: string) => void;
}

interface CoachingRec {
  id: string;
  title: string;
  body: string;
  actionType: string;
  priority: "high" | "medium" | "low";
  topic?: string;
  createdAt: string;
  isRead: boolean;
}

const actionConfig: Record<string, { icon: typeof Lightbulb; color: string; bg: string }> = {
  review: { icon: TrendingDown, color: "text-destructive", bg: "bg-destructive/10" },
  nudge: { icon: Pause, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
  cram: { icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" },
  coaching: { icon: Brain, color: "text-primary", bg: "bg-primary/10" },
  practice: { icon: Rocket, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" },
  advance: { icon: ArrowRight, color: "text-green-600 dark:text-green-400", bg: "bg-green-500/10" },
  streak: { icon: Flame, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10" },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  high: { label: "Urgent", color: "bg-destructive/10 text-destructive border-destructive/20" },
  medium: { label: "Suggested", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  low: { label: "Optional", color: "bg-muted text-muted-foreground border-border" },
};

export const PredictiveCoaching = ({ className, onNavigateToTopic }: Props) => {
  const [recs, setRecs] = useState<CoachingRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const loadRecs = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Fetch predictive coaching notifications
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", session.user.id)
      .like("source_type", "predictive_%")
      .order("created_at", { ascending: false })
      .limit(10);

    if (data) {
      const parsed: CoachingRec[] = data
        .filter((n: any) => {
          // Filter to this class
          return n.title?.includes(className) || n.source_id;
        })
        .map((n: any) => {
          const actionType = (n.source_type || "").replace("predictive_", "") || "coaching";
          return {
            id: n.id,
            title: n.title,
            body: n.body || "",
            actionType,
            priority: n.title?.includes("🚨") || n.title?.includes("📉") || n.title?.includes("🔗")
              ? "high" as const
              : n.title?.includes("🚀") ? "low" as const : "medium" as const,
            topic: n.source_id || undefined,
            createdAt: n.created_at,
            isRead: n.is_read,
          };
        });
      setRecs(parsed);
    }
    setLoading(false);
  }, [className]);

  useEffect(() => { loadRecs(); }, [loadRecs]);

  const triggerAnalysis = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    setGenerating(true);
    try {
      await supabase.functions.invoke("predictive-coaching", {
        body: { userId: session.user.id },
      });
      await loadRecs();
    } catch (err) {
      console.error("Predictive coaching error:", err);
    } finally {
      setGenerating(false);
    }
  };

  const dismissRec = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setRecs(prev => prev.filter(r => r.id !== id));
  };

  if (loading) {
    return (
      <Card className="p-6 border-border">
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  const unread = recs.filter(r => !r.isRead);
  const highPriority = unread.filter(r => r.priority === "high");

  return (
    <Card className={cn(
      "p-6 border-border transition-all",
      highPriority.length > 0 && "border-destructive/30 shadow-md"
    )}>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3 text-left"
        >
          <div className={cn(
            "p-2 rounded-lg",
            highPriority.length > 0 ? "bg-destructive/10" : "bg-primary/10"
          )}>
            <Lightbulb className={cn(
              "w-5 h-5",
              highPriority.length > 0 ? "text-destructive" : "text-primary"
            )} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-foreground">Smart Coaching</h3>
              {unread.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {unread.length} new
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              AI-powered suggestions based on your performance
            </p>
          </div>
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground ml-2" /> : <ChevronRight className="w-4 h-4 text-muted-foreground ml-2" />}
        </button>
        <Button
          variant="outline"
          size="sm"
          onClick={triggerAnalysis}
          disabled={generating}
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span className="ml-1">Analyze</span>
        </Button>
      </div>

      {expanded && (
        <>
          {recs.length === 0 ? (
            <div className="text-center py-6">
              <Lightbulb className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground mb-1">No coaching suggestions yet</p>
              <p className="text-xs text-muted-foreground mb-3">
                Click "Analyze" to run predictive analysis on your performance
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={triggerAnalysis}
                disabled={generating}
              >
                {generating ? "Analyzing..." : "Run Analysis"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {recs.map(rec => {
                const action = actionConfig[rec.actionType] || actionConfig.coaching;
                const Icon = action.icon;
                const prio = priorityConfig[rec.priority];

                return (
                  <div
                    key={rec.id}
                    className={cn(
                      "relative rounded-lg border p-4 transition-all",
                      rec.priority === "high" ? "border-destructive/30 bg-destructive/5" :
                      rec.priority === "medium" ? "border-amber-500/20 bg-amber-500/5" :
                      "border-border"
                    )}
                  >
                    {/* Dismiss button */}
                    <button
                      onClick={() => dismissRec(rec.id)}
                      className="absolute top-2 right-2 p-1 rounded-md hover:bg-muted transition-colors"
                    >
                      <X className="w-3 h-3 text-muted-foreground" />
                    </button>

                    <div className="flex items-start gap-3 pr-6">
                      <div className={cn("p-2 rounded-lg flex-shrink-0 mt-0.5", action.bg)}>
                        <Icon className={cn("w-4 h-4", action.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-foreground">{rec.title}</p>
                          <Badge variant="outline" className={cn("text-[10px] py-0 h-4", prio.color)}>
                            {prio.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{rec.body}</p>
                        {rec.topic && onNavigateToTopic && (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-6 px-0 mt-1 text-xs gap-1"
                            onClick={() => onNavigateToTopic(rec.topic!)}
                          >
                            Go to topic <ArrowRight className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Rule legend */}
          {recs.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-border">
              <span className="text-[10px] text-muted-foreground font-medium">Rules:</span>
              {[
                { icon: TrendingDown, label: "Declining" },
                { icon: Pause, label: "Stagnation" },
                { icon: AlertTriangle, label: "Deadline" },
                { icon: Brain, label: "Coaching" },
                { icon: Rocket, label: "Acceleration" },
                { icon: ArrowRight, label: "Advance" },
              ].map(({ icon: I, label }) => (
                <div key={label} className="flex items-center gap-1">
                  <I className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
};

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertTriangle, CheckCircle2, ShieldAlert, Loader2,
  ArrowRight, ChevronDown, ChevronRight, Zap, BookOpen,
  Link2, RefreshCw, Brain
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface KnowledgeNode {
  id: string;
  objective: string;
  parentTopic: string | null;
  bloomLevel: string | null;
  order: number;
  masteryScore: number;
  attempts: number;
}

interface PrereqGap {
  /** The chapter/topic the student is about to start */
  targetTopic: string;
  targetTopicOrder: number;
  /** Prerequisites that are weak or missing */
  missingPrereqs: {
    node: KnowledgeNode;
    severity: "critical" | "warning";
    reason: string;
  }[];
  /** Readiness score 0-100 */
  readiness: number;
}

interface DiagnosticResult {
  gaps: PrereqGap[];
  healthyTopics: number;
  totalTopics: number;
  overallReadiness: number;
}

interface PrerequisiteDiagnosticProps {
  className: string;
  onNavigateToTopic?: (focusAreaId: string) => void;
}

// ─── Engine rules ────────────────────────────────────────────────────────────

const CRITICAL_THRESHOLD = 30;  // mastery < 30% → critical
const WARNING_THRESHOLD = 60;   // mastery < 60% → warning
const READY_THRESHOLD = 60;     // need ≥60% on ALL prereqs to be "ready"
const BLOOM_ORDER = ["remember", "understand", "apply", "analyze", "evaluate", "create"];

/**
 * Diagnostic engine: for each topic group (parent_topic), checks whether
 * all preceding topic groups have sufficient mastery. Flags specific
 * knowledge components that are prerequisites and are weak/missing.
 */
function runDiagnostic(nodes: KnowledgeNode[]): DiagnosticResult {
  // Group nodes by parent_topic (preserving order)
  const topicMap = new Map<string, KnowledgeNode[]>();
  const topicOrder = new Map<string, number>();

  for (const n of nodes) {
    const key = n.parentTopic || "General";
    if (!topicMap.has(key)) {
      topicMap.set(key, []);
      topicOrder.set(key, n.order);
    }
    topicMap.get(key)!.push(n);
  }

  // Sort topics by their earliest component_order
  const sortedTopics = [...topicMap.entries()].sort(
    (a, b) => (topicOrder.get(a[0]) ?? 0) - (topicOrder.get(b[0]) ?? 0)
  );

  const gaps: PrereqGap[] = [];

  for (let i = 1; i < sortedTopics.length; i++) {
    const [targetTopic, targetNodes] = sortedTopics[i];
    const targetAvg = avg(targetNodes.map(n => n.masteryScore));

    // Skip topics the student has already mastered
    if (targetAvg >= 80) continue;

    // All preceding topics are considered prerequisites
    const missingPrereqs: PrereqGap["missingPrereqs"] = [];

    for (let j = 0; j < i; j++) {
      const [, prereqNodes] = sortedTopics[j];
      for (const node of prereqNodes) {
        if (node.masteryScore < CRITICAL_THRESHOLD) {
          missingPrereqs.push({
            node,
            severity: "critical",
            reason: node.attempts === 0
              ? "Never practiced — foundational skill not attempted"
              : `Only ${node.masteryScore}% mastery after ${node.attempts} attempt${node.attempts > 1 ? "s" : ""}`,
          });
        } else if (node.masteryScore < WARNING_THRESHOLD) {
          // Check bloom escalation: if target topic has higher bloom, prereq should be solid
          const prereqBloom = BLOOM_ORDER.indexOf(node.bloomLevel || "remember");
          const targetBloom = Math.max(...targetNodes.map(n => BLOOM_ORDER.indexOf(n.bloomLevel || "remember")));
          if (targetBloom > prereqBloom) {
            missingPrereqs.push({
              node,
              severity: "warning",
              reason: `${node.masteryScore}% mastery — higher-order thinking in "${targetTopic}" requires stronger foundation`,
            });
          } else if (node.masteryScore < 50) {
            missingPrereqs.push({
              node,
              severity: "warning",
              reason: `${node.masteryScore}% mastery — below recommended level for downstream topics`,
            });
          }
        }
      }
    }

    if (missingPrereqs.length > 0) {
      // Sort: critical first
      missingPrereqs.sort((a, b) => (a.severity === "critical" ? -1 : 1) - (b.severity === "critical" ? -1 : 1));

      const prereqScores = missingPrereqs.map(p => p.node.masteryScore);
      const readiness = Math.max(0, Math.round(100 - (missingPrereqs.length * 15) - (100 - avg(prereqScores))));

      gaps.push({
        targetTopic,
        targetTopicOrder: topicOrder.get(targetTopic) ?? i,
        missingPrereqs,
        readiness: Math.min(100, Math.max(0, readiness)),
      });
    }
  }

  // Sort gaps by readiness (lowest first = most urgent)
  gaps.sort((a, b) => a.readiness - b.readiness);

  const healthyTopics = sortedTopics.length - gaps.length;

  const overallReadiness = sortedTopics.length > 0
    ? Math.round(
        sortedTopics.reduce((sum, [, nodes]) => sum + avg(nodes.map(n => n.masteryScore)), 0) /
        sortedTopics.length
      )
    : 100;

  return { gaps, healthyTopics, totalTopics: sortedTopics.length, overallReadiness };
}

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const PrerequisiteDiagnostic = ({ className, onNavigateToTopic }: PrerequisiteDiagnosticProps) => {
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedGaps, setExpandedGaps] = useState<Set<string>>(new Set());
  const [focusAreaMap, setFocusAreaMap] = useState<Map<string, string>>(new Map());
  const { toast } = useToast();

  const loadDiagnostic = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch knowledge components + mastery in parallel
      const [compRes, focusRes] = await Promise.all([
        supabase
          .from("knowledge_components" as any)
          .select("*")
          .eq("user_id", session.user.id)
          .eq("class_name", className)
          .order("component_order", { ascending: true }),
        supabase
          .from("study_focus_areas")
          .select("id, topic")
          .eq("user_id", session.user.id)
          .eq("class_name", className),
      ]);

      const components = (compRes.data || []) as any[];
      if (components.length === 0) {
        setResult(null);
        setLoading(false);
        return;
      }

      // Build focus area lookup for navigation
      const faMap = new Map<string, string>();
      for (const fa of focusRes.data || []) {
        faMap.set(fa.topic.toLowerCase(), fa.id);
      }
      setFocusAreaMap(faMap);

      const compIds = components.map((c: any) => c.id);

      const { data: masteryRows } = await supabase
        .from("knowledge_mastery" as any)
        .select("*")
        .eq("user_id", session.user.id)
        .in("component_id", compIds);

      const masteryMap = new Map<string, any>();
      (masteryRows || []).forEach((m: any) => masteryMap.set(m.component_id, m));

      const nodes: KnowledgeNode[] = components.map((c: any) => {
        const m = masteryMap.get(c.id);
        return {
          id: c.id,
          objective: c.objective,
          parentTopic: c.parent_topic,
          bloomLevel: c.bloom_level,
          order: c.component_order,
          masteryScore: m ? Number(m.mastery_score) : 0,
          attempts: m ? m.attempts : 0,
        };
      });

      setResult(runDiagnostic(nodes));
    } catch (err) {
      console.error("Prerequisite diagnostic error:", err);
    } finally {
      setLoading(false);
    }
  }, [className]);

  useEffect(() => { loadDiagnostic(); }, [loadDiagnostic]);

  useEffect(() => {
    const handler = () => loadDiagnostic();
    window.addEventListener("knowledge-mastery-updated", handler);
    window.addEventListener("syllabus-reparsed", handler);
    return () => {
      window.removeEventListener("knowledge-mastery-updated", handler);
      window.removeEventListener("syllabus-reparsed", handler);
    };
  }, [loadDiagnostic]);

  // Fire toast alerts for critical gaps on first load
  useEffect(() => {
    if (!result) return;
    const criticalGaps = result.gaps.filter(g => g.missingPrereqs.some(p => p.severity === "critical"));
    if (criticalGaps.length > 0) {
      toast({
        title: `⚠️ ${criticalGaps.length} Prerequisite Gap${criticalGaps.length > 1 ? "s" : ""} Detected`,
        description: `You're missing foundational skills needed for: ${criticalGaps.map(g => g.targetTopic).join(", ")}`,
        variant: "destructive",
      });
    }
  }, [result?.gaps.length]);

  const toggleExpand = (topic: string) => {
    setExpandedGaps(prev => {
      const next = new Set(prev);
      next.has(topic) ? next.delete(topic) : next.add(topic);
      return next;
    });
  };

  const findFocusAreaId = (topic: string): string | null => {
    const lower = topic.toLowerCase();
    return focusAreaMap.get(lower) ||
      [...focusAreaMap.entries()].find(([k]) => k.includes(lower) || lower.includes(k))?.[1] ||
      null;
  };

  if (loading) {
    return (
      <Card className="p-6 border-border shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  if (!result || result.totalTopics === 0) return null;

  if (result.gaps.length === 0) {
    return (
      <Card className="p-6 border-border shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-500/10">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Prerequisite Check</h3>
            <p className="text-sm text-green-600">All prerequisites are met — you're ready to proceed!</p>
          </div>
        </div>
      </Card>
    );
  }

  const criticalCount = result.gaps.filter(g => g.missingPrereqs.some(p => p.severity === "critical")).length;
  const warningCount = result.gaps.length - criticalCount;

  return (
    <Card className="p-6 border-border shadow-[var(--shadow-soft)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-destructive/10">
            <Brain className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Prerequisite Diagnostic</h3>
            <p className="text-sm text-muted-foreground">
              {result.gaps.length} chapter{result.gaps.length !== 1 ? "s" : ""} have unmet prerequisites
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {criticalCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {criticalCount} critical
            </Badge>
          )}
          {warningCount > 0 && (
            <Badge className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20">
              {warningCount} warning
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={loadDiagnostic} className="h-7 w-7 p-0">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Overall readiness bar */}
      <div className="mb-4 p-3 rounded-lg bg-muted/30 border border-border">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-muted-foreground">Overall Prerequisite Readiness</span>
          <span className={`text-sm font-bold ${
            result.overallReadiness >= 70 ? "text-green-600" :
            result.overallReadiness >= 40 ? "text-amber-600" : "text-destructive"
          }`}>
            {result.overallReadiness}%
          </span>
        </div>
        <Progress value={result.overallReadiness} className="h-2" />
        <p className="text-xs text-muted-foreground mt-1">
          {result.healthyTopics} of {result.totalTopics} topics have prerequisites met
        </p>
      </div>

      {/* Gap list */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {result.gaps.map((gap) => {
          const hasCritical = gap.missingPrereqs.some(p => p.severity === "critical");
          const isExpanded = expandedGaps.has(gap.targetTopic);
          const faId = findFocusAreaId(gap.targetTopic);

          return (
            <Collapsible key={gap.targetTopic} open={isExpanded} onOpenChange={() => toggleExpand(gap.targetTopic)}>
              <div className={`rounded-lg border ${
                hasCritical
                  ? "border-destructive/20 bg-destructive/5"
                  : "border-amber-500/20 bg-amber-500/5"
              }`}>
                <CollapsibleTrigger className="w-full p-3 flex items-center justify-between text-left">
                  <div className="flex items-center gap-3 min-w-0">
                    {hasCritical ? (
                      <ShieldAlert className="w-4 h-4 text-destructive flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{gap.targetTopic}</p>
                      <p className="text-xs text-muted-foreground">
                        {gap.missingPrereqs.length} prerequisite{gap.missingPrereqs.length !== 1 ? "s" : ""} unmet
                        {" · "}Readiness: {gap.readiness}%
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="w-16">
                      <Progress value={gap.readiness} className="h-1.5" />
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="px-3 pb-3 space-y-1.5 border-t border-border/50 pt-2">
                    {gap.missingPrereqs.map((prereq, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 p-2 rounded bg-background/60 text-xs"
                      >
                        <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                          prereq.severity === "critical" ? "bg-destructive" : "bg-amber-500"
                        }`} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground truncate">{prereq.node.objective}</p>
                          <p className="text-muted-foreground mt-0.5">{prereq.reason}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-muted-foreground">
                              Mastery: {Math.round(prereq.node.masteryScore)}%
                            </span>
                            {prereq.node.bloomLevel && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1">
                                {prereq.node.bloomLevel}
                              </Badge>
                            )}
                            {prereq.node.parentTopic && (
                              <span className="text-muted-foreground">
                                from "{prereq.node.parentTopic}"
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Remediation action */}
                    {faId && onNavigateToTopic && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-1 h-7 text-xs"
                        onClick={() => onNavigateToTopic(faId)}
                      >
                        <BookOpen className="w-3 h-3 mr-1.5" />
                        Review Prerequisites for "{gap.targetTopic}"
                      </Button>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>
    </Card>
  );
};

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertTriangle, BookOpen, Target, Loader2, ArrowRight, ShieldAlert,
  CheckCircle2, ChevronDown, ChevronRight, Lightbulb, RotateCcw,
  Sparkles, Brain, MessageCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/* ─── Types ──────────────────────────────────────────────────── */

interface GapTopic {
  topic: string;
  status: "untouched" | "low" | "in-progress";
  score: number | null;
  focusAreaId: string | null;
}

interface RemedialActivity {
  icon: "review" | "practice" | "hint" | "tutor" | "flashback";
  label: string;
  description: string;
  action?: () => void;
}

interface KnowledgeGapAlertsProps {
  className: string;
  onNavigateToTopic?: (focusAreaId: string) => void;
  onOpenChat?: (prompt: string) => void;
}

/* ─── Helpers ────────────────────────────────────────────────── */

function buildRemedialActivities(
  gap: GapTopic,
  onNavigateToTopic?: (id: string) => void,
  onOpenChat?: (prompt: string) => void,
): RemedialActivity[] {
  const activities: RemedialActivity[] = [];

  // Hint – always shown
  activities.push({
    icon: "hint",
    label: "Quick Hint",
    description: gap.status === "untouched"
      ? `Start by reviewing the core definitions and terminology of "${gap.topic}" before attempting any exercises.`
      : gap.score !== null && gap.score < 30
      ? `Focus on foundational concepts first. Re-read the lesson summary for "${gap.topic}" and try the guided examples before retaking the quiz.`
      : `You're making progress! Review the areas where you lost points and try the practice problems that target those specific sub-topics.`,
  });

  // Remedial review – if a focus area exists
  if (gap.focusAreaId && onNavigateToTopic) {
    activities.push({
      icon: "review",
      label: "Guided Review",
      description: `Open the structured study path for "${gap.topic}" with step-by-step lessons and check-point quizzes.`,
      action: () => onNavigateToTopic(gap.focusAreaId!),
    });
  }

  // Practice suggestion
  activities.push({
    icon: "practice",
    label: gap.status === "untouched" ? "Introductory Practice" : "Targeted Practice",
    description: gap.status === "untouched"
      ? `Try 5 beginner-level questions on "${gap.topic}" to build initial familiarity before diving deeper.`
      : `Generate a focused practice set on the weakest sub-areas of "${gap.topic}" to reinforce understanding.`,
  });

  // AI Tutor suggestion
  if (onOpenChat) {
    activities.push({
      icon: "tutor",
      label: "Ask AgentB",
      description: `Get a personalized explanation of "${gap.topic}" adapted to your learning style.`,
      action: () => onOpenChat(`Explain the key concepts of "${gap.topic}" in a simple way. I'm struggling with this topic.`),
    });
  }

  // Flashback for in-progress
  if (gap.status === "in-progress" && gap.score !== null && gap.score >= 40) {
    activities.push({
      icon: "flashback",
      label: "Concept Flashback",
      description: `Review a 2-minute recap of the core principles you've already learned, then tackle the remaining gaps.`,
    });
  }

  return activities;
}

const ACTIVITY_ICONS = {
  hint: Lightbulb,
  review: BookOpen,
  practice: Brain,
  tutor: MessageCircle,
  flashback: RotateCcw,
} as const;

const ACTIVITY_COLORS = {
  hint: "text-amber-500",
  review: "text-primary",
  practice: "text-green-500",
  tutor: "text-blue-500",
  flashback: "text-purple-500",
} as const;

/* ─── Gap Row Sub-component ──────────────────────────────────── */

function GapRow({
  gap,
  onNavigateToTopic,
  onOpenChat,
}: {
  gap: GapTopic;
  onNavigateToTopic?: (id: string) => void;
  onOpenChat?: (prompt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const activities = buildRemedialActivities(gap, onNavigateToTopic, onOpenChat);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={`rounded-lg border transition-colors ${
          gap.status === "untouched"
            ? "border-destructive/20 bg-destructive/5"
            : gap.status === "low"
            ? "border-amber-500/20 bg-amber-500/5"
            : "border-border bg-muted/30"
        }`}
      >
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between p-3 text-left hover:bg-accent/30 transition-colors rounded-lg">
            <div className="flex items-center gap-3 min-w-0">
              {open ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}
              {gap.status === "untouched" ? (
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
              ) : gap.status === "low" ? (
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
              ) : (
                <Target className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{gap.topic}</p>
                <p className="text-xs text-muted-foreground">
                  {gap.status === "untouched"
                    ? "Not started — tap to see hints & activities"
                    : gap.status === "low"
                    ? `Score: ${gap.score}% — hints & review available`
                    : `Score: ${gap.score}% — almost there, see tips`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {gap.score !== null && (
                <div className="w-16">
                  <Progress value={gap.score} className="h-1.5" />
                </div>
              )}
              <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                <Sparkles className="w-3 h-3 mr-0.5" />
                {activities.length}
              </Badge>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border/50">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-1">
              <Lightbulb className="w-3.5 h-3.5" />
              Hints & Remedial Activities
            </p>
            {activities.map((act, i) => {
              const Icon = ACTIVITY_ICONS[act.icon];
              const color = ACTIVITY_COLORS[act.icon];
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 p-2.5 rounded-md bg-background/60 border border-border/40"
                >
                  <div className={`mt-0.5 ${color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground">{act.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {act.description}
                    </p>
                  </div>
                  {act.action && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs px-2 flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        act.action!();
                      }}
                    >
                      <ArrowRight className="w-3 h-3 mr-1" />
                      Go
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

/* ─── Main Component ─────────────────────────────────────────── */

export const KnowledgeGapAlerts = ({ className, onNavigateToTopic, onOpenChat }: KnowledgeGapAlertsProps) => {
  const [gaps, setGaps] = useState<GapTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [syllabusTopicCount, setSyllabusTopicCount] = useState(0);

  const loadGaps = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: syllabus } = await supabase
        .from("syllabi")
        .select("learning_objectives, weekly_schedule")
        .eq("class_name", className)
        .order("uploaded_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const syllabusTopics: string[] = [];
      if (syllabus?.learning_objectives) syllabusTopics.push(...syllabus.learning_objectives);
      if (syllabus?.weekly_schedule && Array.isArray(syllabus.weekly_schedule)) {
        for (const week of syllabus.weekly_schedule) {
          if (typeof week === "object" && week !== null) {
            const topic = (week as Record<string, unknown>).topic || (week as Record<string, unknown>).title;
            if (typeof topic === "string" && !syllabusTopics.includes(topic)) {
              syllabusTopics.push(topic);
            }
          }
        }
      }
      setSyllabusTopicCount(syllabusTopics.length);

      const { data: focusAreas } = await supabase
        .from("study_focus_areas")
        .select("id, topic, quiz_passed, quiz_score, is_unlocked")
        .eq("user_id", session.user.id)
        .eq("class_name", className);

      const { data: practiceData } = await supabase
        .from("practice_history")
        .select("score, total, topics_practiced")
        .eq("user_id", session.user.id)
        .eq("class_name", className);

      const practiceScores = new Map<string, number[]>();
      if (practiceData) {
        for (const p of practiceData) {
          for (const t of (p.topics_practiced || [])) {
            if (!practiceScores.has(t)) practiceScores.set(t, []);
            if (p.total && p.total > 0) {
              practiceScores.get(t)!.push(((p.score || 0) / p.total) * 100);
            }
          }
        }
      }

      const focusMap = new Map((focusAreas || []).map(a => [a.topic.toLowerCase(), a]));
      const result: GapTopic[] = [];

      for (const topic of syllabusTopics) {
        const lower = topic.toLowerCase();
        const fa = focusMap.get(lower) ||
          Array.from(focusMap.entries()).find(([k]) =>
            k.includes(lower) || lower.includes(k)
          )?.[1];

        const scores = practiceScores.get(topic) ||
          Array.from(practiceScores.entries())
            .filter(([k]) => k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase()))
            .flatMap(([, v]) => v);

        const avgScore = scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null;

        const faScore = fa?.quiz_score ?? null;
        const bestScore = faScore !== null && avgScore !== null
          ? Math.max(faScore, avgScore)
          : faScore ?? avgScore;

        if (fa?.quiz_passed) continue;

        if (bestScore === null && !fa) {
          result.push({ topic, status: "untouched", score: null, focusAreaId: null });
        } else if (bestScore !== null && bestScore < 50) {
          result.push({ topic, status: "low", score: bestScore, focusAreaId: fa?.id || null });
        } else if (bestScore !== null && bestScore < 70) {
          result.push({ topic, status: "in-progress", score: bestScore, focusAreaId: fa?.id || null });
        } else if (!fa?.quiz_passed && fa) {
          result.push({ topic, status: "in-progress", score: bestScore, focusAreaId: fa.id });
        } else if (bestScore === null) {
          result.push({ topic, status: "untouched", score: null, focusAreaId: fa?.id || null });
        }
      }

      const order = { untouched: 0, low: 1, "in-progress": 2 };
      result.sort((a, b) => order[a.status] - order[b.status]);
      setGaps(result);
    } catch (err) {
      console.error("Error loading knowledge gaps:", err);
    } finally {
      setLoading(false);
    }
  }, [className]);

  useEffect(() => { loadGaps(); }, [loadGaps]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.className === className) loadGaps();
    };
    window.addEventListener("syllabus-reparsed", handler);
    return () => window.removeEventListener("syllabus-reparsed", handler);
  }, [className, loadGaps]);

  if (loading) {
    return (
      <Card className="p-6 border-border shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  if (gaps.length === 0 && syllabusTopicCount > 0) {
    return (
      <Card className="p-6 border-border shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-green-500/10">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Knowledge Gaps</h3>
            <p className="text-sm text-green-600">All syllabus topics are on track!</p>
          </div>
        </div>
      </Card>
    );
  }

  if (syllabusTopicCount === 0) return null;

  const untouched = gaps.filter(g => g.status === "untouched");
  const low = gaps.filter(g => g.status === "low");

  return (
    <Card className="p-6 border-border shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-destructive/10">
            <ShieldAlert className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Knowledge Gap Alerts</h3>
            <p className="text-sm text-muted-foreground">
              {gaps.length} topic{gaps.length !== 1 ? "s" : ""} need attention — expand for hints
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {untouched.length > 0 && (
            <Badge variant="destructive" className="text-xs">{untouched.length} untouched</Badge>
          )}
          {low.length > 0 && (
            <Badge className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20">{low.length} low</Badge>
          )}
        </div>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {gaps.map((gap, i) => (
          <GapRow
            key={i}
            gap={gap}
            onNavigateToTopic={onNavigateToTopic}
            onOpenChat={onOpenChat}
          />
        ))}
      </div>
    </Card>
  );
};

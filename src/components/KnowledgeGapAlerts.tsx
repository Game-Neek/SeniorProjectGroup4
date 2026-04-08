import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertTriangle, BookOpen, Target, Loader2, ArrowRight, ShieldAlert,
  CheckCircle2, ChevronDown, ChevronRight, Lightbulb, RotateCcw,
  Sparkles, Brain, MessageCircle, TrendingDown, TrendingUp, Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/* ─── Types ──────────────────────────────────────────────────── */

interface GapTopic {
  topic: string;
  status: "untouched" | "low" | "struggling" | "in-progress";
  score: number | null;
  focusAreaId: string | null;
  /** Enrichment from knowledge_mastery */
  attempts: number;
  lastPracticedAt: string | null;
  bloomLevel: string | null;
  /** Score trajectory: positive = improving, negative = declining */
  trajectory: number;
  /** Days since last practice */
  daysSinceLastPractice: number | null;
}

interface RemedialActivity {
  icon: "review" | "practice" | "hint" | "tutor" | "flashback";
  label: string;
  description: string;
  action?: () => void;
  /** Explains WHY this activity was chosen */
  rationale: string;
}

interface KnowledgeGapAlertsProps {
  className: string;
  onNavigateToTopic?: (focusAreaId: string) => void;
  onOpenChat?: (prompt: string) => void;
}

/* ─── Adaptive remediation engine ────────────────────────────── */

function buildRemedialActivities(
  gap: GapTopic,
  learningStyles: string[],
  onNavigateToTopic?: (id: string) => void,
  onOpenChat?: (prompt: string) => void,
): RemedialActivity[] {
  const activities: RemedialActivity[] = [];
  const isVisual = learningStyles.includes("visual");
  const isAuditory = learningStyles.includes("auditory");
  const isKinesthetic = learningStyles.includes("kinesthetic");
  const isReading = learningStyles.includes("reading");

  // ── Adaptive hint based on actual student state ──
  if (gap.status === "untouched") {
    activities.push({
      icon: "hint",
      label: "Getting Started",
      description: isVisual
        ? `Look for diagrams or concept maps about "${gap.topic}" before reading any text — visual overviews build better mental models.`
        : isAuditory
        ? `Try finding a short lecture or podcast on "${gap.topic}" to build initial familiarity before diving into text.`
        : isKinesthetic
        ? `Start with a hands-on example or interactive demo for "${gap.topic}" — doing builds understanding faster for you.`
        : `Read the chapter summary or glossary for "${gap.topic}" first to anchor key vocabulary before the full lesson.`,
      rationale: "This topic hasn't been attempted yet — starting with your strongest learning modality maximizes initial retention.",
    });
  } else if (gap.status === "struggling") {
    // High attempts, low score — need a different approach (growth-framed, not deficit-framed)
    activities.push({
      icon: "hint",
      label: "Try a Different Strategy",
      description: `You've put in real effort on "${gap.topic}" (${gap.attempts} attempts, ${gap.score}%). That persistence is valuable — now let's find an approach that clicks better for you. ${
        isVisual
          ? "Try watching a worked-example video instead of re-reading notes"
          : isKinesthetic
          ? "Try teaching this concept to someone else or building a physical model"
          : "Try breaking it into 3 smaller sub-topics and mastering each one separately"
      }.`,
      rationale: `Multiple attempts show strong effort. Research shows changing strategy is more effective than repeating the same approach — this is a learning insight, not a shortcoming.`,
    });
  } else if (gap.daysSinceLastPractice !== null && gap.daysSinceLastPractice > 7) {
    // Stale knowledge — forgetting curve
    activities.push({
      icon: "hint",
      label: "Memory Refresh Needed",
      description: `It's been ${gap.daysSinceLastPractice} days since you last practiced "${gap.topic}" (scored ${gap.score}%). Research shows significant forgetting after 7+ days — a 10-minute spaced review will restore most of what you knew.`,
      rationale: "Ebbinghaus forgetting curve: retention drops ~75% after 7 days without review.",
    });
  } else if (gap.trajectory < -10) {
    // Declining scores
    activities.push({
      icon: "hint",
      label: "Score Declining — Reassess Foundation",
      description: `Your scores on "${gap.topic}" are trending downward. This often means a prerequisite concept is shaky — review the foundational topic that comes before this one.`,
      rationale: "Declining performance despite practice usually indicates a gap in prerequisite knowledge, not in the current topic.",
    });
  } else if (gap.score !== null && gap.score < 30) {
    activities.push({
      icon: "hint",
      label: "Foundational Review",
      description: `With ${gap.score}% mastery, focus on definitions and core principles of "${gap.topic}" before attempting practice problems.${
        gap.bloomLevel ? ` This topic requires "${gap.bloomLevel}" level thinking — start by building recall first.` : ""
      }`,
      rationale: `Score is below 30% — attempting higher-order problems without basic understanding leads to frustration, not learning.`,
    });
  } else {
    activities.push({
      icon: "hint",
      label: "Targeted Gap Closing",
      description: `You're at ${gap.score}% on "${gap.topic}" after ${gap.attempts} attempt${gap.attempts !== 1 ? "s" : ""}. ${
        gap.trajectory > 5
          ? "Your scores are improving — keep the momentum with one more focused practice session."
          : "Focus on the specific sub-topics where you lost points rather than re-studying everything."
      }`,
      rationale: gap.trajectory > 5
        ? "Positive trajectory detected — reinforcement at this stage locks in gains."
        : "Plateau detected — targeted practice on weak sub-areas is more efficient than broad review.",
    });
  }

  // ── Guided review (only if focus area exists) ──
  if (gap.focusAreaId && onNavigateToTopic) {
    const reviewLabel = gap.status === "struggling"
      ? "Fresh Start Study Path"
      : gap.daysSinceLastPractice && gap.daysSinceLastPractice > 7
      ? "Spaced Repetition Review"
      : "Continue Study Path";

    activities.push({
      icon: "review",
      label: reviewLabel,
      description: gap.status === "struggling"
        ? `Your study path for "${gap.topic}" has structured lessons — approaching it fresh can reveal new understanding.`
        : `Open your structured study path for "${gap.topic}" with step-by-step lessons and checkpoint quizzes.`,
      rationale: gap.status === "struggling"
        ? `After ${gap.attempts} attempts, a structured path provides scaffolded support that self-study alone may not.`
        : "Structured learning paths provide scaffolded progression that matches your current level.",
      action: () => onNavigateToTopic(gap.focusAreaId!),
    });
  }

  // ── Adaptive practice — difficulty matches student state ──
  const practiceBloom = gap.score !== null && gap.score >= 60
    ? "application-level"
    : gap.score !== null && gap.score >= 30
    ? "understanding-level"
    : "recall-level";

  activities.push({
    icon: "practice",
    label: gap.status === "untouched"
      ? "Introductory Practice"
      : gap.status === "struggling"
      ? "Foundation-Building Practice"
      : "Targeted Practice",
    description: gap.status === "untouched"
      ? `Start with 5 ${practiceBloom} questions on "${gap.topic}" to build initial confidence.`
      : gap.status === "struggling"
      ? `Try ${practiceBloom} questions that approach "${gap.topic}" from a different angle with smaller, more approachable steps.`
      : `Focus on the specific areas within "${gap.topic}" with ${practiceBloom} problems.`,
    rationale: `Practice difficulty set to ${practiceBloom} based on your current ${gap.score ?? 0}% mastery — ${
      gap.status === "struggling"
        ? "building from foundations creates confidence for tackling harder problems"
        : "matching difficulty to your zone of proximal development"
    }.`,
  });

  // ── AI Tutor — prompt is personalized to actual student state ──
  if (onOpenChat) {
    const tutorPrompt = gap.status === "untouched"
      ? `I haven't started learning "${gap.topic}" yet. Give me a beginner-friendly overview using ${
          isVisual ? "diagrams and visual analogies" : isAuditory ? "conversational explanations" : "clear examples"
        }.`
      : gap.status === "struggling"
      ? `I've tried "${gap.topic}" ${gap.attempts} times but I'm stuck at ${gap.score}%. I think I'm missing something fundamental. Can you identify what prerequisite concept I might be lacking and explain it step by step?`
      : gap.trajectory < 0
      ? `My scores on "${gap.topic}" are declining (currently ${gap.score}%). What might I be doing wrong, and how should I change my study approach?`
      : `I'm at ${gap.score}% on "${gap.topic}". What specific concepts should I focus on to get above 70%? Be specific about what I likely got wrong at this level.`;

    activities.push({
      icon: "tutor",
      label: gap.status === "struggling" ? "Find My Foundation Gap" : "Ask AgentB",
      description: gap.status === "struggling"
        ? `Get AI help identifying which prerequisite concept in "${gap.topic}" needs strengthening — it'll create a targeted path forward.`
        : `Get a personalized explanation of "${gap.topic}" adapted to your learning style.`,
      rationale: gap.status === "struggling"
        ? "AI tutoring can identify foundational gaps that are hard to spot on your own."
        : "Conversational learning adapts in real-time to your questions and confusion points.",
      action: () => onOpenChat(tutorPrompt),
    });
  }

  // ── Flashback for decaying knowledge ──
  if (gap.daysSinceLastPractice !== null && gap.daysSinceLastPractice > 5 && gap.score !== null && gap.score >= 40) {
    activities.push({
      icon: "flashback",
      label: "Spaced Recall",
      description: `You knew this ${gap.daysSinceLastPractice} days ago (${gap.score}%). A 2-minute active recall exercise — try to write down everything you remember about "${gap.topic}" before reviewing — will reactivate your memory efficiently.`,
      rationale: "Active recall before review (the testing effect) produces 50% stronger retention than passive re-reading.",
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
  learningStyles,
  onNavigateToTopic,
  onOpenChat,
}: {
  gap: GapTopic;
  learningStyles: string[];
  onNavigateToTopic?: (id: string) => void;
  onOpenChat?: (prompt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const activities = buildRemedialActivities(gap, learningStyles, onNavigateToTopic, onOpenChat);

  // Growth-oriented labels — avoid deficit framing like "Struggling" or "Failing"
  const statusLabel = gap.status === "struggling"
    ? `Needs a new approach — ${gap.attempts} attempts, ${gap.score}%`
    : gap.status === "untouched"
    ? "Ready to start"
    : gap.status === "low"
    ? `Building: ${gap.score}%${gap.attempts > 0 ? ` (${gap.attempts} attempt${gap.attempts > 1 ? "s" : ""})` : ""}`
    : `Score: ${gap.score}%${gap.trajectory > 0 ? " ↑" : gap.trajectory < 0 ? " ↓" : ""}`;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "rounded-lg border transition-colors",
          gap.status === "untouched"
            ? "border-destructive/20 bg-destructive/5"
            : gap.status === "struggling"
            ? "border-destructive/30 bg-destructive/5"
            : gap.status === "low"
            ? "border-amber-500/20 bg-amber-500/5"
            : "border-border bg-muted/30"
        )}
      >
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between p-3 text-left hover:bg-accent/30 transition-colors rounded-lg" aria-expanded={open} aria-label={`${gap.topic}, ${statusLabel}. ${activities.length} remedial activities available.`}>
            <div className="flex items-center gap-3 min-w-0">
              {open ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
              )}
              {gap.status === "untouched" || gap.status === "struggling" ? (
                <AlertTriangle className={cn("w-4 h-4 flex-shrink-0", "text-destructive")} aria-hidden="true" />
              ) : gap.status === "low" ? (
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" aria-hidden="true" />
              ) : (
                <Target className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{gap.topic}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{statusLabel}</span>
                  {gap.daysSinceLastPractice !== null && gap.daysSinceLastPractice > 5 && (
                    <span className="flex items-center gap-0.5 text-amber-600">
                      <Clock className="w-3 h-3" /> {gap.daysSinceLastPractice}d ago
                    </span>
                  )}
                  {gap.trajectory !== 0 && gap.score !== null && (
                    <span className={cn(
                      "flex items-center gap-0.5",
                      gap.trajectory > 0 ? "text-green-600" : "text-destructive"
                    )}>
                      {gap.trajectory > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {gap.trajectory > 0 ? "+" : ""}{gap.trajectory}%
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {gap.score !== null && (
                <div className="w-16" role="progressbar" aria-valuenow={gap.score} aria-valuemin={0} aria-valuemax={100} aria-label={`Mastery: ${gap.score}%`}>
                  <Progress value={gap.score} className="h-1.5" />
                </div>
              )}
              <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                <Sparkles className="w-3 h-3 mr-0.5" aria-hidden="true" />
                <span className="sr-only">{activities.length} activities</span>
                {activities.length}
              </Badge>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border/50">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-1">
              <Lightbulb className="w-3.5 h-3.5" />
              Personalized Remedial Activities
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
                    <p className="text-[10px] text-muted-foreground/70 mt-1 italic leading-relaxed">
                      Why: {act.rationale}
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
  const [learningStyles, setLearningStyles] = useState<string[]>([]);

  const loadGaps = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch learning styles for personalization
      const { data: profile } = await supabase
        .from("profiles")
        .select("learning_styles")
        .eq("id", session.user.id)
        .maybeSingle();
      setLearningStyles(profile?.learning_styles || []);

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

      // Fetch focus areas with scores
      const { data: focusAreas } = await supabase
        .from("study_focus_areas")
        .select("id, topic, quiz_passed, quiz_score, is_unlocked")
        .eq("user_id", session.user.id)
        .eq("class_name", className);

      // Fetch knowledge mastery for enrichment (attempts, recency, bloom)
      const { data: components } = await supabase
        .from("knowledge_components")
        .select("id, objective, parent_topic, bloom_level")
        .eq("user_id", session.user.id)
        .eq("class_name", className);

      const componentIds = (components || []).map((c: any) => c.id);
      let masteryData: any[] = [];
      if (componentIds.length > 0) {
        const { data: mastery } = await supabase
          .from("knowledge_mastery")
          .select("component_id, mastery_score, attempts, last_practiced_at")
          .eq("user_id", session.user.id)
          .in("component_id", componentIds);
        masteryData = mastery || [];
      }

      // Build mastery lookup by parent_topic
      const componentByTopic = new Map<string, any[]>();
      for (const c of (components || [])) {
        const key = ((c as any).parent_topic || (c as any).objective || "").toLowerCase();
        if (!componentByTopic.has(key)) componentByTopic.set(key, []);
        componentByTopic.get(key)!.push(c);
      }

      const masteryById = new Map(masteryData.map((m: any) => [m.component_id, m]));

      // Fetch practice history for trajectory analysis
      const { data: practiceData } = await supabase
        .from("practice_history")
        .select("score, total, topics_practiced, completed_at")
        .eq("user_id", session.user.id)
        .eq("class_name", className)
        .order("completed_at", { ascending: true });

      // Build per-topic score history for trajectory
      const practiceHistory = new Map<string, { score: number; date: string }[]>();
      if (practiceData) {
        for (const p of practiceData) {
          for (const t of (p.topics_practiced || [])) {
            if (!practiceHistory.has(t)) practiceHistory.set(t, []);
            if (p.total && p.total > 0) {
              practiceHistory.get(t)!.push({
                score: ((p.score || 0) / p.total) * 100,
                date: p.completed_at,
              });
            }
          }
        }
      }

      const focusMap = new Map((focusAreas || []).map(a => [a.topic.toLowerCase(), a]));
      const now = Date.now();
      const result: GapTopic[] = [];

      for (const topic of syllabusTopics) {
        const lower = topic.toLowerCase();
        const fa = focusMap.get(lower) ||
          Array.from(focusMap.entries()).find(([k]) =>
            k.includes(lower) || lower.includes(k)
          )?.[1];

        if (fa?.quiz_passed) continue;

        // Get mastery enrichment
        const relatedComponents = componentByTopic.get(lower) ||
          Array.from(componentByTopic.entries())
            .filter(([k]) => k.includes(lower) || lower.includes(k))
            .flatMap(([, v]) => v);

        const relatedMastery = relatedComponents
          .map((c: any) => masteryById.get(c.id))
          .filter(Boolean);

        const totalAttempts = relatedMastery.reduce((s: number, m: any) => s + (m.attempts || 0), 0);
        const lastPracticed = relatedMastery
          .map((m: any) => m.last_practiced_at)
          .filter(Boolean)
          .sort()
          .pop() || null;
        const bloomLevel = relatedComponents[0]?.bloom_level || null;

        const daysSinceLastPractice = lastPracticed
          ? Math.floor((now - new Date(lastPracticed).getTime()) / 86_400_000)
          : null;

        // Compute score from practice history + focus area
        const historyEntries = practiceHistory.get(topic) ||
          Array.from(practiceHistory.entries())
            .filter(([k]) => k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase()))
            .flatMap(([, v]) => v);

        const allScores = historyEntries.map(h => h.score);
        const avgPracticeScore = allScores.length > 0
          ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
          : null;

        const faScore = fa?.quiz_score ?? null;
        const bestScore = faScore !== null && avgPracticeScore !== null
          ? Math.max(faScore, avgPracticeScore)
          : faScore ?? avgPracticeScore;

        // Trajectory: compare last 3 vs first 3 scores
        let trajectory = 0;
        if (allScores.length >= 4) {
          const recent3 = allScores.slice(-3);
          const early3 = allScores.slice(0, 3);
          const avgRecent = recent3.reduce((a, b) => a + b, 0) / recent3.length;
          const avgEarly = early3.reduce((a, b) => a + b, 0) / early3.length;
          trajectory = Math.round(avgRecent - avgEarly);
        }

        // Determine status with attempt-awareness
        let status: GapTopic["status"];
        if (bestScore === null && totalAttempts === 0) {
          status = "untouched";
        } else if (bestScore !== null && bestScore < 50 && totalAttempts >= 5) {
          status = "struggling"; // New status: high attempts + low score
        } else if (bestScore !== null && bestScore < 50) {
          status = "low";
        } else if (bestScore !== null && bestScore < 70) {
          status = "in-progress";
        } else if (!fa?.quiz_passed && fa) {
          status = "in-progress";
        } else if (bestScore === null) {
          status = "untouched";
        } else {
          continue; // Score >= 70 and no other flags
        }

        result.push({
          topic,
          status,
          score: bestScore,
          focusAreaId: fa?.id || null,
          attempts: totalAttempts,
          lastPracticedAt: lastPracticed,
          bloomLevel,
          trajectory,
          daysSinceLastPractice,
        });
      }

      // Sort: struggling first, then untouched, then low, then in-progress
      const order = { struggling: 0, untouched: 1, low: 2, "in-progress": 3 };
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
    window.addEventListener("knowledge-mastery-updated", handler);
    return () => {
      window.removeEventListener("syllabus-reparsed", handler);
      window.removeEventListener("knowledge-mastery-updated", handler);
    };
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
  const struggling = gaps.filter(g => g.status === "struggling");
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
              {gaps.length} topic{gaps.length !== 1 ? "s" : ""} need attention — personalized to your learning data
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {struggling.length > 0 && (
            <Badge variant="destructive" className="text-xs">{struggling.length} struggling</Badge>
          )}
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
            learningStyles={learningStyles}
            onNavigateToTopic={onNavigateToTopic}
            onOpenChat={onOpenChat}
          />
        ))}
      </div>
    </Card>
  );
};

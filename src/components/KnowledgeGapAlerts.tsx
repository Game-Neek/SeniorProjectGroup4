import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, BookOpen, Target, Loader2, ArrowRight, ShieldAlert, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface GapTopic {
  topic: string;
  status: "untouched" | "low" | "in-progress";
  score: number | null;
  focusAreaId: string | null;
}

interface KnowledgeGapAlertsProps {
  className: string;
  onNavigateToTopic?: (focusAreaId: string) => void;
}

export const KnowledgeGapAlerts = ({ className, onNavigateToTopic }: KnowledgeGapAlertsProps) => {
  const [gaps, setGaps] = useState<GapTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [syllabusTopicCount, setSyllabusTopicCount] = useState(0);

  const loadGaps = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Get syllabus topics
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

      // Get study focus areas for this class
      const { data: focusAreas } = await supabase
        .from("study_focus_areas")
        .select("id, topic, quiz_passed, quiz_score, is_unlocked")
        .eq("user_id", session.user.id)
        .eq("class_name", className);

      // Get practice history
      const { data: practiceData } = await supabase
        .from("practice_history")
        .select("score, total, topics_practiced")
        .eq("user_id", session.user.id)
        .eq("class_name", className);

      // Build topic scores from practice history
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

      // Map focus areas
      const focusMap = new Map((focusAreas || []).map(a => [a.topic.toLowerCase(), a]));

      const result: GapTopic[] = [];

      // Check each syllabus topic
      for (const topic of syllabusTopics) {
        const lower = topic.toLowerCase();
        const fa = focusMap.get(lower) ||
          Array.from(focusMap.entries()).find(([k]) =>
            k.includes(lower) || lower.includes(k)
          )?.[1];

        // Check practice scores for this topic
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

        if (fa?.quiz_passed) continue; // mastered — no gap

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

      // Sort: untouched first, then low, then in-progress
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
  const inProgress = gaps.filter(g => g.status === "in-progress");

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
              {gaps.length} topic{gaps.length !== 1 ? "s" : ""} need attention
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

      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
        {gaps.map((gap, i) => (
          <div
            key={i}
            className={`flex items-center justify-between p-3 rounded-lg border ${
              gap.status === "untouched"
                ? "border-destructive/20 bg-destructive/5"
                : gap.status === "low"
                ? "border-amber-500/20 bg-amber-500/5"
                : "border-border bg-muted/30"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
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
                    ? "Not started — no practice or quiz attempts"
                    : gap.status === "low"
                    ? `Score: ${gap.score}% — needs focused review`
                    : `Score: ${gap.score}% — in progress`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {gap.score !== null && (
                <div className="w-16">
                  <Progress value={gap.score} className="h-1.5" />
                </div>
              )}
              {gap.focusAreaId && onNavigateToTopic && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => onNavigateToTopic(gap.focusAreaId!)}
                >
                  <ArrowRight className="w-3 h-3 mr-1" />
                  Study
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

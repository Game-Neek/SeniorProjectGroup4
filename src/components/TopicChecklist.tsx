import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ListChecks, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface TopicItem {
  id: string;
  topic: string;
  checked: boolean;
  autoCompleted: boolean; // auto-completed via quiz/practice results
  source: "syllabus" | "focus_area";
  score: number | null;
}

interface TopicChecklistProps {
  className: string;
}

export const TopicChecklist = ({ className }: TopicChecklistProps) => {
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTopics = useCallback(async () => {
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
            const t = (week as Record<string, unknown>).topic || (week as Record<string, unknown>).title;
            if (typeof t === "string" && !syllabusTopics.includes(t)) syllabusTopics.push(t);
          }
        }
      }

      // Get focus areas (mastered topics)
      const { data: focusAreas } = await supabase
        .from("study_focus_areas")
        .select("id, topic, quiz_passed, quiz_score")
        .eq("user_id", session.user.id)
        .eq("class_name", className);

      // Get practice history for score data
      const { data: practiceData } = await supabase
        .from("practice_history")
        .select("score, total, topics_practiced")
        .eq("user_id", session.user.id)
        .eq("class_name", className);

      // Build score map from practice
      const practiceScores = new Map<string, number>();
      if (practiceData) {
        for (const p of practiceData) {
          for (const t of (p.topics_practiced || [])) {
            const pct = p.total && p.total > 0 ? ((p.score || 0) / p.total) * 100 : 0;
            const existing = practiceScores.get(t) || 0;
            practiceScores.set(t, Math.max(existing, pct));
          }
        }
      }

      // Get stored manual checklist from localStorage
      const storageKey = `topic-checklist-${session.user.id}-${className}`;
      const stored = JSON.parse(localStorage.getItem(storageKey) || "{}") as Record<string, boolean>;

      // Build topic items
      const faMap = new Map((focusAreas || []).map(a => [a.topic.toLowerCase(), a]));
      const items: TopicItem[] = syllabusTopics.map((topic, i) => {
        const lower = topic.toLowerCase();
        const fa = faMap.get(lower) ||
          Array.from(faMap.entries()).find(([k]) => k.includes(lower) || lower.includes(k))?.[1];

        const autoCompleted = fa?.quiz_passed || false;
        const manualCheck = stored[topic] || false;
        const score = fa?.quiz_score ?? (
          Array.from(practiceScores.entries())
            .filter(([k]) => k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase()))
            .map(([, v]) => v)[0] ?? null
        );

        return {
          id: fa?.id || `syllabus-${i}`,
          topic,
          checked: autoCompleted || manualCheck,
          autoCompleted,
          source: fa ? "focus_area" : "syllabus",
          score: score !== null ? Math.round(score) : null,
        };
      });

      setTopics(items);
    } catch (err) {
      console.error("Error loading topic checklist:", err);
    } finally {
      setLoading(false);
    }
  }, [className]);

  useEffect(() => { loadTopics(); }, [loadTopics]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.className === className) loadTopics();
    };
    window.addEventListener("syllabus-reparsed", handler);
    return () => window.removeEventListener("syllabus-reparsed", handler);
  }, [className, loadTopics]);

  const toggleTopic = async (index: number) => {
    const item = topics[index];
    if (item.autoCompleted) return; // Can't uncheck auto-completed

    const newChecked = !item.checked;
    const updated = [...topics];
    updated[index] = { ...item, checked: newChecked };
    setTopics(updated);

    // Persist manual checks to localStorage
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const storageKey = `topic-checklist-${session.user.id}-${className}`;
      const stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
      if (newChecked) {
        stored[item.topic] = true;
      } else {
        delete stored[item.topic];
      }
      localStorage.setItem(storageKey, JSON.stringify(stored));
    }
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

  if (topics.length === 0) return null;

  const checkedCount = topics.filter(t => t.checked).length;
  const completionPct = Math.round((checkedCount / topics.length) * 100);

  return (
    <Card className="p-6 border-border shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <ListChecks className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Topic Checklist</h3>
            <p className="text-sm text-muted-foreground">
              {checkedCount}/{topics.length} topics completed
            </p>
          </div>
        </div>
        {completionPct === 100 && (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            All Done
          </Badge>
        )}
      </div>

      <div className="mb-4">
        <Progress value={completionPct} className="h-2" />
        <p className="text-xs text-muted-foreground mt-1 text-right">{completionPct}%</p>
      </div>

      <div className="space-y-1 max-h-[350px] overflow-y-auto pr-1">
        {topics.map((item, i) => (
          <div
            key={item.id}
            className={cn(
              "flex items-center gap-3 p-2.5 rounded-lg transition-colors",
              item.checked ? "bg-green-500/5" : "hover:bg-muted/50"
            )}
          >
            <Checkbox
              checked={item.checked}
              onCheckedChange={() => toggleTopic(i)}
              disabled={item.autoCompleted}
              className="flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className={cn(
                "text-sm truncate",
                item.checked ? "text-muted-foreground line-through" : "text-foreground"
              )}>
                {item.topic}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {item.autoCompleted && (
                <Badge variant="outline" className="text-xs py-0 bg-green-500/10 text-green-600 border-green-500/20">
                  Auto
                </Badge>
              )}
              {item.score !== null && (
                <span className={cn(
                  "text-xs font-medium",
                  item.score >= 70 ? "text-green-600" : item.score >= 40 ? "text-amber-600" : "text-destructive"
                )}>
                  {item.score}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

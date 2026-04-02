import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BookMarked, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TopicProgress {
  topic: string;
  quizScore: number;
  exerciseScore: number;
  totalAttempts: number;
  overallProgress: number;
}

interface ChapterBreakdownsProps {
  className: string;
}

export const ChapterBreakdowns = ({ className }: ChapterBreakdownsProps) => {
  const [topics, setTopics] = useState<TopicProgress[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTopicProgressCb = useCallback(() => {
    loadTopicProgress();
  }, [className]);

  useEffect(() => {
    loadTopicProgressCb();
  }, [loadTopicProgressCb]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.className === className) {
        loadTopicProgressCb();
      }
    };
    window.addEventListener("syllabus-reparsed", handler);
    return () => window.removeEventListener("syllabus-reparsed", handler);
  }, [className, loadTopicProgressCb]);

  const loadTopicProgress = async () => {
    setLoading(true);
    try {
      // Get learning objectives and weekly schedule from parsed syllabus
      const { data: syllabus } = await supabase
        .from("syllabi")
        .select("learning_objectives, weekly_schedule")
        .eq("class_name", className)
        .order("uploaded_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Get practice history for this course
      const { data: practiceData } = await supabase
        .from("practice_history")
        .select("practice_type, score, total, topics_practiced")
        .eq("class_name", className);

      // Get quiz results for this course
      const { data: quizResults } = await supabase
        .from("quiz_results")
        .select("strong_areas, weak_areas, score, total_questions")
        .eq("class_name", className)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Extract topics from syllabus
      const syllabusTopics: string[] = [];

      if (syllabus?.learning_objectives) {
        syllabusTopics.push(...syllabus.learning_objectives);
      }

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

      if (syllabusTopics.length === 0) {
        setTopics([]);
        setLoading(false);
        return;
      }

      // Build per-topic progress from practice history
      const topicMap = new Map<string, { quizScores: number[]; exerciseScores: number[]; attempts: number }>();

      syllabusTopics.forEach((t) => topicMap.set(t, { quizScores: [], exerciseScores: [], attempts: 0 }));

      if (practiceData) {
        for (const record of practiceData) {
          const practiced = record.topics_practiced || [];
          for (const topic of practiced) {
            // Match to closest syllabus topic
            const match = syllabusTopics.find(
              (st) => st.toLowerCase().includes(topic.toLowerCase()) || topic.toLowerCase().includes(st.toLowerCase())
            );
            const key = match || topic;
            if (!topicMap.has(key)) {
              topicMap.set(key, { quizScores: [], exerciseScores: [], attempts: 0 });
            }
            const entry = topicMap.get(key)!;
            entry.attempts++;
            const pct = record.total ? ((record.score || 0) / record.total) * 100 : 0;
            if (record.practice_type === "mini-quiz") {
              entry.quizScores.push(pct);
            } else {
              entry.exerciseScores.push(pct);
            }
          }
        }
      }

      // Factor in placement quiz strong/weak areas
      if (quizResults) {
        for (const strong of quizResults.strong_areas || []) {
          const match = syllabusTopics.find(
            (st) => st.toLowerCase().includes(strong.toLowerCase()) || strong.toLowerCase().includes(st.toLowerCase())
          );
          if (match && topicMap.has(match)) {
            topicMap.get(match)!.quizScores.push(85);
          }
        }
        for (const weak of quizResults.weak_areas || []) {
          const match = syllabusTopics.find(
            (st) => st.toLowerCase().includes(weak.toLowerCase()) || weak.toLowerCase().includes(st.toLowerCase())
          );
          if (match && topicMap.has(match)) {
            topicMap.get(match)!.quizScores.push(35);
          }
        }
      }

      const result: TopicProgress[] = Array.from(topicMap.entries()).map(([topic, data]) => {
        const avgQuiz = data.quizScores.length > 0
          ? data.quizScores.reduce((a, b) => a + b, 0) / data.quizScores.length
          : 0;
        const avgExercise = data.exerciseScores.length > 0
          ? data.exerciseScores.reduce((a, b) => a + b, 0) / data.exerciseScores.length
          : 0;
        const totalScores = data.quizScores.length + data.exerciseScores.length;
        const overall = totalScores > 0
          ? Math.round((avgQuiz * data.quizScores.length + avgExercise * data.exerciseScores.length) / totalScores)
          : 0;

        return {
          topic,
          quizScore: Math.round(avgQuiz),
          exerciseScore: Math.round(avgExercise),
          totalAttempts: data.attempts,
          overallProgress: overall,
        };
      });

      // Sort: lowest progress first
      result.sort((a, b) => a.overallProgress - b.overallProgress);
      setTopics(result);
    } catch (err) {
      console.error("Error loading chapter breakdowns:", err);
    } finally {
      setLoading(false);
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

  if (topics.length === 0) {
    return (
      <Card className="p-6 border-border shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-accent/10">
            <BookMarked className="w-5 h-5 text-accent" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Chapter Breakdowns</h3>
        </div>
        <div className="text-center py-6 text-muted-foreground">
          <BookMarked className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No chapter data available yet</p>
          <p className="text-xs mt-1">Parse your syllabus outline to populate topics</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 border-border shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent/10">
            <BookMarked className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Chapter Breakdowns</h3>
            <p className="text-sm text-muted-foreground">{topics.length} topics from syllabus</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {topics.map((t, i) => (
          <div key={i} className="p-3 rounded-lg bg-muted/30 border border-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                {t.overallProgress >= 70 ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                ) : t.overallProgress > 0 ? (
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                ) : (
                  <BookMarked className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
                <span className="text-sm font-medium text-foreground truncate">{t.topic}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {t.totalAttempts > 0 && (
                  <span className="text-xs text-muted-foreground">{t.totalAttempts} practice{t.totalAttempts !== 1 ? "s" : ""}</span>
                )}
                <Badge
                  variant="secondary"
                  className={`text-xs ${
                    t.overallProgress >= 70
                      ? "bg-green-500/10 text-green-600"
                      : t.overallProgress >= 40
                      ? "bg-amber-500/10 text-amber-600"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {t.overallProgress}%
                </Badge>
              </div>
            </div>
            <Progress value={t.overallProgress} className="h-1.5" />
          </div>
        ))}
      </div>
    </Card>
  );
};

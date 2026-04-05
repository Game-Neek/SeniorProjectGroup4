import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, Loader2, SmilePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface TopicConfidence {
  focusAreaId: string;
  topic: string;
  rating: number; // 0-5
  quizScore: number | null;
  quizPassed: boolean;
}

interface ConfidenceRatingProps {
  className: string;
}

const STORAGE_KEY_PREFIX = "confidence-ratings";

export const ConfidenceRating = ({ className }: ConfidenceRatingProps) => {
  const [topics, setTopics] = useState<TopicConfidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUserId(session.user.id);

      const { data: areas } = await supabase
        .from("study_focus_areas")
        .select("id, topic, quiz_score, quiz_passed")
        .eq("user_id", session.user.id)
        .eq("class_name", className)
        .order("topic_order", { ascending: true });

      if (!areas || areas.length === 0) {
        setTopics([]);
        setLoading(false);
        return;
      }

      // Load saved ratings from localStorage
      const storageKey = `${STORAGE_KEY_PREFIX}-${session.user.id}-${className}`;
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}") as Record<string, number>;

      setTopics(areas.map(a => ({
        focusAreaId: a.id,
        topic: a.topic,
        rating: saved[a.id] || 0,
        quizScore: a.quiz_score,
        quizPassed: a.quiz_passed,
      })));
    } catch (err) {
      console.error("Confidence rating error:", err);
    } finally {
      setLoading(false);
    }
  }, [className]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = () => load();
    window.addEventListener("syllabus-reparsed", handler);
    return () => window.removeEventListener("syllabus-reparsed", handler);
  }, [load]);

  const setRating = (index: number, rating: number) => {
    const updated = [...topics];
    updated[index] = { ...updated[index], rating };
    setTopics(updated);

    // Persist
    if (userId) {
      const storageKey = `${STORAGE_KEY_PREFIX}-${userId}-${className}`;
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      saved[updated[index].focusAreaId] = rating;
      localStorage.setItem(storageKey, JSON.stringify(saved));
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

  const avgConfidence = topics.filter(t => t.rating > 0).length > 0
    ? (topics.filter(t => t.rating > 0).reduce((a, t) => a + t.rating, 0) / topics.filter(t => t.rating > 0).length).toFixed(1)
    : "—";

  // Find mismatches: high confidence + low quiz score OR low confidence + high quiz score
  const mismatches = topics.filter(t => {
    if (t.rating === 0 || t.quizScore === null) return false;
    const highConf = t.rating >= 4;
    const lowScore = t.quizScore < 60;
    const lowConf = t.rating <= 2;
    const highScore = t.quizScore >= 80;
    return (highConf && lowScore) || (lowConf && highScore);
  });

  return (
    <Card className="p-6 border-border shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <SmilePlus className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Confidence Self-Rating</h3>
            <p className="text-sm text-muted-foreground">Rate how confident you feel per topic</p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          Avg: {avgConfidence}/5
        </Badge>
      </div>

      {mismatches.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            ⚠️ Confidence mismatch detected on {mismatches.length} topic{mismatches.length > 1 ? "s" : ""}
            — your self-rating doesn't match your quiz performance. Consider reviewing those areas.
          </p>
        </div>
      )}

      <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
        {topics.map((item, i) => {
          const isMismatch = mismatches.some(m => m.focusAreaId === item.focusAreaId);
          return (
            <div
              key={item.focusAreaId}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg transition-colors",
                isMismatch ? "bg-amber-500/5 border border-amber-500/10" : "hover:bg-muted/50"
              )}
            >
              <div className="flex-1 min-w-0 mr-3">
                <p className="text-sm font-medium text-foreground truncate">{item.topic}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {item.quizScore !== null && (
                    <span className={cn(
                      "text-xs",
                      item.quizScore >= 70 ? "text-green-600" : item.quizScore >= 40 ? "text-amber-600" : "text-destructive"
                    )}>
                      Quiz: {item.quizScore}%
                    </span>
                  )}
                  {item.quizPassed && (
                    <Badge variant="outline" className="text-[10px] py-0 px-1 bg-green-500/10 text-green-600 border-green-500/20">
                      Passed
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map(star => (
                  <Button
                    key={star}
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 p-0"
                    onClick={() => setRating(i, item.rating === star ? 0 : star)}
                  >
                    <Star
                      className={cn(
                        "w-4 h-4 transition-colors",
                        star <= item.rating
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted-foreground/40"
                      )}
                    />
                  </Button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

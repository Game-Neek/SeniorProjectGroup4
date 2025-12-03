import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrendingUp, FileQuestion, Zap, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface PracticeRecord {
  id: string;
  class_name: string;
  practice_type: string;
  score: number | null;
  total: number | null;
  topics_practiced: string[];
  completed_at: string;
}

interface PracticeHistoryProps {
  className?: string;
}

export const PracticeHistory = ({ className }: PracticeHistoryProps) => {
  const [history, setHistory] = useState<PracticeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, [className]);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('practice_history')
        .select('*')
        .order('completed_at', { ascending: false })
        .limit(10);

      if (className) {
        query = query.eq('class_name', className);
      }

      const { data, error } = await query;

      if (error) throw error;
      setHistory(data || []);
    } catch (error) {
      console.error('Error fetching practice history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate stats
  const quizzes = history.filter(h => h.practice_type === 'mini-quiz');
  const exercises = history.filter(h => h.practice_type === 'exercise');
  
  const avgQuizScore = quizzes.length > 0
    ? Math.round(quizzes.reduce((acc, q) => acc + ((q.score || 0) / (q.total || 1)) * 100, 0) / quizzes.length)
    : 0;

  const totalExercisesCompleted = exercises.reduce((acc, e) => acc + (e.score || 0), 0);

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-1/3"></div>
          <div className="h-20 bg-muted rounded"></div>
        </div>
      </Card>
    );
  }

  if (history.length === 0) {
    return null;
  }

  return (
    <Card className="p-6 shadow-[var(--shadow-soft)] border-border">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10">
          <TrendingUp className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Practice History</h3>
          <p className="text-sm text-muted-foreground">Track your improvement over time</p>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-lg bg-muted/50 text-center">
          <p className="text-2xl font-bold text-foreground">{quizzes.length}</p>
          <p className="text-xs text-muted-foreground">Quizzes Taken</p>
        </div>
        <div className="p-4 rounded-lg bg-muted/50 text-center">
          <p className="text-2xl font-bold text-foreground">{avgQuizScore}%</p>
          <p className="text-xs text-muted-foreground">Avg Quiz Score</p>
        </div>
        <div className="p-4 rounded-lg bg-muted/50 text-center">
          <p className="text-2xl font-bold text-foreground">{totalExercisesCompleted}</p>
          <p className="text-xs text-muted-foreground">Exercises Done</p>
        </div>
      </div>

      {/* Recent Activity */}
      <h4 className="font-medium text-foreground mb-3">Recent Activity</h4>
      <ScrollArea className="h-[200px]">
        <div className="space-y-3 pr-4">
          {history.map((record) => (
            <div
              key={record.id}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border"
            >
              <div className="flex items-center gap-3">
                {record.practice_type === 'mini-quiz' ? (
                  <FileQuestion className="w-5 h-5 text-primary" />
                ) : (
                  <Zap className="w-5 h-5 text-secondary" />
                )}
                <div>
                  <p className="font-medium text-sm text-foreground">{record.class_name}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {record.practice_type.replace('-', ' ')}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <Badge 
                  variant="secondary" 
                  className={`${
                    record.score && record.total && (record.score / record.total) >= 0.8
                      ? "bg-green-500/10 text-green-600"
                      : record.score && record.total && (record.score / record.total) >= 0.5
                        ? "bg-amber-500/10 text-amber-600"
                        : ""
                  }`}
                >
                  {record.score}/{record.total}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 justify-end">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(record.completed_at), 'MMM d')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
};

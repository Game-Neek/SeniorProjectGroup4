import { useState, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Dumbbell, Loader2, ChevronRight, CheckCircle2, Lightbulb, Eye,
  EyeOff, BookOpen, ArrowRight, Target, Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MathText } from "@/components/MathText";
import { QuestionVisual } from "@/components/QuestionVisual";
import { cn } from "@/lib/utils";

interface Problem {
  id: number;
  problem: string;
  hint: string;
  solution: string;
  topic: string;
  bloom_level: string;
  difficulty: string;
  textbook_reference?: string;
  visual_required?: boolean;
  visual_type?: string;
  visual_data?: any;
}

interface PersonalizedPracticeProps {
  className: string;
  learningStyles: string[];
}

const bloomColors: Record<string, string> = {
  remember: "bg-muted text-muted-foreground",
  understand: "bg-blue-500/10 text-blue-600",
  apply: "bg-green-500/10 text-green-600",
  analyze: "bg-amber-500/10 text-amber-600",
  evaluate: "bg-purple-500/10 text-purple-600",
  create: "bg-pink-500/10 text-pink-600",
};

const difficultyColors: Record<string, string> = {
  easy: "bg-green-500/10 text-green-600",
  medium: "bg-amber-500/10 text-amber-600",
  hard: "bg-destructive/10 text-destructive",
};

export const PersonalizedPractice = ({ className, learningStyles }: PersonalizedPracticeProps) => {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [bloomLevel, setBloomLevel] = useState("apply");
  const [isLoading, setIsLoading] = useState(false);
  const [activeProblem, setActiveProblem] = useState<Problem | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<number>>(new Set());
  const [weakAreas, setWeakAreas] = useState<string[]>([]);
  const [masteryScore, setMasteryScore] = useState(0);
  const { toast } = useToast();

  // Load weak areas from study_focus_areas and practice_history
  const loadWeakAreas = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: areas } = await supabase
      .from("study_focus_areas")
      .select("topic, quiz_score, quiz_passed")
      .eq("user_id", session.user.id)
      .eq("class_name", className);

    if (areas) {
      const weak = areas
        .filter(a => !a.quiz_passed || (a.quiz_score !== null && a.quiz_score < 80))
        .map(a => a.topic);
      setWeakAreas(weak.length > 0 ? weak : areas.map(a => a.topic));

      // Compute avg mastery
      const scores = areas.filter(a => a.quiz_score !== null).map(a => a.quiz_score!);
      const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      setMasteryScore(avg);

      // Determine Bloom level from mastery
      if (avg >= 85) setBloomLevel("evaluate");
      else if (avg >= 70) setBloomLevel("analyze");
      else if (avg >= 50) setBloomLevel("apply");
      else if (avg >= 30) setBloomLevel("understand");
      else setBloomLevel("remember");
    }
  }, [className]);

  useEffect(() => { loadWeakAreas(); }, [loadWeakAreas]);

  const generateProblems = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    setIsLoading(true);
    setProblems([]);
    setCompletedIds(new Set());

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-b-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: `Generate personalized practice problems for ${className}` }],
            learningStyles,
            requestType: "personalized-practice",
            className,
            weakAreas,
            bloomLevel,
            masteryScore,
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to generate problems");
      const data = await response.json();
      const generated = data.problems || [];
      if (data.bloom_level) setBloomLevel(data.bloom_level);
      setProblems(generated);
    } catch (err) {
      console.error("Practice generation error:", err);
      toast({ title: "Error", description: "Failed to generate practice problems", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [className, learningStyles, weakAreas, bloomLevel, masteryScore, toast]);

  const completeProblem = async (problemId: number) => {
    const newCompleted = new Set(completedIds);
    newCompleted.add(problemId);
    setCompletedIds(newCompleted);

    // Save to practice_history
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const problem = problems.find(p => p.id === problemId);
      await supabase.from("practice_history").insert({
        user_id: session.user.id,
        class_name: className,
        practice_type: "personalized-practice",
        score: 1,
        total: 1,
        topics_practiced: problem ? [problem.topic] : weakAreas,
        metadata: { bloom_level: problem?.bloom_level, difficulty: problem?.difficulty },
      });
    }

    // Check if all complete
    if (newCompleted.size === problems.length) {
      toast({ title: "All Problems Complete! 🎉", description: "Great work! Generate more to continue practicing." });
    }

    setActiveProblem(null);
    setShowHint(false);
    setShowSolution(false);
  };

  const progressPct = problems.length > 0 ? Math.round((completedIds.size / problems.length) * 100) : 0;

  return (
    <>
      <Card className="p-6 border-border shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Dumbbell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Personalized Practice</h3>
              <p className="text-sm text-muted-foreground">
                {weakAreas.length > 0
                  ? `Targeting ${weakAreas.length} weak area${weakAreas.length !== 1 ? "s" : ""}`
                  : "Generate problems from your weak areas"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("text-xs capitalize", bloomColors[bloomLevel])}>
              {bloomLevel}
            </Badge>
            <Button
              size="sm"
              onClick={generateProblems}
              disabled={isLoading || weakAreas.length === 0}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : problems.length > 0 ? (
                <>
                  <Zap className="w-4 h-4 mr-1" />
                  New Set
                </>
              ) : (
                <>
                  <Target className="w-4 h-4 mr-1" />
                  Generate
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Removed progress bar per design spec */}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Generating practice problems...</p>
              <p className="text-xs text-muted-foreground">Targeting your weak areas at {bloomLevel} level</p>
            </div>
          </div>
        ) : problems.length === 0 ? (
          <div className="text-center py-8">
            <Dumbbell className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground">
              {weakAreas.length === 0
                ? "Generate a study plan first to identify weak areas"
                : "Click Generate to create practice problems tailored to your needs"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {problems.map((p) => {
              const done = completedIds.has(p.id);
              return (
                <div
                  key={p.id}
                  className={cn(
                    "p-3 rounded-lg border transition-all cursor-pointer",
                    done ? "bg-green-500/5 border-green-500/20" : "bg-card border-border hover:border-primary/50"
                  )}
                  onClick={() => !done && setActiveProblem(p)}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0",
                      done ? "bg-green-500/10 text-green-500" : "bg-primary/10 text-primary"
                    )}>
                      {done ? <CheckCircle2 className="w-4 h-4" /> : p.id}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-medium truncate", done ? "text-green-600" : "text-foreground")}>
                        {p.topic}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className={cn("text-xs py-0 capitalize", difficultyColors[p.difficulty])}>
                          {p.difficulty}
                        </Badge>
                        <Badge variant="outline" className={cn("text-xs py-0 capitalize", bloomColors[p.bloom_level])}>
                          {p.bloom_level}
                        </Badge>
                        {p.textbook_reference && (
                          <span className="text-xs text-muted-foreground truncate">📖 {p.textbook_reference}</span>
                        )}
                      </div>
                    </div>
                    {!done && <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Problem Detail Dialog */}
      <Dialog open={!!activeProblem} onOpenChange={() => { setActiveProblem(null); setShowHint(false); setShowSolution(false); }}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Dumbbell className="w-5 h-5 text-primary" />
              Problem {activeProblem?.id} — {activeProblem?.topic}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              <Badge variant="outline" className={cn("text-xs capitalize", difficultyColors[activeProblem?.difficulty || ""])}>
                {activeProblem?.difficulty}
              </Badge>
              <Badge variant="outline" className={cn("text-xs capitalize", bloomColors[activeProblem?.bloom_level || ""])}>
                {activeProblem?.bloom_level}
              </Badge>
              {activeProblem?.textbook_reference && (
                <span className="text-xs text-muted-foreground">📖 {activeProblem.textbook_reference}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[55vh] pr-4">
            <div className="space-y-4">
              {/* Problem Statement */}
              <div className="p-4 rounded-lg border border-border bg-muted/30">
                <h4 className="text-sm font-semibold text-foreground mb-2">Problem</h4>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <MathText text={activeProblem?.problem || ""} />
                </div>
              </div>

              {/* Visual */}
              {activeProblem?.visual_required && activeProblem.visual_data && (
                <QuestionVisual
                  visualType={activeProblem.visual_type || "none"}
                  visualData={activeProblem.visual_data}
                />
              )}

              {/* Hint */}
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowHint(!showHint)}
                  className="mb-2"
                >
                  {showHint ? <EyeOff className="w-4 h-4 mr-1" /> : <Lightbulb className="w-4 h-4 mr-1" />}
                  {showHint ? "Hide Hint" : "Show Hint"}
                </Button>
                {showHint && (
                  <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                    <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                      <MathText text={activeProblem?.hint || ""} />
                    </div>
                  </div>
                )}
              </div>

              {/* Solution */}
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSolution(!showSolution)}
                  className="mb-2"
                >
                  {showSolution ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                  {showSolution ? "Hide Solution" : "Show Solution"}
                </Button>
                {showSolution && (
                  <div className="p-3 rounded-lg border border-green-500/20 bg-green-500/5">
                    <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                      <MathText text={activeProblem?.solution || ""} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => { setActiveProblem(null); setShowHint(false); setShowSolution(false); }}>
              Skip
            </Button>
            <Button onClick={() => activeProblem && completeProblem(activeProblem.id)}>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Mark Complete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

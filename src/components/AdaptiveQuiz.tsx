import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Loader2, CheckCircle2, XCircle, ArrowRight, Brain,
  Wrench, Search, Scale, Sparkles, Lightbulb, TrendingUp, Target, Zap
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MathText } from "@/components/MathText";
import { useTrackEvent } from "@/hooks/useTrackEvent";
import { cn } from "@/lib/utils";

interface AdaptiveQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  bloom_level: string;
  difficulty_value: number;
  misconception?: string;
  topic: string;
  trap_explanation?: string;
}

interface PerformanceEntry {
  questionId: number;
  correct: boolean;
  difficulty: number;
  bloomLevel: string;
  topic: string;
}

interface AdaptiveQuizProps {
  isOpen: boolean;
  onClose: (score?: number, total?: number) => void;
  className: string;
  topic?: string;
}

const BLOOM_CONFIG: Record<string, { label: string; emoji: string; color: string; Icon: any }> = {
  remember: { label: "Recall", emoji: "📝", color: "bg-red-500/10 text-red-700 border-red-500/20", Icon: Brain },
  understand: { label: "Understand", emoji: "💡", color: "bg-orange-500/10 text-orange-700 border-orange-500/20", Icon: Lightbulb },
  apply: { label: "Application", emoji: "🔧", color: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20", Icon: Wrench },
  analyze: { label: "Analysis", emoji: "🔬", color: "bg-green-500/10 text-green-700 border-green-500/20", Icon: Search },
  evaluate: { label: "Evaluation", emoji: "⚖️", color: "bg-blue-500/10 text-blue-700 border-blue-500/20", Icon: Scale },
  create: { label: "Create", emoji: "✨", color: "bg-purple-500/10 text-purple-700 border-purple-500/20", Icon: Sparkles },
};

const DIFFICULTY_LABELS: Record<string, string> = {
  foundational: "Foundational",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export function AdaptiveQuiz({ isOpen, onClose, className, topic }: AdaptiveQuizProps) {
  const [questions, setQuestions] = useState<AdaptiveQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [performanceHistory, setPerformanceHistory] = useState<PerformanceEntry[]>([]);
  const [adaptiveParams, setAdaptiveParams] = useState<any>(null);
  const [round, setRound] = useState(1);
  const { toast } = useToast();
  const { track, snapshotWeek } = useTrackEvent();

  const fetchQuestions = useCallback(async (history: PerformanceEntry[] = []) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("adaptive-quiz", {
        body: {
          className,
          topic: topic || undefined,
          performanceHistory: history,
          questionCount: 5,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setQuestions(data.questions || []);
      setAdaptiveParams(data.adaptiveParams);
      setCurrentIndex(0);
      setSelectedAnswer(null);
      setIsAnswered(false);
    } catch (err) {
      console.error("Adaptive quiz error:", err);
      toast({
        title: "Quiz generation failed",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [className, topic, toast]);

  const startQuiz = () => {
    setScore(0);
    setPerformanceHistory([]);
    setIsComplete(false);
    setRound(1);
    fetchQuestions([]);
  };

  const handleAnswer = () => {
    if (selectedAnswer === null) return;
    setIsAnswered(true);

    const q = questions[currentIndex];
    const correct = selectedAnswer === q.correctIndex;
    if (correct) setScore((p) => p + 1);

    const entry: PerformanceEntry = {
      questionId: q.id,
      correct,
      difficulty: q.difficulty_value,
      bloomLevel: q.bloom_level,
      topic: q.topic,
    };
    setPerformanceHistory((prev) => [...prev, entry]);
  };

  const handleNext = async () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((p) => p + 1);
      setSelectedAnswer(null);
      setIsAnswered(false);
    } else {
      // Round complete — offer adaptive continuation or finish
      const totalAnswered = performanceHistory.length;
      const totalCorrect = performanceHistory.filter((p) => p.correct).length + (selectedAnswer === questions[currentIndex]?.correctIndex ? 1 : 0);

      // Save practice history
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await supabase.from("practice_history").insert({
            user_id: session.user.id,
            class_name: className,
            practice_type: "adaptive-quiz",
            score: totalCorrect,
            total: totalAnswered,
            topics_practiced: [...new Set(performanceHistory.map((p) => p.topic))],
            metadata: {
              round,
              adaptiveParams,
              bloomDistribution: performanceHistory.reduce((acc: any, p) => {
                acc[p.bloomLevel] = (acc[p.bloomLevel] || 0) + 1;
                return acc;
              }, {}),
            },
          });
        }
      } catch (e) {
        console.error("Failed to save adaptive quiz:", e);
      }

      track({
        eventType: "quiz_completed",
        className,
        score: totalCorrect,
        total: totalAnswered,
        outcome: totalCorrect / totalAnswered >= 0.7 ? "pass" : "needs_improvement",
        metadata: { adaptive: true, round, difficultyTier: adaptiveParams?.difficultyTier },
      });
      snapshotWeek(className);

      setScore(totalCorrect);
      setIsComplete(true);
    }
  };

  const continueAdaptive = () => {
    setRound((r) => r + 1);
    setIsComplete(false);
    fetchQuestions(performanceHistory);
  };

  const currentQuestion = questions[currentIndex];
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Adaptive Quiz: {className}
          </DialogTitle>
          <DialogDescription>
            {adaptiveParams ? (
              <span className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">
                  <Target className="w-3 h-3 mr-1" />
                  θ = {adaptiveParams.estimatedTheta}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Bloom: {adaptiveParams.targetBloom}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {DIFFICULTY_LABELS[adaptiveParams.difficultyTier] || adaptiveParams.difficultyTier}
                </Badge>
                {round > 1 && <Badge variant="secondary" className="text-xs">Round {round}</Badge>}
              </span>
            ) : (
              "Difficulty adapts to your performance in real-time"
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Start Screen */}
        {questions.length === 0 && !isLoading && !isComplete && (
          <div className="text-center py-8 space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <TrendingUp className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Adaptive Assessment</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Questions will adjust difficulty based on your answers. Start easy, work your way up.
              </p>
            </div>
            {topic && <Badge variant="secondary">{topic}</Badge>}
            <Button onClick={startQuiz} className="mt-4 gap-2">
              <Zap className="w-4 h-4" /> Begin Adaptive Quiz
            </Button>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">
              {round > 1 ? "Calibrating next round to your level…" : "Generating calibrated questions…"}
            </p>
          </div>
        )}

        {/* Quiz In Progress */}
        {questions.length > 0 && !isComplete && !isLoading && currentQuestion && (
          <div className="space-y-5">
            {/* Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Question {currentIndex + 1} of {questions.length}</span>
                <span>Score: {performanceHistory.filter((p) => p.correct).length + (isAnswered && selectedAnswer === currentQuestion.correctIndex ? 1 : 0)}/{performanceHistory.length + (isAnswered ? 1 : 0)}</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {/* Question */}
            <div className="p-4 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {currentQuestion.bloom_level && BLOOM_CONFIG[currentQuestion.bloom_level] && (() => {
                  const cfg = BLOOM_CONFIG[currentQuestion.bloom_level];
                  const BloomIcon = cfg.Icon;
                  return (
                    <Badge variant="outline" className={`text-xs ${cfg.color}`}>
                      <BloomIcon className="w-3 h-3 mr-1" />
                      {cfg.emoji} {cfg.label}
                    </Badge>
                  );
                })()}
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  Difficulty: {Math.round(currentQuestion.difficulty_value * 100)}%
                </Badge>
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  {currentQuestion.topic}
                </Badge>
              </div>
              <p className="font-medium text-foreground"><MathText text={currentQuestion.question} /></p>
            </div>

            {/* Options */}
            <RadioGroup
              value={selectedAnswer?.toString()}
              onValueChange={(val) => !isAnswered && setSelectedAnswer(parseInt(val))}
              className="space-y-3"
            >
              {currentQuestion.options.map((option, idx) => {
                const isCorrect = idx === currentQuestion.correctIndex;
                const isSelected = selectedAnswer === idx;

                let optionClass = "border-border";
                if (isAnswered) {
                  if (isCorrect) optionClass = "border-green-500 bg-green-500/10";
                  else if (isSelected && !isCorrect) optionClass = "border-destructive bg-destructive/10";
                }

                return (
                  <div
                    key={idx}
                    className={`flex items-center space-x-3 p-3 rounded-lg border transition-all ${optionClass} ${!isAnswered ? "hover:border-primary/50 cursor-pointer" : ""}`}
                  >
                    <RadioGroupItem value={idx.toString()} id={`aq-${idx}`} disabled={isAnswered} />
                    <Label htmlFor={`aq-${idx}`} className={`flex-1 ${isAnswered ? "cursor-default" : "cursor-pointer"}`}>
                      <MathText text={option} />
                    </Label>
                    {isAnswered && isCorrect && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                    {isAnswered && isSelected && !isCorrect && <XCircle className="w-5 h-5 text-destructive" />}
                  </div>
                );
              })}
            </RadioGroup>

            {/* Explanation */}
            {isAnswered && (
              <div className={cn(
                "p-4 rounded-lg border",
                selectedAnswer === currentQuestion.correctIndex
                  ? "bg-green-500/5 border-green-500/20"
                  : "bg-destructive/5 border-destructive/20"
              )}>
                <p className="text-sm text-foreground">
                  <strong>Explanation:</strong> <MathText text={currentQuestion.explanation} />
                </p>
                {selectedAnswer !== currentQuestion.correctIndex && currentQuestion.trap_explanation && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <p className="text-sm text-destructive">
                      <strong>Common mistake:</strong> <MathText text={currentQuestion.trap_explanation} />
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2">
              {!isAnswered ? (
                <Button onClick={handleAnswer} disabled={selectedAnswer === null}>
                  Submit Answer
                </Button>
              ) : (
                <Button onClick={handleNext}>
                  {currentIndex < questions.length - 1 ? (
                    <>Next <ArrowRight className="ml-1 w-4 h-4" /></>
                  ) : (
                    "See Results"
                  )}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Results */}
        {isComplete && (
          <div className="text-center py-8 space-y-4">
            <div className={`text-5xl font-bold ${score / performanceHistory.length >= 0.8 ? "text-emerald-500" : score / performanceHistory.length >= 0.5 ? "text-amber-500" : "text-destructive"}`}>
              {score}/{performanceHistory.length}
            </div>
            <p className="text-lg font-medium text-foreground">
              {score / performanceHistory.length >= 0.8
                ? "Excellent! Ready for harder challenges."
                : score / performanceHistory.length >= 0.5
                  ? "Good effort — the next round will adjust."
                  : "Keep going — the quiz will adapt to help you."}
            </p>

            {adaptiveParams && (
              <div className="flex items-center gap-2 justify-center flex-wrap">
                <Badge variant="outline" className="text-xs">Ability: θ = {adaptiveParams.estimatedTheta}</Badge>
                <Badge variant="outline" className="text-xs">Bloom target: {adaptiveParams.targetBloom}</Badge>
                <Badge variant="outline" className="text-xs">Round {round}</Badge>
              </div>
            )}

            <div className="flex justify-center gap-3 pt-4 flex-wrap">
              <Button onClick={continueAdaptive} className="gap-2">
                <TrendingUp className="w-4 h-4" />
                Continue (Adapt Up)
              </Button>
              <Button variant="outline" onClick={() => onClose(score, performanceHistory.length)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

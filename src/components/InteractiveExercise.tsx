import { useState } from "react";
import { MathText } from "@/components/MathText";
import { QuestionVisual } from "@/components/QuestionVisual";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Zap, CheckCircle2, Lightbulb, ArrowRight, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTrackEvent } from "@/hooks/useTrackEvent";
import { useToast } from "@/hooks/use-toast";

interface Exercise {
  id: number;
  problem: string;
  hint: string;
  solution: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  visual_required?: boolean;
  visual_type?: string;
  visual_data?: any;
}

interface InteractiveExerciseProps {
  isOpen: boolean;
  onClose: () => void;
  className: string;
  weakAreas: string[];
  learningStyles: string[];
}

interface ExerciseSet {
  id: number;
  title: string;
  description: string;
  exercises: Exercise[];
}

export const InteractiveExercise = ({ isOpen, onClose, className, weakAreas, learningStyles }: InteractiveExerciseProps) => {
  const [exerciseSets, setExerciseSets] = useState<ExerciseSet[]>([]);
  const [selectedSet, setSelectedSet] = useState<ExerciseSet | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const { toast } = useToast();
  const { track, snapshotWeek } = useTrackEvent();

  const generateSingleSet = async (session: any, topic: string, index: number): Promise<ExerciseSet | null> => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-b-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: [{
              role: "user",
              content: `Generate 5 practice exercises specifically focused on: "${topic}". Each exercise should directly practice this specific topic with a problem, hint, and detailed solution.`
            }],
            learningStyles,
            requestType: "interactive-exercises",
            className,
            weakAreas: [topic],
          }),
        }
      );

      if (!response.ok) return null;

      const data = await response.json();
      if (data.exercises && data.exercises.length > 0) {
        // Truncate long topic names for title
        const shortTopic = topic.length > 40 ? topic.substring(0, 40) + "..." : topic;
        return {
          id: index + 1,
          title: shortTopic,
          description: topic,
          exercises: data.exercises.slice(0, 5)
        };
      }
      return null;
    } catch {
      return null;
    }
  };

  const generateExerciseSets = async () => {
    setIsLoading(true);
    setExerciseSets([]);
    setSelectedSet(null);
    setExercises([]);
    setCurrentIndex(0);
    setUserAnswer("");
    setShowHint(false);
    setShowSolution(false);
    setCompleted(new Set());
    setIsComplete(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Generate exercise sets for each weak area (up to 3)
      const topicsToExercise = weakAreas.slice(0, 3);
      const results = await Promise.all(
        topicsToExercise.map((topic, index) => generateSingleSet(session, topic, index))
      );

      const validSets = results.filter((set): set is ExerciseSet => set !== null);
      
      if (validSets.length === 0) {
        throw new Error("No exercise sets generated");
      }
      
      setExerciseSets(validSets);
    } catch (error) {
      console.error("Exercise generation error:", error);
      toast({
        title: "Generation Failed",
        description: "Could not generate exercises. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const selectExerciseSet = (set: ExerciseSet) => {
    setSelectedSet(set);
    setExercises(set.exercises);
  };

  const markComplete = () => {
    setCompleted(prev => new Set(prev).add(currentIndex));
    setShowSolution(true);
  };

  const saveProgress = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      await supabase.from('practice_history').insert({
        user_id: session.user.id,
        class_name: className,
        practice_type: 'exercise',
        score: completed.size,
        total: exercises.length,
        topics_practiced: weakAreas,
        metadata: { exercisesCompleted: Array.from(completed) }
      });
    } catch (error) {
      console.error('Failed to save exercise progress:', error);
    }
  };

  const handleNext = async () => {
    if (currentIndex < exercises.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setUserAnswer("");
      setShowHint(false);
      setShowSolution(false);
    } else {
      setIsComplete(true);
      await saveProgress();
      track({
        eventType: "exercise_completed",
        className,
        score: completed.size,
        total: exercises.length,
        outcome: "completed",
      });
      snapshotWeek(className);
    }
  };

  const currentExercise = exercises[currentIndex];
  const difficultyColors = {
    easy: "bg-green-500/10 text-green-600 border-green-500/20",
    medium: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    hard: "bg-destructive/10 text-destructive border-destructive/20",
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-secondary" />
            Interactive Exercise: {className}
          </DialogTitle>
          <DialogDescription>
            Hands-on practice for your weak areas
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh]">
          {/* Start Screen - Generate Exercise Sets */}
          {exerciseSets.length === 0 && !selectedSet && !isLoading && (
            <div className="text-center py-8 space-y-4">
              <p className="text-muted-foreground">
                Practice problems tailored to help you master:
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {weakAreas.map((area, idx) => (
                  <Badge key={idx} variant="secondary">{area}</Badge>
                ))}
              </div>
              <Button onClick={generateExerciseSets} className="mt-4">
                Generate Exercise Options
              </Button>
            </div>
          )}

          {/* Exercise Set Selection Screen */}
          {exerciseSets.length > 0 && !selectedSet && !isLoading && (
            <div className="space-y-4 pr-4">
              <p className="text-sm text-muted-foreground text-center">
                Choose an exercise set:
              </p>
              <div className="grid gap-3">
                {exerciseSets.map((set) => (
                  <div
                    key={set.id}
                    onClick={() => selectExerciseSet(set)}
                    className="p-4 rounded-lg border border-border bg-card hover:border-secondary/50 hover:shadow-md transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-foreground">{set.title}</h4>
                        <p className="text-sm text-muted-foreground capitalize">{set.description}</p>
                      </div>
                      <Badge variant="secondary">{set.exercises.length} exercises</Badge>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" onClick={generateExerciseSets} className="w-full">
                <RotateCcw className="mr-2 w-4 h-4" />
                Generate New Options
              </Button>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-secondary mb-4" />
              <p className="text-muted-foreground">Creating personalized exercises...</p>
            </div>
          )}

          {/* Exercise In Progress */}
          {exercises.length > 0 && !isComplete && !isLoading && (
            <div className="space-y-6 pr-4">
              {/* Progress */}
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  {exercises.map((_, idx) => (
                    <div
                      key={idx}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border transition-all ${
                        idx === currentIndex
                          ? "bg-secondary text-secondary-foreground border-secondary"
                          : completed.has(idx)
                            ? "bg-green-500 text-white border-green-500"
                            : "bg-muted border-border text-muted-foreground"
                      }`}
                    >
                      {completed.has(idx) ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                    </div>
                  ))}
                </div>
                <Badge className={difficultyColors[currentExercise?.difficulty || "medium"]}>
                  {currentExercise?.difficulty}
                </Badge>
              </div>

              {/* Topic */}
              <Badge variant="outline">{currentExercise?.topic}</Badge>

              {/* Problem */}
              <div className="p-4 rounded-lg bg-muted/50 border border-border">
                <h4 className="font-semibold text-foreground mb-2">Problem:</h4>
                <p className="text-foreground whitespace-pre-wrap"><MathText text={currentExercise?.problem || ""} /></p>
                {/* Visual rendering */}
                {currentExercise?.visual_required && currentExercise?.visual_type && currentExercise?.visual_data && (
                  <QuestionVisual visualType={currentExercise.visual_type} visualData={currentExercise.visual_data} />
                )}
              </div>

              {/* User Answer Area */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Your Work:</label>
                <Textarea
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  placeholder="Work through the problem here..."
                  className="min-h-[120px] resize-none"
                  disabled={showSolution}
                />
              </div>

              {/* Hint Section */}
              {!showHint && !showSolution && (
                <Button variant="outline" onClick={() => setShowHint(true)} className="w-full">
                  <Lightbulb className="mr-2 w-4 h-4" />
                  Show Hint
                </Button>
              )}

              {showHint && !showSolution && (
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="w-4 h-4 text-amber-600" />
                    <span className="font-medium text-foreground">Hint</span>
                  </div>
                  <p className="text-sm text-foreground"><MathText text={currentExercise?.hint || ""} /></p>
                </div>
              )}

              {/* Solution Section */}
              {showSolution && (
                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="font-medium text-foreground">Solution</span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap"><MathText text={currentExercise?.solution || ""} /></p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-between gap-2 pt-4">
                {!showSolution ? (
                  <Button onClick={markComplete} className="flex-1">
                    <CheckCircle2 className="mr-2 w-4 h-4" />
                    Check Solution
                  </Button>
                ) : (
                  <Button onClick={handleNext} className="flex-1">
                    {currentIndex < exercises.length - 1 ? (
                      <>Next Exercise <ArrowRight className="ml-1 w-4 h-4" /></>
                    ) : (
                      "See Summary"
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Completion Screen */}
          {isComplete && (
            <div className="text-center py-8 space-y-4">
              <div className="text-6xl text-green-500">
                <CheckCircle2 className="w-16 h-16 mx-auto" />
              </div>
              <p className="text-lg font-medium text-foreground">
                Great job completing all exercises!
              </p>
              <p className="text-muted-foreground">
                You practiced {completed.size} out of {exercises.length} problems.
              </p>
              <div className="flex justify-center gap-3 pt-4">
                <Button variant="outline" onClick={() => {
                  setSelectedSet(null);
                  setExercises([]);
                  setIsComplete(false);
                }}>
                  <RotateCcw className="mr-2 w-4 h-4" />
                  Choose Another Set
                </Button>
                <Button variant="outline" onClick={generateExerciseSets}>
                  Generate New Sets
                </Button>
                <Button onClick={onClose}>Done</Button>
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

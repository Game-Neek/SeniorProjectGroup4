import { useState, useEffect } from "react";
import { MathText } from "@/components/MathText";
import { QuestionVisual } from "@/components/QuestionVisual";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { FileQuestion, Loader2, BookOpen, RefreshCw, CheckCircle2, XCircle, ArrowRight, Trophy, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { QuizResult } from "@/hooks/useStudyPlan";
import { useTrackEvent } from "@/hooks/useTrackEvent";

interface Syllabus {
  id: string;
  class_name: string;
  file_name: string;
}

interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  visual_required?: boolean;
  visual_type?: string;
  visual_data?: any;
}

interface PlacementQuizProps {
  learningStyles: string[];
  onQuizComplete: (result: QuizResult) => void;
  refreshTrigger?: number;
  completedClasses?: string[];
  className?: string;
}

export const PlacementQuiz = ({ learningStyles, onQuizComplete, refreshTrigger, completedClasses = [], className }: PlacementQuizProps) => {
  const isCourseScoped = !!className;
  const [syllabi, setSyllabi] = useState<Syllabus[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>(className || "");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showResult, setShowResult] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [autoGenTriggered, setAutoGenTriggered] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const { toast } = useToast();
  const { track, snapshotWeek } = useTrackEvent();

  useEffect(() => {
    fetchSyllabi();
  }, [refreshTrigger]);

  const fetchSyllabi = async () => {
    const { data, error } = await supabase
      .from("syllabi")
      .select("id, class_name, file_name")
      .order("uploaded_at", { ascending: false });

    if (!error && data) {
      setSyllabi(data);
    }
  };

  // Auto-generate quiz when on a course-scoped page and syllabus exists
  useEffect(() => {
    if (isCourseScoped && !autoGenTriggered && syllabi.length > 0 && !completedClasses.includes(className!)) {
      const hasSyllabus = syllabi.some(s => s.class_name === className);
      if (hasSyllabus && questions.length === 0 && !isGenerating) {
        setAutoGenTriggered(true);
        setSelectedClass(className!);
        generateQuiz(className!);
      }
    }
  }, [isCourseScoped, syllabi, autoGenTriggered, className, completedClasses]);

  const generateQuiz = async (overrideClass?: string) => {
    const quizClass = overrideClass || selectedClass;
    if (!quizClass) {
      toast({
        title: "Select a class",
        description: "Please select a class to generate a placement quiz",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setAnswers({});
    setShowResult(false);
    setQuizCompleted(false);
    setSelectedAnswer("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-b-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: `Generate an interactive placement quiz for ${quizClass}` }],
            learningStyles,
            requestType: "placement-quiz-interactive",
            className: quizClass,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to generate quiz");
      }

      const data = await response.json();
      
      if (data.questions && Array.isArray(data.questions)) {
        setQuestions(data.questions);
        toast({
          title: "Quiz Generated",
          description: `${data.questions.length} questions ready for ${quizClass}!`,
        });
      } else {
        throw new Error("Invalid quiz format received");
      }
    } catch (error) {
      console.error("Quiz generation error:", error);
      toast({
        title: "Generation Failed",
        description: "Failed to generate placement quiz. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAnswerSelect = (value: string) => {
    setSelectedAnswer(value);
  };

  const handleSubmitAnswer = () => {
    if (!selectedAnswer) return;
    
    // "idk" (I don't know) is treated as -1, always incorrect
    const answerIndex = selectedAnswer === "idk" ? -1 : parseInt(selectedAnswer);
    setAnswers((prev) => ({ ...prev, [currentQuestionIndex]: answerIndex }));
    setShowResult(true);
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
      setSelectedAnswer("");
      setShowResult(false);
    } else {
      // Quiz completed - calculate results
      const weakAreas: string[] = [];
      const strongAreas: string[] = [];
      
      questions.forEach((q, idx) => {
        const userAnswer = answers[idx];
        const isCorrect = userAnswer === q.correctIndex;
        // Extract topic from question (first part before colon or first 50 chars)
        const topic = q.question.split(":")[0].slice(0, 50).trim();
        
        if (isCorrect) {
          if (!strongAreas.includes(topic)) strongAreas.push(topic);
        } else {
          if (!weakAreas.includes(topic)) weakAreas.push(topic);
        }
      });

      const finalScore = calculateScore();
      const result: QuizResult = {
        className: selectedClass,
        score: finalScore,
        totalQuestions: questions.length,
        weakAreas,
        strongAreas,
      };
      
      onQuizComplete(result);
      setQuizCompleted(true);
      track({
        eventType: "placement_quiz_completed",
        className: selectedClass,
        score: finalScore,
        total: questions.length,
        outcome: finalScore >= questions.length * 0.7 ? "pass" : "needs_improvement",
      });
      snapshotWeek(selectedClass);
    }
  };

  const calculateScore = () => {
    let correct = 0;
    Object.entries(answers).forEach(([idx, answer]) => {
      if (questions[parseInt(idx)]?.correctIndex === answer) {
        correct++;
      }
    });
    return correct;
  };

  const restartQuiz = () => {
    setCurrentQuestionIndex(0);
    setAnswers({});
    setShowResult(false);
    setQuizCompleted(false);
    setSelectedAnswer("");
  };

  const currentQuestion = questions[currentQuestionIndex];
  const isCorrect = showResult && currentQuestion && answers[currentQuestionIndex] === currentQuestion.correctIndex;
  const score = calculateScore();
  const percentage = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;

  return (
    <Card className="p-6 shadow-[var(--shadow-soft)] border-border">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-accent/10">
          <FileQuestion className="w-6 h-6 text-accent" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Placement Quiz</h3>
          <p className="text-sm text-muted-foreground">Test your knowledge before diving in</p>
        </div>
      </div>

      {syllabi.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>Upload a syllabus first to generate placement quizzes</p>
          <p className="text-sm">Go to "Class Syllabi" section above</p>
        </div>
      ) : questions.length === 0 && isCourseScoped ? (
        <div className="space-y-4">
           {completedClasses.includes(className!) ? (
             <div className="text-center py-6 space-y-3 opacity-75">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-500/10">
                  <CheckCircle2 className="w-7 h-7 text-green-500" />
                </div>
                <p className="text-base font-semibold text-foreground">Placement Quiz Completed</p>
                <p className="text-sm text-muted-foreground">Your study plan has been generated based on your results.</p>
                <Button variant="ghost" size="sm" className="mt-1 text-muted-foreground" onClick={() => setShowRegenerateConfirm(true)}>
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Retake Quiz
                </Button>
              </div>
          ) : isGenerating ? (
            <div className="text-center py-8">
              <Loader2 className="w-10 h-10 mx-auto mb-3 animate-spin text-primary" />
              <p className="text-foreground font-medium">Generating placement quiz for {className}...</p>
              <p className="text-sm text-muted-foreground">This may take a moment</p>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-muted-foreground">Waiting for syllabus data to generate quiz...</p>
              <Button className="mt-3 bg-[image:var(--gradient-primary)] hover:opacity-90" onClick={() => generateQuiz(className!)}>
                <FileQuestion className="w-4 h-4 mr-2" />
                Generate Quiz
              </Button>
            </div>
          )}
        </div>
      ) : questions.length === 0 ? (
        <div className="space-y-4">
          {/* Show completed classes summary */}
          {completedClasses.length > 0 && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 mb-4">
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                <span className="font-medium">Completed quizzes:</span>
                <span>{completedClasses.join(", ")}</span>
              </div>
            </div>
          )}
          
          {/* Classes without quizzes */}
          {syllabi.filter(s => !completedClasses.includes(s.class_name)).length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Select a class to take a placement quiz:
              </p>
              <div className="flex gap-3">
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a class" />
                  </SelectTrigger>
                  <SelectContent>
                    {syllabi.map((s) => {
                      const isCompleted = completedClasses.includes(s.class_name);
                      return (
                        <SelectItem key={s.id} value={s.class_name}>
                          <div className="flex items-center gap-2">
                            {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                            <span>{s.class_name}</span>
                            {isCompleted && <span className="text-xs text-muted-foreground">(completed)</span>}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => generateQuiz()}
                  disabled={isGenerating || !selectedClass}
                  className="bg-[image:var(--gradient-primary)] hover:opacity-90"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <FileQuestion className="w-4 h-4 mr-2" />
                      {completedClasses.includes(selectedClass) ? "Retake Quiz" : "Generate Quiz"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-500" />
              <p className="text-foreground font-medium">All classes completed!</p>
              <p className="text-sm text-muted-foreground">You can retake any quiz by selecting a class above.</p>
              <div className="flex gap-3 mt-4 justify-center">
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Retake a quiz" />
                  </SelectTrigger>
                  <SelectContent>
                    {syllabi.map((s) => (
                      <SelectItem key={s.id} value={s.class_name}>
                        {s.class_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => generateQuiz()}
                  disabled={isGenerating || !selectedClass}
                  variant="outline"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Retake"}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : quizCompleted ? (
        // Results Screen
        <div className="text-center py-8 space-y-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10">
            <Trophy className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h4 className="text-2xl font-bold text-foreground mb-2">Quiz Complete!</h4>
            <p className="text-muted-foreground">{selectedClass}</p>
          </div>
          <div className="space-y-2">
            <p className="text-4xl font-bold text-primary">{percentage}%</p>
            <p className="text-muted-foreground">
              You got {score} out of {questions.length} correct
            </p>
            <Progress value={percentage} className="h-3 w-48 mx-auto" />
          </div>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={restartQuiz}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry Quiz
            </Button>
            <Button
              onClick={() => {
                setQuestions([]);
                setSelectedClass("");
                setQuizCompleted(false);
              }}
              className="bg-[image:var(--gradient-primary)] hover:opacity-90"
            >
              New Quiz
            </Button>
          </div>
        </div>
      ) : (
        // Quiz Questions
        <div className="space-y-6">
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <Badge variant="secondary">{selectedClass}</Badge>
              <span className="text-muted-foreground">
                Question {currentQuestionIndex + 1} of {questions.length}
              </span>
            </div>
            <Progress value={((currentQuestionIndex + 1) / questions.length) * 100} className="h-2" />
          </div>

          {/* Question */}
          <div className="p-4 rounded-xl bg-muted/30 border border-border">
            <p className="text-lg font-medium text-foreground mb-4"><MathText text={currentQuestion?.question || ""} /></p>

            {/* Visual rendering */}
            {currentQuestion?.visual_required && currentQuestion?.visual_type && currentQuestion?.visual_data && (
              <QuestionVisual visualType={currentQuestion.visual_type} visualData={currentQuestion.visual_data} />
            )}

            <RadioGroup
              value={selectedAnswer}
              onValueChange={handleAnswerSelect}
              disabled={showResult}
              className="space-y-3"
            >
              {currentQuestion?.options.map((option, idx) => {
                const isSelected = selectedAnswer === idx.toString();
                const isCorrectOption = currentQuestion.correctIndex === idx;
                let optionClass = "border-border";
                
                if (showResult) {
                  if (isCorrectOption) {
                    optionClass = "border-green-500 bg-green-500/10";
                  } else if (isSelected && !isCorrectOption) {
                    optionClass = "border-destructive bg-destructive/10";
                  }
                }

                return (
                  <div
                    key={idx}
                    className={`flex items-center space-x-3 p-4 rounded-lg border-2 transition-all ${optionClass} ${
                      !showResult && isSelected ? "border-primary bg-primary/5" : ""
                    } ${!showResult ? "hover:border-primary/50 cursor-pointer" : ""}`}
                    onClick={() => !showResult && handleAnswerSelect(idx.toString())}
                  >
                    <RadioGroupItem value={idx.toString()} id={`option-${idx}`} />
                    <Label
                      htmlFor={`option-${idx}`}
                      className={`flex-1 cursor-pointer ${showResult ? "cursor-default" : ""}`}
                    >
                      <MathText text={option} />
                    </Label>
                    {showResult && isCorrectOption && (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    )}
                    {showResult && isSelected && !isCorrectOption && (
                      <XCircle className="w-5 h-5 text-destructive" />
                    )}
                  </div>
                );
              })}
              
              {/* I don't know option */}
              {currentQuestion && (
                <div
                  className={`flex items-center space-x-3 p-4 rounded-lg border-2 transition-all border-dashed ${
                    showResult
                      ? selectedAnswer === "idk"
                        ? "border-amber-500 bg-amber-500/10"
                        : "border-border"
                      : selectedAnswer === "idk"
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/30 hover:border-primary/50 cursor-pointer"
                  }`}
                  onClick={() => !showResult && handleAnswerSelect("idk")}
                >
                  <RadioGroupItem value="idk" id="option-idk" />
                  <Label
                    htmlFor="option-idk"
                    className={`flex-1 cursor-pointer italic text-muted-foreground ${showResult ? "cursor-default" : ""}`}
                  >
                    I don't know
                  </Label>
                  {showResult && selectedAnswer === "idk" && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Skipped</span>
                  )}
                </div>
              )}
            </RadioGroup>
          </div>

          {/* Explanation (shown after answering) */}
          {showResult && currentQuestion?.explanation && (
            <div className={`p-4 rounded-lg border ${isCorrect ? "bg-green-500/5 border-green-500/20" : "bg-amber-500/5 border-amber-500/20"}`}>
              <p className="text-sm font-medium mb-1">{isCorrect ? "✓ Correct!" : "✗ Not quite right"}</p>
              <p className="text-sm text-muted-foreground"><MathText text={currentQuestion.explanation} /></p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            {!showResult ? (
              <Button
                onClick={handleSubmitAnswer}
                disabled={!selectedAnswer}
                className="bg-[image:var(--gradient-primary)] hover:opacity-90"
              >
                Submit Answer
              </Button>
            ) : (
              <Button
                onClick={handleNextQuestion}
                className="bg-[image:var(--gradient-primary)] hover:opacity-90"
              >
                {currentQuestionIndex < questions.length - 1 ? (
                  <>
                    Next Question
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                ) : (
                  <>
                    See Results
                    <Trophy className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={showRegenerateConfirm} onOpenChange={setShowRegenerateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Regenerate Placement Quiz?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will regenerate the placement quiz for <span className="font-medium text-foreground">{className}</span> and <strong className="text-destructive">reset the following</strong>:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Course progress &amp; focus areas</li>
                  <li>Adaptive learning modules</li>
                  <li>Knowledge gap alerts</li>
                  <li>Topic checklist status</li>
                  <li>Study resources &amp; study plan</li>
                </ul>
                <p className="text-sm font-medium text-destructive">This action cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setAutoGenTriggered(false);
                generateQuiz(className!);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reset &amp; Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

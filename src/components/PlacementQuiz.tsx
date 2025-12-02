import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { FileQuestion, Loader2, BookOpen, RefreshCw, CheckCircle2, XCircle, ArrowRight, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
}

interface PlacementQuizProps {
  learningStyles: string[];
}

export const PlacementQuiz = ({ learningStyles }: PlacementQuizProps) => {
  const [syllabi, setSyllabi] = useState<Syllabus[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showResult, setShowResult] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSyllabi();
  }, []);

  const fetchSyllabi = async () => {
    const { data, error } = await supabase
      .from("syllabi")
      .select("id, class_name, file_name")
      .order("uploaded_at", { ascending: false });

    if (!error && data) {
      setSyllabi(data);
    }
  };

  const generateQuiz = async () => {
    if (!selectedClass) {
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
            messages: [{ role: "user", content: `Generate an interactive placement quiz for ${selectedClass}` }],
            learningStyles,
            requestType: "placement-quiz-interactive",
            className: selectedClass,
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
          description: `${data.questions.length} questions ready for ${selectedClass}!`,
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
    
    const answerIndex = parseInt(selectedAnswer);
    setAnswers((prev) => ({ ...prev, [currentQuestionIndex]: answerIndex }));
    setShowResult(true);
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
      setSelectedAnswer("");
      setShowResult(false);
    } else {
      setQuizCompleted(true);
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
      ) : questions.length === 0 ? (
        <div className="space-y-4">
          <div className="flex gap-3">
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select a class" />
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
              onClick={generateQuiz}
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
                  Generate Quiz
                </>
              )}
            </Button>
          </div>
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
            <p className="text-lg font-medium text-foreground mb-6">{currentQuestion?.question}</p>

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
                      {option}
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
            </RadioGroup>
          </div>

          {/* Explanation (shown after answering) */}
          {showResult && currentQuestion?.explanation && (
            <div className={`p-4 rounded-lg border ${isCorrect ? "bg-green-500/5 border-green-500/20" : "bg-amber-500/5 border-amber-500/20"}`}>
              <p className="text-sm font-medium mb-1">{isCorrect ? "✓ Correct!" : "✗ Not quite right"}</p>
              <p className="text-sm text-muted-foreground">{currentQuestion.explanation}</p>
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
    </Card>
  );
};

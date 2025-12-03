import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, XCircle, FileQuestion, ArrowRight, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Question {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface MiniQuizProps {
  isOpen: boolean;
  onClose: () => void;
  className: string;
  weakAreas: string[];
  learningStyles: string[];
}

export const MiniQuiz = ({ isOpen, onClose, className, weakAreas, learningStyles }: MiniQuizProps) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const { toast } = useToast();

  const generateQuiz = async () => {
    setIsLoading(true);
    setQuestions([]);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setScore(0);
    setIsComplete(false);

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
            messages: [{
              role: "user",
              content: `Generate a quick 5-question mini-quiz focusing on these weak areas: ${weakAreas.join(", ")}. Make questions targeted and helpful for reviewing these specific topics.`
            }],
            learningStyles,
            requestType: "mini-quiz",
            className,
            weakAreas,
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to generate quiz");

      const data = await response.json();
      if (data.questions && data.questions.length > 0) {
        setQuestions(data.questions.slice(0, 5));
      } else {
        throw new Error("No questions returned");
      }
    } catch (error) {
      console.error("Mini quiz error:", error);
      toast({
        title: "Quiz Generation Failed",
        description: "Could not generate quiz. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswer = () => {
    if (selectedAnswer === null) return;
    
    setIsAnswered(true);
    if (selectedAnswer === questions[currentIndex].correctIndex) {
      setScore(prev => prev + 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setIsAnswered(false);
    } else {
      setIsComplete(true);
    }
  };

  const currentQuestion = questions[currentIndex];
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileQuestion className="w-5 h-5 text-primary" />
            Mini Quiz: {className}
          </DialogTitle>
          <DialogDescription>
            Quick review of your weak areas
          </DialogDescription>
        </DialogHeader>

        {/* Start Screen */}
        {questions.length === 0 && !isLoading && (
          <div className="text-center py-8 space-y-4">
            <p className="text-muted-foreground">
              This mini-quiz will test your understanding of:
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {weakAreas.map((area, idx) => (
                <Badge key={idx} variant="secondary">{area}</Badge>
              ))}
            </div>
            <Button onClick={generateQuiz} className="mt-4">
              Start Mini Quiz
            </Button>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Generating your personalized quiz...</p>
          </div>
        )}

        {/* Quiz In Progress */}
        {questions.length > 0 && !isComplete && !isLoading && (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Question {currentIndex + 1} of {questions.length}</span>
                <span>Score: {score}/{currentIndex + (isAnswered ? 1 : 0)}</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <div className="p-4 rounded-lg bg-muted/50 border border-border">
              <p className="font-medium text-foreground">{currentQuestion?.question}</p>
            </div>

            <RadioGroup
              value={selectedAnswer?.toString()}
              onValueChange={(val) => !isAnswered && setSelectedAnswer(parseInt(val))}
              className="space-y-3"
            >
              {currentQuestion?.options.map((option, idx) => {
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
                    <RadioGroupItem 
                      value={idx.toString()} 
                      id={`option-${idx}`} 
                      disabled={isAnswered}
                    />
                    <Label 
                      htmlFor={`option-${idx}`} 
                      className={`flex-1 cursor-pointer ${isAnswered ? "cursor-default" : ""}`}
                    >
                      {option}
                    </Label>
                    {isAnswered && isCorrect && (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    )}
                    {isAnswered && isSelected && !isCorrect && (
                      <XCircle className="w-5 h-5 text-destructive" />
                    )}
                  </div>
                );
              })}
            </RadioGroup>

            {isAnswered && (
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-sm text-foreground">
                  <strong>Explanation:</strong> {currentQuestion?.explanation}
                </p>
              </div>
            )}

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

        {/* Results Screen */}
        {isComplete && (
          <div className="text-center py-8 space-y-4">
            <div className={`text-6xl ${score >= questions.length * 0.8 ? "text-green-500" : score >= questions.length * 0.5 ? "text-amber-500" : "text-destructive"}`}>
              {score}/{questions.length}
            </div>
            <p className="text-lg font-medium text-foreground">
              {score >= questions.length * 0.8 
                ? "Excellent work!" 
                : score >= questions.length * 0.5 
                  ? "Good effort! Keep practicing." 
                  : "Keep studying these topics."}
            </p>
            <div className="flex justify-center gap-3 pt-4">
              <Button variant="outline" onClick={generateQuiz}>
                <RotateCcw className="mr-2 w-4 h-4" />
                Try Again
              </Button>
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

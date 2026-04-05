import { useState } from "react";
import { MathText } from "@/components/MathText";
import { QuestionVisual } from "@/components/QuestionVisual";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, ArrowRight, Lightbulb, Eye, EyeOff, Trophy, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PracticeQuestion {
  id: number;
  question: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  hint?: string;
  bloom_level?: string;
  visual_required?: boolean;
  visual_type?: string;
  visual_data?: any;
}

interface PracticeRendererProps {
  content: string;
  onComplete?: () => void;
}

/** Try to parse practice questions from structured content */
const parseQuestions = (content: string): PracticeQuestion[] => {
  // Try JSON parse first (if content is JSON array)
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
  } catch {}

  // Parse markdown-style questions
  const questions: PracticeQuestion[] = [];
  const questionBlocks = content.split(/(?=^(?:#{1,3}\s*)?(?:Question|Problem|Q)\s*\d+)/mi).filter(Boolean);

  questionBlocks.forEach((block, idx) => {
    const lines = block.trim().split("\n").filter(l => l.trim());
    if (lines.length < 2) return;

    const questionText = lines[0].replace(/^(?:#{1,3}\s*)?(?:Question|Problem|Q)\s*\d+[.:)]\s*/i, "").trim();
    const options: string[] = [];
    let correctIndex = -1;
    let explanation = "";
    let hint = "";

    lines.slice(1).forEach(line => {
      const optMatch = line.trim().match(/^([A-Da-d])[.)]\s+(.+)/);
      if (optMatch) {
        options.push(optMatch[2]);
        if (line.includes("✓") || line.includes("(correct)")) {
          correctIndex = options.length - 1;
        }
      }
      const explMatch = line.trim().match(/^(?:Explanation|Answer)[.:]\s*(.+)/i);
      if (explMatch) explanation = explMatch[1];
      const hintMatch = line.trim().match(/^Hint[.:]\s*(.+)/i);
      if (hintMatch) hint = hintMatch[1];
    });

    if (questionText) {
      questions.push({
        id: idx + 1,
        question: questionText,
        options: options.length >= 2 ? options : undefined,
        correctIndex: correctIndex >= 0 ? correctIndex : undefined,
        explanation: explanation || undefined,
        hint: hint || undefined,
      });
    }
  });

  return questions;
};

export const PracticeRenderer = ({ content, onComplete }: PracticeRendererProps) => {
  const questions = parseQuestions(content);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  if (questions.length === 0) {
    // Fallback: render as rich text
    return (
      <div className="space-y-2">
        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
          <MathText text={content} />
        </p>
      </div>
    );
  }

  const current = questions[currentIdx];
  const progress = ((currentIdx + 1) / questions.length) * 100;

  const handleSubmit = () => {
    if (selectedAnswer === null) return;
    setIsAnswered(true);
    if (current.correctIndex !== undefined && selectedAnswer === current.correctIndex) {
      setScore(prev => prev + 1);
    }
  };

  const handleNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(prev => prev + 1);
      setSelectedAnswer(null);
      setIsAnswered(false);
      setShowHint(false);
    } else {
      setIsComplete(true);
    }
  };

  const handleRestart = () => {
    setCurrentIdx(0);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setScore(0);
    setShowHint(false);
    setIsComplete(false);
  };

  if (isComplete) {
    const pct = questions.some(q => q.correctIndex !== undefined)
      ? Math.round((score / questions.filter(q => q.correctIndex !== undefined).length) * 100)
      : null;

    return (
      <div className="text-center py-6 space-y-4">
        <Trophy className={cn(
          "w-12 h-12 mx-auto",
          pct !== null && pct >= 80 ? "text-green-500" : pct !== null && pct >= 50 ? "text-amber-500" : "text-primary"
        )} />
        <div>
          <h4 className="text-lg font-bold text-foreground">Practice Complete!</h4>
          {pct !== null && (
            <p className="text-2xl font-bold text-primary mt-1">{pct}%</p>
          )}
          <p className="text-sm text-muted-foreground mt-1">
            {questions.length} questions completed
          </p>
        </div>
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRestart}>
            <RotateCcw className="w-4 h-4 mr-1" />
            Retry
          </Button>
          {onComplete && (
            <Button size="sm" onClick={onComplete}>
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Mark Complete
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Question {currentIdx + 1} of {questions.length}</span>
          {questions.some(q => q.correctIndex !== undefined) && (
            <span>Score: {score}/{currentIdx + (isAnswered ? 1 : 0)}</span>
          )}
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      {/* Question */}
      <div className="p-4 rounded-lg border border-border bg-muted/30">
        {current.bloom_level && (
          <Badge variant="outline" className="text-xs capitalize mb-2">
            {current.bloom_level}
          </Badge>
        )}
        <p className="font-medium text-foreground">
          <MathText text={current.question} />
        </p>
        {current.visual_required && current.visual_type && current.visual_data && (
          <QuestionVisual visualType={current.visual_type} visualData={current.visual_data} />
        )}
      </div>

      {/* Multiple choice options */}
      {current.options && current.options.length > 0 ? (
        <RadioGroup
          value={selectedAnswer?.toString()}
          onValueChange={(val) => !isAnswered && setSelectedAnswer(parseInt(val))}
          className="space-y-2"
        >
          {current.options.map((opt, idx) => {
            const isCorrect = idx === current.correctIndex;
            const isSelected = selectedAnswer === idx;
            let optClass = "border-border";
            if (isAnswered) {
              if (isCorrect) optClass = "border-green-500 bg-green-500/10";
              else if (isSelected && !isCorrect) optClass = "border-destructive bg-destructive/10";
            }
            return (
              <div
                key={idx}
                className={cn(
                  "flex items-center space-x-3 p-3 rounded-lg border transition-all",
                  optClass,
                  !isAnswered && "hover:border-primary/50 cursor-pointer"
                )}
                onClick={() => !isAnswered && setSelectedAnswer(idx)}
              >
                <RadioGroupItem value={idx.toString()} id={`pq-${currentIdx}-${idx}`} disabled={isAnswered} />
                <Label htmlFor={`pq-${currentIdx}-${idx}`} className={cn("flex-1 cursor-pointer text-sm", isAnswered && "cursor-default")}>
                  <MathText text={opt} />
                </Label>
                {isAnswered && isCorrect && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                {isAnswered && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-destructive" />}
              </div>
            );
          })}
        </RadioGroup>
      ) : (
        // Open-ended: just show explanation after revealing
        !isAnswered && (
          <Button variant="outline" size="sm" onClick={() => setIsAnswered(true)}>
            <Eye className="w-4 h-4 mr-1" />
            Show Answer
          </Button>
        )
      )}

      {/* Hint */}
      {current.hint && !isAnswered && (
        <div>
          <Button variant="ghost" size="sm" onClick={() => setShowHint(!showHint)}>
            <Lightbulb className="w-4 h-4 mr-1 text-amber-500" />
            {showHint ? "Hide Hint" : "Show Hint"}
          </Button>
          {showHint && (
            <div className="mt-1 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-sm">
              <MathText text={current.hint} />
            </div>
          )}
        </div>
      )}

      {/* Feedback after answering */}
      {isAnswered && current.explanation && (
        <div className={cn(
          "p-3 rounded-lg border text-sm",
          current.correctIndex !== undefined && selectedAnswer === current.correctIndex
            ? "bg-green-500/5 border-green-500/20"
            : "bg-amber-500/5 border-amber-500/20"
        )}>
          {current.correctIndex !== undefined && (
            <p className="font-medium mb-1">
              {selectedAnswer === current.correctIndex ? "✓ Correct!" : "✗ Not quite right"}
            </p>
          )}
          <MathText text={current.explanation} />
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        {!isAnswered && current.options && current.options.length > 0 ? (
          <Button size="sm" onClick={handleSubmit} disabled={selectedAnswer === null}>
            Submit Answer
          </Button>
        ) : isAnswered ? (
          <Button size="sm" onClick={handleNext}>
            {currentIdx < questions.length - 1 ? (
              <>Next <ArrowRight className="w-4 h-4 ml-1" /></>
            ) : (
              "See Results"
            )}
          </Button>
        ) : null}
      </div>
    </div>
  );
};

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  MessageSquareText, Loader2, Sparkles, Target, BookOpen,
  PenTool, Brain, Lightbulb, ChevronDown, ChevronUp, TrendingUp
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface FeedbackData {
  overallImpression: string;
  contentAccuracy: { score: number; feedback: string };
  organization: { score: number; feedback: string };
  criticalThinking: { score: number; feedback: string };
  writingQuality: { score: number; feedback: string };
  specificSuggestions: string[];
  rubricScores?: { criterion: string; score: number; justification: string }[];
  growthAreas: string[];
  overallScore: number;
}

interface WritingFeedbackProps {
  assignmentId: string;
  assignmentTitle: string;
  className: string;
  parsedContent?: string | null;
  learningObjectives?: string[] | null;
  assessmentType?: string | null;
}

const scoreLabel = (score: number) => {
  if (score >= 3.5) return { text: "Exemplary", color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30" };
  if (score >= 2.5) return { text: "Proficient", color: "text-blue-600 bg-blue-500/10 border-blue-500/30" };
  if (score >= 1.5) return { text: "Developing", color: "text-amber-600 bg-amber-500/10 border-amber-500/30" };
  return { text: "Beginning", color: "text-red-600 bg-red-500/10 border-red-500/30" };
};

const ScoreBar = ({ label, score, feedback, icon: Icon }: { label: string; score: number; feedback: string; icon: typeof Target }) => {
  const [expanded, setExpanded] = useState(false);
  const sl = scoreLabel(score);

  return (
    <div className="border border-border rounded-lg p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3"
      >
        <Icon className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-sm font-medium text-foreground flex-1 text-left">{label}</span>
        <div className="flex items-center gap-2">
          <Progress value={(score / 4) * 100} className="w-16 h-1.5" />
          <Badge variant="outline" className={`text-[10px] ${sl.color}`}>{sl.text}</Badge>
          {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
        </div>
      </button>
      {expanded && (
        <p className="text-sm text-muted-foreground mt-2 pl-7 animate-in fade-in-0 slide-in-from-top-1 duration-200">
          {feedback}
        </p>
      )}
    </div>
  );
};

export const WritingFeedback = ({
  assignmentId,
  assignmentTitle,
  className,
  parsedContent,
  learningObjectives,
  assessmentType,
}: WritingFeedbackProps) => {
  const [studentWriting, setStudentWriting] = useState("");
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const { toast } = useToast();

  const requestFeedback = async () => {
    setIsLoading(true);
    try {
      // Fetch rubric criteria if available
      let rubricCriteria: any[] = [];
      const { data: rubrics } = await supabase
        .from("rubrics")
        .select("id")
        .eq("assignment_id", assignmentId)
        .limit(1)
        .maybeSingle();

      if (rubrics) {
        const { data: criteria } = await supabase
          .from("rubric_criteria")
          .select("criterion_name, description, weight, performance_levels")
          .eq("rubric_id", rubrics.id)
          .order("criterion_order");
        rubricCriteria = criteria || [];
      }

      const { data, error } = await supabase.functions.invoke("assignment-feedback", {
        body: {
          assignmentTitle,
          className,
          parsedContent,
          learningObjectives,
          rubricCriteria,
          studentWriting: studentWriting.trim() || null,
          assessmentType,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setFeedback(data);
    } catch (error) {
      console.error("Feedback error:", error);
      toast({
        title: "Feedback generation failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!showInput && !feedback) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10"
        onClick={() => setShowInput(true)}
      >
        <MessageSquareText className="w-3.5 h-3.5" />
        Get AI Feedback
      </Button>
    );
  }

  return (
    <Card className="p-4 border-primary/20 bg-primary/5 mt-3 space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquareText className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-semibold text-foreground">AI Writing Feedback</h4>
        <Badge variant="secondary" className="text-[10px] ml-auto">Teaching-Style</Badge>
      </div>

      {/* Input area */}
      {!feedback && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Paste your draft below for detailed, instructor-style feedback. Or click "Get Feedback" for general guidance based on the assignment requirements.
          </p>
          <Textarea
            placeholder="Paste your writing here (optional — leave blank for general guidance)..."
            value={studentWriting}
            onChange={(e) => setStudentWriting(e.target.value)}
            rows={6}
            className="text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={requestFeedback}
              disabled={isLoading}
              className="gap-1.5"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Get Feedback
                </>
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowInput(false); setStudentWriting(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Feedback display */}
      {feedback && (
        <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          {/* Overall Score */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{feedback.overallScore.toFixed(1)}</div>
              <div className="text-[10px] text-muted-foreground">/4.0</div>
            </div>
            <div className="flex-1">
              <Badge variant="outline" className={`text-xs mb-1 ${scoreLabel(feedback.overallScore).color}`}>
                {scoreLabel(feedback.overallScore).text}
              </Badge>
              <p className="text-sm text-foreground">{feedback.overallImpression}</p>
            </div>
          </div>

          {/* Category Scores */}
          <div className="space-y-2">
            <ScoreBar label="Content & Accuracy" score={feedback.contentAccuracy.score} feedback={feedback.contentAccuracy.feedback} icon={Target} />
            <ScoreBar label="Organization & Structure" score={feedback.organization.score} feedback={feedback.organization.feedback} icon={BookOpen} />
            <ScoreBar label="Critical Thinking" score={feedback.criticalThinking.score} feedback={feedback.criticalThinking.feedback} icon={Brain} />
            <ScoreBar label="Writing Quality" score={feedback.writingQuality.score} feedback={feedback.writingQuality.feedback} icon={PenTool} />
          </div>

          {/* Rubric Scores */}
          {feedback.rubricScores && feedback.rubricScores.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-primary" />
                Rubric Alignment
              </h5>
              {feedback.rubricScores.map((rs, i) => (
                <div key={i} className="p-2 rounded border border-border text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-foreground">{rs.criterion}</span>
                    <Badge variant="outline" className={`text-[10px] ${scoreLabel(rs.score).color}`}>
                      {rs.score}/4
                    </Badge>
                  </div>
                  <p className="text-muted-foreground">{rs.justification}</p>
                </div>
              ))}
            </div>
          )}

          {/* Specific Suggestions */}
          {feedback.specificSuggestions.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                Actionable Suggestions
              </h5>
              <ul className="space-y-1.5">
                {feedback.specificSuggestions.map((s, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-2">
                    <span className="text-primary font-medium shrink-0">{i + 1}.</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Growth Areas */}
          {feedback.growthAreas.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                Growth Areas
              </h5>
              <ul className="space-y-1">
                {feedback.growthAreas.map((g, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-2">
                    <span className="text-emerald-500">✦</span>
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5"
              onClick={() => {
                setFeedback(null);
                setShowInput(true);
              }}
            >
              <MessageSquareText className="w-3 h-3" />
              Revise & Resubmit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                setFeedback(null);
                setShowInput(false);
                setStudentWriting("");
              }}
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};

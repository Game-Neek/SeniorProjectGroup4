import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Target, CheckCircle2, AlertTriangle, XCircle, Loader2,
  ChevronDown, ChevronUp, Lightbulb, BookOpen, Sparkles
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AlignmentReport {
  overall_alignment_score: number;
  bloom_match: boolean;
  bloom_actual?: string;
  objectives_covered: string[];
  objectives_missing: string[];
  strengths: string[];
  gaps: string[];
  recommendations: string[];
  quiz_quality_score?: number;
  exercise_quality_score?: number;
  textbook_alignment?: string;
}

interface AlignmentCheckerProps {
  contentId: string;
  className: string;
  topic: string;
}

export function AlignmentChecker({ contentId, className, topic }: AlignmentCheckerProps) {
  const [report, setReport] = useState<AlignmentReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();

  const runCheck = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-alignment", {
        body: { contentId, className },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setReport(data.report);
      setExpanded(true);
    } catch (err) {
      console.error("Alignment check error:", err);
      toast({
        title: "Alignment check failed",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-600";
    if (score >= 60) return "text-amber-600";
    return "text-destructive";
  };

  const scoreBg = (score: number) => {
    if (score >= 80) return "bg-emerald-500";
    if (score >= 60) return "bg-amber-500";
    return "bg-destructive";
  };

  if (!report && !loading) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs"
        onClick={runCheck}
      >
        <Target className="w-3 h-3" />
        Check Alignment
      </Button>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Running alignment analysis…
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-3 border border-border rounded-lg p-4 bg-card">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Alignment Report</span>
          <Badge variant="outline" className={`text-xs ${scoreColor(report.overall_alignment_score)}`}>
            {report.overall_alignment_score}%
          </Badge>
          {report.bloom_match ? (
            <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-500/20 bg-emerald-500/10">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Bloom ✓
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-500/20 bg-amber-500/10">
              <AlertTriangle className="w-3 h-3 mr-1" /> Bloom: {report.bloom_actual || "mismatch"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={runCheck}>
            <Sparkles className="w-3 h-3 mr-1" /> Re-check
          </Button>
          <Button variant="ghost" size="sm" className="text-xs h-7 w-7 p-0" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
        </div>
      </div>

      {/* Score bars */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">Overall Alignment</div>
          <Progress value={report.overall_alignment_score} className="h-2" />
        </div>
        {report.quiz_quality_score !== undefined && (
          <div>
            <div className="text-[10px] text-muted-foreground mb-1">Quiz Quality</div>
            <Progress value={report.quiz_quality_score} className="h-2" />
          </div>
        )}
        {report.exercise_quality_score !== undefined && (
          <div>
            <div className="text-[10px] text-muted-foreground mb-1">Exercise Quality</div>
            <Progress value={report.exercise_quality_score} className="h-2" />
          </div>
        )}
      </div>

      {expanded && (
        <>
          <Separator />

          {/* Objectives coverage */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <h5 className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Covered ({report.objectives_covered.length})
              </h5>
              <ul className="space-y-1">
                {report.objectives_covered.map((obj, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1">
                    <span className="text-emerald-500 mt-0.5">✓</span> {obj}
                  </li>
                ))}
                {report.objectives_covered.length === 0 && (
                  <li className="text-[11px] text-muted-foreground italic">None detected</li>
                )}
              </ul>
            </div>
            <div>
              <h5 className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1">
                <XCircle className="w-3 h-3 text-destructive" /> Missing ({report.objectives_missing.length})
              </h5>
              <ul className="space-y-1">
                {report.objectives_missing.map((obj, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1">
                    <span className="text-destructive mt-0.5">✗</span> {obj}
                  </li>
                ))}
                {report.objectives_missing.length === 0 && (
                  <li className="text-[11px] text-muted-foreground italic">All objectives covered!</li>
                )}
              </ul>
            </div>
          </div>

          <Separator />

          {/* Strengths & Gaps */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <h5 className="text-xs font-semibold text-emerald-600 mb-1.5">Strengths</h5>
              <ul className="space-y-1">
                {(report.strengths || []).map((s, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground">• {s}</li>
                ))}
              </ul>
            </div>
            <div>
              <h5 className="text-xs font-semibold text-amber-600 mb-1.5">Gaps</h5>
              <ul className="space-y-1">
                {(report.gaps || []).map((g, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground">• {g}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Recommendations */}
          {report.recommendations.length > 0 && (
            <>
              <Separator />
              <div>
                <h5 className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1">
                  <Lightbulb className="w-3 h-3 text-primary" /> Recommendations
                </h5>
                <ul className="space-y-1">
                  {report.recommendations.map((r, i) => (
                    <li key={i} className="text-[11px] text-muted-foreground">
                      {i + 1}. {r}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* Textbook alignment */}
          {report.textbook_alignment && (
            <>
              <Separator />
              <div className="flex items-start gap-2">
                <BookOpen className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                <p className="text-[11px] text-muted-foreground">{report.textbook_alignment}</p>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

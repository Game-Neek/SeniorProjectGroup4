import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Shield, AlertTriangle, CheckCircle2, Loader2, RefreshCw, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BiasAuditProps {
  contentId: string;
  topic: string;
}

interface AuditResult {
  id: string;
  overall_score: number;
  gender_score: number;
  racial_score: number;
  socioeconomic_score: number;
  language_score: number;
  flags: any[];
  suggestions: any[];
  auto_fixed: boolean;
  status: string;
  created_at: string;
}

const CATEGORIES = [
  { key: "gender_score", label: "Gender Equity", color: "text-purple-500" },
  { key: "racial_score", label: "Racial Equity", color: "text-orange-500" },
  { key: "socioeconomic_score", label: "Socioeconomic Equity", color: "text-blue-500" },
  { key: "language_score", label: "Language Accessibility", color: "text-green-500" },
] as const;

const severityColor: Record<string, string> = {
  low: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  medium: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  high: "bg-destructive/10 text-destructive border-destructive/20",
};

export const BiasAudit = ({ contentId, topic }: BiasAuditProps) => {
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const { toast } = useToast();

  const loadAudit = useCallback(async () => {
    const { data } = await supabase
      .from("bias_audits")
      .select("*")
      .eq("content_id", contentId)
      .order("created_at", { ascending: false })
      .limit(1) as any;

    setAudit(data?.[0] || null);
    setLoading(false);
  }, [contentId]);

  useEffect(() => {
    loadAudit();
  }, [loadAudit]);

  const runAudit = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("audit-bias", {
        body: { contentId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await loadAudit();
      toast({
        title: "Bias audit complete",
        description: data.audit.auto_fixed
          ? `Issues found and auto-fixed in "${topic}"`
          : `"${topic}" scored ${data.audit.overall_score}/100`,
      });
    } catch (error) {
      toast({
        title: "Audit failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="text-center py-6">
        <Shield className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground mb-3">No bias audit performed yet</p>
        <Button size="sm" onClick={runAudit} disabled={running} className="gap-1.5">
          {running ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Auditing...</>
          ) : (
            <><Sparkles className="w-3.5 h-3.5" /> Run Equity Audit</>
          )}
        </Button>
      </div>
    );
  }

  const overallColor = audit.overall_score >= 85 ? "text-primary" : audit.overall_score >= 60 ? "text-yellow-500" : "text-destructive";

  return (
    <div className="space-y-4">
      {/* Overall Score */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {audit.status === "clean" ? (
            <CheckCircle2 className="w-5 h-5 text-primary" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
          )}
          <span className="text-sm font-medium text-foreground">Equity Score</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-bold ${overallColor}`}>{audit.overall_score}</span>
          <span className="text-xs text-muted-foreground">/100</span>
          {audit.auto_fixed && (
            <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
              Auto-fixed
            </Badge>
          )}
        </div>
      </div>

      {/* Category Scores */}
      <div className="grid grid-cols-2 gap-3">
        {CATEGORIES.map((cat) => {
          const score = (audit as any)[cat.key] as number;
          return (
            <div key={cat.key} className="p-3 rounded-lg border border-border">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">{cat.label}</span>
                <span className={`text-sm font-semibold ${score >= 85 ? "text-primary" : score >= 60 ? "text-yellow-500" : "text-destructive"}`}>
                  {score}
                </span>
              </div>
              <Progress value={score} className="h-1.5" />
            </div>
          );
        })}
      </div>

      {/* Flags */}
      {audit.flags.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Flagged Issues ({audit.flags.length})
          </h4>
          {audit.flags.map((flag: any, i: number) => (
            <div key={i} className={`p-3 rounded-lg border text-xs ${severityColor[flag.severity] || ""}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <Badge variant="outline" className="text-[10px] capitalize">{flag.category}</Badge>
                <Badge variant="outline" className="text-[10px] capitalize">{flag.severity}</Badge>
              </div>
              <p className="font-medium mb-1">{flag.issue}</p>
              {flag.excerpt && (
                <p className="text-muted-foreground mb-1">
                  <span className="line-through">{flag.excerpt}</span>
                </p>
              )}
              {flag.suggestion && (
                <p className="text-primary">
                  → {flag.suggestion}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Re-audit button */}
      <Button variant="outline" size="sm" onClick={runAudit} disabled={running} className="w-full gap-1.5 text-xs">
        {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
        Re-run Audit
      </Button>
    </div>
  );
};

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Brain, Lightbulb, Wrench, Search, Scale, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface BloomItem {
  objective: string;
  bloomLevel: string;
  actionVerb: string;
  justification?: string;
}

interface BloomTaxonomyProps {
  className: string;
}

const BLOOM_LEVELS = [
  { level: "Remember", icon: Brain, color: "bg-red-500", lightColor: "bg-red-500/10 text-red-700 border-red-500/20", description: "Recall facts and basic concepts" },
  { level: "Understand", icon: Lightbulb, color: "bg-orange-500", lightColor: "bg-orange-500/10 text-orange-700 border-orange-500/20", description: "Explain ideas or concepts" },
  { level: "Apply", icon: Wrench, color: "bg-yellow-500", lightColor: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20", description: "Use information in new situations" },
  { level: "Analyze", icon: Search, color: "bg-green-500", lightColor: "bg-green-500/10 text-green-700 border-green-500/20", description: "Draw connections among ideas" },
  { level: "Evaluate", icon: Scale, color: "bg-blue-500", lightColor: "bg-blue-500/10 text-blue-700 border-blue-500/20", description: "Justify a stand or decision" },
  { level: "Create", icon: Sparkles, color: "bg-purple-500", lightColor: "bg-purple-500/10 text-purple-700 border-purple-500/20", description: "Produce new or original work" },
];

export const BloomTaxonomy = ({ className }: BloomTaxonomyProps) => {
  const [classifications, setClassifications] = useState<BloomItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadClassifications = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data } = await supabase
      .from("syllabi")
      .select("bloom_classifications")
      .eq("user_id", session.user.id)
      .eq("class_name", className)
      .maybeSingle();

    if (data?.bloom_classifications) {
      setClassifications(data.bloom_classifications as unknown as BloomItem[]);
    }
    setLoading(false);
  }, [className]);

  useEffect(() => {
    loadClassifications();
  }, [loadClassifications]);

  // Listen for syllabus re-parse events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.className === className) {
        loadClassifications();
      }
    };
    window.addEventListener("syllabus-reparsed", handler);
    return () => window.removeEventListener("syllabus-reparsed", handler);
  }, [className, loadClassifications]);

  if (loading) {
    return (
      <Card className="p-6 border-border">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  if (classifications.length === 0) return null;

  // Count objectives per level
  const levelCounts = BLOOM_LEVELS.map((bl) => ({
    ...bl,
    count: classifications.filter((c) => c.bloomLevel === bl.level).length,
    items: classifications.filter((c) => c.bloomLevel === bl.level),
  }));

  const total = classifications.length;
  const maxCount = Math.max(...levelCounts.map((l) => l.count), 1);

  return (
    <Card className="p-6 border-border shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10">
          <Brain className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Bloom's Taxonomy Analysis</h3>
          <p className="text-xs text-muted-foreground">Learning objectives mapped to cognitive levels</p>
        </div>
        <Badge variant="secondary" className="ml-auto">{total} objectives</Badge>
      </div>

      {/* Pyramid visualization */}
      <div className="space-y-2 mb-6">
        {[...levelCounts].reverse().map((level) => {
          const percentage = total > 0 ? Math.round((level.count / total) * 100) : 0;
          const barWidth = level.count > 0 ? Math.max(20, (level.count / maxCount) * 100) : 0;
          const Icon = level.icon;

          return (
            <TooltipProvider key={level.level}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-3 cursor-default">
                    <div className="w-24 flex items-center gap-1.5 shrink-0">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-foreground">{level.level}</span>
                    </div>
                    <div className="flex-1 h-7 bg-muted/30 rounded-md overflow-hidden relative">
                      <div
                        className={`h-full ${level.color} rounded-md transition-all duration-500 flex items-center justify-end pr-2`}
                        style={{ width: `${barWidth}%`, opacity: level.count > 0 ? 0.8 : 0 }}
                      >
                        {level.count > 0 && (
                          <span className="text-xs font-bold text-white">{level.count}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground w-10 text-right">{percentage}%</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-sm">
                  <p className="font-medium mb-1">{level.level}: {level.description}</p>
                  {level.items.length > 0 ? (
                    <ul className="text-xs space-y-1">
                      {level.items.map((item, i) => (
                        <li key={i} className="flex gap-1">
                          <span className="text-muted-foreground shrink-0">•</span>
                          <span>{item.objective}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">No objectives at this level</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>

      {/* Detailed list */}
      <div className="border-t border-border pt-4">
        <h4 className="text-sm font-medium text-foreground mb-3">Objective Classifications</h4>
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {classifications.map((item, i) => {
            const levelInfo = BLOOM_LEVELS.find((l) => l.level === item.bloomLevel);
            return (
              <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/20">
                <Badge variant="outline" className={`text-xs shrink-0 ${levelInfo?.lightColor || ""}`}>
                  {item.bloomLevel}
                </Badge>
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{item.objective}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Verb: <span className="font-medium">{item.actionVerb}</span>
                    {item.justification && ` — ${item.justification}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
};

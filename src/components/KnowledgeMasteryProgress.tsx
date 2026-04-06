import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Brain, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { useKnowledgeMastery, KnowledgeMasteryItem } from "@/hooks/useKnowledgeMastery";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  className: string;
}

const levelConfig: Record<string, { color: string; bg: string; label: string }> = {
  not_started: { color: "bg-muted", bg: "bg-muted/30", label: "Not Started" },
  emerging: { color: "bg-orange-400", bg: "bg-orange-50 dark:bg-orange-950/20", label: "Emerging" },
  developing: { color: "bg-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-950/20", label: "Developing" },
  proficient: { color: "bg-blue-500", bg: "bg-blue-50 dark:bg-blue-950/20", label: "Proficient" },
  mastered: { color: "bg-green-500", bg: "bg-green-50 dark:bg-green-950/20", label: "Mastered" },
};

const MasteryDot = ({ item }: { item: KnowledgeMasteryItem }) => {
  const config = levelConfig[item.mastery_level] || levelConfig.not_started;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "w-4 h-4 rounded-full border-2 border-background shadow-sm transition-all cursor-pointer hover:scale-125",
              config.color
            )}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[250px]">
          <p className="text-xs font-medium">{item.component.objective}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-[10px]">{config.label}</Badge>
            <span className="text-[10px] text-muted-foreground">{item.mastery_score}%</span>
            {item.attempts > 0 && (
              <span className="text-[10px] text-muted-foreground">{item.attempts} attempts</span>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const TopicGroup = ({ topic, items }: { topic: string; items: KnowledgeMasteryItem[] }) => {
  const [expanded, setExpanded] = useState(false);
  const groupAvg = items.length > 0
    ? Math.round(items.reduce((s, i) => s + i.mastery_score, 0) / items.length)
    : 0;

  const masteredCount = items.filter(i => i.mastery_level === "mastered" || i.mastery_level === "proficient").length;

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left group"
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <span className="text-sm font-medium truncate">{topic}</span>
          <span className="text-xs text-muted-foreground">
            {masteredCount}/{items.length} mastered
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex gap-0.5">
            {items.map(item => (
              <MasteryDot key={item.component.id} item={item} />
            ))}
          </div>
          <span className="text-xs font-semibold w-8 text-right">{groupAvg}%</span>
        </div>
      </button>

      {expanded && (
        <div className="ml-6 space-y-1.5">
          {items.map(item => {
            const config = levelConfig[item.mastery_level] || levelConfig.not_started;
            return (
              <div key={item.component.id} className={cn("flex items-center gap-3 p-2 rounded-lg text-sm", config.bg)}>
                <div className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", config.color)} />
                <span className="flex-1 min-w-0 truncate">{item.component.objective}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.component.bloom_level && (
                    <Badge variant="outline" className="text-[10px] capitalize">{item.component.bloom_level}</Badge>
                  )}
                  <span className="text-xs font-medium w-8 text-right">{item.mastery_score}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const KnowledgeMasteryProgress = ({ className }: Props) => {
  const mastery = useKnowledgeMastery(className);
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    await mastery.syncFromSyllabus();
    setSyncing(false);
  };

  if (mastery.loading) {
    return (
      <Card className="p-6 border-border">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  // Summary counts
  const counts = { not_started: 0, emerging: 0, developing: 0, proficient: 0, mastered: 0 };
  mastery.items.forEach(i => {
    const level = i.mastery_level as keyof typeof counts;
    if (level in counts) counts[level]++;
  });

  return (
    <Card className="p-6 border-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Learning Objective Mastery</h3>
            <p className="text-xs text-muted-foreground">
              Each dot represents a specific skill or knowledge component
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span className="ml-1">Sync</span>
        </Button>
      </div>

      {mastery.items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No learning objectives found</p>
          <p className="text-xs">Upload a syllabus to populate objectives</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={handleSync} disabled={syncing}>
            {syncing ? "Syncing..." : "Sync from Syllabus"}
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Overall progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Overall Mastery</span>
              <span className="text-sm font-bold text-primary">{mastery.overallMastery}%</span>
            </div>
            <Progress value={mastery.overallMastery} className="h-3" />
            <div className="flex items-center gap-3 flex-wrap">
              {Object.entries(levelConfig).map(([level, config]) => (
                <div key={level} className="flex items-center gap-1">
                  <div className={cn("w-2.5 h-2.5 rounded-full", config.color)} />
                  <span className="text-[10px] text-muted-foreground">
                    {config.label} ({counts[level as keyof typeof counts]})
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Dot overview */}
          <div className="flex flex-wrap gap-1 p-3 rounded-lg bg-muted/30">
            {mastery.items.map(item => (
              <MasteryDot key={item.component.id} item={item} />
            ))}
          </div>

          {/* Topic groups */}
          <div className="space-y-3">
            {Array.from(mastery.topicGroups.entries()).map(([topic, groupItems]) => (
              <TopicGroup key={topic} topic={topic} items={groupItems} />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};

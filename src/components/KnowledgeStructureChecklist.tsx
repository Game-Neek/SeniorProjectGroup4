import { useState } from "react";
import { ChecklistRewards } from "@/components/ChecklistRewards";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Loader2, Network, ChevronDown, ChevronRight, CheckCircle2,
  Circle, ArrowRight, Lock, Sparkles, BookOpen, RefreshCw
} from "lucide-react";
import { useKnowledgeMastery, KnowledgeMasteryItem } from "@/hooks/useKnowledgeMastery";
import { cn } from "@/lib/utils";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  className: string;
  onNavigateToTopic?: (topic: string) => void;
}

type NodeState = "mastered" | "proficient" | "in_progress" | "ready" | "locked";

interface TopicNode {
  topic: string;
  items: KnowledgeMasteryItem[];
  state: NodeState;
  avgScore: number;
  masteredCount: number;
}

const stateConfig: Record<NodeState, {
  icon: typeof CheckCircle2;
  color: string;
  bg: string;
  border: string;
  label: string;
  description: string;
}> = {
  mastered: {
    icon: CheckCircle2,
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    label: "Mastered",
    description: "You've demonstrated strong understanding",
  },
  proficient: {
    icon: CheckCircle2,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    label: "Proficient",
    description: "Good grasp — keep practicing for mastery",
  },
  in_progress: {
    icon: BookOpen,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    label: "In Progress",
    description: "You're actively working on this",
  },
  ready: {
    icon: Sparkles,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/30",
    label: "Ready to Learn",
    description: "Prerequisites met — start this next!",
  },
  locked: {
    icon: Lock,
    color: "text-muted-foreground",
    bg: "bg-muted/30",
    border: "border-border",
    label: "Locked",
    description: "Complete earlier topics first",
  },
};

const BLOOM_ORDER = ["remember", "understand", "apply", "analyze", "evaluate", "create"];

const getNodeState = (items: KnowledgeMasteryItem[], index: number, allNodes: { avgScore: number; items: KnowledgeMasteryItem[] }[]): NodeState => {
  const avgScore = items.length > 0
    ? items.reduce((s, i) => s + i.mastery_score, 0) / items.length
    : 0;

  if (avgScore >= 90) return "mastered";
  if (avgScore >= 70) return "proficient";
  if (avgScore > 0) return "in_progress";

  // First topic is always ready
  if (index === 0) return "ready";

  // Check if previous topic meets prerequisites
  const prev = allNodes[index - 1];
  const prevAvg = prev?.avgScore ?? 0;

  // Bloom-aware unlock: if this topic requires higher Bloom levels,
  // the prerequisite threshold is stricter
  const thisMaxBloom = Math.max(
    ...items.map(i => BLOOM_ORDER.indexOf(i.component.bloom_level || "remember")),
    0
  );
  const prevMaxBloom = prev?.items
    ? Math.max(...prev.items.map(i => BLOOM_ORDER.indexOf(i.component.bloom_level || "remember")), 0)
    : 0;

  // If this topic requires higher-order thinking than the prerequisite,
  // need stronger mastery (60% instead of 50%)
  const requiredScore = thisMaxBloom > prevMaxBloom ? 60 : 50;

  if (prevAvg >= requiredScore) return "ready";
  return "locked";
};

const ObjectiveRow = ({ item }: { item: KnowledgeMasteryItem }) => {
  const score = item.mastery_score;
  const level = item.mastery_level;

  return (
    <div className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-muted/40 transition-colors">
      <div className="flex-shrink-0">
        {level === "mastered" ? (
          <CheckCircle2 className="w-4 h-4 text-green-500" />
        ) : level === "proficient" ? (
          <CheckCircle2 className="w-4 h-4 text-blue-500" />
        ) : score > 0 ? (
          <Circle className="w-4 h-4 text-amber-500 fill-amber-500/30" />
        ) : (
          <Circle className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
      <span className={cn(
        "flex-1 text-sm min-w-0 truncate",
        level === "mastered" && "text-muted-foreground line-through"
      )}>
        {item.component.objective}
      </span>
      <div className="flex items-center gap-2 flex-shrink-0">
        {item.component.bloom_level && (
          <Badge variant="outline" className="text-[10px] capitalize py-0 h-5">
            {item.component.bloom_level}
          </Badge>
        )}
        {score > 0 && (
          <span className={cn(
            "text-xs font-semibold tabular-nums w-8 text-right",
            score >= 90 ? "text-green-600" : score >= 70 ? "text-blue-600" : score >= 50 ? "text-amber-600" : "text-destructive"
          )}>
            {Math.round(score)}%
          </span>
        )}
        {item.attempts > 0 && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger>
                <span className="text-[10px] text-muted-foreground">{item.attempts}×</span>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">{item.attempts} attempt{item.attempts !== 1 ? "s" : ""}</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
};

const TopicNodeCard = ({ node, index, total, onNavigate }: {
  node: TopicNode;
  index: number;
  total: number;
  onNavigate?: (topic: string) => void;
}) => {
  const [expanded, setExpanded] = useState(node.state === "ready" || node.state === "in_progress");
  const config = stateConfig[node.state];
  const Icon = config.icon;

  return (
    <div className="relative">
      {/* Connector line */}
      {index < total - 1 && (
        <div className={cn(
          "absolute left-6 top-[calc(100%)] w-0.5 h-4 z-0",
          node.state === "mastered" || node.state === "proficient"
            ? "bg-green-500/40"
            : "bg-border"
        )} aria-hidden="true" />
      )}

      <div className={cn(
        "relative z-10 rounded-xl border-2 transition-all",
        config.border,
        config.bg,
        node.state === "ready" && "ring-2 ring-primary/20 shadow-md"
      )}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3 w-full p-3 text-left"
          aria-expanded={expanded}
          aria-label={`${node.topic}: ${config.label}, ${node.masteredCount} of ${node.items.length} objectives mastered, ${node.avgScore}% average score`}
        >
          {/* State icon */}
          <div className={cn(
            "flex items-center justify-center w-8 h-8 rounded-full border-2 flex-shrink-0",
            config.border,
            node.state === "mastered" ? "bg-green-500/20" :
            node.state === "proficient" ? "bg-blue-500/20" :
            node.state === "ready" ? "bg-primary/20" :
            node.state === "in_progress" ? "bg-amber-500/20" :
            "bg-muted"
          )}>
            <Icon className={cn("w-4 h-4", config.color)} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn("text-sm font-semibold truncate", config.color)}>
                {node.topic}
              </span>
              <Badge variant="secondary" className="text-[10px] py-0 h-5">
                {node.masteredCount}/{node.items.length}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{config.description}</p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {node.avgScore > 0 && (
              <span className={cn("text-sm font-bold tabular-nums", config.color)}>
                {node.avgScore}%
              </span>
            )}
            {node.state === "ready" && onNavigate && (
              <Button
                variant="default"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={(e) => { e.stopPropagation(); onNavigate(node.topic); }}
              >
                Start <ArrowRight className="w-3 h-3" />
              </Button>
            )}
            {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>

        {expanded && (
          <div className="px-3 pb-3 pt-0">
            <div className="mb-2">
              <Progress
                value={node.avgScore}
                className={cn("h-1.5",
                  node.state === "mastered" && "[&>div]:bg-green-500",
                  node.state === "proficient" && "[&>div]:bg-blue-500",
                  node.state === "in_progress" && "[&>div]:bg-amber-500",
                )}
              />
            </div>
            <div className="space-y-0.5">
              {node.items.map(item => (
                <ObjectiveRow key={item.component.id} item={item} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const KnowledgeStructureChecklist = ({ className, onNavigateToTopic }: Props) => {
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

  // Build topic nodes in order
  const topicEntries = Array.from(mastery.topicGroups.entries());
  const avgScores = topicEntries.map(([, items]) =>
    items.length > 0
      ? items.reduce((s, i) => s + i.mastery_score, 0) / items.length
      : 0
  );

  const nodes: TopicNode[] = topicEntries.map(([topic, items], index) => {
    const avgScore = Math.round(avgScores[index]);
    const masteredCount = items.filter(i =>
      i.mastery_level === "mastered" || i.mastery_level === "proficient"
    ).length;
    const state = getNodeState(items, index, topicEntries.map(([, tItems], j) => ({
      avgScore: Math.round(avgScores[j]),
      items: tItems,
    })));
    return { topic, items, state, avgScore, masteredCount };
  });

  // Summary stats
  const totalObjectives = mastery.items.length;
  const masteredTotal = mastery.items.filter(i => i.mastery_level === "mastered" || i.mastery_level === "proficient").length;
  const readyNodes = nodes.filter(n => n.state === "ready");
  const inProgressNodes = nodes.filter(n => n.state === "in_progress");

  return (
    <Card className="p-6 border-border">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Network className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Knowledge Structure</h3>
            <p className="text-xs text-muted-foreground">
              Your response state & learning path
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span className="ml-1">Sync</span>
        </Button>
      </div>

      {nodes.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Network className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No learning objectives found</p>
          <p className="text-xs">Upload a syllabus to populate your knowledge map</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={handleSync} disabled={syncing}>
            {syncing ? "Syncing..." : "Sync from Syllabus"}
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Summary bar */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 text-center">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{masteredTotal}</p>
              <p className="text-[11px] text-muted-foreground">Mastered</p>
            </div>
            <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-center">
              <p className="text-2xl font-bold text-primary">{readyNodes.length}</p>
              <p className="text-[11px] text-muted-foreground">Ready to Learn</p>
            </div>
            <div className="rounded-lg bg-muted border border-border p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{totalObjectives}</p>
              <p className="text-[11px] text-muted-foreground">Total Objectives</p>
            </div>
          </div>

          {/* Overall progress */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Overall Mastery</span>
              <span className="text-sm font-bold text-primary">{mastery.overallMastery}%</span>
            </div>
            <Progress value={mastery.overallMastery} className="h-2.5" />
          </div>

          {/* Rewards & Badges */}
          <ChecklistRewards
            completionPct={mastery.overallMastery}
            checkedCount={masteredTotal}
            totalCount={totalObjectives}
            storageKey={`knowledge-${className}`}
          />

          {/* "Up Next" callout */}
          {readyNodes.length > 0 && (
            <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-primary">Up Next</p>
                <p className="text-xs text-muted-foreground truncate">
                  {readyNodes.map(n => n.topic).join(", ")}
                </p>
              </div>
              {onNavigateToTopic && readyNodes[0] && (
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => onNavigateToTopic(readyNodes[0].topic)}
                >
                  Start <ArrowRight className="w-3 h-3" />
                </Button>
              )}
            </div>
          )}

          {/* In-progress callout */}
          {inProgressNodes.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-center gap-3">
              <BookOpen className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">Currently Studying</p>
                <p className="text-xs text-muted-foreground truncate">
                  {inProgressNodes.map(n => `${n.topic} (${n.avgScore}%)`).join(", ")}
                </p>
              </div>
            </div>
          )}

          {/* Topic node list */}
          <div className="space-y-4">
            {nodes.map((node, i) => (
              <TopicNodeCard
                key={node.topic}
                node={node}
                index={i}
                total={nodes.length}
                onNavigate={onNavigateToTopic}
              />
            ))}
          </div>

          {/* State legend */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
            {Object.entries(stateConfig).map(([key, config]) => (
              <div key={key} className="flex items-center gap-1.5">
                <config.icon className={cn("w-3 h-3", config.color)} />
                <span className="text-[10px] text-muted-foreground">{config.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  BookOpen, ChevronDown, ChevronRight, Loader2, RefreshCw,
  Sparkles, ListChecks, Target, GripVertical, Trash2, Plus,
  CheckCircle2, FileText, ArrowRight, Brain
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface OutlineChapter {
  topic: string;
  weekNumber: number | null;
  objectives: string[];
  bloomLevel: string | null;
  hasCourseContent: boolean;
  courseContentId: string | null;
  focusAreaId: string | null;
  focusAreaPassed: boolean;
  checklistStatus: "complete" | "partial" | "empty";
}

interface OutlineBuilderProps {
  className: string;
  onNavigateToTopic?: (focusAreaId: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const OutlineBuilder = ({ className, onNavigateToTopic }: OutlineBuilderProps) => {
  const [chapters, setChapters] = useState<OutlineChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [hasSyllabus, setHasSyllabus] = useState(false);
  const [newTopicInput, setNewTopicInput] = useState("");
  const [addingTopic, setAddingTopic] = useState(false);
  const { toast } = useToast();

  const loadOutline = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch syllabus, course content, focus areas in parallel
      const [syllabusRes, contentRes, focusRes] = await Promise.all([
        supabase
          .from("syllabi")
          .select("learning_objectives, weekly_schedule, bloom_classifications")
          .eq("user_id", session.user.id)
          .eq("class_name", className)
          .order("uploaded_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("course_content")
          .select("id, topic, topic_order, generation_status, bloom_level")
          .eq("user_id", session.user.id)
          .eq("class_name", className)
          .order("topic_order", { ascending: true }),
        supabase
          .from("study_focus_areas")
          .select("id, topic, quiz_passed, topic_order")
          .eq("user_id", session.user.id)
          .eq("class_name", className),
      ]);

      const syllabus = syllabusRes.data;
      setHasSyllabus(!!syllabus);

      if (!syllabus) {
        setChapters([]);
        setLoading(false);
        return;
      }

      // Build chapter list from weekly schedule + objectives
      const weeklySchedule = (syllabus.weekly_schedule as any[]) || [];
      const objectives = syllabus.learning_objectives || [];
      const bloomData = (syllabus.bloom_classifications as Record<string, string>) || {};

      // Content lookup
      const contentMap = new Map<string, { id: string; status: string; bloom: string | null }>();
      for (const c of contentRes.data || []) {
        contentMap.set(c.topic.toLowerCase(), { id: c.id, status: c.generation_status, bloom: c.bloom_level });
      }

      // Focus area lookup
      const focusMap = new Map<string, { id: string; passed: boolean }>();
      for (const fa of focusRes.data || []) {
        focusMap.set(fa.topic.toLowerCase(), { id: fa.id, passed: fa.quiz_passed });
      }

      const chapterList: OutlineChapter[] = [];
      const seenTopics = new Set<string>();

      // Extract chapters from weekly schedule
      for (const week of weeklySchedule) {
        const topic = week?.topic || week?.title;
        if (!topic || typeof topic !== "string") continue;
        const lower = topic.toLowerCase();
        if (seenTopics.has(lower)) continue;
        seenTopics.add(lower);

        // Match objectives to this chapter
        const chapterObjectives = objectives.filter((obj: string) => {
          const objLower = obj.toLowerCase();
          return objLower.includes(lower.slice(0, 12)) || lower.includes(objLower.slice(0, 12));
        });

        const content = contentMap.get(lower) ||
          [...contentMap.entries()].find(([k]) => k.includes(lower) || lower.includes(k))?.[1];
        const focus = focusMap.get(lower) ||
          [...focusMap.entries()].find(([k]) => k.includes(lower) || lower.includes(k))?.[1];

        const completedCount = chapterObjectives.length > 0 ? 
          chapterObjectives.filter(() => focus?.passed).length : 0;

        chapterList.push({
          topic,
          weekNumber: parseInt(week.week) || null,
          objectives: chapterObjectives,
          bloomLevel: content?.bloom || bloomData[topic] || null,
          hasCourseContent: !!content,
          courseContentId: content?.id || null,
          focusAreaId: focus?.id || null,
          focusAreaPassed: focus?.passed || false,
          checklistStatus: focus?.passed ? "complete" : completedCount > 0 ? "partial" : "empty",
        });
      }

      // Add any objectives not matched to chapters as "General"
      const unmatchedObjectives = objectives.filter((obj: string) => {
        const objLower = obj.toLowerCase();
        return !chapterList.some(ch =>
          ch.objectives.includes(obj) ||
          objLower.includes(ch.topic.toLowerCase().slice(0, 12)) ||
          ch.topic.toLowerCase().includes(objLower.slice(0, 12))
        );
      });

      if (unmatchedObjectives.length > 0 && chapterList.length > 0) {
        // Distribute unmatched objectives to closest chapter
        for (const obj of unmatchedObjectives) {
          chapterList[chapterList.length - 1].objectives.push(obj);
        }
      }

      setChapters(chapterList);
    } catch (err) {
      console.error("Outline builder error:", err);
    } finally {
      setLoading(false);
    }
  }, [className]);

  useEffect(() => { loadOutline(); }, [loadOutline]);

  useEffect(() => {
    const handler = () => loadOutline();
    window.addEventListener("syllabus-reparsed", handler);
    window.addEventListener("chapters-selected", handler);
    return () => {
      window.removeEventListener("syllabus-reparsed", handler);
      window.removeEventListener("chapters-selected", handler);
    };
  }, [loadOutline]);

  // Auto-generate course content + focus areas from outline
  const handleGenerateAll = async () => {
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const topicsToCreate = chapters.filter(ch => !ch.hasCourseContent);

      if (topicsToCreate.length === 0) {
        toast({ title: "Already generated", description: "All chapters have course content." });
        setGenerating(false);
        return;
      }

      // Create course_content entries for chapters that don't have them
      const contentInserts = topicsToCreate.map((ch, i) => ({
        user_id: session.user.id,
        class_name: className,
        topic: ch.topic,
        topic_order: ch.weekNumber || i,
        generation_status: "pending",
        bloom_level: ch.bloomLevel,
      }));

      await supabase.from("course_content").insert(contentInserts);

      // Create study_focus_areas for chapters that don't have them
      const focusInserts = topicsToCreate
        .filter(ch => !ch.focusAreaId)
        .map((ch, i) => ({
          user_id: session.user.id,
          class_name: className,
          topic: ch.topic,
          topic_order: ch.weekNumber || i,
          is_unlocked: i === 0,
        }));

      if (focusInserts.length > 0) {
        await supabase.from("study_focus_areas").insert(focusInserts);
      }

      // Sync knowledge components from objectives
      const existingComps = await supabase
        .from("knowledge_components" as any)
        .select("objective")
        .eq("user_id", session.user.id)
        .eq("class_name", className);

      const existingSet = new Set(((existingComps.data || []) as any[]).map((c: any) => c.objective));
      const newComponents: any[] = [];
      let order = existingSet.size;

      for (const ch of chapters) {
        for (const obj of ch.objectives) {
          if (!existingSet.has(obj)) {
            newComponents.push({
              user_id: session.user.id,
              class_name: className,
              objective: obj,
              source: "outline_builder",
              parent_topic: ch.topic,
              component_order: order++,
            });
            existingSet.add(obj);
          }
        }
      }

      if (newComponents.length > 0) {
        await supabase.from("knowledge_components" as any).insert(newComponents);
      }

      toast({
        title: "Outline generated!",
        description: `Created ${topicsToCreate.length} chapter breakdowns and ${newComponents.length} knowledge components`,
      });

      window.dispatchEvent(new CustomEvent("syllabus-reparsed", { detail: { className } }));
      await loadOutline();
    } catch (err) {
      console.error("Generate all error:", err);
      toast({ title: "Generation failed", description: "Please try again", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleAddTopic = async () => {
    if (!newTopicInput.trim()) return;
    setAddingTopic(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const newOrder = chapters.length;

      // Add to course_content
      await supabase.from("course_content").insert({
        user_id: session.user.id,
        class_name: className,
        topic: newTopicInput.trim(),
        topic_order: newOrder,
        generation_status: "pending",
      });

      // Add to study_focus_areas
      await supabase.from("study_focus_areas").insert({
        user_id: session.user.id,
        class_name: className,
        topic: newTopicInput.trim(),
        topic_order: newOrder,
        is_unlocked: chapters.length === 0,
      });

      setNewTopicInput("");
      toast({ title: "Topic added", description: `"${newTopicInput.trim()}" added to outline` });
      await loadOutline();
    } catch (err) {
      toast({ title: "Failed to add topic", variant: "destructive" });
    } finally {
      setAddingTopic(false);
    }
  };

  const handleRemoveChapter = async (index: number) => {
    const ch = chapters[index];
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Remove course content
      if (ch.courseContentId) {
        await supabase.from("course_content").delete().eq("id", ch.courseContentId);
      }

      // Remove focus area
      if (ch.focusAreaId) {
        await supabase.from("study_focus_areas").delete().eq("id", ch.focusAreaId);
      }

      toast({ title: "Chapter removed", description: `"${ch.topic}" removed from outline` });
      await loadOutline();
    } catch (err) {
      toast({ title: "Failed to remove", variant: "destructive" });
    }
  };

  const toggleExpand = (index: number) => {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Card className="p-6 border-border shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  if (!hasSyllabus) return null;

  const completedCount = chapters.filter(ch => ch.checklistStatus === "complete").length;
  const generatedCount = chapters.filter(ch => ch.hasCourseContent).length;
  const totalObjectives = chapters.reduce((sum, ch) => sum + ch.objectives.length, 0);
  const overallProgress = chapters.length > 0 ? Math.round((completedCount / chapters.length) * 100) : 0;

  return (
    <Card className="p-6 border-border shadow-[var(--shadow-soft)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <ListChecks className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Outline Builder</h3>
            <p className="text-sm text-muted-foreground">
              {chapters.length} chapters · {totalObjectives} objectives
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={loadOutline} className="h-7 w-7 p-0">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          {chapters.length > 0 && generatedCount < chapters.length && (
            <Button
              size="sm"
              onClick={handleGenerateAll}
              disabled={generating}
              className="h-8 text-xs bg-[image:var(--gradient-primary)]"
            >
              {generating ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 mr-1" />
              )}
              Generate All ({chapters.length - generatedCount})
            </Button>
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-muted/30 border border-border text-center">
          <p className="text-lg font-bold text-foreground">{chapters.length}</p>
          <p className="text-xs text-muted-foreground">Chapters</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/30 border border-border text-center">
          <p className="text-lg font-bold text-foreground">{generatedCount}</p>
          <p className="text-xs text-muted-foreground">Generated</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/30 border border-border text-center">
          <p className="text-lg font-bold text-foreground">{completedCount}</p>
          <p className="text-xs text-muted-foreground">Mastered</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground">Overall Progress</span>
          <span className="text-xs font-bold text-foreground">{overallProgress}%</span>
        </div>
        <Progress value={overallProgress} className="h-2" />
      </div>

      {/* Chapter list */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
        {chapters.map((ch, index) => {
          const isExpanded = expandedChapters.has(index);

          return (
            <Collapsible key={index} open={isExpanded} onOpenChange={() => toggleExpand(index)}>
              <div className={`rounded-lg border transition-colors ${
                ch.checklistStatus === "complete"
                  ? "border-green-500/20 bg-green-500/5"
                  : ch.hasCourseContent
                  ? "border-border bg-card"
                  : "border-dashed border-muted-foreground/30 bg-muted/20"
              }`}>
                <CollapsibleTrigger className="w-full p-3 flex items-center gap-3 text-left">
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50" />
                    {ch.checklistStatus === "complete" ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : ch.hasCourseContent ? (
                      <FileText className="w-4 h-4 text-primary" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{ch.topic}</p>
                      {ch.weekNumber && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1 flex-shrink-0">
                          Wk {ch.weekNumber}
                        </Badge>
                      )}
                      {ch.bloomLevel && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1 flex-shrink-0 capitalize">
                          {ch.bloomLevel}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {ch.objectives.length} objective{ch.objectives.length !== 1 ? "s" : ""}
                      {ch.hasCourseContent ? " · Content ready" : " · Not yet generated"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {ch.focusAreaId && onNavigateToTopic && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateToTopic(ch.focusAreaId!);
                        }}
                      >
                        <ArrowRight className="w-3 h-3" />
                      </Button>
                    )}
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="px-3 pb-3 border-t border-border/50 pt-2">
                    {ch.objectives.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Learning Objectives</p>
                        {ch.objectives.map((obj, objIdx) => (
                          <div key={objIdx} className="flex items-start gap-2 text-xs">
                            <Checkbox
                              checked={ch.focusAreaPassed}
                              disabled
                              className="mt-0.5 h-3.5 w-3.5"
                            />
                            <span className={`${ch.focusAreaPassed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                              {obj}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        No objectives mapped to this chapter yet
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/30">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-destructive hover:text-destructive"
                        onClick={() => handleRemoveChapter(index)}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Remove
                      </Button>
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>

      {/* Add custom topic */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Add a custom chapter/topic..."
            value={newTopicInput}
            onChange={(e) => setNewTopicInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddTopic()}
            className="h-8 text-sm"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 flex-shrink-0"
            onClick={handleAddTopic}
            disabled={addingTopic || !newTopicInput.trim()}
          >
            {addingTopic ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          Add topics not in the syllabus for extra study coverage
        </p>
      </div>
    </Card>
  );
};

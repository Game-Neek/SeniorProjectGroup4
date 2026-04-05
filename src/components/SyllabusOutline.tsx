import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BookOpen, Target, Calendar, GraduationCap, Package, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ChapterSelectionDialog } from "@/components/ChapterSelectionDialog";

interface SyllabusOutlineProps {
  syllabusId: string;
  className: string;
  filePath: string;
  parsedAt: string | null;
  courseDescription: string | null;
  learningObjectives: string[] | null;
  weeklySchedule: any[] | null;
  gradingPolicy: any[] | null;
  requiredMaterials: string[] | null;
  onParseComplete: () => void;
}

export const SyllabusOutline = ({
  syllabusId,
  className,
  filePath,
  parsedAt,
  courseDescription,
  learningObjectives,
  weeklySchedule,
  gradingPolicy,
  requiredMaterials,
  onParseComplete,
}: SyllabusOutlineProps) => {
  const [isParsing, setIsParsing] = useState(false);
  const [showChapterSelection, setShowChapterSelection] = useState(false);
  const [extractedTopics, setExtractedTopics] = useState<string[]>([]);
  const { toast } = useToast();

  const handleParseSyllabus = async () => {
    setIsParsing(true);
    try {
      // Download the syllabus file to get its text content
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("syllabi")
        .download(filePath);

      if (downloadError) throw downloadError;

      const text = await fileData.text();

      // Call the edge function with parse-syllabus request type
      const { data, error } = await supabase.functions.invoke("agent-b-chat", {
        body: {
          requestType: "parse-syllabus",
          className,
          messages: [
            {
              role: "user",
              content: `Here is the syllabus content for ${className}. Please extract the course outline:\n\n${text.substring(0, 12000)}`,
            },
          ],
        },
      });

      if (error) throw error;

      // Save parsed data to the syllabi table
      const { error: updateError } = await supabase
        .from("syllabi")
        .update({
          course_description: data.courseDescription,
          learning_objectives: data.learningObjectives,
          weekly_schedule: data.weeklySchedule || null,
          grading_policy: data.gradingPolicy || null,
          required_materials: data.requiredMaterials || null,
          bloom_classifications: data.bloomClassifications || null,
          parsed_content: data.parsedSummary,
          parsed_at: new Date().toISOString(),
        } as any)
        .eq("id", syllabusId);

      if (updateError) throw updateError;

      toast({
        title: "Syllabus parsed!",
        description: `Extracted course outline for ${className}`,
      });

      // Extract topics for chapter selection
      const topics: string[] = [];
      if (data.weeklySchedule) {
        data.weeklySchedule.forEach((w: any) => { if (w.topic) topics.push(w.topic); });
      }
      if (topics.length === 0 && data.learningObjectives) {
        topics.push(...data.learningObjectives.slice(0, 15));
      }

      if (topics.length > 0) {
        setExtractedTopics(topics);
        setShowChapterSelection(true);
      }

      // Auto-populate calendar from syllabus dates
      await autoPopulateCalendar(data.weeklySchedule, data.gradingPolicy);

      // Dispatch event so course page components (ChapterBreakdowns, CourseTextbooks) can refresh
      window.dispatchEvent(new CustomEvent("syllabus-reparsed", { detail: { className } }));

      onParseComplete();
    } catch (error) {
      console.error("Parse error:", error);
      toast({
        title: "Parsing failed",
        description: error instanceof Error ? error.message : "Failed to parse syllabus",
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
    }
  };

  const autoPopulateCalendar = async (weeklySchedule: any[], gradingPolicy: any[]) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const events: { title: string; date: string; type: string }[] = [];
    const now = new Date();
    // Estimate semester start as current or next Monday
    const semesterStart = new Date(now);
    semesterStart.setDate(semesterStart.getDate() - semesterStart.getDay() + 1);
    if (semesterStart < now) semesterStart.setDate(semesterStart.getDate() - 7); // go back to start of current week

    if (Array.isArray(weeklySchedule)) {
      weeklySchedule.forEach((week: any) => {
        const weekNum = parseInt(week.week) || 0;
        if (weekNum <= 0) return;
        const weekDate = new Date(semesterStart);
        weekDate.setDate(weekDate.getDate() + (weekNum - 1) * 7);
        const dateStr = weekDate.toISOString().split("T")[0];

        // Detect event types from topic/details
        const combined = `${week.topic || ""} ${week.details || ""}`.toLowerCase();
        if (combined.includes("midterm")) {
          events.push({ title: `${className}: Midterm`, date: dateStr, type: "midterm" });
        } else if (combined.includes("final")) {
          events.push({ title: `${className}: Final Exam`, date: dateStr, type: "final" });
        } else if (combined.includes("quiz")) {
          events.push({ title: `${className}: Quiz - ${week.topic}`, date: dateStr, type: "quiz" });
        } else if (combined.includes("exam") || combined.includes("test")) {
          events.push({ title: `${className}: ${week.topic}`, date: dateStr, type: "test" });
        } else if (combined.includes("lab") || combined.includes("due") || combined.includes("assignment") || combined.includes("homework")) {
          events.push({ title: `${className}: ${week.topic}`, date: dateStr, type: "homework" });
        }
        // Always add a study topic marker
        if (!events.find(e => e.date === dateStr)) {
          events.push({ title: `${className}: ${week.topic}`, date: dateStr, type: "other" });
        }
      });
    }

    if (events.length === 0) return;

    // Remove existing auto-generated events for this class to avoid duplicates
    await supabase
      .from("calendar_events")
      .delete()
      .eq("user_id", session.user.id)
      .ilike("description", `syllabus-auto:${className}`);

    // Insert new events
    let addedCount = 0;
    for (const evt of events) {
      const { error } = await supabase.from("calendar_events").insert({
        user_id: session.user.id,
        title: evt.title,
        event_date: evt.date,
        event_type: evt.type,
        description: `syllabus-auto:${className}`,
      });
      if (!error) addedCount++;
    }

    if (addedCount > 0) {
      toast({
        title: "Calendar updated",
        description: `${addedCount} dates added from syllabus to course calendar`,
      });
      // Notify course page to refresh calendar
      window.dispatchEvent(new CustomEvent("calendar-updated", { detail: { className } }));
    }
  };

  const handleChapterConfirm = async (selectedTopics: string[]) => {
    // Store the selected chapters in localStorage for use by study plan generation
    localStorage.setItem(`chapters-${className}`, JSON.stringify(selectedTopics));
    toast({
      title: "Chapters confirmed",
      description: `${selectedTopics.length} chapters selected for ${className}`,
    });
    // Dispatch event so adaptive learning picks up selected chapters
    window.dispatchEvent(new CustomEvent("chapters-selected", { detail: { className, topics: selectedTopics } }));
  };

  const hasParsedData = !!parsedAt;

  if (!hasParsedData) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleParseSyllabus}
        disabled={isParsing}
        className="gap-1.5"
      >
        {isParsing ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Parsing...
          </>
        ) : (
          <>
            <Sparkles className="w-3.5 h-3.5" />
            Extract Outline
          </>
        )}
      </Button>
    );
  }

  return (
    <Card className="p-4 mt-3 border-primary/20 bg-primary/5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-primary" />
        <h4 className="font-semibold text-sm text-foreground">Course Outline</h4>
        <Badge variant="secondary" className="text-xs ml-auto">
          Parsed {new Date(parsedAt!).toLocaleDateString()}
        </Badge>
      </div>

      <Accordion type="multiple" className="space-y-1">
        {courseDescription && (
          <AccordionItem value="description" className="border-border/50">
            <AccordionTrigger className="text-sm py-2 hover:no-underline">
              <span className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                Course Description
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground pb-3">
              {courseDescription}
            </AccordionContent>
          </AccordionItem>
        )}

        {learningObjectives && learningObjectives.length > 0 && (
          <AccordionItem value="objectives" className="border-border/50">
            <AccordionTrigger className="text-sm py-2 hover:no-underline">
              <span className="flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                Learning Objectives ({learningObjectives.length})
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-3">
              <ul className="space-y-1.5">
                {learningObjectives.map((obj, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2">
                    <span className="text-primary font-medium shrink-0">{i + 1}.</span>
                    {obj}
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        )}

        {weeklySchedule && weeklySchedule.length > 0 && (
          <AccordionItem value="schedule" className="border-border/50">
            <AccordionTrigger className="text-sm py-2 hover:no-underline">
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                Weekly Schedule ({weeklySchedule.length} weeks)
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-3">
              <div className="space-y-2">
                {weeklySchedule.map((week: any, i: number) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <Badge variant="outline" className="shrink-0 h-6">
                      Wk {week.week}
                    </Badge>
                    <div>
                      <p className="font-medium text-foreground">{week.topic}</p>
                      {week.details && (
                        <p className="text-xs text-muted-foreground">{week.details}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {gradingPolicy && gradingPolicy.length > 0 && (
          <AccordionItem value="grading" className="border-border/50">
            <AccordionTrigger className="text-sm py-2 hover:no-underline">
              <span className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-primary" />
                Grading Policy
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-3">
              <div className="space-y-1.5">
                {gradingPolicy.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{item.component}</span>
                    <span className="font-medium text-foreground">{item.weight}</span>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {requiredMaterials && requiredMaterials.length > 0 && (
          <AccordionItem value="materials" className="border-border/50">
            <AccordionTrigger className="text-sm py-2 hover:no-underline">
              <span className="flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" />
                Required Materials ({requiredMaterials.length})
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-3">
              <ul className="space-y-1">
                {requiredMaterials.map((mat, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2">
                    <span className="text-primary">•</span>
                    {mat}
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleParseSyllabus}
        disabled={isParsing}
        className="mt-2 text-xs gap-1.5"
      >
        {isParsing ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            Re-parsing...
          </>
        ) : (
          <>
            <Sparkles className="w-3 h-3" />
            Re-parse Syllabus
          </>
        )}
      </Button>

      <ChapterSelectionDialog
        open={showChapterSelection}
        onOpenChange={setShowChapterSelection}
        className={className}
        topics={extractedTopics}
        onConfirm={handleChapterConfirm}
      />
    </Card>
  );
};

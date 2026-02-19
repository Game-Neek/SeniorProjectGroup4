import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BookOpen, Target, Calendar, GraduationCap, Package, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
          parsed_content: data.parsedSummary,
          parsed_at: new Date().toISOString(),
        })
        .eq("id", syllabusId);

      if (updateError) throw updateError;

      toast({
        title: "Syllabus parsed!",
        description: `Extracted course outline for ${className}`,
      });

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
    </Card>
  );
};

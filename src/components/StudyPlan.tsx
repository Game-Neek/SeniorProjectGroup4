import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Target, BookOpen, Lightbulb, CheckCircle2, Loader2, 
  RefreshCw, Video, FileText, PenTool, Headphones
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface QuizResult {
  className: string;
  score: number;
  totalQuestions: number;
  weakAreas: string[];
  strongAreas: string[];
}

interface LearningObjective {
  id: number;
  topic: string;
  description: string;
  priority: "high" | "medium" | "low";
  completed: boolean;
}

interface StudyResource {
  id: number;
  title: string;
  type: "video" | "reading" | "practice" | "audio";
  topic: string;
  description: string;
  estimatedTime: string;
}

interface StudyPlanProps {
  quizResult: QuizResult | null;
  learningStyles: string[];
  onClear: () => void;
}

const resourceIcons = {
  video: Video,
  reading: FileText,
  practice: PenTool,
  audio: Headphones,
};

export const StudyPlan = ({ quizResult, learningStyles, onClear }: StudyPlanProps) => {
  const [objectives, setObjectives] = useState<LearningObjective[]>([]);
  const [resources, setResources] = useState<StudyResource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [completedObjectives, setCompletedObjectives] = useState<Set<number>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    if (quizResult) {
      generateStudyPlan();
    }
  }, [quizResult]);

  const generateStudyPlan = async () => {
    if (!quizResult) return;

    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-b-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: [{
              role: "user",
              content: `Generate a study plan for ${quizResult.className}. 
                Score: ${quizResult.score}/${quizResult.totalQuestions}
                Weak areas: ${quizResult.weakAreas.join(", ")}
                Strong areas: ${quizResult.strongAreas.join(", ")}
                Learning styles: ${learningStyles.join(", ")}`
            }],
            learningStyles,
            requestType: "study-plan",
            className: quizResult.className,
            quizResult,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to generate study plan");
      }

      const data = await response.json();

      if (data.objectives) {
        setObjectives(data.objectives);
      }
      if (data.resources) {
        setResources(data.resources);
      }

      toast({
        title: "Study Plan Created",
        description: "Personalized objectives and resources are ready!",
      });
    } catch (error) {
      console.error("Study plan generation error:", error);
      toast({
        title: "Generation Failed",
        description: "Failed to generate study plan. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleObjective = (id: number) => {
    setCompletedObjectives((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const completionPercentage = objectives.length > 0
    ? Math.round((completedObjectives.size / objectives.length) * 100)
    : 0;

  if (!quizResult) return null;

  const priorityColors = {
    high: "bg-destructive/10 text-destructive border-destructive/20",
    medium: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    low: "bg-green-500/10 text-green-600 border-green-500/20",
  };

  return (
    <Card className="p-6 shadow-[var(--shadow-soft)] border-border">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Target className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Your Study Plan</h3>
            <p className="text-sm text-muted-foreground">
              Based on your {quizResult.className} quiz ({quizResult.score}/{quizResult.totalQuestions})
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={generateStudyPlan} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Generating your personalized study plan...</span>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Learning Objectives */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-foreground flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                Learning Objectives
              </h4>
              <Badge variant="secondary">{completionPercentage}% complete</Badge>
            </div>
            
            <Progress value={completionPercentage} className="h-2" />

            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-3">
                {objectives.map((obj) => (
                  <div
                    key={obj.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      completedObjectives.has(obj.id)
                        ? "bg-muted/50 border-muted"
                        : "bg-card border-border hover:border-primary/50"
                    }`}
                    onClick={() => toggleObjective(obj.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        completedObjectives.has(obj.id)
                          ? "bg-primary border-primary"
                          : "border-muted-foreground"
                      }`}>
                        {completedObjectives.has(obj.id) && (
                          <CheckCircle2 className="w-4 h-4 text-primary-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-medium text-sm ${
                            completedObjectives.has(obj.id) ? "line-through text-muted-foreground" : "text-foreground"
                          }`}>
                            {obj.topic}
                          </span>
                          <Badge className={`text-xs ${priorityColors[obj.priority]}`}>
                            {obj.priority}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{obj.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Study Resources */}
          <div className="space-y-4">
            <h4 className="font-semibold text-foreground flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-secondary" />
              Recommended Resources
            </h4>

            <ScrollArea className="h-[340px] pr-4">
              <div className="space-y-3">
                {resources.map((resource) => {
                  const IconComponent = resourceIcons[resource.type];
                  return (
                    <div
                      key={resource.id}
                      className="p-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-all cursor-pointer"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-secondary/10">
                          <IconComponent className="w-4 h-4 text-secondary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm text-foreground truncate">
                              {resource.title}
                            </span>
                            <Badge variant="outline" className="text-xs ml-2 flex-shrink-0">
                              {resource.estimatedTime}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-1">{resource.description}</p>
                          <Badge variant="secondary" className="text-xs">
                            {resource.topic}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}

      {/* Weak Areas Summary */}
      {quizResult.weakAreas.length > 0 && (
        <div className="mt-6 pt-6 border-t border-border">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            <h4 className="font-semibold text-foreground">Focus Areas</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {quizResult.weakAreas.map((area, idx) => (
              <Badge key={idx} variant="outline" className="bg-amber-500/5 border-amber-500/20 text-amber-600">
                {area}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};

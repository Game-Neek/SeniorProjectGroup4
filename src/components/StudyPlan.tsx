import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { 
  Target, BookOpen, Lightbulb, CheckCircle2, Loader2, 
  RefreshCw, Video, FileText, PenTool, Headphones, ExternalLink
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { QuizResult, LearningObjective, StudyResource } from "@/hooks/useStudyPlan";
import { toast } from "sonner";

interface StudyPlanProps {
  quizResult: QuizResult | null;
  objectives: LearningObjective[];
  resources: StudyResource[];
  completedObjectives: Set<number>;
  completionPercentage: number;
  isLoading: boolean;
  learningStyles: string[];
  onToggleObjective: (id: number) => void;
  onClear: () => void;
  onRefresh: () => void;
  completedClasses: string[];
  activeClass: string | null;
  onClassChange: (className: string) => void;
}

const resourceIcons = {
  video: Video,
  reading: FileText,
  practice: PenTool,
  audio: Headphones,
};

export const StudyPlan = ({ 
  quizResult, 
  objectives, 
  resources, 
  completedObjectives,
  completionPercentage,
  isLoading,
  learningStyles,
  onToggleObjective,
  onClear,
  onRefresh,
  completedClasses,
  activeClass,
  onClassChange,
}: StudyPlanProps) => {
  const [selectedResource, setSelectedResource] = useState<StudyResource | null>(null);
  const [resourceContent, setResourceContent] = useState<string>("");
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  const handleResourceClick = (resource: StudyResource) => {
    if (resource.url) {
      // Copy URL to clipboard and show toast - sandbox blocks window.open
      navigator.clipboard.writeText(resource.url).then(() => {
        toast.success("Link copied to clipboard!", {
          description: "Open in a new browser tab to view the resource.",
          duration: 5000,
        });
      }).catch(() => {
        // Fallback: show the URL in an alert
        toast.info("Resource Link", {
          description: resource.url,
          duration: 8000,
        });
      });
    } else {
      openResource(resource);
    }
  };

  const openResource = async (resource: StudyResource) => {
    setSelectedResource(resource);
    setResourceContent("");
    setIsLoadingContent(true);

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
              content: `Generate detailed ${resource.type} content for: "${resource.title}" about ${resource.topic}. Description: ${resource.description}`
            }],
            learningStyles,
            requestType: "resource-content",
            resourceType: resource.type,
            resourceTitle: resource.title,
            topic: resource.topic,
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to load resource content");

      const data = await response.json();
      setResourceContent(data.content || data.reply || "Content not available.");
    } catch (error) {
      console.error("Resource content error:", error);
      setResourceContent("Failed to load content. Please try again.");
    } finally {
      setIsLoadingContent(false);
    }
  };

  if (completedClasses.length === 0) return null;

  const priorityColors = {
    high: "bg-destructive/10 text-destructive border-destructive/20",
    medium: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    low: "bg-green-500/10 text-green-600 border-green-500/20",
  };

  return (
    <Card className="p-6 shadow-[var(--shadow-soft)] border-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Target className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Your Study Plan</h3>
            {quizResult && (
              <p className="text-sm text-muted-foreground">
                Based on your {quizResult.className} quiz ({quizResult.score}/{quizResult.totalQuestions})
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading || !quizResult}>
            <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear} disabled={!quizResult}>
            Clear
          </Button>
        </div>
      </div>

      {/* Class Tabs */}
      {completedClasses.length > 1 && (
        <Tabs value={activeClass || completedClasses[0]} onValueChange={onClassChange} className="mb-6">
          <TabsList className="flex-wrap h-auto gap-1">
            {completedClasses.map((className) => (
              <TabsTrigger key={className} value={className} className="text-sm">
                {className}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

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
                    onClick={() => onToggleObjective(obj.id)}
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
                      className="p-3 rounded-lg border border-border bg-card hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group"
                      onClick={() => handleResourceClick(resource)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-secondary/10 group-hover:bg-secondary/20 transition-colors">
                          <IconComponent className="w-4 h-4 text-secondary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm text-foreground truncate group-hover:text-primary transition-colors">
                              {resource.title}
                            </span>
                            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                              <Badge variant="outline" className="text-xs">
                                {resource.estimatedTime}
                              </Badge>
                              {resource.url && (
                                <ExternalLink className="w-3 h-3 text-primary" />
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mb-1">{resource.description}</p>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {resource.topic}
                            </Badge>
                            {resource.source && (
                              <Badge variant="outline" className="text-xs text-muted-foreground">
                                {resource.source}
                              </Badge>
                            )}
                          </div>
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
      {quizResult && quizResult.weakAreas.length > 0 && (
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

      {/* Resource Content Dialog */}
      <Dialog open={!!selectedResource} onOpenChange={() => setSelectedResource(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedResource && (
                <>
                  {(() => {
                    const IconComponent = resourceIcons[selectedResource.type];
                    return <IconComponent className="w-5 h-5 text-primary" />;
                  })()}
                  {selectedResource.title}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedResource?.topic} • {selectedResource?.estimatedTime}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            {isLoadingContent ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Loading content...</span>
              </div>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <div className="whitespace-pre-wrap text-foreground">{resourceContent}</div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

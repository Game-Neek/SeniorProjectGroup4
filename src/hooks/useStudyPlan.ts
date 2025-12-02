import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface QuizResult {
  className: string;
  score: number;
  totalQuestions: number;
  weakAreas: string[];
  strongAreas: string[];
}

export interface LearningObjective {
  id: number;
  topic: string;
  description: string;
  priority: "high" | "medium" | "low";
  completed: boolean;
}

export interface StudyResource {
  id: number;
  title: string;
  type: "video" | "reading" | "practice" | "audio";
  topic: string;
  description: string;
  estimatedTime: string;
  content?: string;
}

export interface StudyPlanState {
  quizResult: QuizResult | null;
  objectives: LearningObjective[];
  resources: StudyResource[];
  completedObjectives: Set<number>;
  isLoading: boolean;
}

export const useStudyPlan = (learningStyles: string[]) => {
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [objectives, setObjectives] = useState<LearningObjective[]>([]);
  const [resources, setResources] = useState<StudyResource[]>([]);
  const [completedObjectives, setCompletedObjectives] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const generateStudyPlan = useCallback(async (result: QuizResult) => {
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
              content: `Generate a study plan for ${result.className}. 
                Score: ${result.score}/${result.totalQuestions}
                Weak areas: ${result.weakAreas.join(", ")}
                Strong areas: ${result.strongAreas.join(", ")}
                Learning styles: ${learningStyles.join(", ")}`
            }],
            learningStyles,
            requestType: "study-plan",
            className: result.className,
            quizResult: result,
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
  }, [learningStyles, toast]);

  const setQuizResultAndGenerate = useCallback((result: QuizResult) => {
    setQuizResult(result);
    generateStudyPlan(result);
  }, [generateStudyPlan]);

  const toggleObjective = useCallback((id: number) => {
    setCompletedObjectives((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const clearStudyPlan = useCallback(() => {
    setQuizResult(null);
    setObjectives([]);
    setResources([]);
    setCompletedObjectives(new Set());
  }, []);

  const completionPercentage = objectives.length > 0
    ? Math.round((completedObjectives.size / objectives.length) * 100)
    : 0;

  return {
    quizResult,
    objectives,
    resources,
    completedObjectives,
    isLoading,
    completionPercentage,
    setQuizResultAndGenerate,
    toggleObjective,
    clearStudyPlan,
    generateStudyPlan,
  };
};

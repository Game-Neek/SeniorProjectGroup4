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

export interface ClassStudyPlan {
  quizResult: QuizResult;
  objectives: LearningObjective[];
  resources: StudyResource[];
  completedObjectives: Set<number>;
}

export interface StudyPlanState {
  quizResult: QuizResult | null;
  objectives: LearningObjective[];
  resources: StudyResource[];
  completedObjectives: Set<number>;
  isLoading: boolean;
}

export const useStudyPlan = (learningStyles: string[]) => {
  const [classPlans, setClassPlans] = useState<Map<string, ClassStudyPlan>>(new Map());
  const [activeClass, setActiveClass] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Get current active plan
  const currentPlan = activeClass ? classPlans.get(activeClass) : null;
  const quizResult = currentPlan?.quizResult || null;
  const objectives = currentPlan?.objectives || [];
  const resources = currentPlan?.resources || [];
  const completedObjectives = currentPlan?.completedObjectives || new Set<number>();

  // Get all completed classes
  const completedClasses = Array.from(classPlans.keys());

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

      const newPlan: ClassStudyPlan = {
        quizResult: result,
        objectives: data.objectives || [],
        resources: data.resources || [],
        completedObjectives: new Set(),
      };

      setClassPlans(prev => {
        const updated = new Map(prev);
        updated.set(result.className, newPlan);
        return updated;
      });
      setActiveClass(result.className);

      toast({
        title: "Study Plan Created",
        description: `Personalized plan for ${result.className} is ready!`,
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
    generateStudyPlan(result);
  }, [generateStudyPlan]);

  const toggleObjective = useCallback((id: number) => {
    if (!activeClass) return;
    
    setClassPlans(prev => {
      const updated = new Map(prev);
      const plan = updated.get(activeClass);
      if (plan) {
        const newCompleted = new Set(plan.completedObjectives);
        if (newCompleted.has(id)) {
          newCompleted.delete(id);
        } else {
          newCompleted.add(id);
        }
        updated.set(activeClass, { ...plan, completedObjectives: newCompleted });
      }
      return updated;
    });
  }, [activeClass]);

  const clearStudyPlan = useCallback(() => {
    if (!activeClass) return;
    
    setClassPlans(prev => {
      const updated = new Map(prev);
      updated.delete(activeClass);
      return updated;
    });
    
    // Set to next available class or null
    const remaining = Array.from(classPlans.keys()).filter(c => c !== activeClass);
    setActiveClass(remaining.length > 0 ? remaining[0] : null);
  }, [activeClass, classPlans]);

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
    // New exports for multi-class support
    completedClasses,
    activeClass,
    setActiveClass,
    classPlans,
  };
};

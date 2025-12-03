import { useState, useCallback, useEffect } from "react";
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
  url?: string;
  source?: string;
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
  const [isInitialized, setIsInitialized] = useState(false);
  const { toast } = useToast();

  // Get current active plan
  const currentPlan = activeClass ? classPlans.get(activeClass) : null;
  const quizResult = currentPlan?.quizResult || null;
  const objectives = currentPlan?.objectives || [];
  const resources = currentPlan?.resources || [];
  const completedObjectives = currentPlan?.completedObjectives || new Set<number>();

  // Get all completed classes
  const completedClasses = Array.from(classPlans.keys());

  // Load quiz results from database on mount
  useEffect(() => {
    const loadQuizResults = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setIsInitialized(true);
        return;
      }

      const { data, error } = await supabase
        .from('quiz_results')
        .select('*')
        .eq('user_id', session.user.id);

      if (error) {
        console.error('Error loading quiz results:', error);
        setIsInitialized(true);
        return;
      }

      if (data && data.length > 0) {
        const loadedPlans = new Map<string, ClassStudyPlan>();
        
        data.forEach((row) => {
          const plan: ClassStudyPlan = {
            quizResult: {
              className: row.class_name,
              score: row.score,
              totalQuestions: row.total_questions,
              weakAreas: row.weak_areas || [],
              strongAreas: row.strong_areas || [],
            },
            objectives: (row.objectives as unknown as LearningObjective[]) || [],
            resources: (row.resources as unknown as StudyResource[]) || [],
            completedObjectives: new Set(row.completed_objectives || []),
          };
          loadedPlans.set(row.class_name, plan);
        });

        setClassPlans(loadedPlans);
        // Set first class as active if none selected
        const firstClass = data[0].class_name;
        setActiveClass(firstClass);
      }
      
      setIsInitialized(true);
    };

    loadQuizResults();
  }, []);

  // Save quiz result to database
  const saveQuizResult = useCallback(async (
    plan: ClassStudyPlan,
    userId: string
  ) => {
    // First try to update existing record
    const { data: existing } = await supabase
      .from('quiz_results')
      .select('id')
      .eq('user_id', userId)
      .eq('class_name', plan.quizResult.className)
      .maybeSingle();

    if (existing) {
      // Update existing record
      const { error } = await supabase
        .from('quiz_results')
        .update({
          score: plan.quizResult.score,
          total_questions: plan.quizResult.totalQuestions,
          weak_areas: plan.quizResult.weakAreas,
          strong_areas: plan.quizResult.strongAreas,
          objectives: plan.objectives as never,
          resources: plan.resources as never,
          completed_objectives: Array.from(plan.completedObjectives),
        })
        .eq('id', existing.id);

      if (error) {
        console.error('Error updating quiz result:', error);
      }
    } else {
      // Insert new record
      const { error } = await supabase
        .from('quiz_results')
        .insert({
          user_id: userId,
          class_name: plan.quizResult.className,
          score: plan.quizResult.score,
          total_questions: plan.quizResult.totalQuestions,
          weak_areas: plan.quizResult.weakAreas,
          strong_areas: plan.quizResult.strongAreas,
          objectives: plan.objectives as unknown as Record<string, unknown>,
          resources: plan.resources as unknown as Record<string, unknown>,
          completed_objectives: Array.from(plan.completedObjectives),
        } as never);

      if (error) {
        console.error('Error inserting quiz result:', error);
      }
    }
  }, []);

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

      // Save to database
      if (session?.user?.id) {
        await saveQuizResult(newPlan, session.user.id);
      }

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
  }, [learningStyles, toast, saveQuizResult]);

  const setQuizResultAndGenerate = useCallback((result: QuizResult) => {
    generateStudyPlan(result);
  }, [generateStudyPlan]);

  const toggleObjective = useCallback(async (id: number) => {
    if (!activeClass) return;
    
    const { data: { session } } = await supabase.auth.getSession();
    
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
        const updatedPlan = { ...plan, completedObjectives: newCompleted };
        updated.set(activeClass, updatedPlan);
        
        // Save to database
        if (session?.user?.id) {
          saveQuizResult(updatedPlan, session.user.id);
        }
      }
      return updated;
    });
  }, [activeClass, saveQuizResult]);

  const clearStudyPlan = useCallback(async () => {
    if (!activeClass) return;
    
    const { data: { session } } = await supabase.auth.getSession();
    
    // Delete from database
    if (session?.user?.id) {
      await supabase
        .from('quiz_results')
        .delete()
        .eq('user_id', session.user.id)
        .eq('class_name', activeClass);
    }
    
    setClassPlans(prev => {
      const updated = new Map(prev);
      updated.delete(activeClass);
      return updated;
    });
    
    // Set to next available class or null
    const remaining = Array.from(classPlans.keys()).filter(c => c !== activeClass);
    setActiveClass(remaining.length > 0 ? remaining[0] : null);
  }, [activeClass, classPlans]);

  // Save all progress to database (useful before logout)
  const saveAllProgress = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;

    const savePromises = Array.from(classPlans.values()).map(plan => 
      saveQuizResult(plan, session.user.id)
    );
    
    await Promise.all(savePromises);
  }, [classPlans, saveQuizResult]);

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
    saveAllProgress,
    // New exports for multi-class support
    completedClasses,
    activeClass,
    setActiveClass,
    classPlans,
    isInitialized,
  };
};

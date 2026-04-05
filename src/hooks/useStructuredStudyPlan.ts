import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface FocusArea {
  id: string;
  topic: string;
  topic_order: number;
  is_unlocked: boolean;
  quiz_passed: boolean;
  quiz_score: number | null;
  quiz_threshold: number;
  estimated_time_minutes: number | null;
  modules: StudyModule[];
}

export interface StudyModule {
  id: string;
  focus_area_id: string;
  module_type: "lesson" | "practice" | "quiz";
  title: string;
  description: string | null;
  content: string | null;
  module_order: number;
  is_completed: boolean;
  completed_at: string | null;
  estimated_time_minutes: number | null;
}

export type ScoreTier = "perfect" | "passed" | "failed";

export const getScoreTier = (score: number, total: number): ScoreTier => {
  const pct = Math.round((score / total) * 100);
  if (pct === 100) return "perfect";
  if (pct >= 70) return "passed";
  return "failed";
};

export const useStructuredStudyPlan = (className: string, learningStyles: string[]) => {
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeFocusAreaId, setActiveFocusAreaId] = useState<string | null>(null);
  const [loadingModuleContent, setLoadingModuleContent] = useState<string | null>(null);
  const [reviewAreaId, setReviewAreaId] = useState<string | null>(null);
  const [reviewMissedConcepts, setReviewMissedConcepts] = useState<string[]>([]);
  const [isGeneratingReview, setIsGeneratingReview] = useState(false);
  const { toast } = useToast();

  // Load focus areas and modules from DB
  const loadFocusAreas = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !className) return;

    setIsLoading(true);
    const { data: areas, error } = await supabase
      .from("study_focus_areas")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("class_name", className)
      .order("topic_order", { ascending: true });

    if (error || !areas) { setIsLoading(false); return; }

    if (areas.length === 0) {
      setFocusAreas([]);
      setIsLoading(false);
      return;
    }

    const { data: modules } = await supabase
      .from("study_modules")
      .select("*")
      .eq("user_id", session.user.id)
      .in("focus_area_id", areas.map(a => a.id))
      .order("module_order", { ascending: true });

    const enriched: FocusArea[] = areas.map(area => ({
      ...area,
      modules: (modules || []).filter(m => m.focus_area_id === area.id) as StudyModule[],
    }));

    setFocusAreas(enriched);
    if (!activeFocusAreaId && enriched.length > 0) {
      const firstUnlocked = enriched.find(a => a.is_unlocked && !a.quiz_passed);
      setActiveFocusAreaId(firstUnlocked?.id || enriched[0].id);
    }
    setIsLoading(false);
  }, [className, activeFocusAreaId]);

  useEffect(() => { loadFocusAreas(); }, [className]);

  // Generate plan from syllabus
  const generatePlan = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    setIsGenerating(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-b-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: `Generate a structured study plan with focus areas and modules for ${className}` }],
            learningStyles,
            requestType: "structured-study-plan",
            className,
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to generate structured plan");
      const data = await response.json();
      const generatedAreas = data.focus_areas || [];

      // Delete existing
      await supabase
        .from("study_focus_areas")
        .delete()
        .eq("user_id", session.user.id)
        .eq("class_name", className);

      for (let i = 0; i < generatedAreas.length; i++) {
        const area = generatedAreas[i];
        const { data: inserted, error: areaError } = await supabase
          .from("study_focus_areas")
          .insert({
            user_id: session.user.id,
            class_name: className,
            topic: area.topic,
            topic_order: i,
            is_unlocked: i === 0,
            estimated_time_minutes: area.estimated_time_minutes || 60,
          })
          .select()
          .single();

        if (areaError || !inserted) continue;

        const modules = area.modules || [];
        for (let j = 0; j < modules.length; j++) {
          const mod = modules[j];
          await supabase.from("study_modules").insert({
            focus_area_id: inserted.id,
            user_id: session.user.id,
            module_type: mod.module_type || "lesson",
            title: mod.title,
            description: mod.description || null,
            content: mod.content || null,
            module_order: j,
            estimated_time_minutes: mod.estimated_time_minutes || 15,
          });
        }
      }

      await loadFocusAreas();
      toast({ title: "Study Plan Generated", description: `${generatedAreas.length} focus areas created for ${className}` });
    } catch (error) {
      console.error("Structured plan error:", error);
      toast({ title: "Generation Failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }, [className, learningStyles, loadFocusAreas, toast]);

  // Complete a module
  const completeModule = useCallback(async (moduleId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await supabase
      .from("study_modules")
      .update({ is_completed: true, completed_at: new Date().toISOString() })
      .eq("id", moduleId)
      .eq("user_id", session.user.id);

    await loadFocusAreas();
  }, [loadFocusAreas]);

  // Uncomplete a module
  const uncompleteModule = useCallback(async (moduleId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await supabase
      .from("study_modules")
      .update({ is_completed: false, completed_at: null })
      .eq("id", moduleId)
      .eq("user_id", session.user.id);

    await loadFocusAreas();
  }, [loadFocusAreas]);

  // Load module content on demand
  const loadModuleContent = useCallback(async (module: StudyModule, focusTopic: string) => {
    if (module.content) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    setLoadingModuleContent(module.id);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-b-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: `Generate ${module.module_type} content for "${module.title}" in the topic "${focusTopic}" for class "${className}"` }],
            learningStyles,
            requestType: "module-content",
            moduleType: module.module_type,
            moduleTitle: module.title,
            topic: focusTopic,
            className,
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to load module content");
      const data = await response.json();
      const content = data.content || data.reply || "";

      await supabase.from("study_modules").update({ content }).eq("id", module.id);
      await loadFocusAreas();
    } catch (error) {
      console.error("Module content error:", error);
      toast({ title: "Error", description: "Failed to load module content", variant: "destructive" });
    } finally {
      setLoadingModuleContent(null);
    }
  }, [className, learningStyles, loadFocusAreas, toast]);

  // Pass focus area quiz gate with tiered scoring
  const passQuizGate = useCallback(async (
    focusAreaId: string,
    score: number,
    total: number,
    missedConcepts?: string[]
  ) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const percentage = Math.round((score / total) * 100);
    const area = focusAreas.find(a => a.id === focusAreaId);
    if (!area) return;

    const tier = getScoreTier(score, total);

    if (tier === "perfect") {
      // 100% — advance immediately, no review
      await supabase
        .from("study_focus_areas")
        .update({ quiz_score: percentage, quiz_passed: true })
        .eq("id", focusAreaId)
        .eq("user_id", session.user.id);

      const nextArea = focusAreas.find(a => a.topic_order === area.topic_order + 1);
      if (nextArea) {
        await supabase
          .from("study_focus_areas")
          .update({ is_unlocked: true })
          .eq("id", nextArea.id)
          .eq("user_id", session.user.id);
      }

      await loadFocusAreas();
      toast({ title: "Perfect Score! 🎉", description: `${percentage}% — Next area unlocked!` });

    } else if (tier === "passed") {
      // 70-99% — advance, show targeted review
      await supabase
        .from("study_focus_areas")
        .update({ quiz_score: percentage, quiz_passed: true })
        .eq("id", focusAreaId)
        .eq("user_id", session.user.id);

      const nextArea = focusAreas.find(a => a.topic_order === area.topic_order + 1);
      if (nextArea) {
        await supabase
          .from("study_focus_areas")
          .update({ is_unlocked: true })
          .eq("id", nextArea.id)
          .eq("user_id", session.user.id);
      }

      await loadFocusAreas();

      // Show review for missed concepts
      if (missedConcepts && missedConcepts.length > 0) {
        setReviewAreaId(focusAreaId);
        setReviewMissedConcepts(missedConcepts);
      }

      toast({
        title: "Focus Area Passed! ✅",
        description: `${percentage}% — Next area unlocked. Review missed concepts below.`,
      });

    } else {
      // <70% — do NOT advance, require targeted review
      await supabase
        .from("study_focus_areas")
        .update({ quiz_score: percentage, quiz_passed: false })
        .eq("id", focusAreaId)
        .eq("user_id", session.user.id);

      await loadFocusAreas();

      // Trigger review generation
      if (missedConcepts && missedConcepts.length > 0) {
        setReviewAreaId(focusAreaId);
        setReviewMissedConcepts(missedConcepts);
      }

      toast({
        title: "Quiz Not Passed",
        description: `${percentage}% — Need 70% to advance. Review the missed concepts and retry.`,
        variant: "destructive",
      });
    }
  }, [focusAreas, loadFocusAreas, toast]);

  // Generate targeted review lesson for missed concepts
  const generateReviewLesson = useCallback(async (focusAreaId: string, missedConcepts: string[]) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const area = focusAreas.find(a => a.id === focusAreaId);
    if (!area) return null;

    setIsGeneratingReview(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-b-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: `Generate a targeted review lesson for "${area.topic}" covering these missed concepts: ${missedConcepts.join(", ")}` }],
            learningStyles,
            requestType: "targeted-review",
            className,
            topic: area.topic,
            weakAreas: missedConcepts,
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to generate review");
      const data = await response.json();
      return data.content || data.reply || "";
    } catch (error) {
      console.error("Review generation error:", error);
      toast({ title: "Error", description: "Failed to generate review lesson", variant: "destructive" });
      return null;
    } finally {
      setIsGeneratingReview(false);
    }
  }, [className, learningStyles, focusAreas, toast]);

  // Reset quiz for retry after review
  const resetQuizForRetry = useCallback(async (focusAreaId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Reset quiz score but keep modules
    await supabase
      .from("study_focus_areas")
      .update({ quiz_score: null, quiz_passed: false })
      .eq("id", focusAreaId)
      .eq("user_id", session.user.id);

    // Reset the quiz module completion so they can retake it
    const area = focusAreas.find(a => a.id === focusAreaId);
    if (area) {
      const quizModule = area.modules.find(m => m.module_type === "quiz");
      if (quizModule) {
        await supabase
          .from("study_modules")
          .update({ is_completed: false, completed_at: null })
          .eq("id", quizModule.id)
          .eq("user_id", session.user.id);
      }
    }

    setReviewAreaId(null);
    setReviewMissedConcepts([]);
    await loadFocusAreas();
  }, [focusAreas, loadFocusAreas]);

  // Computed values
  const totalModules = focusAreas.reduce((sum, a) => sum + a.modules.length, 0);
  const completedModules = focusAreas.reduce((sum, a) => sum + a.modules.filter(m => m.is_completed).length, 0);
  const overallProgress = totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0;
  const completedAreas = focusAreas.filter(a => a.quiz_passed).length;
  const estimatedWeeks = Math.max(1, Math.ceil(focusAreas.length / 2));

  const getFocusAreaProgress = (area: FocusArea) => {
    if (area.modules.length === 0) return 0;
    return Math.round((area.modules.filter(m => m.is_completed).length / area.modules.length) * 100);
  };

  const allModulesComplete = (area: FocusArea) => {
    // Check if lesson and practice are complete (quiz is the gate itself)
    const nonQuizModules = area.modules.filter(m => m.module_type !== "quiz");
    return nonQuizModules.length > 0 && nonQuizModules.every(m => m.is_completed);
  };

  const getModuleStep = (area: FocusArea): "lesson" | "practice" | "quiz" | "complete" => {
    if (area.quiz_passed) return "complete";
    const lesson = area.modules.find(m => m.module_type === "lesson");
    const practice = area.modules.find(m => m.module_type === "practice");
    if (!lesson?.is_completed) return "lesson";
    if (!practice?.is_completed) return "practice";
    return "quiz";
  };

  return {
    focusAreas,
    isLoading,
    isGenerating,
    activeFocusAreaId,
    setActiveFocusAreaId,
    generatePlan,
    completeModule,
    uncompleteModule,
    loadModuleContent,
    loadingModuleContent,
    passQuizGate,
    overallProgress,
    completedAreas,
    totalModules,
    completedModules,
    estimatedWeeks,
    getFocusAreaProgress,
    allModulesComplete,
    getModuleStep,
    reviewAreaId,
    reviewMissedConcepts,
    setReviewAreaId,
    setReviewMissedConcepts,
    generateReviewLesson,
    isGeneratingReview,
    resetQuizForRetry,
    reload: loadFocusAreas,
  };
};

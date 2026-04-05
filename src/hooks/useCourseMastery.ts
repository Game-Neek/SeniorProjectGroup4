import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CourseMasteryData {
  topicMastery: number; // % of focus areas passed
  practiceScore: number; // avg practice score
  moduleProgress: number; // % of modules completed
  bloomCoverage: number; // % of bloom levels touched
  loading: boolean;
}

export const useCourseMastery = (className: string): CourseMasteryData => {
  const [data, setData] = useState<CourseMasteryData>({
    topicMastery: 0,
    practiceScore: 0,
    moduleProgress: 0,
    bloomCoverage: 0,
    loading: true,
  });

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !className) return;

    try {
      // Focus areas mastery
      const { data: areas } = await supabase
        .from("study_focus_areas")
        .select("quiz_passed")
        .eq("user_id", session.user.id)
        .eq("class_name", className);

      const totalAreas = areas?.length || 0;
      const passedAreas = areas?.filter(a => a.quiz_passed).length || 0;
      const topicMastery = totalAreas > 0 ? Math.round((passedAreas / totalAreas) * 100) : 0;

      // Module progress
      const { data: modules } = await supabase
        .from("study_modules")
        .select("is_completed, focus_area_id")
        .eq("user_id", session.user.id);

      // Filter to only modules belonging to this class's focus areas
      const areaIds = new Set((areas || []).map((a: any) => a.id));
      // We need area IDs — re-fetch with id
      const { data: areasWithId } = await supabase
        .from("study_focus_areas")
        .select("id")
        .eq("user_id", session.user.id)
        .eq("class_name", className);

      const classAreaIds = new Set((areasWithId || []).map(a => a.id));
      const classModules = (modules || []).filter(m => classAreaIds.has(m.focus_area_id));
      const totalModules = classModules.length;
      const completedModules = classModules.filter(m => m.is_completed).length;
      const moduleProgress = totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0;

      // Practice score average
      const { data: practice } = await supabase
        .from("practice_history")
        .select("score, total")
        .eq("user_id", session.user.id)
        .eq("class_name", className);

      let practiceScore = 0;
      if (practice && practice.length > 0) {
        const scores = practice
          .filter(p => p.total && p.total > 0)
          .map(p => ((p.score || 0) / p.total!) * 100);
        practiceScore = scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : 0;
      }

      // Bloom coverage from course_content
      const { data: content } = await supabase
        .from("course_content")
        .select("bloom_level")
        .eq("user_id", session.user.id)
        .eq("class_name", className);

      const bloomLevels = new Set(
        (content || []).map(c => c.bloom_level).filter(Boolean)
      );
      const bloomCoverage = Math.round((bloomLevels.size / 6) * 100); // 6 bloom levels

      setData({ topicMastery, practiceScore, moduleProgress, bloomCoverage, loading: false });
    } catch (err) {
      console.error("Mastery data error:", err);
      setData(prev => ({ ...prev, loading: false }));
    }
  }, [className]);

  useEffect(() => { load(); }, [load]);

  // Listen for study plan changes
  useEffect(() => {
    const handler = () => load();
    window.addEventListener("syllabus-reparsed", handler);
    return () => window.removeEventListener("syllabus-reparsed", handler);
  }, [load]);

  return data;
};

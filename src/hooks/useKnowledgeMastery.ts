import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface KnowledgeComponent {
  id: string;
  objective: string;
  source: string;
  bloom_level: string | null;
  parent_topic: string | null;
  component_order: number;
}

export interface KnowledgeMasteryItem {
  component: KnowledgeComponent;
  mastery_score: number;
  mastery_level: string;
  attempts: number;
  last_practiced_at: string | null;
}

export interface KnowledgeMasteryData {
  items: KnowledgeMasteryItem[];
  overallMastery: number;
  topicGroups: Map<string, KnowledgeMasteryItem[]>;
  loading: boolean;
  initialized: boolean;
  syncFromSyllabus: () => Promise<void>;
}

const getMasteryLevel = (score: number): string => {
  if (score >= 90) return "mastered";
  if (score >= 70) return "proficient";
  if (score >= 50) return "developing";
  if (score > 0) return "emerging";
  return "not_started";
};

export const useKnowledgeMastery = (className: string): KnowledgeMasteryData => {
  const [items, setItems] = useState<KnowledgeMasteryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !className) return;

    try {
      // Fetch components for this course
      const { data: components } = await supabase
        .from("knowledge_components" as any)
        .select("*")
        .eq("user_id", session.user.id)
        .eq("class_name", className)
        .order("component_order", { ascending: true });

      if (!components || components.length === 0) {
        setItems([]);
        setInitialized(false);
        setLoading(false);
        return;
      }

      const compIds = (components as any[]).map((c: any) => c.id);

      // Fetch mastery records
      const { data: masteryRows } = await supabase
        .from("knowledge_mastery" as any)
        .select("*")
        .eq("user_id", session.user.id)
        .in("component_id", compIds);

      const masteryMap = new Map<string, any>();
      (masteryRows || []).forEach((m: any) => masteryMap.set(m.component_id, m));

      const result: KnowledgeMasteryItem[] = (components as any[]).map((c: any) => {
        const m = masteryMap.get(c.id);
        return {
          component: {
            id: c.id,
            objective: c.objective,
            source: c.source,
            bloom_level: c.bloom_level,
            parent_topic: c.parent_topic,
            component_order: c.component_order,
          },
          mastery_score: m ? Number(m.mastery_score) : 0,
          mastery_level: m ? m.mastery_level : "not_started",
          attempts: m ? m.attempts : 0,
          last_practiced_at: m?.last_practiced_at || null,
        };
      });

      setItems(result);
      setInitialized(true);
      setLoading(false);
    } catch (err) {
      console.error("Knowledge mastery error:", err);
      setLoading(false);
    }
  }, [className]);

  // Sync learning objectives from syllabus into knowledge_components
  const syncFromSyllabus = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !className) return;

    // Get syllabus objectives
    const { data: syllabus } = await supabase
      .from("syllabi")
      .select("learning_objectives, weekly_schedule")
      .eq("user_id", session.user.id)
      .eq("class_name", className)
      .maybeSingle();

    if (!syllabus) return;

    const objectives: string[] = syllabus.learning_objectives || [];

    // Extract topics from weekly_schedule for parent_topic mapping
    const schedule = syllabus.weekly_schedule as any[] | null;
    const topicMap = new Map<string, string>();
    if (schedule) {
      schedule.forEach((week: any) => {
        const topics = week.topics || week.chapter || [];
        const topicList = Array.isArray(topics) ? topics : [topics];
        topicList.forEach((t: string) => {
          // Map objective keywords to topics
          objectives.forEach(obj => {
            if (obj.toLowerCase().includes(t.toLowerCase().slice(0, 10)) ||
                t.toLowerCase().includes(obj.toLowerCase().slice(0, 10))) {
              topicMap.set(obj, t);
            }
          });
        });
      });
    }

    if (objectives.length === 0) return;

    // Check existing components
    const { data: existing } = await supabase
      .from("knowledge_components" as any)
      .select("objective")
      .eq("user_id", session.user.id)
      .eq("class_name", className);

    const existingSet = new Set((existing || []).map((e: any) => e.objective));
    const newObjectives = objectives.filter(o => !existingSet.has(o));

    if (newObjectives.length === 0) {
      await load();
      return;
    }

    // Determine bloom level from verb
    const bloomVerbs: Record<string, string[]> = {
      remember: ["list", "define", "identify", "name", "recall", "recognize", "state"],
      understand: ["describe", "explain", "summarize", "discuss", "interpret", "classify"],
      apply: ["apply", "calculate", "solve", "use", "demonstrate", "implement"],
      analyze: ["analyze", "compare", "contrast", "examine", "differentiate", "distinguish"],
      evaluate: ["evaluate", "assess", "judge", "critique", "justify", "argue"],
      create: ["create", "design", "develop", "construct", "formulate", "propose"],
    };

    const getBloom = (text: string): string | null => {
      const firstWord = text.trim().split(/\s+/)[0]?.toLowerCase();
      for (const [level, verbs] of Object.entries(bloomVerbs)) {
        if (verbs.includes(firstWord)) return level;
      }
      return null;
    };

    const inserts = newObjectives.map((obj, i) => ({
      user_id: session.user.id,
      class_name: className,
      objective: obj,
      source: "syllabus",
      bloom_level: getBloom(obj),
      parent_topic: topicMap.get(obj) || null,
      component_order: (existing?.length || 0) + i,
    }));

    await supabase.from("knowledge_components" as any).insert(inserts);
    await load();
  }, [className, load]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = () => {
      syncFromSyllabus();
    };
    window.addEventListener("syllabus-reparsed", handler);
    window.addEventListener("knowledge-mastery-updated", handler);
    return () => {
      window.removeEventListener("syllabus-reparsed", handler);
      window.removeEventListener("knowledge-mastery-updated", handler);
    };
  }, [syncFromSyllabus]);

  // Auto-sync on first load if not initialized
  useEffect(() => {
    if (!loading && !initialized && className) {
      syncFromSyllabus();
    }
  }, [loading, initialized, className, syncFromSyllabus]);

  // Group by parent topic
  const topicGroups = new Map<string, KnowledgeMasteryItem[]>();
  items.forEach(item => {
    const key = item.component.parent_topic || "General";
    if (!topicGroups.has(key)) topicGroups.set(key, []);
    topicGroups.get(key)!.push(item);
  });

  const overallMastery = items.length > 0
    ? Math.round(items.reduce((sum, i) => sum + i.mastery_score, 0) / items.length)
    : 0;

  return { items, overallMastery, topicGroups, loading, initialized, syncFromSyllabus };
};

// Utility to update mastery after a practice/quiz event
export const updateKnowledgeMastery = async (
  userId: string,
  componentId: string,
  score: number, // 0-100 for this attempt
) => {
  // Upsert mastery record
  const { data: existing } = await supabase
    .from("knowledge_mastery" as any)
    .select("*")
    .eq("user_id", userId)
    .eq("component_id", componentId)
    .maybeSingle();

  const prev = existing as any;
  const attempts = prev ? prev.attempts + 1 : 1;
  // Exponential moving average: weight recent attempts more
  const alpha = 0.4;
  const newScore = prev
    ? Math.round(alpha * score + (1 - alpha) * Number(prev.mastery_score))
    : score;
  const level = getMasteryLevel(newScore);

  if (prev) {
    await supabase
      .from("knowledge_mastery" as any)
      .update({
        mastery_score: newScore,
        attempts,
        mastery_level: level,
        last_practiced_at: new Date().toISOString(),
      })
      .eq("id", prev.id);
  } else {
    await supabase
      .from("knowledge_mastery" as any)
      .insert({
        user_id: userId,
        component_id: componentId,
        mastery_score: newScore,
        attempts: 1,
        mastery_level: level,
        last_practiced_at: new Date().toISOString(),
      });
  }

  window.dispatchEvent(new CustomEvent("knowledge-mastery-updated"));
};

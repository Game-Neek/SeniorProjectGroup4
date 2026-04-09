import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface PerformanceLevel {
  level: string;
  score: number;
  description: string;
}

export interface RubricCriterion {
  id: string;
  rubric_id: string;
  criterion_name: string;
  description: string | null;
  weight: number;
  criterion_order: number;
  performance_levels: PerformanceLevel[];
}

export interface Rubric {
  id: string;
  class_name: string;
  title: string;
  description: string | null;
  assignment_id: string | null;
  bloom_level: string | null;
  source: string;
  status: string;
  learning_objectives: string[];
  created_at: string;
  updated_at: string;
  criteria?: RubricCriterion[];
}

export interface AssignmentExample {
  id: string;
  rubric_id: string;
  title: string;
  description: string | null;
  example_content: string;
  quality_level: string;
  annotations: { text: string; feedback: string }[];
  learning_objectives: string[];
  created_at: string;
}

export function useRubrics(className: string) {
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [examples, setExamples] = useState<Record<string, AssignmentExample[]>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const fetchRubrics = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: rubricData, error } = await supabase
        .from("rubrics")
        .select("*")
        .eq("class_name", className)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch criteria for each rubric
      const rubricIds = (rubricData || []).map(r => r.id);
      let criteriaMap: Record<string, RubricCriterion[]> = {};

      if (rubricIds.length > 0) {
        const { data: criteriaData } = await supabase
          .from("rubric_criteria")
          .select("*")
          .in("rubric_id", rubricIds)
          .order("criterion_order");

        if (criteriaData) {
          criteriaData.forEach((c: any) => {
            if (!criteriaMap[c.rubric_id]) criteriaMap[c.rubric_id] = [];
            criteriaMap[c.rubric_id].push({
              ...c,
              performance_levels: (c.performance_levels || []) as PerformanceLevel[],
            });
          });
        }

        // Fetch examples
        const { data: exData } = await supabase
          .from("assignment_examples")
          .select("*")
          .in("rubric_id", rubricIds)
          .order("created_at");

        if (exData) {
          const exMap: Record<string, AssignmentExample[]> = {};
          exData.forEach((e: any) => {
            if (!exMap[e.rubric_id]) exMap[e.rubric_id] = [];
            exMap[e.rubric_id].push({
              ...e,
              annotations: (e.annotations || []) as { text: string; feedback: string }[],
              learning_objectives: e.learning_objectives || [],
            });
          });
          setExamples(exMap);
        }
      }

      setRubrics((rubricData || []).map(r => ({
        ...r,
        learning_objectives: r.learning_objectives || [],
        criteria: criteriaMap[r.id] || [],
      })));
    } catch (err) {
      console.error("Error fetching rubrics:", err);
    } finally {
      setLoading(false);
    }
  }, [className]);

  useEffect(() => { fetchRubrics(); }, [fetchRubrics]);

  const generateRubric = useCallback(async (learningObjectives: string[], bloomLevel?: string, assignmentTitle?: string) => {
    setGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("generate-rubric", {
        body: { class_name: className, learning_objectives: learningObjectives, bloom_level: bloomLevel, assignment_title: assignmentTitle },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Save rubric
      const { data: rubric, error: rubricErr } = await supabase
        .from("rubrics")
        .insert({
          user_id: user.id,
          class_name: className,
          title: data.title,
          description: data.description,
          bloom_level: bloomLevel || null,
          source: "ai",
          status: "draft",
          learning_objectives: learningObjectives,
        })
        .select()
        .single();

      if (rubricErr) throw rubricErr;

      // Save criteria
      if (data.criteria?.length) {
        const criteriaRows = data.criteria.map((c: any, i: number) => ({
          rubric_id: rubric.id,
          user_id: user.id,
          criterion_name: c.criterion_name,
          description: c.description,
          weight: c.weight,
          criterion_order: i,
          performance_levels: c.performance_levels,
        }));
        await supabase.from("rubric_criteria").insert(criteriaRows);
      }

      // Save example
      if (data.example) {
        await supabase.from("assignment_examples").insert({
          rubric_id: rubric.id,
          user_id: user.id,
          title: data.example.title,
          description: data.example.description,
          example_content: data.example.example_content,
          quality_level: "proficient",
          annotations: data.example.annotations || [],
          learning_objectives: learningObjectives,
        });
      }

      toast({ title: "Rubric Generated", description: `"${data.title}" has been created with ${data.criteria?.length || 0} criteria.` });
      await fetchRubrics();
    } catch (err: any) {
      toast({ title: "Generation Failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }, [className, fetchRubrics, toast]);

  const deleteRubric = useCallback(async (rubricId: string) => {
    try {
      const { error } = await supabase.from("rubrics").delete().eq("id", rubricId);
      if (error) throw error;
      toast({ title: "Rubric Deleted" });
      await fetchRubrics();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }, [fetchRubrics, toast]);

  const updateRubricStatus = useCallback(async (rubricId: string, status: string) => {
    try {
      const { error } = await supabase.from("rubrics").update({ status }).eq("id", rubricId);
      if (error) throw error;
      await fetchRubrics();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }, [fetchRubrics, toast]);

  return { rubrics, examples, loading, generating, generateRubric, deleteRubric, updateRubricStatus, refetch: fetchRubrics };
}

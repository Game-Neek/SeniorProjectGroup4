import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Sparkles, Plus, BookOpen, Target, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRubrics } from "@/hooks/useRubrics";
import { RubricCard } from "@/components/RubricCard";

export default function RubricsPage() {
  const { className } = useParams<{ className: string }>();
  const navigate = useNavigate();
  const decodedClass = decodeURIComponent(className || "");
  const { rubrics, examples, loading, generating, generateRubric, deleteRubric, updateRubricStatus } = useRubrics(decodedClass);
  const [objectives, setObjectives] = useState<string[]>([]);
  const [bloomLevel, setBloomLevel] = useState<string | undefined>();

  useEffect(() => {
    async function loadObjectives() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !decodedClass) return;

      const { data: syllabi } = await supabase
        .from("syllabi")
        .select("learning_objectives, bloom_classifications")
        .eq("class_name", decodedClass)
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (syllabi?.learning_objectives) setObjectives(syllabi.learning_objectives);
      if (syllabi?.bloom_classifications) {
        const bc = syllabi.bloom_classifications as Record<string, any>;
        const topLevel = Object.entries(bc).sort(([, a]: any, [, b]: any) => (b?.count || 0) - (a?.count || 0))[0];
        if (topLevel) setBloomLevel(topLevel[0]);
      }
    }
    loadObjectives();
  }, [decodedClass]);

  const handleGenerate = () => {
    generateRubric(objectives, bloomLevel);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/course/${encodeURIComponent(decodedClass)}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Rubrics & Examples</h1>
            <p className="text-muted-foreground">{decodedClass}</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleGenerate} disabled={generating} className="gap-2">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Generating..." : "AI Generate Rubric"}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{rubrics.length}</p>
                <p className="text-sm text-muted-foreground">Total Rubrics</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <BookOpen className="h-5 w-5 text-green-700 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{rubrics.filter(r => r.status === "published").length}</p>
                <p className="text-sm text-muted-foreground">Published</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/50">
                <Sparkles className="h-5 w-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{objectives.length}</p>
                <p className="text-sm text-muted-foreground">Learning Objectives</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Rubrics list */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map(i => <Skeleton key={i} className="h-48 w-full" />)}
          </div>
        ) : rubrics.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center">
              <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Rubrics Yet</h3>
              <p className="text-muted-foreground mb-4">
                Generate an AI-powered rubric from your syllabus learning objectives, or create one manually.
              </p>
              <Button onClick={handleGenerate} disabled={generating} className="gap-2">
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate Your First Rubric
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {rubrics.map(rubric => (
              <RubricCard
                key={rubric.id}
                rubric={rubric}
                examples={examples[rubric.id] || []}
                onDelete={deleteRubric}
                onToggleStatus={updateRubricStatus}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

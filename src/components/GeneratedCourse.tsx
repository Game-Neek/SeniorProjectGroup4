import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BookOpen, FileQuestion, Zap, Link2, Loader2, Sparkles, RefreshCw,
  CheckCircle2, Clock, Brain, Wand2, ClipboardCheck, Shield
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MathText } from "@/components/MathText";
import { LessonRenderer } from "@/components/LessonRenderer";
import { ContentReview } from "@/components/ContentReview";
import { BiasAudit } from "@/components/BiasAudit";

interface CourseChapter {
  id: string;
  topic: string;
  topic_order: number;
  lesson_content: string | null;
  quiz_questions: any[];
  exercises: any[];
  study_resources: any[];
  bloom_level: string | null;
  generation_status: string;
}

interface GeneratedCourseProps {
  className: string;
}

export const GeneratedCourse = ({ className }: GeneratedCourseProps) => {
  const [chapters, setChapters] = useState<CourseChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [refining, setRefining] = useState<Set<string>>(new Set());
  const [generatingAll, setGeneratingAll] = useState(false);
  const { toast } = useToast();

  const loadChapters = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data } = await supabase
      .from("course_content")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("class_name", className)
      .order("topic_order", { ascending: true }) as any;

    setChapters(data || []);
    setLoading(false);
  }, [className]);

  useEffect(() => {
    loadChapters();
  }, [loadChapters]);

  // Listen for syllabus re-parse to scaffold new topics
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.className === className) {
        scaffoldFromSyllabus();
      }
    };
    window.addEventListener("syllabus-reparsed", handler);
    return () => window.removeEventListener("syllabus-reparsed", handler);
  }, [className]);

  // Listen for course-generated event (from auto-generation after parse)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.className === className) {
        loadChapters();
      }
    };
    window.addEventListener("course-generated", handler);
    return () => window.removeEventListener("course-generated", handler);
  }, [className, loadChapters]);

  const scaffoldFromSyllabus = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Fetch syllabus topics
    const { data: syllabus } = await supabase
      .from("syllabi")
      .select("learning_objectives, weekly_schedule, course_description, bloom_classifications")
      .eq("user_id", session.user.id)
      .eq("class_name", className)
      .maybeSingle();

    if (!syllabus) return;

    const objectives = syllabus.learning_objectives || [];
    const schedule = syllabus.weekly_schedule || [];
    const bloomData = (syllabus as any).bloom_classifications || [];

    // Build unique topic list from schedule + objectives
    const topics: { topic: string; bloomLevel?: string }[] = [];
    const seen = new Set<string>();

    if (Array.isArray(schedule)) {
      schedule.forEach((week: any) => {
        if (week.topic && !seen.has(week.topic)) {
          seen.add(week.topic);
          const bloom = bloomData.find?.((b: any) =>
            b.objective?.toLowerCase().includes(week.topic.toLowerCase())
          );
          topics.push({ topic: week.topic, bloomLevel: bloom?.bloomLevel });
        }
      });
    }

    // Add objectives not already covered by schedule topics
    objectives.forEach((obj: string) => {
      if (!seen.has(obj) && !Array.from(seen).some(t => obj.toLowerCase().includes(t.toLowerCase()))) {
        seen.add(obj);
        const bloom = bloomData.find?.((b: any) => b.objective === obj);
        topics.push({ topic: obj, bloomLevel: bloom?.bloomLevel });
      }
    });

    if (topics.length === 0) return;

    // Delete existing pending content for this class
    await supabase
      .from("course_content")
      .delete()
      .eq("user_id", session.user.id)
      .eq("class_name", className)
      .eq("generation_status", "pending") as any;

    // Insert scaffolded chapters
    const inserts = topics.map((t, i) => ({
      user_id: session.user.id,
      class_name: className,
      topic: t.topic,
      topic_order: i,
      bloom_level: t.bloomLevel || null,
      generation_status: "pending",
    }));

    await supabase.from("course_content").insert(inserts as any);
    await loadChapters();

    toast({
      title: "Course scaffolded",
      description: `${topics.length} chapters ready for content generation`,
    });
  };

  const generateChapter = async (chapter: CourseChapter) => {
    setGenerating((prev) => new Set(prev).add(chapter.id));

    try {
      const { data: syllabus } = await supabase
        .from("syllabi")
        .select("course_description")
        .eq("class_name", className)
        .maybeSingle();

      const { data, error } = await supabase.functions.invoke("generate-course", {
        body: {
          className,
          topic: chapter.topic,
          topicOrder: chapter.topic_order,
          bloomLevel: chapter.bloom_level,
          courseDescription: syllabus?.course_description,
          contentId: chapter.id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await loadChapters();
      toast({ title: "Chapter generated", description: `"${chapter.topic}" is ready` });
    } catch (error) {
      console.error("Generation error:", error);
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setGenerating((prev) => {
        const next = new Set(prev);
        next.delete(chapter.id);
        return next;
      });
    }
  };

  const refineChapter = async (chapter: CourseChapter, mode: string) => {
    setRefining((prev) => new Set(prev).add(chapter.id));
    try {
      const { data, error } = await supabase.functions.invoke("refine-content", {
        body: {
          contentId: chapter.id,
          lessonContent: chapter.lesson_content,
          quizQuestions: chapter.quiz_questions,
          exercises: chapter.exercises,
          refinementMode: mode,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await loadChapters();
      toast({
        title: "Content refined",
        description: data?.changesSummary || `"${chapter.topic}" has been polished`,
      });
    } catch (error) {
      console.error("Refinement error:", error);
      toast({
        title: "Refinement failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
      await supabase.from("course_content").update({ generation_status: "complete" }).eq("id", chapter.id);
    } finally {
      setRefining((prev) => {
        const next = new Set(prev);
        next.delete(chapter.id);
        return next;
      });
    }
  };

  const generateAllPending = async () => {
    setGeneratingAll(true);
    const pending = chapters.filter((c) => c.generation_status === "pending");

    for (const chapter of pending) {
      await generateChapter(chapter);
      // Small delay between requests to avoid rate limiting
      await new Promise((r) => setTimeout(r, 2000));
    }

    setGeneratingAll(false);
    toast({ title: "Course draft complete!", description: `All ${pending.length} chapters generated` });
    window.dispatchEvent(new CustomEvent("course-generated", { detail: { className } }));
  };

  if (loading) {
    return (
      <Card className="p-6 border-border">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  const completedCount = chapters.filter((c) => c.generation_status === "complete").length;
  const pendingCount = chapters.filter((c) => c.generation_status === "pending").length;
  const progressPercent = chapters.length > 0 ? Math.round((completedCount / chapters.length) * 100) : 0;

  return (
    <Card className="p-6 border-border shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <BookOpen className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-foreground">Interactive Chapter Breakdown</h3>
          <p className="text-xs text-muted-foreground">Extra practice, chapter overviews, midterm & final prep — explore any chapter freely</p>
        </div>
        <div className="flex items-center gap-2">
          {chapters.length > 0 && (
            <Badge variant="secondary">{completedCount}/{chapters.length} chapters</Badge>
          )}
          {chapters.length === 0 && (
            <Button size="sm" onClick={scaffoldFromSyllabus} className="gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Generate Course
            </Button>
          )}
        </div>
      </div>

      {chapters.length > 0 && (
        <>
          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>{completedCount} complete</span>
              <span>{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>

          {/* Generate all button */}
          {pendingCount > 0 && (
            <Button
              onClick={generateAllPending}
              disabled={generatingAll}
              className="w-full mb-4 gap-2 bg-[image:var(--gradient-primary)]"
            >
              {generatingAll ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating {pendingCount} chapters...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate All {pendingCount} Pending Chapters
                </>
              )}
            </Button>
          )}

          {/* Chapter list */}
          <Accordion type="multiple" className="space-y-2">
            {chapters.map((chapter) => (
              <AccordionItem key={chapter.id} value={chapter.id} className="border border-border rounded-lg px-4">
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="flex items-center gap-3 w-full pr-2">
                    <span className="text-xs font-mono text-muted-foreground w-6">
                      {chapter.topic_order + 1}.
                    </span>
                    <span className="text-sm font-medium text-foreground flex-1 text-left">
                      {chapter.topic}
                    </span>
                    <div className="flex items-center gap-2">
                      {chapter.bloom_level && (
                        <Badge variant="outline" className="text-[10px]">
                          {chapter.bloom_level}
                        </Badge>
                      )}
                      {chapter.generation_status === "complete" ? (
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                      ) : chapter.generation_status === "generating" || generating.has(chapter.id) ? (
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      ) : (
                        <Clock className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  {chapter.generation_status === "complete" ? (
                    <ChapterContent chapter={chapter} courseName={className} onRegenerate={() => generateChapter(chapter)} isRegenerating={generating.has(chapter.id)} onRefine={(mode) => refineChapter(chapter, mode)} isRefining={refining.has(chapter.id)} />
                  ) : (
                    <div className="text-center py-6">
                      <Brain className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground mb-3">Content not yet generated</p>
                      <Button
                        size="sm"
                        onClick={() => generateChapter(chapter)}
                        disabled={generating.has(chapter.id)}
                        className="gap-1.5"
                      >
                        {generating.has(chapter.id) ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            Generate This Chapter
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </>
      )}

      {chapters.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No course content yet</p>
          <p className="text-xs mt-1">Upload & parse a syllabus first, then generate your interactive course</p>
        </div>
      )}
    </Card>
  );
};

// Sub-component for displaying generated chapter content
function ChapterContent({
  chapter,
  courseName,
  onRegenerate,
  isRegenerating,
  onRefine,
  isRefining,
}: {
  chapter: CourseChapter;
  courseName: string;
  onRegenerate: () => void;
  isRegenerating: boolean;
  onRefine: (mode: string) => void;
  isRefining: boolean;
}) {
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [showExplanations, setShowExplanations] = useState<Set<number>>(new Set());
  const [showHints, setShowHints] = useState<Set<number>>(new Set());
  const [showSolutions, setShowSolutions] = useState<Set<number>>(new Set());
  const [refineMode, setRefineMode] = useState("full");

  return (
    <Tabs defaultValue="lesson" className="w-full">
      <TabsList className="grid w-full grid-cols-6 mb-4">
        <TabsTrigger value="lesson" className="text-xs gap-1">
          <BookOpen className="w-3 h-3" /> Lesson
        </TabsTrigger>
        <TabsTrigger value="quiz" className="text-xs gap-1">
          <FileQuestion className="w-3 h-3" /> Quiz ({chapter.quiz_questions?.length || 0})
        </TabsTrigger>
        <TabsTrigger value="exercises" className="text-xs gap-1">
          <Zap className="w-3 h-3" /> Exercises ({chapter.exercises?.length || 0})
        </TabsTrigger>
        <TabsTrigger value="resources" className="text-xs gap-1">
          <Link2 className="w-3 h-3" /> Resources
        </TabsTrigger>
        <TabsTrigger value="review" className="text-xs gap-1">
          <ClipboardCheck className="w-3 h-3" /> Review
        </TabsTrigger>
        <TabsTrigger value="equity" className="text-xs gap-1">
          <Shield className="w-3 h-3" /> Equity
        </TabsTrigger>
      </TabsList>

      {/* Lesson Content — Clean structured rendering */}
      <TabsContent value="lesson" className="mt-0">
        {chapter.lesson_content ? (
          <LessonRenderer content={chapter.lesson_content} moduleType="lesson" />
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No lesson content available.</p>
        )}

        {/* Embedded resource videos for this chapter */}
        {(chapter.study_resources || []).filter((r: any) =>
          r.type === "video" && r.url && (r.url.includes("youtube.com") || r.url.includes("youtu.be"))
        ).length > 0 && (
          <div className="mt-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary" />
              Related Videos
            </h4>
            {(chapter.study_resources || [])
              .filter((r: any) => r.type === "video" && r.url && (r.url.includes("youtube.com") || r.url.includes("youtu.be")))
              .map((res: any, i: number) => {
                const ytMatch = res.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
                const embedUrl = ytMatch ? `https://www.youtube.com/embed/${ytMatch[1]}` : res.url;
                return (
                  <div key={i} className="rounded-lg overflow-hidden border border-border">
                    <div className="aspect-video">
                      <iframe src={embedUrl} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title={res.title} />
                    </div>
                    <div className="p-2 bg-muted/30">
                      <p className="text-xs font-medium text-foreground">{res.title}</p>
                      {res.description && <p className="text-xs text-muted-foreground">{res.description}</p>}
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={onRegenerate} disabled={isRegenerating || isRefining}>
            {isRegenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Regenerate
          </Button>
          <div className="flex items-center gap-1.5">
            <Select value={refineMode} onValueChange={setRefineMode}>
              <SelectTrigger className="h-7 w-[120px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full Polish</SelectItem>
                <SelectItem value="clarity">Clarity</SelectItem>
                <SelectItem value="concise">Concise</SelectItem>
                <SelectItem value="engaging">Engaging</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10"
              onClick={() => onRefine(refineMode)}
              disabled={isRefining || isRegenerating}
            >
              {isRefining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              Refine
            </Button>
          </div>
        </div>
      </TabsContent>

      {/* Quiz */}
      <TabsContent value="quiz" className="mt-0 space-y-4">
        {(chapter.quiz_questions || []).map((q: any) => (
          <div key={q.id} className="p-4 rounded-lg border border-border">
            <p className="text-sm font-medium text-foreground mb-3">
              <MathText text={`${q.id}. ${q.question}`} />
            </p>
            <div className="space-y-2">
              {q.options?.map((opt: string, oi: number) => {
                const selected = quizAnswers[q.id] === oi;
                const isCorrect = oi === q.correctIndex;
                const answered = quizAnswers[q.id] !== undefined;

                return (
                  <button
                    key={oi}
                    onClick={() => {
                      setQuizAnswers((prev) => ({ ...prev, [q.id]: oi }));
                      setShowExplanations((prev) => new Set(prev).add(q.id));
                    }}
                    className={`w-full text-left p-2.5 rounded-md text-sm transition-all border ${
                      answered
                        ? isCorrect
                          ? "border-primary bg-primary/10 text-foreground"
                          : selected
                          ? "border-destructive bg-destructive/10 text-foreground"
                          : "border-border text-muted-foreground"
                        : "border-border hover:border-primary/50 text-foreground"
                    }`}
                  >
                    <MathText text={`${String.fromCharCode(65 + oi)}. ${opt}`} />
                  </button>
                );
              })}
            </div>
            {showExplanations.has(q.id) && (
              <div className="mt-3 p-3 rounded bg-muted/30 text-xs text-muted-foreground">
                <strong className="text-foreground">Explanation:</strong>{" "}
                <MathText text={q.explanation} />
              </div>
            )}
          </div>
        ))}
      </TabsContent>

      {/* Exercises */}
      <TabsContent value="exercises" className="mt-0 space-y-4">
        {(chapter.exercises || []).map((ex: any) => (
          <div key={ex.id} className="p-4 rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-[10px]">{ex.difficulty}</Badge>
            </div>
            <p className="text-sm font-medium text-foreground mb-3">
              <MathText text={ex.problem} />
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setShowHints((prev) => {
                  const next = new Set(prev);
                  next.has(ex.id) ? next.delete(ex.id) : next.add(ex.id);
                  return next;
                })}
              >
                {showHints.has(ex.id) ? "Hide Hint" : "Show Hint"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setShowSolutions((prev) => {
                  const next = new Set(prev);
                  next.has(ex.id) ? next.delete(ex.id) : next.add(ex.id);
                  return next;
                })}
              >
                {showSolutions.has(ex.id) ? "Hide Solution" : "Show Solution"}
              </Button>
            </div>
            {showHints.has(ex.id) && (
              <div className="mt-2 p-3 rounded bg-amber-500/10 text-xs text-muted-foreground border border-amber-500/20">
                <strong className="text-foreground">Hint:</strong> <MathText text={ex.hint} />
              </div>
            )}
            {showSolutions.has(ex.id) && (
              <div className="mt-2 p-3 rounded bg-primary/5 text-xs text-muted-foreground border border-primary/20">
                <strong className="text-foreground">Solution:</strong> <MathText text={ex.solution} />
              </div>
            )}
          </div>
        ))}
      </TabsContent>

      {/* Resources */}
      <TabsContent value="resources" className="mt-0 space-y-2">
        {(chapter.study_resources || []).map((res: any, i: number) => (
          <a
            key={i}
            href={res.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary/50 transition-colors"
          >
            <Badge variant="outline" className="text-[10px] shrink-0 capitalize">{res.type}</Badge>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{res.title}</p>
              <p className="text-xs text-muted-foreground">{res.source} — {res.description}</p>
            </div>
          </a>
        ))}
      </TabsContent>

      {/* SME Review */}
      <TabsContent value="review" className="mt-0">
        <ContentReview
          contentId={chapter.id}
          lessonContent={chapter.lesson_content}
          topic={chapter.topic}
          className={courseName}
          bloomLevel={chapter.bloom_level}
        />
      </TabsContent>

      {/* Equity Audit */}
      <TabsContent value="equity" className="mt-0">
        <BiasAudit contentId={chapter.id} topic={chapter.topic} />
      </TabsContent>
    </Tabs>
  );
}

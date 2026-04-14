import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Edit2, Check, X, Plus, Calendar as CalendarIcon, Trash2,
  GraduationCap, FileQuestion, Zap, Star, Target, TrendingUp, Loader2, RotateCcw,
  CheckCircle2, BookOpen, ClipboardList
} from "lucide-react";
import { TopicBreakdown } from "@/components/TopicBreakdown";
import { TextbookManager } from "@/components/TextbookManager";

interface CourseEvent {
  id: string;
  syllabus_id: string;
  event_type: string;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
}

interface SyllabusTopic {
  id: string;
  syllabus_id: string;
  title: string;
  description: string | null;
  topic_order: number;
  week_number: number | null;
  module_title: string | null;
  subtopics: string[];
  learning_objectives: string[];
  blooms_taxonomy_level: string | null;
  textbook_chapters: string[];
  start_date: string | null;
  end_date: string | null;
  mastery_percent: number;
}

const eventColorMap: Record<string, string> = {
  quiz: "bg-red-500/10 text-red-600 border-red-500/20",
  exam: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  test: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  homework: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  reading: "bg-green-500/10 text-green-600 border-green-500/20",
  custom: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  other: "bg-muted text-muted-foreground border-border",
};

const eventDotMap: Record<string, string> = {
  quiz: "bg-red-500",
  exam: "bg-purple-500",
  test: "bg-purple-500",
  homework: "bg-blue-500",
  reading: "bg-green-500",
  custom: "bg-orange-500",
  other: "bg-muted-foreground",
};

const CoursePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [courseName, setCourseName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState("");
  const [isReparsing, setIsReparsing] = useState(false);
  const [events, setEvents] = useState<CourseEvent[]>([]);
  const [topics, setTopics] = useState<SyllabusTopic[]>([]);

  // Event form state
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CourseEvent | null>(null);
  const [eventForm, setEventForm] = useState({
    title: "", event_type: "homework", description: "", start_date: "", end_date: "",
  });

  useEffect(() => {
    if (id) fetchCourseData();
  }, [id]);

  const deriveObjectivesFromTitle = (title: string): string[] => {
    const cleaned = title
      .replace(/^(week|wk)\s*\d+\b\s*[:\-]?\s*/i, "")
      .replace(/^(module|unit|chapter)\s*\d+\b\s*[:\-]?\s*/i, "")
      .trim();
    const core = cleaned.length > 2 ? cleaned : title.trim();
    return [
      `Explain the core concepts and key terms related to ${core}.`,
      `Apply what you learned from ${core} to common course problems.`,
    ];
  };

  const fetchCourseData = async () => {
    if (!id) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/auth"); return; }

    const [syllabusRes, topicsRes, eventsRes] = await Promise.all([
      supabase
        .from("syllabi")
        .select("title, topics_extracted")
        .eq("id", id)
        .eq("user_id", session.user.id)
        .single(),
      supabase.from("syllabus_topics").select("*").eq("syllabus_id", id).order("topic_order"),
      supabase.from("course_events").select("*").eq("syllabus_id", id).order("start_date"),
    ]);

    if (syllabusRes.data) setCourseName(syllabusRes.data.title);
    if (topicsRes.data) {
      const mappedTopics: SyllabusTopic[] = topicsRes.data.map(t => ({
        ...t,
        week_number: t.week_number ?? null,
        module_title: t.module_title ?? null,
        subtopics: Array.isArray(t.subtopics) ? (t.subtopics as unknown as string[]) : [],
        learning_objectives: Array.isArray(t.learning_objectives) ? (t.learning_objectives as unknown as string[]) : [],
        textbook_chapters: Array.isArray(t.textbook_chapters) ? (t.textbook_chapters as unknown as string[]) : [],
      }));

      if (mappedTopics.length === 0 && Array.isArray(syllabusRes.data?.topics_extracted)) {
        const extractedTitles = (syllabusRes.data!.topics_extracted as unknown[]).filter((x): x is string => typeof x === "string");
        mappedTopics.push(
          ...extractedTitles.map((title, index) => ({
            id: `${id}-fallback-topic-${index}`,
            syllabus_id: id,
            title,
            description: null,
            topic_order: index + 1,
            week_number: null,
            module_title: null,
            subtopics: [],
            learning_objectives: deriveObjectivesFromTitle(title).slice(0, 2),
            blooms_taxonomy_level: null,
            textbook_chapters: [],
            start_date: null,
            end_date: null,
            mastery_percent: 0,
          })),
        );
      }

      setTopics(mappedTopics);
    }
    if (eventsRes.data) setEvents(eventsRes.data);
  };

  const saveCourseName = async () => {
    if (!id || !tempName.trim()) return;
    const { error } = await supabase.from("syllabi").update({ title: tempName.trim() }).eq("id", id);
    if (!error) { setCourseName(tempName.trim()); setEditingName(false); }
    else toast({ title: "Error", description: "Failed to rename course", variant: "destructive" });
  };

  const openEventForm = (event?: CourseEvent) => {
    if (event) {
      setEditingEvent(event);
      setEventForm({
        title: event.title,
        event_type: event.event_type,
        description: event.description || "",
        start_date: event.start_date || "",
        end_date: event.end_date || "",
      });
    } else {
      setEditingEvent(null);
      setEventForm({ title: "", event_type: "homework", description: "", start_date: "", end_date: "" });
    }
    setEventDialogOpen(true);
  };

  const saveEvent = async () => {
    if (!id || !eventForm.title.trim()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const payload = {
      syllabus_id: id,
      user_id: session.user.id,
      title: eventForm.title.trim(),
      event_type: eventForm.event_type,
      description: eventForm.description.trim() || null,
      start_date: eventForm.start_date || null,
      end_date: eventForm.end_date || null,
    };

    if (editingEvent) {
      const { error } = await supabase.from("course_events").update(payload).eq("id", editingEvent.id);
      if (error) toast({ title: "Error", description: "Failed to update event", variant: "destructive" });
    } else {
      const { error } = await supabase.from("course_events").insert([payload]);
      if (error) toast({ title: "Error", description: "Failed to add event", variant: "destructive" });
    }
    setEventDialogOpen(false);
    fetchCourseData();
  };

  const deleteEvent = async (eventId: string) => {
    const { error } = await supabase.from("course_events").delete().eq("id", eventId);
    if (!error) fetchCourseData();
    else toast({ title: "Error", description: "Failed to delete event", variant: "destructive" });
  };

  const reparseCourse = async () => {
    if (!id || isReparsing) return;
    setIsReparsing(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-syllabus", {
        body: { syllabusId: id },
      });

      if (error) throw error;
      if (data && typeof data === "object" && "success" in data && (data as { success?: boolean }).success === false) {
        throw new Error((data as { error?: string }).error || "Unknown parser error");
      }

      if (data && typeof data === "object" && "warning" in data) {
        const parsed = data as {
          warning?: string;
          fallback_layout_type?: string;
          inserted_topic_count?: number;
          fallback_debug_summary?: string;
          fallback_preview?: Array<{ title: string; week_number: number | null; module_title: string | null }>;
        };
        const preview = parsed.fallback_preview?.slice(0, 3) ?? [];
        const previewText = preview
          .map((t) => {
            const week = typeof t.week_number === "number" ? `Week ${t.week_number}` : "";
            const mod = t.module_title ? t.module_title : "";
            const prefix = [week, mod].filter(Boolean).join(" · ");
            return prefix ? `${prefix}: ${t.title}` : t.title;
          })
          .join("; ");
        toast({
          title: "Parsed with fallback",
          description: `${parsed.warning || "Used fallback parser."}${
            parsed.fallback_layout_type ? ` (layout: ${parsed.fallback_layout_type})` : ""
          }${typeof parsed.inserted_topic_count === "number" ? ` — Inserted topics: ${parsed.inserted_topic_count}` : ""}${
            parsed.fallback_debug_summary ? ` — Debug: ${parsed.fallback_debug_summary}` : ""
          }${
            previewText ? ` — Preview: ${previewText}` : ""
          }`,
        });
      } else {
        toast({
          title: "Re-parse complete",
          description: "Course topics and structure were refreshed.",
        });
      }

      await fetchCourseData();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Re-parse failed",
        description: errMsg,
        variant: "destructive",
      });
    } finally {
      setIsReparsing(false);
    }
  };

  const overallMastery = topics.length > 0 ? Math.round(topics.reduce((sum, t) => sum + t.mastery_percent, 0) / topics.length) : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} title="Back to Course Hub">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          {editingName ? (
            <div className="flex items-center gap-2 flex-1">
              <Input value={tempName} onChange={e => setTempName(e.target.value)} className="max-w-sm font-bold text-lg h-9" autoFocus />
              <Button size="icon" variant="ghost" onClick={saveCourseName}><Check className="w-4 h-4 text-primary" /></Button>
              <Button size="icon" variant="ghost" onClick={() => setEditingName(false)}><X className="w-4 h-4 text-muted-foreground" /></Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-1">
              <h1 className="text-xl font-bold text-foreground truncate">{courseName}</h1>
              <Button size="icon" variant="ghost" onClick={() => { setTempName(courseName); setEditingName(true); }}>
                <Edit2 className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={reparseCourse} disabled={isReparsing || !id}>
            {isReparsing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Re-parsing...
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4 mr-2" />
                Re-parse Syllabus
              </>
            )}
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-10">
        {/* ───────── CALENDAR ───────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-secondary" />
              <h2 className="text-xl font-bold text-foreground">Course Calendar</h2>
            </div>
            <Button size="sm" onClick={() => openEventForm()}>
              <Plus className="w-4 h-4 mr-1" /> Add Event
            </Button>
          </div>

          {/* Color legend */}
          <div className="flex flex-wrap gap-3 mb-4">
            {[["Quiz", "quiz"], ["Exam", "exam"], ["Homework", "homework"], ["Custom", "custom"]].map(([label, type]) => (
              <div key={type} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`w-2.5 h-2.5 rounded-full ${eventDotMap[type]}`} />
                {label}
              </div>
            ))}
          </div>

          {events.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground border-dashed">
              <CalendarIcon className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No calendar events yet</p>
              <p className="text-sm mt-1">Add events manually or re-upload your syllabus.</p>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {events.map(event => (
                <Card key={event.id} className="p-4 flex gap-3 group hover:shadow-md transition-shadow">
                  <div className="flex flex-col items-center justify-center min-w-14 p-2 bg-muted/50 rounded-lg">
                    {event.start_date ? (
                      <>
                        <span className="text-[10px] font-bold uppercase text-secondary">
                          {new Date(event.start_date).toLocaleString("default", { month: "short" })}
                        </span>
                        <span className="text-xl font-bold leading-none text-foreground">
                          {new Date(event.start_date).getDate()}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">TBD</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${eventColorMap[event.event_type] || eventColorMap.other}`}>
                      {event.event_type}
                    </Badge>
                    <h4 className="text-sm font-semibold text-foreground truncate">{event.title}</h4>
                    {event.description && <p className="text-xs text-muted-foreground line-clamp-1">{event.description}</p>}
                  </div>
                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEventForm(event)}>
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteEvent(event.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Event Add/Edit Dialog */}
          <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{editingEvent ? "Edit Event" : "Add Event"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1">
                  <Label>Title <span className="text-destructive">*</span></Label>
                  <Input value={eventForm.title} onChange={e => setEventForm({...eventForm, title: e.target.value})} placeholder="Midterm Exam" />
                </div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select value={eventForm.event_type} onValueChange={v => setEventForm({...eventForm, event_type: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="quiz">Quiz</SelectItem>
                      <SelectItem value="exam">Exam</SelectItem>
                      <SelectItem value="homework">Homework</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Start Date</Label>
                    <Input type="date" value={eventForm.start_date} onChange={e => setEventForm({...eventForm, start_date: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <Label>End Date</Label>
                    <Input type="date" value={eventForm.end_date} onChange={e => setEventForm({...eventForm, end_date: e.target.value})} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Input value={eventForm.description} onChange={e => setEventForm({...eventForm, description: e.target.value})} placeholder="Optional notes..." />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setEventDialogOpen(false)}>Cancel</Button>
                <Button onClick={saveEvent} disabled={!eventForm.title.trim()}>{editingEvent ? "Save Changes" : "Add Event"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </section>

        {/* ───────── ADAPTIVE LEARNING ───────── */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <GraduationCap className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold text-foreground">Adaptive Learning</h2>
          </div>

          {/* Progress Bars */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
            {[
              { label: "Placement Quizzes", value: 0, color: "bg-secondary" },
              { label: "Personalized Practice", value: 0, color: "bg-primary" },
              { label: "Explanations", value: 0, color: "bg-accent" },
              { label: "Progress Tracking", value: overallMastery, color: "bg-primary" },
            ].map(m => (
              <div key={m.label} className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">{m.label}</span>
                  <span className="text-sm text-muted-foreground">{m.value}%</span>
                </div>
                <Progress value={m.value} className="h-2" />
              </div>
            ))}
          </div>

          {/* Feature Cards — no "Hints" */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
            <Card className="p-4 bg-gradient-to-br from-primary/5 to-secondary/5 border-border">
              <div className="flex items-center gap-2 mb-2"><FileQuestion className="w-5 h-5 text-primary" /><h4 className="font-medium text-sm">Mini-Quizzes</h4></div>
              <p className="text-2xl font-bold">0</p><p className="text-xs text-muted-foreground">Available</p>
              <Button variant="outline" size="sm" className="w-full mt-3">Start Quiz</Button>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-secondary/5 to-accent/5 border-border">
              <div className="flex items-center gap-2 mb-2"><Zap className="w-5 h-5 text-secondary" /><h4 className="font-medium text-sm">Interactive Exercises</h4></div>
              <p className="text-2xl font-bold">0</p><p className="text-xs text-muted-foreground">New exercises</p>
              <Button variant="outline" size="sm" className="w-full mt-3">Practice Now</Button>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-primary/5 to-accent/5 border-border">
              <div className="flex items-center gap-2 mb-2"><Star className="w-5 h-5 text-primary" /><h4 className="font-medium text-sm">Confidence Rating</h4></div>
              <div className="flex items-center gap-1 my-1">
                {[1,2,3,4,5].map(s => <Star key={s} className={`w-4 h-4 ${s <= 0 ? "fill-primary text-primary" : "text-muted-foreground"}`} />)}
              </div>
              <p className="text-xs text-muted-foreground">Not yet rated</p>
              <Button variant="outline" size="sm" className="w-full mt-3">Rate Topics</Button>
            </Card>
          </div>
        </section>

        {/* ───────── CHAPTER BREAKDOWNS ───────── */}
        <section className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold text-foreground">Chapter Breakdowns</h2>
            </div>
            {topics.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground border-dashed">
                <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium">No chapter breakdowns available.</p>
                <p className="text-sm mt-1">Upload or reprocess syllabus.</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {topics.map((topic, i) => (
                  <Card key={topic.id} className="p-4 border-border">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">{i + 1}</div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex justify-between items-start gap-2">
                          <h4 className="font-semibold text-foreground">{topic.title}</h4>
                          <div className="flex items-center gap-1 shrink-0">
                            {topic.week_number && (
                              <Badge variant="outline" className="text-[10px]">Week {topic.week_number}</Badge>
                            )}
                            {topic.module_title && (
                              <Badge variant="outline" className="text-[10px]">{topic.module_title}</Badge>
                            )}
                            {topic.blooms_taxonomy_level && (
                              <Badge variant="outline" className="text-[10px] bg-accent/5 text-accent border-accent/20">
                                {topic.blooms_taxonomy_level}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {topic.description && <p className="text-xs text-muted-foreground">{topic.description}</p>}
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Mastery</span>
                          <span className="font-medium">{topic.mastery_percent}%</span>
                        </div>
                        <Progress value={topic.mastery_percent} className="h-1.5" />
                        {topic.learning_objectives.length > 0 && (
                          <div className="pt-2 border-t border-border mt-2">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Learning Objectives</p>
                            <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-3">
                              {topic.learning_objectives.map((lo, j) => <li key={j}>{lo}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Learning Objectives Summary + Textbooks */}
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-bold text-foreground">Learning Objectives</h3>
              </div>
              {topics.length === 0 ? (
                <p className="text-sm text-muted-foreground">No learning objectives yet.</p>
              ) : (
                <div className="space-y-2">
                  {topics.filter(t => t.learning_objectives.length > 0).slice(0, 5).map(t => (
                    <div key={t.id} className="flex items-start gap-2 p-2 rounded-lg bg-muted/50">
                      <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                        <p className="text-xs text-muted-foreground">{t.learning_objectives.length} objective{t.learning_objectives.length > 1 ? "s" : ""}</p>
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">{t.mastery_percent}%</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {id && <TextbookManager syllabusId={id} />}
          </div>
        </section>

        {/* ───────── WEEKLY PERFORMANCE ───────── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold text-foreground">Weekly Performance Report</h2>
          </div>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Study Time", value: "0 hrs", delta: "-" },
              { label: "Quiz Average", value: "-", delta: "-" },
              { label: "Exercises Done", value: "0", delta: "-" },
              { label: "Mastery", value: `${overallMastery}%`, delta: "-" },
            ].map(m => (
              <Card key={m.label} className="p-4 bg-gradient-to-br from-primary/5 to-secondary/5 border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-foreground">{m.label}</span>
                  <Badge variant="secondary" className="text-xs">{m.delta}</Badge>
                </div>
                <p className="text-xl font-bold text-foreground">{m.value}</p>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default CoursePage;

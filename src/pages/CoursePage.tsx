import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  ArrowLeft, BookOpen, Calendar as CalendarIcon, Target, FileQuestion,
  Zap, BookMarked, TrendingUp, Plus, Trash2, Edit2, CheckCircle2,
  AlertTriangle, Loader2, GraduationCap
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStudyPlan, QuizResult } from "@/hooks/useStudyPlan";
import { PlacementQuiz } from "@/components/PlacementQuiz";
import { StudyPlan } from "@/components/StudyPlan";
import { StructuredStudyPlan } from "@/components/StructuredStudyPlan";
import { MiniQuiz } from "@/components/MiniQuiz";
import { InteractiveExercise } from "@/components/InteractiveExercise";
import { PracticeHistory } from "@/components/PracticeHistory";
import { AssignmentUpload } from "@/components/AssignmentUpload";
import { ChapterBreakdowns } from "@/components/ChapterBreakdowns";
import { CourseTextbooks } from "@/components/CourseTextbooks";
import { BloomTaxonomy } from "@/components/BloomTaxonomy";
import { GeneratedCourse } from "@/components/GeneratedCourse";
import { KnowledgeGapAlerts } from "@/components/KnowledgeGapAlerts";
import { PersonalizedPractice } from "@/components/PersonalizedPractice";
import { TopicChecklist } from "@/components/TopicChecklist";
import { useCourseMastery } from "@/hooks/useCourseMastery";
import { WeeklyPerformanceReport } from "@/components/WeeklyPerformanceReport";
import { ConfidenceRating } from "@/components/ConfidenceRating";
import { format, differenceInDays, isPast, isToday } from "date-fns";
import { cn } from "@/lib/utils";

interface CalendarEvent {
  id: string;
  title: string;
  event_date: string;
  event_type: string;
  description: string | null;
  start_time: string | null;
}

const eventTypeColors: Record<string, string> = {
  quiz: "bg-primary/10 text-primary border-primary/20",
  test: "bg-destructive/10 text-destructive border-destructive/20",
  midterm: "bg-destructive/10 text-destructive border-destructive/20",
  final: "bg-destructive/10 text-destructive border-destructive/20",
  homework: "bg-secondary/10 text-secondary border-secondary/20",
  assignment: "bg-secondary/10 text-secondary border-secondary/20",
  project: "bg-accent/10 text-accent border-accent/20",
  other: "bg-muted text-muted-foreground border-border",
};

const CoursePage = () => {
  const { className } = useParams<{ className: string }>();
  const decodedClassName = decodeURIComponent(className || "");
  const navigate = useNavigate();
  const { toast } = useToast();

  const [learningStyles, setLearningStyles] = useState<string[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [showMiniQuiz, setShowMiniQuiz] = useState(false);
  const [showExercises, setShowExercises] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  // Add event dialog state
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventType, setNewEventType] = useState("other");
  const [newEventDate, setNewEventDate] = useState<Date | undefined>(undefined);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  const studyPlan = useStudyPlan(learningStyles);
  const {
    quizResult, objectives, resources, completedObjectives,
    completionPercentage, isLoading, setQuizResultAndGenerate,
    toggleObjective, clearStudyPlan, generateStudyPlan,
    completedClasses, activeClass, setActiveClass, classPlans,
  } = studyPlan;

  // Set active class to this course
  useEffect(() => {
    if (decodedClassName) {
      setActiveClass(decodedClassName);
    }
  }, [decodedClassName, setActiveClass]);

  // Load learning styles
  useEffect(() => {
    const loadProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      const { data } = await supabase
        .from("profiles_safe" as any)
        .select("learning_styles")
        .eq("id", session.user.id)
        .single() as { data: { learning_styles: string[] | null } | null };
      if (data?.learning_styles) setLearningStyles(data.learning_styles);
    };
    loadProfile();
  }, [navigate]);

  // Load calendar events for this course
  useEffect(() => {
    fetchEvents();
  }, [decodedClassName]);

  const fetchEvents = async () => {
    setLoadingEvents(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", session.user.id)
      .ilike("description", `%${decodedClassName}%`)
      .order("event_date", { ascending: true });

    // Also fetch events with the class name in the title
    const { data: data2 } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", session.user.id)
      .ilike("title", `%${decodedClassName}%`)
      .order("event_date", { ascending: true });

    const combined = new Map<string, CalendarEvent>();
    [...(data || []), ...(data2 || [])].forEach((e) => combined.set(e.id, e));
    setEvents(Array.from(combined.values()));
    setLoadingEvents(false);
  };

  const handleAddEvent = async () => {
    if (!newEventTitle.trim() || !newEventDate) {
      toast({ title: "Missing info", description: "Please enter a title and date", variant: "destructive" });
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    if (editingEvent) {
      const { error } = await supabase
        .from("calendar_events")
        .update({
          title: newEventTitle.trim(),
          event_type: newEventType,
          event_date: format(newEventDate, "yyyy-MM-dd"),
        })
        .eq("id", editingEvent.id);
      if (error) {
        toast({ title: "Error", description: "Failed to update event", variant: "destructive" });
        return;
      }
    } else {
      const { error } = await supabase.from("calendar_events").insert({
        user_id: session.user.id,
        title: newEventTitle.trim(),
        event_type: newEventType,
        event_date: format(newEventDate, "yyyy-MM-dd"),
        description: decodedClassName,
      });
      if (error) {
        toast({ title: "Error", description: "Failed to add event", variant: "destructive" });
        return;
      }
    }

    toast({ title: editingEvent ? "Event updated" : "Event added", description: newEventTitle });
    setAddEventOpen(false);
    setNewEventTitle("");
    setNewEventType("other");
    setNewEventDate(undefined);
    setEditingEvent(null);
    fetchEvents();
  };

  const handleDeleteEvent = async (eventId: string) => {
    const { error } = await supabase.from("calendar_events").delete().eq("id", eventId);
    if (error) {
      toast({ title: "Error", description: "Failed to delete event", variant: "destructive" });
      return;
    }
    toast({ title: "Event deleted" });
    fetchEvents();
  };

  const startEdit = (event: CalendarEvent) => {
    setEditingEvent(event);
    setNewEventTitle(event.title);
    setNewEventType(event.event_type || "other");
    setNewEventDate(new Date(event.event_date + "T00:00:00"));
    setAddEventOpen(true);
  };

  const getUrgencyColor = (dateStr: string) => {
    const days = differenceInDays(new Date(dateStr + "T00:00:00"), new Date());
    if (days < 0) return "text-muted-foreground";
    if (days <= 2) return "text-destructive";
    if (days <= 7) return "text-orange-500";
    if (days <= 14) return "text-yellow-500";
    return "text-green-500";
  };

  const eventDates = events.map((e) => new Date(e.event_date + "T00:00:00"));

  const thisClassPlan = classPlans.get(decodedClassName);
  const hasQuiz = !!thisClassPlan;
  const classQuizResult = thisClassPlan?.quizResult || null;

  const mastery = useCourseMastery(decodedClassName);

  // Ref for scrolling to adaptive learning section
  const studyPlanRef = useState<HTMLDivElement | null>(null);

  const handleNavigateToTopic = (focusAreaId: string) => {
    // Scroll to the structured study plan
    const el = document.getElementById("adaptive-learning-section");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <GraduationCap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">{decodedClassName}</h1>
                <p className="text-sm text-muted-foreground">Course Dashboard</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Progress Overview */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4 border-border">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Topic Mastery</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {mastery.loading ? "—" : `${mastery.topicMastery}%`}
            </p>
            <Progress value={mastery.topicMastery} className="h-1.5 mt-2" />
            <p className="text-xs text-muted-foreground mt-1">focus areas passed</p>
          </Card>
          <Card className="p-4 border-border">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-secondary" />
              <span className="text-sm font-medium text-foreground">Practice Avg</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {mastery.loading ? "—" : `${mastery.practiceScore}%`}
            </p>
            <Progress value={mastery.practiceScore} className="h-1.5 mt-2" />
            <p className="text-xs text-muted-foreground mt-1">quiz & exercise avg</p>
          </Card>
          <Card className="p-4 border-border">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-foreground">Modules</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {mastery.loading ? "—" : `${mastery.moduleProgress}%`}
            </p>
            <Progress value={mastery.moduleProgress} className="h-1.5 mt-2" />
            <p className="text-xs text-muted-foreground mt-1">lessons & practice done</p>
          </Card>
          <Card className="p-4 border-border">
            <div className="flex items-center gap-2 mb-2">
              <CalendarIcon className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Upcoming</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {events.filter((e) => !isPast(new Date(e.event_date + "T23:59:59"))).length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">events remaining</p>
          </Card>
        </div>

        {/* Course Calendar */}
        <Card className="p-6 border-border shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <CalendarIcon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Course Calendar</h3>
            </div>
            <Dialog open={addEventOpen} onOpenChange={(open) => {
              setAddEventOpen(open);
              if (!open) { setEditingEvent(null); setNewEventTitle(""); setNewEventType("other"); setNewEventDate(undefined); }
            }}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Date
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingEvent ? "Edit Event" : "Add Course Date"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input
                      placeholder="e.g., Midterm Exam"
                      value={newEventTitle}
                      onChange={(e) => setNewEventTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={newEventType} onValueChange={setNewEventType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quiz">Quiz</SelectItem>
                        <SelectItem value="test">Test</SelectItem>
                        <SelectItem value="midterm">Midterm</SelectItem>
                        <SelectItem value="final">Final</SelectItem>
                        <SelectItem value="homework">Homework</SelectItem>
                        <SelectItem value="assignment">Assignment</SelectItem>
                        <SelectItem value="project">Project</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !newEventDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {newEventDate ? format(newEventDate, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={newEventDate}
                          onSelect={setNewEventDate}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Button className="w-full" onClick={handleAddEvent}>
                    {editingEvent ? "Update Event" : "Add Event"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Calendar View */}
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                className="rounded-md border p-3 pointer-events-auto"
                modifiers={{ event: eventDates }}
                modifiersClassNames={{
                  event: "bg-primary/20 font-bold text-primary",
                }}
              />
            </div>

            {/* Events List */}
            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2">
              {loadingEvents ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : events.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CalendarIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No events yet for this course</p>
                  <p className="text-xs">Add quizzes, tests, and due dates above</p>
                </div>
              ) : (
                events.map((event) => {
                  const urgency = getUrgencyColor(event.event_date);
                  const typeClass = eventTypeColors[event.event_type || "other"] || eventTypeColors.other;
                  return (
                    <div key={event.id} className={`flex items-center justify-between p-3 rounded-lg border ${typeClass}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={urgency}>
                          {differenceInDays(new Date(event.event_date + "T00:00:00"), new Date()) <= 2 && !isPast(new Date(event.event_date + "T23:59:59")) ? (
                            <AlertTriangle className="w-4 h-4" />
                          ) : (
                            <CalendarIcon className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{event.title}</p>
                          <p className="text-xs opacity-70">{format(new Date(event.event_date + "T00:00:00"), "MMM d, yyyy")}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Badge variant="outline" className="text-xs capitalize">{event.event_type || "other"}</Badge>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(event)}>
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteEvent(event.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </Card>

        {/* Assignment Upload */}
        <AssignmentUpload learningStyles={learningStyles} courseName={decodedClassName} />

        {/* Knowledge Gap Alerts */}
        <KnowledgeGapAlerts
          className={decodedClassName}
          onNavigateToTopic={handleNavigateToTopic}
        />

        {/* Structured Study Plan */}
        <div id="adaptive-learning-section">
          <StructuredStudyPlan
            className={decodedClassName}
            learningStyles={learningStyles}
          />
        </div>

        {/* Personalized Practice */}
        <PersonalizedPractice className={decodedClassName} learningStyles={learningStyles} />

        {/* Topic Checklist */}
        <TopicChecklist className={decodedClassName} />

        {/* Confidence Self-Rating */}
        <ConfidenceRating className={decodedClassName} />

        {/* Weekly Performance Report */}
        <WeeklyPerformanceReport className={decodedClassName} />

        {/* Bloom's Taxonomy Analysis */}
        <BloomTaxonomy className={decodedClassName} />

        {/* Interactive Course Draft */}
        <GeneratedCourse className={decodedClassName} />

        {/* Chapter Breakdowns - Real data from syllabus */}
        <ChapterBreakdowns className={decodedClassName} />

        {/* Course Textbooks */}
        <CourseTextbooks className={decodedClassName} />

        {/* Placement Quiz */}
        <PlacementQuiz
          learningStyles={learningStyles}
          onQuizComplete={setQuizResultAndGenerate}
          completedClasses={completedClasses}
          className={decodedClassName}
        />

        {/* Study Resources */}
        <StudyPlan
          quizResult={activeClass === decodedClassName ? quizResult : classQuizResult}
          objectives={activeClass === decodedClassName ? objectives : thisClassPlan?.objectives || []}
          resources={activeClass === decodedClassName ? resources : thisClassPlan?.resources || []}
          completedObjectives={activeClass === decodedClassName ? completedObjectives : thisClassPlan?.completedObjectives || new Set()}
          completionPercentage={completionPercentage}
          isLoading={isLoading}
          learningStyles={learningStyles}
          onToggleObjective={toggleObjective}
          onClear={clearStudyPlan}
          onRefresh={() => classQuizResult && generateStudyPlan(classQuizResult)}
          completedClasses={[decodedClassName]}
          activeClass={decodedClassName}
          onClassChange={() => {}}
        />

        {/* Practice History */}
        <PracticeHistory className={decodedClassName} />
      </main>

      {/* Mini Quiz Modal */}
      {classQuizResult && (
        <MiniQuiz
          isOpen={showMiniQuiz}
          onClose={() => setShowMiniQuiz(false)}
          className={decodedClassName}
          weakAreas={classQuizResult.weakAreas}
          learningStyles={learningStyles}
        />
      )}

      {/* Interactive Exercises Modal */}
      {classQuizResult && (
        <InteractiveExercise
          isOpen={showExercises}
          onClose={() => setShowExercises(false)}
          className={decodedClassName}
          weakAreas={classQuizResult.weakAreas}
          learningStyles={learningStyles}
        />
      )}
    </div>
  );
};

export default CoursePage;

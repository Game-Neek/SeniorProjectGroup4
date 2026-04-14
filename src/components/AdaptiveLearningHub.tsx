import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  GraduationCap, FileQuestion, Lightbulb, ClipboardList,
  Bell, AlertTriangle, Target, TrendingUp, CheckCircle2,
  Clock, Star, Zap, BookOpen, Calendar as CalendarIcon
} from "lucide-react";
import { TopicBreakdown } from "./TopicBreakdown";
import { TextbookManager } from "./TextbookManager";
// We'll replace default calendar with a custom event calendar if needed, or use a basic date display

interface SyllabusData {
  id: string;
  title: string;
  processed: boolean;
}

interface CourseEvent {
  id: string;
  syllabus_id: string;
  event_type: string;
  title: string;
  description: string | null;
  start_date: string | null;
}

interface SyllabusTopic {
  id: string;
  syllabus_id: string;
  title: string;
  description: string | null;
  topic_order: number;
  subtopics: string[];
  learning_objectives: string[];
  blooms_taxonomy_level: string | null;
  textbook_chapters: string[];
  start_date: string | null;
  end_date: string | null;
  mastery_percent: number;
}

export const AdaptiveLearningHub = () => {
  const [courses, setCourses] = useState<SyllabusData[]>([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [events, setEvents] = useState<Record<string, CourseEvent[]>>({});
  const [topics, setTopics] = useState<Record<string, SyllabusTopic[]>>({});

  useEffect(() => {
    fetchSyllabi();
  }, []);

  const fetchSyllabi = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: syllabi } = await supabase
      .from("syllabi")
      .select("id, title, processed")
      .eq("user_id", session.user.id)
      .eq("processed", true)
      .order("uploaded_at", { ascending: false });

    if (syllabi) {
      setCourses(syllabi);
      
      // Fetch topics and events for all processed syllabi
      if (syllabi.length > 0) {
        const syllabusIds = syllabi.map(s => s.id);
        
        const [topicsResp, eventsResp] = await Promise.all([
          supabase.from("syllabus_topics").select("*").in("syllabus_id", syllabusIds).order("topic_order"),
          supabase.from("course_events").select("*").in("syllabus_id", syllabusIds).order("start_date")
        ]);

        if (topicsResp.data) {
          const topicsByCourse: Record<string, SyllabusTopic[]> = {};
          topicsResp.data.forEach(t => {
            if (!topicsByCourse[t.syllabus_id]) topicsByCourse[t.syllabus_id] = [];
            topicsByCourse[t.syllabus_id].push({
              ...t,
              subtopics: Array.isArray(t.subtopics) ? (t.subtopics as unknown as string[]) : [],
              learning_objectives: Array.isArray(t.learning_objectives) ? (t.learning_objectives as unknown as string[]) : [],
              textbook_chapters: Array.isArray(t.textbook_chapters) ? (t.textbook_chapters as unknown as string[]) : [],
            });
          });
          setTopics(topicsByCourse);
        }

        if (eventsResp.data) {
          const eventsByCourse: Record<string, CourseEvent[]> = {};
          eventsResp.data.forEach(e => {
            if (!eventsByCourse[e.syllabus_id]) eventsByCourse[e.syllabus_id] = [];
            eventsByCourse[e.syllabus_id].push(e);
          });
          setEvents(eventsByCourse);
        }
      }
    }
  };

  return (
    <Card className="p-6 shadow-[var(--shadow-soft)] border-border hover:shadow-[var(--shadow-medium)] transition-[var(--transition-smooth)] md:col-span-2 lg:col-span-3">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10">
          <GraduationCap className="w-6 h-6 text-primary" />
        </div>
        <h3 className="text-xl font-bold text-foreground">Adaptive Learning</h3>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6 flex-wrap h-auto p-1 bg-muted/50 rounded-xl justify-start">
          <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Overview
          </TabsTrigger>
          {courses.map(course => (
            <TabsTrigger 
              key={course.id} 
              value={course.id}
              className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm truncate max-w-[200px]"
              title={course.title}
            >
              <BookOpen className="w-4 h-4 mr-2 hidden sm:inline-block" />
              {course.title}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-8 animate-in fade-in-50 duration-500">
          {/* Overview Tab Content (Original Dashboard Adaptive Learning Content) */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">Placement Quizzes</span>
                  <span className="text-sm text-muted-foreground">75%</span>
                </div>
                <Progress value={75} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">Personalized Practice</span>
                  <span className="text-sm text-muted-foreground">60%</span>
                </div>
                <Progress value={60} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">Explanations</span>
                  <span className="text-sm text-muted-foreground">85%</span>
                </div>
                <Progress value={85} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">Progress Tracking</span>
                  <span className="text-sm text-muted-foreground">92%</span>
                </div>
                <Progress value={92} className="h-2" />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8 pt-6 border-t border-border">
              <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 to-secondary/5 border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <FileQuestion className="w-5 h-5 text-primary" />
                  <h4 className="font-medium text-foreground text-sm">Mini-Quizzes</h4>
                </div>
                <p className="text-2xl font-bold text-foreground mb-1">3</p>
                <p className="text-xs text-muted-foreground">Available today</p>
                <Button variant="outline" size="sm" className="w-full mt-3">Start Quiz</Button>
              </div>

              <div className="p-4 rounded-xl bg-gradient-to-br from-secondary/5 to-accent/5 border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-5 h-5 text-secondary" />
                  <h4 className="font-medium text-foreground text-sm">Interactive Exercises</h4>
                </div>
                <p className="text-2xl font-bold text-foreground mb-1">12</p>
                <p className="text-xs text-muted-foreground">New exercises</p>
                <Button variant="outline" size="sm" className="w-full mt-3">Practice Now</Button>
              </div>

              <div className="p-4 rounded-xl bg-gradient-to-br from-accent/5 to-primary/5 border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="w-5 h-5 text-accent" />
                  <h4 className="font-medium text-foreground text-sm">Hints</h4>
                </div>
                <p className="text-2xl font-bold text-foreground mb-1">∞</p>
                <p className="text-xs text-muted-foreground">Unlimited hints</p>
                <Button variant="outline" size="sm" className="w-full mt-3">View Tips</Button>
              </div>

              <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 to-accent/5 border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <Star className="w-5 h-5 text-primary" />
                  <h4 className="font-medium text-foreground text-sm">Confidence Rating</h4>
                </div>
                <div className="flex items-center gap-1 mb-1">
                  {[1, 2, 3, 4].map((star) => (
                    <Star key={star} className="w-5 h-5 fill-primary text-primary" />
                  ))}
                  <Star className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">4/5 overall confidence</p>
                <Button variant="outline" size="sm" className="w-full mt-3">Rate Topics</Button>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3 mb-8 pt-6 border-t border-border">
              <TopicBreakdown />
              
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-secondary" />
                  <h4 className="font-semibold text-foreground">Reminders</h4>
                </div>
                <div className="space-y-2">
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20">
                    <Clock className="w-4 h-4 text-destructive mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Quiz due in 2 hours</p>
                      <p className="text-xs text-muted-foreground">Calculus Chapter 5</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/50">
                    <Clock className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Review session tomorrow</p>
                      <p className="text-xs text-muted-foreground">Physics Lab at 3 PM</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="grid gap-6 md:grid-cols-2 pt-6 border-t border-border">
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-5 h-5 text-primary" />
                  <h4 className="font-semibold text-foreground">Learning Objectives</h4>
                </div>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Master Fundamentals</p>
                      <p className="text-xs text-muted-foreground mt-1">Complete by end of week</p>
                    </div>
                    <Badge className="bg-primary/10 text-primary border-0">3/5</Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <h4 className="font-semibold text-foreground">Weekly Performance Report</h4>
                </div>
                <div className="grid gap-3 grid-cols-2">
                  <div className="p-4 rounded-lg bg-gradient-to-br from-primary/5 to-secondary/5 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-foreground">Study Time</span>
                      <Badge variant="secondary" className="text-xs">+15%</Badge>
                    </div>
                    <p className="text-xl font-bold text-foreground">12.5 hrs</p>
                  </div>
                  <div className="p-4 rounded-lg bg-gradient-to-br from-secondary/5 to-accent/5 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-foreground">Quiz Avg</span>
                      <Badge variant="secondary" className="text-xs">+8%</Badge>
                    </div>
                    <p className="text-xl font-bold text-foreground">87%</p>
                  </div>
                </div>
              </div>
            </div>
        </TabsContent>

        {courses.map(course => (
          <TabsContent key={course.id} value={course.id} className="space-y-8 animate-in fade-in-50 duration-500">
            {/* Course-specific Tab */}
            <div className="grid gap-8 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center gap-2 border-b border-border pb-2">
                  <ClipboardList className="w-5 h-5 text-primary" />
                  <h4 className="text-lg font-semibold text-foreground">Study Plan Breakdown</h4>
                </div>
                
                {(!topics[course.id] || topics[course.id].length === 0) ? (
                  <div className="text-center p-8 bg-muted/30 rounded-xl border border-dashed border-border text-muted-foreground">
                    <p>No study plan details found for this course.</p>
                  </div>
                ) : (
                  <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                    {topics[course.id].map((topic, index) => (
                      <div key={topic.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-primary/20 text-primary font-bold shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 mx-auto">
                          {index + 1}
                        </div>
                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-[var(--radius-lg)] border border-border bg-card shadow-[var(--shadow-soft)] group-hover:shadow-[var(--shadow-medium)] transition-[var(--transition-smooth)] flex flex-col items-start gap-2">
                          <div className="flex justify-between items-start w-full gap-2">
                            <h5 className="font-semibold text-foreground leading-tight text-left">{topic.title}</h5>
                            {(topic.start_date || topic.end_date) && (
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                {topic.end_date ? new Date(topic.end_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric'}) : "Upcoming"}
                              </Badge>
                            )}
                          </div>
                          
                          {topic.description && (
                            <p className="text-xs text-muted-foreground text-left line-clamp-2">{topic.description}</p>
                          )}
                          
                          <div className="w-full mt-2 space-y-2">
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-muted-foreground">Mastery</span>
                              <span className="font-medium">{topic.mastery_percent}%</span>
                            </div>
                            <Progress value={topic.mastery_percent} className="h-1.5" />
                          </div>

                          {topic.textbook_chapters && topic.textbook_chapters.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {topic.textbook_chapters.map((ch, i) => (
                                <Badge key={i} variant="secondary" className="text-[10px] bg-secondary/10 text-secondary border-0">{ch}</Badge>
                              ))}
                            </div>
                          )}

                          {topic.blooms_taxonomy_level && (
                            <Badge variant="outline" className="mt-1 text-[10px] bg-accent/5 text-accent border-accent/20">
                              {topic.blooms_taxonomy_level} Level
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <TextbookManager syllabusId={course.id} />
                <div className="flex items-center gap-2 border-b border-border pb-2 mt-6">
                  <CalendarIcon className="w-5 h-5 text-secondary" />
                  <h4 className="text-lg font-semibold text-foreground">Course Calendar</h4>
                </div>

                {(!events[course.id] || events[course.id].length === 0) ? (
                  <div className="text-center p-6 bg-muted/30 rounded-xl border border-dashed border-border text-muted-foreground">
                    <p className="text-sm">No specific events (homework, tests) detected in syllabus.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {events[course.id].map(event => (
                      <div key={event.id} className="p-3 rounded-lg border border-border bg-card shadow-sm flex gap-3 items-start">
                        <div className="flex flex-col items-center justify-center min-w-12 p-2 bg-muted/50 rounded-md">
                          {event.start_date ? (
                            <>
                              <span className="text-xs font-semibold text-secondary uppercase">
                                {new Date(event.start_date).toLocaleString('default', { month: 'short' })}
                              </span>
                              <span className="text-lg font-bold leading-none text-foreground">
                                {new Date(event.start_date).getDate()}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">TBD</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className={`text-[10px] uppercase tracking-wider
                              ${event.event_type === 'homework' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : ''}
                              ${event.event_type === 'test' || event.event_type === 'quiz' ? 'bg-destructive/10 text-destructive border-destructive/20' : ''}
                              ${event.event_type === 'reading' ? 'bg-green-500/10 text-green-500 border-green-500/20' : ''}
                            `}>
                              {event.event_type}
                            </Badge>
                          </div>
                          <h5 className="text-sm font-semibold text-foreground truncate">{event.title}</h5>
                          {event.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{event.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
};

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  BookOpen, MessageSquare, Calendar, MapPin, Utensils, Bus, Shield, User, LogOut, 
  GraduationCap, Target, TrendingUp, CheckCircle2, FileQuestion, Lightbulb, 
  ClipboardList, Bell, BookMarked, AlertTriangle, Star, Zap, Clock
} from "lucide-react";
import { SyllabusUpload } from "./SyllabusUpload";
import { PlacementQuiz } from "./PlacementQuiz";
import { StudyPlan } from "./StudyPlan";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStudyPlan } from "@/hooks/useStudyPlan";

interface DashboardProps {
  learningStyles: string[];
  onOpenChat: () => void;
  onRetakeQuiz: () => void;
}

const styleIcons: Record<string, string> = {
  visual: "👁️",
  auditory: "👂",
  kinesthetic: "✋",
  reading: "📖",
  writing: "✍️"
};

const styleDescriptions: Record<string, string> = {
  visual: "Learn best with images, diagrams, and visual aids",
  auditory: "Prefer listening to explanations and discussions",
  kinesthetic: "Excel through hands-on practice and doing",
  reading: "Thrive by reading and processing written content",
  writing: "Learn by taking notes and writing summaries"
};

export const Dashboard = ({ learningStyles, onOpenChat, onRetakeQuiz }: DashboardProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [syllabusRefreshTrigger, setSyllabusRefreshTrigger] = useState(0);
  
  const {
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
    completedClasses,
    activeClass,
    setActiveClass,
    classPlans,
    saveAllProgress,
  } = useStudyPlan(learningStyles);

  const handleSignOut = async () => {
    // Save all progress before signing out
    await saveAllProgress();
    
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Error",
        description: "Failed to sign out",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Signed out",
        description: "You've been successfully signed out",
      });
      navigate("/auth");
    }
  };

  // Derive topic checklists from objectives
  const topicChecklists = objectives.slice(0, 4).map((obj) => ({
    id: obj.id,
    topic: obj.topic,
    completed: completedObjectives.has(obj.id),
    status: completedObjectives.has(obj.id) ? "Done" : obj.priority === "high" ? "In Progress" : "Upcoming"
  }));

  // Derive missing content alerts from weak areas
  const missingContentAlerts = quizResult?.weakAreas.slice(0, 2).map((area, idx) => ({
    id: idx,
    topic: area,
    message: "No practice problems completed yet"
  })) || [];

  // Calculate adaptive learning progress based on study plan
  const placementProgress = quizResult ? Math.round((quizResult.score / quizResult.totalQuestions) * 100) : 0;
  const practiceProgress = resources.length > 0 ? Math.min(60, resources.length * 10) : 0;
  const explanationsProgress = objectives.length > 0 ? Math.min(85, objectives.length * 10) : 0;
  const trackingProgress = completionPercentage;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => navigate("/")}
              className="flex items-center gap-3 hover:opacity-80 transition-[var(--transition-smooth)]"
            >
              <div className="w-10 h-10 rounded-xl bg-[image:var(--gradient-primary)] flex items-center justify-center">
                <span className="text-white font-bold text-xl">A</span>
              </div>
              <h1 className="text-2xl font-bold text-foreground">AgentB</h1>
            </button>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => navigate("/profile")}
              >
                <User className="mr-2 h-4 w-4" />
                Profile
              </Button>
              <Button
                variant="outline"
                onClick={handleSignOut}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </Button>
              <Button 
                onClick={onOpenChat}
                className="bg-[image:var(--gradient-primary)] hover:opacity-90"
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                Chat
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Welcome Section */}
        <div className="space-y-4">
          <h2 className="text-3xl font-bold text-foreground">Welcome back!</h2>
          <p className="text-muted-foreground">Your personalized learning dashboard is ready.</p>
        </div>

        {/* Learning Styles */}
        <Card className="p-6 shadow-[var(--shadow-medium)] border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-foreground">Your Learning Style</h3>
            <Button variant="outline" size="sm" onClick={onRetakeQuiz}>
              Retake Quiz
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {learningStyles.map(style => (
              <div 
                key={style}
                className="p-4 rounded-xl bg-gradient-to-br from-primary/5 to-secondary/5 border border-border"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">{styleIcons[style]}</span>
                  <Badge variant="secondary" className="capitalize">
                    {style}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{styleDescriptions[style]}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Syllabus Upload */}
        <SyllabusUpload onUploadComplete={() => setSyllabusRefreshTrigger(prev => prev + 1)} />

        {/* Placement Quiz */}
        <PlacementQuiz 
          learningStyles={learningStyles} 
          onQuizComplete={setQuizResultAndGenerate}
          refreshTrigger={syllabusRefreshTrigger}
          completedClasses={completedClasses}
        />

        {/* Study Plan - shown after quiz completion */}
        {quizResult && (
          <StudyPlan
            quizResult={quizResult}
            objectives={objectives}
            resources={resources}
            completedObjectives={completedObjectives}
            completionPercentage={completionPercentage}
            isLoading={isLoading}
            learningStyles={learningStyles}
            onToggleObjective={toggleObjective}
            onClear={clearStudyPlan}
            onRefresh={() => quizResult && generateStudyPlan(quizResult)}
          />
        )}

        {/* Main Content Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Adaptive Learning */}
          <Card className="p-6 shadow-[var(--shadow-soft)] border-border hover:shadow-[var(--shadow-medium)] transition-[var(--transition-smooth)] md:col-span-2 lg:col-span-3">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <GraduationCap className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Adaptive Learning</h3>
              {completedClasses.length === 0 && (
                <Badge variant="outline" className="ml-auto text-muted-foreground">
                  Complete a quiz to unlock
                </Badge>
              )}
            </div>

            {/* Class Tabs */}
            {completedClasses.length > 0 && (
              <Tabs value={activeClass || completedClasses[0]} onValueChange={setActiveClass} className="mb-6">
                <TabsList className="flex-wrap h-auto gap-1">
                  {completedClasses.map((className) => (
                    <TabsTrigger key={className} value={className} className="text-sm">
                      {className}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}

            {/* Progress Bars - Dynamic based on study plan */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">Placement Quizzes</span>
                  <span className="text-sm text-muted-foreground">{placementProgress}%</span>
                </div>
                <Progress value={placementProgress} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">Personalized Practice</span>
                  <span className="text-sm text-muted-foreground">{practiceProgress}%</span>
                </div>
                <Progress value={practiceProgress} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">Explanations for Mistakes</span>
                  <span className="text-sm text-muted-foreground">{explanationsProgress}%</span>
                </div>
                <Progress value={explanationsProgress} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">Progress Tracking</span>
                  <span className="text-sm text-muted-foreground">{trackingProgress}%</span>
                </div>
                <Progress value={trackingProgress} className="h-2" />
              </div>
            </div>

            {/* Practice Tools Row */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8 pt-6 border-t border-border">
              {/* Mini-Quizzes */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 to-secondary/5 border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <FileQuestion className="w-5 h-5 text-primary" />
                  <h4 className="font-medium text-foreground text-sm">Mini-Quizzes</h4>
                </div>
                <p className="text-2xl font-bold text-foreground mb-1">{completedClasses.length > 0 ? 3 : 0}</p>
                <p className="text-xs text-muted-foreground">Available today</p>
                <Button variant="outline" size="sm" className="w-full mt-3" disabled={completedClasses.length === 0}>
                  Start Quiz
                </Button>
              </div>

              {/* Interactive Exercises */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-secondary/5 to-accent/5 border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-5 h-5 text-secondary" />
                  <h4 className="font-medium text-foreground text-sm">Interactive Exercises</h4>
                </div>
                <p className="text-2xl font-bold text-foreground mb-1">{resources.length}</p>
                <p className="text-xs text-muted-foreground">New exercises</p>
                <Button variant="outline" size="sm" className="w-full mt-3" disabled={completedClasses.length === 0}>
                  Practice Now
                </Button>
              </div>

              {/* Hints Available */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-accent/5 to-primary/5 border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="w-5 h-5 text-accent" />
                  <h4 className="font-medium text-foreground text-sm">Hints</h4>
                </div>
                <p className="text-2xl font-bold text-foreground mb-1">∞</p>
                <p className="text-xs text-muted-foreground">Unlimited hints</p>
                <Button variant="outline" size="sm" className="w-full mt-3">View Tips</Button>
              </div>

              {/* Confidence Rating */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 to-accent/5 border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <Star className="w-5 h-5 text-primary" />
                  <h4 className="font-medium text-foreground text-sm">Confidence Rating</h4>
                </div>
                <div className="flex items-center gap-1 mb-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star 
                      key={star} 
                      className={`w-5 h-5 ${star <= Math.ceil(completionPercentage / 20) ? "fill-primary text-primary" : "text-muted-foreground"}`} 
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{Math.ceil(completionPercentage / 20)}/5 overall confidence</p>
                <Button variant="outline" size="sm" className="w-full mt-3" disabled={completedClasses.length === 0}>
                  Rate Topics
                </Button>
              </div>
            </div>

            {/* Topic Checklists, Reminders & Chapter Breakdowns */}
            <div className="grid gap-6 md:grid-cols-3 mb-8 pt-6 border-t border-border">
              {/* Topic Checklists - Dynamic from objectives */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-primary" />
                  <h4 className="font-semibold text-foreground">Topic Checklists</h4>
                </div>
                <div className="space-y-2">
                  {topicChecklists.length > 0 ? (
                    topicChecklists.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                        {item.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-primary" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-muted-foreground" />
                        )}
                        <span className="text-sm text-foreground truncate flex-1">{item.topic}</span>
                        <Badge variant={item.completed ? "secondary" : "outline"} className="ml-auto text-xs">
                          {item.status}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-muted-foreground p-2">
                      Complete a placement quiz to see your topics
                    </div>
                  )}
                </div>
              </div>

              {/* Reminders */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-secondary" />
                  <h4 className="font-semibold text-foreground">Reminders</h4>
                </div>
                <div className="space-y-2">
                  {completedClasses.length > 0 && quizResult ? (
                    <>
                      <div className="flex items-start gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20">
                        <Clock className="w-4 h-4 text-destructive mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">Review weak areas</p>
                          <p className="text-xs text-muted-foreground">{quizResult.className}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/50">
                        <Clock className="w-4 h-4 text-muted-foreground mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">Complete {objectives.length - completedObjectives.size} objectives</p>
                          <p className="text-xs text-muted-foreground">Study plan goals</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground p-2">
                      No reminders yet
                    </div>
                  )}
                </div>
              </div>

              {/* Chapter Breakdowns - Dynamic from strong/weak areas */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <BookMarked className="w-5 h-5 text-accent" />
                  <h4 className="font-semibold text-foreground">Chapter Breakdowns</h4>
                </div>
                <div className="space-y-2">
                  {completedClasses.length > 0 && quizResult ? (
                    <>
                      {quizResult.strongAreas.slice(0, 2).map((area, idx) => (
                        <div key={`strong-${idx}`} className="p-2 rounded-lg bg-muted/50">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-foreground truncate">{area}</span>
                            <span className="text-xs text-muted-foreground">100%</span>
                          </div>
                          <Progress value={100} className="h-1.5" />
                        </div>
                      ))}
                      {quizResult.weakAreas.slice(0, 2).map((area, idx) => (
                        <div key={`weak-${idx}`} className="p-2 rounded-lg bg-muted/50">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-foreground truncate">{area}</span>
                            <span className="text-xs text-muted-foreground">25%</span>
                          </div>
                          <Progress value={25} className="h-1.5" />
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground p-2">
                      Complete a quiz to see chapter progress
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Missing Content Alerts - Dynamic from weak areas */}
            <div className="mb-8 pt-6 border-t border-border">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                <h4 className="font-semibold text-foreground">Missing Content Alerts</h4>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {missingContentAlerts.length > 0 ? (
                  missingContentAlerts.map((alert) => (
                    <div key={alert.id} className="flex items-start gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                      <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{alert.topic}</p>
                        <p className="text-xs text-muted-foreground mt-1">{alert.message}</p>
                        <Button variant="link" size="sm" className="p-0 h-auto mt-1 text-primary">
                          Start practicing →
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-2 text-sm text-muted-foreground p-3 rounded-lg bg-muted/30">
                    {completedClasses.length > 0
                      ? "Great job! No missing content detected." 
                      : "Complete a placement quiz to identify areas that need attention."}
                  </div>
                )}
              </div>
            </div>

            {/* Learning Objectives & Weekly Performance */}
            <div className="grid gap-6 md:grid-cols-2 pt-6 border-t border-border">
              {/* Learning Objectives - Dynamic from objectives */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-5 h-5 text-primary" />
                  <h4 className="font-semibold text-foreground">Learning Objectives</h4>
                </div>
                <div className="space-y-3">
                  {objectives.length > 0 ? (
                    objectives.slice(0, 3).map((obj) => (
                      <div key={obj.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                        <CheckCircle2 
                          className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                            completedObjectives.has(obj.id) ? "text-primary" : "text-muted-foreground"
                          }`} 
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{obj.topic}</p>
                          <p className="text-xs text-muted-foreground mt-1">{obj.description}</p>
                        </div>
                        <Badge className={`${
                          obj.priority === "high" 
                            ? "bg-destructive/10 text-destructive" 
                            : obj.priority === "medium"
                            ? "bg-secondary/10 text-secondary"
                            : "bg-accent/10 text-accent"
                        } border-0`}>
                          {obj.priority}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-muted-foreground p-3 rounded-lg bg-muted/30">
                      Complete a placement quiz to get personalized learning objectives.
                    </div>
                  )}
                </div>
              </div>

              {/* Weekly Performance Report */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <h4 className="font-semibold text-foreground">Weekly Performance Report</h4>
                </div>
                <div className="grid gap-3 grid-cols-2">
                  <div className="p-4 rounded-lg bg-gradient-to-br from-primary/5 to-secondary/5 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-foreground">Study Time</span>
                      {quizResult && <Badge variant="secondary" className="text-xs">+15%</Badge>}
                    </div>
                    <p className="text-xl font-bold text-foreground">{quizResult ? "12.5 hrs" : "--"}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-gradient-to-br from-secondary/5 to-accent/5 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-foreground">Quiz Avg</span>
                      {quizResult && <Badge variant="secondary" className="text-xs">New!</Badge>}
                    </div>
                    <p className="text-xl font-bold text-foreground">
                      {quizResult ? `${Math.round((quizResult.score / quizResult.totalQuestions) * 100)}%` : "--"}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-gradient-to-br from-accent/5 to-primary/5 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-foreground">Objectives</span>
                      <Badge variant="secondary" className="text-xs">{completedObjectives.size}/{objectives.length}</Badge>
                    </div>
                    <p className="text-xl font-bold text-foreground">{completionPercentage}%</p>
                  </div>
                  <div className="p-4 rounded-lg bg-gradient-to-br from-primary/5 to-accent/5 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-foreground">Resources</span>
                      <Badge variant="secondary" className="text-xs">{resources.length}</Badge>
                    </div>
                    <p className="text-xl font-bold text-foreground">{resources.length}</p>
                  </div>
                </div>
                {quizResult && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge className="bg-primary/10 text-primary border-0">🏆 Quiz Taker</Badge>
                    {completionPercentage >= 50 && <Badge className="bg-secondary/10 text-secondary border-0">📚 Half Way</Badge>}
                    {completionPercentage === 100 && <Badge className="bg-accent/10 text-accent border-0">⭐ All Done</Badge>}
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Study Resources */}
          <Card className="p-6 shadow-[var(--shadow-soft)] border-border hover:shadow-[var(--shadow-medium)] transition-[var(--transition-smooth)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <BookOpen className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Study Resources</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {resources.length > 0 
                ? `${resources.length} personalized resources available`
                : "Complete a quiz to get personalized materials"}
            </p>
            <Button variant="outline" className="w-full" disabled={resources.length === 0}>
              Browse Resources
            </Button>
          </Card>

          {/* Campus Calendar */}
          <Card className="p-6 shadow-[var(--shadow-soft)] border-border hover:shadow-[var(--shadow-medium)] transition-[var(--transition-smooth)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-secondary/10">
                <Calendar className="w-6 h-6 text-secondary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Campus Calendar</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Academic events, deadlines, and important dates
            </p>
            <Button variant="outline" className="w-full" onClick={() => navigate("/calendar")}>
              View Calendar
            </Button>
          </Card>

          {/* Campus Map */}
          <Card className="p-6 shadow-[var(--shadow-soft)] border-border hover:shadow-[var(--shadow-medium)] transition-[var(--transition-smooth)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-accent/10">
                <MapPin className="w-6 h-6 text-accent" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Campus Map</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Navigate campus buildings and facilities
            </p>
            <Button variant="outline" className="w-full">
              Open Map
            </Button>
          </Card>

          {/* Shuttle Information */}
          <Card className="p-6 shadow-[var(--shadow-soft)] border-border hover:shadow-[var(--shadow-medium)] transition-[var(--transition-smooth)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <Bus className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Shuttle Information</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Real-time shuttle schedules and routes
            </p>
            <Button variant="outline" className="w-full">
              View Schedule
            </Button>
          </Card>

          {/* Dining Café Times */}
          <Card className="p-6 shadow-[var(--shadow-soft)] border-border hover:shadow-[var(--shadow-medium)] transition-[var(--transition-smooth)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-secondary/10">
                <Utensils className="w-6 h-6 text-secondary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Dining Café Times</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Menus, hours, and dining hall locations
            </p>
            <Button variant="outline" className="w-full">
              See Menus
            </Button>
          </Card>

          {/* Safety & Title IX */}
          <Card className="p-6 shadow-[var(--shadow-soft)] border-border hover:shadow-[var(--shadow-medium)] transition-[var(--transition-smooth)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-accent/10">
                <Shield className="w-6 h-6 text-accent" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Safety & Resources</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Emergency contacts, Title IX, and support services
            </p>
            <Button variant="outline" className="w-full">
              Access Resources
            </Button>
          </Card>
        </div>

        {/* AgentB CTA */}
        <Card className="p-8 bg-[image:var(--gradient-primary)] border-0 text-white shadow-[var(--shadow-elevated)]">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center md:text-left">
              <h3 className="text-2xl font-bold">Need Help? Ask AgentB!</h3>
              <p className="text-white/90">
                Your AI assistant is here 24/7 to answer questions, provide reminders, and guide you to resources.
              </p>
            </div>
            <Button 
              size="lg"
              onClick={onOpenChat}
              className="bg-white text-primary hover:bg-white/90 shadow-lg"
            >
              <MessageSquare className="mr-2 h-5 w-5" />
              Start Chatting
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
};

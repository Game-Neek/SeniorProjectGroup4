import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  BookOpen, MessageSquare, Calendar, MapPin, Utensils, Bus, Shield, User, LogOut, 
  GraduationCap, Target, TrendingUp, CheckCircle2, FileQuestion, Lightbulb, 
  ClipboardList, Bell, BookMarked, AlertTriangle, Star, Zap, Clock
} from "lucide-react";
import { SyllabusUpload } from "./SyllabusUpload";
import { PlacementQuiz } from "./PlacementQuiz";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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

  const handleSignOut = async () => {
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
        <SyllabusUpload />

        {/* Placement Quiz */}
        <PlacementQuiz learningStyles={learningStyles} />

        {/* Main Content Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Adaptive Learning */}
          <Card className="p-6 shadow-[var(--shadow-soft)] border-border hover:shadow-[var(--shadow-medium)] transition-[var(--transition-smooth)] md:col-span-2 lg:col-span-3">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-primary/10">
                <GraduationCap className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Adaptive Learning</h3>
            </div>

            {/* Progress Bars */}
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
                  <span className="text-sm font-medium text-foreground">Explanations for Mistakes</span>
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

            {/* Practice Tools Row */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8 pt-6 border-t border-border">
              {/* Mini-Quizzes */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 to-secondary/5 border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <FileQuestion className="w-5 h-5 text-primary" />
                  <h4 className="font-medium text-foreground text-sm">Mini-Quizzes</h4>
                </div>
                <p className="text-2xl font-bold text-foreground mb-1">3</p>
                <p className="text-xs text-muted-foreground">Available today</p>
                <Button variant="outline" size="sm" className="w-full mt-3">Start Quiz</Button>
              </div>

              {/* Interactive Exercises */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-secondary/5 to-accent/5 border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-5 h-5 text-secondary" />
                  <h4 className="font-medium text-foreground text-sm">Interactive Exercises</h4>
                </div>
                <p className="text-2xl font-bold text-foreground mb-1">12</p>
                <p className="text-xs text-muted-foreground">New exercises</p>
                <Button variant="outline" size="sm" className="w-full mt-3">Practice Now</Button>
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
                  {[1, 2, 3, 4].map((star) => (
                    <Star key={star} className="w-5 h-5 fill-primary text-primary" />
                  ))}
                  <Star className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">4/5 overall confidence</p>
                <Button variant="outline" size="sm" className="w-full mt-3">Rate Topics</Button>
              </div>
            </div>

            {/* Topic Checklists, Reminders & Chapter Breakdowns */}
            <div className="grid gap-6 md:grid-cols-3 mb-8 pt-6 border-t border-border">
              {/* Topic Checklists */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-primary" />
                  <h4 className="font-semibold text-foreground">Topic Checklists</h4>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    <span className="text-sm text-foreground">Derivatives</span>
                    <Badge variant="secondary" className="ml-auto text-xs">Done</Badge>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    <span className="text-sm text-foreground">Integrals Basics</span>
                    <Badge variant="secondary" className="ml-auto text-xs">Done</Badge>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                    <div className="w-4 h-4 rounded-full border-2 border-muted-foreground" />
                    <span className="text-sm text-foreground">Chain Rule</span>
                    <Badge variant="outline" className="ml-auto text-xs">In Progress</Badge>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                    <div className="w-4 h-4 rounded-full border-2 border-muted-foreground" />
                    <span className="text-sm text-foreground">U-Substitution</span>
                    <Badge variant="outline" className="ml-auto text-xs">Upcoming</Badge>
                  </div>
                </div>
              </div>

              {/* Reminders */}
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
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/50">
                    <Clock className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Essay draft due Friday</p>
                      <p className="text-xs text-muted-foreground">English Composition</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Chapter Breakdowns */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <BookMarked className="w-5 h-5 text-accent" />
                  <h4 className="font-semibold text-foreground">Chapter Breakdowns</h4>
                </div>
                <div className="space-y-2">
                  <div className="p-2 rounded-lg bg-muted/50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">Ch. 5: Limits</span>
                      <span className="text-xs text-muted-foreground">100%</span>
                    </div>
                    <Progress value={100} className="h-1.5" />
                  </div>
                  <div className="p-2 rounded-lg bg-muted/50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">Ch. 6: Derivatives</span>
                      <span className="text-xs text-muted-foreground">85%</span>
                    </div>
                    <Progress value={85} className="h-1.5" />
                  </div>
                  <div className="p-2 rounded-lg bg-muted/50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">Ch. 7: Integrals</span>
                      <span className="text-xs text-muted-foreground">45%</span>
                    </div>
                    <Progress value={45} className="h-1.5" />
                  </div>
                  <div className="p-2 rounded-lg bg-muted/50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">Ch. 8: Applications</span>
                      <span className="text-xs text-muted-foreground">10%</span>
                    </div>
                    <Progress value={10} className="h-1.5" />
                  </div>
                </div>
              </div>
            </div>

            {/* Missing Content Alerts */}
            <div className="mb-8 pt-6 border-t border-border">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                <h4 className="font-semibold text-foreground">Missing Content Alerts</h4>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                  <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Integration by Parts</p>
                    <p className="text-xs text-muted-foreground mt-1">No practice problems completed yet</p>
                    <Button variant="link" size="sm" className="p-0 h-auto mt-1 text-primary">Start practicing →</Button>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                  <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Thermodynamics Basics</p>
                    <p className="text-xs text-muted-foreground mt-1">Pre-quiz not taken</p>
                    <Button variant="link" size="sm" className="p-0 h-auto mt-1 text-primary">Take pre-quiz →</Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Learning Objectives & Weekly Performance */}
            <div className="grid gap-6 md:grid-cols-2 pt-6 border-t border-border">
              {/* Learning Objectives */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-5 h-5 text-primary" />
                  <h4 className="font-semibold text-foreground">Learning Objectives</h4>
                </div>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Master Calculus Fundamentals</p>
                      <p className="text-xs text-muted-foreground mt-1">Complete by end of week</p>
                    </div>
                    <Badge className="bg-primary/10 text-primary border-0">3/5</Badge>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <CheckCircle2 className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Improve Essay Writing Skills</p>
                      <p className="text-xs text-muted-foreground mt-1">Practice 3 essays this week</p>
                    </div>
                    <Badge className="bg-secondary/10 text-secondary border-0">1/3</Badge>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <CheckCircle2 className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Complete Physics Lab Reports</p>
                      <p className="text-xs text-muted-foreground mt-1">2 reports due this Friday</p>
                    </div>
                    <Badge className="bg-accent/10 text-accent border-0">0/2</Badge>
                  </div>
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
                  <div className="p-4 rounded-lg bg-gradient-to-br from-accent/5 to-primary/5 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-foreground">Exercises</span>
                      <Badge variant="secondary" className="text-xs">24/30</Badge>
                    </div>
                    <p className="text-xl font-bold text-foreground">80%</p>
                  </div>
                  <div className="p-4 rounded-lg bg-gradient-to-br from-primary/5 to-accent/5 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-foreground">Badges</span>
                      <Badge variant="secondary" className="text-xs">New!</Badge>
                    </div>
                    <p className="text-xl font-bold text-foreground">7</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge className="bg-primary/10 text-primary border-0">🏆 Quick Learner</Badge>
                  <Badge className="bg-secondary/10 text-secondary border-0">📚 Bookworm</Badge>
                  <Badge className="bg-accent/10 text-accent border-0">⭐ Perfect Score</Badge>
                </div>
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
              Personalized materials based on your learning style
            </p>
            <Button variant="outline" className="w-full">
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
          <Card className="p-6 shadow-[var(--shadow-soft)] border-border hover:shadow-[var(--shadow-medium)} transition-[var(--transition-smooth)]">
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

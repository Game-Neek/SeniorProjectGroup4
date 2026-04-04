import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BookOpen, MessageSquare, Calendar, MapPin, Utensils, Bus, Shield, User, LogOut
} from "lucide-react";
import { DashboardReadAloud } from "./DashboardReadAloud";
import { SyllabusUpload } from "./SyllabusUpload";

import { CourseHub } from "./CourseHub";
import { TestReminders } from "./TestReminders";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";

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
  const [isReadAloudActive, setIsReadAloudActive] = useState(false);
  const mainContentRef = useRef<HTMLElement>(null);

  const { saveProfile } = useProfile();

  const handleSignOut = async () => {
    await saveProfile();
    
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
              <DashboardReadAloud
                isActive={isReadAloudActive}
                onToggle={() => setIsReadAloudActive((v) => !v)}
                contentRef={mainContentRef}
              />
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

      <main ref={mainContentRef} className={`container mx-auto px-4 py-8 space-y-8 ${isReadAloudActive ? "pb-32" : ""}`}>
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

        {/* Course Hub */}
        <CourseHub refreshTrigger={syllabusRefreshTrigger} />


        {/* Test Reminders */}
        <TestReminders />

        {/* Main Content Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Study Resources */}
          <Card className="p-6 shadow-[var(--shadow-soft)] border-border hover:shadow-[var(--shadow-medium)] transition-[var(--transition-smooth)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <BookOpen className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Study Resources</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Access your personalized study materials from each course
            </p>
            <Button variant="outline" className="w-full" onClick={onOpenChat}>
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

          {/* Shuttle & Transit */}
          <Card className="p-6 shadow-[var(--shadow-soft)] border-border hover:shadow-[var(--shadow-medium)] transition-[var(--transition-smooth)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <Bus className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Transit & Shuttles</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Campus shuttles & public metro schedules with interactive map
            </p>
            <Button variant="outline" className="w-full" onClick={() => navigate("/transit")}>
              View Transit Map
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

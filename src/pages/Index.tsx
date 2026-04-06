import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Hero } from "@/components/Hero";
import { LearningStyleQuiz } from "@/components/LearningStyleQuiz";
import { Dashboard } from "@/components/Dashboard";
import { ChatInterface } from "@/components/ChatInterface";

type AppState = "hero" | "quiz" | "dashboard" | "loading";

const Index = () => {
  const [appState, setAppState] = useState<AppState>("loading");
  const [learningStyles, setLearningStyles] = useState<string[]>([]);
  const [showChat, setShowChat] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setIsAuthenticated(!!session);
      if (!session) {
        setAppState("hero");
        setLearningStyles([]);
      }
    });

    // Listen for learning style updates from profile
    const handleStyleUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.styles) setLearningStyles(detail.styles);
    };
    window.addEventListener("learning-styles-updated", handleStyleUpdate);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("learning-styles-updated", handleStyleUpdate);
    };
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setIsAuthenticated(!!session);
    
    if (session) {
      // Check if user has completed learning style quiz
      const { data: profile } = await supabase
        .from('profiles_safe' as any)
        .select('learning_styles')
        .eq('id', session.user.id)
        .single() as { data: { learning_styles: string[] | null } | null };
      
      if (profile?.learning_styles && profile.learning_styles.length > 0) {
        setLearningStyles(profile.learning_styles);
        setAppState("dashboard");
      } else {
        // Force quiz for new users without learning styles
        setAppState("quiz");
      }
    } else {
      setAppState("hero");
    }
  };

  const handleGetStarted = () => {
    if (isAuthenticated) {
      setAppState("quiz");
    } else {
      navigate("/auth");
    }
  };

  const handleQuizComplete = async (styles: string[]) => {
    // Save learning styles to profile
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase
        .from('profiles')
        .update({ learning_styles: styles })
        .eq('id', session.user.id);
    }
    
    setLearningStyles(styles);
    setAppState("dashboard");
  };

  if (appState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <>
      {appState === "hero" && <Hero onGetStarted={handleGetStarted} />}
      {appState === "quiz" && <LearningStyleQuiz onComplete={handleQuizComplete} />}
      {appState === "dashboard" && (
        <Dashboard 
          learningStyles={learningStyles} 
          onOpenChat={() => setShowChat(true)}
          onRetakeQuiz={() => setAppState("quiz")}
        />
      )}
      {showChat && <ChatInterface onClose={() => setShowChat(false)} learningStyles={learningStyles} />}
    </>
  );
};

export default Index;

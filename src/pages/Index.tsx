import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Hero } from "@/components/Hero";
import { LearningStyleQuiz } from "@/components/LearningStyleQuiz";
import { Dashboard } from "@/components/Dashboard";
import { ChatInterface } from "@/components/ChatInterface";

type AppState = "hero" | "quiz" | "dashboard";

const Index = () => {
  const [appState, setAppState] = useState<AppState>("hero");
  const [learningStyles, setLearningStyles] = useState<string[]>([]);
  const [showChat, setShowChat] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setIsAuthenticated(!!session);
    
    if (session) {
      setAppState("dashboard");
      // Mock learning styles for now - could fetch from user preferences
      setLearningStyles(["visual", "reading"]);
    }
  };

  const handleGetStarted = () => {
    if (isAuthenticated) {
      setAppState("quiz");
    } else {
      navigate("/auth");
    }
  };

  const handleQuizComplete = (styles: string[]) => {
    setLearningStyles(styles);
    setAppState("dashboard");
  };

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

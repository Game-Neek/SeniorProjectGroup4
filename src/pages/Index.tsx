import { useState } from "react";
import { Hero } from "@/components/Hero";
import { LearningStyleQuiz } from "@/components/LearningStyleQuiz";
import { Dashboard } from "@/components/Dashboard";
import { ChatInterface } from "@/components/ChatInterface";

type AppState = "hero" | "quiz" | "dashboard";

const Index = () => {
  const [appState, setAppState] = useState<AppState>("hero");
  const [learningStyles, setLearningStyles] = useState<string[]>([]);
  const [showChat, setShowChat] = useState(false);

  const handleGetStarted = () => {
    setAppState("quiz");
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
        />
      )}
      {showChat && <ChatInterface onClose={() => setShowChat(false)} />}
    </>
  );
};

export default Index;

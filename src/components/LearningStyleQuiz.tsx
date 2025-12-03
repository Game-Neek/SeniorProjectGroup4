import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { BookOpen, Eye, Ear, Hand, PenTool, ArrowRight } from "lucide-react";

interface LearningStyleQuizProps {
  onComplete: (styles: string[]) => void;
}

const questions = [
  {
    id: 1,
    question: "When learning something new, I prefer to:",
    options: [
      { value: "visual", label: "See diagrams, charts, or videos", icon: Eye },
      { value: "auditory", label: "Listen to explanations or lectures", icon: Ear },
      { value: "kinesthetic", label: "Try it hands-on and practice", icon: Hand },
      { value: "reading", label: "Read detailed articles or textbooks", icon: BookOpen },
    ]
  },
  {
    id: 2,
    question: "I remember things best when I:",
    options: [
      { value: "visual", label: "Create visual notes or mind maps", icon: Eye },
      { value: "auditory", label: "Discuss or explain to others", icon: Ear },
      { value: "kinesthetic", label: "Do practice problems repeatedly", icon: Hand },
      { value: "writing", label: "Write detailed notes or summaries", icon: PenTool },
    ]
  },
  {
    id: 3,
    question: "When studying for an exam, I:",
    options: [
      { value: "visual", label: "Use flashcards with images", icon: Eye },
      { value: "auditory", label: "Record myself and listen back", icon: Ear },
      { value: "kinesthetic", label: "Work through many practice problems", icon: Hand },
      { value: "reading", label: "Read and re-read my notes", icon: BookOpen },
    ]
  },
  {
    id: 4,
    question: "In a classroom setting, I learn best when:",
    options: [
      { value: "visual", label: "The instructor uses slides and diagrams", icon: Eye },
      { value: "auditory", label: "There are group discussions", icon: Ear },
      { value: "kinesthetic", label: "We do labs or hands-on activities", icon: Hand },
      { value: "writing", label: "I can take detailed written notes", icon: PenTool },
    ]
  },
  {
    id: 5,
    question: "When trying to understand a complex concept, I:",
    options: [
      { value: "visual", label: "Look for infographics or video tutorials", icon: Eye },
      { value: "auditory", label: "Listen to podcasts or ask someone to explain", icon: Ear },
      { value: "kinesthetic", label: "Experiment and learn by doing", icon: Hand },
      { value: "reading", label: "Research and read multiple sources", icon: BookOpen },
    ]
  }
];

export const LearningStyleQuiz = ({ onComplete }: LearningStyleQuizProps) => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string[]>>({});

  const handleAnswerToggle = (value: string) => {
    const currentAnswers = answers[currentQuestion] || [];
    const newAnswers = currentAnswers.includes(value)
      ? currentAnswers.filter(v => v !== value)
      : [...currentAnswers, value];
    setAnswers({ ...answers, [currentQuestion]: newAnswers });
  };

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      // Calculate learning styles from all answers
      const styleCount: Record<string, number> = {};
      Object.values(answers).flat().forEach(style => {
        styleCount[style] = (styleCount[style] || 0) + 1;
      });
      
      // Get top 2 most prominent learning styles
      const sortedStyles = Object.entries(styleCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 2)
        .map(([style]) => style);
      
      onComplete(sortedStyles);
    }
  };

  const question = questions[currentQuestion];
  const currentAnswers = answers[currentQuestion] || [];
  const isAnswered = currentAnswers.length > 0;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <Card className="w-full max-w-2xl p-8 shadow-[var(--shadow-elevated)] border-border">
        <div className="space-y-6">
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Question {currentQuestion + 1} of {questions.length}</span>
              <span>{Math.round(((currentQuestion + 1) / questions.length) * 100)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-[image:var(--gradient-primary)] transition-[var(--transition-smooth)]"
                style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Question */}
          <div className="pt-4">
            <h2 className="text-2xl font-bold text-foreground mb-2">{question.question}</h2>
            <p className="text-sm text-muted-foreground mb-6">Select all that apply</p>
            
            <div className="space-y-3">
              {question.options.map((option) => {
                const Icon = option.icon;
                const isSelected = currentAnswers.includes(option.value);
                return (
                  <div
                    key={option.value}
                    onClick={() => handleAnswerToggle(option.value)}
                    className={`flex items-center space-x-3 p-4 rounded-xl border-2 transition-[var(--transition-smooth)] cursor-pointer ${
                      isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <Checkbox 
                      checked={isSelected}
                      onCheckedChange={() => handleAnswerToggle(option.value)}
                      className="border-2"
                    />
                    <Label 
                      className="flex items-center gap-3 cursor-pointer flex-1"
                    >
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <span className="text-foreground font-medium">{option.label}</span>
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex justify-between pt-6">
            <Button
              variant="outline"
              onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))}
              disabled={currentQuestion === 0}
            >
              Previous
            </Button>
            <Button
              onClick={handleNext}
              disabled={!isAnswered}
              className="bg-[image:var(--gradient-primary)] hover:opacity-90"
            >
              {currentQuestion === questions.length - 1 ? "Complete" : "Next"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

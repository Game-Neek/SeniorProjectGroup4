import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Send, Sparkles, BookOpen, Lightbulb, HelpCircle, FileQuestion } from "lucide-react";
import { useAgentBChat } from "@/hooks/useAgentBChat";

interface ChatInterfaceProps {
  onClose: () => void;
  learningStyles?: string[];
}

const quickActions = [
  { icon: BookOpen, label: "Explain a concept", prompt: "Can you explain " },
  { icon: Lightbulb, label: "Real-world example", prompt: "Give me a real-world example of " },
  { icon: HelpCircle, label: "Practice problem", prompt: "Give me a practice problem about " },
  { icon: FileQuestion, label: "Pre-quiz", prompt: "Create a pre-quiz to test my understanding of " },
];

export const ChatInterface = ({ onClose, learningStyles = [] }: ChatInterfaceProps) => {
  const { messages, sendMessage, isLoading } = useAgentBChat(learningStyles);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput("");
  };

  const handleQuickAction = (prompt: string) => {
    setInput(prompt);
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl h-[600px] flex flex-col shadow-[var(--shadow-elevated)] border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-[image:var(--gradient-primary)] text-white rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">AgentB</h3>
              <p className="text-sm text-white/80">Your AI Campus Assistant</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={onClose}
            className="hover:bg-white/20 text-white"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    message.role === "user"
                      ? "bg-[image:var(--gradient-primary)] text-white"
                      : "bg-muted text-foreground"
                  }`}
                >
                  <div className="text-sm whitespace-pre-wrap prose prose-sm dark:prose-invert max-w-none">
                    {message.content || (isLoading && message.role === "assistant" ? (
                      <span className="animate-pulse">Thinking...</span>
                    ) : null)}
                  </div>
                  <span className={`text-xs mt-1 block ${
                    message.role === "user" ? "text-white/70" : "text-muted-foreground"
                  }`}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Quick Actions */}
        {messages.length <= 2 && (
          <div className="px-4 pb-2">
            <div className="flex flex-wrap gap-2">
              {quickActions.map((action) => (
                <Button
                  key={action.label}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickAction(action.prompt)}
                  className="text-xs"
                >
                  <action.icon className="h-3 w-3 mr-1" />
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="Ask AgentB anything..."
              className="flex-1 border-2 focus-visible:ring-primary"
              disabled={isLoading}
            />
            <Button 
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="bg-[image:var(--gradient-primary)] hover:opacity-90"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            AI-powered tutoring • Adapts to your learning style
          </p>
        </div>
      </Card>
    </div>
  );
};

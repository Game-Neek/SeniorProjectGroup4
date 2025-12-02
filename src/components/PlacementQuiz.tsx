import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileQuestion, Loader2, BookOpen, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Syllabus {
  id: string;
  class_name: string;
  file_name: string;
}

interface PlacementQuizProps {
  learningStyles: string[];
}

export const PlacementQuiz = ({ learningStyles }: PlacementQuizProps) => {
  const [syllabi, setSyllabi] = useState<Syllabus[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [quizContent, setQuizContent] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSyllabi();
  }, []);

  const fetchSyllabi = async () => {
    const { data, error } = await supabase
      .from("syllabi")
      .select("id, class_name, file_name")
      .order("uploaded_at", { ascending: false });

    if (!error && data) {
      setSyllabi(data);
    }
  };

  const generateQuiz = async () => {
    if (!selectedClass) {
      toast({
        title: "Select a class",
        description: "Please select a class to generate a placement quiz",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setQuizContent("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-b-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: `Generate a comprehensive placement quiz for ${selectedClass}` }],
            learningStyles,
            requestType: "placement-quiz",
            className: selectedClass,
          }),
        }
      );

      if (!response.ok || !response.body) {
        throw new Error("Failed to generate quiz");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let content = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (delta) {
              content += delta;
              setQuizContent(content);
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      toast({
        title: "Quiz Generated",
        description: `Placement quiz for ${selectedClass} is ready!`,
      });
    } catch (error) {
      console.error("Quiz generation error:", error);
      toast({
        title: "Generation Failed",
        description: "Failed to generate placement quiz. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="p-6 shadow-[var(--shadow-soft)] border-border">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-accent/10">
          <FileQuestion className="w-6 h-6 text-accent" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Placement Quiz</h3>
          <p className="text-sm text-muted-foreground">Test your knowledge before diving in</p>
        </div>
      </div>

      {syllabi.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>Upload a syllabus first to generate placement quizzes</p>
          <p className="text-sm">Go to "Class Syllabi" section above</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-3">
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {syllabi.map((s) => (
                  <SelectItem key={s.id} value={s.class_name}>
                    {s.class_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={generateQuiz}
              disabled={isGenerating || !selectedClass}
              className="bg-[image:var(--gradient-primary)] hover:opacity-90"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileQuestion className="w-4 h-4 mr-2" />
                  Generate Quiz
                </>
              )}
            </Button>
          </div>

          {quizContent && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <Badge variant="secondary" className="text-xs">
                  {selectedClass}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={generateQuiz}
                  disabled={isGenerating}
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Regenerate
                </Button>
              </div>
              <ScrollArea className="h-[400px] rounded-lg border border-border p-4 bg-muted/30">
                <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                  {quizContent}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, MessageSquare, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ContentFeedbackLoopProps {
  contentId: string;
  topic: string;
  className: string;
}

export const ContentFeedbackLoop = ({ contentId, topic, className }: ContentFeedbackLoopProps) => {
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const handleVote = async (direction: "up" | "down") => {
    setVote(direction);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Log a learning event for the feedback
    await supabase.from("learning_events").insert({
      user_id: session.user.id,
      class_name: className,
      event_type: "content_feedback",
      topic,
      outcome: direction,
      metadata: { contentId },
    });

    if (direction === "down") {
      setShowComment(true);
    } else {
      setSubmitted(true);
      toast({ title: "Thanks for the feedback!", description: "Your input helps improve course content." });
    }
  };

  const handleSubmitFeedback = async () => {
    if (!comment.trim() && vote !== "down") return;

    setIsRefining(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Log detailed feedback
      await supabase.from("learning_events").insert({
        user_id: session.user.id,
        class_name: className,
        event_type: "content_feedback_detail",
        topic,
        outcome: "negative_with_comment",
        metadata: { contentId, comment: comment.trim() },
      });

      // Fetch current lesson content
      const { data: content } = await supabase
        .from("course_content")
        .select("lesson_content, quiz_questions, exercises")
        .eq("id", contentId)
        .single();

      if (content?.lesson_content) {
        // Auto-trigger refine-content with student feedback context
        const { data, error } = await supabase.functions.invoke("refine-content", {
          body: {
            contentId,
            lessonContent: content.lesson_content,
            quizQuestions: content.quiz_questions,
            exercises: content.exercises,
            refinementMode: "clarity",
            studentFeedback: comment.trim() || "Student indicated this content was unclear or unhelpful",
          },
        });

        if (error) throw error;

        toast({
          title: "Content improved!",
          description: data?.changesSummary || "The lesson has been refined based on your feedback.",
        });

        // Dispatch event so the lesson re-renders
        window.dispatchEvent(new CustomEvent("course-generated", { detail: { className } }));
      }

      setSubmitted(true);
    } catch (error) {
      console.error("Feedback refinement error:", error);
      toast({
        title: "Feedback recorded",
        description: "Your feedback has been saved. Content will be improved soon.",
      });
      setSubmitted(true);
    } finally {
      setIsRefining(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-primary/5 border border-primary/20">
        <span className="text-xs text-primary font-medium">
          {vote === "up" ? "👍 Glad this was helpful!" : "🔧 Content is being refined based on your feedback"}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2 py-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Was this lesson helpful?</span>
        <Button
          variant={vote === "up" ? "default" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={() => handleVote("up")}
        >
          <ThumbsUp className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant={vote === "down" ? "destructive" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={() => handleVote("down")}
        >
          <ThumbsDown className="w-3.5 h-3.5" />
        </Button>
      </div>

      {showComment && (
        <div className="space-y-2 animate-in fade-in-0 slide-in-from-top-1 duration-200">
          <Textarea
            placeholder="What was unclear or could be improved? Your feedback will automatically refine this lesson..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="text-xs"
          />
          <Button
            size="sm"
            className="gap-1.5 text-xs"
            onClick={handleSubmitFeedback}
            disabled={isRefining}
          >
            {isRefining ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Refining content...
              </>
            ) : (
              <>
                <MessageSquare className="w-3 h-3" />
                Submit & Improve
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

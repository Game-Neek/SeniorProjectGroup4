import { useState, useCallback, useEffect } from "react";
import { MathText } from "@/components/MathText";
import {
  BookOpen, Lightbulb, ListChecks, PenTool, Target,
  ChevronRight, ChevronLeft, CheckCircle2, ArrowRight,
  ImageIcon, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface LessonRendererProps {
  content: string;
  moduleType?: string;
}

const sectionMeta: Record<string, { icon: typeof BookOpen; color: string; label: string }> = {
  "concept overview": { icon: BookOpen, color: "text-blue-500 bg-blue-500/10 border-blue-500/20", label: "Concept Overview" },
  "intuition": { icon: Lightbulb, color: "text-amber-500 bg-amber-500/10 border-amber-500/20", label: "Intuition" },
  "step-by-step": { icon: PenTool, color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", label: "Step-by-Step" },
  "key takeaways": { icon: ListChecks, color: "text-purple-500 bg-purple-500/10 border-purple-500/20", label: "Key Takeaways" },
  "preparation": { icon: Target, color: "text-rose-500 bg-rose-500/10 border-rose-500/20", label: "Preparation" },
  "worked example": { icon: PenTool, color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", label: "Worked Example" },
  "summary": { icon: ListChecks, color: "text-purple-500 bg-purple-500/10 border-purple-500/20", label: "Summary" },
};

const getSectionMatch = (heading: string): string => {
  const lower = heading.toLowerCase();
  for (const key of Object.keys(sectionMeta)) {
    if (lower.includes(key)) return key;
  }
  return "";
};

/** Embedded video */
const EmbeddedVideo = ({ url }: { url: string }) => {
  let embedUrl = url;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  if (ytMatch) embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-border aspect-video">
      <iframe src={embedUrl} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title="Lesson video" />
    </div>
  );
};

const extractVideos = (text: string): { cleanText: string; videos: string[] } => {
  const videoRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)[^\s)]+/g;
  const videos = text.match(videoRegex) || [];
  const cleanText = text.replace(videoRegex, "").trim();
  return { cleanText, videos };
};

/** AI-generated structure image component */
const StructureImage = ({ description }: { description: string }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const generateImage = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("generate-structure", {
        body: { description },
      });
      if (fnError) throw fnError;
      if (data?.imageUrl) {
        setImageUrl(data.imageUrl);
      } else {
        throw new Error("No image returned");
      }
    } catch (e) {
      console.error("Structure generation failed:", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [description]);

  if (imageUrl) {
    return (
      <div className="my-3 flex flex-col items-center">
        <div className="rounded-lg border border-border overflow-hidden bg-white shadow-sm max-w-md w-full">
          <img src={imageUrl} alt={description} className="w-full h-auto" />
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 text-center italic max-w-md">{description}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="my-3 flex flex-col items-center">
        <div className="rounded-lg border border-border bg-muted/30 p-8 flex flex-col items-center gap-2 max-w-md w-full">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Generating diagram…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="my-3 flex flex-col items-center">
      <button
        onClick={generateImage}
        className={cn(
          "rounded-lg border border-dashed p-6 flex flex-col items-center gap-2 max-w-md w-full transition-colors",
          error ? "border-destructive/50 bg-destructive/5" : "border-primary/30 bg-primary/5 hover:bg-primary/10"
        )}
      >
        <ImageIcon className={cn("w-8 h-8", error ? "text-destructive/50" : "text-primary/50")} />
        <p className="text-xs font-medium text-foreground">
          {error ? "Failed to generate — tap to retry" : "Tap to generate diagram"}
        </p>
        <p className="text-xs text-muted-foreground text-center max-w-xs">{description}</p>
      </button>
    </div>
  );
};

/** Detect if text looks like ASCII art (chemical structures, circuit diagrams, etc.) */
const isAsciiArt = (text: string): boolean => {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return false;
  const specialChars = (text.match(/[|\\\/\-=+#<>{}[\]]/g) || []).length;
  const ratio = specialChars / text.length;
  // High density of structural characters suggests ASCII art
  return ratio > 0.15 && lines.length >= 2;
};

/** Parse content into blocks including structure markers and code blocks */
const parseContentBlocks = (text: string) => {
  const blocks: { type: "paragraph" | "list" | "subheading" | "structure" | "codeblock"; items?: string[]; text?: string }[] = [];
  const lines = text.split("\n");
  let listItems: string[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push({ type: "list", items: [...listItems] });
    listItems = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Handle code blocks
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        // End of code block — check if it's ASCII art
        const content = codeBlockContent.join("\n");
        if (isAsciiArt(content)) {
          flushList();
          blocks.push({ type: "structure", text: content });
        } else {
          flushList();
          blocks.push({ type: "codeblock", text: content });
        }
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Handle [STRUCTURE: ...] markers
    const structureMatch = trimmed.match(/^\[STRUCTURE:\s*(.+?)\]$/);
    if (structureMatch) {
      flushList();
      blocks.push({ type: "structure", text: structureMatch[1] });
      continue;
    }

    if (!trimmed) { flushList(); continue; }

    const numberedMatch = trimmed.match(/^\d+[.)]\s+(.+)/);
    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)/);

    if (numberedMatch) {
      listItems.push(numberedMatch[1]);
    } else if (bulletMatch) {
      listItems.push(bulletMatch[1]);
    } else {
      flushList();
      const subHeadingMatch = trimmed.match(/^#{1,4}\s+(.+)/);
      if (subHeadingMatch) {
        blocks.push({ type: "subheading", text: subHeadingMatch[1] });
      } else {
        blocks.push({ type: "paragraph", text: trimmed });
      }
    }
  }

  // Handle unclosed code block
  if (inCodeBlock && codeBlockContent.length > 0) {
    const content = codeBlockContent.join("\n");
    if (isAsciiArt(content)) {
      blocks.push({ type: "structure", text: content });
    } else {
      blocks.push({ type: "codeblock", text: content });
    }
  }

  flushList();
  return blocks;
};

/** Render individual content blocks */
const ContentBlock = ({ block }: { block: ReturnType<typeof parseContentBlocks>[0] }) => {
  if (block.type === "structure") {
    return <StructureImage description={block.text!} />;
  }

  if (block.type === "codeblock") {
    return (
      <pre className="my-2 p-3 rounded-lg bg-muted/50 border border-border text-xs font-mono overflow-x-auto">
        <code>{block.text}</code>
      </pre>
    );
  }

  if (block.type === "subheading") {
    return (
      <p className="text-sm font-semibold text-foreground mt-3 mb-1">
        <MathText text={block.text!.replace(/\*\*/g, "")} />
      </p>
    );
  }

  if (block.type === "list") {
    return (
      <ul className="space-y-2 my-2">
        {block.items!.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-foreground/90 leading-relaxed group">
            <span className="mt-1.5 w-2 h-2 rounded-full bg-primary/40 flex-shrink-0 group-hover:bg-primary transition-colors" />
            <span><MathText text={item.replace(/\*\*/g, "")} /></span>
          </li>
        ))}
      </ul>
    );
  }

  const text = block.text || "";
  const isCallout = /^\*\*[^*]+\*\*:/.test(text) || /^(key|important|note|remember|tip):/i.test(text);

  if (isCallout) {
    return (
      <div className="my-2 p-3 rounded-lg border border-primary/20 bg-primary/5">
        <p className="text-sm text-foreground/90 leading-relaxed">
          <MathText text={text.replace(/\*\*/g, "")} />
        </p>
      </div>
    );
  }

  return (
    <p className="text-sm text-foreground/90 leading-relaxed">
      <MathText text={text.replace(/\*\*/g, "")} />
    </p>
  );
};

/** A single interactive lesson section */
const LessonSection = ({
  heading,
  body,
  sectionKey,
  stepNumber,
  totalSteps,
}: {
  heading: string;
  body: string;
  sectionKey: string;
  stepNumber: number;
  totalSteps: number;
}) => {
  const meta = sectionMeta[sectionKey] || { icon: BookOpen, color: "text-muted-foreground bg-muted/30 border-border", label: heading };
  const Icon = meta.icon;
  const { cleanText, videos } = extractVideos(body);
  const blocks = parseContentBlocks(cleanText);

  return (
    <div className="rounded-xl border border-primary/40 shadow-md bg-card transition-all duration-300">
      <div className="flex items-center gap-3 p-4 pb-2">
        <div className={cn("p-2 rounded-lg border", meta.color)}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">Step {stepNumber}/{totalSteps}</span>
          </div>
          <h4 className="text-sm font-semibold text-foreground truncate">{heading}</h4>
        </div>
        <Badge variant="outline" className="text-[10px] capitalize shrink-0 hidden sm:inline-flex">
          {meta.label}
        </Badge>
      </div>
      <div className="px-4 pb-4 space-y-2 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
        {videos.map((url, i) => <EmbeddedVideo key={i} url={url} />)}
        {blocks.map((block, i) => <ContentBlock key={i} block={block} />)}
      </div>
    </div>
  );
};

export const LessonRenderer = ({ content, moduleType }: LessonRendererProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const rawSections = content.split(/(?=^## )/m).filter(Boolean);

  if (rawSections.length <= 1) {
    const { cleanText, videos } = extractVideos(content);
    const blocks = parseContentBlocks(cleanText);
    return (
      <Card className="p-5 border-border space-y-2">
        {videos.map((url, i) => <EmbeddedVideo key={i} url={url} />)}
        {blocks.map((block, i) => <ContentBlock key={i} block={block} />)}
      </Card>
    );
  }

  const sections = rawSections.map((section) => {
    const lines = section.trim().split("\n");
    const headerLine = lines[0]?.replace(/^##\s*/, "").replace(/^\d+\.\s*/, "").trim() || "";
    const body = lines.slice(1).join("\n").trim();
    const matchKey = getSectionMatch(headerLine);
    return { heading: headerLine, body, matchKey };
  });

  const totalSteps = sections.length;
  const progressPercent = completedSteps.size > 0 ? Math.round((completedSteps.size / totalSteps) * 100) : 0;

  const goNext = () => {
    setCompletedSteps(prev => new Set(prev).add(currentStep));
    if (currentStep < totalSteps - 1) setCurrentStep(currentStep + 1);
  };

  const goPrev = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Progress value={progressPercent} className="h-1.5 flex-1" />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {completedSteps.size}/{totalSteps} sections
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {sections.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentStep(idx)}
            className={cn(
              "w-7 h-7 rounded-full text-xs font-medium transition-all flex items-center justify-center",
              idx === currentStep
                ? "bg-primary text-primary-foreground shadow-sm"
                : completedSteps.has(idx)
                ? "bg-primary/20 text-primary"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {completedSteps.has(idx) ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
          </button>
        ))}
      </div>

      <LessonSection
        heading={sections[currentStep].heading}
        body={sections[currentStep].body}
        sectionKey={sections[currentStep].matchKey}
        stepNumber={currentStep + 1}
        totalSteps={totalSteps}
      />

      <div className="flex items-center justify-between pt-1">
        <Button variant="outline" size="sm" onClick={goPrev} disabled={currentStep === 0} className="gap-1.5 text-xs">
          <ChevronLeft className="w-3.5 h-3.5" /> Previous
        </Button>
        {currentStep < totalSteps - 1 ? (
          <Button size="sm" onClick={goNext} className="gap-1.5 text-xs">
            Continue <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => setCompletedSteps(prev => new Set(prev).add(currentStep))}
            className="gap-1.5 text-xs"
            variant={completedSteps.has(currentStep) ? "outline" : "default"}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {completedSteps.has(currentStep) ? "Completed" : "Finish Lesson"}
          </Button>
        )}
      </div>
    </div>
  );
};

import { useState } from "react";
import { MathText } from "@/components/MathText";
import { BookOpen, Lightbulb, ListChecks, PenTool, Target, ChevronDown, ChevronUp, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface LessonRendererProps {
  content: string;
  moduleType?: string;
}

const sectionIcons: Record<string, typeof BookOpen> = {
  "concept overview": BookOpen,
  "intuition": Lightbulb,
  "step-by-step": PenTool,
  "key takeaways": ListChecks,
  "preparation": Target,
};

const sectionColors: Record<string, string> = {
  "concept overview": "border-l-blue-500 bg-blue-500/5",
  "intuition": "border-l-amber-500 bg-amber-500/5",
  "step-by-step": "border-l-emerald-500 bg-emerald-500/5",
  "key takeaways": "border-l-purple-500 bg-purple-500/5",
  "preparation": "border-l-rose-500 bg-rose-500/5",
};

const getSectionMatch = (heading: string): string => {
  const lower = heading.toLowerCase();
  for (const key of Object.keys(sectionIcons)) {
    if (lower.includes(key)) return key;
  }
  return "";
};

/** Render a markdown-ish body into clean paragraphs, lists, and bold spans */
const RichBody = ({ text }: { text: string }) => {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listKey = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    elements.push(
      <ul key={`list-${listKey++}`} className="space-y-1.5 my-2">
        {listItems.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-foreground/90 leading-relaxed">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/50 flex-shrink-0" />
            <span><MathText text={item} /></span>
          </li>
        ))}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }

    // Numbered list: 1. or 1)
    const numberedMatch = trimmed.match(/^\d+[.)]\s+(.+)/);
    // Bullet list: - or * or •
    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)/);

    if (numberedMatch) {
      listItems.push(numberedMatch[1]);
    } else if (bulletMatch) {
      listItems.push(bulletMatch[1]);
    } else {
      flushList();
      // Bold heading line (### or **text**)
      const subHeadingMatch = trimmed.match(/^###\s+(.+)/);
      if (subHeadingMatch) {
        elements.push(
          <p key={idx} className="text-sm font-semibold text-foreground mt-3 mb-1">
            <MathText text={subHeadingMatch[1]} />
          </p>
        );
      } else {
        elements.push(
          <p key={idx} className="text-sm text-foreground/90 leading-relaxed">
            <MathText text={trimmed} />
          </p>
        );
      }
    }
  });
  flushList();

  return <div className="space-y-1">{elements}</div>;
};

/** Detect embedded video URLs and render them */
const EmbeddedVideo = ({ url }: { url: string }) => {
  // Convert YouTube watch URLs to embed
  let embedUrl = url;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  if (ytMatch) {
    embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
  }

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-border aspect-video">
      <iframe
        src={embedUrl}
        className="w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title="Lesson video"
      />
    </div>
  );
};

const extractVideos = (text: string): { cleanText: string; videos: string[] } => {
  const videoRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)[^\s)]+/g;
  const videos = text.match(videoRegex) || [];
  const cleanText = text.replace(videoRegex, "").trim();
  return { cleanText, videos };
};

export const LessonRenderer = ({ content, moduleType }: LessonRendererProps) => {
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());

  // Split content into sections by ## headers
  const sections = content.split(/(?=^## )/m).filter(Boolean);

  const toggleSection = (idx: number) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (sections.length <= 1) {
    const { cleanText, videos } = extractVideos(content);
    return (
      <div className="space-y-3">
        {videos.map((url, i) => <EmbeddedVideo key={i} url={url} />)}
        <RichBody text={cleanText} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sections.map((section, idx) => {
        const lines = section.trim().split("\n");
        const headerLine = lines[0]?.replace(/^##\s*/, "").replace(/^\d+\.\s*/, "").trim() || "";
        const body = lines.slice(1).join("\n").trim();
        const matchKey = getSectionMatch(headerLine);
        const Icon = matchKey ? sectionIcons[matchKey] : BookOpen;
        const colorClass = matchKey ? sectionColors[matchKey] : "border-l-muted-foreground/30 bg-muted/20";
        const isCollapsed = collapsedSections.has(idx);
        const { cleanText, videos } = extractVideos(body);

        return (
          <div
            key={idx}
            className={cn(
              "rounded-lg border border-border border-l-4 overflow-hidden transition-all",
              colorClass
            )}
          >
            <button
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
              onClick={() => toggleSection(idx)}
            >
              <div className="p-1.5 rounded-md bg-background/80 shadow-sm">
                <Icon className="w-4 h-4 text-foreground/70" />
              </div>
              <h3 className="text-sm font-semibold text-foreground flex-1">{headerLine}</h3>
              {matchKey && (
                <Badge variant="outline" className="text-xs capitalize hidden sm:inline-flex">
                  {matchKey}
                </Badge>
              )}
              {isCollapsed ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}
            </button>
            {!isCollapsed && (
              <div className="px-4 pb-4 pt-0">
                {videos.map((url, i) => <EmbeddedVideo key={i} url={url} />)}
                <RichBody text={cleanText} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

import { useRef, useCallback, useMemo } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReadAloudPlayer } from "@/components/ReadAloudPlayer";
import { ReadAloudContent } from "@/components/ReadAloudContent";
import { useReadAloud } from "@/hooks/useReadAloud";

interface DashboardReadAloudProps {
  isActive: boolean;
  onToggle: () => void;
  contentRef: React.RefObject<HTMLElement>;
}

function extractTextFromElement(el: HTMLElement | null): string {
  if (!el) return "";
  // Grab all visible text from the main content area
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName;
      // Skip script/style/hidden
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return NodeFilter.FILTER_REJECT;
      if (parent.hidden || parent.getAttribute("aria-hidden") === "true") return NodeFilter.FILTER_REJECT;
      const text = node.textContent?.trim();
      if (!text || text.length < 2) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const parts: string[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent?.trim();
    if (text) parts.push(text);
  }
  // Join and form readable text
  return parts.join(". ").replace(/\.{2,}/g, ".").replace(/\.\s*\./g, ".");
}

export function DashboardReadAloud({ isActive, onToggle, contentRef }: DashboardReadAloudProps) {
  const pageText = useMemo(() => {
    if (!isActive) return "";
    return extractTextFromElement(contentRef.current);
  }, [isActive, contentRef]);

  const readAloud = useReadAloud(pageText || "No content available to read.");

  const handleToggle = useCallback(() => {
    if (isActive) {
      readAloud.stop();
    }
    onToggle();
  }, [isActive, readAloud, onToggle]);

  return (
    <>
      {/* Header button */}
      <Button
        variant={isActive ? "default" : "outline"}
        onClick={handleToggle}
        aria-label={isActive ? "Stop listening" : "Listen to this page"}
        aria-pressed={isActive}
      >
        {isActive ? (
          <VolumeX className="mr-2 h-4 w-4" />
        ) : (
          <Volume2 className="mr-2 h-4 w-4" />
        )}
        {isActive ? "Stop Listening" : "Listen"}
      </Button>

      {/* Sticky bottom player - z-40 to stay below Sonner toasts (z-[9999]) */}
      {isActive && (
        <div className="fixed bottom-0 left-0 right-0 z-40">
          <ReadAloudPlayer
            isPlaying={readAloud.isPlaying}
            isPaused={readAloud.isPaused}
            progress={readAloud.progress}
            rate={readAloud.rate}
            voice={readAloud.voice}
            availableVoices={readAloud.availableVoices}
            currentSentenceIndex={readAloud.currentSentenceIndex}
            totalSentences={readAloud.sentences.length}
            onTogglePlayPause={readAloud.togglePlayPause}
            onStop={() => {
              readAloud.stop();
              onToggle();
            }}
            onSkipForward={readAloud.skipForward}
            onSkipBackward={readAloud.skipBackward}
            onSeekProgress={readAloud.seekToProgress}
            onRateChange={readAloud.setRate}
            onVoiceChange={readAloud.setVoice}
          />
        </div>
      )}
    </>
  );
}

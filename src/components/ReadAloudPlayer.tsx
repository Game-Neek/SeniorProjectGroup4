import { useEffect, useRef } from "react";
import {
  Play,
  Pause,
  Square,
  SkipForward,
  SkipBack,
  Volume2,
  Settings,
  Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ReadAloudPlayerProps {
  isPlaying: boolean;
  isPaused: boolean;
  progress: number;
  rate: number;
  voice: SpeechSynthesisVoice | null;
  availableVoices: SpeechSynthesisVoice[];
  currentSentenceIndex: number;
  totalSentences: number;
  onTogglePlayPause: () => void;
  onStop: () => void;
  onSkipForward: () => void;
  onSkipBackward: () => void;
  onSeekProgress: (pct: number) => void;
  onRateChange: (rate: number) => void;
  onVoiceChange: (voice: SpeechSynthesisVoice) => void;
}

const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function ReadAloudPlayer({
  isPlaying,
  isPaused,
  progress,
  rate,
  voice,
  availableVoices,
  currentSentenceIndex,
  totalSentences,
  onTogglePlayPause,
  onStop,
  onSkipForward,
  onSkipBackward,
  onSeekProgress,
  onRateChange,
  onVoiceChange,
}: ReadAloudPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!containerRef.current?.contains(document.activeElement) && document.activeElement !== containerRef.current) return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          onTogglePlayPause();
          break;
        case "ArrowRight":
          e.preventDefault();
          onSkipForward();
          break;
        case "ArrowLeft":
          e.preventDefault();
          onSkipBackward();
          break;
        case "Escape":
          e.preventDefault();
          onStop();
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onTogglePlayPause, onSkipForward, onSkipBackward, onStop]);

  const englishVoices = availableVoices.filter((v) => v.lang.startsWith("en"));
  const displayVoices = englishVoices.length > 0 ? englishVoices : availableVoices;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label="Read Aloud Player"
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50",
        "border-t bg-card/95 backdrop-blur-lg shadow-[var(--shadow-elevated)]",
        "transition-transform duration-300",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      {/* Progress slider */}
      <div className="px-4 pt-2">
        <Slider
          value={[progress]}
          max={100}
          step={0.5}
          onValueChange={([val]) => onSeekProgress(val)}
          className="cursor-pointer"
          aria-label="Reading progress"
        />
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-3">
        {/* Left: Status */}
        <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
          {/* Animated equalizer indicator */}
          <div className="flex items-end gap-0.5 h-4 w-5" aria-hidden="true">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  "w-1 rounded-full bg-primary transition-all",
                  isPlaying && !isPaused
                    ? "animate-pulse"
                    : "h-1"
                )}
                style={
                  isPlaying && !isPaused
                    ? {
                        height: `${8 + Math.random() * 8}px`,
                        animationDelay: `${i * 0.15}s`,
                        animationDuration: `${0.4 + i * 0.1}s`,
                      }
                    : { height: "4px" }
                }
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {isPlaying
              ? `${currentSentenceIndex + 1} / ${totalSentences}`
              : "Ready"}
          </span>
        </div>

        {/* Center: Transport controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onSkipBackward}
            aria-label="Skip backward"
            className="h-9 w-9"
          >
            <SkipBack className="h-4 w-4" />
          </Button>

          <Button
            variant="default"
            size="icon"
            onClick={onTogglePlayPause}
            aria-label={isPlaying && !isPaused ? "Pause" : "Play"}
            className="h-10 w-10 rounded-full"
          >
            {isPlaying && !isPaused ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5 ml-0.5" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onStop}
            aria-label="Stop"
            className="h-9 w-9"
          >
            <Square className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onSkipForward}
            aria-label="Skip forward"
            className="h-9 w-9"
          >
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>

        {/* Right: Settings */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Speed */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs h-8"
                aria-label={`Playback speed: ${rate}x`}
              >
                <Gauge className="h-3.5 w-3.5" />
                {rate}x
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-3" align="end">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Playback Speed
              </p>
              <div className="grid grid-cols-4 gap-1">
                {RATE_OPTIONS.map((r) => (
                  <Button
                    key={r}
                    variant={rate === r ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => onRateChange(r)}
                  >
                    {r}x
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Voice */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs h-8"
                aria-label="Voice settings"
              >
                <Volume2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline max-w-[80px] truncate">
                  {voice?.name.split(" ")[0] || "Voice"}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Select Voice
              </p>
              <Select
                value={voice?.name || ""}
                onValueChange={(name) => {
                  const v = availableVoices.find((v) => v.name === name);
                  if (v) onVoiceChange(v);
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Choose voice" />
                </SelectTrigger>
                <SelectContent>
                  {displayVoices.map((v) => (
                    <SelectItem key={v.name} value={v.name} className="text-xs">
                      {v.name} ({v.lang})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PopoverContent>
          </Popover>

          {/* Keyboard hint */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Keyboard shortcuts"
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" align="end">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Keyboard Shortcuts
              </p>
              <div className="space-y-1.5 text-xs">
                {[
                  ["Space", "Play / Pause"],
                  ["←", "Previous sentence"],
                  ["→", "Next sentence"],
                  ["Esc", "Stop"],
                ].map(([key, desc]) => (
                  <div key={key} className="flex justify-between">
                    <kbd className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono text-[10px]">
                      {key}
                    </kbd>
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}

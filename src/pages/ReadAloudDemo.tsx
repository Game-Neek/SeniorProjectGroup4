import { useReadAloud } from "@/hooks/useReadAloud";
import { ReadAloudPlayer } from "@/components/ReadAloudPlayer";
import { ReadAloudContent } from "@/components/ReadAloudContent";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Headphones, MousePointerClick } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const SAMPLE_TEXT = `The process of photosynthesis is fundamental to life on Earth. It occurs primarily in the chloroplasts of plant cells, where light energy is converted into chemical energy. The light-dependent reactions take place in the thylakoid membranes. Water molecules are split during this phase, releasing oxygen as a byproduct. The Calvin cycle, also known as the light-independent reactions, occurs in the stroma. Carbon dioxide is fixed into organic molecules during this stage. The enzyme RuBisCO plays a critical role in carbon fixation. Glucose produced through photosynthesis serves as the primary energy source for plants. This sugar can be converted into starch for long-term storage. The rate of photosynthesis is influenced by light intensity, temperature, and carbon dioxide concentration. Understanding photosynthesis is essential for fields ranging from agriculture to renewable energy research. Scientists continue to study ways to enhance photosynthetic efficiency to address global food and energy challenges.`;

export default function ReadAloudDemo() {
  const navigate = useNavigate();
  const readAloud = useReadAloud(SAMPLE_TEXT);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Headphones className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                Read Aloud
              </h1>
              <p className="text-xs text-muted-foreground">
                Auditory Navigation Framework
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Modality guide cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              icon: Headphones,
              title: "Listen",
              desc: "Press play to hear the content read aloud. Adjust speed & voice.",
              color: "text-primary",
            },
            {
              icon: BookOpen,
              title: "Follow Along",
              desc: "Words and sentences highlight as they're spoken.",
              color: "text-secondary",
            },
            {
              icon: MousePointerClick,
              title: "Interact",
              desc: "Click any sentence to jump there. Drag the progress bar to scrub.",
              color: "text-accent",
            },
          ].map(({ icon: Icon, title, desc, color }) => (
            <Card key={title} className="border-none shadow-[var(--shadow-soft)]">
              <CardContent className="p-4 flex items-start gap-3">
                <Icon className={`h-5 w-5 mt-0.5 ${color} flex-shrink-0`} />
                <div>
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Content area */}
        <Card className="shadow-[var(--shadow-medium)]">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              Photosynthesis — Biology 101
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ReadAloudContent
              sentences={readAloud.sentences}
              currentSentenceIndex={readAloud.currentSentenceIndex}
              currentWordIndex={readAloud.currentWordIndex}
              isPlaying={readAloud.isPlaying}
              onClickSentence={readAloud.seekToSentence}
            />
          </CardContent>
        </Card>
      </main>

      {/* Bottom player */}
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
        onStop={readAloud.stop}
        onSkipForward={readAloud.skipForward}
        onSkipBackward={readAloud.skipBackward}
        onSeekProgress={readAloud.seekToProgress}
        onRateChange={readAloud.setRate}
        onVoiceChange={readAloud.setVoice}
      />
    </div>
  );
}

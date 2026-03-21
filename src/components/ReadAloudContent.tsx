import { cn } from "@/lib/utils";

interface ReadAloudContentProps {
  sentences: string[];
  currentSentenceIndex: number;
  currentWordIndex: number;
  isPlaying: boolean;
  onClickSentence: (index: number) => void;
}

export function ReadAloudContent({
  sentences,
  currentSentenceIndex,
  currentWordIndex,
  isPlaying,
  onClickSentence,
}: ReadAloudContentProps) {
  return (
    <div className="prose prose-lg max-w-none dark:prose-invert leading-relaxed">
      {sentences.map((sentence, sIdx) => {
        const isCurrent = sIdx === currentSentenceIndex && isPlaying;
        const isPast = sIdx < currentSentenceIndex && isPlaying;

        if (isCurrent) {
          // Render word-level highlighting for current sentence
          const words = sentence.split(/(\s+)/);
          let wordCount = 0;

          return (
            <span
              key={sIdx}
              className={cn(
                "inline cursor-pointer rounded-sm transition-colors duration-200",
                "bg-primary/10 dark:bg-primary/20"
              )}
              onClick={() => onClickSentence(sIdx)}
              role="button"
              tabIndex={0}
              aria-current="true"
              aria-label={`Currently reading: ${sentence}`}
            >
              {words.map((token, tIdx) => {
                if (/^\s+$/.test(token)) {
                  return <span key={tIdx}>{token}</span>;
                }
                const thisWordIdx = wordCount;
                wordCount++;
                const isActiveWord = thisWordIdx === currentWordIndex;
                return (
                  <span
                    key={tIdx}
                    className={cn(
                      "transition-all duration-150 rounded-sm px-[1px]",
                      isActiveWord &&
                        "bg-primary text-primary-foreground font-medium"
                    )}
                  >
                    {token}
                  </span>
                );
              })}
              {" "}
            </span>
          );
        }

        return (
          <span
            key={sIdx}
            className={cn(
              "inline cursor-pointer rounded-sm transition-colors duration-200",
              "hover:bg-muted/60",
              isPast && "text-muted-foreground"
            )}
            onClick={() => onClickSentence(sIdx)}
            role="button"
            tabIndex={0}
            aria-label={`Click to read from: ${sentence.substring(0, 40)}...`}
          >
            {sentence}{" "}
          </span>
        );
      })}
    </div>
  );
}

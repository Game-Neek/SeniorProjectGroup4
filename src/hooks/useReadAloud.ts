import { useState, useEffect, useRef, useCallback } from "react";

export interface ReadAloudState {
  isPlaying: boolean;
  isPaused: boolean;
  currentSentenceIndex: number;
  currentWordIndex: number;
  progress: number;
  rate: number;
  voice: SpeechSynthesisVoice | null;
  availableVoices: SpeechSynthesisVoice[];
  sentences: string[];
}

export function useReadAloud(text: string) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(-1);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [rate, setRate] = useState(1);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const sentencesRef = useRef<string[]>([]);
  const queueIndexRef = useRef(0);
  const isStoppedRef = useRef(false);

  // Split text into sentences
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  sentencesRef.current = sentences;

  // Load voices
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setAvailableVoices(voices);
        if (!voice) {
          const english = voices.find((v) => v.lang.startsWith("en"));
          setVoice(english || voices[0]);
        }
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const speakSentence = useCallback(
    (index: number) => {
      if (index >= sentencesRef.current.length) {
        setIsPlaying(false);
        setIsPaused(false);
        setCurrentSentenceIndex(-1);
        setCurrentWordIndex(-1);
        setProgress(100);
        return;
      }

      if (isStoppedRef.current) return;

      const utterance = new SpeechSynthesisUtterance(sentencesRef.current[index]);
      utterance.rate = rate;
      if (voice) utterance.voice = voice;

      utterance.onstart = () => {
        setCurrentSentenceIndex(index);
        setCurrentWordIndex(0);
        queueIndexRef.current = index;
        const pct = ((index) / sentencesRef.current.length) * 100;
        setProgress(pct);
      };

      utterance.onboundary = (e) => {
        if (e.name === "word") {
          const spoken = sentencesRef.current[index].substring(0, e.charIndex);
          const wordIdx = spoken.split(/\s+/).filter(Boolean).length;
          setCurrentWordIndex(wordIdx);
          // Fine-grained progress
          const sentenceProgress = e.charIndex / sentencesRef.current[index].length;
          const pct = ((index + sentenceProgress) / sentencesRef.current.length) * 100;
          setProgress(pct);
        }
      };

      utterance.onend = () => {
        if (!isStoppedRef.current) {
          speakSentence(index + 1);
        }
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [rate, voice]
  );

  const play = useCallback(
    (fromIndex?: number) => {
      window.speechSynthesis.cancel();
      isStoppedRef.current = false;
      setIsPlaying(true);
      setIsPaused(false);
      const startIdx = fromIndex !== undefined ? fromIndex : 0;
      speakSentence(startIdx);
    },
    [speakSentence]
  );

  const pause = useCallback(() => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, []);

  const resume = useCallback(() => {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  }, []);

  const stop = useCallback(() => {
    isStoppedRef.current = true;
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentSentenceIndex(-1);
    setCurrentWordIndex(-1);
    setProgress(0);
  }, []);

  const togglePlayPause = useCallback(() => {
    if (!isPlaying) {
      play();
    } else if (isPaused) {
      resume();
    } else {
      pause();
    }
  }, [isPlaying, isPaused, play, pause, resume]);

  const skipForward = useCallback(() => {
    const nextIdx = Math.min(currentSentenceIndex + 1, sentences.length - 1);
    play(nextIdx);
  }, [currentSentenceIndex, sentences.length, play]);

  const skipBackward = useCallback(() => {
    const prevIdx = Math.max(currentSentenceIndex - 1, 0);
    play(prevIdx);
  }, [currentSentenceIndex, play]);

  const seekToSentence = useCallback(
    (index: number) => {
      if (index >= 0 && index < sentences.length) {
        play(index);
      }
    },
    [sentences.length, play]
  );

  const seekToProgress = useCallback(
    (pct: number) => {
      const idx = Math.floor((pct / 100) * sentences.length);
      const clampedIdx = Math.min(Math.max(idx, 0), sentences.length - 1);
      play(clampedIdx);
    },
    [sentences.length, play]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isStoppedRef.current = true;
      window.speechSynthesis.cancel();
    };
  }, []);

  return {
    isPlaying,
    isPaused,
    currentSentenceIndex,
    currentWordIndex,
    progress,
    rate,
    setRate,
    voice,
    setVoice,
    availableVoices,
    sentences,
    play,
    pause,
    resume,
    stop,
    togglePlayPause,
    skipForward,
    skipBackward,
    seekToSentence,
    seekToProgress,
  };
}

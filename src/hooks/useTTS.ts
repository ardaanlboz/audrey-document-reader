"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { KokoroTTS as KokoroTTSInstance } from "kokoro-js";

type PlaybackEngine = "kokoro" | "system";
type KokoroVoiceMap = KokoroTTSInstance["voices"];
type KokoroVoiceId = keyof KokoroVoiceMap;

export interface VoiceOption {
  id: string;
  name: string;
  lang: string;
  source: PlaybackEngine;
  quality?: string;
}

export interface TTSState {
  isPlaying: boolean;
  isPaused: boolean;
  progress: number;
  rate: number;
  elapsedTime: number;
  totalEstimatedTime: number;
  currentPageIndex: number;
  totalPages: number;
  totalWords: number;
  engine: PlaybackEngine;
  isEngineLoading: boolean;
  engineMessage: string | null;
  availableVoices: VoiceOption[];
  selectedVoiceId: string | null;
}

export interface WordChangeEvent {
  pageIndex: number;
  wordIndex: number;
  sentenceRange: [number, number] | null;
}

export type WordChangeCallback = (event: WordChangeEvent) => void;

export interface TTSControls {
  play: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  skipForward: () => void;
  skipBackward: () => void;
  setRate: (rate: number) => void;
  setVoice: (voiceId: string) => void;
  seekToPageWord: (pageIndex: number, wordIndex: number) => void;
  seekToProgress: (progress: number) => void;
  goToPage: (pageIndex: number) => void;
  onWordChange: (cb: WordChangeCallback) => void;
}

interface WordInfo {
  word: string;
  start: number;
  end: number;
  sentenceIndex: number;
}

interface SentenceInfo {
  text: string;
  start: number;
  end: number;
  wordStartIndex: number;
  wordEndIndex: number;
}

interface PageInfo {
  words: WordInfo[];
  sentences: SentenceInfo[];
  wordOffset: number;
}

interface PlaybackLocation {
  pageIndex: number;
  sentenceIndex: number;
}

interface KokoroRuntime {
  instance: KokoroTTSInstance;
  voices: VoiceOption[];
}

interface KokoroSentencePlayback {
  location: PlaybackLocation;
  sentence: SentenceInfo;
  duration: number;
  checkpoints: KokoroWordCheckpoint[];
}

interface KokoroWordCheckpoint {
  wordIndex: number;
  endRatio: number;
}

const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const KOKORO_DEFAULT_VOICE: KokoroVoiceId = "af_heart";
const KOKORO_FALLBACK_MESSAGE =
  "Kokoro could not start. Using your browser voice instead.";

const DEFAULT_KOKORO_VOICES: VoiceOption[] = [
  {
    id: "af_heart",
    name: "Heart",
    lang: "en-US",
    source: "kokoro",
    quality: "A",
  },
  {
    id: "af_bella",
    name: "Bella",
    lang: "en-US",
    source: "kokoro",
    quality: "A-",
  },
  {
    id: "af_nicole",
    name: "Nicole",
    lang: "en-US",
    source: "kokoro",
    quality: "B-",
  },
  {
    id: "bf_emma",
    name: "Emma",
    lang: "en-GB",
    source: "kokoro",
    quality: "B-",
  },
  {
    id: "bm_fable",
    name: "Fable",
    lang: "en-GB",
    source: "kokoro",
    quality: "C",
  },
  {
    id: "am_michael",
    name: "Michael",
    lang: "en-US",
    source: "kokoro",
    quality: "C+",
  },
];

const GRADE_SCORES: Record<string, number> = {
  "A+": 12,
  A: 11,
  "A-": 10,
  "B+": 9,
  B: 8,
  "B-": 7,
  "C+": 6,
  C: 5,
  "C-": 4,
  "D+": 3,
  D: 2,
  "D-": 1,
  "F+": 0,
  F: -1,
};

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function parseTextIntoWords(text: string): WordInfo[] {
  const words: WordInfo[] = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    words.push({
      word: match[0],
      start: match.index,
      end: match.index + match[0].length,
      sentenceIndex: 0,
    });
  }

  return words;
}

function getSentenceSegments(
  text: string
): Array<{ text: string; start: number; end: number }> {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, {
      granularity: "sentence",
    });

    return Array.from(segmenter.segment(text))
      .map(({ segment, index }) => ({
        text: segment.trim(),
        start: index,
        end: index + segment.length,
      }))
      .filter((segment) => segment.text);
  }

  const sentenceRegex = /[^.!?\n]+[.!?]*[\s]*/g;
  const sentences: Array<{ text: string; start: number; end: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = sentenceRegex.exec(text)) !== null) {
    const trimmed = match[0].trim();
    if (!trimmed) continue;
    sentences.push({
      text: trimmed,
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return sentences;
}

function parseTextIntoSentences(text: string, words: WordInfo[]): SentenceInfo[] {
  const sentenceSegments = getSentenceSegments(text);

  if (sentenceSegments.length === 0) {
    if (!text.trim() || words.length === 0) return [];

    words.forEach((word) => {
      word.sentenceIndex = 0;
    });

    return [
      {
        text: text.trim(),
        start: 0,
        end: text.length,
        wordStartIndex: 0,
        wordEndIndex: words.length - 1,
      },
    ];
  }

  const sentences: SentenceInfo[] = [];
  let wordCursor = 0;

  sentenceSegments.forEach((segment, sentenceIndex) => {
    while (
      wordCursor < words.length &&
      words[wordCursor].start < segment.start
    ) {
      wordCursor++;
    }

    const wordStartIndex = wordCursor;

    while (
      wordCursor < words.length &&
      words[wordCursor].start < segment.end
    ) {
      words[wordCursor].sentenceIndex = sentenceIndex;
      wordCursor++;
    }

    if (wordStartIndex < wordCursor) {
      sentences.push({
        text: segment.text,
        start: segment.start,
        end: segment.end,
        wordStartIndex,
        wordEndIndex: wordCursor - 1,
      });
    }
  });

  return sentences;
}

function buildPagesInfo(pages: string[]): { pages: PageInfo[]; totalWords: number } {
  let wordOffset = 0;

  const pageInfo = pages.map((text) => {
    const words = parseTextIntoWords(text);
    const sentences = parseTextIntoSentences(text, words);
    const info: PageInfo = {
      words,
      sentences,
      wordOffset,
    };

    wordOffset += words.length;
    return info;
  });

  return { pages: pageInfo, totalWords: wordOffset };
}

function findForwardLocation(
  pages: PageInfo[],
  pageIndex: number,
  sentenceIndex: number
): PlaybackLocation | null {
  for (let pageCursor = pageIndex; pageCursor < pages.length; pageCursor++) {
    const sentences = pages[pageCursor]?.sentences ?? [];
    if (sentences.length === 0) continue;

    const nextSentenceIndex = pageCursor === pageIndex ? sentenceIndex : 0;
    if (nextSentenceIndex < sentences.length) {
      return { pageIndex: pageCursor, sentenceIndex: nextSentenceIndex };
    }
  }

  return null;
}

function findBackwardLocation(
  pages: PageInfo[],
  pageIndex: number,
  sentenceIndex: number
): PlaybackLocation | null {
  for (let pageCursor = pageIndex; pageCursor >= 0; pageCursor--) {
    const sentences = pages[pageCursor]?.sentences ?? [];
    if (sentences.length === 0) continue;

    const nextSentenceIndex =
      pageCursor === pageIndex
        ? Math.min(sentenceIndex, sentences.length - 1)
        : sentences.length - 1;

    if (nextSentenceIndex >= 0) {
      return { pageIndex: pageCursor, sentenceIndex: nextSentenceIndex };
    }
  }

  return null;
}

function findFirstReadableLocation(pages: PageInfo[]): PlaybackLocation | null {
  return findForwardLocation(pages, 0, 0);
}

function findPageWordByAbsoluteIndex(
  pages: PageInfo[],
  absoluteWordIndex: number
): { pageIndex: number; wordIndex: number } | null {
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];
    if (absoluteWordIndex < page.wordOffset + page.words.length) {
      return {
        pageIndex,
        wordIndex: absoluteWordIndex - page.wordOffset,
      };
    }
  }

  for (let pageIndex = pages.length - 1; pageIndex >= 0; pageIndex--) {
    const page = pages[pageIndex];
    if (page.words.length > 0) {
      return {
        pageIndex,
        wordIndex: page.words.length - 1,
      };
    }
  }

  return null;
}

function getWordIndexForBoundary(
  page: PageInfo,
  sentence: SentenceInfo,
  charIndex: number
): number {
  const absoluteCharIndex = sentence.start + charIndex;
  let wordIndex = sentence.wordStartIndex;

  for (
    let candidate = sentence.wordStartIndex;
    candidate <= sentence.wordEndIndex;
    candidate++
  ) {
    const word = page.words[candidate];
    if (!word) continue;

    if (word.start <= absoluteCharIndex && absoluteCharIndex < word.end) {
      return candidate;
    }

    if (word.start > absoluteCharIndex) {
      return Math.max(sentence.wordStartIndex, candidate - 1);
    }

    wordIndex = candidate;
  }

  return wordIndex;
}

function mapKokoroVoices(voices: KokoroVoiceMap): VoiceOption[] {
  return Object.entries(voices)
    .filter(([, metadata]) => metadata.language.startsWith("en"))
    .sort(([, left], [, right]) => {
      const scoreDiff =
        (GRADE_SCORES[right.overallGrade] ?? -100) -
        (GRADE_SCORES[left.overallGrade] ?? -100);
      if (scoreDiff !== 0) return scoreDiff;
      return left.name.localeCompare(right.name);
    })
    .map(([id, metadata]) => ({
      id,
      name: metadata.name,
      lang: metadata.language === "en-us" ? "en-US" : "en-GB",
      source: "kokoro" as const,
      quality: metadata.overallGrade,
    }));
}

function getSystemVoiceScore(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  let score = 0;

  if (voice.lang.startsWith("en")) score += 100;
  if (name.includes("natural")) score += 40;
  if (name.includes("enhanced")) score += 30;
  if (name.includes("neural")) score += 30;
  if (name.includes("premium")) score += 25;
  if (name.includes("samantha")) score += 20;
  if (name.includes("google")) score += 18;
  if (name.includes("microsoft")) score += 18;
  if (name.includes("siri")) score += 15;
  if (!voice.localService) score += 5;

  return score;
}

function mapSystemVoices(voices: SpeechSynthesisVoice[]): VoiceOption[] {
  const englishVoices = voices.filter((voice) => voice.lang.startsWith("en"));
  const ordered = (englishVoices.length > 0 ? englishVoices : voices).toSorted(
    (left, right) => getSystemVoiceScore(right) - getSystemVoiceScore(left)
  );

  return ordered.map((voice) => ({
    id: voice.voiceURI,
    name: voice.name,
    lang: voice.lang,
    source: "system",
  }));
}

function selectPreferredSystemVoice(
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  const ordered = voices.toSorted(
    (left, right) => getSystemVoiceScore(right) - getSystemVoiceScore(left)
  );
  return ordered[0] ?? null;
}

function getRawAudioDurationSeconds(audio: {
  audio?: Float32Array;
  data?: Float32Array;
  sampling_rate?: number;
}): number {
  const samples = audio.audio ?? audio.data ?? new Float32Array();
  const samplingRate = audio.sampling_rate ?? 24000;
  return samples.length > 0 ? samples.length / samplingRate : 0;
}

function estimateSyllables(word: string): number {
  const normalized = word
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/i, "")
    .replace(/^y/, "");

  if (!normalized) return 1;

  const groups = normalized.match(/[aeiouy]{1,2}/g);
  return Math.max(groups?.length ?? 0, 1);
}

function estimateKokoroWordWeight(token: string): number {
  const normalized = token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
  const lettersOnly = normalized.replace(/[^A-Za-z]/g, "");
  const digitsOnly = normalized.replace(/\D/g, "");

  let weight = 0.9;

  if (lettersOnly) {
    weight += estimateSyllables(lettersOnly) * 0.8;
    weight += Math.min(lettersOnly.length, 14) * 0.035;
  }

  if (digitsOnly) {
    weight += 0.7 + Math.min(digitsOnly.length, 10) * 0.08;
  }

  if (/^[A-Z0-9]{2,}$/.test(normalized)) {
    weight += Math.min(normalized.length, 6) * 0.12;
  }

  if (/[,;:]/.test(token)) {
    weight += 0.45;
  }

  if (/[—–-]/.test(token)) {
    weight += 0.3;
  }

  if (/[.!?]/.test(token)) {
    weight += 0.85;
  }

  if (/["'”’)\]]$/.test(token)) {
    weight += 0.08;
  }

  return weight;
}

function buildKokoroWordCheckpoints(
  page: PageInfo,
  sentence: SentenceInfo
): KokoroWordCheckpoint[] {
  const weights: Array<{ wordIndex: number; weight: number }> = [];

  for (
    let wordIndex = sentence.wordStartIndex;
    wordIndex <= sentence.wordEndIndex;
    wordIndex++
  ) {
    const token = page.words[wordIndex]?.word ?? "";
    weights.push({
      wordIndex,
      weight: estimateKokoroWordWeight(token),
    });
  }

  const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) {
    return weights.map((item, index) => ({
      wordIndex: item.wordIndex,
      endRatio: (index + 1) / Math.max(weights.length, 1),
    }));
  }

  let cumulativeWeight = 0;

  return weights.map((item) => {
    cumulativeWeight += item.weight;
    return {
      wordIndex: item.wordIndex,
      endRatio: cumulativeWeight / totalWeight,
    };
  });
}

export function useTTS(pages: string[]): [TTSState, TTSControls] {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rate, setRateState] = useState(1);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [totalWords, setTotalWords] = useState(0);
  const [engine, setEngineState] = useState<PlaybackEngine>("kokoro");
  const [isEngineLoading, setIsEngineLoading] = useState(false);
  const [engineMessage, setEngineMessage] = useState<string | null>(null);
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedSystemVoiceId, setSelectedSystemVoiceId] = useState<
    string | null
  >(null);
  const [selectedKokoroVoiceId, setSelectedKokoroVoiceId] =
    useState<KokoroVoiceId>(KOKORO_DEFAULT_VOICE);
  const [kokoroVoices, setKokoroVoices] =
    useState<VoiceOption[]>(DEFAULT_KOKORO_VOICES);

  const pagesRef = useRef<PageInfo[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentLocationRef = useRef<PlaybackLocation | null>(null);
  const currentPageIndexRef = useRef(0);
  const startTimeRef = useRef(0);
  const elapsedBeforePauseRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const kokoroWordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackRequestIdRef = useRef(0);
  const activeKokoroUrlRef = useRef<string | null>(null);
  const activeKokoroSentenceRef = useRef<KokoroSentencePlayback | null>(null);
  const kokoroRuntimeRef = useRef<KokoroRuntime | null>(null);
  const kokoroLoadPromiseRef = useRef<Promise<KokoroRuntime> | null>(null);
  const engineRef = useRef<PlaybackEngine>("kokoro");
  const rateRef = useRef(rate);
  const isPlayingRef = useRef(false);
  const isPausedRef = useRef(false);
  const systemVoicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const selectedSystemVoiceIdRef = useRef<string | null>(null);
  const selectedKokoroVoiceIdRef = useRef<KokoroVoiceId>(KOKORO_DEFAULT_VOICE);
  const wordChangeRef = useRef<WordChangeCallback | null>(null);
  const lastWordEventRef = useRef<WordChangeEvent>({
    pageIndex: 0,
    wordIndex: -1,
    sentenceRange: null,
  });
  const progressRef = useRef(0);
  const totalWordsRef = useRef(0);

  rateRef.current = rate;
  systemVoicesRef.current = systemVoices;
  selectedSystemVoiceIdRef.current = selectedSystemVoiceId;
  selectedKokoroVoiceIdRef.current = selectedKokoroVoiceId;

  const selectedSystemVoice =
    systemVoices.find((voice) => voice.voiceURI === selectedSystemVoiceId) ??
    null;

  const setEngine = useCallback((nextEngine: PlaybackEngine) => {
    engineRef.current = nextEngine;
    setEngineState(nextEngine);
  }, []);

  const setActivePage = useCallback((pageIndex: number) => {
    currentPageIndexRef.current = pageIndex;
    setCurrentPageIndex(pageIndex);
  }, []);

  const notifyWordChange = useCallback((event: WordChangeEvent) => {
    lastWordEventRef.current = event;
    wordChangeRef.current?.(event);
  }, []);

  const clearRestartTimeout = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed =
        elapsedBeforePauseRef.current +
        (Date.now() - startTimeRef.current) / 1000;
      setElapsedTime(elapsed);
      setProgress(progressRef.current);
    }, 250);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const getElapsedSeconds = useCallback(() => {
    if (isPlayingRef.current && !isPausedRef.current && timerRef.current) {
      return (
        elapsedBeforePauseRef.current +
        (Date.now() - startTimeRef.current) / 1000
      );
    }

    return elapsedBeforePauseRef.current;
  }, []);

  const updateProgressForWord = useCallback(
    (pageIndex: number, wordIndex: number, syncState = false) => {
      const page = pagesRef.current[pageIndex];
      if (!page || totalWordsRef.current <= 0) {
        progressRef.current = 0;
        if (syncState) setProgress(0);
        return;
      }

      const absoluteWordIndex =
        page.words.length > 0
          ? page.wordOffset + clamp(wordIndex, 0, page.words.length - 1)
          : page.wordOffset;

      const nextProgress =
        totalWordsRef.current <= 1
          ? 0
          : absoluteWordIndex / (totalWordsRef.current - 1);

      progressRef.current = nextProgress;

      if (syncState) {
        setProgress(nextProgress);
      }
    },
    []
  );

  const revokeActiveKokoroUrl = useCallback(() => {
    if (activeKokoroUrlRef.current) {
      URL.revokeObjectURL(activeKokoroUrlRef.current);
      activeKokoroUrlRef.current = null;
    }
  }, []);

  const ensureAudioElement = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = "auto";
    }

    return audioRef.current;
  }, []);

  const clearKokoroWordTracking = useCallback(() => {
    if (kokoroWordTimerRef.current) {
      clearInterval(kokoroWordTimerRef.current);
      kokoroWordTimerRef.current = null;
    }
  }, []);

  const stopKokoroPlayback = useCallback(() => {
    clearKokoroWordTracking();
    activeKokoroSentenceRef.current = null;

    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }

    revokeActiveKokoroUrl();
  }, [clearKokoroWordTracking, revokeActiveKokoroUrl]);

  const moveToIdlePage = useCallback(
    (pageIndex: number) => {
      const safePageIndex = clamp(pageIndex, 0, pagesRef.current.length - 1);

      playbackRequestIdRef.current += 1;
      clearRestartTimeout();
      speechSynthesis.cancel();
      utteranceRef.current = null;
      stopKokoroPlayback();
      stopTimer();

      isPlayingRef.current = false;
      isPausedRef.current = false;
      setIsPlaying(false);
      setIsPaused(false);
      setIsEngineLoading(false);

      currentLocationRef.current = { pageIndex: safePageIndex, sentenceIndex: 0 };
      setActivePage(safePageIndex);
      updateProgressForWord(safePageIndex, 0, true);
      notifyWordChange({
        pageIndex: safePageIndex,
        wordIndex: -1,
        sentenceRange: null,
      });
    },
    [
      clearRestartTimeout,
      notifyWordChange,
      setActivePage,
      stopKokoroPlayback,
      stopTimer,
      updateProgressForWord,
    ]
  );

  const finishPlayback = useCallback(() => {
    const elapsed = getElapsedSeconds();

    clearRestartTimeout();
    stopTimer();
    clearKokoroWordTracking();
    stopKokoroPlayback();

    utteranceRef.current = null;
    isPlayingRef.current = false;
    isPausedRef.current = false;
    setIsPlaying(false);
    setIsPaused(false);
    setIsEngineLoading(false);

    elapsedBeforePauseRef.current = elapsed;
    progressRef.current = totalWordsRef.current > 0 ? 1 : 0;
    setProgress(progressRef.current);
    setElapsedTime(elapsed);

    const lastPageIndex = currentPageIndexRef.current;
    setActivePage(lastPageIndex);
    notifyWordChange({
      pageIndex: lastPageIndex,
      wordIndex: -1,
      sentenceRange: null,
    });

    currentLocationRef.current = findFirstReadableLocation(pagesRef.current);
  }, [
    clearKokoroWordTracking,
    clearRestartTimeout,
    getElapsedSeconds,
    notifyWordChange,
    setActivePage,
    stopKokoroPlayback,
    stopTimer,
  ]);

  const fallbackToSystem = useCallback(
    (
      error: unknown,
      location?: PlaybackLocation | null,
      options?: { resetElapsed?: boolean }
    ) => {
      console.error("Kokoro fallback:", error);
      setEngine("system");
      setIsEngineLoading(false);
      setEngineMessage(KOKORO_FALLBACK_MESSAGE);
      stopKokoroPlayback();
      clearKokoroWordTracking();

      const nextLocation =
        location ?? currentLocationRef.current ?? findFirstReadableLocation(pagesRef.current);

      if (!nextLocation) {
        moveToIdlePage(0);
        return;
      }

      if (options?.resetElapsed) {
        elapsedBeforePauseRef.current = 0;
        setElapsedTime(0);
      }

      playbackRequestIdRef.current += 1;
      const requestId = playbackRequestIdRef.current;

      speechSynthesis.cancel();
      utteranceRef.current = null;
      stopTimer();

      restartTimeoutRef.current = setTimeout(() => {
        if (requestId !== playbackRequestIdRef.current) return;
        restartTimeoutRef.current = null;
        isPlayingRef.current = true;
        isPausedRef.current = false;
        setIsPlaying(true);
        setIsPaused(false);
        startTimer();

        const speakFromLocation = (
          requestedLocation: PlaybackLocation
        ): void => {
          const nextReadableLocation = findForwardLocation(
            pagesRef.current,
            requestedLocation.pageIndex,
            requestedLocation.sentenceIndex
          );

          if (!nextReadableLocation) {
            finishPlayback();
            return;
          }

          const page = pagesRef.current[nextReadableLocation.pageIndex];
          const sentence = page.sentences[nextReadableLocation.sentenceIndex];

          currentLocationRef.current = nextReadableLocation;
          setActivePage(nextReadableLocation.pageIndex);
          updateProgressForWord(
            nextReadableLocation.pageIndex,
            sentence.wordStartIndex,
            true
          );

          const sentenceRange: [number, number] = [
            sentence.wordStartIndex,
            sentence.wordEndIndex,
          ];

          notifyWordChange({
            pageIndex: nextReadableLocation.pageIndex,
            wordIndex: sentence.wordStartIndex,
            sentenceRange,
          });

          const utterance = new SpeechSynthesisUtterance(sentence.text);
          utterance.rate = rateRef.current;

          const activeVoice =
            systemVoicesRef.current.find(
              (voice) => voice.voiceURI === selectedSystemVoiceIdRef.current
            ) ?? selectPreferredSystemVoice(systemVoicesRef.current);

          if (activeVoice) {
            utterance.voice = activeVoice;
            utterance.lang = activeVoice.lang;
          }

          utteranceRef.current = utterance;

          utterance.onboundary = (event) => {
            if (event.name !== "word") return;

            const wordIndex = getWordIndexForBoundary(
              page,
              sentence,
              event.charIndex
            );

            updateProgressForWord(nextReadableLocation.pageIndex, wordIndex);
            notifyWordChange({
              pageIndex: nextReadableLocation.pageIndex,
              wordIndex,
              sentenceRange,
            });
          };

          utterance.onend = () => {
            if (
              !isPlayingRef.current ||
              isPausedRef.current ||
              requestId !== playbackRequestIdRef.current
            ) {
              return;
            }

            const followingLocation = findForwardLocation(
              pagesRef.current,
              nextReadableLocation.pageIndex,
              nextReadableLocation.sentenceIndex + 1
            );

            if (followingLocation) {
              speakFromLocation(followingLocation);
            } else {
              finishPlayback();
            }
          };

          utterance.onerror = (event) => {
            if (event.error !== "canceled" && event.error !== "interrupted") {
              console.error("Speech error:", event.error);
            }
          };

          speechSynthesis.speak(utterance);
        };

        speakFromLocation(nextLocation);
      }, 40);
    },
    [
      clearKokoroWordTracking,
      finishPlayback,
      moveToIdlePage,
      notifyWordChange,
      setActivePage,
      setEngine,
      startTimer,
      stopKokoroPlayback,
      stopTimer,
      updateProgressForWord,
    ]
  );

  const ensureKokoroReady = useCallback(async (): Promise<KokoroRuntime> => {
    if (engineRef.current === "system") {
      throw new Error("Kokoro has already fallen back to the system engine.");
    }

    if (kokoroRuntimeRef.current) {
      return kokoroRuntimeRef.current;
    }

    if (kokoroLoadPromiseRef.current) {
      return kokoroLoadPromiseRef.current;
    }

    setIsEngineLoading(true);
    setEngineMessage("Loading Kokoro locally...");

    const loadPromise = (async () => {
      const { KokoroTTS } = await import("kokoro-js");
      const canUseWebGpu =
        typeof navigator !== "undefined" && "gpu" in navigator;

      const loadAttempt = async (
        device: "webgpu" | "wasm",
        dtype: "fp32" | "q8"
      ) =>
        KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
          device,
          dtype,
        });

      let instance: KokoroTTSInstance;

      if (canUseWebGpu) {
        try {
          instance = await loadAttempt("webgpu", "fp32");
        } catch {
          instance = await loadAttempt("wasm", "q8");
        }
      } else {
        instance = await loadAttempt("wasm", "q8");
      }

      const runtime: KokoroRuntime = {
        instance,
        voices: mapKokoroVoices(instance.voices),
      };

      kokoroRuntimeRef.current = runtime;
      setKokoroVoices(runtime.voices);
      setEngine("kokoro");
      setIsEngineLoading(false);
      setEngineMessage(null);

      return runtime;
    })();

    kokoroLoadPromiseRef.current = loadPromise;

    try {
      return await loadPromise;
    } finally {
      kokoroLoadPromiseRef.current = null;
    }
  }, [setEngine]);

  const syncKokoroWordTracking = useCallback(() => {
    const playback = activeKokoroSentenceRef.current;
    const audio = audioRef.current;
    if (!playback || !audio) return;

    const ratio =
      playback.duration > 0
        ? clamp(audio.currentTime / playback.duration, 0, 0.999)
        : 0;
    const checkpoint =
      playback.checkpoints.find((item) => ratio < item.endRatio) ??
      playback.checkpoints.at(-1);

    if (!checkpoint) return;

    const wordIndex = checkpoint.wordIndex;
    const sentence = playback.sentence;
    const sentenceRange: [number, number] = [
      sentence.wordStartIndex,
      sentence.wordEndIndex,
    ];

    if (
      lastWordEventRef.current.pageIndex === playback.location.pageIndex &&
      lastWordEventRef.current.wordIndex === wordIndex &&
      lastWordEventRef.current.sentenceRange?.[0] === sentenceRange[0] &&
      lastWordEventRef.current.sentenceRange?.[1] === sentenceRange[1]
    ) {
      return;
    }

    updateProgressForWord(playback.location.pageIndex, wordIndex);
    notifyWordChange({
      pageIndex: playback.location.pageIndex,
      wordIndex,
      sentenceRange,
    });
  }, [notifyWordChange, updateProgressForWord]);

  const startKokoroWordTracking = useCallback(() => {
    clearKokoroWordTracking();
    syncKokoroWordTracking();
    kokoroWordTimerRef.current = setInterval(syncKokoroWordTracking, 60);
  }, [clearKokoroWordTracking, syncKokoroWordTracking]);

  const playKokoroFromLocation = useCallback(
    async (requestedLocation: PlaybackLocation, requestId: number) => {
      const nextLocation = findForwardLocation(
        pagesRef.current,
        requestedLocation.pageIndex,
        requestedLocation.sentenceIndex
      );

      if (!nextLocation) {
        finishPlayback();
        return;
      }

      const runtime = await ensureKokoroReady();
      if (requestId !== playbackRequestIdRef.current) return;

      const page = pagesRef.current[nextLocation.pageIndex];
      const sentence = page.sentences[nextLocation.sentenceIndex];

      currentLocationRef.current = nextLocation;
      setActivePage(nextLocation.pageIndex);
      updateProgressForWord(
        nextLocation.pageIndex,
        sentence.wordStartIndex,
        true
      );

      const sentenceRange: [number, number] = [
        sentence.wordStartIndex,
        sentence.wordEndIndex,
      ];

      notifyWordChange({
        pageIndex: nextLocation.pageIndex,
        wordIndex: sentence.wordStartIndex,
        sentenceRange,
      });

      setIsEngineLoading(true);
      setEngineMessage("Generating Kokoro audio...");

      const rawAudio = await runtime.instance.generate(sentence.text, {
        voice: selectedKokoroVoiceIdRef.current,
        speed: rateRef.current,
      });

      if (requestId !== playbackRequestIdRef.current) return;

      const audio = ensureAudioElement();
      const blobUrl = URL.createObjectURL(rawAudio.toBlob());
      const duration = getRawAudioDurationSeconds(rawAudio);

      stopKokoroPlayback();
      activeKokoroUrlRef.current = blobUrl;
      activeKokoroSentenceRef.current = {
        location: nextLocation,
        sentence,
        duration,
        checkpoints: buildKokoroWordCheckpoints(page, sentence),
      };

      audio.src = blobUrl;
      audio.currentTime = 0;

      audio.onended = () => {
        clearKokoroWordTracking();

        if (
          requestId !== playbackRequestIdRef.current ||
          !isPlayingRef.current ||
          isPausedRef.current
        ) {
          return;
        }

        const followingLocation = findForwardLocation(
          pagesRef.current,
          nextLocation.pageIndex,
          nextLocation.sentenceIndex + 1
        );

        if (followingLocation) {
          void playKokoroFromLocation(followingLocation, requestId);
        } else {
          finishPlayback();
        }
      };

      audio.onerror = () => {
        if (requestId !== playbackRequestIdRef.current) return;
        fallbackToSystem(
          new Error("The generated Kokoro audio could not be played."),
          nextLocation
        );
      };

      try {
        await audio.play();
      } catch (error) {
        if (requestId !== playbackRequestIdRef.current) return;
        fallbackToSystem(error, nextLocation);
        return;
      }

      if (requestId !== playbackRequestIdRef.current) {
        audio.pause();
        return;
      }

      isPlayingRef.current = true;
      isPausedRef.current = false;
      setIsPlaying(true);
      setIsPaused(false);
      setIsEngineLoading(false);
      setEngineMessage(null);
      startTimer();
      startKokoroWordTracking();
    },
    [
      clearKokoroWordTracking,
      ensureAudioElement,
      ensureKokoroReady,
      fallbackToSystem,
      finishPlayback,
      notifyWordChange,
      setActivePage,
      startKokoroWordTracking,
      startTimer,
      stopKokoroPlayback,
      updateProgressForWord,
    ]
  );

  const restartKokoroFrom = useCallback(
    async (
      location: PlaybackLocation,
      options?: {
        resetElapsed?: boolean;
      }
    ) => {
      const requestId = playbackRequestIdRef.current + 1;
      playbackRequestIdRef.current = requestId;

      clearRestartTimeout();
      speechSynthesis.cancel();
      utteranceRef.current = null;
      stopKokoroPlayback();
      stopTimer();
      clearKokoroWordTracking();

      if (options?.resetElapsed) {
        elapsedBeforePauseRef.current = 0;
        setElapsedTime(0);
      } else {
        const elapsed = getElapsedSeconds();
        elapsedBeforePauseRef.current = elapsed;
        setElapsedTime(elapsed);
      }

      isPlayingRef.current = false;
      isPausedRef.current = false;
      setIsPlaying(false);
      setIsPaused(false);
      setEngine("kokoro");
      setIsEngineLoading(true);
      setEngineMessage("Loading Kokoro locally...");

      try {
        await playKokoroFromLocation(location, requestId);
      } catch (error) {
        if (requestId !== playbackRequestIdRef.current) return;
        fallbackToSystem(error, location, options);
      }
    },
    [
      clearKokoroWordTracking,
      clearRestartTimeout,
      fallbackToSystem,
      getElapsedSeconds,
      playKokoroFromLocation,
      setEngine,
      stopKokoroPlayback,
      stopTimer,
    ]
  );

  useEffect(() => {
    const loadVoices = () => {
      const available = speechSynthesis.getVoices();
      if (available.length === 0) return;

      setSystemVoices(available);
      const preferredVoice = selectPreferredSystemVoice(available);
      setSelectedSystemVoiceId((current) => {
        if (current && available.some((voice) => voice.voiceURI === current)) {
          return current;
        }

        return preferredVoice?.voiceURI ?? available[0]?.voiceURI ?? null;
      });
    };

    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    const { pages: pageInfo, totalWords: nextTotalWords } = buildPagesInfo(pages);
    const initialLocation =
      findFirstReadableLocation(pageInfo) ??
      (pageInfo.length > 0 ? { pageIndex: 0, sentenceIndex: 0 } : null);
    const initialPageIndex = initialLocation?.pageIndex ?? 0;

    playbackRequestIdRef.current += 1;
    clearRestartTimeout();
    speechSynthesis.cancel();
    utteranceRef.current = null;
    stopKokoroPlayback();
    stopTimer();

    pagesRef.current = pageInfo;
    totalWordsRef.current = nextTotalWords;
    setTotalWords(nextTotalWords);

    isPlayingRef.current = false;
    isPausedRef.current = false;
    setIsPlaying(false);
    setIsPaused(false);
    setIsEngineLoading(false);

    elapsedBeforePauseRef.current = 0;
    setElapsedTime(0);
    progressRef.current = 0;
    setProgress(0);

    currentLocationRef.current = initialLocation;
    setActivePage(initialPageIndex);

    notifyWordChange({
      pageIndex: initialPageIndex,
      wordIndex: -1,
      sentenceRange: null,
    });
  }, [pages, clearRestartTimeout, notifyWordChange, setActivePage, stopKokoroPlayback, stopTimer]);

  const play = useCallback(() => {
    if (totalWordsRef.current === 0) return;

    if (engineRef.current === "system") {
      const shouldRestartFromBeginning = progressRef.current >= 1;
      const requestedLocation = shouldRestartFromBeginning
        ? findFirstReadableLocation(pagesRef.current)
        : currentLocationRef.current ??
          findFirstReadableLocation(pagesRef.current);

      if (!requestedLocation) return;

      if (isPausedRef.current && utteranceRef.current) {
        speechSynthesis.resume();
        isPausedRef.current = false;
        setIsPaused(false);
        startTimer();
        return;
      }

      fallbackToSystem(null, requestedLocation, {
        resetElapsed: shouldRestartFromBeginning,
      });
      return;
    }

    if (isPausedRef.current && audioRef.current && activeKokoroSentenceRef.current) {
      const audio = audioRef.current;
      void audio
        .play()
        .then(() => {
          isPlayingRef.current = true;
          isPausedRef.current = false;
          setIsPlaying(true);
          setIsPaused(false);
          startTimer();
          startKokoroWordTracking();
        })
        .catch((error) => {
          fallbackToSystem(error, activeKokoroSentenceRef.current?.location);
        });
      return;
    }

    const shouldRestartFromBeginning = progressRef.current >= 1;
    const requestedLocation = shouldRestartFromBeginning
      ? findFirstReadableLocation(pagesRef.current)
      : currentLocationRef.current ?? findFirstReadableLocation(pagesRef.current);

    if (!requestedLocation) return;

    void restartKokoroFrom(requestedLocation, {
      resetElapsed: shouldRestartFromBeginning,
    });
  }, [
    fallbackToSystem,
    restartKokoroFrom,
    startKokoroWordTracking,
    startTimer,
  ]);

  const pause = useCallback(() => {
    if (!isPlayingRef.current || isPausedRef.current) return;

    if (engineRef.current === "system") {
      speechSynthesis.pause();
    } else if (audioRef.current) {
      audioRef.current.pause();
      clearKokoroWordTracking();
    }

    isPausedRef.current = true;
    setIsPaused(true);

    const elapsed = getElapsedSeconds();
    elapsedBeforePauseRef.current = elapsed;
    setElapsedTime(elapsed);
    stopTimer();
  }, [clearKokoroWordTracking, getElapsedSeconds, stopTimer]);

  const resume = useCallback(() => {
    if (!isPausedRef.current) return;

    if (engineRef.current === "system") {
      if (!utteranceRef.current) return;
      speechSynthesis.resume();
      isPausedRef.current = false;
      setIsPaused(false);
      startTimer();
      return;
    }

    if (!audioRef.current || !activeKokoroSentenceRef.current) return;

    void audioRef.current
      .play()
      .then(() => {
        isPlayingRef.current = true;
        isPausedRef.current = false;
        setIsPlaying(true);
        setIsPaused(false);
        startTimer();
        startKokoroWordTracking();
      })
      .catch((error) => {
        fallbackToSystem(error, activeKokoroSentenceRef.current?.location);
      });
  }, [fallbackToSystem, startKokoroWordTracking, startTimer]);

  const stop = useCallback(() => {
    playbackRequestIdRef.current += 1;
    clearRestartTimeout();
    speechSynthesis.cancel();
    utteranceRef.current = null;
    stopKokoroPlayback();
    stopTimer();

    isPlayingRef.current = false;
    isPausedRef.current = false;
    setIsPlaying(false);
    setIsPaused(false);
    setIsEngineLoading(false);

    elapsedBeforePauseRef.current = 0;
    setElapsedTime(0);
    progressRef.current = 0;
    setProgress(0);

    const initialLocation =
      findFirstReadableLocation(pagesRef.current) ??
      (pagesRef.current.length > 0 ? { pageIndex: 0, sentenceIndex: 0 } : null);

    currentLocationRef.current = initialLocation;
    setActivePage(initialLocation?.pageIndex ?? 0);
    notifyWordChange({
      pageIndex: initialLocation?.pageIndex ?? 0,
      wordIndex: -1,
      sentenceRange: null,
    });
  }, [
    clearRestartTimeout,
    notifyWordChange,
    setActivePage,
    stopKokoroPlayback,
    stopTimer,
  ]);

  const startFromLocation = useCallback(
    (location: PlaybackLocation, options?: { resetElapsed?: boolean }) => {
      if (engineRef.current === "system") {
        fallbackToSystem(null, location, options);
      } else {
        void restartKokoroFrom(location, options);
      }
    },
    [fallbackToSystem, restartKokoroFrom]
  );

  const seekToPageWord = useCallback(
    (pageIndex: number, wordIndex: number) => {
      const page = pagesRef.current[pageIndex];
      if (!page || page.words.length === 0) return;

      const safeWordIndex = clamp(wordIndex, 0, page.words.length - 1);
      const location = {
        pageIndex,
        sentenceIndex: page.words[safeWordIndex].sentenceIndex,
      };

      currentLocationRef.current = location;
      updateProgressForWord(pageIndex, safeWordIndex, true);
      startFromLocation(location);
    },
    [startFromLocation, updateProgressForWord]
  );

  const seekToProgress = useCallback(
    (nextProgress: number) => {
      if (totalWordsRef.current === 0) return;

      const absoluteWordIndex = Math.round(
        clamp(nextProgress, 0, 1) * Math.max(0, totalWordsRef.current - 1)
      );
      const pageWord = findPageWordByAbsoluteIndex(
        pagesRef.current,
        absoluteWordIndex
      );

      if (!pageWord) return;
      seekToPageWord(pageWord.pageIndex, pageWord.wordIndex);
    },
    [seekToPageWord]
  );

  const goToPage = useCallback(
    (pageIndex: number) => {
      if (pagesRef.current.length === 0) return;

      const safePageIndex = clamp(pageIndex, 0, pagesRef.current.length - 1);
      currentLocationRef.current = { pageIndex: safePageIndex, sentenceIndex: 0 };

      if (
        isPlayingRef.current ||
        isPausedRef.current ||
        isEngineLoading
      ) {
        startFromLocation(currentLocationRef.current);
        return;
      }

      moveToIdlePage(safePageIndex);
    },
    [isEngineLoading, moveToIdlePage, startFromLocation]
  );

  const skipForward = useCallback(() => {
    const currentLocation =
      currentLocationRef.current ?? findFirstReadableLocation(pagesRef.current);
    if (!currentLocation) return;

    const nextLocation = findForwardLocation(
      pagesRef.current,
      currentLocation.pageIndex,
      currentLocation.sentenceIndex + 1
    );

    if (!nextLocation) {
      finishPlayback();
      return;
    }

    currentLocationRef.current = nextLocation;
    startFromLocation(nextLocation);
  }, [finishPlayback, startFromLocation]);

  const skipBackward = useCallback(() => {
    const currentLocation =
      currentLocationRef.current ?? findFirstReadableLocation(pagesRef.current);
    if (!currentLocation) return;

    const previousLocation = findBackwardLocation(
      pagesRef.current,
      currentLocation.pageIndex,
      currentLocation.sentenceIndex - 1
    );

    if (!previousLocation) {
      moveToIdlePage(0);
      return;
    }

    currentLocationRef.current = previousLocation;
    startFromLocation(previousLocation);
  }, [moveToIdlePage, startFromLocation]);

  const setRate = useCallback(
    (nextRate: number) => {
      setRateState(nextRate);

      if (currentLocationRef.current && (isPlayingRef.current || isPausedRef.current)) {
        startFromLocation(currentLocationRef.current);
      }
    },
    [startFromLocation]
  );

  const setVoice = useCallback(
    (voiceId: string) => {
      if (engineRef.current === "system") {
        const voiceExists = systemVoicesRef.current.some(
          (voice) => voice.voiceURI === voiceId
        );
        if (!voiceExists) return;
        setSelectedSystemVoiceId(voiceId);
      } else {
        setSelectedKokoroVoiceId(voiceId as KokoroVoiceId);
      }

      if (currentLocationRef.current && (isPlayingRef.current || isPausedRef.current)) {
        startFromLocation(currentLocationRef.current);
      }
    },
    [startFromLocation]
  );

  const onWordChange = useCallback((cb: WordChangeCallback) => {
    wordChangeRef.current = cb;
    cb(lastWordEventRef.current);
  }, []);

  useEffect(() => {
    return () => {
      playbackRequestIdRef.current += 1;
      clearRestartTimeout();
      isPlayingRef.current = false;
      isPausedRef.current = false;
      speechSynthesis.cancel();
      stopKokoroPlayback();
      stopTimer();
    };
  }, [clearRestartTimeout, stopKokoroPlayback, stopTimer]);

  const availableVoices =
    engine === "kokoro" ? kokoroVoices : mapSystemVoices(systemVoices);
  const selectedVoiceId =
    engine === "kokoro" ? selectedKokoroVoiceId : selectedSystemVoice?.voiceURI ?? null;
  const totalEstimatedTime = totalWords > 0 ? (totalWords / 150 / rate) * 60 : 0;

  const state: TTSState = {
    isPlaying,
    isPaused,
    progress,
    rate,
    elapsedTime,
    totalEstimatedTime,
    currentPageIndex,
    totalPages: pages.length,
    totalWords,
    engine,
    isEngineLoading,
    engineMessage,
    availableVoices,
    selectedVoiceId,
  };

  const controls: TTSControls = {
    play,
    pause,
    resume,
    stop,
    skipForward,
    skipBackward,
    setRate,
    setVoice,
    seekToPageWord,
    seekToProgress,
    goToPage,
    onWordChange,
  };

  return [state, controls];
}

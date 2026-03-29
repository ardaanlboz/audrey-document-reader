"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { WordChangeCallback } from "@/hooks/useTTS";
import type { HighlightMode } from "@/types/highlight";

interface TextViewerProps {
  pageIndex: number;
  text: string;
  highlightMode: HighlightMode;
  onWordClick: (wordIndex: number) => void;
  onWordChange: (cb: WordChangeCallback) => void;
}

interface WordToken {
  word: string;
  index: number;
  isNewParagraph: boolean;
}

function tokenize(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  const paragraphs = text.split(/\n\s*\n/);
  let wordIndex = 0;

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const words = paragraph.match(/\S+/g);
    if (!words) return;

    words.forEach((word, tokenIndex) => {
      tokens.push({
        word,
        index: wordIndex,
        isNewParagraph:
          paragraphIndex > 0 && tokenIndex === 0 && wordIndex > 0,
      });
      wordIndex++;
    });
  });

  return tokens;
}

export default function TextViewer({
  pageIndex,
  text,
  highlightMode,
  onWordClick,
  onWordChange,
}: TextViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wordElsRef = useRef<HTMLElement[]>([]);
  const prevWordIdxRef = useRef(-1);
  const prevSentenceRangeRef = useRef<[number, number] | null>(null);
  const lastScrollTimeRef = useRef(0);

  const tokens = useMemo(() => tokenize(text), [text]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const clearHighlights = () => {
      const wordEls = wordElsRef.current;
      const previousWordIndex = prevWordIdxRef.current;
      const previousSentenceRange = prevSentenceRangeRef.current;

      if (previousWordIndex >= 0) {
        wordEls[previousWordIndex]?.classList.remove("word-highlight");
      }

      if (previousSentenceRange) {
        for (
          let index = previousSentenceRange[0];
          index <= previousSentenceRange[1];
          index++
        ) {
          wordEls[index]?.classList.remove("sentence-highlight");
        }
      }

      prevWordIdxRef.current = -1;
      prevSentenceRangeRef.current = null;
    };

    wordElsRef.current = Array.from(
      container.querySelectorAll<HTMLElement>("[data-wi]")
    );
    clearHighlights();

    onWordChange((event) => {
      const wordEls = wordElsRef.current;

      if (event.pageIndex !== pageIndex || event.wordIndex < 0) {
        clearHighlights();
        return;
      }

      const previousSentenceRange = prevSentenceRangeRef.current;
      const sameSentence =
        previousSentenceRange &&
        event.sentenceRange &&
        previousSentenceRange[0] === event.sentenceRange[0] &&
        previousSentenceRange[1] === event.sentenceRange[1];

      if (highlightMode === "moving") {
        const previousWordIndex = prevWordIdxRef.current;

        if (sameSentence) {
          if (previousWordIndex >= 0) {
            wordEls[previousWordIndex]?.classList.remove("word-highlight");
            wordEls[previousWordIndex]?.classList.add("sentence-highlight");
          }

          wordEls[event.wordIndex]?.classList.remove("sentence-highlight");
          wordEls[event.wordIndex]?.classList.add("word-highlight");
        } else {
          clearHighlights();

          if (event.sentenceRange) {
            for (
              let index = event.sentenceRange[0];
              index <= event.sentenceRange[1];
              index++
            ) {
              if (index === event.wordIndex) continue;
              wordEls[index]?.classList.add("sentence-highlight");
            }
          }

          wordEls[event.wordIndex]?.classList.add("word-highlight");
        }
      } else if (!sameSentence) {
        clearHighlights();

        if (event.sentenceRange) {
          for (
            let index = event.sentenceRange[0];
            index <= event.sentenceRange[1];
            index++
          ) {
            wordEls[index]?.classList.add("sentence-highlight");
          }
        } else {
          wordEls[event.wordIndex]?.classList.add("sentence-highlight");
        }
      }

      prevWordIdxRef.current = event.wordIndex;
      prevSentenceRangeRef.current = event.sentenceRange;

      const anchorIndex =
        highlightMode === "moving"
          ? event.wordIndex
          : event.sentenceRange?.[0] ?? event.wordIndex;
      const activeWord = wordEls[anchorIndex];
      const now = Date.now();

      if (activeWord && now - lastScrollTimeRef.current > 800) {
        const containerRect = container.getBoundingClientRect();
        const wordRect = activeWord.getBoundingClientRect();

        if (
          wordRect.top < containerRect.top + 60 ||
          wordRect.bottom > containerRect.bottom - 100
        ) {
          activeWord.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          lastScrollTimeRef.current = now;
        }
      }
    });

    return () => {
      clearHighlights();
      wordElsRef.current = [];
    };
  }, [highlightMode, onWordChange, pageIndex, tokens]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-wi]"
      );

      if (!target) return;

      const wordIndex = target.getAttribute("data-wi");
      if (wordIndex !== null) {
        onWordClick(Number.parseInt(wordIndex, 10));
      }
    };

    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [onWordClick]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-8 py-8 md:px-16 md:py-12"
    >
      <div className="max-w-3xl mx-auto">
        {tokens.length > 0 ? (
          <div className="text-lg leading-relaxed select-none">
            {tokens.map((token) => (
              <span key={token.index}>
                {token.isNewParagraph && (
                  <>
                    <br />
                    <br />
                  </>
                )}
                <span
                  data-wi={token.index}
                  className="cursor-pointer rounded px-[2px] py-[1px]"
                >
                  {token.word}
                </span>{" "}
              </span>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-surface/40 p-6 text-sm text-text-muted">
            This page does not contain readable text. Use the page controls to
            continue.
          </div>
        )}
      </div>
    </div>
  );
}

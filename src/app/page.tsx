"use client";

import { useState, useCallback } from "react";
import FileUpload from "@/components/FileUpload";
import TextViewer from "@/components/TextViewer";
import PlayerControls from "@/components/PlayerControls";
import { useTTS } from "@/hooks/useTTS";
import type { HighlightMode } from "@/types/highlight";

export default function Home() {
  const [pages, setPages] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [highlightMode, setHighlightMode] =
    useState<HighlightMode>("stable");
  const [state, controls] = useTTS(pages);

  const handleTextExtracted = useCallback(
    (extractedPages: string[], name: string) => {
      setPages(extractedPages);
      setFileName(name);
    },
    []
  );

  const handleBack = useCallback(() => {
    controls.stop();
    setPages([]);
    setFileName("");
  }, [controls]);

  const currentPageText = pages[state.currentPageIndex] ?? "";

  // Show upload screen
  if (pages.length === 0) {
    return <FileUpload onTextExtracted={handleTextExtracted} />;
  }

  // Show reader
  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface/50 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-accent-light"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </div>
          <span className="font-semibold text-sm">Audrey</span>
        </div>
        <div className="text-sm text-text-muted truncate max-w-[200px] md:max-w-md">
          {fileName}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleBack}
            className="text-sm text-text-muted hover:text-foreground transition-colors
              px-3 py-1.5 rounded-lg hover:bg-surface-hover"
          >
            New file
          </button>
        </div>
      </div>

      {/* Text content */}
      <TextViewer
        pageIndex={state.currentPageIndex}
        text={currentPageText}
        highlightMode={highlightMode}
        onWordClick={(wordIndex) =>
          controls.seekToPageWord(state.currentPageIndex, wordIndex)
        }
        onWordChange={controls.onWordChange}
      />

      {/* Player */}
      <PlayerControls
        state={state}
        controls={controls}
        fileName={fileName}
        highlightMode={highlightMode}
        onHighlightModeChange={setHighlightMode}
        onBack={handleBack}
      />
    </div>
  );
}

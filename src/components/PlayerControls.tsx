"use client";

import { useState } from "react";
import type { TTSState, TTSControls } from "@/hooks/useTTS";

interface PlayerControlsProps {
  state: TTSState;
  controls: TTSControls;
  fileName: string;
  onBack: () => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const RATES = [0.5, 0.75, 1, 1.2, 1.5, 2, 2.5, 3];

export default function PlayerControls({
  state,
  controls,
  fileName,
  onBack,
}: PlayerControlsProps) {
  const [showVoices, setShowVoices] = useState(false);
  const [showRates, setShowRates] = useState(false);

  const engineLabel =
    state.engine === "kokoro"
      ? state.isEngineLoading
        ? "Kokoro loading"
        : "Kokoro HQ"
      : "System fallback";

  const handlePlayPause = () => {
    if (!state.isPlaying) {
      controls.play();
    } else if (state.isPaused) {
      controls.resume();
    } else {
      controls.pause();
    }
  };

  return (
    <div className="relative">
      {/* Voice selector dropdown */}
      {showVoices && (
        <div className="absolute bottom-full left-0 right-0 mb-2 mx-4">
          <div className="bg-surface border border-border rounded-xl max-h-64 overflow-y-auto shadow-2xl">
            <div className="p-3 border-b border-border">
              <h3 className="text-sm font-medium text-text-secondary">
                {state.engine === "kokoro"
                  ? "Select Kokoro Voice"
                  : "Select System Voice"}
              </h3>
            </div>
            {state.availableVoices.map((voice) => (
                <button
                  key={voice.id}
                  onClick={() => {
                    controls.setVoice(voice.id);
                    setShowVoices(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors
                    flex items-center justify-between
                    ${
                      state.selectedVoiceId === voice.id
                        ? "text-accent-light bg-accent/5"
                        : "text-text-secondary"
                    }`}
                >
                  <span className="truncate">
                    {voice.name}
                    {voice.quality ? ` (${voice.quality})` : ""}
                  </span>
                  <span className="text-xs text-text-muted ml-2 shrink-0">
                    {voice.lang}
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Rate selector dropdown */}
      {showRates && (
        <div className="absolute bottom-full right-4 mb-2">
          <div className="bg-surface border border-border rounded-xl shadow-2xl overflow-hidden">
            <div className="p-3 border-b border-border">
              <h3 className="text-sm font-medium text-text-secondary">
                Playback Speed
              </h3>
            </div>
            {RATES.map((r) => (
              <button
                key={r}
                onClick={() => {
                  controls.setRate(r);
                  setShowRates(false);
                }}
                className={`w-full text-left px-6 py-2.5 text-sm hover:bg-surface-hover transition-colors
                  ${
                    state.rate === r
                      ? "text-accent-light bg-accent/5"
                      : "text-text-secondary"
                  }`}
              >
                {r}x
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main player bar */}
      <div className="bg-surface/80 backdrop-blur-xl border-t border-border">
        {/* Progress bar */}
        <div className="px-4 pt-3">
          <input
            type="range"
            min="0"
            max="1"
            step="0.001"
            value={state.progress}
            onChange={(e) => {
              controls.seekToProgress(Number.parseFloat(e.target.value));
            }}
            className="w-full"
            style={{
              background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${
                state.progress * 100
              }%, var(--border) ${state.progress * 100}%, var(--border) 100%)`,
            }}
          />
          <div className="mt-1 flex items-center justify-between gap-4 text-xs text-text-muted">
            <span>{formatTime(state.elapsedTime)}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => controls.goToPage(state.currentPageIndex - 1)}
                disabled={state.currentPageIndex === 0}
                className="rounded-md p-1 transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
                title="Previous page"
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 18l-6-6 6-6"
                  />
                </svg>
              </button>
              <span>
                Page {Math.min(state.currentPageIndex + 1, state.totalPages)} of{" "}
                {Math.max(state.totalPages, 1)}
              </span>
              <button
                onClick={() => controls.goToPage(state.currentPageIndex + 1)}
                disabled={state.currentPageIndex >= state.totalPages - 1}
                className="rounded-md p-1 transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
                title="Next page"
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 6l6 6-6 6"
                  />
                </svg>
              </button>
            </div>
            <span>{formatTime(state.totalEstimatedTime)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between px-4 py-3">
          {/* Left: back button and file name */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              onClick={onBack}
              className="p-2 rounded-lg hover:bg-surface-hover transition-colors shrink-0"
              title="Back to upload"
            >
              <svg
                className="w-5 h-5 text-text-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
                />
              </svg>
            </button>
            <span className="text-sm text-text-muted truncate">{fileName}</span>
            <span className="hidden rounded-full border border-border px-2 py-0.5 text-[11px] text-text-muted md:inline-flex">
              {engineLabel}
            </span>
            <span className="hidden text-xs text-text-muted md:inline">
              {state.totalWords.toLocaleString()} words
            </span>
          </div>

          {/* Center: main controls */}
          <div className="flex items-center gap-2">
            {/* Voice selector */}
            <button
              onClick={() => {
                setShowVoices(!showVoices);
                setShowRates(false);
              }}
              className="p-2.5 rounded-xl hover:bg-surface-hover transition-colors"
              title="Select voice"
            >
              <svg
                className="w-5 h-5 text-text-secondary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0"
                />
              </svg>
            </button>

            {/* Skip back */}
            <button
              onClick={controls.skipBackward}
              className="p-2.5 rounded-xl hover:bg-surface-hover transition-colors"
              title="Previous sentence"
            >
              <svg
                className="w-5 h-5 text-text-secondary"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M9.195 18.44c1.25.713 2.805-.19 2.805-1.629v-2.34l6.945 3.968c1.25.714 2.805-.188 2.805-1.628V7.19c0-1.44-1.555-2.342-2.805-1.628L12 9.53V7.19c0-1.44-1.555-2.342-2.805-1.628l-7.108 4.061c-1.26.72-1.26 2.536 0 3.256l7.108 4.061z" />
              </svg>
            </button>

            {/* Play/Pause */}
            <button
              onClick={handlePlayPause}
              className="w-14 h-14 rounded-full bg-accent flex items-center justify-center
                hover:bg-accent/80 transition-all shadow-lg shadow-accent/25 active:scale-95"
              title={state.isPlaying && !state.isPaused ? "Pause" : "Play"}
            >
              {state.isPlaying && !state.isPaused ? (
                <svg
                  className="w-6 h-6 text-white"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg
                  className="w-6 h-6 text-white ml-1"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>

            {/* Skip forward */}
            <button
              onClick={controls.skipForward}
              className="p-2.5 rounded-xl hover:bg-surface-hover transition-colors"
              title="Next sentence"
            >
              <svg
                className="w-5 h-5 text-text-secondary"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M5.055 7.06c-1.25-.714-2.805.189-2.805 1.628v8.123c0 1.44 1.555 2.342 2.805 1.628L12 14.471v2.34c0 1.44 1.555 2.342 2.805 1.628l7.108-4.061c1.26-.72 1.26-2.536 0-3.256L14.805 7.06C13.555 6.346 12 7.25 12 8.69v2.34L5.055 7.06z" />
              </svg>
            </button>

            {/* Speed */}
            <button
              onClick={() => {
                setShowRates(!showRates);
                setShowVoices(false);
              }}
              className="px-3 py-1.5 rounded-xl hover:bg-surface-hover transition-colors
                text-sm font-medium text-text-secondary min-w-[48px]"
              title="Playback speed"
            >
              {state.rate}x
            </button>
          </div>

          {/* Right: stop button */}
          <div className="flex items-center justify-end flex-1">
            {state.isPlaying && (
              <button
                onClick={controls.stop}
                className="p-2.5 rounded-xl hover:bg-surface-hover transition-colors"
                title="Stop"
              >
                <svg
                  className="w-5 h-5 text-text-muted"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {state.engineMessage && (
        <div className="border-t border-border bg-surface/60 px-4 py-2 text-xs text-text-muted">
          {state.engineMessage}
        </div>
      )}

      {/* Click outside to close dropdowns */}
      {(showVoices || showRates) && (
        <div
          className="fixed inset-0 z-[-1]"
          onClick={() => {
            setShowVoices(false);
            setShowRates(false);
          }}
        />
      )}
    </div>
  );
}

"use client";

import { useState, useRef, useCallback } from "react";

interface FileUploadProps {
  onTextExtracted: (pages: string[], fileName: string) => void;
}

export default function FileUpload({ onTextExtracted }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleDocUrl, setGoogleDocUrl] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setIsLoading(true);

      try {
        let pages: string[];

        if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
          const { extractTextFromPDF } = await import("@/utils/pdfParser");
          pages = await extractTextFromPDF(file);
        } else if (
          file.type === "text/plain" ||
          file.name.endsWith(".txt") ||
          file.name.endsWith(".md")
        ) {
          const { extractTextFromTxt } = await import("@/utils/pdfParser");
          pages = await extractTextFromTxt(file);
        } else if (
          file.name.endsWith(".epub") ||
          file.name.endsWith(".docx")
        ) {
          setError(
            `${file.name.split(".").pop()?.toUpperCase()} files are not supported yet. Please upload a PDF or text file.`
          );
          setIsLoading(false);
          return;
        } else {
          // Try reading as text
          const { extractTextFromTxt } = await import("@/utils/pdfParser");
          pages = await extractTextFromTxt(file);
        }

        if (!pages.some((page) => page.trim())) {
          setError(
            "No text could be extracted from this file. The file might be image-based."
          );
          setIsLoading(false);
          return;
        }

        onTextExtracted(pages, file.name);
      } catch (err) {
        console.error("File processing error:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to process file. Please try again."
        );
      } finally {
        setIsLoading(false);
      }
    },
    [onTextExtracted]
  );

  const handleGoogleDoc = useCallback(async () => {
    if (!googleDocUrl.trim()) return;
    setError(null);
    setIsLoading(true);

    try {
      const { extractTextFromGoogleDoc } = await import("@/utils/pdfParser");
      const pages = await extractTextFromGoogleDoc(googleDocUrl);

      if (!pages.some((page) => page.trim())) {
        setError("No text could be extracted from this Google Doc.");
        setIsLoading(false);
        return;
      }

      const docName =
        googleDocUrl.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)?.[1] ||
        "Google Doc";
      onTextExtracted(pages, docName);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to fetch Google Doc. Make sure it's shared publicly."
      );
    } finally {
      setIsLoading(false);
    }
  }, [googleDocUrl, onTextExtracted]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
      <div className="w-full max-w-2xl">
        {/* Logo / Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-accent-light"
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
            <h1 className="text-3xl font-bold tracking-tight">Audrey</h1>
          </div>
          <p className="text-text-muted text-lg">
            Upload any PDF or text file and listen to it with natural
            text-to-speech
          </p>
        </div>

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative cursor-pointer rounded-2xl border-2 border-dashed p-12
            transition-all duration-200 text-center
            ${
              isDragging
                ? "border-accent bg-accent/5 drop-zone-active"
                : "border-border hover:border-text-muted hover:bg-surface/50"
            }
            ${isLoading ? "pointer-events-none opacity-60" : ""}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md,.text"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            className="hidden"
          />

          {isLoading ? (
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-text-secondary">Processing file...</p>
            </div>
          ) : (
            <>
              <div className="flex justify-center mb-5">
                <div className="w-16 h-16 rounded-2xl bg-surface flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-text-muted"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                    />
                  </svg>
                </div>
              </div>
              <p className="text-lg font-medium mb-2">
                Drop your file here or click to browse
              </p>
              <p className="text-text-muted text-sm">
                Supports PDF, TXT, and Markdown files
              </p>
            </>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-text-muted text-sm">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Google Doc URL */}
        {showUrlInput ? (
          <div className="flex gap-3">
            <input
              type="url"
              value={googleDocUrl}
              onChange={(e) => setGoogleDocUrl(e.target.value)}
              placeholder="Paste Google Docs link here..."
              className="flex-1 bg-surface border border-border rounded-xl px-4 py-3 text-sm
                focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30
                placeholder:text-text-muted"
              onKeyDown={(e) => e.key === "Enter" && handleGoogleDoc()}
            />
            <button
              onClick={handleGoogleDoc}
              disabled={!googleDocUrl.trim() || isLoading}
              className="px-6 py-3 bg-accent rounded-xl text-sm font-medium
                hover:bg-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Import
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowUrlInput(true)}
            className="w-full py-3 rounded-xl border border-border text-text-secondary
              hover:bg-surface hover:border-text-muted transition-all text-sm font-medium
              flex items-center justify-center gap-2"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.193-9.193a4.5 4.5 0 00-6.364 0l-4.5 4.5a4.5 4.5 0 001.242 7.244"
              />
            </svg>
            Import from Google Docs
          </button>
        )}

        {/* Paste text option */}
        <div className="mt-4">
          <button
            onClick={async () => {
              const text = prompt("Paste your text here:");
              if (text?.trim()) {
                const { splitIntoPages } = await import("@/utils/pdfParser");
                onTextExtracted(splitIntoPages(text), "Pasted Text");
              }
            }}
            className="w-full py-3 rounded-xl border border-border text-text-secondary
              hover:bg-surface hover:border-text-muted transition-all text-sm font-medium
              flex items-center justify-center gap-2"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
              />
            </svg>
            Paste text directly
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

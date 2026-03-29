export async function extractTextFromPDF(file: File): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(pageText);
  }

  return pages.length > 0 ? pages : [""];
}

export async function extractTextFromGoogleDoc(
  url: string
): Promise<string[]> {
  const patterns = [
    /\/document\/d\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
  ];

  let docId: string | null = null;
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      docId = match[1];
      break;
    }
  }

  if (!docId) {
    throw new Error(
      "Could not extract Google Doc ID from URL. Please provide a valid Google Docs link."
    );
  }

  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
  const response = await fetch(exportUrl);
  if (!response.ok) {
    throw new Error(
      "Could not fetch the Google Doc. Make sure the document is shared publicly (Anyone with the link can view)."
    );
  }

  const text = await response.text();
  return splitIntoPages(text.trim());
}

export function extractTextFromTxt(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(splitIntoPages(reader.result as string));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

export function splitIntoPages(
  text: string,
  targetChars = 2000
): string[] {
  if (!text.trim()) return [""];
  if (text.length <= targetChars) return [text];

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const pages: string[] = [];
  let current = "";

  for (const paragraph of paragraphs.flatMap((block) =>
    splitOversizedBlock(block, targetChars)
  )) {
    const candidate = current ? current + "\n\n" + paragraph : paragraph;

    if (candidate.length > targetChars && current) {
      pages.push(current);
      current = paragraph;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) pages.push(current.trim());
  return pages.length > 0 ? pages : [text.trim()];
}

function splitOversizedBlock(block: string, targetChars: number): string[] {
  if (block.length <= targetChars) return [block];

  const sentences = splitIntoSentences(block);
  if (sentences.length <= 1) {
    return splitIntoWordChunks(block, targetChars);
  }

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (sentence.length > targetChars) {
      if (current) {
        chunks.push(current.trim());
        current = "";
      }
      chunks.push(...splitIntoWordChunks(sentence, targetChars));
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > targetChars && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : splitIntoWordChunks(block, targetChars);
}

function splitIntoSentences(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, {
      granularity: "sentence",
    });

    return Array.from(segmenter.segment(text), ({ segment }) => segment.trim())
      .filter(Boolean);
  }

  return (
    text
      .match(/[^.!?\n]+[.!?]*[\])"'`’”]*|[^.!?\n]+$/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) ?? [text]
  );
}

function splitIntoWordChunks(text: string, targetChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > targetChars && current) {
      chunks.push(current.trim());
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text.trim()];
}

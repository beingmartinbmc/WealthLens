/**
 * Position-aware PDF text extraction using pdf.js.
 * Groups text items by Y-coordinate to reconstruct table rows,
 * and handles multi-page documents.
 */
import * as pdfjsLib from 'pdfjs-dist';

export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

export interface TextLine {
  text: string;
  items: TextItem[];
  y: number;
  page: number;
}

/** Tolerance in PDF units for grouping items into the same row */
const Y_TOLERANCE = 3;

/**
 * Extract all text items with positions from a PDF ArrayBuffer.
 * Returns lines grouped by Y-coordinate (i.e. table rows).
 */
export async function extractPdfLines(data: ArrayBuffer): Promise<TextLine[]> {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const allLines: TextLine[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });

    const items: TextItem[] = textContent.items
      .filter((item: unknown) => {
        const ti = item as { str: string };
        return ti.str && ti.str.trim().length > 0;
      })
      .map((item: unknown) => {
        const ti = item as {
          str: string;
          transform: number[];
          width: number;
          height: number;
        };
        // transform[4] = x, transform[5] = y (from bottom)
        // Flip y so top-of-page = 0
        const x = ti.transform[4];
        const y = viewport.height - ti.transform[5];
        return {
          str: ti.str,
          x,
          y,
          width: ti.width,
          height: ti.height || Math.abs(ti.transform[3]),
          page: pageNum,
        };
      });

    // Sort by y (top→bottom), then x (left→right)
    items.sort((a, b) => {
      const dy = a.y - b.y;
      if (Math.abs(dy) > Y_TOLERANCE) return dy;
      return a.x - b.x;
    });

    // Group into lines by Y proximity
    const pageLines = groupIntoLines(items, pageNum);
    allLines.push(...pageLines);
  }

  return allLines;
}

function groupIntoLines(items: TextItem[], page: number): TextLine[] {
  if (items.length === 0) return [];

  const lines: TextLine[] = [];
  let currentItems: TextItem[] = [items[0]];
  let currentY = items[0].y;

  for (let i = 1; i < items.length; i++) {
    const item = items[i];
    if (Math.abs(item.y - currentY) <= Y_TOLERANCE) {
      currentItems.push(item);
    } else {
      lines.push(buildLine(currentItems, currentY, page));
      currentItems = [item];
      currentY = item.y;
    }
  }
  if (currentItems.length > 0) {
    lines.push(buildLine(currentItems, currentY, page));
  }

  return lines;
}

function buildLine(items: TextItem[], y: number, page: number): TextLine {
  // Sort items left-to-right
  items.sort((a, b) => a.x - b.x);

  // Join with appropriate spacing
  let text = '';
  for (let i = 0; i < items.length; i++) {
    if (i > 0) {
      const gap = items[i].x - (items[i - 1].x + items[i - 1].width);
      text += gap > 10 ? '  ' : (gap > 2 ? ' ' : '');
    }
    text += items[i].str;
  }

  return { text: text.trim(), items, y, page };
}

/**
 * Simple flat text extraction (fallback when position-aware fails).
 * Joins all pages with newlines.
 */
export async function extractPdfFlatText(data: ArrayBuffer): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item: unknown) => (item as { str: string }).str)
      .join(' ');
    pages.push(text);
  }

  return pages.join('\n');
}

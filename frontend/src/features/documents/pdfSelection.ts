import type { PdfSelection } from "./PdfSelectionToolbar";

export interface PdfTextBlock {
  id: string;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface TextItem {
  span: HTMLElement;
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerY: number;
}

interface TextLine {
  items: TextItem[];
  top: number;
  bottom: number;
  left: number;
  right: number;
  centerY: number;
  height: number;
}

interface PdfTextBlockWithSpans extends PdfTextBlock {
  spans: HTMLElement[];
}

const BLOCK_PADDING_X = 8;
const BLOCK_PADDING_Y = 6;
const BLOCK_MIN_TEXT_LENGTH = 2;
const CLICK_SELECTION_MIN_LEFT = 132;
const TOOLBAR_TOP_OFFSET = 10;

export function createNativePdfUrl(pdfUrl: string, page: number, zoom: number, requestId: number) {
  const fragment = `page=${page}&zoom=${zoom}&nav=${requestId}`;
  try {
    const url = new URL(pdfUrl, window.location.href);
    url.hash = fragment;
    return url.toString();
  } catch {
    return `${pdfUrl.split("#")[0]}#${fragment}`;
  }
}

export function createPdfBlockKey(documentId: string, pageNumber: number, blockId: string) {
  return `${documentId}:${pageNumber}:${blockId}`;
}

export function readPdfSelection(scrollContainer: HTMLElement | null, fallbackPage: number): PdfSelection | null {
  const browserSelection = window.getSelection();
  if (!scrollContainer || !browserSelection || browserSelection.rangeCount === 0 || browserSelection.isCollapsed) {
    return null;
  }

  const selectedText = browserSelection.toString().replace(/\s+/g, " ").trim();
  if (!selectedText) {
    return null;
  }

  const anchorElement = getElementFromNode(browserSelection.anchorNode);
  if (!anchorElement || !scrollContainer.contains(anchorElement) || !anchorElement.closest("[data-pdf-text-layer='true']")) {
    return null;
  }

  const range = browserSelection.getRangeAt(0);
  const selectionRect = getSelectionRect(range);
  if (!selectionRect) {
    return null;
  }

  return {
    text: selectedText,
    pageNumber: getSelectionPageNumber(range, fallbackPage),
    left: clampNumber(selectionRect.left + selectionRect.width / 2, 132, window.innerWidth - 132),
    top: Math.max(76, selectionRect.top - 10)
  };
}

export function buildPdfTextBlocks(textLayer: HTMLElement): PdfTextBlock[] {
  clearPdfBlockMetadata(textLayer);

  const items = getTextItems(textLayer);
  if (items.length === 0) {
    return [];
  }

  const lines = groupTextItemsIntoLines(items);
  const blocks = groupLinesIntoBlocks(lines, textLayer);

  blocks.forEach((block) => {
    block.spans.forEach((span) => {
      span.dataset.pdfBlockId = block.id;
      span.classList.add("pdf-text-block-span");
    });
  });

  return blocks.map(({ spans: _spans, ...block }) => block);
}

export function selectPdfTextBlock(
  textLayer: HTMLElement | null,
  blockId: string,
  pageNumber: number,
  blockKey: string
): PdfSelection | null {
  if (!textLayer) {
    return null;
  }

  const spans = Array.from(textLayer.querySelectorAll<HTMLElement>(`[data-pdf-block-id="${blockId}"]`)).sort(compareElementsByPosition);
  if (spans.length === 0) {
    return null;
  }

  const firstBoundary = getRangeBoundary(spans[0]);
  const lastBoundary = getRangeBoundary(spans[spans.length - 1]);
  const range = document.createRange();
  range.setStart(firstBoundary.node, 0);
  range.setEnd(lastBoundary.node, lastBoundary.length);

  const browserSelection = window.getSelection();
  browserSelection?.removeAllRanges();
  browserSelection?.addRange(range);

  const selectedText = normalizeSelectedText(browserSelection?.toString() ?? "");
  const fallbackText = normalizeSelectedText(spans.map((span) => span.textContent ?? "").join("\n"));
  const selectionRect = getSelectionRect(range) ?? getUnionClientRect(spans);
  if (!selectionRect) {
    return null;
  }

  return {
    blockKey,
    text: selectedText || fallbackText,
    pageNumber,
    left: clampNumber(selectionRect.left + selectionRect.width / 2, CLICK_SELECTION_MIN_LEFT, window.innerWidth - CLICK_SELECTION_MIN_LEFT),
    top: Math.max(76, selectionRect.top - TOOLBAR_TOP_OFFSET)
  };
}

export function clampPage(page: number, totalPages: number) {
  return Math.min(totalPages, Math.max(1, page));
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getSelectionRect(range: Range) {
  const boundingRect = range.getBoundingClientRect();
  if (boundingRect.width > 0 || boundingRect.height > 0) {
    return boundingRect;
  }

  return Array.from(range.getClientRects()).find((rect) => rect.width > 0 || rect.height > 0) ?? null;
}

function clearPdfBlockMetadata(textLayer: HTMLElement) {
  textLayer.querySelectorAll<HTMLElement>("[data-pdf-block-id]").forEach((span) => {
    delete span.dataset.pdfBlockId;
    span.classList.remove("pdf-text-block-span");
  });
}

function getTextItems(textLayer: HTMLElement) {
  const layerRect = textLayer.getBoundingClientRect();

  return Array.from(textLayer.querySelectorAll<HTMLElement>("span"))
    .map((span) => {
      const text = normalizeTextSpan(span.textContent ?? "");
      const rect = span.getBoundingClientRect();

      if (!text || span.getAttribute("role") === "img" || rect.width <= 0 || rect.height <= 0) {
        return null;
      }

      const top = rect.top - layerRect.top;
      const bottom = rect.bottom - layerRect.top;

      return {
        span,
        text,
        left: rect.left - layerRect.left,
        top,
        right: rect.right - layerRect.left,
        bottom,
        width: rect.width,
        height: rect.height,
        centerY: top + rect.height / 2
      };
    })
    .filter((item): item is TextItem => Boolean(item))
    .sort(compareTextItems);
}

function groupTextItemsIntoLines(items: TextItem[]) {
  const medianHeight = getMedian(items.map((item) => item.height));
  const lineTolerance = Math.max(3, medianHeight * 0.45);
  const lines: TextLine[] = [];

  items.forEach((item) => {
    const currentLine = lines[lines.length - 1];

    if (!currentLine || Math.abs(item.centerY - currentLine.centerY) > lineTolerance) {
      lines.push(createTextLine([item]));
      return;
    }

    currentLine.items.push(item);
    updateTextLine(currentLine);
  });

  lines.forEach((line) => {
    line.items.sort((a, b) => a.left - b.left);
  });

  return lines;
}

function groupLinesIntoBlocks(lines: TextLine[], textLayer: HTMLElement) {
  if (lines.length === 0) {
    return [];
  }

  const layerRect = textLayer.getBoundingClientRect();
  const medianLineHeight = getMedian(lines.map((line) => line.height));
  const blockGap = Math.max(14, medianLineHeight * 1.35);
  const groupedLines: TextLine[][] = [];

  lines.forEach((line) => {
    const currentBlock = groupedLines[groupedLines.length - 1];
    const previousLine = currentBlock?.[currentBlock.length - 1];
    const gap = previousLine ? line.top - previousLine.bottom : 0;

    if (!currentBlock || gap > blockGap) {
      groupedLines.push([line]);
      return;
    }

    currentBlock.push(line);
  });

  return groupedLines
    .map((blockLines, index) => createTextBlock(blockLines, index, layerRect.width, layerRect.height))
    .filter((block) => block.text.length >= BLOCK_MIN_TEXT_LENGTH);
}

function createTextLine(items: TextItem[]): TextLine {
  const line = {
    items,
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    centerY: 0,
    height: 0
  };
  updateTextLine(line);
  return line;
}

function updateTextLine(line: TextLine) {
  line.top = Math.min(...line.items.map((item) => item.top));
  line.bottom = Math.max(...line.items.map((item) => item.bottom));
  line.left = Math.min(...line.items.map((item) => item.left));
  line.right = Math.max(...line.items.map((item) => item.right));
  line.height = line.bottom - line.top;
  line.centerY = line.top + line.height / 2;
}

function createTextBlock(blockLines: TextLine[], index: number, layerWidth: number, layerHeight: number): PdfTextBlockWithSpans {
  const left = Math.max(0, Math.min(...blockLines.map((line) => line.left)) - BLOCK_PADDING_X);
  const top = Math.max(0, Math.min(...blockLines.map((line) => line.top)) - BLOCK_PADDING_Y);
  const right = Math.min(layerWidth, Math.max(...blockLines.map((line) => line.right)) + BLOCK_PADDING_X);
  const bottom = Math.min(layerHeight, Math.max(...blockLines.map((line) => line.bottom)) + BLOCK_PADDING_Y);
  const spans = blockLines.flatMap((line) => line.items.map((item) => item.span));

  return {
    id: `block-${index + 1}`,
    text: normalizeSelectedText(blockLines.map(getLineText).join("\n")),
    left,
    top,
    width: right - left,
    height: bottom - top,
    spans
  };
}

function getLineText(line: TextLine) {
  return line.items.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim();
}

function normalizeTextSpan(text: string) {
  return text.replace(/\u00a0/g, " ").trim();
}

function normalizeSelectedText(text: string) {
  return text.replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function getMedian(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function getRangeBoundary(element: HTMLElement) {
  const textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
  if (textNode?.textContent) {
    return { node: textNode, length: textNode.textContent.length };
  }

  return { node: element, length: element.childNodes.length };
}

function getUnionClientRect(elements: HTMLElement[]) {
  const rects = elements.map((element) => element.getBoundingClientRect()).filter((rect) => rect.width > 0 || rect.height > 0);
  if (rects.length === 0) {
    return null;
  }

  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  };
}

function compareElementsByPosition(left: HTMLElement, right: HTMLElement) {
  const leftRect = left.getBoundingClientRect();
  const rightRect = right.getBoundingClientRect();
  const rowDelta = leftRect.top - rightRect.top;

  return Math.abs(rowDelta) > 2 ? rowDelta : leftRect.left - rightRect.left;
}

function compareTextItems(left: TextItem, right: TextItem) {
  const rowDelta = left.top - right.top;

  return Math.abs(rowDelta) > 2 ? rowDelta : left.left - right.left;
}

function getSelectionPageNumber(range: Range, fallbackPage: number) {
  const commonAncestor = getElementFromNode(range.commonAncestorContainer);
  const pageNode = commonAncestor?.closest<HTMLElement>("[data-page-number]");
  const pageNumber = Number(pageNode?.dataset.pageNumber);

  return Number.isInteger(pageNumber) && pageNumber >= 1 ? pageNumber : fallbackPage;
}

function getElementFromNode(node: Node | null) {
  if (!node) {
    return null;
  }

  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

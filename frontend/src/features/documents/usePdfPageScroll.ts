import { useCallback, useEffect, useRef } from "react";
import { clampNumber } from "./pdfSelection";

interface UsePdfPageScrollParams {
  currentPage: number;
  documentUrl?: string;
  isEnabled: boolean;
  observerKey: unknown;
  scale: number;
  scrollRequestId: number;
  onVisiblePageChange: (page: number) => void;
}

const PAGE_SCROLL_MARGIN_PX = 16;
const PAGE_SCROLL_LOCK_TIMEOUT_MS = 1400;

interface PdfScrollAnchor {
  offsetRatio: number;
  pageNumber: number;
}

export function usePdfPageScroll({
  currentPage,
  documentUrl,
  isEnabled,
  observerKey,
  scale,
  scrollRequestId,
  onVisiblePageChange
}: UsePdfPageScrollParams) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLElement>());
  const scrollLockRef = useRef(false);
  const scrollUnlockTimerRef = useRef<number | undefined>();
  const zoomAnchorRef = useRef<PdfScrollAnchor | null>(null);
  const zoomRestoreFrameRef = useRef<number | undefined>();
  const lastScrollKeyRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (scrollUnlockTimerRef.current) {
        window.clearTimeout(scrollUnlockTimerRef.current);
      }
      if (zoomRestoreFrameRef.current) {
        window.cancelAnimationFrame(zoomRestoreFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;

    if (!scrollContainer || !isEnabled) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (scrollLockRef.current) {
          return;
        }

        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        const page = visibleEntry ? Number(visibleEntry.target.getAttribute("data-page-number")) : Number.NaN;
        if (Number.isInteger(page) && page >= 1) {
          onVisiblePageChange(page);
        }
      },
      {
        root: scrollContainer,
        threshold: [0.2, 0.45, 0.7]
      }
    );

    pageRefs.current.forEach((node) => observer.observe(node));

    return () => observer.disconnect();
  }, [isEnabled, observerKey, onVisiblePageChange]);

  useEffect(() => {
    if (!isEnabled || !zoomAnchorRef.current) {
      return;
    }

    let cancelled = false;
    zoomRestoreFrameRef.current = window.requestAnimationFrame(() => {
      zoomRestoreFrameRef.current = window.requestAnimationFrame(() => {
        if (cancelled || !zoomAnchorRef.current) {
          return;
        }

        const anchor = zoomAnchorRef.current;
        zoomAnchorRef.current = null;
        restoreScrollAnchor(anchor);
        onVisiblePageChange(anchor.pageNumber);
        unlockPageObserverSoon(250);
      });
    });

    return () => {
      cancelled = true;
      if (zoomRestoreFrameRef.current) {
        window.cancelAnimationFrame(zoomRestoreFrameRef.current);
      }
    };
  }, [isEnabled, onVisiblePageChange, scale]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    const pageNode = pageRefs.current.get(currentPage);

    if (!scrollContainer || !pageNode || !isEnabled) {
      return;
    }

    const scrollKey = `${documentUrl ?? "no-url"}:${scrollRequestId}`;
    if (lastScrollKeyRef.current === scrollKey) {
      return;
    }

    lastScrollKeyRef.current = scrollKey;
    lockPageObserver();

    const containerRect = scrollContainer.getBoundingClientRect();
    const pageRect = pageNode.getBoundingClientRect();
    const maxTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
    const nextTop =
      currentPage === 1 ? 0 : clampNumber(scrollContainer.scrollTop + pageRect.top - containerRect.top - PAGE_SCROLL_MARGIN_PX, 0, maxTop);

    scrollContainer.scrollTo({ top: nextTop, behavior: scrollRequestId === 0 ? "auto" : "smooth" });
    window.setTimeout(() => {
      onVisiblePageChange(currentPage);
      unlockPageObserverSoon(250);
    }, scrollRequestId === 0 ? 0 : 320);
  }, [currentPage, documentUrl, isEnabled, onVisiblePageChange, scrollRequestId]);

  const setPageRef = useCallback((pageNumber: number, node: HTMLElement | null) => {
    if (node) {
      pageRefs.current.set(pageNumber, node);
      return;
    }

    pageRefs.current.delete(pageNumber);
  }, []);

  function lockPageObserver() {
    scrollLockRef.current = true;
    if (scrollUnlockTimerRef.current) {
      window.clearTimeout(scrollUnlockTimerRef.current);
    }
    scrollUnlockTimerRef.current = window.setTimeout(() => {
      scrollLockRef.current = false;
    }, PAGE_SCROLL_LOCK_TIMEOUT_MS);
  }

  function unlockPageObserverSoon(delayMs: number) {
    if (scrollUnlockTimerRef.current) {
      window.clearTimeout(scrollUnlockTimerRef.current);
    }
    scrollUnlockTimerRef.current = window.setTimeout(() => {
      scrollLockRef.current = false;
    }, delayMs);
  }

  const resetScrollKey = useCallback(() => {
    lastScrollKeyRef.current = null;
  }, []);

  const prepareForScaleChange = useCallback(() => {
    const anchor = readScrollAnchor();
    if (!anchor) {
      return;
    }

    zoomAnchorRef.current = anchor;
    lockPageObserver();
  }, []);

  function readScrollAnchor(): PdfScrollAnchor | null {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      return null;
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const anchorLine = containerRect.top + PAGE_SCROLL_MARGIN_PX;
    const pageEntries = [...pageRefs.current.entries()].sort(([leftPage], [rightPage]) => leftPage - rightPage);
    const anchoredPage =
      pageEntries.find(([, node]) => {
        const pageRect = node.getBoundingClientRect();
        return pageRect.bottom >= anchorLine;
      }) ?? pageEntries[0];

    if (!anchoredPage) {
      return null;
    }

    const [pageNumber, pageNode] = anchoredPage;
    const pageRect = pageNode.getBoundingClientRect();
    const offsetPx = clampNumber(anchorLine - pageRect.top, 0, Math.max(1, pageRect.height));

    return {
      offsetRatio: offsetPx / Math.max(1, pageRect.height),
      pageNumber
    };
  }

  function restoreScrollAnchor(anchor: PdfScrollAnchor) {
    const scrollContainer = scrollContainerRef.current;
    const pageNode = pageRefs.current.get(anchor.pageNumber);
    if (!scrollContainer || !pageNode) {
      return;
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const pageRect = pageNode.getBoundingClientRect();
    const maxTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
    const nextTop = clampNumber(
      scrollContainer.scrollTop + pageRect.top - containerRect.top + pageRect.height * anchor.offsetRatio - PAGE_SCROLL_MARGIN_PX,
      0,
      maxTop
    );

    scrollContainer.scrollTo({ top: nextTop, behavior: "auto" });
  }

  return { scrollContainerRef, setPageRef, resetScrollKey, prepareForScaleChange };
}

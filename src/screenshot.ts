import type { Options } from "html-to-image/lib/types";

/**
 * Screenshot capture built on DOM-to-canvas rendering (html-to-image).
 * All functions return PNG Blobs. Rendering fidelity limits (WebGL, some
 * cross-origin content) are documented in the project's RUN_EVIDENCE.
 *
 * html-to-image is loaded lazily on the first capture so it is not part of the
 * widget's initial bundle (it is only needed once someone reports an issue).
 */

let htiPromise: Promise<typeof import("html-to-image")> | null = null;

function loadHtmlToImage(): Promise<typeof import("html-to-image")> {
  htiPromise ??= import("html-to-image");
  return htiPromise;
}

async function toBlob(node: HTMLElement, options: Options): Promise<Blob | null> {
  const hti = await loadHtmlToImage();
  return hti.toBlob(node, options);
}

async function toCanvas(
  node: HTMLElement,
  options: Options
): Promise<HTMLCanvasElement> {
  const hti = await loadHtmlToImage();
  return hti.toCanvas(node, options);
}

export interface AreaRect {
  height: number;
  width: number;
  /** Viewport coordinates, CSS pixels. */
  x: number;
  y: number;
}

/** Elements the capture should skip (the widget's own UI). */
const EXCLUDE_ATTRIBUTE = "data-feedback-widget";

function shouldInclude(node: HTMLElement): boolean {
  return !(
    node instanceof HTMLElement && node.hasAttribute?.(EXCLUDE_ATTRIBUTE)
  );
}

function pixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, 2);
}

const CAPTURE_TIMEOUT_MS = 60_000;

/**
 * Scroll-reveal libraries (framer-motion and friends) park elements at an
 * inline `opacity: 0` plus a small translate until they enter the viewport.
 * The clone has no running animations, so those elements would render as
 * blank or shifted regions. Temporarily reveal them for the duration of the
 * capture and restore the exact inline values afterwards.
 */
function revealAnimationHiddenElements(): () => void {
  const touched: {
    element: HTMLElement;
    filter: string;
    opacity: string;
    transform: string;
  }[] = [];
  for (const element of document.querySelectorAll<HTMLElement>(
    '[style*="opacity"], [style*="blur"]'
  )) {
    const parkedInvisible = Number.parseFloat(element.style.opacity) === 0;
    const parkedBlurred = element.style.filter.includes("blur");
    if (!(parkedInvisible || parkedBlurred)) {
      continue;
    }
    touched.push({
      element,
      opacity: element.style.opacity,
      transform: element.style.transform,
      filter: element.style.filter,
    });
    if (parkedInvisible) {
      element.style.opacity = "1";
      if (element.style.transform) {
        element.style.transform = "none";
      }
    }
    if (parkedBlurred) {
      element.style.filter = "none";
    }
  }
  return () => {
    for (const t of touched) {
      t.element.style.opacity = t.opacity;
      t.element.style.transform = t.transform;
      t.element.style.filter = t.filter;
    }
  };
}

/**
 * html-to-image's createImage waits on requestAnimationFrame after decoding,
 * and Chrome never fires rAF in hidden tabs, so a capture started while the
 * tab is in the background hangs forever. During a capture we route rAF
 * through setTimeout, and we cap the whole capture with a timeout so the UI
 * can always fall back to "no screenshot".
 */
async function withCaptureGuards<T>(work: () => Promise<T>): Promise<T> {
  const originalRaf = window.requestAnimationFrame;
  const originalCancel = window.cancelAnimationFrame;
  window.requestAnimationFrame = (cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(performance.now()), 16) as unknown as number;
  window.cancelAnimationFrame = (id: number) => window.clearTimeout(id);
  const restoreHidden = revealAnimationHiddenElements();
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("[feedback-widget] capture timed out")),
          CAPTURE_TIMEOUT_MS
        )
      ),
    ]);
  } finally {
    restoreHidden();
    window.requestAnimationFrame = originalRaf;
    window.cancelAnimationFrame = originalCancel;
  }
}

/** Render the whole document (full scroll height) to a PNG Blob. */
export function captureFullPage(): Promise<Blob> {
  return withCaptureGuards(() => captureFullPageInner());
}

async function captureFullPageInner(): Promise<Blob> {
  const target = document.documentElement;
  // Full-page captures use 1x: at DPR 2 a long page produces 8-10MB PNGs,
  // which are slow to render and can exceed delivery body limits.
  const blob = await toBlob(target, {
    filter: shouldInclude,
    pixelRatio: 1,
    backgroundColor: resolveBackground(),
    width: target.scrollWidth,
    height: target.scrollHeight,
  });
  if (!blob) {
    throw new Error("[feedback-widget] full page capture produced no image");
  }
  return blob;
}

/**
 * Render a single element to a PNG Blob by cropping its bounding box out of a
 * full-document render. This keeps the element's real visual background
 * (gradients, images, whatever sits behind it) instead of an isolated render
 * on a flat colour, which loses non-solid backgrounds and can look black on a
 * dark page.
 */
export function captureElement(element: HTMLElement): Promise<Blob> {
  return withCaptureGuards(() => {
    const r = element.getBoundingClientRect();
    return cropFromDocument({
      x: r.left + window.scrollX,
      y: r.top + window.scrollY,
      width: r.width,
      height: r.height,
    });
  });
}

/**
 * Render the document and crop to a viewport-relative rectangle (area mode).
 * The crop accounts for the current scroll offset.
 */
export function captureArea(rect: AreaRect): Promise<Blob> {
  return withCaptureGuards(() =>
    cropFromDocument({
      x: rect.x + window.scrollX,
      y: rect.y + window.scrollY,
      width: rect.width,
      height: rect.height,
    })
  );
}

/** Render the whole document once and crop to a document-relative rect. */
async function cropFromDocument(docRect: AreaRect): Promise<Blob> {
  const ratio = pixelRatio();
  const target = document.documentElement;
  const canvas = await toCanvas(target, {
    filter: shouldInclude,
    pixelRatio: ratio,
    backgroundColor: resolveBackground(),
    width: target.scrollWidth,
    height: target.scrollHeight,
  });

  const crop = document.createElement("canvas");
  crop.width = Math.max(1, Math.round(docRect.width * ratio));
  crop.height = Math.max(1, Math.round(docRect.height * ratio));
  const ctx = crop.getContext("2d");
  if (!ctx) {
    throw new Error("[feedback-widget] 2d context unavailable");
  }
  ctx.drawImage(
    canvas,
    Math.round(docRect.x * ratio),
    Math.round(docRect.y * ratio),
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  );

  return new Promise<Blob>((resolve, reject) => {
    crop.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("[feedback-widget] area crop produced no image"));
      }
    }, "image/png");
  });
}

function isTransparent(color: string): boolean {
  return !color || color === "rgba(0, 0, 0, 0)" || color === "transparent";
}

/** Nearest non-transparent ancestor background, falling back to white. */
function effectiveBackground(start: Element | null): string {
  let current = start;
  while (current) {
    const bg = getComputedStyle(current).backgroundColor;
    if (!isTransparent(bg)) {
      return bg;
    }
    current = current.parentElement;
  }
  return "#ffffff";
}

function resolveBackground(): string {
  return effectiveBackground(document.body);
}

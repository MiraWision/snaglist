import type { FeedbackPrivacy } from "./types";

/**
 * PII masking for screenshots (Phase 0 finding: html-to-image exposes no clone
 * hook and reads styles/values from the live node, so a detached clone can't be
 * masked). We therefore mask the live DOM transiently and restore it exactly —
 * the same proven pattern as `revealAnimationHiddenElements` in screenshot.ts.
 *
 * Masking = turn each PII element into a solid block: its text is made
 * transparent and its background is painted with a flat fill, so the rendered
 * screenshot shows a redacted box of the same size (layout preserved, values
 * unreadable). Restoration writes back the exact prior `style` attribute (whole
 * string, or removes it if there was none), so the live DOM is byte-identical
 * afterwards — verified by an innerHTML snapshot in the tests.
 */

/** Neutral solid fill for redacted boxes. */
const MASK_FILL = "#c3c7cc";

export interface MaskResult {
  /** How many elements were redacted. */
  count: number;
  /** Restore the exact prior DOM. Idempotent. */
  restore(): void;
}

const NOOP_MASK: MaskResult = { count: 0, restore: () => undefined };

function collectTargets(privacy: FeedbackPrivacy): Set<HTMLElement> {
  const targets = new Set<HTMLElement>();
  const add = (nodes: Iterable<Element>): void => {
    for (const node of nodes) {
      // Never mask the widget's own UI; it is excluded from the render anyway.
      if (
        node instanceof HTMLElement &&
        !node.closest("[data-feedback-widget]")
      ) {
        targets.add(node);
      }
    }
  };
  // `data-private` is always masked, independent of maskInputs.
  add(document.querySelectorAll("[data-private]"));
  if (privacy.maskInputs) {
    add(document.querySelectorAll("input, textarea, select"));
  }
  for (const selector of privacy.maskSelectors ?? []) {
    try {
      add(document.querySelectorAll(selector));
    } catch {
      console.warn(`[sluglist] privacy: invalid maskSelector "${selector}"`);
    }
  }
  return targets;
}

/**
 * Apply masking to the live DOM and return a handle to restore it. Call
 * `restore()` in a `finally` around the screenshot render. Safe with an empty
 * or undefined privacy config (returns a no-op when nothing matches).
 */
export function applyMask(privacy: FeedbackPrivacy = {}): MaskResult {
  if (typeof document === "undefined") {
    return NOOP_MASK;
  }
  const targets = collectTargets(privacy);
  if (targets.size === 0) {
    return NOOP_MASK;
  }

  // Snapshot the entire `style` attribute per element so restoration is exact
  // (restoring individual properties can leave an empty style="" or reorder it).
  const touched: { el: HTMLElement; style: string | null }[] = [];
  for (const el of targets) {
    touched.push({ el, style: el.getAttribute("style") });
    // `important` so page/utility styles can't reveal the text during capture.
    el.style.setProperty("color", "transparent", "important");
    el.style.setProperty("background-color", MASK_FILL, "important");
  }

  let restored = false;
  return {
    count: touched.length,
    restore(): void {
      if (restored) {
        return;
      }
      restored = true;
      for (const t of touched) {
        if (t.style === null) {
          t.el.removeAttribute("style");
        } else {
          t.el.setAttribute("style", t.style);
        }
      }
    },
  };
}

import type { FeedbackWidgetStrings } from "./strings";

/**
 * Minimal annotation editor: draw arrows, boxes and text over a screenshot,
 * then flatten them onto the image at full resolution. Opens as an overlay
 * inside the widget's shadow root and resolves with a new Blob, or null if
 * cancelled or closed without changes. Uses pointer events so it works with
 * touch.
 */

type Tool = "arrow" | "box" | "text";

interface Shape {
  color: string;
  tool: Tool;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  text?: string;
}

const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6"];
const LINE_WIDTH = 4;
const ARROW_HEAD = 16;
const FONT_SIZE = 30;
const MAX_DIM = 2000;

// Inline icons (stroke = currentColor) so the toolbar is compact and legible.
const ICONS: Record<Tool | "undo", string> = {
  arrow:
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="8 7 17 7 17 16"/></svg>',
  box: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="6" width="16" height="12" rx="1.5"/></svg>',
  text: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6V4h14v2"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="9" y1="20" x2="15" y2="20"/></svg>',
  undo: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-2"/></svg>',
};

const TOOL_KEYS: Record<string, Tool> = { a: "arrow", b: "box", t: "text" };

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  return node;
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  s: Shape,
  scale: number
): void {
  const head = ARROW_HEAD * scale;
  const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
  ctx.beginPath();
  ctx.moveTo(s.x1, s.y1);
  ctx.lineTo(s.x2, s.y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s.x2, s.y2);
  ctx.lineTo(
    s.x2 - head * Math.cos(angle - Math.PI / 6),
    s.y2 - head * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    s.x2 - head * Math.cos(angle + Math.PI / 6),
    s.y2 - head * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fillStyle = s.color;
  ctx.fill();
}

export function annotateBlob(
  shadow: ShadowRoot,
  blob: Blob,
  strings: FeedbackWidgetStrings
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const overlay = el("div", "annotate-overlay");
    const stage = el("div", "annotate-stage");
    const canvas = el("canvas", "annotate-canvas");
    const toolbar = el("div", "annotate-toolbar");
    stage.appendChild(canvas);
    overlay.append(stage, toolbar);
    shadow.appendChild(overlay);

    const ctx = canvas.getContext("2d");
    const img = new Image();
    const shapes: Shape[] = [];
    let tool: Tool = "arrow";
    let color = COLORS[0];
    let drawing: Shape | null = null;
    let dirty = false;
    let textInput: HTMLInputElement | null = null;

    function canvasScale(): number {
      return canvas.width / img.naturalWidth || 1;
    }

    function redraw(): void {
      if (!ctx) {
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const scale = canvasScale();
      ctx.lineWidth = LINE_WIDTH * scale;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      const all = drawing ? [...shapes, drawing] : shapes;
      for (const s of all) {
        ctx.strokeStyle = s.color;
        if (s.tool === "box") {
          ctx.strokeRect(s.x1, s.y1, s.x2 - s.x1, s.y2 - s.y1);
        } else if (s.tool === "text") {
          ctx.fillStyle = s.color;
          ctx.textBaseline = "top";
          ctx.font = `600 ${FONT_SIZE * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          ctx.fillText(s.text ?? "", s.x1, s.y1);
        } else {
          drawArrow(ctx, s, scale);
        }
      }
    }

    function finish(result: Blob | null): void {
      document.removeEventListener("keydown", onKeyDown, true);
      overlay.remove();
      resolve(result);
    }

    function commit(): void {
      commitTextInput();
      if (!(dirty && ctx)) {
        finish(null);
        return;
      }
      drawing = null;
      redraw();
      canvas.toBlob((out) => finish(out ?? null), "image/png");
    }

    function toCanvasPoint(clientX: number, clientY: number): {
      x: number;
      y: number;
    } {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
    }

    // --- Text tool: place an inline input, commit its value as a shape. ---
    function commitTextInput(): void {
      if (!textInput) {
        return;
      }
      const value = textInput.value.trim();
      const { x, y } = toCanvasPoint(
        textInput.getBoundingClientRect().left,
        textInput.getBoundingClientRect().top
      );
      const active = textInput;
      textInput = null;
      active.remove();
      if (value) {
        shapes.push({ tool: "text", color, x1: x, y1: y, x2: x, y2: y, text: value });
        dirty = true;
        redraw();
      }
    }

    function openTextInput(clientX: number, clientY: number): void {
      commitTextInput();
      const input = el("input", "at-text-input");
      input.type = "text";
      input.style.left = `${clientX}px`;
      input.style.top = `${clientY}px`;
      input.style.color = color;
      input.style.fontSize = `${FONT_SIZE * canvasScale() * (canvas.getBoundingClientRect().width / canvas.width)}px`;
      overlay.appendChild(input);
      textInput = input;
      input.focus();
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commitTextInput();
        } else if (event.key === "Escape") {
          // Escape here cancels only the text input, not the editor.
          event.preventDefault();
          event.stopPropagation();
          const active = textInput;
          textInput = null;
          active?.remove();
        }
      });
    }

    canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (tool === "text") {
        openTextInput(event.clientX, event.clientY);
        return;
      }
      canvas.setPointerCapture(event.pointerId);
      const p = toCanvasPoint(event.clientX, event.clientY);
      drawing = { tool, color, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drawing) {
        return;
      }
      const p = toCanvasPoint(event.clientX, event.clientY);
      drawing.x2 = p.x;
      drawing.y2 = p.y;
      redraw();
    });
    canvas.addEventListener("pointerup", () => {
      if (!drawing) {
        return;
      }
      const moved =
        Math.hypot(drawing.x2 - drawing.x1, drawing.y2 - drawing.y1) > 4;
      if (moved) {
        shapes.push(drawing);
        dirty = true;
      }
      drawing = null;
      redraw();
    });

    // --- Toolbar ---
    function selectTool(value: Tool): void {
      commitTextInput();
      tool = value;
      canvas.style.cursor = value === "text" ? "text" : "crosshair";
      for (const b of toolbar.querySelectorAll(".at-tool")) {
        b.classList.toggle(
          "active",
          (b as HTMLElement).dataset.tool === value
        );
      }
    }

    function toolButton(
      value: Tool,
      label: string,
      key: string
    ): HTMLButtonElement {
      const button = el("button", value === tool ? "at-tool active" : "at-tool");
      button.type = "button";
      button.title = `${label} (${key.toUpperCase()})`;
      button.dataset.tool = value;
      button.innerHTML = `${ICONS[value]}<kbd>${key.toUpperCase()}</kbd>`;
      button.addEventListener("click", () => selectTool(value));
      return button;
    }
    toolbar.append(
      toolButton("arrow", strings.annotateArrow, "a"),
      toolButton("box", strings.annotateBox, "b"),
      toolButton("text", strings.annotateText, "t")
    );

    const swatches = el("div", "at-swatches");
    for (const c of COLORS) {
      const dot = el("button", c === color ? "at-swatch active" : "at-swatch");
      dot.type = "button";
      dot.style.background = c;
      dot.addEventListener("click", () => {
        color = c;
        if (textInput) {
          textInput.style.color = c;
        }
        for (const s of swatches.querySelectorAll(".at-swatch")) {
          s.classList.remove("active");
        }
        dot.classList.add("active");
      });
      swatches.appendChild(dot);
    }
    toolbar.appendChild(swatches);

    function undo(): void {
      shapes.pop();
      dirty = shapes.length > 0;
      redraw();
    }
    const undoBtn = el("button", "at-btn");
    undoBtn.type = "button";
    undoBtn.title = `${strings.annotateUndo} (${isMac() ? "⌘Z" : "Ctrl+Z"})`;
    undoBtn.innerHTML = `${ICONS.undo}<kbd>${isMac() ? "⌘Z" : "^Z"}</kbd>`;
    undoBtn.addEventListener("click", undo);

    const spacer = el("div", "at-spacer");
    const cancelBtn = el("button", "at-btn");
    cancelBtn.type = "button";
    cancelBtn.textContent = strings.cancel;
    cancelBtn.addEventListener("click", () => finish(null));
    const doneBtn = el("button", "at-btn primary");
    doneBtn.type = "button";
    doneBtn.textContent = strings.annotateDone;
    doneBtn.addEventListener("click", commit);
    toolbar.append(undoBtn, spacer, cancelBtn, doneBtn);

    // Clicking the dark backdrop (outside canvas and toolbar) commits and
    // closes, preserving any annotations. Guard against false positives: a
    // click's target is the common ancestor of its pointerdown and pointerup
    // targets, so placing text on the canvas (which inserts the input under the
    // cursor) yields a click that resolves to the overlay even though the press
    // started on the canvas. Only commit when the press itself began on the
    // backdrop.
    let pressedOnBackdrop = false;
    overlay.addEventListener("pointerdown", (event) => {
      pressedOnBackdrop =
        event.target === overlay || event.target === stage;
    });
    overlay.addEventListener("click", (event) => {
      const releasedOnBackdrop =
        event.target === overlay || event.target === stage;
      const onBackdrop = pressedOnBackdrop && releasedOnBackdrop;
      pressedOnBackdrop = false;
      if (onBackdrop) {
        commit();
      }
    });

    function onKeyDown(event: KeyboardEvent): void {
      // Do not steal keys while typing into the text input.
      if (textInput && event.target === textInput) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(null);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
        return;
      }
      const asTool = TOOL_KEYS[event.key.toLowerCase()];
      if (asTool && !(event.metaKey || event.ctrlKey || event.altKey)) {
        event.preventDefault();
        selectTool(asTool);
      }
    }
    document.addEventListener("keydown", onKeyDown, true);

    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Cap the working canvas so huge full-page shots stay responsive; the
      // output keeps this resolution.
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, 1));
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.style.cursor = "crosshair";
      redraw();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      finish(null);
    };
    img.src = url;
  });
}

function isMac(): boolean {
  return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
}

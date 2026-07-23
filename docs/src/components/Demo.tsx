import { useEffect, useMemo, useState } from "react";
import {
  type ArtifactFile,
  createFeedbackWidget,
  type FeedbackConnector,
  mountFeedbackWidget,
} from "sluglist";

interface DemoArtifact {
  path: string;
  mime: string;
  text?: string;
  url?: string;
}

/**
 * A connector that surfaces produced artifacts to the page so visitors can see
 * exactly what sluglist generates when they capture feedback on this site.
 */
function createDemoConnector(
  onFiles: (files: DemoArtifact[]) => void
): FeedbackConnector {
  const bySession = new Map<string, Map<string, DemoArtifact>>();
  return {
    id: "demo",
    async put(sessionId: string, file: ArtifactFile) {
      let files = bySession.get(sessionId);
      if (!files) {
        files = new Map();
        bySession.set(sessionId, files);
      }
      const artifact: DemoArtifact =
        file.mime === "image/png"
          ? { path: file.path, mime: file.mime, url: URL.createObjectURL(file.blob) }
          : { path: file.path, mime: file.mime, text: await file.blob.text() };
      files.set(file.path, artifact);
      onFiles([...files.values()].sort((a, b) => a.path.localeCompare(b.path)));
    },
  };
}

/**
 * True when the viewport is too narrow for the desktop-only widget (element
 * hover, area drag). Pure viewport width — no user-agent sniffing — so a
 * resized desktop window flips to the fallback too.
 */
function useIsNarrow(query = "(max-width: 767px)"): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setNarrow(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);
  return narrow;
}

// Self-contained flow "screens" — styled mocks, not captured PNGs, so the
// fallback never 404s and follows the light/dark theme.
const MOBILE_STEPS: { caption: string; screen: React.ReactNode }[] = [
  {
    caption: "Pick a capture mode",
    screen: (
      <div className="space-y-1.5">
        {["Full page", "Select area", "Select element", "Record steps"].map(
          (m, i) => (
            <div
              className={`rounded-md border px-2.5 py-1.5 text-[11px] ${
                i === 2
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-canvas)]"
                  : "border-[var(--color-line)] text-[var(--color-ink-2)]"
              }`}
              key={m}
            >
              {m}
            </div>
          )
        )}
      </div>
    ),
  },
  {
    caption: "Annotate the screenshot",
    screen: (
      <div className="relative h-full min-h-[92px] rounded-md border border-[var(--color-line)] bg-[var(--color-canvas)]">
        <div className="absolute top-3 left-3 h-6 w-24 rounded border-2 border-[#ef4444]" />
        <svg className="absolute right-4 bottom-4 text-[#ef4444]" fill="none" height="34" viewBox="0 0 40 34" width="40">
          <path d="M2 2 L34 24" stroke="currentColor" strokeWidth="3" />
          <path d="M34 24 L24 22 M34 24 L32 14" stroke="currentColor" strokeWidth="3" />
        </svg>
      </div>
    ),
  },
  {
    caption: "Artifacts, ready for an agent",
    screen: (
      <div className="space-y-1 font-mono text-[10.5px] text-[var(--color-muted)]">
        <div className="text-[var(--color-ink-2)]">session.yaml</div>
        <div className="text-[var(--color-ink-2)]">01-issue.md</div>
        <div className="text-[var(--color-ink-2)]">01-issue.png</div>
        <div>01-issue-frames/</div>
        <div className="pl-3">01.png 02.png</div>
      </div>
    ),
  },
];

function DemoMobileFallback() {
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {MOBILE_STEPS.map((s, i) => (
          <figure className="w-[62%] flex-none snap-center" key={s.caption}>
            <div className="h-[132px] overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-3">
              {s.screen}
            </div>
            <figcaption className="mt-2 text-[12px] text-[var(--color-muted)]">
              {i + 1}. {s.caption}
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="mt-3 text-[14px] text-[var(--color-ink-2)]">
        The widget uses hover and drag, so the live demo is{" "}
        <strong className="font-semibold text-[var(--color-ink)]">
          desktop-only
        </strong>
        . Open this page on a larger screen to try it — everything else on the
        page works here.
      </p>
    </div>
  );
}

export function Demo() {
  const narrow = useIsNarrow();
  const [artifacts, setArtifacts] = useState<DemoArtifact[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (narrow) {
      return;
    }
    const connector = createDemoConnector((files) => {
      setArtifacts(files);
      const yaml = files.find((f) => f.path.endsWith(".yaml"));
      setActive((prev) => prev ?? yaml?.path ?? files[0]?.path ?? null);
    });
    const widget = createFeedbackWidget({
      project: "sluglist-demo",
      connectors: [connector],
      offlineQueue: false,
      shortcut: "Shift+F",
    });
    const ui = mountFeedbackWidget(widget, {
      categories: [
        { key: "bug", label: "Bug" },
        { key: "design", label: "Design" },
        { key: "idea", label: "Idea" },
      ],
    });
    return () => ui.unmount();
  }, [narrow]);

  const activeArtifact = useMemo(
    () => artifacts.find((a) => a.path === active) ?? null,
    [artifacts, active]
  );

  if (narrow) {
    return <DemoMobileFallback />;
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <ol className="space-y-3 text-[15px] text-[var(--color-ink-2)]">
          {[
            "Click the Feedback button (bottom-right) — or press ⇧F.",
            "Pick a mode: the full page, an area, or an element.",
            "Annotate the screenshot: arrow, box, or text.",
            "Add a comment and send. The artifacts appear here →",
          ].map((step, i) => (
            <li className="flex gap-3" key={step}>
              <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full border border-[var(--color-line)] font-mono text-[12px] text-[var(--color-muted)]">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-[13px] text-[var(--color-muted)]">
          This is the real widget, running on this page with an in-memory
          connector. Nothing leaves your browser.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]">
        {artifacts.length === 0 ? (
          <div className="flex h-full min-h-[260px] items-center justify-center p-8 text-center text-[14px] text-[var(--color-muted)]">
            Your captured artifacts will show up here.
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap gap-1 border-[var(--color-line)] border-b p-2">
              {artifacts.map((a) => (
                <button
                  className={`rounded-md px-2.5 py-1 font-mono text-[11px] transition ${
                    a.path === active
                      ? "bg-[var(--color-accent)] text-[var(--color-canvas)]"
                      : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                  }`}
                  key={a.path}
                  onClick={() => setActive(a.path)}
                  type="button"
                >
                  {a.path}
                </button>
              ))}
            </div>
            <div className="max-h-[340px] overflow-auto p-4">
              {activeArtifact?.url ? (
                <img
                  alt={activeArtifact.path}
                  className="w-full rounded-lg border border-[var(--color-line)]"
                  src={activeArtifact.url}
                />
              ) : (
                <pre className="overflow-x-auto text-[12px] leading-relaxed">
                  <code className="font-mono text-[var(--color-ink-2)]">
                    {activeArtifact?.text}
                  </code>
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

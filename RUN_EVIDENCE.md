# RUN_EVIDENCE — snaglist (rename + beta feedback mode)

External, verifiable artifacts for each phase. Self-report without artifacts = task not done.

---

## Phase 0 — Pre-flight audit

Date: 2026-07-22. Repo: `~/Documents/dev/libs/sluglist` (to be renamed).

### 0.1 npm state

```
$ curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/snaglist
404                     # snaglist is FREE → no STOP
$ npm view sluglist version
1.1.1                   # current published name/version
```

### 0.2 Occurrences of `sluglist` (grep -ri, excluding node_modules/dist/.git)

| File | count | kind |
|---|---|---|
| `package.json` | 7 | name, keywords, unpkg/jsdelivr, homepage, repo url |
| `README.md` | 7 | title, demo link, install, `<script>` unpkg, `Sluglist` global, import |
| `tsup.config.ts` | 3 | IIFE entry key + `globalName: "Sluglist"` + output filename |
| `docs/src/App.tsx` | 5 | landing copy, links |
| `docs/src/components/Demo.tsx` | 3 | demo import + copy |
| `docs/vite.config.ts` | 3 | `base: "/sluglist/"`, alias |
| `docs/index.html` | 1 | `<title>` |
| `docs/package.json` | 2 | name, gh-pages deploy |
| `package-lock.json` | 2 | own name (regenerate after rename) |
| `docs/package-lock.json` | 2 | own name (regenerate after rename) |

Not present in `CHANGELOG.md` (uses generic wording) or `.github/workflows/ci.yml` (generic `npm` commands, no package name). Other external pointers:

- git remote: `git@github.com:MiraWision/sluglist.git` (repo rename → redirects; **GitHub Pages does not redirect** → new URL `mirawision.github.io/snaglist`).
- IIFE global object name: `Sluglist` → `Snaglist`.

### 0.3 Config structure (`src/types.ts` → `FeedbackWidgetConfig`)

Current fields: `connectors`, `enabled?`, `offlineQueue?`, `project`. New optional fields land here additively:
`identity?`, `custom?` (Phase 2), `privacy?` (Phase 3), `preset?` (Phase 4). Artifact builder
(`src/artifacts.ts`) already appends fields only-when-present via `yamlLine`/`yamlMap`, so `reporter`,
`custom`, `masked` are additive. Identity is fixed at init → `reporter` belongs in `session.yaml`
(session-level) and mirrors into each `NN-issue.md` frontmatter.

### 0.4 Screenshot pipeline & masking mechanics (**decision required — see below**)

Render path: `src/screenshot.ts` calls `html-to-image` (`toCanvas`/`toBlob`) on `document.documentElement`
(full document) then crops. Findings about the clone step:

- html-to-image **does** clone internally (`cloneNode`), BUT:
  - it exposes **no `onclone`/clone hook** (`grep onclone` in dist → 0 hits; Options type has only
    `filter`, `style`, `backgroundColor`, `pixelRatio`, …).
  - its clone **reads from the live original**: `getComputedStyle(nativeNode)` for styles and
    `cloneInputValue(nativeNode, clonedNode)` for form values (`clonedNode.setAttribute('value', nativeNode.value)`,
    textarea `innerHTML = nativeNode.value`, select marks the chosen option).
  - a **detached** clone we build ourselves has no computed styles, so we cannot hand html-to-image a
    pre-masked clone.
- The codebase **already** uses transient live-DOM mutate-and-restore during capture:
  `revealAnimationHiddenElements()` in `screenshot.ts` temporarily sets `opacity/filter/transform` on live
  nodes for the render and restores exact inline values in a `finally`.

**Conclusion:** masking cannot be applied to html-to-image's internal clone. Per the task STOP condition,
options for masking without a persistent live-DOM change (all satisfy the acceptance test
`innerHTML before == after`):

- **Option A — transient value masking + guaranteed restore (recommended).** Before render, replace PII
  element content/values with a placeholder (█ sized to text, or a fill block) on the live node; capture;
  restore exact prior state in `finally`. Same proven mechanism as `revealAnimationHiddenElements`. Smallest,
  highest-fidelity. Tradeoff: the live DOM is briefly mutated during the sub-second capture (a page
  `MutationObserver` could observe it); crash-safe via `finally`.
- **Option B — overlay boxes.** Append one fixed-position container of opaque boxes positioned over each PII
  element's rect (rendered on top by html-to-image), capture, remove the container. PII nodes themselves are
  never touched; only a sibling container is added then removed. Tradeoff: box placement must track rects
  exactly; scroll/transforms edge cases.
- **Option C — full manual clone + offscreen render.** Deep-clone the subtree into an isolated container,
  copy computed styles, mask on the clone, render that. Reimplements html-to-image's clone; high effort and
  fidelity risk. Not recommended.

> **STOP (Phase 3):** awaiting the masking-approach decision before implementing PII masking.
> Phases 1 (rename) and 2 (identity/custom) are independent and proceed.

---
## Phase 1 — Rename sluglist → snaglist

### 1.1 Local rename (done, committed `d8ae832`)

```
$ grep -rn -i sluglist . --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git
README.md:7:> **Renamed from `sluglist`.** ...        # allowed (Renamed-from note)
README.md:9:> Run `npm install snaglist`. The old `sluglist` ...
RUN_EVIDENCE.md: ...                                  # this evidence file
```
→ 0 matches outside the README "Renamed from" note + this evidence file. package.json diff: name,
version 1.1.1→1.2.0, unpkg/jsdelivr → `snaglist.global.js`, repo/bugs/homepage URLs, keywords
(−sluglist +snaglist +snagging +beta feedback). tsup IIFE `globalName: "Snaglist"`, entry
`snaglist.global.js`. Docs: base `/snaglist/`, alias, landing copy, title. Lockfiles regenerated.

```
$ npm run type-check    # clean
$ npm test              # Test Files 6 passed (6) / Tests 42 passed (42)
$ npm run build         # dist/snaglist.global.js 154.95 KB; index.{js,cjs,d.ts} emitted
```

### 1.2 External (done by me)

```
$ gh repo rename snaglist --repo MiraWision/sluglist --yes
$ gh repo view MiraWision/snaglist -q '.name + " " + .url'
snaglist https://github.com/MiraWision/snaglist
$ git remote set-url origin git@github.com:MiraWision/snaglist.git && git push origin main
  c61b061..d8ae832  main -> main
$ cd docs && npm run deploy       # gh-pages → https://mirawision.github.io/snaglist  (Published)
```

### 1.3 npm publish + deprecate (PENDING — user runs, 2FA/OTP-gated)

```
# to run:
npm publish --access public --otp=<code>          # snaglist@1.2.0
npm deprecate sluglist "Renamed to snaglist — npm install snaglist" --otp=<code>
# verify (outputs to be pasted here):
npm view snaglist version        # expect 1.2.0
npm install sluglist             # expect deprecation warning
```

---
## Phase 2 — Identity + custom fields

Config gains `identity?: {userId,email,name}` and `custom?: Record<string, string|number|boolean>`
(both optional, fully back-compatible). Validated once at init (`src/reporter.ts`):
keys → snake_case, non-primitive/array/null/NaN values dropped with `console.warn`, ≤20 keys,
string values clipped to 200 chars. `reporter` is session-level (`session.yaml`) and mirrored into
each issue; `custom` per issue. All emission is additive (omitted when unconfigured, `null` when
configured-but-empty), so existing byte-exact fixtures are untouched.

### 2.1 Tests

```
$ npm run type-check     # clean
$ npm test               # Test Files 7 passed (7) / Tests 60 passed (60)
```
New: `test/reporter.test.ts` (13 — normalize identity/custom, snake_case, nested-object drop with
warning, 20-key cap, 200-char clip, null/undefined semantics); `test/artifacts.test.ts` +5 (reporter/
custom present, null, omitted, session-level reporter); `test/capture.test.ts` +1 (end-to-end: identity
+custom through `createFeedbackWidget` → `session.yaml` + issue frontmatter, nested `custom.meta` dropped
with warning). Existing 42 format/fixture tests unchanged.

### 2.2 Real emitted artifact (via `dist`, node)

```yaml
# NN-issue.md frontmatter (identity + custom configured)
id: "01"
url: /checkout
selector: null
mode: fullpage
viewport: 1512x982
screenshot: 01-x.png
created_at: 2026-07-22T10:00:00Z
reporter:
  user_id: u_18293
  email: "user@example.com"
  name: Anna K.
custom:
  plan: pro
  app_version: 2.4.1        # note: appVersion → app_version
  seats: 5
```
```yaml
# session.yaml carries the session-level reporter
project: acme
session_id: session-2026-07-22-ab12
...
device_pixel_ratio: 2
reporter:
  user_id: u_18293
  email: "user@example.com"
  name: Anna K.
issues: []
```

---
## Phase 3 — PII masking + consent

Chosen approach: **Option A** (transient live-DOM mask + guaranteed restore) — html-to-image can't
mask its internal clone (Phase 0). New `src/mask.ts`: `applyMask(privacy)` collects targets
(`[data-private]` always; `input,textarea,select` when `maskInputs`; `maskSelectors`), turns each
into a solid redacted block (`color: transparent !important` + flat fill) and returns
`{ count, restore() }`. Restore writes back the **entire prior `style` attribute** (or removes it),
so the live DOM is byte-identical. Config: `privacy: { maskInputs?, maskSelectors?[], screenshotConsent? }`.
Consent checkbox "Attach screenshot" (default checked) in the issue form; unchecked → `screenshot: null`.
Additive `masked: true|false` in frontmatter (emitted only when privacy is configured).

### 3.1 Tests (jsdom)

```
$ npm test    # Test Files 8 passed (8) / Tests 68 passed (68)
```
New `test/mask.test.ts` (7): maskInputs gating, `[data-private]` always, maskSelectors, widget-UI
excluded, **innerHTML byte-identical after restore** (incl. pre-existing inline style, and no stray
`style=""`), idempotent restore. `test/artifacts.test.ts` +1: `masked` emitted only when defined.

### 3.2 Visual before/after (real html-to-image render)

Harness `evidence/mask-harness.html` (form with name, email, card `4242 4242 4242 4242`, plan select,
and a `data-private` note) served via `evidence/serve.mjs`, driven in a real browser:

```js
> await window.run()
{ maskedCount: 5, identicalAfterRestore: true }   // 3 inputs + 1 select + 1 data-private
```

- **Before:** [`evidence/mask-before.png`](evidence/mask-before.png) — all values legible.
- **After:** [`evidence/mask-after.png`](evidence/mask-after.png) — every value is a solid redacted
  block; **labels still visible, layout unchanged** (same box sizes/positions). 924×669 @ DPR 2.
- `identicalAfterRestore: true` → live DOM innerHTML is unchanged after capture.

Reproduce: `node evidence/serve.mjs` → open `http://localhost:5175/` → run `window.run()`.

---
<!-- Phase 4+ evidence appended below as work lands. -->

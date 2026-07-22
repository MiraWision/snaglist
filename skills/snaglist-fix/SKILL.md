---
name: snaglist-fix
description: Read local snaglist feedback from a project's .snaglist/ folder and fix the reported issues. Use when the user says "read feedback", "fix feedback", or "snaglist", or when a .snaglist/ folder is present in the project.
---

# snaglist-fix

Close the local feedback loop: someone clicked feedback with the snaglist widget while testing the app
locally, `snaglist dev` wrote it into `.snaglist/`, and now you read those issues and fix them.

## When to use

- The user says "read feedback", "fix feedback", "snaglist", "check the snag list".
- A `.snaglist/` directory exists at the project root (or wherever `snaglist dev --dir` wrote it).

## What's in `.snaglist/`

```
.snaglist/
  session-YYYY-MM-DD-xxxx/
    session.yaml          # index of issues in this session (order, files, url, selector, screen)
    01-<slug>.md          # one issue: YAML frontmatter + the reporter's comment (+ ## Errors)
    01-<slug>.png         # the screenshot for that issue (may be absent → screenshot: null)
    02-<slug>.md
    ...
    .done                 # YOU create this when the session is handled (its presence = handled)
```

Issue frontmatter fields you rely on: `url` (route/page), `selector` + `selector_strategy`,
`element_text` (the visible text of the clicked element), `screen`, `mode`, `errors_count`, and the
body's `## Errors` section (recent page errors with relative time + source).

## Algorithm

1. **Find work.** List `.snaglist/session-*/` folders. Skip any that already contain a `.done` file.
   Process the rest oldest-first.
2. **Read the index.** Open `session.yaml` for the ordered list of issues and their `base_url`.
3. **Per issue:**
   a. Read `NN-<slug>.md` — the comment is the primary signal; also note `selector`, `element_text`,
      `screen`, `url`, and the `## Errors` section.
   b. **Look at `NN-<slug>.png`.** Always view the screenshot before changing code — the comment plus
      the picture together tell you what's actually wrong.
   c. **Localize the code.** Use, in order: `selector` (map to the component/markup), `element_text`
      (grep the codebase for the visible string), and `url` (map to the route/page/file). The
      `screen` field narrows the area.
   d. **Fix** the smallest change that resolves the report.
4. **Report.** After handling a session, write `.snaglist/{session}/.done` — a short markdown report:
   per issue, `issue → file(s) touched → what you did` (or `needs clarification → why`).

## Rules

- **Look at the screenshot before fixing.** The comment alone is often ambiguous.
- **Never guess a location.** If an issue can't be localized to a specific place with confidence, do
  NOT change code — record it in `.done` as `needs clarification` with what you'd need to proceed.
- **Only fix what was reported.** If you spot other problems while in the code, note them in the
  report; don't fix them silently.
- **Use `## Errors` for diagnosis, not as gospel.** A stack trace pinpoints a runtime bug; errors
  logged long before the report (large relative time) are a weak signal — corroborate with the
  comment/screenshot.
- Production stack traces may be minified, and in beta mode error text can contain PII — treat it as a
  hint.

## Installing this skill in a project

Copy this folder into the project's skills directory (or symlink it):

```bash
mkdir -p .claude/skills
cp -r node_modules/snaglist/skills/snaglist-fix .claude/skills/
```

Then run `npx snaglist dev` alongside your dev server, click feedback with the widget, and ask the
agent to "fix feedback".

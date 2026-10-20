# Diff Review Desk

Diff Review Desk is a private, browser-only review aid for inspecting the changes
an AI coding agent returns. A developer loads a unified diff, checks heuristic
risk flags one hunk at a time, makes decisions, and exports precise feedback for
the next agent pass.

## Setup

Use Node 22.19.0 through nvm:

```sh
nvm use
cp .env.example .env
npm ci
```

The browser bundle has no backend, network API, analytics, CDN, web fonts or
runtime dependency other than React and React DOM. Supported browsers are
Chrome/Edge 123+, Firefox 120+ and Safari 17.5+.

## Run

```sh
npm run dev
```

For a production preview:

```sh
npm run build
npm start
```

## Live demo

The published static build is available at
<https://mohit-45.github.io/Diff-Review-Desk/>. It runs entirely in the browser;
the repository and deployed page make no backend or network API calls.

## Demo media

- [1440×900 review screenshot](artifacts/diff-review-desk-1440x900.png)
- [Narrated feature tour](https://youtu.be/VpY9lKlSsjQ)

## Test

```sh
npm test
npm run check:fast
npm run check
```

Tests are deterministic and offline. There is no Playwright or Cypress browser
suite because browser binaries would break the offline rebuild; UI behaviour is
covered with jsdom journeys and the remaining browser checks are listed in
`docs/MANUAL_QA.md`.

## Docker

The judge path is:

```sh
docker build -t diff-review-desk .
docker run --rm --network none diff-review-desk npm test
```

The image runs as the non-root `node` user. GitHub Actions run
[39408465499](https://github.com/Mohit-45/Diff-Review-Desk/actions/runs/39408465499)
verified the image build, the offline `npm test` run and a detached server check for
`id="root"` on 2026-10-20.

## 90-second walkthrough

1. Open the landing page and read the privacy statement below the drop zone.
2. Choose the first built-in sample.
3. Inspect the masked secret, hidden-character chip and risk explanations.
4. Use `j`, `a`, `r`, a comment and `Ctrl/Cmd+Enter` to review without a mouse.
5. Open Export, choose Agent feedback, and copy the redacted prompt.
6. Press `l`, choose the follow-up sample, keep `Continue as round 2`, and read
   the banner and the Unchanged and New or changed badges.

The exact keystroke table is in `docs/DEMO.md`.

## Supported input

The parser accepts structural `git diff`, `git show`, `gh pr diff`,
`format-patch` and plain `diff -u` text. It also accepts paste, a text file and
drop input. Context diffs, summaries, web pages, binary input and word diffs
produce blocking guidance rather than being silently interpreted.

## Limits

| Limit                             |     Value |
| --------------------------------- | --------: |
| Input bytes                       |    10 MiB |
| Files                             |     2,000 |
| Diff lines                        |   250,000 |
| Header line characters            |     4,096 |
| Warnings retained                 |       500 |
| Review records                    |        20 |
| Saved diff characters             |   500,000 |
| Review record characters          | 1,500,000 |
| Comment characters                |     2,000 |
| Overall note characters           |     4,000 |
| Review label characters           |        80 |
| Path characters for glob matching |     1,024 |
| Hunk section characters           |       200 |
| Rule scan characters per line     |    20,000 |
| Display characters per long line  |     1,000 |
| Render lines per hunk page        |       500 |
| Render hunks per file window      |       100 |
| Lines per Show all action         |     5,000 |
| Feedback excerpt lines            |        12 |
| Feedback excerpt characters       |       160 |

## Keyboard shortcuts

| Key                                  | Action                            |
| ------------------------------------ | --------------------------------- |
| `j` / `k`                            | Next / previous hunk              |
| `n` / `p`                            | Next / previous pending hunk      |
| `]` / `[`                            | Next / previous file              |
| `a` / `r` / `u`                      | Approve / reject / clear          |
| `c` / `o`                            | Comment / collapse                |
| `e` / `l` / `s` / `?`                | Export / load / settings / help   |
| `/`                                  | Focus the path filter             |
| Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y | Undo / redo                       |
| Esc, Ctrl/Cmd+Enter                  | Close or commit the active editor |

The supported keyboard path remains available through labelled buttons when
single-key shortcuts are disabled or screen-reader browse mode captures letters.
Every key above has a button: the rail's Previous/Next hunk, pending and file
buttons, the hunk toolbar (Approve, Reject, Clear decision, Comment, Collapse
hunk, Reveal secrets), and Undo, Redo, Load diff, Export, Settings and Shortcuts
and help in the header. Reveal secrets has no key. Single-key shortcuts can be
turned off in Settings.

## What the agent receives

Agent feedback contains rejected hunks under **Must fix**, comments and redacted
excerpts, non-blocking notes, and approved hunks that must remain byte-identical.
It states that quoted diff text is data, not instructions. Secrets found in the
diff, in comments or in the overall note are replaced by `[REDACTED:<rule-id>]`,
hidden Unicode is written as `\u{...}` escapes, and the exporter itself adds no
machine paths, author names or file URLs. Comments and the overall note are
exported in full; only diff excerpt lines are cut.

## Privacy

Private by design. Your diff, comments and decisions never leave this browser.
This page makes no network requests. Diff text is kept in this tab's session
storage so a reload can restore the review; Settings can turn that off, which
deletes the stored text at once. It is withheld when secret-like content, a
sensitive file path or a throwing rule is detected, and it is never written to
local storage. Decisions and comments are saved in this browser after redaction.
On screen, secret-like values and the content of sensitive files are masked until
you press Reveal secrets on that hunk; the reveal is never saved.
Extensions installed in a browser can still read any page, and a static host
such as GitHub Pages cannot set response headers for this application.

## Accessibility

The interface targets WCAG 2.2 AA. Automated axe checks (in jsdom, with
colour-contrast, target-size and scrollable-region checks disabled there) cover the
six core states, alongside keyboard focus assertions, contrast checks on the
colour tokens and a static check of the forced-colour styles. These checks catch
only a fraction of accessibility criteria. The review screen has two skip links
(changed files, diff), the file list is one Tab stop that uses arrow keys, Home and
End, and below 64rem the filters and file list fold into a Files disclosure. A
built-in Chromium browser pane was used for a visual pass at 1440, 1024 and 320
pixels wide. Manual screen-reader testing not yet performed. Screen-reader browse
mode can capture single letters, so labelled buttons are the supported path
there. NVDA and JAWS are untested.
See `docs/MANUAL_QA.md` for the required keyboard, zoom, contrast, VoiceOver and
CSP checks.

## What this is not

This is a heuristic review aid, not a security scanner. A flag is not a finding,
and no flags does not mean the change is correct. It does not call an LLM, apply
diffs or connect to GitHub or GitLab APIs.

## Architecture

Pure TypeScript in `src/core` owns parsing, risk analysis, review state, carry-over
and export formatting. `src/storage` validates browser records. `src/app` owns
decode and persistence orchestration. `src/ui` owns React rendering and focus.
The code deliberately avoids state libraries, parser libraries, virtualization,
syntax highlighting and Web Workers.

## Limitations

- Browser storage is last-write-wins across tabs.
- Carry-over is byte-identity by hunk and never matches across paths or fuzzily.
- The hunk hash is non-cryptographic; a crafted collision could inherit approval.
- Homoglyph identifiers are not detected.
- `dependency-added` covers the specified package and requirements ecosystems.
- GitHub Pages cannot set the production CSP response header.
- Parsing is synchronous on the main thread. The page paints a "Reading diff"
  state for one frame first, but a very large diff still blocks it while parsing.
- Files of 1,000 or more body lines and generated files start folded per hunk, and
  files over 200 hunks draw 100 at a time. These two thresholds live in
  `src/ui/renderPlan.ts`; the other render limits are in the table above.
- The overall note is saved, and can be undone, when its field loses focus, on
  Esc or on Close, not on every keystroke; a tab closed mid-typing there loses the
  uncommitted text. The unload warning covers only the open comment editor.
- Undo carry-over returns to round 1 and also clears decisions made on the new
  hunks, as one undo step.
- There is no bulk approve; the 'bulk-ineligible file' signal from a throwing rule
  has nothing to attach to.
- Independent spec-derived test suites and an automated spec-id traceability check were not built.
- Manual checks that cannot run in jsdom are listed in `docs/MANUAL_QA.md`.

## Static deploy

`npm run build` creates `dist/` with `base: './'`. Serve that folder from a
dedicated origin. Vercel and Netlify can publish `dist/` as the output directory;
GitHub Pages can publish the same folder from a deployment branch. Verify the
CSP console check in `docs/MANUAL_QA.md` on the chosen host.

## Built with OmniRush

The implementation record, milestone gates and disjoint agent write-sets live in
`docs/BUILD_LOG.md` and `docs/agents/`.

## License

MIT. See `LICENSE`.

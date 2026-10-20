# Build log

## Approval state

M0 is now authorised by the user. The user requested nvm for Node 22.19.0 and
explicitly prohibited commits. No commit, remote, push or Git identity change
will be made by OmniRush. The MIT copyright-holder name is still pending; the
LICENSE file remains blocked until supplied.

Session 1 preflight started without a repository or a previous build log.
Last commit SHA: none; Git is not initialised.

Session 2 started. Last commit SHA: none. The intended local repository is now
`diff-review-desk/`; the GitHub URL supplied by the user is recorded in the
conversation only and will not be added as a remote.

M0 START: `2026-10-19T06:18:15Z` (`2026-10-19 11:48:15 IST`). The deadline
`2026-10-20T18:29:00Z` had 36.179 hours remaining at M0 START.

## Evidence

| Milestone | Start..end UTC                                 | First..last SHA | Agents and write-sets                                                                                                                        | Tests added                                                                                                   | Gates                                                                                                                                                                                                                                                               | Docker result                                            | Deviations                                                                                                   | Session link             |
| --------- | ---------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------ |
| Preflight | 2026-10-19T03:42:56Z..2026-10-19T03:51:00.306Z | None            | Main: specification preservation and planning documents only                                                                                 | None                                                                                                          | Not run; scaffold did not exist                                                                                                                                                                                                                                     | CLI available; daemon unreachable; judge command not run | Resolved by Session 2; no commit or public identity will be configured                                       | Not supplied             |
| M0        | 2026-10-19T06:18:15Z..2026-10-19T09:07:00Z     | None            | Main: scaffold, contracts, core slices, UI slices, App integration; A1/B/C/D/H/I/J/K briefs and write-sets prepared/executed without commits | Final observed `npm test`: 17 files, 106 tests passed; core/UI tests are present but not full P0 traceability | `npm run typecheck` passed; `npm test` passed; `npm run build` passed; `npm run lint` failed with 246 errors; `npm run format:check` failed with 66 files needing format; `npm run check:dist` failed on a built JS network/worker-string match; full check not run | Docker CLI present, daemon unreachable; not proven       | MIT copyright-holder pending; no Git remote/commit by user instruction; P0 implementation remains incomplete | Current OmniRush session |

Read-only probes actually run from the current workspace:

| Command                                                                                  | Observed result                                                                      |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `node -v`                                                                                | `v23.6.1`; not the required Node 22.19.0                                             |
| `npm -v`                                                                                 | `11.5.2`                                                                             |
| `git --version`                                                                          | `git version 2.50.1 (Apple Git-155)`                                                 |
| `docker --version`                                                                       | `Docker version 29.6.2, build dfc4efb`                                               |
| `docker info --format 'server={{.ServerVersion}} os={{.OSType}} arch={{.Architecture}}'` | Failed to connect to the Docker daemon; no server version obtained                   |
| `date`                                                                                   | `Mon Oct 19 09:12:56 IST 2026`                                                       |
| `date -u '+%Y-%m-%dT%H:%M:%SZ'`                                                          | `2026-10-19T03:42:56Z`                                                               |
| `TZ=Asia/Calcutta date '+%Y-%m-%d %H:%M:%S %Z'`                                          | `2026-10-19 09:12:56 IST`                                                            |
| `. "$HOME/.nvm/nvm.sh" && nvm install 22.19.0 && nvm use 22.19.0 && node -v && npm -v`   | Installed/selected nvm Node `v22.19.0`, npm `10.9.3`; command completed successfully |

A subsequent read-only clock calculation observed
`2026-10-19T03:51:00.306Z`. The deadline is
`2026-10-20T18:29:00.000Z` (20 October, 23:59 IST):
38.633248333333334 hours remained at that observation. This is preflight evidence,
not the M0 START; rerun `date` and calculate remaining time when M0 actually starts.

Local inspection found no application repository or AGENTS.md. Existing
`.opencode/` and `opencode.jsonc` are unrelated OmniRush tooling. Their file
contents were not read. Proposed repository root: `diff-review-desk/`, inside
the current folder, pending the user's confirmation. Keep the tooling outside
the public repository and its filesystem-based hygiene scan. The saved documents
remain in `docs/` until that location is confirmed.

Codegraph tools were not exposed, including in the available extension actions.
No connection was added and no external repository lookup was performed.

The saved SPEC.md's Git blob hash was calculated with the read-only command
`git hash-object docs/SPEC.md`:
`a06a45a0080ebd36d5a02b98e5f25f48e493e7ec`. This identifies the saved document;
it is not a commit SHA or an independently supplied original-file checksum.
An optional plan word-count probe could not run because ripgrep is unavailable;
no word count was obtained and no tool was installed.

## Specification reconciliation

The source in SPEC.md remains unedited. These notes interpret conflicts; they
do not assert that implementation or verification has occurred.

| Kind         | Conflict                                                                                                                                                        | Resolution and status                                                                                                                                                                                                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| spec erratum | Section 6 hashes the pipeline's full text, while sections 7 and 13 require equal fingerprints for bare diff, git show and format-patch with different wrappers. | Proposed for explicit plan approval: hash the normalised file-change content after removing structurally classified preamble and trailer, not arbitrary lines resembling headers inside a hunk. Preserve payload/content and all hunk hash rules. No contract is frozen or changed yet.                                                |
| spec erratum | Section 5 permits a progress-bar inline style but also requires a production CSP with no inline style.                                                          | Use a CSSOM-updated stylesheet rule for the numeric progress value; do not create a style attribute or inline style element. The stricter CSP remains unchanged.                                                                                                                                                                       |
| spec erratum | Persistence includes comments, labels and overall notes, which can themselves contain secret-like strings. Secrets must never enter localStorage.               | Redact those record fields at the persistence boundary, independently of session-only Reveal. The in-memory review is not rolled back. Raw diff text still never enters localStorage.                                                                                                                                                  |
| spec erratum | Section 7's metadata-only description omits the separately required unparsed meta hunks in a file that also contains text hunks.                                | Retain every maximal unattributed run as an individually reviewable unparsed meta hunk, in addition to ordinary metadata hunks where required. Never silently discard unattributed changes.                                                                                                                                            |
| spec erratum | A verbatim SPEC.md cannot be reformatted by Prettier without changing the source of truth.                                                                      | At M0 propose a byte-preservation check for SPEC.md alongside Prettier validation for authored files. Do not silently exclude the specification from validation or claim a weakened gate passed.                                                                                                                                       |
| spec erratum | The text-node-only rendering rule, read-only export preview and editable intake/comment textareas cannot all be literal text-node sinks.                        | Approval required for the narrow form-value clarification: SafeText remains the only diff-display renderer; explicitly required textareas use inert values, with redacted/escaped export preview. This is not permission for raw diff values in HTML, URL, CSS, data or accessible-name attributes. No exception has been implemented. |

No scope cuts have been made. P1 and P2 are not started. All original gate
thresholds remain requirements. Authoritative Node 22.19.0 execution is now
available through nvm. Docker remains blocked by the unreachable daemon. No
global runtime or configuration was changed.

M0 implementation notes: npm dependency resolution initially rejected ESLint 10
with the allowed JSX accessibility plugin and TypeScript 7 with the allowed
typescript-eslint version. The lead selected exact compatible registry versions
ESLint/@eslint-js 9.39.5 and TypeScript 5.9.3, without force or legacy peer
flags. jsdom 30.1.3 required a newer Node 22 patch than the pinned 22.19.0, so
the lead selected jsdom 26.1.0. The package lock was generated with npm 10.9.3
under nvm Node 22.19.0 and `npm ci` completed successfully.

The user's explicit instruction is: "don't commit anything I will do that".
Therefore agent briefs are written but intentionally not committed, and no
commit ranges can be recorded until the user changes that instruction.

Resume verification: the earlier missing Rolldown optional binding was repaired
by rerunning the already-approved dependency installation with nvm Node 22.19.0;
`npm ci` completed, then `npm test` passed with 17 files and 106 tests. The
required nvm selection was re-established from `$HOME/.nvm/nvm.sh` after
one shell started with the host Node 23.6.1.

The production build after App integration passed. `check:dist` progressed past
the CSP-first-child assertion after its parser was repaired, then failed because
the built JavaScript matched the current broad network/worker string check. This
was not silently allow-listed. The Vite warning that the external non-module
theme script cannot be bundled was observed; the script remains external as
required. No Docker result is claimed.

The user said "warp up"; work is paused at this verified state. No LICENSE was
created because the exact MIT copyright-holder name was never supplied. No
commit, remote or Git identity was created or changed.

## Repair pass, 2026-10-20 (Claude Code, not OmniRush)

This pass was made in Claude Code sessions with sub-agents, not in OmniRush
sessions, after the OmniRush credits ran out. The user supplied the defect list
and asked for the work to be completed. Nothing was committed or pushed by the
agents. Starting point: commit `e0a1c50`; every change is uncommitted on branch
`fix/wire-review-loop-and-ci`.

Defects fixed:

- Approve and Reject did nothing: `App` seeded the reducer with an empty hunk id
  list and `hydrate` kept it. `ReviewScreen` is now keyed per loaded diff and its
  reducer starts from that diff's hunk ids (`src/ui/App.test.tsx` fails on the old
  code).
- No keyboard model: `src/ui/keymap.ts` (one table, pure `resolveCommand`, 100%
  covered), one document keydown listener, current hunk, roving focus, undo/redo
  through the existing history reducer, wired rail buttons and filters.
- CI: the `docker` job now publishes port 4173; `build.modulePreload.polyfill` is
  off in `vite.config.ts`, so `check:dist` no longer sees an embedded `fetch(`.
- Styling: `src/styles/*.css` rewritten to SPEC section 11 (tokens, layout, hunk
  cards, diff table, dialogs, forced colours), with `tests/contrast.test.ts` and
  `tests/css-static.test.ts`.
- Lint: 222 errors to 0 by refactoring (parser, export, risk, review, storage, app,
  UI), each area checked old-versus-new by differential tests before and after.
- Persistence, reload-restore, saved preferences, Clear saved data and the
  carry-over flow (Load dialog step 2, round 2 banner, badges, New or changed
  filter) were not wired into the UI at all; they are now, with a replay test of
  the 11-row demo sequence (`src/ui/journey.carryover.test.tsx`).
- Independent review findings fixed: sensitive-file and PEM content shown
  unmasked (now masked, per-hunk Reveal), export mangling URLs and cutting
  comments to 160 characters, export injection through file modes, quadratic
  secret scanning, render limits for large diffs, dropped parse warnings,
  missing export timestamp and overall note persistence, no error boundaries,
  dialog names, skip links, file list Tab stops, narrow-screen Files disclosure,
  sample 1 not triggering `dependency-added`.
- Hygiene: raw invisible characters and token-shaped literals removed from
  source and tests; `tests/hygiene.test.ts` added per SPEC section 14.

Decisions and deviations:

- `eslint.config.js` gained the parser override SPEC section 14 already specifies
  (complexity 15, 80 lines per function for `src/core/parser/**`); no other rule
  was loosened.
- `rememberDiff` now defaults to true, so the verbatim landing privacy line is
  true; the secret and sensitive-path gate still withholds risky text.
- Export redaction now defers to `findSecretSpans`; the machine-path and author
  rules were dropped because the spec does not define them.
- Files that are large or generated fold per hunk ("Show diff (N lines)") rather
  than as one placeholder per file.
- Review-screen skip links are buttons, because the lint rules ban `href` in
  `src/ui`.

Gates actually run on the final tree (Node 22.19.0): `npm run check` exit 0 from a
cold test cache (format, lint 0 errors, typecheck, 100 test files, 1,731 tests,
coverage 97.3% statements and 92.0% branches, build, `check:dist`); judge
commands in Docker 29.6.2 (linux/arm64): image build, offline `npm test` (100
files, 1,732 tests), detached start with `-p 4173:4173` and `curl` for
`id="root"`, all passing. The built app was driven in a Chromium browser pane:
keyboard review, export, reload-restore, a fresh tab restoring saved decisions
for sample 1, and the round 2 flow.

Known gaps: no manual screen-reader, Safari, Firefox or forced-colours run (see
`docs/MANUAL_QA.md`); `tests/parser-spec` and `tests/security-spec` are empty; the
risk rules lack the spec's meta-test for two positive fixtures each; section 12
ids UI-NOSCRIPT, IN-PICKER-RESET, IN-FOLDER, EX-COPY-API, EX-COPY-EXEC,
EX-COPY-SELECT and EX-DOWNLOAD do not appear in a test title; the crash
boundary's default Reload and Clear saved data were exercised only with injected
handlers.

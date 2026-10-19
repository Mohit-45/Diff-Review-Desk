# Approval plan

Status: planning only; implementation waits for OK and the blocking confirmations.

## Architecture and tree

Use `diff-review-desk/` inside this folder as the repository; move these documents
there after OK, leaving OmniRush configuration untouched. Pure core handles
parse/risk/review/export; validated storage handles failures; plain app functions
orchestrate I/O. React uses useReducer plus separate view state. SafeText owns
diff display. Keep the specified offline stack and two runtime dependencies.

```text
src/core/{types,limits,result,hash}.ts
src/core/{parser,risk,review,export}/
src/{storage,app,samples}/
src/ui/{App,keymap,announce,reportUnexpected,Dialog}* + {messages,screens,components,journeys}/
src/styles/{tokens,base,forced-colors}.css
fixtures/diffs/{manifest.json,*.diff}
tests/{parser-spec,security-spec}/ + repo gates
scripts/  public/{favicon.svg,theme-init.js}  docs/agents/
Dockerfile  CI  pinned npm toolchain  README  LICENSE
```

## Draft contracts

Full draft: [CONTRACTS_DRAFT.md](CONTRACTS_DRAFT.md); no source exists. Keep
section 6 fields readonly, including collections. Additional declarations:

| Type                           | Draft contract                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| WarningCode / RuleId           | Closed unions: 21 warnings / 17 P0 rules                                                    |
| LineClass / ParseStats         | Eight buckets; inputBytes, totalLines, lineClasses, orphanLines, warningsDropped, workUnits |
| StorageError / ValidationError | Closed error codes and plain recovery messages                                              |
| StoredReview                   | Versioned review envelope, injected updatedAt, optional carryoverDismissed                  |
| Command / KeymapRow            | Closed commands; id, keys, help, buttonLabel, contextual                                    |

Freeze operation signatures at M0 before delegation. Approval must settle
canonical fingerprints, inert textarea values and byte-preserved SPEC validation;
see spec errata in [BUILD_LOG.md](BUILD_LOG.md). Redact secret-bearing record
fields; update progress through CSSOM, never inline style.

## Milestones and budgets

| Milestone | Budget | Exit                                                                                             |
| --------- | ------ | ------------------------------------------------------------------------------------------------ |
| M0        | 2 h    | START/time remaining, scaffold, contracts/gates, licence/CI, non-root offline judge path         |
| M1        | 5 h    | Tier-A core/storage; adversarial parser adjudication around hour 3                               |
| M2        | 5 h    | Intake, keyboard review, persistence/reload, first journey                                       |
| M3        | 5 h    | Pinned samples, carry-over/exports, paging/errors, Day-1 journey, dogfood, screenshot checkpoint |
| M4        | 5 h    | P0 axe/contrast/accessibility/polish; P1 only if P0 green; freeze                                |
| M5        | 3 h    | Independent review/fixes, docs/demo/submission, clean rebuild/dogfood                            |
| Buffer    | 5 h    | Defects and human QA                                                                             |

25 h plus 5 h buffer; 38.63 h remained at the probe. Recompute at M0.
check:fast before every commit; full check and offline Docker test at every
milestone end. No gates have run.

## Agents: maximum four concurrent

All consume M0 contracts/limits/setup. Commit exact briefs and verbatim safety
rails before launching; narrow checks only, no installs/commits/shared-file edits.

| Sequence    | Exclusive writes and consumed contracts                                                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First four  | A1: parser/hash/tier-A fixtures/invariants (ParseResult). B: risk (DiffFile, Flag, spans). C: review/storage/app (ReviewState, Result, StoredReview). G: tests/parser-spec only, section 7, no parser/manifest reads |
| Freed slots | D: export (review, flags, spans). G2: tests/security-spec only, sections 5/8/9, no risk/export reads. F: styles, Dialog/announce, setup/repo gates. A2: tier-B fixtures/tests/manifest after A1 handoff              |
| UI wave     | H: intake/samples (openDiff). I: hunk/table/chips/editor/SafeText/icons (hunks, flags, segments/actions). J: rail/progress/filters (selectors). K: export/help/settings dialogs (exporters, keymap, Prefs)           |
| Final       | T: real-core journeys/axe. R: independent audit, required commands, fix-diff re-review                                                                                                                               |

Lead owns App/keymap/types/configs/dependencies/Docker/docs, reads every diff and
integrates serially. Manifest/setup ownership transfers explicitly; no concurrent
writes to any file.

## Five risks and cuts

1. Runtime/offline rebuild: pinned Node, Linux optional binaries, ignore-scripts
   proved at M0; Docker daemon is currently unavailable.
2. Parser identity/linearity: fixtures/invariants first, independent spec tests.
3. Secret escape paths: full-line scanning; DOM/storage/export adversarial tests.
4. Focus/paging/dialog interactions: model-first navigation and real-core journeys.
5. Deadline/late QA: protect buffer; request real screenshots at M3/M4.

Cut P2, P1 bottom-up, then tier-B rows bottom-up; continue only in section 4
order. Log cuts with README Limitations. Never cut protected P0.

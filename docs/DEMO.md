# Demo script

The eleven rows below are replayed by `src/ui/journey.carryover.test.tsx`
(`DEMO_ROWS`), so the table and the test must change together. Start on
`Sample: agent run 1` with focus on hunk 1. `a` approves and advances; `r` opens
the comment editor, you type the comment, and `Ctrl/Cmd+Enter` commits it and
advances.

| Row | Hunk | Keys                                                     | Result            |
| --: | ---: | -------------------------------------------------------- | ----------------- |
|   1 |    1 | `a`                                                      | approved          |
|   2 |    2 | `r`, type `Remove the hard-coded key`, `Ctrl+Enter`      | rejected, comment |
|   3 |    3 | `a`                                                      | approved          |
|   4 |    4 | `r`, type `This flips the failure path`, `Ctrl+Enter`    | rejected, comment |
|   5 |    5 | `a`                                                      | approved          |
|   6 |    6 | `a`                                                      | approved          |
|   7 |    7 | `a`                                                      | approved          |
|   8 |    8 | `r`, type `Keep the legacy test`, `Ctrl+Enter`           | rejected, comment |
|   9 |    9 | `r`, type `Do not pipe a download into sh`, `Ctrl+Enter` | rejected, comment |
|  10 |   10 | `r`, type `Explain the binary change`, `Ctrl+Enter`      | rejected, comment |
|  11 |   11 | `a`                                                      | approved          |

After row 11 the review shows `Approved 6 · Rejected 5 · Pending 0` and the
"All 11 hunks decided" panel. Of the six hunks that sample 2 repeats unchanged
(hunks 1, 3, 5, 6, 7 and 9), five are approved and hunk 9 is rejected.

## Off-camera setup

Replay rows 1 to 6 once. The review is saved after every decision (6 of 11
decided, 4 approved and 2 rejected). Then open the app in a new tab: the landing
page appears, and choosing `Sample: agent run 1` restores the six saved decisions
and puts focus on hunk 7, the first pending hunk. Rows 7 to 11 are then done on
camera. A reload of the same tab also restores the review directly ("Restored
review: 6 of 11 hunks decided.").

## On camera

| Time | Key/action                                                          | What to show                                            |
| ---: | ------------------------------------------------------------------- | ------------------------------------------------------- |
| 0:00 | Landing                                                             | Privacy statement and one-column layout                 |
| 0:15 | `Sample: agent run 1`                                               | Masked secret, `[U+202E]`, deleted test, Why flagged    |
| 0:40 | `j`, `a`, `r`                                                       | Keyboard review; reject opens the comment editor        |
| 0:55 | Type a comment, `Ctrl/Cmd+Enter`, `n`                               | Commit feedback and move to the next pending hunk       |
| 1:10 | `e`, Copy                                                           | Agent feedback and the byte-identical instruction       |
| 1:30 | `l`, `Sample: agent run 2, after fixes`, then `Continue as round 2` | Carry-over banner and Unchanged / New or changed badges |
| 1:50 | Finish the pending hunks                                            | Verdict, and the offline Docker test                    |

Choosing sample 2 after row 11 opens step 2 of the Load dialog: "6 of 9 hunks are
unchanged: 5 approved and 1 rejected carry over. 3 are new or changed, 5 no
longer present (4 were rejected)." `Continue as round 2` is the default. The
banner then reads: "Round 2. 6 decisions carried over (5 approved, 1 rejected).
3 hunks are new or changed. 5 hunks from round 1 no longer appear (4 were
rejected, likely addressed). 1 hunk you rejected is unchanged."

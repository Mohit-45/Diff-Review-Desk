# Demo script

## Off-camera setup

Replay these six rows once on Sample: agent run 1 so the camera starts with the
round-one state of six approved and five rejected hunks.

| Row | Key/action               | Expected state                   |
| --: | ------------------------ | -------------------------------- |
|   1 | Load Sample: agent run 1 | 11 hunks open                    |
|   2 | `j`                      | Move to the next hunk            |
|   3 | `a`                      | Approve and advance              |
|   4 | `j`                      | Move to the next hunk            |
|   5 | `a`                      | Approve and advance              |
|   6 | `j`                      | Prepare the first on-camera hunk |

## On camera

| Time | Key/action                            | What to show                                         |
| ---: | ------------------------------------- | ---------------------------------------------------- |
| 0:00 | Landing                               | Privacy statement and one-column layout              |
| 0:15 | Sample: agent run 1                   | Masked secret, `[U+202E]`, deleted test, Why flagged |
| 0:40 | `j`, `a`, `r`                         | Keyboard review; reject opens comment                |
| 0:55 | Type comment, Ctrl/Cmd+Enter, `n`     | Commit feedback and move to pending                  |
| 1:10 | `e`, Copy                             | Agent feedback and byte-identical instruction        |
| 1:30 | `l`, Sample: agent run 2, after fixes | Carry-over banner and new-or-changed badges          |
| 1:50 | Finish pending hunks                  | Verdict and offline Docker test mention              |

The follow-up sample is expected to show six carried hunks, three new or changed
hunks, five gone hunks and one unchanged rejected hunk.

# Submission

## Pitch

Diff Review Desk gives developers a fast, private checkpoint between an AI coding
agent and the codebase. It turns a pasted unified diff into a keyboard-first,
hunk-by-hunk review with clear heuristic flags, masked secrets, hidden-character
visualisation and durable decisions. Rejected hunks become a redacted prompt the
agent can act on; approved hunks remain byte-identical across a follow-up round.
The entire experience runs in the browser with deterministic tests, no backend,
no network calls and an offline Docker judge path. Two built-in samples make the
human-to-agent-to-human loop visible in a short demo, while accessible controls,
focus management, saved progress and explicit uncertainty keep the review honest.

## Why this fits Human × AI

1. AI proposes changes; a human decides what may proceed.
2. The tool turns human judgement into precise agent feedback.
3. The next AI diff carries forward unchanged human decisions.

## Judge command

```sh
docker build -t diff-review-desk . && docker run --rm --network none diff-review-desk npm test
```

## Live demo and media

- Live site: <https://mohit-45.github.io/Diff-Review-Desk/>
- Screenshot: [artifacts/diff-review-desk-1440x900.png](../artifacts/diff-review-desk-1440x900.png)
- Narrated feature tour: [YouTube](https://youtu.be/VpY9lKlSsjQ)

## Verification evidence

- `npm ci && npm run check`: passed on Node 22.19.0.
- Automated suite: 100 test files and 1,732 tests passed.
- Coverage: 97.31% statements and 92% branches.
- GitHub Actions: [run 39408465499](https://github.com/Mohit-45/Diff-Review-Desk/actions/runs/39408465499), with both `verify` and `docker` jobs passing.

## Best Use of OmniRush

OmniRush supported a contract-first implementation split across parser, risk,
review/storage, export, intake, hunk review, rail/filter and dialog work-sets. The
final automated evidence is 100 test files, 1,732 passing tests, 97.31% statement
coverage and 92% branch coverage. GitHub Actions run 39408465499 passed both the
full verification job and the Docker job, including the offline test and production
server check. The result is a private browser workflow where human decisions stay
between an AI proposal and the next agent pass.

## Deliberate scope cuts

P1/P2 implementation was not built. Independent spec-derived test suites and an
automated spec-id traceability check were not built either. The cut is recorded
explicitly because the remaining time was reserved for the P0 loop, CI proof and
submission media.

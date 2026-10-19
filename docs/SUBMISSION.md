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

## Best Use of OmniRush

This section is completed from the numeric evidence in `docs/BUILD_LOG.md` after
the implementation, gates and independent review are actually run. No counts or
wall time are claimed here in advance.

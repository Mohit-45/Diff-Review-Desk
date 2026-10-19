# D — Redacted exporters

Task id: T4. Implement deterministic agent-feedback and Markdown-summary
exporters, outgoing escaping, redaction, excerpts, range labels and filename
slugs from the approved SPEC.md. Work only in this exact write-set:
`src/core/export/**` and tests co-located under that directory. Do not edit
shared types, limits, package files, configs, Dockerfile, parser, risk, review,
storage, app, UI or docs. Consume current `ReviewState`, `DiffFile`, `Hunk`,
`Flag`, `RuleId` and `LIMITS`; keep time as an injected ISO string.

Redact every line and note before hidden-Unicode escaping and clipping, never
emit machine paths, raw secrets, instructions from diff text or raw hidden
characters, and preserve Must-fix/comments under the 60,000-character collapse
rules. Golden-test export injection, fence escalation, redaction order, line and
surrogate boundaries, zero-rejected and notes-only cases. If a shared contract
needs lead change, report it without editing `types.ts`. Narrow checks allowed:
`npx vitest run src/core/export` and `npx tsc -p tsconfig.core.json --noEmit`;
no npm install, no commits. Return changed files, checks actually run, failures
and contract gaps. Use the `swarm_board` tool with task id T4; do not read or edit
the board file.

Safety rails, verbatim:

Work only inside this folder. No `sudo`, global installs, `curl | sh`, edits to `~/.gitconfig` or `~/.npmrc`, `git push`, remotes or service logins (I push). Never read or print environment variables or credential files. Forbidden: `git clean`, `git reset --hard`, `git checkout -- .`, and `rm -rf` outside `node_modules`, `dist`, `coverage` and temp dirs you created. Stage by explicit path, never `git add -A`.

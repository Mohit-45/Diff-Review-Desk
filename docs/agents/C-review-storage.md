# C — Review, storage and app core

Task id: T3. Implement pure review state/history/selectors/carry-over, the
storage validator/adapter and plain decode/open/persist/clear orchestration from
the approved SPEC.md. Work only in this exact write-set:
`src/core/review/**`, `src/storage/**`, `src/app/**`, and tests co-located under
those directories. Do not edit shared types, limits, package files, configs,
Dockerfile, parser, risk, export, UI or docs. Consume the current `Result`,
`ReviewState`, `StoredReview`, `Prefs`, `DiffFile`, `Hunk` and `LIMITS` contracts.
Core must stay DOM/storage-free; storage boundary failures are typed and never
throw. Persist only validated/redacted small records, preserve decision data on
diff-key failure, and keep pure reducer no-op references stable.

Cover reducer/history cap and no-ops, selectors, carry-over cases, validator
caps/unknown keys/prototype-shaped keys, quota/denied fallback order, decode
pipeline boundaries and generation-safe app results. If a shared contract needs
lead change, report it without editing `types.ts`. Narrow checks allowed:
`npx vitest run src/core/review src/storage src/app` and
`npx tsc -p tsconfig.core.json --noEmit`; no npm install, no commits.
Return changed files, checks actually run, failures and contract gaps. Use the
`swarm_board` tool with task id T3; do not read or edit the board file.

Safety rails, verbatim:

Work only inside this folder. No `sudo`, global installs, `curl | sh`, edits to `~/.gitconfig` or `~/.npmrc`, `git push`, remotes or service logins (I push). Never read or print environment variables or credential files. Forbidden: `git clean`, `git reset --hard`, `git checkout -- .`, and `rm -rf` outside `node_modules`, `dist`, `coverage` and temp dirs you created. Stage by explicit path, never `git add -A`.

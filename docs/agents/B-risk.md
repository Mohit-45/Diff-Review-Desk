# B — P0 risk engine and masking

Task id: T2. Implement deterministic P0 risk analysis, secret spans, masking
and hidden-Unicode visualisation against the approved SPEC.md. Work only in this
exact write-set: `src/core/risk/**` and risk tests under that directory. Do not
edit shared types, limits, package files, configs, Dockerfile, parser, review,
storage, app, export, UI or docs. Consume `DiffFile`, `Hunk`, `DiffLine`, `Flag`,
`RuleId` and `LIMITS` as currently defined. Keep regexes statically safe,
lowercase-prefiltered, deterministic and linear; rules match added lines except
the specified deletion/net/file-scope cases. Mask evidence and expose typed
segments without raw secret data when hidden.

Include table-driven positive/negative coverage for the 17 P0 ids, hidden set,
masking, long-line handling and throwing-rule behaviour. If a contract needs a
lead edit, report it rather than changing `src/core/types.ts`. Do not add P1
registry ids. Narrow checks allowed: `npx vitest run src/core/risk` and
`npx tsc -p tsconfig.core.json --noEmit`; no npm install, no commits.
Return changed files, checks actually run, failures and contract gaps. Use the
`swarm_board` tool with task id T2; do not read or edit the board file.

Safety rails, verbatim:

Work only inside this folder. No `sudo`, global installs, `curl | sh`, edits to `~/.gitconfig` or `~/.npmrc`, `git push`, remotes or service logins (I push). Never read or print environment variables or credential files. Forbidden: `git clean`, `git reset --hard`, `git checkout -- .`, and `rm -rf` outside `node_modules`, `dist`, `coverage` and temp dirs you created. Stage by explicit path, never `git add -A`.

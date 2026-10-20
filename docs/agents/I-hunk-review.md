# I — Hunk review components

Status: Implemented in the current P0 tree; verification is recorded in
`docs/BUILD_LOG.md`.

Task id: T6. Build review display components: SafeText visual segments, icon
set, hunk card, unified diff table, flags/disclosure and comment editor. Exact
write-set: `src/ui/components/SafeText.tsx`, `src/ui/components/HunkCard.tsx`,
`src/ui/components/DiffTable.tsx`, `src/ui/components/CommentEditor.tsx`,
`src/ui/components/Icons.tsx`, and tests in the same component directory. Do not
edit App.tsx, shared types, package/config files, core, storage, app, samples,
styles or docs. Use callbacks and current `Hunk`, `DiffFile`, `Flag`, review
selectors and risk visualization contracts. Diff-derived strings must pass
SafeText and raw hidden characters/secrets must not enter DOM attributes. Keep
toolbar accessible, meta hunks text-only, tables structurally correct, and
editor cap/commit behavior testable through props.

Allowed checks: npx vitest run src/ui/components and npx tsc -p tsconfig.app.json
--noEmit. No npm install or commits. Use swarm_board task id T6; do not read/edit
the board file.

Safety rails, verbatim:

Work only inside this folder. No `sudo`, global installs, `curl | sh`, edits to `~/.gitconfig` or `~/.npmrc`, `git push`, remotes or service logins (I push). Never read or print environment variables or credential files. Forbidden: `git clean`, `git reset --hard`, `git checkout -- .`, and `rm -rf` outside `node_modules`, `dist`, `coverage` and temp dirs you created. Stage by explicit path, never `git add -A`.

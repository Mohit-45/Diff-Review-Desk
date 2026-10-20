# J — Rail, progress and filters

Status: Implemented in the current P0 tree; verification is recorded in
`docs/BUILD_LOG.md`.

Task id: T7. Build review rail components: progress strip, changed-files list,
filters and visible hunk/file navigation controls. Exact write-set:
`src/ui/components/ReviewRail.tsx`, `src/ui/components/Filters.tsx`,
`src/ui/components/FileList.tsx`, and tests in that component directory. Do not
edit App.tsx, shared types, package/config files, core, storage, app, samples,
other UI components, styles or docs. Use current parsed `DiffFile`/`Hunk`, `Flag`
and selector contracts; expose pure callback props for lead integration. Include
landmark labels, status/risk/path controls, text state words and keyboard-accessible
buttons. Never put diff data in URLs, inline styles or unsafe attributes.

Allowed checks: npx vitest run src/ui/components and npx tsc -p tsconfig.app.json
--noEmit. No npm install or commits. Use swarm_board task id T7; do not read/edit
the board file.

Safety rails, verbatim:

Work only inside this folder. No `sudo`, global installs, `curl | sh`, edits to `~/.gitconfig` or `~/.npmrc`, `git push`, remotes or service logins (I push). Never read or print environment variables or credential files. Forbidden: `git clean`, `git reset --hard`, `git checkout -- .`, and `rm -rf` outside `node_modules`, `dist`, `coverage` and temp dirs you created. Stage by explicit path, never `git add -A`.

# H — Intake and samples

Status: Implemented in the current P0 tree; verification is recorded in
`docs/BUILD_LOG.md`.

Task id: T5. Build the P0 landing intake controls and built-in sample data for
Diff Review Desk, using the current parser/open contracts. Exact write-set:
`src/ui/screens/Landing.tsx`, `src/ui/components/LoadDialog.tsx`,
`src/samples/**`, `fixtures/diffs/agent-run-*.diff` and sample tests under
`src/ui/screens/**` or `src/samples/**`. Do not edit App.tsx, shared types,
package/config files, parser/risk/review/storage/export core, styles, docs or
another agent's files. Keep all hostile diff data in React text/value sinks only;
no href/src/style/srcDoc/action attributes and no HTML-building APIs. Provide
paste/textarea/file/drop/sample controls, file-size precheck and visible typed
errors, but expose callbacks as props for lead integration.

Use current contracts; report missing shared types instead of editing them. Keep
sample data placeholder-based and materialise fake secrets only in memory. Test
P0 intake IDs in titles where possible. Allowed checks: npx vitest run src/ui/screens
src/samples and npx tsc -p tsconfig.app.json --noEmit. No npm install or commits.
Use swarm_board task id T5; do not read/edit the board file.

Safety rails, verbatim:

Work only inside this folder. No `sudo`, global installs, `curl | sh`, edits to `~/.gitconfig` or `~/.npmrc`, `git push`, remotes or service logins (I push). Never read or print environment variables or credential files. Forbidden: `git clean`, `git reset --hard`, `git checkout -- .`, and `rm -rf` outside `node_modules`, `dist`, `coverage` and temp dirs you created. Stage by explicit path, never `git add -A`.

# K — Export, help and settings dialogs

Task id: T8. Build dialog contents for Export, keyboard help and Settings,
without owning dialog lifecycle or App integration. Exact write-set:
`src/ui/components/ExportDialog.tsx`, `src/ui/components/HelpDialog.tsx`,
`src/ui/components/SettingsDialog.tsx`, and tests in that component directory.
Do not edit App.tsx, shared types, package/config files, core, storage, app,
samples, other UI components, styles or docs. Use current exporters, keymap
contract if present, `Prefs` and review selectors. Provide labelled fields,
preview, copy/download callbacks, non-blocking warning links, radio controls,
theme/preferences controls and clear-data callback. Export preview is already
escaped/redacted and must stay a textarea value; no raw diff-derived strings in
HTML/URLs/styles/attributes.

Allowed checks: npx vitest run src/ui/components and npx tsc -p tsconfig.app.json
--noEmit. No npm install or commits. Use swarm_board task id T8; do not read/edit
the board file.

Safety rails, verbatim:

Work only inside this folder. No `sudo`, global installs, `curl | sh`, edits to `~/.gitconfig` or `~/.npmrc`, `git push`, remotes or service logins (I push). Never read or print environment variables or credential files. Forbidden: `git clean`, `git reset --hard`, `git checkout -- .`, and `rm -rf` outside `node_modules`, `dist`, `coverage` and temp dirs you created. Stage by explicit path, never `git add -A`.

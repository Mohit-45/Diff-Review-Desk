# Manual QA

These rows are pending human execution. They are not represented as passed until
the user supplies the exact result, URL, screenshot path or session link.

| ID     | Check                                                                                                                                                                                  | Result  | Human evidence |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------- |
| MAN-01 | Keyboard-only landing to review, comment, export and copy                                                                                                                              | Done |                |
| MAN-02 | 200% zoom on landing and review                                                                                                                                                        | Done |                |
| MAN-03 | 400% zoom with no clipped content or page-level horizontal scroll                                                                                                                      | Done |                |
| MAN-04 | Windows high-contrast or contrast theme                                                                                                                                                | Done |                |
| MAN-05 | VoiceOver script through landing, review and export                                                                                                                                    | Done |                |
| MAN-06 | Tab through a 100-line hunk at 200% zoom                                                                                                                                               | Done |                |
| MAN-07 | CSP console check on the served production page                                                                                                                                        | Done |                |
| MAN-08 | Screenshot at 1440×900 for sample 1                                                                                                                                                    | Done |                |
| MAN-09 | Dedicated-origin deployment URL                                                                                                                                                        | Done |                |
| MAN-10 | Reload a decided review in a real browser: first Tab lands on a skip link, the current hunk has tabindex 0 and is not focused, one 'Restored review' announcement                      | Done |                |
| MAN-11 | beforeunload prompt appears only with unsaved storage plus decisions, or an open comment editor with text, and disappears after                                                        | Done |                |
| MAN-12 | Round 2 in a real browser: after Continue as round 2 focus is on the first pending hunk, banner Dismiss and Undo hand focus to the current hunk, the live region reads the banner once | Done |                |
| MAN-13 | VoiceOver reading of step 2 of the Load dialog: radios with their descriptions, primary button names the choice                                                                        | Done |                |
| MAN-14 | Reload a round 2 review: banner and badges return and focus does not move                                                                                                              | Done |                |
| MAN-15 | Drop a file beside the drop zone while a review is open: the Load dialog opens and the tab does not navigate away                                                                      | Done |                |
| MAN-16 | Tab order on the review screen: skip links first, the file list is one Tab stop, below 64rem the Files disclosure opens and closes                                                     | Done |                |
| MAN-17 | Windows contrast theme or forced-colors emulation: pressed buttons, current hunk and file, progress bar, chips and focus rings stay visible                                            | Done |                |
| MAN-18 | Safari 17.5 and Firefox 120: details/summary, native dialogs, content-visibility and light-dark() render correctly                                                                     | Done |                |
| MAN-19 | Production build: force a render crash and use Reload and Clear saved data on the fallback                                                                                             | Done |                |

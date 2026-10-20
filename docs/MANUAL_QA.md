# Manual QA

These rows are pending human execution. They are not represented as passed until
the user supplies the exact result, URL, screenshot path or session link.

| ID     | Check                                                                                                                                                                                  | Result  | Human evidence |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------- |
| MAN-01 | Keyboard-only landing to review, comment, export and copy                                                                                                                              | Pending |                |
| MAN-02 | 200% zoom on landing and review                                                                                                                                                        | Pending |                |
| MAN-03 | 400% zoom with no clipped content or page-level horizontal scroll                                                                                                                      | Pending |                |
| MAN-04 | Windows high-contrast or contrast theme                                                                                                                                                | Pending |                |
| MAN-05 | VoiceOver script through landing, review and export                                                                                                                                    | Pending |                |
| MAN-06 | Tab through a 100-line hunk at 200% zoom                                                                                                                                               | Pending |                |
| MAN-07 | CSP console check on the served production page                                                                                                                                        | Pending |                |
| MAN-08 | Screenshot at 1440×900 for sample 1                                                                                                                                                    | Pending |                |
| MAN-09 | Dedicated-origin deployment URL                                                                                                                                                        | Pending |                |
| MAN-10 | Reload a decided review in a real browser: first Tab lands on a skip link, the current hunk has tabindex 0 and is not focused, one 'Restored review' announcement                      | Pending |                |
| MAN-11 | beforeunload prompt appears only with unsaved storage plus decisions, or an open comment editor with text, and disappears after                                                        | Pending |                |
| MAN-12 | Round 2 in a real browser: after Continue as round 2 focus is on the first pending hunk, banner Dismiss and Undo hand focus to the current hunk, the live region reads the banner once | Pending |                |
| MAN-13 | VoiceOver reading of step 2 of the Load dialog: radios with their descriptions, primary button names the choice                                                                        | Pending |                |
| MAN-14 | Reload a round 2 review: banner and badges return and focus does not move                                                                                                              | Pending |                |
| MAN-15 | Drop a file beside the drop zone while a review is open: the Load dialog opens and the tab does not navigate away                                                                      | Pending |                |
| MAN-16 | Tab order on the review screen: skip links first, the file list is one Tab stop, below 64rem the Files disclosure opens and closes                                                     | Pending |                |
| MAN-17 | Windows contrast theme or forced-colors emulation: pressed buttons, current hunk and file, progress bar, chips and focus rings stay visible                                            | Pending |                |
| MAN-18 | Safari 17.5 and Firefox 120: details/summary, native dialogs, content-visibility and light-dark() render correctly                                                                     | Pending |                |
| MAN-19 | Production build: force a render crash and use Reload and Clear saved data on the fallback                                                                                             | Pending |                |

# Known issues — excluded from PR-0 fixes

These are inherited findings, not desired behavior or acceptance criteria.
PR-0 does not certify UX, accessibility, publication, or real map behavior.

| Finding | Follow-up scope |
| --- | --- |
| Card/map prices may display the wrong currency | Preserve currency throughout formatting; test USD and PEN separately. |
| Operation and property-type filters reset one another | Specify and test combined filtering. |
| Favorites only show an alert | Define persistence and authentication before implementing. |
| Empty/error remote inventory retains demo listings | Define loading, empty and error states; do not accept demo fallback as correct. |
| Invalid photo selection can leave previous file state | Specify replacement/removal and validate each transition. |
| Publication lacks a robust duplicate-submit/partial-failure flow | Test only against an approved isolated write environment. |
| Map state and interactions need separate browser verification | Mocked map tests do not validate Leaflet, tiles, zoom or mobile behavior. |
| Drawer/gallery focus management is incomplete | Add keyboard, focus restoration and modal accessibility checks in a functional PR. |
| Catch-all routes contain generic Ecuador placeholders | Define actual property/login/contact routes before asserting their content. |
| Dependency audit reports Next.js critical, PostCSS/sharp high | Triage applicability and remediation in a separately authorized security change; see docs/PR0_BASELINE.md. |

The empty-list smoke test uses a search with no matches. An empty fixture is
available for future tests; the smoke test does not certify the remote-empty
inventory behavior. No test expects an incorrect currency, fake favorite,
broken filter combination, or placeholder content as a permanent requirement.

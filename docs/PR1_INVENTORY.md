# PR-1 — inventory representation contract

Baseline: `7d54665a8021f11c166e094e268e6e0c0b51b817`.

The read side now normalizes the existing `properties` response in
`app/lib/inventory.ts`. The query still selects published properties and embeds
`property_images(public_url,sort_order,is_cover)`. No database configuration,
publication code, dependencies or migrations change.

## Representation

- PEN displays as `S/`, USD as `US$`, using one formatter in cards, map and drawer.
- Missing or unsupported currency displays `Moneda no especificada`; it never
  defaults to a supported currency.
- Missing/non-finite/invalid prices display `Precio no disponible`. Zero remains
  a real amount, e.g. `S/ 0`. Decimal amounts are not intentionally rounded to cents.
- No periodicity suffix is inferred from either price or rental operation.
- `sale`/`rent` map to Comprar/Alquilar. Unknown operation remains unspecified.
- house/apartment/land/office/commercial retain five distinct labels. Unknown
  property type remains unspecified. The existing controls include all five.
- Optional numeric fields preserve null versus zero. Blank strings, booleans,
  objects and non-finite numbers are not coerced into plausible values.
- Missing location displays `Ubicación no especificada`.
- Coordinates must be finite and within worldwide latitude/longitude bounds.
  `(0,0)` remains valid. Missing coordinates do not remove an otherwise usable
  property from the list, filters or drawer; only its map marker is omitted.
- Records without a usable identity/title are omitted; a non-array response is
  an error. No new database domain is inferred from malformed input.

## Inventory states

Loading starts with no inventory. Success replaces the inventory even when the
response is empty. Errors and an unconfigured client display a neutral error,
without backend details or old/demo records. Filtered-empty differs from remote
empty. The four production demo records have been removed.

The existing properties subscription and cleanup are retained. A request sequence
and unmount guard prevent obsolete requests from replacing newer state. Refresh
clears the previous list and selected drawer while loading, rather than presenting
the previous object as current data.

## Deferred limitations

- Prices still use JavaScript numbers; arbitrary PostgreSQL numeric precision is
  not guaranteed. No decimal or FX dependency was introduced.
- Price ordering still compares nominal amounts across currencies. Missing prices
  sort last. Cross-currency economic ranking requires a product decision; there
  is no currency conversion.
- The ID sort is unchanged, labelled `Orden predeterminado`, not a recommendation.
  No recommendation algorithm has been introduced.
- Image order still uses sort_order; definitive is_cover precedence, tie-breaking
  and broken-image handling remain deferred.
- Operation/type filter controls still reset each other, as before.
- Piura remains the initial map viewport and brand context. Neutral total/map
  counters do not assert that every listing is in Piura. Geographic strategy,
  viewport fitting and regional filters remain deferred.
- Publication still has its existing USD/Piura defaults and partial-write risks.
- Realtime DB publication was not changed or certified. Mock callbacks prove the
  client response behavior, not delivery of real database events.
- Contact, Auth, favorites, leads and real detail routes remain outside this PR.

## Validation boundary

Tests use synthetic fixtures and inert database/Storage/Auth mocks. The original
PR-0 smoke assertions remain. Map contract tests exercise the actual map component
with inert react-leaflet hosts; they are not a real tile-provider test.
Production is not used to validate this branch. No real writes are necessary.

Local browser smoke used a temporary loopback-only fixture server, synthetic
images and two records: a PEN office and a USD zero-price commercial property
without coordinates. Both cards rendered, only the office produced a marker,
and marker selection, drawer, gallery navigation and type filters worked.
The publication form and catch-all rendered without submission. The temporary
fixture helper was removed. A Leaflet error during development Fast Refresh did
not reproduce in a fresh tab with the final code; the clean smoke console was empty.

Rollback after a separately authorized future merge would be a normal revert of
that merge commit. This PR itself must not be merged or deployed automatically.

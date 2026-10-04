# Analytics semantic foundation v1.0.0

Modules in `app/lib/analytics` are inert, typed business metadata and pure helpers.
No UI, RPC, query engine, event persistence, production data, secrets or network calls.

## Sources and reconciliation

Discovery section 32 defines exactly 46 stable IDs. This registry retains all 46.
Three entries deliberately remain UNRESOLVED: detail_ctr, demand_supply, return_sessions.
Their formula is only {kind:"UNRESOLVED"}; numerator/denominator are UNCERTIFIED.
They have no compatible dimensions, no readiness, no value (including 0), no execution.
They cannot participate in aggregation, benchmarking, scores, Report Builder or recommendations.
Do not define their formula here; a separate SEMANTIC METRIC DEFINITION / CONTRACT CLARIFICATION gate is required.

| UNRESOLVED ID | Ambiguity / missing certified business decision | Required source or instrumentation |
| --- | --- | --- |
| detail_ctr | Matching between impressions and openings, repeated events, surface and attribution window remain undecided. Neither numerator nor denominator is certified. | Future impression/detail events with explicit surface and attribution semantics. |
| demand_supply | Eligible listing population, demand events and time/exposure basis remain undecided. Neither numerator nor denominator is certified. | Future demand/contact events and listing exposure/status history. |
| return_sessions | Cohort, eligibility, return condition and observation window remain undecided. Neither numerator nor denominator is certified. | Future session/event instrumentation with an approved identity and privacy model; no inferred cross-device history. |

Each entry is deliberately non-calculable and fail-closed. UNRESOLVED can never become
READY_NOW or numeric 0 under this contract. No default values, approximate replacement,
historical series, aggregates, benchmarks, scores, Report Builder results or recommendations
may use these entries. Formal resolution requires the separate gate above.

The other definitions express discovery semantics, not implemented DB queries. Proposed
completeness/recommendation rules require an approved rule policy. Behavioral demand is
NOT_TRACKED, Search Console requires external integration and price/status history is absent.
Legacy rows remain PARTIAL with coverage/provenance caveats, not trustworthy total traffic.

## API and security

- getMetric/getDimension return undefined for unknown identifiers.
- getMetricsForRole/getDimensionsForRole return role-projected metadata only.
- isDimensionAllowedForMetric requires metric, dimension, role and scope compatibility.
- getMetricReadiness derives only from immutable definitions; no metric is READY_NOW.
- canRequestMetric denies execution until a separately implemented query layer can be certified.
- metricResult normalizes a supplied reading; it does not retrieve or calculate a metric.
- ratioResult/pricePerSqmResult are primitive numeric validation helpers, not metric execution.
- validateRegistry detects duplicate/unknown IDs, invalid metadata/grants, fabricated history,
  unsafe additive rollups, unresolved reactivation and incompatible families.
- serializeRegistry yields deterministic inert metadata, never data values or physical queries.

**Semantic visibility is not security authorization.** Future requests must independently
verify getUser and the DB-approved Dashboard membership, or owner_id=auth.uid for standard
users, on server AND DB. A role string, profile role alone or registry lookup never grants access.
No anonymous analytical role. Standard scopes are own-property or privacy-safe aggregates;
never private platform-wide data, competitor IDs, raw visitor/session streams or contacts.

## Numeric and temporal contracts

Percentage internal values are percentage points (42 means 42%); ratio values use scale 1
(0.42). Formula.scale declares 100 or 1. Formatting is separate. Denominator<=0,
missing/nonfinite/negative inputs never yield fake 0/NaN/Infinity. A valid zero numerator
remains zero. Total and built area ratios are distinct; area must be positive.
Prices are asking prices; separate PEN/USD and sale/rent, never infer monthly billing or FX.

ZERO carries numeric 0; NO_DATA, NOT_TRACKED, INSUFFICIENT_SAMPLE, UNAVAILABLE and UNRESOLVED
do not contain a numeric value. Do not render any non-value state as 0.
Counts of current stock may sum disjoint populations, not dates. Median/quantiles/mean,
ratios, distinct counts and scores must recompute from appropriate grains, never sum rollups.
UTC storage, America/Lima display, half-open periods and ISO weeks; snapshots differ from
surviving creation/publication cohorts and future event/history periods. No historical stock
or deleted records can be manufactured from today's records.

Benchmark metadata proposes 10 properties/5 independent publishers with own excluded,
aggregate-only and complementary suppression. Policy remains REQUIRES_VALIDATION; no
benchmark calculation or privacy guarantee is enabled. Property identifiers cannot be a
standard benchmark dimension. Screens.ts traces 14 future screens; it does not render them.

## Adding or deprecating a metric

A separately authorized change must certify ID, label, definition, numerator/denominator,
unit/scale, aggregation/additivity, availability, backfill, time, roles/scopes, dimensions,
source dependencies, privacy, caveats and tests. Extend the discovery reconciliation and
version deliberately; do not silently rename/delete IDs used by saved reports. DEPRECATED
metadata is non-ready. Never add SQL/JS/eval expressions, client-supplied physical identifiers
or secret configuration. Freeze nested definitions. Run validation and negative tests,
complete suite, canonical typecheck/build and review exact SHA before integration.
No Dashboard component may invent a local unregistered metric.

## Boundaries

All metadata is safe to bundle as descriptions, not data/credentials/query handles. The
registry is not imported by current UI. No imports from Auth, Supabase, Storage, publication
slots/HMAC/Vault or the frozen security candidate. All 46 discovery metric definitions are
independent of Storage internals; metadata image coverage does not inspect binaries.
Future publication-boundary/Storage telemetry is explicitly outside this 46-metric contract.
SU-494532 acknowledgment does not authorize Expand.

Run focused tests: `npm test -- tests/analytics-semantics.test.tsx`.

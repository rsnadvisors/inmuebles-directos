import { freeze, type Metric, type Dimension } from "./contract";

// No query engine: definitions are inert business descriptions, never eval or SQL.
// Proposed benchmarks are unavailable until policy/privacy review, even if price data exists.
export const METRICS: readonly Metric[] = freeze([
{
 "id": "inventory_total",
 "label": "Anuncios actuales",
 "description": "count properties scope",
 "category": "INVENTORY",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "LAST_VALUE",
 "additive": "DISJOINT_POPULATIONS",
 "temporalAdditive": false,
 "formula": {
  "kind": "COUNT",
  "definition": "count properties scope"
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property_type",
  "operation",
  "property_status",
  "currency",
  "region",
  "city",
  "district",
  "property",
  "publisher"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "ACTIVE",
 "caveats": [
  "A/U; stock, no sumar días",
  "Estado actual, no serie histórica ni suma de snapshots."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "inventory_published",
 "label": "Publicados",
 "description": "count status published",
 "category": "INVENTORY",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "LAST_VALUE",
 "additive": "DISJOINT_POPULATIONS",
 "temporalAdditive": false,
 "formula": {
  "kind": "COUNT",
  "definition": "count status published"
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property_type",
  "operation",
  "property_status",
  "currency",
  "region",
  "city",
  "district",
  "property"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "ACTIVE",
 "caveats": [
  "A/U; stock",
  "Estado actual, no serie histórica ni suma de snapshots."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "inventory_draft",
 "label": "Borradores",
 "description": "count draft",
 "category": "INVENTORY",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "LAST_VALUE",
 "additive": "DISJOINT_POPULATIONS",
 "temporalAdditive": false,
 "formula": {
  "kind": "COUNT",
  "definition": "count draft"
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property_type",
  "operation",
  "property_status",
  "currency",
  "region",
  "city",
  "district",
  "property"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "ACTIVE",
 "caveats": [
  "A/U; no abandonos",
  "Estado actual, no serie histórica ni suma de snapshots."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "inventory_archived",
 "label": "Archivados",
 "description": "count archived",
 "category": "INVENTORY",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "LAST_VALUE",
 "additive": "DISJOINT_POPULATIONS",
 "temporalAdditive": false,
 "formula": {
  "kind": "COUNT",
  "definition": "count archived"
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property_type",
  "operation",
  "property_status",
  "currency",
  "region",
  "city",
  "district",
  "property"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "ACTIVE",
 "caveats": [
  "A/U; no fecha cierre",
  "Estado actual, no serie histórica ni suma de snapshots."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "inventory_reserved",
 "label": "Reservados",
 "description": "count reserved",
 "category": "INVENTORY",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "LAST_VALUE",
 "additive": "DISJOINT_POPULATIONS",
 "temporalAdditive": false,
 "formula": {
  "kind": "COUNT",
  "definition": "count reserved"
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property_type",
  "operation",
  "property_status",
  "currency",
  "region",
  "city",
  "district",
  "property"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "ACTIVE",
 "caveats": [
  "A/U; estado declarado",
  "Estado actual, no serie histórica ni suma de snapshots."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "inventory_sold",
 "label": "Marcados vendidos",
 "description": "count sold",
 "category": "INVENTORY",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "LAST_VALUE",
 "additive": "DISJOINT_POPULATIONS",
 "temporalAdditive": false,
 "formula": {
  "kind": "COUNT",
  "definition": "count sold"
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property_type",
  "operation",
  "property_status",
  "currency",
  "region",
  "city",
  "district",
  "property"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "ACTIVE",
 "caveats": [
  "A/U; no ventas verificadas",
  "Estado actual, no serie histórica ni suma de snapshots."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "inventory_rented",
 "label": "Marcados alquilados",
 "description": "count rented",
 "category": "INVENTORY",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "LAST_VALUE",
 "additive": "DISJOINT_POPULATIONS",
 "temporalAdditive": false,
 "formula": {
  "kind": "COUNT",
  "definition": "count rented"
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property_type",
  "operation",
  "property_status",
  "currency",
  "region",
  "city",
  "district",
  "property"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "ACTIVE",
 "caveats": [
  "A/U; no contratos",
  "Estado actual, no serie histórica ni suma de snapshots."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "listing_creations",
 "label": "Altas conservadas",
 "description": "count created_at en rango",
 "category": "INVENTORY",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "COUNT",
 "additive": "DISJOINT_EVENTS",
 "temporalAdditive": true,
 "formula": {
  "kind": "COUNT",
  "definition": "count created_at en rango"
 },
 "availability": "AVAILABLE",
 "backfill": "PARTIALLY_BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property",
  "created_date",
  "property_type",
  "operation",
  "currency",
  "region",
  "city",
  "district"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "SURVIVING_COHORT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "ACTIVE",
 "caveats": [
  "A/U; aditivo fechas; survivor bias"
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "publication_records",
 "label": "Fechas de publicación conservadas",
 "description": "count published_at en rango",
 "category": "INVENTORY",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "COUNT",
 "additive": "DISJOINT_EVENTS",
 "temporalAdditive": true,
 "formula": {
  "kind": "COUNT",
  "definition": "count published_at en rango"
 },
 "availability": "PARTIAL",
 "backfill": "PARTIALLY_BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property",
  "published_date",
  "property_type",
  "operation",
  "currency",
  "region",
  "city",
  "district"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "SURVIVING_COHORT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "ACTIVE",
 "caveats": [
  "A/U; no republicaciones"
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "publication_share",
 "label": "Proporción publicada",
 "description": "published/total×100",
 "category": "INVENTORY",
 "unit": "percentage",
 "valueType": "NUMBER",
 "aggregation": "RATIO",
 "additive": false,
 "temporalAdditive": false,
 "formula": {
  "kind": "PERCENTAGE",
  "definition": "published/total×100",
  "scale": 100
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property_type",
  "operation",
  "property_status",
  "currency",
  "region",
  "city",
  "district",
  "property"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "ACTIVE",
 "caveats": [
  "A/U; ratio stock, denom0 null",
  "Estado actual, no serie histórica ni suma de snapshots."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "type_mix",
 "label": "Distribución por tipo",
 "description": "count/group type",
 "category": "INVENTORY",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "COUNT",
 "additive": "DISJOINT_POPULATIONS",
 "temporalAdditive": false,
 "formula": {
  "kind": "COUNT",
  "definition": "count/group type"
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property_type"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "ACTIVE",
 "caveats": [
  "A/U; cinco tipos",
  "Estado actual, no serie histórica ni suma de snapshots."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "operation_mix",
 "label": "Venta y alquiler",
 "description": "count/group listing_type",
 "category": "INVENTORY",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "COUNT",
 "additive": "DISJOINT_POPULATIONS",
 "temporalAdditive": false,
 "formula": {
  "kind": "COUNT",
  "definition": "count/group listing_type"
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "operation"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "ACTIVE",
 "caveats": [
  "A/U; no operación adicional",
  "Estado actual, no serie histórica ni suma de snapshots."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "currency_mix",
 "label": "Distribución por moneda",
 "description": "count/group currency",
 "category": "INVENTORY",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "COUNT",
 "additive": "DISJOINT_POPULATIONS",
 "temporalAdditive": false,
 "formula": {
  "kind": "COUNT",
  "definition": "count/group currency"
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "currency"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "ACTIVE",
 "caveats": [
  "A/U; PEN/USD no conversión",
  "Estado actual, no serie histórica ni suma de snapshots."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "location_mix",
 "label": "Distribución territorial",
 "description": "count/group región/ciudad/distrito",
 "category": "INVENTORY",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "COUNT",
 "additive": "DISJOINT_POPULATIONS",
 "temporalAdditive": false,
 "formula": {
  "kind": "COUNT",
  "definition": "count/group región/ciudad/distrito"
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "PRIVACY_SAFE_BENCHMARK"
   ]
  }
 ],
 "dimensions": [
  "region",
  "city",
  "district"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": {
  "aggregateOnly": true,
  "excludeOwn": true,
  "minimumPropertiesProposal": 10,
  "minimumPublishersProposal": 5,
  "policy": "REQUIRES_VALIDATION",
  "complementarySuppression": true
 },
 "status": "ACTIVE",
 "caveats": [
  "A/B; datos libres",
  "Estado actual, no serie histórica ni suma de snapshots."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "ask_median",
 "label": "Precio pedido mediano",
 "description": "percentile_cont .5 price",
 "category": "PRICING",
 "unit": "currency",
 "valueType": "NUMBER",
 "aggregation": "MEDIAN",
 "additive": false,
 "temporalAdditive": false,
 "formula": {
  "kind": "QUANTILE",
  "definition": "percentile_cont .5 price",
  "quantile": 0.5
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "PRIVACY_SAFE_BENCHMARK"
   ]
  }
 ],
 "dimensions": [
  "property",
  "property_type",
  "operation",
  "currency",
  "region",
  "city",
  "district",
  "area_band"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "SEPARATE_CURRENCY_OPERATION",
 "benchmark": {
  "aggregateOnly": true,
  "excludeOwn": true,
  "minimumPropertiesProposal": 10,
  "minimumPublishersProposal": 5,
  "policy": "REQUIRES_VALIDATION",
  "complementarySuppression": true
 },
 "status": "ACTIVE",
 "caveats": [
  "A/U/B; no suma medianas",
  "Estado actual, no serie histórica ni suma de snapshots.",
  "Precio pedido, no realizado; no FX ni mensualidad implícita."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "ask_mean",
 "label": "Precio pedido medio",
 "description": "sum(price)/count valid",
 "category": "PRICING",
 "unit": "currency",
 "valueType": "NUMBER",
 "aggregation": "MEAN",
 "additive": false,
 "temporalAdditive": false,
 "formula": {
  "kind": "MEAN",
  "definition": "sum(price)/count valid"
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "PRIVACY_SAFE_BENCHMARK"
   ]
  }
 ],
 "dimensions": [
  "property",
  "property_type",
  "operation",
  "currency",
  "region",
  "city",
  "district",
  "area_band"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "SEPARATE_CURRENCY_OPERATION",
 "benchmark": {
  "aggregateOnly": true,
  "excludeOwn": true,
  "minimumPropertiesProposal": 10,
  "minimumPublishersProposal": 5,
  "policy": "REQUIRES_VALIDATION",
  "complementarySuppression": true
 },
 "status": "ACTIVE",
 "caveats": [
  "A/U/B; outliers/N",
  "Estado actual, no serie histórica ni suma de snapshots.",
  "Precio pedido, no realizado; no FX ni mensualidad implícita."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "ask_p25",
 "label": "Percentil25 pedido",
 "description": "percentile .25",
 "category": "PRICING",
 "unit": "currency",
 "valueType": "NUMBER",
 "aggregation": "QUANTILE",
 "additive": false,
 "temporalAdditive": false,
 "formula": {
  "kind": "QUANTILE",
  "definition": "percentile .25",
  "quantile": 0.25
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "PRIVACY_SAFE_BENCHMARK"
   ]
  }
 ],
 "dimensions": [
  "property",
  "property_type",
  "operation",
  "currency",
  "region",
  "city",
  "district",
  "area_band"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "SEPARATE_CURRENCY_OPERATION",
 "benchmark": {
  "aggregateOnly": true,
  "excludeOwn": true,
  "minimumPropertiesProposal": 10,
  "minimumPublishersProposal": 5,
  "policy": "REQUIRES_VALIDATION",
  "complementarySuppression": true
 },
 "status": "ACTIVE",
 "caveats": [
  "A/B; threshold",
  "Estado actual, no serie histórica ni suma de snapshots.",
  "Precio pedido, no realizado; no FX ni mensualidad implícita."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "ask_p75",
 "label": "Percentil75 pedido",
 "description": "percentile .75",
 "category": "PRICING",
 "unit": "currency",
 "valueType": "NUMBER",
 "aggregation": "QUANTILE",
 "additive": false,
 "temporalAdditive": false,
 "formula": {
  "kind": "QUANTILE",
  "definition": "percentile .75",
  "quantile": 0.75
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "PRIVACY_SAFE_BENCHMARK"
   ]
  }
 ],
 "dimensions": [
  "property",
  "property_type",
  "operation",
  "currency",
  "region",
  "city",
  "district",
  "area_band"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "SEPARATE_CURRENCY_OPERATION",
 "benchmark": {
  "aggregateOnly": true,
  "excludeOwn": true,
  "minimumPropertiesProposal": 10,
  "minimumPublishersProposal": 5,
  "policy": "REQUIRES_VALIDATION",
  "complementarySuppression": true
 },
 "status": "ACTIVE",
 "caveats": [
  "A/B; threshold",
  "Estado actual, no serie histórica ni suma de snapshots.",
  "Precio pedido, no realizado; no FX ni mensualidad implícita."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "ask_total_m2",
 "label": "Mediana precio por m² total",
 "description": "median(price/area_total>0)",
 "category": "PRICING",
 "unit": "currency_per_sqm",
 "valueType": "NUMBER",
 "aggregation": "MEDIAN",
 "additive": false,
 "temporalAdditive": false,
 "formula": {
  "kind": "MEDIAN_OF_VALID_RATIOS",
  "definition": "median(price/area_total>0)",
  "quantile": 0.5
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "PRIVACY_SAFE_BENCHMARK"
   ]
  }
 ],
 "dimensions": [
  "property",
  "property_type",
  "operation",
  "currency",
  "region",
  "city",
  "district",
  "area_band"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "SEPARATE_CURRENCY_OPERATION",
 "benchmark": {
  "aggregateOnly": true,
  "excludeOwn": true,
  "minimumPropertiesProposal": 10,
  "minimumPublishersProposal": 5,
  "policy": "REQUIRES_VALIDATION",
  "complementarySuppression": true
 },
 "status": "ACTIVE",
 "caveats": [
  "A/U/B; no ratio sums",
  "Estado actual, no serie histórica ni suma de snapshots.",
  "Precio pedido, no realizado; no FX ni mensualidad implícita."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "ask_built_m2",
 "label": "Mediana precio por m² construido",
 "description": "median(price/area_built>0)",
 "category": "PRICING",
 "unit": "currency_per_sqm",
 "valueType": "NUMBER",
 "aggregation": "MEDIAN",
 "additive": false,
 "temporalAdditive": false,
 "formula": {
  "kind": "MEDIAN_OF_VALID_RATIOS",
  "definition": "median(price/area_built>0)",
  "quantile": 0.5
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "PRIVACY_SAFE_BENCHMARK"
   ]
  }
 ],
 "dimensions": [
  "property",
  "property_type",
  "operation",
  "currency",
  "region",
  "city",
  "district",
  "area_band"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "SEPARATE_CURRENCY_OPERATION",
 "benchmark": {
  "aggregateOnly": true,
  "excludeOwn": true,
  "minimumPropertiesProposal": 10,
  "minimumPublishersProposal": 5,
  "policy": "REQUIRES_VALIDATION",
  "complementarySuppression": true
 },
 "status": "ACTIVE",
 "caveats": [
  "A/U/B; unidad distinta",
  "Estado actual, no serie histórica ni suma de snapshots.",
  "Precio pedido, no realizado; no FX ni mensualidad implícita."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "age_published",
 "label": "Días desde publicación",
 "description": "now-published_at",
 "category": "INVENTORY",
 "unit": "days",
 "valueType": "NUMBER",
 "aggregation": "DERIVED",
 "additive": false,
 "temporalAdditive": false,
 "formula": {
  "kind": "ELAPSED_DAYS",
  "definition": "now-published_at"
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property_type",
  "operation",
  "property_status",
  "currency",
  "region",
  "city",
  "district",
  "property"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "ACTIVE",
 "caveats": [
  "A/U; no tiempo a venta",
  "Estado actual, no serie histórica ni suma de snapshots."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "image_coverage",
 "label": "Anuncios con imagen metadata",
 "description": "count exists I / P×100",
 "category": "QUALITY",
 "unit": "percentage",
 "valueType": "NUMBER",
 "aggregation": "RATIO",
 "additive": false,
 "temporalAdditive": false,
 "formula": {
  "kind": "PERCENTAGE",
  "definition": "count exists I / P×100",
  "scale": 100
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property_type",
  "operation",
  "property_status",
  "currency",
  "region",
  "city",
  "district",
  "property",
  "publisher"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "IMAGE_METADATA",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "ACTIVE",
 "caveats": [
  "A/U; no prueba de binario",
  "Estado actual, no serie histórica ni suma de snapshots."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "area_coverage",
 "label": "Área total informada",
 "description": "count area>0 / P×100",
 "category": "QUALITY",
 "unit": "percentage",
 "valueType": "NUMBER",
 "aggregation": "RATIO",
 "additive": false,
 "temporalAdditive": false,
 "formula": {
  "kind": "PERCENTAGE",
  "definition": "count area>0 / P×100",
  "scale": 100
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property_type",
  "operation",
  "property_status",
  "currency",
  "region",
  "city",
  "district",
  "property"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "ACTIVE",
 "caveats": [
  "A/U; null/0 invalidos para ratio",
  "Estado actual, no serie histórica ni suma de snapshots."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "contact_coverage",
 "label": "Teléfono publicado informado",
 "description": "count contact not null /published",
 "category": "QUALITY",
 "unit": "percentage",
 "valueType": "NUMBER",
 "aggregation": "RATIO",
 "additive": false,
 "temporalAdditive": false,
 "formula": {
  "kind": "PERCENTAGE",
  "definition": "count contact not null /published",
  "scale": 100
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property_type",
  "operation",
  "property_status",
  "currency",
  "region",
  "city",
  "district",
  "property"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "ACTIVE",
 "caveats": [
  "A/U; solo presencia",
  "Estado actual, no serie histórica ni suma de snapshots."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "completeness",
 "label": "Completitud aplicable",
 "description": "campos completos/aplicables×100",
 "category": "QUALITY",
 "unit": "percentage",
 "valueType": "NUMBER",
 "aggregation": "DERIVED",
 "additive": false,
 "temporalAdditive": false,
 "formula": {
  "kind": "PROPOSED_RULE",
  "definition": "campos completos/aplicables×100",
  "scale": 100
 },
 "availability": "REQUIRES_POLICY",
 "backfill": "NOT_APPLICABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property_type",
  "operation",
  "property_status",
  "currency",
  "region",
  "city",
  "district",
  "property"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "RULE_POLICY",
  "IMAGE_METADATA",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "PROPOSED",
 "caveats": [
  "A/U; por tipo/version",
  "Estado actual, no serie histórica ni suma de snapshots.",
  "Reglas por tipo pendientes de aprobación; no cálculo habilitado en esta foundation."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "active_publishers",
 "label": "Publicadores con anuncios",
 "description": "distinct owner_id no null",
 "category": "AUDIENCE",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "DISTINCT_COUNT",
 "additive": false,
 "temporalAdditive": false,
 "formula": {
  "kind": "DISTINCT",
  "definition": "distinct owner_id no null"
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  }
 ],
 "dimensions": [
  "property_type",
  "operation",
  "region",
  "city",
  "district"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "ACTIVE",
 "caveats": [
  "A; no identidades públicas",
  "Estado actual, no serie histórica ni suma de snapshots."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "profile_stock",
 "label": "Perfiles actuales",
 "description": "count profiles",
 "category": "AUDIENCE",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "LAST_VALUE",
 "additive": "DISJOINT_POPULATIONS",
 "temporalAdditive": false,
 "formula": {
  "kind": "COUNT",
  "definition": "count profiles"
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  }
 ],
 "dimensions": [],
 "dependencies": [
  "PROFILE_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "ACTIVE",
 "caveats": [
  "A; no todos los históricos",
  "Estado actual, no serie histórica ni suma de snapshots."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "favorite_stock",
 "label": "Favoritos actuales",
 "description": "count vínculos",
 "category": "AUDIENCE",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "LAST_VALUE",
 "additive": "DISJOINT_POPULATIONS",
 "temporalAdditive": false,
 "formula": {
  "kind": "COUNT",
  "definition": "count vínculos"
 },
 "availability": "AVAILABLE",
 "backfill": "BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property",
  "property_type",
  "operation"
 ],
 "dependencies": [
  "FAVORITE_CURRENT",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "ACTIVE",
 "caveats": [
  "A/U agregado; borrar quita historia",
  "Estado actual, no serie histórica ni suma de snapshots."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "legacy_view_rows",
 "label": "Vistas registradas legacy",
 "description": "count filas V",
 "category": "DEMAND",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "COUNT",
 "additive": "DISJOINT_EVENTS",
 "temporalAdditive": true,
 "formula": {
  "kind": "COUNT",
  "definition": "count filas V"
 },
 "availability": "PARTIAL",
 "backfill": "PARTIALLY_BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property",
  "date"
 ],
 "dependencies": [
  "LEGACY_VIEWS",
  "QUERY_LAYER"
 ],
 "time": "EVENT_PERIOD",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "ACTIVE",
 "caveats": [
  "A/U futuro; no cobertura garantizada",
  "Cobertura/origen no verificados; registros no equivalen a tráfico completo."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "legacy_session_rows",
 "label": "Sesiones distintas legacy",
 "description": "distinct session_id no null",
 "category": "DEMAND",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "DISTINCT_COUNT",
 "additive": false,
 "temporalAdditive": false,
 "formula": {
  "kind": "DISTINCT",
  "definition": "distinct session_id no null"
 },
 "availability": "PARTIAL",
 "backfill": "PARTIALLY_BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property",
  "date"
 ],
 "dependencies": [
  "LEGACY_VIEWS",
  "QUERY_LAYER"
 ],
 "time": "EVENT_PERIOD",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "ACTIVE",
 "caveats": [
  "A/U futuro; no personas únicas",
  "Cobertura/origen no verificados; registros no equivalen a tráfico completo."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "legacy_leads",
 "label": "Leads registrados legacy",
 "description": "count Ld",
 "category": "DEMAND",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "COUNT",
 "additive": "DISJOINT_EVENTS",
 "temporalAdditive": true,
 "formula": {
  "kind": "COUNT",
  "definition": "count Ld"
 },
 "availability": "PARTIAL",
 "backfill": "PARTIALLY_BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property",
  "date"
 ],
 "dependencies": [
  "LEGACY_LEADS",
  "QUERY_LAYER"
 ],
 "time": "EVENT_PERIOD",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "ACTIVE",
 "caveats": [
  "A/U futuro; origen desconocido",
  "Cobertura/origen no verificados; registros no equivalen a tráfico completo."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "impressions",
 "label": "Impresiones observadas",
 "description": "count impression dedup",
 "category": "DEMAND",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "COUNT",
 "additive": "DISJOINT_EVENTS",
 "temporalAdditive": true,
 "formula": {
  "kind": "COUNT",
  "definition": "count impression dedup"
 },
 "availability": "NOT_TRACKED",
 "backfill": "NOT_BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property",
  "date",
  "surface"
 ],
 "dependencies": [
  "ANALYTICS_EVENTS",
  "QUERY_LAYER"
 ],
 "time": "EVENT_PERIOD",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": true,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "DEFERRED",
 "caveats": [
  "A/U; surface y versión",
  "No existe medición histórica certificada; no rellenar con cero."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "drawer_opens",
 "label": "Aperturas de ficha breve",
 "description": "count drawer_open dedup",
 "category": "DEMAND",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "COUNT",
 "additive": "DISJOINT_EVENTS",
 "temporalAdditive": true,
 "formula": {
  "kind": "COUNT",
  "definition": "count drawer_open dedup"
 },
 "availability": "NOT_TRACKED",
 "backfill": "NOT_BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property",
  "date",
  "surface"
 ],
 "dependencies": [
  "ANALYTICS_EVENTS",
  "QUERY_LAYER"
 ],
 "time": "EVENT_PERIOD",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": true,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "DEFERRED",
 "caveats": [
  "A/U; no visitas físicas",
  "No existe medición histórica certificada; no rellenar con cero."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "detail_views",
 "label": "Vistas de ficha completa",
 "description": "count visible detail_view",
 "category": "DEMAND",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "COUNT",
 "additive": "DISJOINT_EVENTS",
 "temporalAdditive": true,
 "formula": {
  "kind": "COUNT",
  "definition": "count visible detail_view"
 },
 "availability": "NOT_TRACKED",
 "backfill": "NOT_BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property",
  "date",
  "surface"
 ],
 "dependencies": [
  "ANALYTICS_EVENTS",
  "QUERY_LAYER"
 ],
 "time": "EVENT_PERIOD",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": true,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "DEFERRED",
 "caveats": [
  "A/U; render server no equivale",
  "No existe medición histórica certificada; no rellenar con cero."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "phone_clicks",
 "label": "Clics en Llamar",
 "description": "count phone_click",
 "category": "DEMAND",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "COUNT",
 "additive": "DISJOINT_EVENTS",
 "temporalAdditive": true,
 "formula": {
  "kind": "COUNT",
  "definition": "count phone_click"
 },
 "availability": "NOT_TRACKED",
 "backfill": "NOT_BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property",
  "date",
  "surface"
 ],
 "dependencies": [
  "ANALYTICS_EVENTS",
  "CONTACT_EVENTS",
  "QUERY_LAYER"
 ],
 "time": "EVENT_PERIOD",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": true,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "DEFERRED",
 "caveats": [
  "A/U; no llamada completada",
  "No existe medición histórica certificada; no rellenar con cero."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "whatsapp_clicks",
 "label": "Clics en WhatsApp",
 "description": "count whatsapp_click",
 "category": "DEMAND",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "COUNT",
 "additive": "DISJOINT_EVENTS",
 "temporalAdditive": true,
 "formula": {
  "kind": "COUNT",
  "definition": "count whatsapp_click"
 },
 "availability": "NOT_TRACKED",
 "backfill": "NOT_BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property",
  "date",
  "surface"
 ],
 "dependencies": [
  "ANALYTICS_EVENTS",
  "CONTACT_EVENTS",
  "QUERY_LAYER"
 ],
 "time": "EVENT_PERIOD",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": true,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "DEFERRED",
 "caveats": [
  "A/U; no mensaje enviado",
  "No existe medición histórica certificada; no rellenar con cero."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "contact_clicks",
 "label": "Clics de contacto",
 "description": "phone+whatsapp",
 "category": "DEMAND",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "SUM_COUNTS",
 "additive": "DISJOINT_EVENTS",
 "temporalAdditive": true,
 "formula": {
  "kind": "SUM_COUNTS",
  "definition": "phone+whatsapp"
 },
 "availability": "NOT_TRACKED",
 "backfill": "NOT_BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property",
  "date",
  "surface"
 ],
 "dependencies": [
  "ANALYTICS_EVENTS",
  "CONTACT_EVENTS",
  "QUERY_LAYER"
 ],
 "time": "EVENT_PERIOD",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": true,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "DEFERRED",
 "caveats": [
  "A/U; aditivo eventos, no personas",
  "No existe medición histórica certificada; no rellenar con cero."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "detail_ctr",
 "label": "Aperturas por impresión",
 "description": "No están certificados matching entre apertura e impresión, repetición, surface ni ventana de atribución.",
 "category": "DEMAND",
 "unit": "percentage",
 "valueType": "NUMBER",
 "aggregation": "UNRESOLVED",
 "additive": false,
 "temporalAdditive": false,
 "formula": {
  "kind": "UNRESOLVED"
 },
 "availability": "UNRESOLVED",
 "backfill": "UNKNOWN",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [],
 "dependencies": [
  "ANALYTICS_EVENTS",
  "QUERY_LAYER"
 ],
 "time": "EVENT_PERIOD",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": true,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "UNRESOLVED",
 "caveats": [
  "A/U; definición surface/attribution",
  "No existe medición histórica certificada; no rellenar con cero."
 ],
 "unresolved": {
  "ambiguity": "No están certificados matching entre apertura e impresión, repetición, surface ni ventana de atribución.",
  "missingDecision": "Resolver formalmente en SEMANTIC METRIC DEFINITION / CONTRACT CLARIFICATION; no autoriza resolución dentro de este gate.",
  "numerator": "UNCERTIFIED",
  "denominator": "UNCERTIFIED",
  "calculationEnabled": false,
  "excludedConsumers": [
   "AGGREGATION",
   "BENCHMARKING",
   "SCORES",
   "REPORT_BUILDER",
   "RECOMMENDATIONS"
  ]
 },
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "contact_rate",
 "label": "Sesiones con clic de contacto",
 "description": "distinct contact sessions / distinct detail sessions",
 "category": "DEMAND",
 "unit": "ratio",
 "valueType": "NUMBER",
 "aggregation": "RATIO",
 "additive": false,
 "temporalAdditive": false,
 "formula": {
  "kind": "RATIO",
  "definition": "distinct contact sessions / distinct detail sessions",
  "scale": 1
 },
 "availability": "NOT_TRACKED",
 "backfill": "NOT_BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property",
  "date",
  "surface",
  "publisher"
 ],
 "dependencies": [
  "ANALYTICS_EVENTS",
  "CONTACT_EVENTS",
  "QUERY_LAYER"
 ],
 "time": "EVENT_PERIOD",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": true,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "DEFERRED",
 "caveats": [
  "A/U; mismo periodo, no ventas",
  "No existe medición histórica certificada; no rellenar con cero."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "zero_results",
 "label": "Búsquedas sin resultados",
 "description": "count search result_count=0 / searches",
 "category": "DEMAND",
 "unit": "ratio",
 "valueType": "NUMBER",
 "aggregation": "RATIO",
 "additive": false,
 "temporalAdditive": false,
 "formula": {
  "kind": "RATIO",
  "definition": "count search result_count=0 / searches",
  "scale": 1
 },
 "availability": "NOT_TRACKED",
 "backfill": "NOT_BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  }
 ],
 "dimensions": [
  "date"
 ],
 "dependencies": [
  "ANALYTICS_EVENTS",
  "SEARCH_EVENTS",
  "QUERY_LAYER"
 ],
 "time": "EVENT_PERIOD",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": true,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "DEFERRED",
 "caveats": [
  "A; sin texto raw",
  "No existe medición histórica certificada; no rellenar con cero."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "demand_supply",
 "label": "Interacciones por anuncio",
 "description": "No está certificada la población de anuncios elegibles ni su base temporal de exposición.",
 "category": "DEMAND",
 "unit": "ratio",
 "valueType": "NUMBER",
 "aggregation": "UNRESOLVED",
 "additive": false,
 "temporalAdditive": false,
 "formula": {
  "kind": "UNRESOLVED"
 },
 "availability": "UNRESOLVED",
 "backfill": "UNKNOWN",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "PRIVACY_SAFE_BENCHMARK"
   ]
  }
 ],
 "dimensions": [],
 "dependencies": [
  "ANALYTICS_EVENTS",
  "CONTACT_EVENTS",
  "PROPERTY_HISTORY",
  "QUERY_LAYER"
 ],
 "time": "EVENT_PERIOD",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": true,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": {
  "aggregateOnly": true,
  "excludeOwn": true,
  "minimumPropertiesProposal": 10,
  "minimumPublishersProposal": 5,
  "policy": "REQUIRES_VALIDATION",
  "complementarySuppression": true
 },
 "status": "UNRESOLVED",
 "caveats": [
  "A/B; oportunidad no equilibrada",
  "No existe medición histórica certificada; no rellenar con cero."
 ],
 "unresolved": {
  "ambiguity": "No está certificada la población de anuncios elegibles ni su base temporal de exposición.",
  "missingDecision": "Resolver formalmente en SEMANTIC METRIC DEFINITION / CONTRACT CLARIFICATION; no autoriza resolución dentro de este gate.",
  "numerator": "UNCERTIFIED",
  "denominator": "UNCERTIFIED",
  "calculationEnabled": false,
  "excludedConsumers": [
   "AGGREGATION",
   "BENCHMARKING",
   "SCORES",
   "REPORT_BUILDER",
   "RECOMMENDATIONS"
  ]
 },
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "price_change",
 "label": "Variación de precio pedido",
 "description": "last-first snapshot por moneda",
 "category": "HISTORY",
 "unit": "currency",
 "valueType": "NUMBER",
 "aggregation": "DERIVED",
 "additive": false,
 "temporalAdditive": false,
 "formula": {
  "kind": "DIFFERENCE",
  "definition": "last-first snapshot por moneda"
 },
 "availability": "NOT_TRACKED",
 "backfill": "NOT_BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property",
  "date",
  "currency",
  "operation",
  "property_type"
 ],
 "dependencies": [
  "PROPERTY_HISTORY",
  "QUERY_LAYER"
 ],
 "time": "HISTORICAL_PERIOD",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "SEPARATE_CURRENCY_OPERATION",
 "benchmark": null,
 "status": "DEFERRED",
 "caveats": [
  "A/U; no inferir pasado",
  "No existe medición histórica certificada; no rellenar con cero."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "time_to_declared_close",
 "label": "Días hasta cierre declarado",
 "description": "transition close-first published",
 "category": "HISTORY",
 "unit": "days",
 "valueType": "NUMBER",
 "aggregation": "DERIVED",
 "additive": false,
 "temporalAdditive": false,
 "formula": {
  "kind": "ELAPSED_DAYS",
  "definition": "transition close-first published"
 },
 "availability": "NOT_TRACKED",
 "backfill": "NOT_BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "PRIVACY_SAFE_BENCHMARK"
   ]
  }
 ],
 "dimensions": [
  "property",
  "date",
  "currency",
  "operation",
  "property_type"
 ],
 "dependencies": [
  "PROPERTY_HISTORY",
  "QUERY_LAYER"
 ],
 "time": "HISTORICAL_PERIOD",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": {
  "aggregateOnly": true,
  "excludeOwn": true,
  "minimumPropertiesProposal": 10,
  "minimumPublishersProposal": 5,
  "policy": "REQUIRES_VALIDATION",
  "complementarySuppression": true
 },
 "status": "DEFERRED",
 "caveats": [
  "A/B; no venta verificada",
  "No existe medición histórica certificada; no rellenar con cero."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "seo_clicks",
 "label": "Clics orgánicos Search Console",
 "description": "count API clicks",
 "category": "SEO",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "COUNT",
 "additive": "DISJOINT_EVENTS",
 "temporalAdditive": true,
 "formula": {
  "kind": "COUNT",
  "definition": "count API clicks"
 },
 "availability": "REQUIRES_EXTERNAL_INTEGRATION",
 "backfill": "NOT_BACKFILLABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  }
 ],
 "dimensions": [
  "property",
  "date",
  "device"
 ],
 "dependencies": [
  "SEARCH_CONSOLE",
  "QUERY_LAYER"
 ],
 "time": "EVENT_PERIOD",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": true,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "DEFERRED",
 "caveats": [
  "A; no conectado",
  "No existe medición histórica certificada; no rellenar con cero."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "return_sessions",
 "label": "Retorno observado",
 "description": "No están certificados cohorte, elegibilidad, condición de retorno ni ventana de observación.",
 "category": "DEMAND",
 "unit": "ratio",
 "valueType": "NUMBER",
 "aggregation": "UNRESOLVED",
 "additive": false,
 "temporalAdditive": false,
 "formula": {
  "kind": "UNRESOLVED"
 },
 "availability": "UNRESOLVED",
 "backfill": "UNKNOWN",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  }
 ],
 "dimensions": [],
 "dependencies": [
  "ANALYTICS_EVENTS",
  "QUERY_LAYER"
 ],
 "time": "EVENT_PERIOD",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": true,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "UNRESOLVED",
 "caveats": [
  "A agregado; no cross-device",
  "No existe medición histórica certificada; no rellenar con cero."
 ],
 "unresolved": {
  "ambiguity": "No están certificados cohorte, elegibilidad, condición de retorno ni ventana de observación.",
  "missingDecision": "Resolver formalmente en SEMANTIC METRIC DEFINITION / CONTRACT CLARIFICATION; no autoriza resolución dentro de este gate.",
  "numerator": "UNCERTIFIED",
  "denominator": "UNCERTIFIED",
  "calculationEnabled": false,
  "excludedConsumers": [
   "AGGREGATION",
   "BENCHMARKING",
   "SCORES",
   "REPORT_BUILDER",
   "RECOMMENDATIONS"
  ]
 },
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
},
{
 "id": "recommendation_count",
 "label": "Revisiones sugeridas",
 "description": "count reglas aplicables",
 "category": "RECOMMENDATION",
 "unit": "count",
 "valueType": "NUMBER",
 "aggregation": "DERIVED",
 "additive": false,
 "temporalAdditive": false,
 "formula": {
  "kind": "PROPOSED_RULE",
  "definition": "count reglas aplicables"
 },
 "availability": "REQUIRES_POLICY",
 "backfill": "NOT_APPLICABLE",
 "grants": [
  {
   "role": "SUPER_ADMIN",
   "scopes": [
    "PLATFORM_AGGREGATE"
   ]
  },
  {
   "role": "STANDARD_USER",
   "scopes": [
    "OWN_PROPERTY"
   ]
  }
 ],
 "dimensions": [
  "property_type",
  "operation",
  "property_status",
  "currency",
  "region",
  "city",
  "district",
  "property"
 ],
 "dependencies": [
  "PROPERTY_CURRENT",
  "RULE_POLICY",
  "QUERY_LAYER"
 ],
 "time": "CURRENT_SNAPSHOT",
 "nullBehavior": "NO_DATA",
 "zeroBehavior": "ONLY_OBSERVED_VALID_ZERO",
 "privacy": "PLATFORM_INTERNAL",
 "storageDependent": false,
 "instrumentationDependent": false,
 "externalDependent": false,
 "monetaryPolicy": "NOT_MONETARY",
 "benchmark": null,
 "status": "PROPOSED",
 "caveats": [
  "A/U; no ML actual",
  "Estado actual, no serie histórica ni suma de snapshots.",
  "Reglas por tipo pendientes de aprobación; no cálculo habilitado en esta foundation."
 ],
 "unresolved": null,
 "privacyByScope": {
  "PLATFORM_AGGREGATE": "PLATFORM_INTERNAL",
  "OWN_PROPERTY": "USER_PRIVATE",
  "PRIVACY_SAFE_BENCHMARK": "PRIVACY_SAFE_BENCHMARK"
 }
}
]);
export const DIMENSIONS: readonly Dimension[] = freeze([
 {
  "id": "property",
  "label": "Propiedad",
  "description": "Propiedad; own o admin, nunca competidor vía benchmark",
  "dataType": "identifier",
  "privacy": "USER_PRIVATE",
  "cardinality": "HIGH",
  "grants": [
   {
    "role": "SUPER_ADMIN",
    "scopes": [
     "PLATFORM_AGGREGATE"
    ]
   },
   {
    "role": "STANDARD_USER",
    "scopes": [
     "OWN_PROPERTY"
    ]
   }
  ],
  "instrumentationDependent": false,
  "storageDependent": false,
  "families": [
   "INVENTORY",
   "PRICING",
   "QUALITY",
   "AUDIENCE",
   "DEMAND",
   "HISTORY",
   "SEO",
   "RECOMMENDATION"
  ]
 },
 {
  "id": "property_type",
  "label": "Tipo de inmueble",
  "description": "Tipo de inmueble",
  "dataType": "category",
  "privacy": "PLATFORM_INTERNAL",
  "cardinality": "LOW",
  "grants": [
   {
    "role": "SUPER_ADMIN",
    "scopes": [
     "PLATFORM_AGGREGATE"
    ]
   },
   {
    "role": "STANDARD_USER",
    "scopes": [
     "OWN_PROPERTY",
     "PRIVACY_SAFE_BENCHMARK"
    ]
   }
  ],
  "instrumentationDependent": false,
  "storageDependent": false,
  "families": [
   "INVENTORY",
   "PRICING",
   "QUALITY",
   "AUDIENCE",
   "DEMAND",
   "HISTORY",
   "SEO",
   "RECOMMENDATION"
  ]
 },
 {
  "id": "operation",
  "label": "Operación",
  "description": "Operación",
  "dataType": "category",
  "privacy": "PLATFORM_INTERNAL",
  "cardinality": "LOW",
  "grants": [
   {
    "role": "SUPER_ADMIN",
    "scopes": [
     "PLATFORM_AGGREGATE"
    ]
   },
   {
    "role": "STANDARD_USER",
    "scopes": [
     "OWN_PROPERTY",
     "PRIVACY_SAFE_BENCHMARK"
    ]
   }
  ],
  "instrumentationDependent": false,
  "storageDependent": false,
  "families": [
   "INVENTORY",
   "PRICING",
   "QUALITY",
   "AUDIENCE",
   "DEMAND",
   "HISTORY",
   "SEO",
   "RECOMMENDATION"
  ]
 },
 {
  "id": "property_status",
  "label": "Estado actual",
  "description": "Estado actual",
  "dataType": "category",
  "privacy": "PLATFORM_INTERNAL",
  "cardinality": "LOW",
  "grants": [
   {
    "role": "SUPER_ADMIN",
    "scopes": [
     "PLATFORM_AGGREGATE"
    ]
   },
   {
    "role": "STANDARD_USER",
    "scopes": [
     "OWN_PROPERTY",
     "PRIVACY_SAFE_BENCHMARK"
    ]
   }
  ],
  "instrumentationDependent": false,
  "storageDependent": false,
  "families": [
   "INVENTORY",
   "PRICING",
   "QUALITY",
   "AUDIENCE",
   "DEMAND",
   "HISTORY",
   "SEO",
   "RECOMMENDATION"
  ]
 },
 {
  "id": "currency",
  "label": "Moneda",
  "description": "Moneda",
  "dataType": "category",
  "privacy": "PLATFORM_INTERNAL",
  "cardinality": "LOW",
  "grants": [
   {
    "role": "SUPER_ADMIN",
    "scopes": [
     "PLATFORM_AGGREGATE"
    ]
   },
   {
    "role": "STANDARD_USER",
    "scopes": [
     "OWN_PROPERTY",
     "PRIVACY_SAFE_BENCHMARK"
    ]
   }
  ],
  "instrumentationDependent": false,
  "storageDependent": false,
  "families": [
   "INVENTORY",
   "PRICING",
   "QUALITY",
   "AUDIENCE",
   "DEMAND",
   "HISTORY",
   "SEO",
   "RECOMMENDATION"
  ]
 },
 {
  "id": "region",
  "label": "Región",
  "description": "Región",
  "dataType": "category",
  "privacy": "PLATFORM_INTERNAL",
  "cardinality": "MEDIUM",
  "grants": [
   {
    "role": "SUPER_ADMIN",
    "scopes": [
     "PLATFORM_AGGREGATE"
    ]
   },
   {
    "role": "STANDARD_USER",
    "scopes": [
     "OWN_PROPERTY",
     "PRIVACY_SAFE_BENCHMARK"
    ]
   }
  ],
  "instrumentationDependent": false,
  "storageDependent": false,
  "families": [
   "INVENTORY",
   "PRICING",
   "QUALITY",
   "AUDIENCE",
   "DEMAND",
   "HISTORY",
   "SEO",
   "RECOMMENDATION"
  ]
 },
 {
  "id": "city",
  "label": "Ciudad",
  "description": "Ciudad",
  "dataType": "category",
  "privacy": "PLATFORM_INTERNAL",
  "cardinality": "MEDIUM",
  "grants": [
   {
    "role": "SUPER_ADMIN",
    "scopes": [
     "PLATFORM_AGGREGATE"
    ]
   },
   {
    "role": "STANDARD_USER",
    "scopes": [
     "OWN_PROPERTY",
     "PRIVACY_SAFE_BENCHMARK"
    ]
   }
  ],
  "instrumentationDependent": false,
  "storageDependent": false,
  "families": [
   "INVENTORY",
   "PRICING",
   "QUALITY",
   "AUDIENCE",
   "DEMAND",
   "HISTORY",
   "SEO",
   "RECOMMENDATION"
  ]
 },
 {
  "id": "district",
  "label": "Distrito",
  "description": "Distrito",
  "dataType": "category",
  "privacy": "PLATFORM_INTERNAL",
  "cardinality": "MEDIUM",
  "grants": [
   {
    "role": "SUPER_ADMIN",
    "scopes": [
     "PLATFORM_AGGREGATE"
    ]
   },
   {
    "role": "STANDARD_USER",
    "scopes": [
     "OWN_PROPERTY",
     "PRIVACY_SAFE_BENCHMARK"
    ]
   }
  ],
  "instrumentationDependent": false,
  "storageDependent": false,
  "families": [
   "INVENTORY",
   "PRICING",
   "QUALITY",
   "AUDIENCE",
   "DEMAND",
   "HISTORY",
   "SEO",
   "RECOMMENDATION"
  ]
 },
 {
  "id": "price_band",
  "label": "Banda de precio por moneda",
  "description": "Banda de precio por moneda",
  "dataType": "category",
  "privacy": "PLATFORM_INTERNAL",
  "cardinality": "MEDIUM",
  "grants": [
   {
    "role": "SUPER_ADMIN",
    "scopes": [
     "PLATFORM_AGGREGATE"
    ]
   },
   {
    "role": "STANDARD_USER",
    "scopes": [
     "OWN_PROPERTY",
     "PRIVACY_SAFE_BENCHMARK"
    ]
   }
  ],
  "instrumentationDependent": false,
  "storageDependent": false,
  "families": [
   "INVENTORY",
   "PRICING",
   "QUALITY",
   "AUDIENCE",
   "DEMAND",
   "HISTORY",
   "SEO",
   "RECOMMENDATION"
  ]
 },
 {
  "id": "area_band",
  "label": "Banda de área total",
  "description": "Banda de área total",
  "dataType": "category",
  "privacy": "PLATFORM_INTERNAL",
  "cardinality": "LOW",
  "grants": [
   {
    "role": "SUPER_ADMIN",
    "scopes": [
     "PLATFORM_AGGREGATE"
    ]
   },
   {
    "role": "STANDARD_USER",
    "scopes": [
     "OWN_PROPERTY",
     "PRIVACY_SAFE_BENCHMARK"
    ]
   }
  ],
  "instrumentationDependent": false,
  "storageDependent": false,
  "families": [
   "INVENTORY",
   "PRICING",
   "QUALITY",
   "AUDIENCE",
   "DEMAND",
   "HISTORY",
   "SEO",
   "RECOMMENDATION"
  ]
 },
 {
  "id": "created_date",
  "label": "Fecha de creación conservada",
  "description": "Fecha de creación conservada",
  "dataType": "date",
  "privacy": "PLATFORM_INTERNAL",
  "cardinality": "MEDIUM",
  "grants": [
   {
    "role": "SUPER_ADMIN",
    "scopes": [
     "PLATFORM_AGGREGATE"
    ]
   },
   {
    "role": "STANDARD_USER",
    "scopes": [
     "OWN_PROPERTY",
     "PRIVACY_SAFE_BENCHMARK"
    ]
   }
  ],
  "instrumentationDependent": false,
  "storageDependent": false,
  "families": [
   "INVENTORY",
   "PRICING",
   "QUALITY",
   "AUDIENCE",
   "DEMAND",
   "HISTORY",
   "SEO",
   "RECOMMENDATION"
  ]
 },
 {
  "id": "published_date",
  "label": "Fecha de publicación conservada",
  "description": "Fecha de publicación conservada",
  "dataType": "date",
  "privacy": "PLATFORM_INTERNAL",
  "cardinality": "MEDIUM",
  "grants": [
   {
    "role": "SUPER_ADMIN",
    "scopes": [
     "PLATFORM_AGGREGATE"
    ]
   },
   {
    "role": "STANDARD_USER",
    "scopes": [
     "OWN_PROPERTY",
     "PRIVACY_SAFE_BENCHMARK"
    ]
   }
  ],
  "instrumentationDependent": false,
  "storageDependent": false,
  "families": [
   "INVENTORY",
   "PRICING",
   "QUALITY",
   "AUDIENCE",
   "DEMAND",
   "HISTORY",
   "SEO",
   "RECOMMENDATION"
  ]
 },
 {
  "id": "date",
  "label": "Fecha de evento o snapshot",
  "description": "Fecha de evento o snapshot",
  "dataType": "date",
  "privacy": "PLATFORM_INTERNAL",
  "cardinality": "MEDIUM",
  "grants": [
   {
    "role": "SUPER_ADMIN",
    "scopes": [
     "PLATFORM_AGGREGATE"
    ]
   },
   {
    "role": "STANDARD_USER",
    "scopes": [
     "OWN_PROPERTY",
     "PRIVACY_SAFE_BENCHMARK"
    ]
   }
  ],
  "instrumentationDependent": true,
  "storageDependent": false,
  "families": [
   "INVENTORY",
   "PRICING",
   "QUALITY",
   "AUDIENCE",
   "DEMAND",
   "HISTORY",
   "SEO",
   "RECOMMENDATION"
  ]
 },
 {
  "id": "publisher",
  "label": "Publicador interno",
  "description": "Publicador interno; identificador interno sólo admin",
  "dataType": "identifier",
  "privacy": "SENSITIVE_INTERNAL",
  "cardinality": "HIGH",
  "grants": [
   {
    "role": "SUPER_ADMIN",
    "scopes": [
     "PLATFORM_AGGREGATE"
    ]
   }
  ],
  "instrumentationDependent": false,
  "storageDependent": false,
  "families": [
   "INVENTORY",
   "QUALITY",
   "DEMAND"
  ]
 },
 {
  "id": "surface",
  "label": "Superficie de interacción",
  "description": "Superficie de interacción",
  "dataType": "category",
  "privacy": "PLATFORM_INTERNAL",
  "cardinality": "LOW",
  "grants": [
   {
    "role": "SUPER_ADMIN",
    "scopes": [
     "PLATFORM_AGGREGATE"
    ]
   },
   {
    "role": "STANDARD_USER",
    "scopes": [
     "OWN_PROPERTY",
     "PRIVACY_SAFE_BENCHMARK"
    ]
   }
  ],
  "instrumentationDependent": true,
  "storageDependent": false,
  "families": [
   "INVENTORY",
   "PRICING",
   "QUALITY",
   "AUDIENCE",
   "DEMAND",
   "HISTORY",
   "SEO",
   "RECOMMENDATION"
  ]
 },
 {
  "id": "event_name",
  "label": "Clase de evento",
  "description": "Clase de evento",
  "dataType": "category",
  "privacy": "PLATFORM_INTERNAL",
  "cardinality": "LOW",
  "grants": [
   {
    "role": "SUPER_ADMIN",
    "scopes": [
     "PLATFORM_AGGREGATE"
    ]
   },
   {
    "role": "STANDARD_USER",
    "scopes": [
     "OWN_PROPERTY",
     "PRIVACY_SAFE_BENCHMARK"
    ]
   }
  ],
  "instrumentationDependent": true,
  "storageDependent": false,
  "families": [
   "INVENTORY",
   "PRICING",
   "QUALITY",
   "AUDIENCE",
   "DEMAND",
   "HISTORY",
   "SEO",
   "RECOMMENDATION"
  ]
 },
 {
  "id": "traffic_source",
  "label": "Clase de origen observada",
  "description": "Clase de origen observada",
  "dataType": "category",
  "privacy": "PLATFORM_INTERNAL",
  "cardinality": "LOW",
  "grants": [
   {
    "role": "SUPER_ADMIN",
    "scopes": [
     "PLATFORM_AGGREGATE"
    ]
   },
   {
    "role": "STANDARD_USER",
    "scopes": [
     "OWN_PROPERTY",
     "PRIVACY_SAFE_BENCHMARK"
    ]
   }
  ],
  "instrumentationDependent": true,
  "storageDependent": false,
  "families": [
   "INVENTORY",
   "PRICING",
   "QUALITY",
   "AUDIENCE",
   "DEMAND",
   "HISTORY",
   "SEO",
   "RECOMMENDATION"
  ]
 },
 {
  "id": "device",
  "label": "Clase amplia de dispositivo",
  "description": "Clase amplia de dispositivo",
  "dataType": "category",
  "privacy": "PLATFORM_INTERNAL",
  "cardinality": "LOW",
  "grants": [
   {
    "role": "SUPER_ADMIN",
    "scopes": [
     "PLATFORM_AGGREGATE"
    ]
   },
   {
    "role": "STANDARD_USER",
    "scopes": [
     "OWN_PROPERTY",
     "PRIVACY_SAFE_BENCHMARK"
    ]
   }
  ],
  "instrumentationDependent": true,
  "storageDependent": false,
  "families": [
   "INVENTORY",
   "PRICING",
   "QUALITY",
   "AUDIENCE",
   "DEMAND",
   "HISTORY",
   "SEO",
   "RECOMMENDATION"
  ]
 }
]);

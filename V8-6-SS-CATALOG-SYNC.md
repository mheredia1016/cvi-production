# ProductionOS v8.6 — S&S Mapped Catalog Sync

## Important API correction

S&S style filtering accepts identifiers such as:

```text
Gildan 5000
```

A bare garment style name such as `5000` may not resolve correctly as a style
filter. ProductionOS now combines the mapped brand and style before requesting
the variants.

Example request made by v8.6:

```text
GET /v2/products/?style=Gildan%205000&mediatype=json
```

## Workflow

```text
Basic Unisex Heavy Cotton T-Shirt
→ mapping: Gildan 5000
→ sync all Gildan 5000 variants
→ find Black + XL
→ exact S&S SKU
→ inventory, warehouses and account price
```

## Upgrade

Deploy the full v8.6 replacement files. Keep the existing Railway S&S variables.

## Test

1. Open Settings.
2. Confirm:
   `Basic Unisex Heavy Cotton T-Shirt | Gildan | 5000`
3. Click **Save & Sync S&S Catalog**.
4. It should report one synced style and a nonzero variant count.
5. Open Daily Manager.
6. Build the draft.
7. Click **Refresh All S&S Inventory**.
8. The Black / XL row should receive:
   - Exact S&S SKU
   - Available quantity
   - Warehouse quantities
   - Unit cost
   - Estimated cost

## Scope

v8.6 syncs only mapped blank styles, not the entire S&S product catalog. This
keeps synchronization fast and avoids unnecessary API requests.

## Persistence

The synced catalog is currently stored in Railway process memory. It must be
synced again after a Railway restart. The mappings themselves can remain
persistent through `SS_GARMENT_MAPPINGS_JSON`.

# ProductionOS v9.1 — Stable Foundation

## What changed

### Confirmed S&S catalog sequence

ProductionOS now uses the documented S&S flow:

```text
Mapped blank garment
→ GET /v2/styles/{BrandName StyleName}
→ permanent styleID
→ GET /v2/products/?styleid={styleID}
→ exact color + size product
→ exact S&S SKU, warehouse inventory and customer price
```

Example:

```text
Basic Unisex Heavy Cotton T-Shirt
→ Gildan 5000
→ /styles/Gildan%205000
→ styleID returned by S&S
→ /products/?styleid=...
→ Black + XL
```

### Persistent state

ProductionOS now saves:

- Imported ShipStation orders
- Generated production pieces
- Print history
- Daily workflows
- S&S purchase drafts
- Blank garment mappings
- Synced S&S catalog variants
- Graphics Lab job state
- Production settings

## Railway Volume setup

In Railway:

1. Open the ProductionOS service.
2. Add a **Volume**.
3. Mount it at:

```text
/data
```

4. Add this variable:

```env
PRODUCTIONOS_DATA_DIR=/data
```

5. Optional autosave interval:

```env
PRODUCTIONOS_AUTOSAVE_MS=5000
```

Without a Volume, v9 still works, but Railway deployments can replace the local
container filesystem.

## Existing variables

Keep:

```env
SS_ACCOUNT_NUMBER=...
SS_API_KEY=...
SS_API_BASE_URL=https://api.ssactivewear.com/v2
SS_WAREHOUSES=
SS_CACHE_MINUTES=15
SS_SUBMIT_ENABLED=false
GRAPHICS_LAB_OPEN_MODE=autohotkey
```

## Test the S&S catalog

1. Deploy v9.0.
2. Open **Settings**.
3. Confirm:

```text
Basic Unisex Heavy Cotton T-Shirt | Gildan | 5000
```

4. Click **Save & Sync S&S Catalog**.
5. The success message should show the resolved permanent `styleID`.
6. Open **Daily Manager**.
7. Build the draft.
8. Click **Refresh All S&S Inventory**.
9. The Black / XL row should receive:
   - Exact S&S SKU
   - Available quantity
   - Warehouse breakdown
   - Unit price
   - Estimated cost

## Scope

Live S&S purchase-order submission remains disabled. v9.0 focuses on a stable,
verified catalog, inventory, persistence, ShipStation import, and Graphics Lab
foundation.

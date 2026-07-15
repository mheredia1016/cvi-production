# ProductionOS v6.3 Manager Review v6.2 — ShipStation Rate Limit Fix

This version adds:

- 60-second order caching
- 10-minute store and tag caching
- Deduplication of simultaneous API requests
- Automatic 429 waiting and retry
- Clearer rate-limit error messages
- All v6.1 dedicated label and garment-report printing fixes

## Railway variables

```text
SHIPSTATION_ORDER_CACHE_SECONDS=60
SHIPSTATION_STORE_CACHE_SECONDS=600
SHIPSTATION_TAG_CACHE_SECONDS=600
SHIPSTATION_MAX_RETRIES=2
```

The defaults already work if these variables are omitted.

Keep:

```text
SHIPSTATION_WRITE_ENABLED=false
```


## v6.3 additions

- Manager Review & Validation panel
- Missing Backend Product Info, Old SKU, Style, Color, Size, and Garment warnings
- Unknown Product Type warnings
- Back print count
- Daily checklist with timestamps
- Per-category printed status
- Individual piece-label reprint
- Complete Manager Day validation
- Still read-only shadow mode


## v6.4 additions

- Previous-day S&S draft order built from the garment picklist
- Editable S&S supplier SKU, on-hand quantity, order quantity, and notes
- Draft totals and missing-SKU warnings
- Manager review timestamp for the S&S draft
- Submit endpoint intentionally disabled in test mode
- No order is sent to S&S

# ProductionOS v6.2 — ShipStation Rate Limit Fix

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

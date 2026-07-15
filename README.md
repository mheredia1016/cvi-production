# ProductionOS ShipStation Shadow v4

Real ShipStation V1 read-only integration with store selection.

## Railway variables

```text
SHIPSTATION_API_KEY=...
SHIPSTATION_API_SECRET=...
SHIPSTATION_READY_TAG=Ready For Production
SHIPSTATION_ORDER_STATUS=awaiting_shipment
SHIPSTATION_WRITE_ENABLED=false
USE_MOCK_DATA=false
SHIPSTATION_ENABLED_STORE_IDS=101,102,103
```

Do not commit credentials to GitHub.

## Flow

1. `/stores.html` loads ShipStation stores.
2. Enable only the stores ProductionOS should use.
3. Put those numeric IDs into `SHIPSTATION_ENABLED_STORE_IDS` in Railway for persistent configuration.
4. `/backend.html` previews Ready For Production orders.
5. Included and excluded orders are shown separately.
6. Shadow Import creates internal test pieces only.
7. No ShipStation tags or orders are changed.

This version intentionally does not contain tag write calls.

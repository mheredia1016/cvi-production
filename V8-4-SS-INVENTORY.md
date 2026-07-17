# ProductionOS v8.4 — S&S Live Inventory

## Included

- S&S credential connection test
- REST API Basic Authentication using:
  - Username: S&S account number
  - Password: S&S API key
- Automatic garment matching by style, color, and size
- Manual S&S SKU override
- Live quantity by warehouse
- Configurable warehouse filtering
- Customer price and estimated garment cost
- Automatic stock status:
  - In Stock
  - Partial
  - Out of Stock
- Automatic order quantity:
  - Required quantity minus local on-hand quantity
- Product cache to reduce S&S API requests
- Live PO submission remains disabled

## Railway Variables

Add:

```env
SS_ACCOUNT_NUMBER=YOUR_ACCOUNT_NUMBER
SS_API_KEY=YOUR_API_KEY
SS_API_BASE_URL=https://api.ssactivewear.com/v2
SS_WAREHOUSES=
SS_CACHE_MINUTES=15
SS_SUBMIT_ENABLED=false
```

`SS_WAREHOUSES` can be left blank to total all S&S warehouses.

To use only selected warehouses, enter comma-separated abbreviations:

```env
SS_WAREHOUSES=IL,KS
```

## Test

1. Deploy v8.4 to Railway.
2. Open Daily Manager.
3. Choose a production date and run Shadow Import.
4. Scroll to **S&S Draft Order**.
5. Click **Test S&S Connection**.
6. Click **Refresh All S&S Inventory**.
7. Review every match before enabling future purchasing.

## Matching behavior

ProductionOS first uses a manually entered S&S SKU when one exists.

When the SKU is blank, it requests all S&S products for the garment style and finds an exact normalized color and size match.

If no exact match or multiple matches exist, the line displays an error. Enter the known S&S SKU and click **Refresh** on that line.

## Security

Never paste or commit the actual S&S account number or API key into source code. Store both as Railway Variables.

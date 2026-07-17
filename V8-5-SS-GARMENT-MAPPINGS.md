# ProductionOS v8.5 — S&S Blank Garment Mappings

## Test mapping included

```text
Basic Unisex Heavy Cotton T-Shirt
→ Gildan
→ 5000
```

For the sample garment:

```text
Basic Unisex Heavy Cotton T-Shirt
Black
XXL
```

ProductionOS now requests S&S style `5000`, filters the results to brand `Gildan`,
color `Black`, and normalizes `XXL` to `2XL`. It then stores the exact returned
S&S variant SKU, inventory, warehouse quantities, and account pricing.

## Upgrade

Replace the v8.4 project files with v8.5 and redeploy Railway.

Your existing Railway variables remain unchanged:

```env
SS_ACCOUNT_NUMBER=...
SS_API_KEY=...
SS_API_BASE_URL=https://api.ssactivewear.com/v2
SS_SUBMIT_ENABLED=false
```

## Test

1. Open **Settings**.
2. Confirm this mapping is present:

   - Production Garment Name: `Basic Unisex Heavy Cotton T-Shirt`
   - S&S Brand: `Gildan`
   - S&S Style: `5000`

3. Open **Daily Manager**.
4. Build the S&S draft.
5. The garment row should show `Mapped: Gildan 5000`.
6. Click **Refresh All S&S Inventory**.

The blank S&S SKU field is normal before the first successful refresh. After the
refresh, ProductionOS fills it with the exact S&S color/size variant SKU.

## Adding more garments

Open **Settings → Blank Garment Mappings**, add the exact production garment name,
brand, and S&S style, then save.

Examples:

```text
Premium Soft T-Shirt → Bella+Canvas → 3001
Comfort Colors Heavyweight Tee → Comfort Colors → 1717
```

## Persistence

Mappings saved in the browser settings page are held by the running Railway
instance. To preserve them through redeployments, copy the generated JSON into
the Railway variable:

```env
SS_GARMENT_MAPPINGS_JSON=[{"garmentName":"Basic Unisex Heavy Cotton T-Shirt","brand":"Gildan","style":"5000"}]
```

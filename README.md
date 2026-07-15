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


## v6.5 additions

- Artwork SKU resolution: Old SKU first, then Main SKU
- ShipStation variant SKU is never used for artwork filenames
- Front art: `<artworkSku>.png`
- Back art: `<artworkSku> BACK.png`
- Backend Product Info parser recognizes:
  - `Back` as an additional back-print requirement
  - `Uncheck Black` as a printer instruction
- `Uncheck Black` prints prominently on the 3x1 label
- Red label stock is used only for Skip The Line orders
- White label stock is used for all non-rush labels
- Manager artwork and printer-instruction inspector


## v6.6 additions

- Ignores the Skip The Line fee line item as a non-production item
- Rush status still comes only from Custom Field 1 containing `Skip The Line`
- Configurable ignored product names and SKUs
- Ignored items do not create pieces, labels, garment rows, artwork warnings, or validation warnings
- Validation recognizes `White Ink, Uncheck Black` as White Ink plus a printer instruction
- S&S draft includes manual stock status and available quantity
- Separate printable S&S Out-of-Stock / Buy Elsewhere report
- Alternate supplier and notes fields


## v6.7 correction

- Skip The Line / rush status now comes from ShipStation Custom Field 2.
- Custom Field 1 is no longer used for rush detection.
- Red labels are produced only when Custom Field 2 contains `Skip The Line`.
- The Skip The Line fee line item remains ignored as a non-production item.


## v6.8 Merch Heroes artwork-agent test

This build proves:

```text
Piece barcode
→ ProductionOS piece record
→ Artwork SKU
→ local Windows agent
→ recursive Z:\Merch Heroes\Designs search
→ front/back found or missing
→ exact matched path and browser preview
```

No artwork is copied or sent to Graphics Lab.

### Railway variable

Use the same private value you will put in the local agent `.env`:

```text
AGENT_TOKEN=make-a-private-token
```

### Run the local agent on the Windows computer

Create an `.env` file in the project folder:

```text
SERVER_URL=https://cvi-production-production.up.railway.app
AGENT_TOKEN=the-same-private-token
MERCH_HEROES_ARTWORK_ROOT=Z:\Merch Heroes\Designs
ARTWORK_AGENT_POLL_MS=3000
ARTWORK_PREVIEW_MAX_MB=5
```

Install and run:

```powershell
npm install
npm run agent
```

The Windows user running the terminal must have access to the mapped `Z:` drive.

### Test

1. Shadow-import a Merch Heroes production date.
2. Open `/printer-test.html`.
3. Scan or type a generated piece ID.
4. Click **Search Z: Artwork**.
5. Keep the local agent terminal running.
6. Confirm the front and optional back PNG paths and previews appear.


## v6.8.1 fix

- Railway now accepts artwork preview completion payloads up to 20 MB.
- Local agent defaults to embedding previews only for PNGs up to 3 MB.
- Agent now displays the real HTTP response when a completion request fails.

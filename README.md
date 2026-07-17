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


## v6.9 Graphics Lab test handoff

This build adds a safe manual handoff test:

1. Scan a piece.
2. Search the Merch Heroes Z: drive.
3. Preview front and optional back artwork.
4. Click **Send Front to Test Hot Folder**.
5. Click **Send Back to Test Hot Folder** when required.
6. The local agent copies each file to:

```text
C:\ProductionOS\TestHotFolder
```

or the path configured in:

```text
GRAPHICS_TEST_HOTFOLDER=
```

7. ProductionOS tracks front/back status independently.
8. Piece Complete appears only after all required sides were copied.

No files are sent to the real Graphics Lab folder in this build.

### Local `.env`

```text
SERVER_URL=https://cvi-production-production.up.railway.app
AGENT_TOKEN=the-same-token-as-Railway
MERCH_HEROES_ARTWORK_ROOT=Z:\Merch Heroes\Designs
GRAPHICS_TEST_HOTFOLDER=C:\ProductionOS\TestHotFolder
ARTWORK_AGENT_POLL_MS=3000
GRAPHICS_AGENT_POLL_MS=2000
ARTWORK_PREVIEW_MAX_MB=3
```

Restart the local agent after updating:

```cmd
npm.cmd run agent
```


## v6.9.1 Beyond Wednesdays test barcode

Open:

```text
/test-barcode.html
```

Click **Create Test Piece** to add temporary piece:

```text
99990001
```

It maps to:

```text
Front: beyondwednesdays1002.png
Back: beyondwednesdays1002 BACK.png
Process: DTF
Requires Back: Yes
Store: Merch Heroes
```

Print the 3x1 barcode or enter `99990001` on `/printer-test.html`.


## v7.0 Brother Print Engine v1 — Dry Run

Creates local packages in `C:\ProductionOS\DryRunJobs` with front/back PNGs, GTOPTION XML, GTDATA Info XML, and a JSON manifest.

It does not generate ARX, contact a printer, call SendARX, or call StartPrint.

Add locally:

```text
PRINT_DRY_RUN_ROOT=C:\ProductionOS\DryRunJobs
PRINT_ENGINE_POLL_MS=2000
```

Restart:

```cmd
npm.cmd run agent
```


## v8.0 Graphics Lab Station

The Printer Scan Test now includes a production-style Graphics Lab workflow:

1. Scan/load a piece.
2. Search the Merch Heroes artwork drive.
3. Review front/back previews and special instructions.
4. Click **Open Front in Graphics Lab**.
5. Print in Graphics Lab and click **Mark Front Printed**.
6. Repeat for the back when required.
7. ProductionOS shows **Piece Complete** only when all required sides are marked printed.

### Local `.env`

The easiest mode uses the Windows PNG association:

```text
GRAPHICS_LAB_OPEN_MODE=associated_app
GRAPHICS_LAB_EXE=
GRAPHICS_LAB_POLL_MS=1500
```

Since PNG files are already associated with Graphics Lab, the local agent opens the exact matched artwork path through Windows.

A direct executable mode is also available later:

```text
GRAPHICS_LAB_OPEN_MODE=exe
GRAPHICS_LAB_EXE=C:\Path\To\GraphicsLab.exe
```

Restart the local agent after updating:

```cmd
npm.cmd run agent
```

Brother SDK direct printing remains disabled.


## v8.1 Auto-Detect Local Agent

Local computers normally require only `SERVER_URL` and `AGENT_TOKEN`. Use `SETUP-LOCAL-AGENT.cmd`, `CHECK-LOCAL-AGENT.cmd`, and `START-PRODUCTIONOS-AGENT.cmd` for Windows setup and diagnostics.


## v8.3 Graphics Lab Retry Reliability

Adds per-side job status, automatic stale-job requeue, visible errors, and Retry / Clear Job controls. See `V8-3-UPGRADE.md`.


## v8.4 S&S Activewear Live Inventory

Adds credential testing, automatic product matching, warehouse inventory, pricing, and estimated garment cost. See `V8-4-SS-INVENTORY.md`.


## v8.5 S&S Blank Garment Mappings

Maps production garment names to S&S brand/style before matching color and size. Includes Basic Unisex Heavy Cotton T-Shirt → Gildan 5000. See `V8-5-SS-GARMENT-MAPPINGS.md`.


## v8.6 S&S Mapped Catalog Sync

Corrects mapped style requests to use identifiers such as `Gildan 5000` and syncs all color/size variants for mapped blanks. See `V8-6-SS-CATALOG-SYNC.md`.


# ProductionOS v9.0 Stable Foundation

Adds the documented S&S style → styleID → product variant workflow and persistent Railway Volume storage. See `PRODUCTIONOS-V9-SETUP.md`.


## ProductionOS v9.1 Blank Inventory

Adds receiving, local on-hand inventory, transaction history, S&S draft allocation, and automatic print deductions. See `PRODUCTIONOS-V9-1-INVENTORY.md`.

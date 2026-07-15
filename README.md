# ProductionOS v6 Modular

This is the modular rebuild of the manager daily sample.

## Structure

- `src/routes` — API routes
- `src/services` — ShipStation, labels, garment report, runtime state
- `src/utils` — Backend Product Info parser and artwork resolver
- `src/models` — Production piece model
- `public` — Manager UI

## Current scope

- Shadow mode only
- No ShipStation writes
- Enabled store selection
- Date-based manager preview
- Shadow import
- One barcode per physical garment
- `DTF,Back` remains one piece with front + back artwork tasks
- Front artwork: `oldsku.png`
- Back artwork: `oldsku BACK.png`
- Garment report
- Rush-first label flow
- Configurable manager print order
- 3x1 thermal labels
- Print history

## Run

```bash
npm install
npm start
```

Open:

```text
/daily.html
```

## Railway

Use:

```text
USE_MOCK_DATA=false
SHIPSTATION_API_KEY=...
SHIPSTATION_API_SECRET=...
SHIPSTATION_SOURCE_TAG=In Production
SHIPSTATION_ORDER_STATUS=awaiting_shipment
SHIPSTATION_WRITE_ENABLED=false
SHIPSTATION_ENABLED_STORE_IDS=YOUR_TEST_STORE_ID
```

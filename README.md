# ProductionOS Sample v1

A Railway/GitHub-ready sample of the Linx-style flow:

- Mock ShipStation Ready For Production tag import
- Changes imported orders to In Production in the mock ShipStation file
- Creates production batch
- Garment report
- Draft S&S purchasing preview
- Printable barcode work orders
- Print Station scan
- Graphics Lab local hot-folder agent
- QC pass/reject with reprint job
- Shipping scan with binning/complete checks
- Tracking events

## Run locally

```bash
npm install
node server.js
```

Open:

```text
http://localhost:3000/dashboard.html
```

## Test flow

1. Go to Backend Control.
2. Preview Ready For Production.
3. Import + Mark In Production.
4. Go to Barcode Work Orders.
5. Scan/use barcode:

```text
POS-581001
```

6. Print Station: send artwork and mark printed.
7. QC: pass or reject.
8. Shipping: mark shipped only after QC passes.

## Railway

Deploy from GitHub.

Add variables:

```text
AGENT_TOKEN=make-a-private-token
SHIPSTATION_READY_TAG=Ready For Production
SHIPSTATION_IN_PRODUCTION_TAG=In Production
```

## Next step

Replace `shipstation.mock.json` with the real ShipStation API.

# PWT ProductionOS - Backend Control Station MVP

This version adds:

- Print Station
- Backend Control Station
- Garment report
- Printable barcode work orders
- Shipping scan placeholder
- Local Graphics Lab hot-folder agent
- Railway/GitHub-ready setup

## Local run

```bash
npm install
node server.js
```

Open:

```text
http://localhost:3000
```

Pages:

```text
/                  Print Station
/backend.html      Backend Control Station
/barcodes.html     Printable Barcode Work Orders
/shipping.html     Shipping Scan
```

Demo scan:

```text
10031
```

## Railway

Deploy from GitHub and add:

```text
AGENT_TOKEN=make-a-private-token
```

## Local Graphics Lab Agent

On the backend/print-floor computer, set `.env`:

```text
SERVER_URL=https://your-railway-app.up.railway.app
AGENT_TOKEN=the-same-private-token
HOTFOLDER_PATH=C:\GraphicsLab\HotFolder\Printer1
```

Run:

```bash
node agent/local-agent.js
```

## Next build

- Replace mock orders with ShipStation API.
- Add real batch filters by store/date/status.
- Add actual barcode label formats.
- Add Postgres database on Railway.

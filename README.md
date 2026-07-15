# ProductionOS Manager Daily v5

This sample focuses only on manager daily tasks.

## Daily flow

1. Select production date.
2. Preview ShipStation orders tagged `In Production` from enabled stores.
3. Shadow import them without changing ShipStation.
4. Review garment report.
5. Print Rush labels first on red 3x1 stock.
6. Print regular label queues by Backend Product Info.
7. Mark each group printed.
8. Review label print history.

## Test locally

```bash
npm install
npm start
```

Open `/daily.html`.

Use `USE_MOCK_DATA=true` for the included sample.

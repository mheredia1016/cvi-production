import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = process.cwd();

const SHIPSTATION_FILE = path.join(ROOT, "shipstation.mock.json");
const READY_TAG = process.env.SHIPSTATION_READY_TAG || "Ready For Production";
const IN_PRODUCTION_TAG = process.env.SHIPSTATION_IN_PRODUCTION_TAG || "In Production";

const PRODUCT_TYPES = [
  "White Ink, Back",
  "DTG Light, Back",
  "White Ink",
  "DTG Light",
  "EPT",
  "Embroidery To Order",
  "Embroidery",
  "Poster/Sticker",
  "Sublimation",
  "Pre-Stock",
  "DTF"
];

let productionOrders = [];
let pieces = [];
let labelPrintHistory = [];
let pieceCounter = 14540600;

app.use(express.json());
app.use(express.static("public"));
app.use("/artwork", express.static(path.join(ROOT, "artwork")));

const readShipStation = () => JSON.parse(fs.readFileSync(SHIPSTATION_FILE, "utf8"));
const writeShipStation = rows => fs.writeFileSync(SHIPSTATION_FILE, JSON.stringify(rows, null, 2));
const nextPieceId = () => String(++pieceCounter);

function createPieces(order) {
  const created = [];
  for (const item of order.items) {
    for (let unit = 1; unit <= Number(item.qty || 0); unit++) {
      const piece = {
        pieceId: nextPieceId(),
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        customer: order.customer,
        store: order.store,
        customField1: order.customField1 || "",
        rush: String(order.customField1 || "").toLowerCase().includes("skip the line"),
        lineItemId: item.lineItemId,
        unitNumber: unit,
        unitCount: item.qty,
        sku: item.sku,
        title: item.title,
        garment: item.garment,
        color: item.color,
        size: item.size,
        backendProductInfo: item.backendProductInfo,
        vendorSku: item.vendorSku,
        artworkFile: item.artworkFile,
        artworkUrl: `/artwork/${item.artworkFile}`,
        printer: item.printer,
        status: "created",
        labelPrinted: false,
        labelPrintedAt: null
      };
      pieces.push(piece);
      created.push(piece);
    }
  }
  return created;
}

app.get("/api/config/product-types", (req, res) => {
  res.json(PRODUCT_TYPES);
});

app.get("/api/shipstation/ready", (req, res) => {
  const rows = readShipStation().filter(o => o.tags?.includes(READY_TAG));
  res.json(rows);
});

app.post("/api/import/ready", (req, res) => {
  let rows = readShipStation();
  const ready = rows.filter(o => o.tags?.includes(READY_TAG));
  let pieceCount = 0;

  for (const order of ready) {
    order.tags = order.tags.filter(t => t !== READY_TAG);
    if (!order.tags.includes(IN_PRODUCTION_TAG)) order.tags.push(IN_PRODUCTION_TAG);

    if (!productionOrders.find(o => o.orderNumber === order.orderNumber)) {
      productionOrders.push({
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        customer: order.customer,
        store: order.store,
        customField1: order.customField1 || "",
        rush: String(order.customField1 || "").toLowerCase().includes("skip the line"),
        status: "in_production"
      });
      pieceCount += createPieces(order).length;
    }
  }

  writeShipStation(rows);
  res.json({
    success: true,
    message: `Imported ${ready.length} orders and created ${pieceCount} piece labels.`
  });
});

app.get("/api/pieces", (req, res) => {
  const { category, rush, unprinted, date } = req.query;
  let rows = [...pieces];

  if (date) rows = rows.filter(p => p.orderDate === date);
  if (category) rows = rows.filter(p => p.backendProductInfo === category);
  if (rush === "true") rows = rows.filter(p => p.rush);
  if (rush === "false") rows = rows.filter(p => !p.rush);
  if (unprinted === "true") rows = rows.filter(p => !p.labelPrinted);

  res.json(rows);
});

app.get("/api/label-summary", (req, res) => {
  const { date } = req.query;
  let rows = date ? pieces.filter(p => p.orderDate === date) : pieces;

  const summary = {
    rush: rows.filter(p => p.rush).length,
    regular: rows.filter(p => !p.rush).length,
    total: rows.length,
    byType: PRODUCT_TYPES.map(type => ({
      type,
      count: rows.filter(p => !p.rush && p.backendProductInfo === type).length,
      unprinted: rows.filter(p => !p.rush && p.backendProductInfo === type && !p.labelPrinted).length
    }))
  };

  res.json(summary);
});

app.post("/api/labels/mark-printed", (req, res) => {
  const { pieceIds = [], labelStock = "white", category = "" } = req.body || {};
  const now = new Date().toISOString();

  for (const id of pieceIds) {
    const piece = pieces.find(p => p.pieceId === String(id));
    if (piece) {
      piece.labelPrinted = true;
      piece.labelPrintedAt = now;
      piece.labelStock = labelStock;
    }
  }

  labelPrintHistory.unshift({
    id: `PRINT-${Date.now()}`,
    at: now,
    pieceIds,
    count: pieceIds.length,
    labelStock,
    category
  });

  res.json({ success: true, message: `Marked ${pieceIds.length} labels as printed.` });
});

app.post("/api/labels/reprint", (req, res) => {
  const { pieceId } = req.body || {};
  const piece = pieces.find(p => p.pieceId === String(pieceId));
  if (!piece) return res.status(404).json({ error: "Piece not found" });

  labelPrintHistory.unshift({
    id: `REPRINT-${Date.now()}`,
    at: new Date().toISOString(),
    pieceIds: [piece.pieceId],
    count: 1,
    labelStock: piece.rush ? "red" : "white",
    category: piece.backendProductInfo,
    reprint: true
  });

  res.json({ success: true, piece });
});

app.get("/api/labels/history", (req, res) => res.json(labelPrintHistory));

app.get("/api/reports/garments", (req, res) => {
  const { date } = req.query;
  let source = date ? pieces.filter(p => p.orderDate === date) : pieces;
  const rows = new Map();

  for (const piece of source) {
    const key = `${piece.orderNumber}-${piece.lineItemId}-${piece.unitNumber}`;
    if (!rows.has(key)) {
      rows.set(key, {
        vendorSku: piece.vendorSku,
        garment: piece.garment,
        color: piece.color,
        size: piece.size,
        qty: 1
      });
    }
  }

  const grouped = new Map();
  for (const row of rows.values()) {
    const key = `${row.vendorSku}||${row.garment}||${row.color}||${row.size}`;
    if (!grouped.has(key)) grouped.set(key, { ...row, qty: 0 });
    grouped.get(key).qty += 1;
  }

  res.json([...grouped.values()].sort((a,b) => a.vendorSku.localeCompare(b.vendorSku)));
});

app.listen(PORT, () => console.log(`ProductionOS Label Center v3 running on port ${PORT}`));

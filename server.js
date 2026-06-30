import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = process.cwd();
const AGENT_TOKEN = process.env.AGENT_TOKEN || "change-this-token";
const READY_TAG = process.env.SHIPSTATION_READY_TAG || "Ready For Production";
const IN_PRODUCTION_TAG = process.env.SHIPSTATION_IN_PRODUCTION_TAG || "In Production";

const SHIPSTATION_FILE = path.join(ROOT, "shipstation.mock.json");
const ARTWORK_DIR = path.join(ROOT, "artwork");

let batches = [];
let productionOrders = [];
let printJobs = [];
let events = [];

app.use(express.json());
app.use(express.static("public"));
app.use("/artwork", express.static(ARTWORK_DIR));

function readShipStation() {
  return JSON.parse(fs.readFileSync(SHIPSTATION_FILE, "utf8"));
}

function writeShipStation(rows) {
  fs.writeFileSync(SHIPSTATION_FILE, JSON.stringify(rows, null, 2));
}

function todayDate() {
  return new Date().toISOString().slice(0,10);
}

function makeBarcode(orderNumber) {
  return `POS-${orderNumber}`;
}

function log(orderNumber, type, message) {
  events.unshift({ id: Date.now() + Math.random(), at: new Date().toISOString(), orderNumber, type, message });
}

function hydrateOrder(order) {
  return {
    ...order,
    barcode: order.barcode || makeBarcode(order.orderNumber),
    items: order.items.map(item => ({
      ...item,
      artworkUrl: `/artwork/${item.artworkFile}`,
      status: item.status || "waiting"
    }))
  };
}

function findProductionOrder(orderNumberOrBarcode) {
  const clean = String(orderNumberOrBarcode).replace(/^POS-/,"");
  return productionOrders.find(o => String(o.orderNumber) === clean || String(o.barcode) === String(orderNumberOrBarcode));
}

app.get("/api/shipstation/ready", (req, res) => {
  const rows = readShipStation().filter(o => o.tags?.includes(READY_TAG));
  res.json(rows.map(hydrateOrder));
});

app.post("/api/import/ready", (req, res) => {
  const { date = todayDate() } = req.body || {};
  let shipRows = readShipStation();
  const ready = shipRows.filter(o => o.tags?.includes(READY_TAG));

  const batch = {
    id: `BATCH-${date}-${String(batches.length + 1).padStart(3,"0")}`,
    date,
    status: "created",
    importedAt: new Date().toISOString(),
    orderNumbers: ready.map(o => o.orderNumber)
  };

  for (const order of ready) {
    order.tags = order.tags.filter(t => t !== READY_TAG);
    if (!order.tags.includes(IN_PRODUCTION_TAG)) order.tags.push(IN_PRODUCTION_TAG);

    const prodOrder = hydrateOrder({
      ...order,
      batchId: batch.id,
      barcode: makeBarcode(order.orderNumber),
      productionStatus: "imported",
      binStatus: "not_ready",
      items: order.items.map(i => ({ ...i, status: "waiting" }))
    });

    if (!productionOrders.find(o => o.orderNumber === prodOrder.orderNumber)) {
      productionOrders.push(prodOrder);
      log(prodOrder.orderNumber, "import", `Imported from ShipStation and tagged ${IN_PRODUCTION_TAG}`);
    }
  }

  batches.unshift(batch);
  writeShipStation(shipRows);

  res.json({ success: true, message: `Imported ${ready.length} Ready For Production orders.`, batch });
});

app.get("/api/batches", (req, res) => {
  res.json(batches);
});

app.get("/api/batches/:batchId/orders", (req, res) => {
  res.json(productionOrders.filter(o => o.batchId === req.params.batchId));
});

app.get("/api/orders", (req, res) => {
  const { batchId } = req.query;
  let rows = productionOrders;
  if (batchId) rows = rows.filter(o => o.batchId === batchId);
  res.json(rows);
});

app.get("/api/order/:barcode", (req, res) => {
  const order = findProductionOrder(req.params.barcode);
  if (!order) return res.status(404).json({ error: "Order not found in ProductionOS. Import it from Ready For Production first." });
  res.json(order);
});

app.get("/api/reports/garments", (req, res) => {
  const { batchId } = req.query;
  const rows = new Map();
  const source = batchId ? productionOrders.filter(o => o.batchId === batchId) : productionOrders;

  for (const order of source) {
    for (const item of order.items) {
      const key = `${item.vendorSku}||${item.garment}||${item.color}||${item.size}`;
      if (!rows.has(key)) rows.set(key, { vendorSku:item.vendorSku, garment:item.garment, color:item.color, size:item.size, qty:0 });
      rows.get(key).qty += Number(item.qty || 0);
    }
  }
  res.json([...rows.values()].sort((a,b)=>a.vendorSku.localeCompare(b.vendorSku)));
});

app.get("/api/purchasing/ss-draft", (req, res) => {
  const { batchId } = req.query;
  const source = batchId ? productionOrders.filter(o => o.batchId === batchId) : productionOrders;
  const rows = new Map();
  for (const order of source) {
    for (const item of order.items) {
      const key = item.vendorSku;
      if (!rows.has(key)) rows.set(key, { vendorSku:item.vendorSku, garment:item.garment, color:item.color, size:item.size, requiredQty:0, onHand:0, orderQty:0 });
      rows.get(key).requiredQty += Number(item.qty || 0);
    }
  }
  const items = [...rows.values()].map(r => ({ ...r, orderQty: Math.max(0, r.requiredQty - r.onHand) }));
  res.json({ mode:"draft", vendor:"S&S Activewear", message:"Review draft before submitting. Live submit disabled in sample.", items });
});

app.post("/api/print-jobs", (req, res) => {
  const { barcode, itemId, printer="Printer 1" } = req.body;
  const order = findProductionOrder(barcode);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const item = order.items.find(i => i.id === itemId);
  if (!item) return res.status(404).json({ error: "Item not found" });

  const art = path.join(ARTWORK_DIR, item.artworkFile);
  if (!fs.existsSync(art)) return res.status(404).json({ error: `Artwork missing for ${item.sku}` });

  item.status = "queued_to_graphics_lab";
  order.productionStatus = "printing";
  const job = {
    id: `JOB-${Date.now()}`,
    orderNumber: order.orderNumber,
    barcode: order.barcode,
    printer,
    status: "queued",
    createdAt: new Date().toISOString(),
    item: { ...item, artworkUrl:`/artwork/${item.artworkFile}` }
  };
  printJobs.push(job);
  log(order.orderNumber, "print", `${item.location} queued to ${printer}`);
  res.json({ success:true, message:`Queued ${item.location} for ${printer}`, job });
});

app.post("/api/items/status", (req, res) => {
  const { barcode, itemId, status } = req.body;
  const order = findProductionOrder(barcode);
  if (!order) return res.status(404).json({ error:"Order not found" });
  const item = order.items.find(i => i.id === itemId);
  if (!item) return res.status(404).json({ error:"Item not found" });
  item.status = status;
  log(order.orderNumber, "status", `${item.location} marked ${status}`);

  const allPrinted = order.items.every(i => ["printed","qc_passed","ready_to_ship","shipped"].includes(i.status));
  const allQc = order.items.every(i => ["qc_passed","ready_to_ship","shipped"].includes(i.status));
  if (allPrinted) order.productionStatus = "printed";
  if (allQc) {
    order.productionStatus = "qc_passed";
    order.binStatus = "complete_ready_for_shipping";
  }
  res.json({ success:true, order });
});

app.post("/api/qc/reject", (req, res) => {
  const { barcode, itemId, reason="QC Reject" } = req.body;
  const order = findProductionOrder(barcode);
  if (!order) return res.status(404).json({ error:"Order not found" });
  const item = order.items.find(i => i.id === itemId);
  if (!item) return res.status(404).json({ error:"Item not found" });

  item.status = "rejected";
  const reprint = {
    ...item,
    id: `${item.id}-REPRINT-${Date.now()}`,
    status: "waiting",
    isReprint: true,
    reprintReason: reason,
    originalItemId: item.id
  };
  order.items.push(reprint);
  order.productionStatus = "reprint_needed";
  order.binStatus = "not_ready";
  log(order.orderNumber, "reject", `${item.location} rejected: ${reason}. New barcode job created.`);
  res.json({ success:true, message:"Rejected item and created reprint job.", order });
});

app.post("/api/shipping/complete", (req, res) => {
  const { barcode } = req.body;
  const order = findProductionOrder(barcode);
  if (!order) return res.status(404).json({ error:"Order not found" });
  const ready = order.items.every(i => ["qc_passed","ready_to_ship","shipped"].includes(i.status));
  if (!ready) return res.status(400).json({ error:"Order is not complete. Some items are not QC passed." });
  order.productionStatus = "shipped";
  order.binStatus = "shipped";
  for (const item of order.items) item.status = "shipped";
  log(order.orderNumber, "shipping", "Order marked shipped/complete.");
  res.json({ success:true, order });
});

app.get("/api/events", (req, res) => res.json(events.slice(0,100)));
app.get("/api/print-jobs", (req, res) => res.json(printJobs));

app.get("/api/agent/jobs", (req, res) => {
  if (req.query.token !== AGENT_TOKEN) return res.status(401).json({ error:"Unauthorized" });
  res.json(printJobs.filter(j => j.status === "queued"));
});

app.post("/api/agent/jobs/:jobId/complete", (req, res) => {
  if (req.query.token !== AGENT_TOKEN) return res.status(401).json({ error:"Unauthorized" });
  const job = printJobs.find(j => j.id === req.params.jobId);
  if (!job) return res.status(404).json({ error:"Job not found" });
  job.status = "sent_to_graphics_lab";
  job.completedAt = new Date().toISOString();
  res.json({ success:true, job });
});

app.listen(PORT, () => console.log(`ProductionOS Sample running on port ${PORT}`));

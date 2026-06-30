import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = process.cwd();
const AGENT_TOKEN = process.env.AGENT_TOKEN || "change-this-token";

const MOCK_ORDERS_FILE = path.join(ROOT, "orders.mock.json");
const ARTWORK_DIR = path.join(ROOT, "artwork");

let printJobs = [];
let productionStatus = {};

app.use(express.json());
app.use(express.static("public"));
app.use("/artwork", express.static(ARTWORK_DIR));

function getMockOrders() {
  return JSON.parse(fs.readFileSync(MOCK_ORDERS_FILE, "utf8"));
}

function findOrder(orderNumber) {
  return getMockOrders().find(order => String(order.orderNumber) === String(orderNumber));
}

function addArtworkUrls(order) {
  return {
    ...order,
    status: productionStatus[order.orderNumber] || "not_released",
    items: order.items.map(item => ({
      ...item,
      artworkUrl: `/artwork/${item.artworkFile}`
    }))
  };
}

app.get("/api/orders", (req, res) => {
  res.json(getMockOrders().map(addArtworkUrls));
});

app.get("/api/order/:orderNumber", (req, res) => {
  const order = findOrder(req.params.orderNumber);
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json(addArtworkUrls(order));
});

app.post("/api/orders/release", (req, res) => {
  const orders = getMockOrders();
  for (const order of orders) {
    productionStatus[order.orderNumber] = "released";
  }
  res.json({ success: true, message: `Released ${orders.length} orders to production.` });
});

app.get("/api/reports/garments", (req, res) => {
  const rows = new Map();

  for (const order of getMockOrders()) {
    for (const item of order.items) {
      const key = `${item.garment}||${item.color}||${item.size}`;
      if (!rows.has(key)) {
        rows.set(key, {
          garment: item.garment,
          color: item.color,
          size: item.size,
          qty: 0
        });
      }
      rows.get(key).qty += Number(item.qty || 0);
    }
  }

  res.json([...rows.values()].sort((a,b) =>
    a.garment.localeCompare(b.garment) ||
    a.color.localeCompare(b.color) ||
    a.size.localeCompare(b.size)
  ));
});

app.post("/api/print-jobs", (req, res) => {
  const { orderNumber, itemId, printer = "printer1" } = req.body;

  const order = findOrder(orderNumber);
  if (!order) return res.status(404).json({ error: "Order not found" });

  const item = order.items.find(i => i.id === itemId);
  if (!item) return res.status(404).json({ error: "Item not found" });

  const artworkPath = path.join(ARTWORK_DIR, item.artworkFile);
  if (!fs.existsSync(artworkPath)) {
    return res.status(404).json({ error: `Artwork file missing for SKU ${item.sku}` });
  }

  const job = {
    id: `job_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    status: "queued",
    printer,
    createdAt: new Date().toISOString(),
    orderNumber: order.orderNumber,
    customer: order.customer,
    item: {
      ...item,
      artworkUrl: `/artwork/${item.artworkFile}`
    }
  };

  printJobs.push(job);
  productionStatus[order.orderNumber] = "sent_to_print_queue";

  res.json({ success: true, message: `Queued ${item.location} print for ${printer}`, job });
});

app.get("/api/agent/jobs", (req, res) => {
  if (req.query.token !== AGENT_TOKEN) return res.status(401).json({ error: "Unauthorized" });
  res.json(printJobs.filter(job => job.status === "queued"));
});

app.post("/api/agent/jobs/:jobId/complete", (req, res) => {
  if (req.query.token !== AGENT_TOKEN) return res.status(401).json({ error: "Unauthorized" });

  const job = printJobs.find(j => j.id === req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  job.status = "sent_to_graphics_lab";
  job.completedAt = new Date().toISOString();
  productionStatus[job.orderNumber] = "sent_to_graphics_lab";

  res.json({ success: true, job });
});

app.get("/api/print-jobs", (req, res) => {
  res.json(printJobs);
});

app.listen(PORT, () => console.log(`PWT ProductionOS running on port ${PORT}`));

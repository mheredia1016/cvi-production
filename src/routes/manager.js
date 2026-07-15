
import express from "express";
import { productTypes, config } from "../config/config.js";
import { getSourceOrders, getStores } from "../services/shipstation.js";
import { runtimeStore } from "../services/runtimeStore.js";
import { createPiecesForOrder } from "../services/labelEngine.js";
import { buildGarmentReport } from "../services/garmentReport.js";
import { validateManagerDay } from "../services/managerValidation.js";
import { buildSsDraft, summarizeSsDraft } from "../services/ssDraft.js";

export const managerRouter = express.Router();

function storeName(storeId, stores) {
  return stores.find((store) => Number(store.storeId) === Number(storeId))?.storeName || `Store ${storeId}`;
}

managerRouter.get("/status", (req, res) => {
  res.json({
    mode: "SHADOW",
    sourceTag: config.shipstation.sourceTag,
    writeEnabled: config.shipstation.writeEnabled,
    useMockData: config.useMockData
  });
});

managerRouter.get("/preview", async (req, res) => {
  try {
    const date = req.query.date || "";
    const stores = await getStores();
    let orders = await getSourceOrders();

    if (date) orders = orders.filter((order) => order.orderDate === date);

    const included = orders
      .filter((order) => runtimeStore.enabledStoreIds.has(Number(order.storeId)))
      .map((order) => ({ ...order, storeName: storeName(order.storeId, stores) }));

    const excluded = orders
      .filter((order) => !runtimeStore.enabledStoreIds.has(Number(order.storeId)))
      .map((order) => ({ ...order, storeName: storeName(order.storeId, stores) }));

    workflowForDate(date || "all").previewedAt = new Date().toISOString();

    res.json({
      total: orders.length,
      included,
      excluded,
      rushOrders: included.filter((order) =>
        String(order.customField2 || "").toLowerCase().includes("skip the line")
      ).length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

managerRouter.post("/shadow-import", async (req, res) => {
  try {
    const date = req.body?.date || "";
    const stores = await getStores();
    let orders = await getSourceOrders();

    if (date) orders = orders.filter((order) => order.orderDate === date);
    orders = orders.filter((order) => runtimeStore.enabledStoreIds.has(Number(order.storeId)));

    let newOrders = 0;
    let newPieces = 0;

    for (const order of orders) {
      if (runtimeStore.importedOrders.some((existing) => existing.orderId === order.orderId)) {
        continue;
      }

      const resolvedStoreName = storeName(order.storeId, stores);
      runtimeStore.importedOrders.push({
        ...order,
        storeName: resolvedStoreName,
        importedAt: new Date().toISOString()
      });

      const pieces = createPiecesForOrder(order, resolvedStoreName);
      runtimeStore.pieces.push(...pieces);
      newOrders += 1;
      newPieces += pieces.length;
    }

    workflowForDate(date || "all").importedAt = new Date().toISOString();

    res.json({
      success: true,
      message: `Shadow imported ${newOrders} new orders and created ${newPieces} labels. ShipStation was not changed.`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

managerRouter.get("/summary", (req, res) => {
  const date = req.query.date || "";
  const pieces = date
    ? runtimeStore.pieces.filter((piece) => piece.orderDate === date)
    : runtimeStore.pieces;

  res.json({
    total: pieces.length,
    rush: pieces.filter((piece) => piece.rush).length,
    regular: pieces.filter((piece) => !piece.rush).length,
    unprinted: pieces.filter((piece) => !piece.labelPrinted).length,
    byType: productTypes.map((type) => ({
      type,
      count: pieces.filter((piece) => !piece.rush && piece.backendProductInfo === type).length,
      unprinted: pieces.filter(
        (piece) => !piece.rush &&
          piece.backendProductInfo === type &&
          !piece.labelPrinted
      ).length
    }))
  });
});

managerRouter.get("/labels", (req, res) => {
  let pieces = [...runtimeStore.pieces];

  if (req.query.date) pieces = pieces.filter((piece) => piece.orderDate === req.query.date);
  if (req.query.rush === "true") pieces = pieces.filter((piece) => piece.rush);
  if (req.query.rush === "false") pieces = pieces.filter((piece) => !piece.rush);
  if (req.query.type) pieces = pieces.filter((piece) => piece.backendProductInfo === req.query.type);
  if (req.query.unprinted === "true") pieces = pieces.filter((piece) => !piece.labelPrinted);

  res.json(pieces);
});

managerRouter.post("/mark-printed", (req, res) => {
  const pieceIds = req.body?.pieceIds || [];
  const now = new Date().toISOString();
  const labelStock = req.body?.labelStock || "white";
  const category = req.body?.category || "";

  for (const pieceId of pieceIds) {
    const piece = runtimeStore.pieces.find((entry) => entry.pieceId === String(pieceId));

    if (piece) {
      piece.labelPrinted = true;
      piece.labelPrintedAt = now;
      piece.labelStock = labelStock;
    }
  }

  runtimeStore.printHistory.unshift({
    at: now,
    category,
    labelStock,
    count: pieceIds.length,
    pieceIds
  });

  const datedPiece = runtimeStore.pieces.find((entry) => pieceIds.includes(entry.pieceId));
  if (datedPiece) {
    const workflow = workflowForDate(datedPiece.orderDate || "all");
    workflow.categories[category] = {
      printedAt: now,
      count: pieceIds.length,
      labelStock
    };
  }

  res.json({
    success: true,
    message: `Marked ${pieceIds.length} labels printed.`
  });
});

managerRouter.get("/print-history", (req, res) => {
  res.json(runtimeStore.printHistory);
});

managerRouter.get("/garments", (req, res) => {
  const date = req.query.date || "";
  const pieces = date
    ? runtimeStore.pieces.filter((piece) => piece.orderDate === date)
    : runtimeStore.pieces;

  res.json(buildGarmentReport(pieces));
});


function workflowForDate(date) {
  if (!runtimeStore.dailyWorkflows[date]) {
    runtimeStore.dailyWorkflows[date] = {
      date,
      previewedAt: null,
      importedAt: null,
      reviewedAt: null,
      garmentReportPrintedAt: null,
      ssDraftReviewedAt: null,
      categories: {},
      completedAt: null
    };
  }
  return runtimeStore.dailyWorkflows[date];
}

managerRouter.get("/review", (req, res) => {
  const date = req.query.date || "";
  const pieces = date
    ? runtimeStore.pieces.filter((piece) => piece.orderDate === date)
    : runtimeStore.pieces;

  const review = validateManagerDay(pieces);
  const workflow = workflowForDate(date || "all");

  res.json({ review, workflow });
});

managerRouter.post("/workflow-step", (req, res) => {
  const date = req.body?.date || "all";
  const step = req.body?.step || "";
  const workflow = workflowForDate(date);
  const now = new Date().toISOString();

  const allowed = new Set([
    "previewedAt",
    "importedAt",
    "reviewedAt",
    "garmentReportPrintedAt",
    "ssDraftReviewedAt"
  ]);

  if (!allowed.has(step)) {
    return res.status(400).json({ error: "Unknown workflow step." });
  }

  workflow[step] = now;
  res.json({ success: true, workflow });
});

managerRouter.post("/reprint-label", (req, res) => {
  const pieceId = String(req.body?.pieceId || "");
  const piece = runtimeStore.pieces.find((entry) => entry.pieceId === pieceId);

  if (!piece) return res.status(404).json({ error: "Piece not found." });

  runtimeStore.printHistory.unshift({
    at: new Date().toISOString(),
    category: piece.rush ? "Rush / Skip The Line" : piece.backendProductInfo,
    labelStock: piece.rush ? "red" : "white",
    count: 1,
    pieceIds: [piece.pieceId],
    reprint: true
  });

  res.json({ success: true, piece });
});


managerRouter.get("/ss-draft", (req, res) => {
  const date = req.query.date || "";
  const pieces = date
    ? runtimeStore.pieces.filter((piece) => piece.orderDate === date)
    : runtimeStore.pieces;

  const garmentRows = buildGarmentReport(pieces);
  let draft = runtimeStore.purchaseDrafts[date];

  if (!draft) {
    draft = buildSsDraft(garmentRows, date);
    runtimeStore.purchaseDrafts[date] = draft;
  }

  res.json({
    draft,
    summary: summarizeSsDraft(draft),
    warning: "Test draft only. No order will be submitted to S&S."
  });
});

managerRouter.post("/ss-draft", (req, res) => {
  const date = req.body?.date || "";
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  let draft = runtimeStore.purchaseDrafts[date];

  if (!draft) {
    return res.status(404).json({ error: "Build the S&S draft first." });
  }

  draft.items = items.map((item) => ({
    lineId: String(item.lineId || ""),
    supplierSku: String(item.supplierSku || ""),
    style: String(item.style || ""),
    color: String(item.color || ""),
    size: String(item.size || ""),
    type: String(item.type || ""),
    requiredQty: Number(item.requiredQty || 0),
    onHandQty: Math.max(0, Number(item.onHandQty || 0)),
    orderQty: Math.max(0, Number(item.orderQty || 0)),
    stockStatus: ["unknown", "in_stock", "partial", "out_of_stock"].includes(String(item.stockStatus))
      ? String(item.stockStatus)
      : "unknown",
    availableQty: item.availableQty === null || item.availableQty === ""
      ? null
      : Math.max(0, Number(item.availableQty || 0)),
    alternateSupplier: String(item.alternateSupplier || ""),
    notes: String(item.notes || "")
  }));
  draft.updatedAt = new Date().toISOString();

  res.json({
    success: true,
    draft,
    summary: summarizeSsDraft(draft)
  });
});


managerRouter.get("/ss-draft/out-of-stock", (req, res) => {
  const date = req.query.date || "";
  const draft = runtimeStore.purchaseDrafts[date];

  if (!draft) return res.status(404).json({ error: "S&S draft not found." });

  const items = (draft.items || []).filter(
    (item) => item.stockStatus === "out_of_stock" || item.stockStatus === "partial"
  );

  res.json({
    productionDate: date,
    vendor: "S&S Activewear",
    createdAt: new Date().toISOString(),
    items,
    totals: {
      lines: items.length,
      orderQty: items.reduce((sum, item) => {
        const available = item.availableQty === null ? 0 : Number(item.availableQty || 0);
        return sum + Math.max(0, Number(item.orderQty || 0) - available);
      }, 0)
    }
  });
});

managerRouter.post("/ss-draft/review", (req, res) => {
  const date = req.body?.date || "";
  const draft = runtimeStore.purchaseDrafts[date];

  if (!draft) return res.status(404).json({ error: "S&S draft not found." });

  const summary = summarizeSsDraft(draft);
  if (summary.missingSupplierSku > 0) {
    return res.status(400).json({
      error: `Cannot mark reviewed: ${summary.missingSupplierSku} line(s) are missing supplier SKU mapping.`
    });
  }

  draft.status = "reviewed";
  draft.reviewedAt = new Date().toISOString();
  workflowForDate(date).ssDraftReviewedAt = draft.reviewedAt;

  res.json({ success: true, draft, summary });
});

managerRouter.post("/ss-draft/submit", (req, res) => {
  res.status(403).json({
    error: "S&S submission is disabled in test mode. The draft was not sent."
  });
});


managerRouter.post("/complete-day", (req, res) => {
  const date = req.body?.date || "";
  const pieces = runtimeStore.pieces.filter((piece) => piece.orderDate === date);
  const review = validateManagerDay(pieces);
  const unprinted = pieces.filter((piece) => !piece.labelPrinted);

  if (review.warningCount > 0) {
    return res.status(400).json({
      error: `Cannot complete day with ${review.warningCount} validation warning(s).`
    });
  }

  if (unprinted.length > 0) {
    return res.status(400).json({
      error: `Cannot complete day with ${unprinted.length} unprinted label(s).`
    });
  }

  const workflow = workflowForDate(date);
  workflow.completedAt = new Date().toISOString();

  res.json({ success: true, workflow });
});

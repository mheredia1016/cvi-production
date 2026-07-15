
import express from "express";
import { productTypes, config } from "../config/config.js";
import { getSourceOrders, getStores } from "../services/shipstation.js";
import { runtimeStore } from "../services/runtimeStore.js";
import { createPiecesForOrder } from "../services/labelEngine.js";
import { buildGarmentReport } from "../services/garmentReport.js";

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

    res.json({
      total: orders.length,
      included,
      excluded,
      rushOrders: included.filter((order) =>
        String(order.customField1 || "").toLowerCase().includes("skip the line")
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

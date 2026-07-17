
import { Router } from "express";
import {
  adjustBlankInventory,
  listBlankInventory,
  listInventoryTransactions,
  receiveBlankInventory
} from "../services/blankInventory.js";

export const inventoryRouter = Router();

inventoryRouter.get("/", (req, res) => {
  res.json({
    inventory: listBlankInventory(),
    transactions: listInventoryTransactions(req.query.limit || 250)
  });
});

inventoryRouter.post("/receive", (req, res) => {
  try {
    const result = receiveBlankInventory(
      req.body || {},
      req.body?.quantity,
      {
        note: req.body?.note,
        reference: req.body?.reference
      }
    );

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

inventoryRouter.post("/adjust", (req, res) => {
  try {
    const result = adjustBlankInventory(
      req.body || {},
      req.body?.onHandQty,
      {
        minimumQty: req.body?.minimumQty,
        location: req.body?.location,
        note: req.body?.note,
        reference: req.body?.reference
      }
    );

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

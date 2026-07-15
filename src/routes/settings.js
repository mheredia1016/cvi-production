
import express from "express";
import { runtimeStore } from "../services/runtimeStore.js";

export const settingsRouter = express.Router();

settingsRouter.get("/", (req, res) => {
  res.json(runtimeStore.settings);
});

settingsRouter.post("/print-order", (req, res) => {
  const printOrder = Array.isArray(req.body?.printOrder)
    ? req.body.printOrder.map(String)
    : [];

  runtimeStore.settings.printOrder = printOrder;

  res.json({
    success: true,
    printOrder
  });
});

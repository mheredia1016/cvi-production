
import express from "express";
import { runtimeStore } from "../services/runtimeStore.js";
import { schedulePersistentSave } from "../services/persistentState.js";
import {
  listSsGarmentMappings,
  saveSsGarmentMappings
} from "../services/ssGarmentMappings.js";

export const settingsRouter = express.Router();

settingsRouter.get("/", (req, res) => {
  res.json(runtimeStore.settings);
});

settingsRouter.post("/print-order", (req, res) => {
  const printOrder = Array.isArray(req.body?.printOrder)
    ? req.body.printOrder.map(String)
    : [];

  runtimeStore.settings.printOrder = printOrder;
  schedulePersistentSave();

  res.json({
    success: true,
    printOrder
  });
});


settingsRouter.get("/ss-garment-mappings", (req, res) => {
  res.json({
    mappings: listSsGarmentMappings(),
    persistentVariable: "SS_GARMENT_MAPPINGS_JSON"
  });
});

settingsRouter.post("/ss-garment-mappings", (req, res) => {
  const mappings = saveSsGarmentMappings(req.body?.mappings);
  schedulePersistentSave();

  res.json({
    success: true,
    mappings,
    exportJson: JSON.stringify(mappings)
  });
});

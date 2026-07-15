
import express from "express";
import { config } from "../config/config.js";
import { getStores } from "../services/shipstation.js";
import { runtimeStore } from "../services/runtimeStore.js";

export const storesRouter = express.Router();

storesRouter.get("/", async (req, res) => {
  try {
    const rows = await getStores();

    res.json(
      rows.map((store) => ({
        ...store,
        enabled: runtimeStore.enabledStoreIds.has(Number(store.storeId))
      }))
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

storesRouter.post("/", (req, res) => {
  const storeIds = (req.body?.storeIds || []).map(Number);
  runtimeStore.enabledStoreIds = new Set(storeIds);

  res.json({
    success: true,
    storeIds,
    warning: "For permanent Railway configuration, also update SHIPSTATION_ENABLED_STORE_IDS."
  });
});

export function initializeEnabledStores() {
  runtimeStore.enabledStoreIds = new Set(config.shipstation.enabledStoreIds);
}

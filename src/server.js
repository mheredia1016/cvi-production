
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config/config.js";
import { storesRouter, initializeEnabledStores } from "./routes/stores.js";
import { managerRouter } from "./routes/manager.js";
import { settingsRouter } from "./routes/settings.js";
import { printerRouter } from "./routes/printer.js";
import { inventoryRouter } from "./routes/inventory.js";
import {
  loadPersistentState,
  persistentStateInfo,
  startPersistentStateAutosave
} from "./services/persistentState.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const persistentLoad = loadPersistentState();
initializeEnabledStores();
startPersistentStateAutosave();

const app = express();

app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/api/stores", storesRouter);
app.use("/api/manager", managerRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/printer", printerRouter);
app.use("/api/inventory", inventoryRouter);

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "ProductionOS v10.0",
    mode: "SHADOW",
    persistentState: {
      loaded: persistentLoad.loaded,
      ...persistentStateInfo()
    }
  });
});

app.listen(config.port, () => {
  console.log(`ProductionOS v10.0 running on port ${config.port}`);
});


import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config/config.js";
import { storesRouter, initializeEnabledStores } from "./routes/stores.js";
import { managerRouter } from "./routes/manager.js";
import { settingsRouter } from "./routes/settings.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

initializeEnabledStores();

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/api/stores", storesRouter);
app.use("/api/manager", managerRouter);
app.use("/api/settings", settingsRouter);

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "ProductionOS v6",
    mode: "SHADOW"
  });
});

app.listen(config.port, () => {
  console.log(`ProductionOS v6 running on port ${config.port}`);
});

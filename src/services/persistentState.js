
import fs from "fs";
import path from "path";
import { runtimeStore } from "./runtimeStore.js";

const dataDirectory = path.resolve(
  process.env.PRODUCTIONOS_DATA_DIR || path.join(process.cwd(), "data")
);
const stateFile = path.join(dataDirectory, "productionos-state.json");

let saveTimer = null;
let saveInProgress = false;
let dirtyDuringSave = false;

function serializableState() {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    enabledStoreIds: [...runtimeStore.enabledStoreIds],
    importedOrders: runtimeStore.importedOrders,
    pieces: runtimeStore.pieces,
    printHistory: runtimeStore.printHistory,
    blankInventory: runtimeStore.blankInventory,
    inventoryTransactions: runtimeStore.inventoryTransactions,
    dailyWorkflows: runtimeStore.dailyWorkflows,
    purchaseDrafts: runtimeStore.purchaseDrafts,
    artworkLookups: runtimeStore.artworkLookups,
    graphicsJobs: runtimeStore.graphicsJobs,
    dryRunPrintJobs: runtimeStore.dryRunPrintJobs,
    graphicsLabOpenJobs: runtimeStore.graphicsLabOpenJobs,
    graphicsLabPieceStatus: runtimeStore.graphicsLabPieceStatus,
    pieceCounter: runtimeStore.pieceCounter,
    settings: runtimeStore.settings,
    ssCatalog: runtimeStore.ssCatalog
  };
}

function applyState(state) {
  if (!state || typeof state !== "object") return;

  if (Array.isArray(state.enabledStoreIds)) {
    runtimeStore.enabledStoreIds = new Set(state.enabledStoreIds.map(String));
  }

  const arrayFields = [
    "importedOrders",
    "pieces",
    "printHistory",
    "inventoryTransactions",
    "artworkLookups",
    "graphicsJobs",
    "dryRunPrintJobs",
    "graphicsLabOpenJobs"
  ];

  for (const field of arrayFields) {
    if (Array.isArray(state[field])) runtimeStore[field] = state[field];
  }

  const objectFields = [
    "dailyWorkflows",
    "purchaseDrafts",
    "blankInventory",
    "graphicsLabPieceStatus",
    "settings",
    "ssCatalog"
  ];

  for (const field of objectFields) {
    if (state[field] && typeof state[field] === "object") {
      runtimeStore[field] = state[field];
    }
  }

  if (Number.isFinite(Number(state.pieceCounter))) {
    runtimeStore.pieceCounter = Number(state.pieceCounter);
  }
}

export function persistentStateInfo() {
  return {
    dataDirectory,
    stateFile,
    exists: fs.existsSync(stateFile)
  };
}

export function loadPersistentState() {
  fs.mkdirSync(dataDirectory, { recursive: true });

  if (!fs.existsSync(stateFile)) {
    console.log(`Persistent state: no state file yet at ${stateFile}`);
    return { loaded: false, stateFile };
  }

  try {
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    applyState(state);

    console.log(
      `Persistent state loaded: ${runtimeStore.importedOrders.length} orders, ` +
      `${runtimeStore.pieces.length} pieces, ` +
      `${Object.keys(runtimeStore.ssCatalog?.styles || {}).length} S&S style(s)`
    );

    return { loaded: true, stateFile, savedAt: state.savedAt || null };
  } catch (error) {
    console.error("Persistent state could not be loaded:", error);
    return { loaded: false, stateFile, error: error.message };
  }
}

export async function savePersistentState() {
  if (saveInProgress) {
    dirtyDuringSave = true;
    return;
  }

  saveInProgress = true;

  try {
    fs.mkdirSync(dataDirectory, { recursive: true });

    const tempFile = `${stateFile}.tmp`;
    const body = JSON.stringify(serializableState(), null, 2);

    await fs.promises.writeFile(tempFile, body, "utf8");
    await fs.promises.rename(tempFile, stateFile);
  } catch (error) {
    console.error("Persistent state save failed:", error);
  } finally {
    saveInProgress = false;

    if (dirtyDuringSave) {
      dirtyDuringSave = false;
      schedulePersistentSave(250);
    }
  }
}

export function schedulePersistentSave(delayMs = 1000) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    savePersistentState().catch((error) => {
      console.error("Persistent state scheduled save failed:", error);
    });
  }, delayMs);
}

export function startPersistentStateAutosave() {
  const intervalMs = Math.max(
    2000,
    Number(process.env.PRODUCTIONOS_AUTOSAVE_MS || 5000)
  );

  const timer = setInterval(() => {
    savePersistentState().catch((error) => {
      console.error("Persistent state autosave failed:", error);
    });
  }, intervalMs);

  timer.unref?.();

  const shutdown = async (signal) => {
    console.log(`${signal} received. Saving ProductionOS state...`);
    await savePersistentState();
    process.exit(0);
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

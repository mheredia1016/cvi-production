
function loadSsGarmentMappings() {
  const defaults = [
    {
      garmentName: "Basic Unisex Heavy Cotton T-Shirt",
      brand: "Gildan",
      style: "5000"
    }
  ];

  const raw = String(process.env.SS_GARMENT_MAPPINGS_JSON || "").trim();
  if (!raw) return defaults;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaults;

    const cleaned = parsed
      .map((entry) => ({
        garmentName: String(entry?.garmentName || "").trim(),
        brand: String(entry?.brand || "").trim(),
        style: String(entry?.style || "").trim()
      }))
      .filter((entry) => entry.garmentName && entry.style);

    return cleaned.length ? cleaned : defaults;
  } catch (error) {
    console.warn("Invalid SS_GARMENT_MAPPINGS_JSON. Using built-in mappings.", error.message);
    return defaults;
  }
}


export const runtimeStore = {
  enabledStoreIds: new Set(),
  importedOrders: [],
  pieces: [],
  printHistory: [],
  dailyWorkflows: {},
  purchaseDrafts: {},
  artworkLookups: [],
  graphicsJobs: [],
  dryRunPrintJobs: [],
  graphicsLabOpenJobs: [],
  ssCatalog: {
    styles: {},
    lastSyncAt: null,
    lastError: "",
    syncedStyleCount: 0,
    variantCount: 0
  },
  graphicsLabPieceStatus: {},
  pieceCounter: 14540600,
  settings: {
    ssGarmentMappings: loadSsGarmentMappings(),
    printOrder: [
      "Rush / Skip The Line",
      "White Ink",
      "White Ink, Back",
      "DTG Light",
      "DTG Light, Back",
      "DTF",
      "Embroidery",
      "Embroidery To Order",
      "Poster/Sticker",
      "Sublimation",
      "Pre-Stock",
      "EPT"
    ]
  }
};

export function nextPieceId() {
  runtimeStore.pieceCounter += 1;
  return String(runtimeStore.pieceCounter);
}

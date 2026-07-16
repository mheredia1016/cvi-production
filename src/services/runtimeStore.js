
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
  pieceCounter: 14540600,
  settings: {
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

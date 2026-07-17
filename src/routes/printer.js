
import express from "express";
import { config } from "../config/config.js";
import { runtimeStore } from "../services/runtimeStore.js";

export const printerRouter = express.Router();

function findPiece(pieceId) {
  return runtimeStore.pieces.find((piece) => piece.pieceId === String(pieceId));
}

function publicLookup(lookup) {
  if (!lookup) return null;

  return {
    id: lookup.id,
    pieceId: lookup.pieceId,
    status: lookup.status,
    requestedAt: lookup.requestedAt,
    completedAt: lookup.completedAt || null,
    front: lookup.front || null,
    back: lookup.back || null,
    error: lookup.error || null
  };
}

printerRouter.get("/piece/:pieceId", (req, res) => {
  const piece = findPiece(req.params.pieceId);

  if (!piece) {
    return res.status(404).json({
      error: "Piece not found. Shadow-import the production date first."
    });
  }

  const lookup = [...runtimeStore.artworkLookups]
    .reverse()
    .find((entry) => entry.pieceId === piece.pieceId);

  res.json({
    piece,
    lookup: publicLookup(lookup)
  });
});

printerRouter.post("/piece/:pieceId/artwork-lookup", (req, res) => {
  const piece = findPiece(req.params.pieceId);

  if (!piece) {
    return res.status(404).json({ error: "Piece not found." });
  }

  if (!piece.artworkSku) {
    return res.status(400).json({
      error: "Piece has no Artwork SKU. Old SKU and Main SKU are both blank."
    });
  }

  const active = runtimeStore.artworkLookups.find(
    (entry) => entry.pieceId === piece.pieceId &&
      ["queued", "processing"].includes(entry.status)
  );

  if (active) {
    return res.json({
      success: true,
      message: "Artwork lookup is already queued.",
      lookup: publicLookup(active)
    });
  }

  const lookup = {
    id: `LOOKUP-${Date.now()}-${piece.pieceId}`,
    pieceId: piece.pieceId,
    orderNumber: piece.orderNumber,
    storeName: piece.storeName,
    artworkSku: piece.artworkSku,
    frontFilename: piece.frontArtwork,
    backFilename: piece.requiresBack ? piece.backArtwork : "",
    requiresBack: Boolean(piece.requiresBack),
    status: "queued",
    requestedAt: new Date().toISOString(),
    front: null,
    back: null,
    error: null
  };

  runtimeStore.artworkLookups.push(lookup);

  res.json({
    success: true,
    message: "Artwork lookup queued for the local Merch Heroes agent.",
    lookup: publicLookup(lookup)
  });
});

printerRouter.get("/lookup/:lookupId", (req, res) => {
  const lookup = runtimeStore.artworkLookups.find(
    (entry) => entry.id === req.params.lookupId
  );

  if (!lookup) return res.status(404).json({ error: "Lookup not found." });
  res.json(publicLookup(lookup));
});

printerRouter.get("/agent/jobs", (req, res) => {
  if (req.query.token !== config.agentToken) {
    return res.status(401).json({ error: "Unauthorized agent token." });
  }

  const jobs = runtimeStore.artworkLookups.filter(
    (entry) => entry.status === "queued"
  );

  for (const job of jobs) {
    job.status = "processing";
    job.processingAt = new Date().toISOString();
  }

  res.json(jobs.map((job) => ({
    id: job.id,
    pieceId: job.pieceId,
    orderNumber: job.orderNumber,
    storeName: job.storeName,
    artworkSku: job.artworkSku,
    frontFilename: job.frontFilename,
    backFilename: job.backFilename,
    requiresBack: job.requiresBack
  })));
});

printerRouter.post("/agent/jobs/:lookupId/complete", (req, res) => {
  if (req.query.token !== config.agentToken) {
    return res.status(401).json({ error: "Unauthorized agent token." });
  }

  const lookup = runtimeStore.artworkLookups.find(
    (entry) => entry.id === req.params.lookupId
  );

  if (!lookup) return res.status(404).json({ error: "Lookup not found." });

  lookup.status = req.body?.error ? "error" : "complete";
  lookup.completedAt = new Date().toISOString();
  lookup.front = req.body?.front || null;
  lookup.back = req.body?.back || null;
  lookup.error = req.body?.error || null;

  res.json({ success: true });
});


function latestCompleteLookup(pieceId) {
  return [...runtimeStore.artworkLookups]
    .reverse()
    .find((entry) => entry.pieceId === pieceId && entry.status === "complete");
}

function graphicsStatusForPiece(pieceId) {
  const jobs = runtimeStore.graphicsJobs.filter((job) => job.pieceId === pieceId);
  const latestBySide = {};

  for (const job of jobs) {
    latestBySide[job.side] = job;
  }

  return {
    front: latestBySide.front || null,
    back: latestBySide.back || null
  };
}

printerRouter.get("/piece/:pieceId/graphics-status", (req, res) => {
  const piece = findPiece(req.params.pieceId);
  if (!piece) return res.status(404).json({ error: "Piece not found." });

  const status = graphicsStatusForPiece(piece.pieceId);
  const frontDone = status.front?.status === "copied";
  const backDone = !piece.requiresBack || status.back?.status === "copied";

  res.json({
    pieceId: piece.pieceId,
    front: status.front,
    back: status.back,
    pieceComplete: Boolean(frontDone && backDone)
  });
});

printerRouter.post("/piece/:pieceId/send-graphics", (req, res) => {
  const piece = findPiece(req.params.pieceId);
  if (!piece) return res.status(404).json({ error: "Piece not found." });

  const side = String(req.body?.side || "").toLowerCase();
  if (!["front", "back"].includes(side)) {
    return res.status(400).json({ error: "Side must be front or back." });
  }

  if (side === "back" && !piece.requiresBack) {
    return res.status(400).json({ error: "This piece does not require a back print." });
  }

  const lookup = latestCompleteLookup(piece.pieceId);
  if (!lookup) {
    return res.status(400).json({
      error: "Complete the artwork lookup before sending to the Graphics Lab test folder."
    });
  }

  const artwork = side === "front" ? lookup.front : lookup.back;
  if (!artwork?.found || !artwork.path) {
    return res.status(400).json({
      error: `${side} artwork was not found by the local artwork agent.`
    });
  }

  const active = runtimeStore.graphicsJobs.find(
    (job) => job.pieceId === piece.pieceId &&
      job.side === side &&
      ["queued", "processing"].includes(job.status)
  );

  if (active) {
    return res.json({
      success: true,
      message: `${side} is already queued.`,
      job: active
    });
  }

  const job = {
    id: `GRAPHICS-${Date.now()}-${piece.pieceId}-${side}`,
    pieceId: piece.pieceId,
    orderNumber: piece.orderNumber,
    side,
    sourcePath: artwork.path,
    sourceFilename: artwork.filename,
    artworkSku: piece.artworkSku,
    process: piece.process,
    printerInstructions: piece.printerInstructions || [],
    status: "queued",
    queuedAt: new Date().toISOString(),
    outputPath: null,
    error: null
  };

  runtimeStore.graphicsJobs.push(job);

  res.json({
    success: true,
    message: `${side} artwork queued for the local Graphics Lab test agent.`,
    job
  });
});

printerRouter.get("/agent/graphics-jobs", (req, res) => {
  if (req.query.token !== config.agentToken) {
    return res.status(401).json({ error: "Unauthorized agent token." });
  }

  const jobs = runtimeStore.graphicsJobs.filter((job) => job.status === "queued");

  for (const job of jobs) {
    job.status = "processing";
    job.processingAt = new Date().toISOString();
  }

  res.json(jobs.map((job) => ({
    id: job.id,
    pieceId: job.pieceId,
    orderNumber: job.orderNumber,
    side: job.side,
    sourcePath: job.sourcePath,
    sourceFilename: job.sourceFilename,
    artworkSku: job.artworkSku,
    process: job.process,
    printerInstructions: job.printerInstructions
  })));
});

printerRouter.post("/agent/graphics-jobs/:jobId/complete", (req, res) => {
  if (req.query.token !== config.agentToken) {
    return res.status(401).json({ error: "Unauthorized agent token." });
  }

  const job = runtimeStore.graphicsJobs.find((entry) => entry.id === req.params.jobId);
  if (!job) return res.status(404).json({ error: "Graphics job not found." });

  job.status = req.body?.error ? "error" : "copied";
  job.completedAt = new Date().toISOString();
  job.outputPath = req.body?.outputPath || null;
  job.error = req.body?.error || null;

  res.json({ success: true });
});


printerRouter.post("/test-piece/beyondwednesdays1002", (req, res) => {
  const existing = runtimeStore.pieces.find(
    (piece) => piece.pieceId === "99990001"
  );

  if (existing) {
    return res.json({
      success: true,
      message: "Test piece already exists.",
      piece: existing
    });
  }

  const piece = {
    pieceId: "99990001",
    orderId: "TEST-BW-1002",
    orderNumber: "TEST-BW1002",
    orderDate: new Date().toISOString().slice(0, 10),
    storeId: 0,
    storeName: "Merch Heroes",
    rush: false,
    customField2: "",
    unitNumber: 1,
    unitCount: 1,
    sku: "beyondwednesdays1002",
    oldSku: "",
    mainSku: "beyondwednesdays1002",
    artworkSku: "beyondwednesdays1002",
    artworkSource: "Main SKU",
    title: "Beyond Wednesdays Artwork Test",
    style: "Test Garment",
    backendProductInfo: "DTF,Back",
    process: "DTF",
    requiresFront: true,
    requiresBack: true,
    printerInstructions: [],
    unknownModifiers: [],
    frontArtwork: "beyondwednesdays1002.png",
    backArtwork: "beyondwednesdays1002 BACK.png",
    garment: "Test Garment",
    color: "Black",
    size: "Large",
    vendorSku: "TEST-BW1002",
    status: "waiting",
    labelPrinted: false,
    labelPrintedAt: null,
    labelStock: "white"
  };

  runtimeStore.pieces.push(piece);

  res.json({
    success: true,
    message: "Created test piece 99990001.",
    piece
  });
});


function latestArtworkLookup(pieceId) {
  return [...runtimeStore.artworkLookups]
    .reverse()
    .find((entry) => entry.pieceId === pieceId && entry.status === "complete");
}

function defaultBrotherSettings(piece) {
  return {
    platenSize: "14x16",
    platenSizeCode: 2,
    resolutionCode: 1,
    inkCode: 2,
    inkVolumeOption: 3,
    highlight: 5,
    mask: 4,
    copies: 1,
    doublePrint: 0,
    materialBlack: false,
    minWhite: 1,
    saturation: 10,
    brightness: 10,
    contrast: 10,
    choke: 3,
    ecoMode: false,
    fastMode: false,
    uncheckBlack: (piece.printerInstructions || []).includes("Uncheck Black")
  };
}

printerRouter.get("/piece/:pieceId/dry-run-settings", (req, res) => {
  const piece = findPiece(req.params.pieceId);
  if (!piece) return res.status(404).json({ error: "Piece not found." });

  res.json({
    pieceId: piece.pieceId,
    settings: defaultBrotherSettings(piece),
    warning: "Dry-run only. Values are based on sample Brother XML and must be confirmed before direct printing."
  });
});

printerRouter.post("/piece/:pieceId/build-dry-run", (req, res) => {
  const piece = findPiece(req.params.pieceId);
  if (!piece) return res.status(404).json({ error: "Piece not found." });

  const lookup = latestArtworkLookup(piece.pieceId);
  if (!lookup) return res.status(400).json({ error: "Complete artwork lookup first." });
  if (!lookup.front?.found || !lookup.front?.path) return res.status(400).json({ error: "Front artwork was not found." });
  if (piece.requiresBack && (!lookup.back?.found || !lookup.back?.path)) {
    return res.status(400).json({ error: "Back artwork is required but was not found." });
  }

  const requested = req.body?.settings || {};
  const defaults = defaultBrotherSettings(piece);
  const settings = {
    ...defaults,
    platenSize: String(requested.platenSize || defaults.platenSize),
    platenSizeCode: Number(requested.platenSizeCode ?? defaults.platenSizeCode),
    resolutionCode: Number(requested.resolutionCode ?? defaults.resolutionCode),
    inkCode: Number(requested.inkCode ?? defaults.inkCode),
    inkVolumeOption: Number(requested.inkVolumeOption ?? defaults.inkVolumeOption),
    highlight: Number(requested.highlight ?? defaults.highlight),
    mask: Number(requested.mask ?? defaults.mask),
    copies: Math.max(1, Number(requested.copies ?? defaults.copies)),
    doublePrint: Number(requested.doublePrint ?? defaults.doublePrint),
    materialBlack: Boolean(requested.materialBlack ?? defaults.materialBlack),
    minWhite: Number(requested.minWhite ?? defaults.minWhite),
    saturation: Number(requested.saturation ?? defaults.saturation),
    brightness: Number(requested.brightness ?? defaults.brightness),
    contrast: Number(requested.contrast ?? defaults.contrast),
    choke: Number(requested.choke ?? defaults.choke),
    ecoMode: Boolean(requested.ecoMode ?? defaults.ecoMode),
    fastMode: Boolean(requested.fastMode ?? defaults.fastMode),
    uncheckBlack: Boolean(requested.uncheckBlack ?? defaults.uncheckBlack)
  };

  const job = {
    id: `DRYRUN-${Date.now()}-${piece.pieceId}`,
    pieceId: piece.pieceId,
    orderNumber: piece.orderNumber,
    storeName: piece.storeName,
    artworkSku: piece.artworkSku,
    process: piece.process,
    requiresBack: Boolean(piece.requiresBack),
    printerInstructions: piece.printerInstructions || [],
    settings,
    front: { sourcePath: lookup.front.path, filename: lookup.front.filename },
    back: piece.requiresBack ? { sourcePath: lookup.back.path, filename: lookup.back.filename } : null,
    status: "queued",
    queuedAt: new Date().toISOString(),
    outputFolder: null,
    files: null,
    error: null
  };

  runtimeStore.dryRunPrintJobs.push(job);
  res.json({ success: true, message: "Brother dry-run package queued.", job });
});

printerRouter.get("/piece/:pieceId/dry-run-status", (req, res) => {
  const piece = findPiece(req.params.pieceId);
  if (!piece) return res.status(404).json({ error: "Piece not found." });
  const job = [...runtimeStore.dryRunPrintJobs].reverse().find((entry) => entry.pieceId === piece.pieceId);
  res.json({ job: job || null });
});

printerRouter.get("/agent/dry-run-jobs", (req, res) => {
  if (req.query.token !== config.agentToken) return res.status(401).json({ error: "Unauthorized agent token." });
  const jobs = runtimeStore.dryRunPrintJobs.filter((job) => job.status === "queued");
  for (const job of jobs) {
    job.status = "processing";
    job.processingAt = new Date().toISOString();
  }
  res.json(jobs);
});

printerRouter.post("/agent/dry-run-jobs/:jobId/complete", (req, res) => {
  if (req.query.token !== config.agentToken) return res.status(401).json({ error: "Unauthorized agent token." });
  const job = runtimeStore.dryRunPrintJobs.find((entry) => entry.id === req.params.jobId);
  if (!job) return res.status(404).json({ error: "Dry-run job not found." });
  job.status = req.body?.error ? "error" : "complete";
  job.completedAt = new Date().toISOString();
  job.outputFolder = req.body?.outputFolder || null;
  job.files = req.body?.files || null;
  job.error = req.body?.error || null;
  res.json({ success: true });
});


function graphicsLabStatus(piece) {
  if (!runtimeStore.graphicsLabPieceStatus[piece.pieceId]) {
    runtimeStore.graphicsLabPieceStatus[piece.pieceId] = {
      pieceId: piece.pieceId,
      front: { openedAt: null, printedAt: null, outputPath: null },
      back: { openedAt: null, printedAt: null, outputPath: null },
      completedAt: null
    };
  }

  const status = runtimeStore.graphicsLabPieceStatus[piece.pieceId];
  const frontPrinted = Boolean(status.front.printedAt);
  const backPrinted = !piece.requiresBack || Boolean(status.back.printedAt);

  if (frontPrinted && backPrinted && !status.completedAt) {
    status.completedAt = new Date().toISOString();
  }

  if (!(frontPrinted && backPrinted)) {
    status.completedAt = null;
  }

  return {
    ...status,
    requiresBack: Boolean(piece.requiresBack),
    pieceComplete: Boolean(frontPrinted && backPrinted)
  };
}

printerRouter.get("/piece/:pieceId/graphics-lab-status", (req, res) => {
  const piece = findPiece(req.params.pieceId);
  if (!piece) return res.status(404).json({ error: "Piece not found." });

  res.json(graphicsLabStatus(piece));
});

printerRouter.post("/piece/:pieceId/open-graphics-lab", (req, res) => {
  const piece = findPiece(req.params.pieceId);
  if (!piece) return res.status(404).json({ error: "Piece not found." });

  const side = String(req.body?.side || "").toLowerCase();
  if (!["front", "back"].includes(side)) {
    return res.status(400).json({ error: "Side must be front or back." });
  }

  if (side === "back" && !piece.requiresBack) {
    return res.status(400).json({ error: "This piece does not require back artwork." });
  }

  const lookup = latestCompleteLookup(piece.pieceId);
  if (!lookup) {
    return res.status(400).json({ error: "Complete the artwork lookup first." });
  }

  const artwork = side === "front" ? lookup.front : lookup.back;
  if (!artwork?.found || !artwork.path) {
    return res.status(400).json({ error: `${side} artwork is missing.` });
  }

  const active = runtimeStore.graphicsLabOpenJobs.find(
    (job) => job.pieceId === piece.pieceId &&
      job.side === side &&
      ["queued", "processing"].includes(job.status)
  );

  if (active) {
    return res.json({
      success: true,
      message: `${side} artwork is already being opened.`,
      job: active
    });
  }

  const job = {
    id: `GL-OPEN-${Date.now()}-${piece.pieceId}-${side}`,
    pieceId: piece.pieceId,
    orderNumber: piece.orderNumber,
    side,
    artworkPath: artwork.path,
    artworkFilename: artwork.filename,
    artworkSku: piece.artworkSku,
    process: piece.process,
    status: "queued",
    queuedAt: new Date().toISOString(),
    error: null
  };

  runtimeStore.graphicsLabOpenJobs.push(job);

  res.json({
    success: true,
    message: `${side} artwork queued to open in Graphics Lab.`,
    job
  });
});

printerRouter.post("/piece/:pieceId/mark-graphics-printed", (req, res) => {
  const piece = findPiece(req.params.pieceId);
  if (!piece) return res.status(404).json({ error: "Piece not found." });

  const side = String(req.body?.side || "").toLowerCase();
  const printed = req.body?.printed !== false;

  if (!["front", "back"].includes(side)) {
    return res.status(400).json({ error: "Side must be front or back." });
  }

  if (side === "back" && !piece.requiresBack) {
    return res.status(400).json({ error: "This piece does not require a back print." });
  }

  const status = graphicsLabStatus(piece);
  status[side].printedAt = printed ? new Date().toISOString() : null;

  // Persist mutation because graphicsLabStatus returns the same nested object.
  runtimeStore.graphicsLabPieceStatus[piece.pieceId] = {
    pieceId: status.pieceId,
    front: status.front,
    back: status.back,
    completedAt: null
  };

  const updated = graphicsLabStatus(piece);

  res.json({
    success: true,
    message: printed ? `${side} marked printed.` : `${side} print status cleared.`,
    status: updated
  });
});

printerRouter.post("/piece/:pieceId/reset-graphics-lab", (req, res) => {
  const piece = findPiece(req.params.pieceId);
  if (!piece) return res.status(404).json({ error: "Piece not found." });

  runtimeStore.graphicsLabPieceStatus[piece.pieceId] = {
    pieceId: piece.pieceId,
    front: { openedAt: null, printedAt: null, outputPath: null },
    back: { openedAt: null, printedAt: null, outputPath: null },
    completedAt: null
  };

  res.json({ success: true, status: graphicsLabStatus(piece) });
});

printerRouter.get("/agent/graphics-lab-open-jobs", (req, res) => {
  if (req.query.token !== config.agentToken) {
    return res.status(401).json({ error: "Unauthorized agent token." });
  }

  const jobs = runtimeStore.graphicsLabOpenJobs.filter(
    (job) => job.status === "queued"
  );

  for (const job of jobs) {
    job.status = "processing";
    job.processingAt = new Date().toISOString();
  }

  res.json(jobs);
});

printerRouter.post("/agent/graphics-lab-open-jobs/:jobId/complete", (req, res) => {
  if (req.query.token !== config.agentToken) {
    return res.status(401).json({ error: "Unauthorized agent token." });
  }

  const job = runtimeStore.graphicsLabOpenJobs.find(
    (entry) => entry.id === req.params.jobId
  );

  if (!job) return res.status(404).json({ error: "Graphics Lab open job not found." });

  job.status = req.body?.error ? "error" : "opened";
  job.completedAt = new Date().toISOString();
  job.error = req.body?.error || null;

  if (!job.error) {
    const piece = findPiece(job.pieceId);
    if (piece) {
      const status = graphicsLabStatus(piece);
      status[job.side].openedAt = job.completedAt;
      status[job.side].outputPath = job.artworkPath;
    }
  }

  res.json({ success: true });
});

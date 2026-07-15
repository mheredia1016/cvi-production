
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

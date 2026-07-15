
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

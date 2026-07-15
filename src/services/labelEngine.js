
import { createPiece } from "../models/Piece.js";
import { parseBackendProductInfo } from "../utils/backendProductParser.js";
import { resolveArtwork } from "../utils/artworkResolver.js";
import { nextPieceId } from "./runtimeStore.js";

export function createPiecesForOrder(order, storeName) {
  const pieces = [];

  for (const item of order.items) {
    const parsed = parseBackendProductInfo(item.backendProductInfo);
    const artwork = resolveArtwork(item.oldSku, item.mainSku, parsed.requiresBack);

    for (let unit = 1; unit <= Number(item.quantity || 0); unit += 1) {
      pieces.push(createPiece({
        pieceId: nextPieceId(),
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        storeId: order.storeId,
        storeName,
        rush: String(order.customField1 || "").toLowerCase().includes("skip the line"),
        customField1: order.customField1 || "",
        unitNumber: unit,
        unitCount: item.quantity,
        sku: item.sku,
        oldSku: item.oldSku,
        mainSku: item.mainSku,
        artworkSku: artwork.artworkSku,
        artworkSource: artwork.artworkSource,
        title: item.name,
        backendProductInfo: item.backendProductInfo,
        process: parsed.process,
        requiresFront: parsed.requiresFront,
        requiresBack: parsed.requiresBack,
        printerInstructions: parsed.printerInstructions,
        unknownModifiers: parsed.unknownModifiers,
        frontArtwork: artwork.front.filename,
        backArtwork: artwork.back.filename,
        garment: item.garment,
        style: item.style || item.garment,
        color: item.color,
        size: item.size,
        vendorSku: item.vendorSku
      }));
    }
  }

  return pieces;
}

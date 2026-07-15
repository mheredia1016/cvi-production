
import { productTypes } from "../config/config.js";

const normalizedTypes = new Set(productTypes.map((value) => value.toLowerCase()));

function warning(type, piece, message) {
  return {
    type,
    pieceId: piece.pieceId,
    orderNumber: piece.orderNumber,
    storeName: piece.storeName,
    sku: piece.sku,
    oldSku: piece.oldSku,
    backendProductInfo: piece.backendProductInfo,
    message
  };
}

export function validateManagerDay(pieces) {
  const warnings = [];

  for (const piece of pieces) {
    if (!String(piece.backendProductInfo || "").trim()) {
      warnings.push(warning(
        "missing_backend_product_info",
        piece,
        "Backend Product Info is missing."
      ));
    } else if (!normalizedTypes.has(String(piece.backendProductInfo).trim().toLowerCase())) {
      warnings.push(warning(
        "unknown_product_type",
        piece,
        `Unknown Backend Product Info: ${piece.backendProductInfo}`
      ));
    }

    if (!String(piece.oldSku || "").trim()) {
      warnings.push(warning(
        "missing_old_sku",
        piece,
        "Old SKU is missing, so artwork filenames cannot be resolved."
      ));
    }

    if (!String(piece.style || "").trim()) {
      warnings.push(warning("missing_style", piece, "Style is missing."));
    }

    if (!String(piece.color || "").trim()) {
      warnings.push(warning("missing_color", piece, "Color is missing."));
    }

    if (!String(piece.size || "").trim()) {
      warnings.push(warning("missing_size", piece, "Size is missing."));
    }

    if (!String(piece.garment || "").trim()) {
      warnings.push(warning("missing_garment", piece, "Type of Garment is missing."));
    }
  }

  const byType = {};
  for (const item of warnings) {
    byType[item.type] = (byType[item.type] || 0) + 1;
  }

  return {
    pieces: pieces.length,
    orders: new Set(pieces.map((piece) => piece.orderId)).size,
    rush: pieces.filter((piece) => piece.rush).length,
    backPrints: pieces.filter((piece) => piece.requiresBack).length,
    warningCount: warnings.length,
    ready: warnings.length === 0,
    byType,
    warnings
  };
}

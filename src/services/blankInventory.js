
import { runtimeStore } from "./runtimeStore.js";
import { schedulePersistentSave } from "./persistentState.js";
import { findSsGarmentMapping } from "./ssGarmentMappings.js";

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeSize(value) {
  const clean = String(value || "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, "")
    .replace(/^SMALL$/, "S")
    .replace(/^MEDIUM$/, "M")
    .replace(/^LARGE$/, "L")
    .replace(/^X-LARGE$/, "XL")
    .replace(/^XX-LARGE$/, "2XL")
    .replace(/^XXX-LARGE$/, "3XL")
    .replace(/^XXXX-LARGE$/, "4XL")
    .replace(/^XXXXX-LARGE$/, "5XL")
    .replace(/^XXXXXX-LARGE$/, "6XL");

  const repeatedX = clean.match(/^(X{2,6})L$/);
  if (repeatedX) return `${repeatedX[1].length}XL`;

  const numericX = clean.match(/^([2-6])X$/);
  if (numericX) return `${numericX[1]}XL`;

  return clean;
}

export function inventoryKey({
  supplierSku = "",
  brand = "",
  style = "",
  color = "",
  size = ""
}) {
  const cleanSku = String(supplierSku || "").trim().toUpperCase();
  if (cleanSku) return `sku:${cleanSku}`;

  return [
    "blank",
    normalize(brand),
    normalize(style),
    normalize(color),
    normalizeSize(size)
  ].join(":");
}

function findCatalogVariant({ brand, style, color, size }) {
  const wantedBrand = normalize(brand);
  const wantedStyle = normalize(style);
  const wantedColor = normalize(color);
  const wantedSize = normalizeSize(size);

  for (const entry of Object.values(runtimeStore.ssCatalog?.styles || {})) {
    const brandMatches =
      normalize(entry.brand) === wantedBrand ||
      normalize(entry.requestedBrand) === wantedBrand;
    const styleMatches =
      normalize(entry.style) === wantedStyle ||
      normalize(entry.requestedStyle) === wantedStyle;

    if (!brandMatches || !styleMatches) continue;

    const matches = (entry.products || []).filter(
      (product) =>
        normalize(product.colorName) === wantedColor &&
        normalizeSize(product.sizeName) === wantedSize
    );

    if (matches.length === 1) return matches[0];
  }

  return null;
}

export function resolveInventoryIdentity(input = {}) {
  const mapping = input.garmentName
    ? findSsGarmentMapping(input.garmentName)
    : null;

  const brand = String(
    input.brand || mapping?.brand || input.ssBrandName || ""
  ).trim();
  const style = String(
    input.styleCode || mapping?.style || input.ssStyleName || input.style || ""
  ).trim();
  const color = String(input.color || input.ssColorName || "").trim();
  const size = normalizeSize(input.size || input.ssSizeName || "");

  const catalogVariant = findCatalogVariant({ brand, style, color, size });
  const supplierSku = String(
    input.supplierSku || catalogVariant?.sku || ""
  ).trim();

  return {
    key: inventoryKey({ supplierSku, brand, style, color, size }),
    supplierSku,
    brand: String(catalogVariant?.brandName || brand),
    style: String(catalogVariant?.styleName || style),
    color: String(catalogVariant?.colorName || color),
    size: String(catalogVariant?.sizeName || size),
    garmentName: String(
      input.garmentName || mapping?.garmentName || ""
    ).trim()
  };
}

function ensureRecord(identity) {
  const existing = runtimeStore.blankInventory[identity.key];
  if (existing) {
    Object.assign(existing, {
      supplierSku: identity.supplierSku || existing.supplierSku,
      brand: identity.brand || existing.brand,
      style: identity.style || existing.style,
      color: identity.color || existing.color,
      size: identity.size || existing.size,
      garmentName: identity.garmentName || existing.garmentName
    });
    return existing;
  }

  const record = {
    key: identity.key,
    supplierSku: identity.supplierSku,
    brand: identity.brand,
    style: identity.style,
    color: identity.color,
    size: identity.size,
    garmentName: identity.garmentName,
    onHandQty: 0,
    minimumQty: 0,
    location: "",
    updatedAt: new Date().toISOString()
  };

  runtimeStore.blankInventory[identity.key] = record;
  return record;
}

function transaction({
  record,
  quantity,
  type,
  note = "",
  reference = "",
  pieceId = ""
}) {
  const entry = {
    id: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    inventoryKey: record.key,
    supplierSku: record.supplierSku,
    brand: record.brand,
    style: record.style,
    color: record.color,
    size: record.size,
    quantity: Number(quantity),
    resultingQty: Number(record.onHandQty),
    type,
    note: String(note || ""),
    reference: String(reference || ""),
    pieceId: String(pieceId || "")
  };

  runtimeStore.inventoryTransactions.unshift(entry);
  runtimeStore.inventoryTransactions =
    runtimeStore.inventoryTransactions.slice(0, 5000);

  return entry;
}

export function listBlankInventory() {
  return Object.values(runtimeStore.blankInventory || {})
    .sort((a, b) => {
      const aText = `${a.brand} ${a.style} ${a.color} ${a.size}`;
      const bText = `${b.brand} ${b.style} ${b.color} ${b.size}`;
      return aText.localeCompare(bText);
    });
}

export function listInventoryTransactions(limit = 250) {
  return runtimeStore.inventoryTransactions.slice(
    0,
    Math.max(1, Math.min(1000, Number(limit || 250)))
  );
}

export function getOnHand(input) {
  const identity = resolveInventoryIdentity(input);
  const exact = runtimeStore.blankInventory[identity.key];
  if (exact) return Math.max(0, Number(exact.onHandQty || 0));

  // A record may have been created before the exact supplier SKU was known.
  const fallbackKey = inventoryKey({
    brand: identity.brand,
    style: identity.style,
    color: identity.color,
    size: identity.size
  });

  return Math.max(
    0,
    Number(runtimeStore.blankInventory[fallbackKey]?.onHandQty || 0)
  );
}

export function receiveBlankInventory(input, quantity, options = {}) {
  const qty = Math.max(0, Number(quantity || 0));
  if (qty <= 0) throw new Error("Receive quantity must be greater than zero.");

  const identity = resolveInventoryIdentity(input);
  if (!identity.style || !identity.color || !identity.size) {
    throw new Error("Style, color and size are required.");
  }

  const record = ensureRecord(identity);
  record.onHandQty = Number(record.onHandQty || 0) + qty;
  record.updatedAt = new Date().toISOString();

  const tx = transaction({
    record,
    quantity: qty,
    type: "receive",
    note: options.note,
    reference: options.reference
  });

  schedulePersistentSave();
  return { record, transaction: tx };
}

export function adjustBlankInventory(input, newQuantity, options = {}) {
  const qty = Math.max(0, Number(newQuantity || 0));
  const identity = resolveInventoryIdentity(input);

  if (!identity.style || !identity.color || !identity.size) {
    throw new Error("Style, color and size are required.");
  }

  const record = ensureRecord(identity);
  const previous = Number(record.onHandQty || 0);
  const difference = qty - previous;

  record.onHandQty = qty;
  if (options.minimumQty !== undefined) {
    record.minimumQty = Math.max(0, Number(options.minimumQty || 0));
  }
  if (options.location !== undefined) {
    record.location = String(options.location || "").trim();
  }
  record.updatedAt = new Date().toISOString();

  const tx = transaction({
    record,
    quantity: difference,
    type: "adjustment",
    note: options.note || `Adjusted from ${previous} to ${qty}`,
    reference: options.reference
  });

  schedulePersistentSave();
  return { record, transaction: tx };
}

export function changeBlankInventory(input, quantity, options = {}) {
  const change = Number(quantity || 0);
  if (!Number.isFinite(change) || change === 0) {
    throw new Error("Inventory change must be a nonzero number.");
  }

  const identity = resolveInventoryIdentity(input);
  const record = ensureRecord(identity);
  const before = Number(record.onHandQty || 0);
  const after = before + change;

  if (after < 0) {
    throw new Error(
      `Insufficient on-hand inventory. Available: ${before}; requested deduction: ${Math.abs(change)}.`
    );
  }

  record.onHandQty = after;
  record.updatedAt = new Date().toISOString();

  const tx = transaction({
    record,
    quantity: change,
    type: options.type || (change > 0 ? "increase" : "deduction"),
    note: options.note,
    reference: options.reference,
    pieceId: options.pieceId
  });

  schedulePersistentSave();
  return { record, transaction: tx };
}

export function inventoryIdentityForPiece(piece) {
  return resolveInventoryIdentity({
    supplierSku: piece.vendorSku,
    garmentName: piece.style || piece.garment,
    color: piece.color,
    size: piece.size
  });
}

export function deductInventoryForPrintedPiece(piece) {
  if (piece.inventoryDeductedAt) {
    return { alreadyDeducted: true, record: null };
  }

  const identity = inventoryIdentityForPiece(piece);
  const result = changeBlankInventory(identity, -1, {
    type: "printed_piece",
    note: `Deducted when piece ${piece.pieceId} was completed.`,
    reference: piece.orderNumber,
    pieceId: piece.pieceId
  });

  piece.inventoryDeductedAt = new Date().toISOString();
  piece.inventoryDeductionKey = result.record.key;
  schedulePersistentSave();

  return result;
}

export function restoreInventoryForPiece(piece) {
  if (!piece.inventoryDeductedAt) {
    return { restored: false, record: null };
  }

  const record = runtimeStore.blankInventory[piece.inventoryDeductionKey];
  const identity = record || inventoryIdentityForPiece(piece);

  const result = changeBlankInventory(identity, 1, {
    type: "print_reversal",
    note: `Restored because completed status was cleared for piece ${piece.pieceId}.`,
    reference: piece.orderNumber,
    pieceId: piece.pieceId
  });

  piece.inventoryDeductedAt = null;
  piece.inventoryDeductionKey = null;
  schedulePersistentSave();

  return { restored: true, ...result };
}

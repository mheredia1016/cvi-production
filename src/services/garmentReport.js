
export function buildGarmentReport(pieces) {
  const units = new Map();

  for (const piece of pieces) {
    const unitKey = `${piece.orderId}-${piece.sku}-${piece.unitNumber}`;
    if (!units.has(unitKey)) units.set(unitKey, piece);
  }

  const grouped = new Map();

  for (const piece of units.values()) {
    const key = `${piece.vendorSku}|${piece.garment}|${piece.color}|${piece.size}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        vendorSku: piece.vendorSku,
        garment: piece.garment,
        color: piece.color,
        size: piece.size,
        qty: 0
      });
    }

    grouped.get(key).qty += 1;
  }

  return [...grouped.values()].sort((a, b) =>
    String(a.vendorSku || "").localeCompare(String(b.vendorSku || ""))
  );
}

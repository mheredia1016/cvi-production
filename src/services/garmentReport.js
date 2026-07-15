export function buildGarmentReport(pieces) {
  const units = new Map();

  for (const piece of pieces) {
    const unitKey = `${piece.orderId}-${piece.sku}-${piece.unitNumber}`;
    if (!units.has(unitKey)) units.set(unitKey, piece);
  }

  const grouped = new Map();

  for (const piece of units.values()) {
    const style = piece.style || piece.garment || "";
    const type = piece.backendProductInfo || "";
    const key = `${style}|${piece.color}|${piece.size}|${type}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        style,
        color: piece.color || "",
        size: piece.size || "",
        type,
        qty: 0
      });
    }

    grouped.get(key).qty += 1;
  }

  return [...grouped.values()].sort((a, b) =>
    String(a.style).localeCompare(String(b.style)) ||
    String(a.color).localeCompare(String(b.color)) ||
    String(a.size).localeCompare(String(b.size)) ||
    String(a.type).localeCompare(String(b.type))
  );
}

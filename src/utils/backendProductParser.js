
export function parseBackendProductInfo(rawValue = "") {
  const raw = String(rawValue).trim();
  const parts = raw.split(",").map((value) => value.trim()).filter(Boolean);
  const requiresBack = parts.some((part) => part.toLowerCase() === "back");
  const process = parts.filter((part) => part.toLowerCase() !== "back").join(", ") || raw;

  return {
    raw,
    process,
    requiresFront: true,
    requiresBack
  };
}

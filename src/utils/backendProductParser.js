
const KNOWN_INSTRUCTIONS = new Map([
  ["uncheck black", "Uncheck Black"]
]);

export function parseBackendProductInfo(rawValue = "") {
  const raw = String(rawValue || "").trim();
  const parts = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  let process = "";
  let requiresBack = false;
  const printerInstructions = [];
  const unknownModifiers = [];

  for (const part of parts) {
    const normalized = part.toLowerCase();

    if (normalized === "back") {
      requiresBack = true;
      continue;
    }

    if (KNOWN_INSTRUCTIONS.has(normalized)) {
      printerInstructions.push(KNOWN_INSTRUCTIONS.get(normalized));
      continue;
    }

    if (!process) {
      process = part;
      continue;
    }

    unknownModifiers.push(part);
  }

  if (!process && raw) process = raw;

  return {
    raw,
    process,
    requiresFront: true,
    requiresBack,
    printerInstructions,
    unknownModifiers
  };
}

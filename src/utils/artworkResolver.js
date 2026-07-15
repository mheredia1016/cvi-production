
export function resolveArtwork(oldSku = "", requiresBack = false) {
  const normalized = String(oldSku || "").trim();

  return {
    front: {
      required: Boolean(normalized),
      filename: normalized ? `${normalized}.png` : ""
    },
    back: {
      required: Boolean(normalized && requiresBack),
      filename: normalized && requiresBack ? `${normalized} BACK.png` : ""
    }
  };
}


export function resolveArtwork(oldSku = "", mainSku = "", requiresBack = false) {
  const normalizedOldSku = String(oldSku || "").trim();
  const normalizedMainSku = String(mainSku || "").trim();

  const artworkSku = normalizedOldSku || normalizedMainSku;
  const artworkSource = normalizedOldSku
    ? "Old SKU"
    : (normalizedMainSku ? "Main SKU" : "");

  return {
    artworkSku,
    artworkSource,
    front: {
      required: Boolean(artworkSku),
      filename: artworkSku ? `${artworkSku}.png` : ""
    },
    back: {
      required: Boolean(artworkSku && requiresBack),
      filename: artworkSku && requiresBack ? `${artworkSku} BACK.png` : ""
    }
  };
}

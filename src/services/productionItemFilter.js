
import { config } from "../config/config.js";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export function isIgnoredProductionItem(item = {}) {
  const name = normalize(item.name);
  const sku = normalize(item.sku);

  const ignoredByName = config.ignoredProducts.names.some(
    (entry) => normalize(entry) && name === normalize(entry)
  );

  const ignoredBySku = config.ignoredProducts.skus.some(
    (entry) => normalize(entry) && sku === normalize(entry)
  );

  return ignoredByName || ignoredBySku;
}

export function splitProductionItems(items = []) {
  const productionItems = [];
  const ignoredItems = [];

  for (const item of items) {
    if (isIgnoredProductionItem(item)) ignoredItems.push(item);
    else productionItems.push(item);
  }

  return { productionItems, ignoredItems };
}

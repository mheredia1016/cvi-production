
import { runtimeStore } from "./runtimeStore.js";

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function listSsGarmentMappings() {
  return Array.isArray(runtimeStore.settings.ssGarmentMappings)
    ? runtimeStore.settings.ssGarmentMappings
    : [];
}

export function cleanSsGarmentMappings(mappings) {
  const seen = new Set();

  return (Array.isArray(mappings) ? mappings : [])
    .map((entry) => ({
      garmentName: String(entry?.garmentName || "").trim(),
      brand: String(entry?.brand || "").trim(),
      style: String(entry?.style || "").trim()
    }))
    .filter((entry) => entry.garmentName && entry.style)
    .filter((entry) => {
      const key = normalize(entry.garmentName);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function saveSsGarmentMappings(mappings) {
  const cleaned = cleanSsGarmentMappings(mappings);
  runtimeStore.settings.ssGarmentMappings = cleaned;
  return cleaned;
}

export function findSsGarmentMapping(garmentName) {
  const target = normalize(garmentName);
  if (!target) return null;

  const mappings = listSsGarmentMappings();

  const exact = mappings.find(
    (mapping) => normalize(mapping.garmentName) === target
  );
  if (exact) return exact;

  const partialMatches = mappings.filter((mapping) => {
    const mapped = normalize(mapping.garmentName);
    return mapped && (target.includes(mapped) || mapped.includes(target));
  });

  return partialMatches.length === 1 ? partialMatches[0] : null;
}

export function resolveSsLookup(item) {
  const mapping = findSsGarmentMapping(item?.style);

  if (!mapping) {
    return {
      mapping: null,
      supplierSku: String(item?.supplierSku || "").trim(),
      style: String(item?.style || "").trim(),
      brand: "",
      color: String(item?.color || "").trim(),
      size: String(item?.size || "").trim()
    };
  }

  return {
    mapping,
    supplierSku: String(item?.supplierSku || "").trim(),
    style: mapping.style,
    brand: mapping.brand,
    color: String(item?.color || "").trim(),
    size: String(item?.size || "").trim()
  };
}

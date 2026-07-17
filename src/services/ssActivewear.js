
import { config } from "../config/config.js";
import { runtimeStore } from "./runtimeStore.js";
import { schedulePersistentSave } from "./persistentState.js";

const requestCache = new Map();

function credentialsConfigured() {
  return Boolean(config.ss.accountNumber && config.ss.apiKey);
}

function authHeader() {
  return `Basic ${Buffer.from(
    `${config.ss.accountNumber}:${config.ss.apiKey}`
  ).toString("base64")}`;
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(unisex|mens?|womens?|youth|adult)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeSize(value) {
  const clean = String(value || "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, "")
    .replace(/^X-SMALL$/, "XS")
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

function normalizeColor(value) {
  return normalize(
    String(value || "")
      .replace(/\bheathered\b/gi, "heather")
      .replace(/\bsport grey\b/gi, "sport gray")
  );
}

function styleIdentifier(style, brand = "") {
  return `${String(brand || "").trim()} ${String(style || "").trim()}`.trim();
}

function catalogKey(style, brand = "") {
  return normalize(styleIdentifier(style, brand));
}

function cacheValid(entry) {
  return Boolean(
    entry &&
    Date.now() - entry.at < config.ss.cacheMinutes * 60 * 1000
  );
}

function buildQuery(params = {}) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }

  const text = query.toString();
  return text ? `?${text}` : "";
}

async function ssRequest(pathname, { fresh = false } = {}) {
  if (!credentialsConfigured()) {
    throw new Error(
      "S&S credentials are not configured. Add SS_ACCOUNT_NUMBER and SS_API_KEY."
    );
  }

  const cacheKey = pathname;
  const cached = requestCache.get(cacheKey);

  if (!fresh && cacheValid(cached)) return cached.value;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(`${config.ss.baseUrl}${pathname}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: authHeader()
      }
    });

    const raw = await response.text();
    let data = null;

    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = raw;
    }

    if (!response.ok) {
      const apiMessage = Array.isArray(data?.errors)
        ? data.errors.map((entry) => entry.message).filter(Boolean).join("; ")
        : "";

      throw new Error(
        `S&S API ${response.status}: ${
          apiMessage || response.statusText || String(raw).slice(0, 300)
        }`
      );
    }

    const value = {
      data,
      rateLimitRemaining: response.headers.get("x-rate-limit-remaining")
    };

    requestCache.set(cacheKey, { at: Date.now(), value });
    return value;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("S&S API request timed out after 25 seconds.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function filteredWarehouses(warehouses = []) {
  const selected = new Set(
    config.ss.warehouses.map((value) => String(value).toUpperCase())
  );

  return warehouses
    .filter((warehouse) => {
      if (selected.size === 0) return true;
      return selected.has(String(warehouse.warehouseAbbr || "").toUpperCase());
    })
    .map((warehouse) => ({
      warehouseAbbr: String(warehouse.warehouseAbbr || ""),
      qty: Math.max(0, Number(warehouse.qty || 0)),
      closeout: Boolean(warehouse.closeout),
      dropship: Boolean(warehouse.dropship),
      excludeFreeFreight: Boolean(warehouse.excludeFreeFreight),
      fullCaseOnly: Boolean(warehouse.fullCaseOnly),
      returnable: warehouse.returnable !== false
    }))
    .sort((a, b) => b.qty - a.qty);
}

function publicProduct(product) {
  const warehouses = filteredWarehouses(product?.warehouses || []);
  const availableQty = warehouses.reduce(
    (sum, warehouse) => sum + warehouse.qty,
    0
  );

  return {
    sku: String(product?.sku || ""),
    skuId: product?.skuID_Master ?? product?.skuID ?? null,
    gtin: String(product?.gtin || ""),
    yourSku: String(product?.yourSku || ""),
    styleId: product?.styleID ?? null,
    brandName: String(product?.brandName || ""),
    styleName: String(product?.styleName || ""),
    colorName: String(product?.colorName || ""),
    sizeName: String(product?.sizeName || ""),
    customerPrice:
      product?.customerPrice === undefined || product?.customerPrice === null
        ? null
        : Number(product.customerPrice),
    piecePrice:
      product?.piecePrice === undefined || product?.piecePrice === null
        ? null
        : Number(product.piecePrice),
    qty: Math.max(0, Number(product?.qty || 0)),
    availableQty,
    warehouses,
    closeout:
      warehouses.length > 0 &&
      warehouses.every((warehouse) => warehouse.closeout),
    fullCaseOnly: warehouses.some((warehouse) => warehouse.fullCaseOnly)
  };
}

async function resolveStyle(brand, style, { fresh = false } = {}) {
  const identifier = styleIdentifier(style, brand);

  if (!identifier) {
    throw new Error("S&S brand and style are required.");
  }

  const { data, rateLimitRemaining } = await ssRequest(
    `/styles/${encodeURIComponent(identifier)}${buildQuery({
      fields: "StyleID,PartNumber,BrandName,StyleName,Title",
      mediatype: "json"
    })}`,
    { fresh }
  );

  const styles = Array.isArray(data) ? data : [];

  const exact = styles.find((entry) => {
    return (
      normalize(entry.brandName) === normalize(brand) &&
      normalize(entry.styleName) === normalize(style)
    );
  });

  const resolved = exact || (styles.length === 1 ? styles[0] : null);

  if (!resolved) {
    throw new Error(
      `S&S could not uniquely resolve mapped style "${identifier}".`
    );
  }

  return {
    styleID: Number(resolved.styleID),
    partNumber: String(resolved.partNumber || ""),
    brandName: String(resolved.brandName || brand || ""),
    styleName: String(resolved.styleName || style || ""),
    title: String(resolved.title || ""),
    rateLimitRemaining
  };
}

async function productsByStyleId(styleID, { fresh = false } = {}) {
  const { data, rateLimitRemaining } = await ssRequest(
    `/products/${buildQuery({
      styleid: styleID,
      Warehouses: config.ss.warehouses,
      mediatype: "json"
    })}`,
    { fresh }
  );

  const products = Array.isArray(data) ? data : [];

  if (products.length === 0) {
    throw new Error(`S&S returned no products for styleID ${styleID}.`);
  }

  return { products, rateLimitRemaining };
}

function findVariant(products, color, size) {
  const wantedColor = normalizeColor(color);
  const wantedSize = normalizeSize(size);

  const exact = products.filter(
    (product) =>
      normalizeColor(product.colorName) === wantedColor &&
      normalizeSize(product.sizeName) === wantedSize
  );

  if (exact.length === 1) return exact[0];

  if (exact.length > 1) {
    throw new Error(
      `Multiple S&S variants matched ${color} / ${size}. Enter the exact S&S SKU.`
    );
  }

  const colorOptions = [
    ...new Set(
      products
        .filter((product) => normalizeSize(product.sizeName) === wantedSize)
        .map((product) => product.colorName)
    )
  ].slice(0, 8);

  throw new Error(
    `No S&S variant matched ${color} / ${size}.` +
    (colorOptions.length
      ? ` Available colors for ${size}: ${colorOptions.join(", ")}.`
      : "")
  );
}

export function ssConfigurationStatus() {
  return {
    configured: credentialsConfigured(),
    accountNumberMasked: config.ss.accountNumber
      ? `${"*".repeat(Math.max(0, config.ss.accountNumber.length - 4))}${
          config.ss.accountNumber.slice(-4)
        }`
      : "",
    baseUrl: config.ss.baseUrl,
    warehouses: config.ss.warehouses,
    cacheMinutes: config.ss.cacheMinutes,
    submitEnabled: config.ss.submitEnabled
  };
}

export async function testSsConnection() {
  const { data, rateLimitRemaining } = await ssRequest(
    `/styles/${buildQuery({
      fields: "StyleID",
      mediatype: "json"
    })}`,
    { fresh: true }
  );

  return {
    success: true,
    configured: true,
    message: "Connected to S&S Activewear.",
    returnedRecords: Array.isArray(data) ? data.length : 0,
    rateLimitRemaining
  };
}

export async function getSsProductBySku(sku, { fresh = false } = {}) {
  const cleanSku = String(sku || "").trim();

  if (!cleanSku) throw new Error("S&S SKU is required.");

  const { data, rateLimitRemaining } = await ssRequest(
    `/products/${encodeURIComponent(cleanSku)}${buildQuery({
      Warehouses: config.ss.warehouses,
      mediatype: "json"
    })}`,
    { fresh }
  );

  const product = Array.isArray(data) ? data[0] : null;

  if (!product) throw new Error(`S&S SKU ${cleanSku} was not found.`);

  return {
    product: publicProduct(product),
    matchMethod: "exact_supplier_sku",
    rateLimitRemaining
  };
}

export async function syncSsMappedCatalog(mappings = []) {
  const unique = [];
  const seen = new Set();

  for (const mapping of Array.isArray(mappings) ? mappings : []) {
    const brand = String(mapping?.brand || "").trim();
    const style = String(mapping?.style || "").trim();
    const garmentName = String(mapping?.garmentName || "").trim();

    if (!brand || !style) continue;

    const key = catalogKey(style, brand);
    if (seen.has(key)) continue;
    seen.add(key);

    unique.push({ key, brand, style, garmentName });
  }

  if (unique.length === 0) {
    throw new Error("No S&S blank garment mappings are configured.");
  }

  const synced = [];
  const errors = [];
  let rateLimitRemaining = null;

  for (const mapping of unique) {
    try {
      const resolved = await resolveStyle(
        mapping.brand,
        mapping.style,
        { fresh: true }
      );

      const productResult = await productsByStyleId(
        resolved.styleID,
        { fresh: true }
      );

      runtimeStore.ssCatalog.styles[mapping.key] = {
        garmentName: mapping.garmentName,
        requestedBrand: mapping.brand,
        requestedStyle: mapping.style,
        brand: resolved.brandName,
        style: resolved.styleName,
        title: resolved.title,
        styleID: resolved.styleID,
        partNumber: resolved.partNumber,
        syncedAt: new Date().toISOString(),
        products: productResult.products
      };

      rateLimitRemaining =
        productResult.rateLimitRemaining ??
        resolved.rateLimitRemaining ??
        rateLimitRemaining;

      synced.push({
        garmentName: mapping.garmentName,
        brand: resolved.brandName,
        style: resolved.styleName,
        title: resolved.title,
        styleID: resolved.styleID,
        partNumber: resolved.partNumber,
        variants: productResult.products.length
      });
    } catch (error) {
      errors.push({
        garmentName: mapping.garmentName,
        brand: mapping.brand,
        style: mapping.style,
        identifier: styleIdentifier(mapping.style, mapping.brand),
        error: error.message
      });
    }
  }

  runtimeStore.ssCatalog.lastSyncAt = new Date().toISOString();
  runtimeStore.ssCatalog.lastError = errors.length
    ? `${errors.length} mapped style(s) failed to sync.`
    : "";

  const entries = Object.values(runtimeStore.ssCatalog.styles);
  runtimeStore.ssCatalog.syncedStyleCount = entries.length;
  runtimeStore.ssCatalog.variantCount = entries.reduce(
    (sum, entry) => sum + (Array.isArray(entry.products) ? entry.products.length : 0),
    0
  );

  schedulePersistentSave();

  return {
    success: errors.length === 0,
    synced,
    errors,
    rateLimitRemaining,
    catalog: ssCatalogStatus()
  };
}

export function ssCatalogStatus() {
  const styles = Object.values(runtimeStore.ssCatalog.styles || {}).map(
    (entry) => ({
      garmentName: entry.garmentName || "",
      brand: entry.brand || "",
      style: entry.style || "",
      title: entry.title || "",
      styleID: entry.styleID ?? null,
      partNumber: entry.partNumber || "",
      syncedAt: entry.syncedAt || null,
      variants: Array.isArray(entry.products) ? entry.products.length : 0
    })
  );

  return {
    lastSyncAt: runtimeStore.ssCatalog.lastSyncAt || null,
    lastError: runtimeStore.ssCatalog.lastError || "",
    syncedStyleCount: styles.length,
    variantCount: styles.reduce((sum, entry) => sum + entry.variants, 0),
    styles
  };
}

export function clearSsCatalog() {
  runtimeStore.ssCatalog = {
    styles: {},
    lastSyncAt: null,
    lastError: "",
    syncedStyleCount: 0,
    variantCount: 0
  };

  requestCache.clear();
  schedulePersistentSave();
}

export async function matchSsProduct({
  supplierSku,
  style,
  brand = "",
  color,
  size,
  fresh = false
}) {
  if (supplierSku) {
    return getSsProductBySku(supplierSku, { fresh });
  }

  const key = catalogKey(style, brand);
  let catalogEntry = runtimeStore.ssCatalog.styles?.[key];

  if (!catalogEntry || fresh) {
    const resolved = await resolveStyle(brand, style, { fresh });
    const productResult = await productsByStyleId(
      resolved.styleID,
      { fresh }
    );

    catalogEntry = {
      garmentName: "",
      requestedBrand: brand,
      requestedStyle: style,
      brand: resolved.brandName,
      style: resolved.styleName,
      title: resolved.title,
      styleID: resolved.styleID,
      partNumber: resolved.partNumber,
      syncedAt: new Date().toISOString(),
      products: productResult.products
    };

    runtimeStore.ssCatalog.styles[key] = catalogEntry;
    runtimeStore.ssCatalog.lastSyncAt = new Date().toISOString();
    schedulePersistentSave();
  }

  const variant = findVariant(catalogEntry.products || [], color, size);

  return {
    product: publicProduct(variant),
    matchMethod: "mapped_styleid_catalog",
    styleResolution: {
      styleID: catalogEntry.styleID,
      partNumber: catalogEntry.partNumber,
      brand: catalogEntry.brand,
      style: catalogEntry.style
    },
    rateLimitRemaining: null
  };
}

export function clearSsCache() {
  requestCache.clear();
}

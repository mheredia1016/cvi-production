
import { config } from "../config/config.js";
import { runtimeStore } from "./runtimeStore.js";

const styleCache = new Map();
const skuCache = new Map();

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

  const xPrefix = clean.match(/^(X{2,6})L$/);
  if (xPrefix) return `${xPrefix[1].length}XL`;

  const xSuffix = clean.match(/^([2-6])X$/);
  if (xSuffix) return `${xSuffix[1]}XL`;

  return clean;
}


function styleIdentifier(style, brand = "") {
  const cleanStyle = String(style || "").trim();
  const cleanBrand = String(brand || "").trim();

  if (!cleanBrand) return cleanStyle;

  const normalizedStyle = normalize(cleanStyle);
  const normalizedBrand = normalize(cleanBrand);

  if (normalizedStyle.startsWith(normalizedBrand)) {
    return cleanStyle;
  }

  return `${cleanBrand} ${cleanStyle}`.trim();
}

function catalogKey(style, brand = "") {
  return normalize(styleIdentifier(style, brand));
}

function getCatalogEntry(style, brand = "") {
  return runtimeStore.ssCatalog.styles[catalogKey(style, brand)] || null;
}

function cacheValid(entry) {
  if (!entry) return false;
  return Date.now() - entry.at < config.ss.cacheMinutes * 60 * 1000;
}

async function ssRequest(path, options = {}) {
  if (!credentialsConfigured()) {
    throw new Error(
      "S&S credentials are not configured. Add SS_ACCOUNT_NUMBER and SS_API_KEY in Railway."
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(`${config.ss.baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: authHeader(),
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
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
        `S&S API ${response.status}: ${apiMessage || response.statusText || String(raw).slice(0, 300)}`
      );
    }

    return {
      data,
      rateLimitRemaining: response.headers.get("x-rate-limit-remaining")
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("S&S API request timed out after 20 seconds.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function warehouseSummary(product) {
  const allowed = new Set(config.ss.warehouses.map((value) => value.toUpperCase()));
  const warehouses = (product?.warehouses || [])
    .filter((warehouse) =>
      allowed.size === 0 || allowed.has(String(warehouse.warehouseAbbr || "").toUpperCase())
    )
    .map((warehouse) => ({
      warehouseAbbr: String(warehouse.warehouseAbbr || ""),
      qty: Math.max(0, Number(warehouse.qty || 0)),
      closeout: Boolean(warehouse.closeout),
      dropship: Boolean(warehouse.dropship),
      fullCaseOnly: Boolean(warehouse.fullCaseOnly),
      returnable: warehouse.returnable !== false
    }))
    .sort((a, b) => b.qty - a.qty);

  return {
    warehouses,
    availableQty: warehouses.reduce((sum, warehouse) => sum + warehouse.qty, 0)
  };
}

function publicProduct(product) {
  const inventory = warehouseSummary(product);

  return {
    sku: String(product?.sku || ""),
    skuId: product?.skuID_Master ?? product?.skuID ?? null,
    gtin: String(product?.gtin || ""),
    yourSku: String(product?.yourSku || ""),
    brandName: String(product?.brandName || ""),
    styleName: String(product?.styleName || ""),
    colorName: String(product?.colorName || ""),
    sizeName: String(product?.sizeName || ""),
    customerPrice:
      product?.customerPrice === null || product?.customerPrice === undefined
        ? null
        : Number(product.customerPrice),
    qty: Math.max(0, Number(product?.qty || 0)),
    availableQty: inventory.availableQty,
    warehouses: inventory.warehouses,
    closeout: inventory.warehouses.length > 0 &&
      inventory.warehouses.every((warehouse) => warehouse.closeout),
    fullCaseOnly: inventory.warehouses.some((warehouse) => warehouse.fullCaseOnly)
  };
}

async function productsForStyle(style, brand = "", { fresh = false } = {}) {
  const identifier = styleIdentifier(style, brand);
  const cacheKey = catalogKey(style, brand);
  const cached = styleCache.get(cacheKey);

  if (!fresh && cacheValid(cached)) return cached.value;

  const query = encodeURIComponent(identifier);
  const warehouseQuery = config.ss.warehouses.length
    ? `&Warehouses=${encodeURIComponent(config.ss.warehouses.join(","))}`
    : "";

  const { data, rateLimitRemaining } = await ssRequest(
    `/products/?style=${query}${warehouseQuery}&mediatype=json`
  );
  const products = Array.isArray(data) ? data : [];

  if (products.length === 0) {
    throw new Error(`S&S returned no products for mapped style "${identifier}".`);
  }

  const value = {
    identifier,
    products,
    rateLimitRemaining,
    syncedAt: new Date().toISOString()
  };

  styleCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

export function ssConfigurationStatus() {
  return {
    configured: credentialsConfigured(),
    accountNumberMasked: config.ss.accountNumber
      ? `${"*".repeat(Math.max(0, config.ss.accountNumber.length - 4))}${config.ss.accountNumber.slice(-4)}`
      : "",
    baseUrl: config.ss.baseUrl,
    warehouses: config.ss.warehouses,
    cacheMinutes: config.ss.cacheMinutes,
    submitEnabled: config.ss.submitEnabled
  };
}

export async function testSsConnection() {
  const { data, rateLimitRemaining } = await ssRequest(
    "/orders/?fields=OrderNumber&mediatype=json"
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

  const cacheKey = cleanSku.toUpperCase();
  const cached = skuCache.get(cacheKey);
  if (!fresh && cacheValid(cached)) return cached.value;

  const warehouses = config.ss.warehouses.length
    ? `?Warehouses=${encodeURIComponent(config.ss.warehouses.join(","))}&mediatype=json`
    : "?mediatype=json";

  const { data, rateLimitRemaining } = await ssRequest(
    `/products/${encodeURIComponent(cleanSku)}${warehouses}`
  );
  const product = Array.isArray(data) ? data[0] : null;

  if (!product) throw new Error(`S&S SKU ${cleanSku} was not found.`);

  const value = {
    product: publicProduct(product),
    matchMethod: "supplier_sku",
    rateLimitRemaining
  };

  skuCache.set(cacheKey, { at: Date.now(), value });
  return value;
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
    try {
      return await getSsProductBySku(supplierSku, { fresh });
    } catch (error) {
      if (!style || !color || !size) throw error;
    }
  }

  if (!style || !color || !size) {
    throw new Error("Style, color, and size are required for automatic S&S matching.");
  }

  if (fresh) styleCache.delete(catalogKey(style, brand));

  const catalogEntry = getCatalogEntry(style, brand);
  const source = catalogEntry && !fresh
    ? {
        products: catalogEntry.products,
        rateLimitRemaining: catalogEntry.rateLimitRemaining || null
      }
    : await productsForStyle(style, brand, { fresh });

  const { products, rateLimitRemaining } = source;
  const normalizedStyle = normalize(style);
  const normalizedColor = normalize(color);
  const normalizedSize = normalizeSize(size);

  const normalizedBrand = normalize(brand);

  const candidates = products.filter((product) => {
    const productStyle = normalize(product.styleName);
    const styleMatches =
      productStyle === normalizedStyle ||
      productStyle.includes(normalizedStyle) ||
      normalizedStyle.includes(productStyle);

    const brandMatches =
      !normalizedBrand ||
      normalize(product.brandName) === normalizedBrand ||
      normalize(product.brandName).includes(normalizedBrand) ||
      normalizedBrand.includes(normalize(product.brandName));

    return styleMatches &&
      brandMatches &&
      normalize(product.colorName) === normalizedColor &&
      normalizeSize(product.sizeName) === normalizedSize;
  });

  if (candidates.length === 0) {
    const colorSizeMatches = products.filter(
      (product) =>
        normalize(product.colorName) === normalizedColor &&
        normalizeSize(product.sizeName) === normalizedSize
    );

    if (colorSizeMatches.length === 1) {
      return {
        product: publicProduct(colorSizeMatches[0]),
        matchMethod: "style_query_color_size",
        rateLimitRemaining
      };
    }

    throw new Error(
      `No exact S&S match for ${brand ? brand + " " : ""}${style} / ${color} / ${size}. Check the blank garment mapping or enter the S&S variant SKU manually.`
    );
  }

  if (candidates.length > 1) {
    throw new Error(
      `Multiple S&S matches found for ${brand ? brand + " " : ""}${style} / ${color} / ${size}. Enter the S&S variant SKU manually.`
    );
  }

  return {
    product: publicProduct(candidates[0]),
    matchMethod: "style_color_size",
    rateLimitRemaining
  };
}


export async function syncSsMappedCatalog(mappings = []) {
  if (!credentialsConfigured()) {
    throw new Error(
      "S&S credentials are not configured. Add SS_ACCOUNT_NUMBER and SS_API_KEY in Railway."
    );
  }

  const unique = [];
  const seen = new Set();

  for (const mapping of Array.isArray(mappings) ? mappings : []) {
    const style = String(mapping?.style || "").trim();
    const brand = String(mapping?.brand || "").trim();
    if (!style) continue;

    const key = catalogKey(style, brand);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      garmentName: String(mapping?.garmentName || "").trim(),
      brand,
      style,
      key,
      identifier: styleIdentifier(style, brand)
    });
  }

  if (unique.length === 0) {
    throw new Error("No blank garment mappings are configured.");
  }

  const synced = [];
  const errors = [];
  let totalVariants = 0;
  let rateLimitRemaining = null;

  for (const mapping of unique) {
    try {
      const result = await productsForStyle(
        mapping.style,
        mapping.brand,
        { fresh: true }
      );

      runtimeStore.ssCatalog.styles[mapping.key] = {
        garmentName: mapping.garmentName,
        brand: mapping.brand,
        style: mapping.style,
        identifier: result.identifier,
        syncedAt: result.syncedAt,
        rateLimitRemaining: result.rateLimitRemaining,
        products: result.products
      };

      totalVariants += result.products.length;
      rateLimitRemaining =
        result.rateLimitRemaining ?? rateLimitRemaining;

      synced.push({
        garmentName: mapping.garmentName,
        brand: mapping.brand,
        style: mapping.style,
        identifier: result.identifier,
        variants: result.products.length,
        syncedAt: result.syncedAt
      });
    } catch (error) {
      errors.push({
        garmentName: mapping.garmentName,
        brand: mapping.brand,
        style: mapping.style,
        identifier: mapping.identifier,
        error: error.message
      });
    }
  }

  const allCatalogEntries = Object.values(runtimeStore.ssCatalog.styles);
  runtimeStore.ssCatalog.lastSyncAt = new Date().toISOString();
  runtimeStore.ssCatalog.lastError = errors.length
    ? `${errors.length} mapped style(s) failed to sync.`
    : "";
  runtimeStore.ssCatalog.syncedStyleCount = allCatalogEntries.length;
  runtimeStore.ssCatalog.variantCount = allCatalogEntries.reduce(
    (sum, entry) => sum + (Array.isArray(entry.products) ? entry.products.length : 0),
    0
  );

  return {
    success: errors.length === 0,
    synced,
    errors,
    rateLimitRemaining,
    catalog: ssCatalogStatus()
  };
}

export function ssCatalogStatus() {
  const styles = Object.values(runtimeStore.ssCatalog.styles).map((entry) => ({
    garmentName: entry.garmentName || "",
    brand: entry.brand || "",
    style: entry.style || "",
    identifier: entry.identifier || "",
    syncedAt: entry.syncedAt || null,
    variants: Array.isArray(entry.products) ? entry.products.length : 0
  }));

  return {
    lastSyncAt: runtimeStore.ssCatalog.lastSyncAt,
    lastError: runtimeStore.ssCatalog.lastError,
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
  styleCache.clear();
  skuCache.clear();
}


export function clearSsCache() {
  styleCache.clear();
  skuCache.clear();
}

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../config/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_URL = "https://ssapi.shipstation.com";

const cache = new Map();
const inflight = new Map();

const STORE_CACHE_MS = Number(process.env.SHIPSTATION_STORE_CACHE_SECONDS || 600) * 1000;
const TAG_CACHE_MS = Number(process.env.SHIPSTATION_TAG_CACHE_SECONDS || 600) * 1000;
const ORDER_CACHE_MS = Number(process.env.SHIPSTATION_ORDER_CACHE_SECONDS || 60) * 1000;
const MAX_RETRIES = Number(process.env.SHIPSTATION_MAX_RETRIES || 2);

function readMockData() {
  const filePath = path.join(__dirname, "..", "data", "mock-data.json");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function authorizationHeader() {
  return "Basic " + Buffer.from(
    `${config.shipstation.apiKey}:${config.shipstation.apiSecret}`
  ).toString("base64");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getWaitMilliseconds(response, attempt) {
  const retryAfter = Number(response.headers.get("retry-after"));
  const rateReset = Number(response.headers.get("x-rate-limit-reset"));

  if (Number.isFinite(retryAfter) && retryAfter > 0) return (retryAfter + 1) * 1000;
  if (Number.isFinite(rateReset) && rateReset > 0) return (rateReset + 1) * 1000;

  return Math.min(60000, 5000 * (attempt + 1));
}

async function shipStationGet(endpoint, attempt = 0) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      Authorization: authorizationHeader(),
      Accept: "application/json"
    }
  });

  if (response.status === 429 && attempt < MAX_RETRIES) {
    const waitMs = getWaitMilliseconds(response, attempt);
    console.warn(`ShipStation rate limit reached. Retrying in ${Math.ceil(waitMs / 1000)} seconds.`);
    await sleep(waitMs);
    return shipStationGet(endpoint, attempt + 1);
  }

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    if (response.status === 429) {
      const waitSeconds = Math.ceil(getWaitMilliseconds(response, attempt) / 1000);
      throw new Error(`ShipStation rate limit reached. Wait about ${waitSeconds} seconds, then try again.`);
    }
    throw new Error(`ShipStation ${response.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }

  return data;
}

async function cached(key, ttlMs, loader, forceRefresh = false) {
  const current = cache.get(key);
  const now = Date.now();

  if (!forceRefresh && current && current.expiresAt > now) {
    return current.value;
  }

  if (!forceRefresh && inflight.has(key)) {
    return inflight.get(key);
  }

  const promise = loader()
    .then((value) => {
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

function option(item, name) {
  const match = (item.options || []).find(
    (entry) => String(entry.name || "").trim().toLowerCase() === name.toLowerCase()
  );
  return match?.value || "";
}

async function getTags() {
  if (config.useMockData) return [{ tagId: 1, name: config.shipstation.sourceTag }];

  return cached("tags", TAG_CACHE_MS, async () => {
    const data = await shipStationGet("/accounts/listtags");
    return Array.isArray(data) ? data : (data.tags || []);
  });
}

export async function getStores(options = {}) {
  if (config.useMockData) return readMockData().stores;

  return cached("stores", STORE_CACHE_MS, async () => {
    const data = await shipStationGet("/stores");
    return Array.isArray(data) ? data : (data.stores || []);
  }, Boolean(options.forceRefresh));
}

export async function getSourceOrders(options = {}) {
  if (config.useMockData) return readMockData().orders;

  const cacheKey = `orders:${config.shipstation.sourceTag}:${config.shipstation.orderStatus}`;

  return cached(cacheKey, ORDER_CACHE_MS, async () => {
    const tags = await getTags();
    const tag = tags.find(
      (entry) => String(entry.name || "").trim().toLowerCase() === config.shipstation.sourceTag.toLowerCase()
    );

    if (!tag) throw new Error(`ShipStation tag not found: ${config.shipstation.sourceTag}`);

    const orders = [];
    let page = 1;

    while (true) {
      const data = await shipStationGet(
        `/orders/listbytag?orderStatus=${encodeURIComponent(config.shipstation.orderStatus)}` +
        `&tagId=${tag.tagId}&page=${page}&pageSize=500`
      );

      orders.push(...(data.orders || []));

      if (page >= Number(data.pages || 1)) break;
      page += 1;
    }

    return orders.map((order) => ({
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      storeId: Number(order.advancedOptions?.storeId || 0),
      orderDate: String(order.orderDate || "").slice(0, 10),
      customField1: order.advancedOptions?.customField1 || "",
      items: (order.items || []).map((item) => ({
        orderItemId: item.orderItemId,
        sku: item.sku || "",
        oldSku: option(item, "Old SKU"),
      mainSku: option(item, "Main SKU"),
        name: item.name || "",
        quantity: Number(item.quantity || 1),
        backendProductInfo: option(item, "Backend Product Info"),
        garment: option(item, "Type of Garment"),
        style: option(item, "Style") || option(item, "Type of Garment"),
        color: option(item, "Color"),
        size: option(item, "Size Property") || option(item, "Size"),
        vendorSku: item.sku || ""
      }))
    }));
  }, Boolean(options.forceRefresh));
}

export function clearShipStationCache() {
  cache.clear();
}

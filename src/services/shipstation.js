
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../config/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_URL = "https://ssapi.shipstation.com";

function readMockData() {
  const filePath = path.join(__dirname, "..", "data", "mock-data.json");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function authorizationHeader() {
  return "Basic " + Buffer.from(
    `${config.shipstation.apiKey}:${config.shipstation.apiSecret}`
  ).toString("base64");
}

async function shipStationGet(endpoint) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      Authorization: authorizationHeader(),
      Accept: "application/json"
    }
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`ShipStation ${response.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }

  return data;
}

function option(item, name) {
  const match = (item.options || []).find(
    (entry) => String(entry.name || "").trim().toLowerCase() === name.toLowerCase()
  );
  return match?.value || "";
}

export async function getStores() {
  if (config.useMockData) return readMockData().stores;
  const data = await shipStationGet("/stores");
  return Array.isArray(data) ? data : (data.stores || []);
}

export async function getSourceOrders() {
  if (config.useMockData) return readMockData().orders;

  const tagData = await shipStationGet("/accounts/listtags");
  const tags = Array.isArray(tagData) ? tagData : (tagData.tags || []);
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
}

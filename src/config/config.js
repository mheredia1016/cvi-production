
import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 3000),
  useMockData: String(process.env.USE_MOCK_DATA || "true").toLowerCase() === "true",
  ss: {
    apiKey: process.env.SS_API_KEY || "",
    accountNumber: process.env.SS_ACCOUNT_NUMBER || "",
    submitEnabled: String(process.env.SS_SUBMIT_ENABLED || "false").toLowerCase() === "true"
  },
  shipstation: {
    apiKey: process.env.SHIPSTATION_API_KEY || "",
    apiSecret: process.env.SHIPSTATION_API_SECRET || "",
    sourceTag: process.env.SHIPSTATION_SOURCE_TAG || "In Production",
    orderStatus: process.env.SHIPSTATION_ORDER_STATUS || "awaiting_shipment",
    writeEnabled: String(process.env.SHIPSTATION_WRITE_ENABLED || "false").toLowerCase() === "true",
    enabledStoreIds: (process.env.SHIPSTATION_ENABLED_STORE_IDS || "101")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter(Boolean)
  }
};

export const productTypes = [
  "White Ink, Back",
  "DTG Light, Back",
  "White Ink",
  "DTG Light",
  "EPT",
  "Embroidery To Order",
  "Embroidery",
  "Poster/Sticker",
  "Sublimation",
  "Pre-Stock",
  "DTF"
];

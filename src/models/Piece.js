
export function createPiece(data) {
  return {
    pieceId: data.pieceId,
    orderId: data.orderId,
    orderNumber: data.orderNumber,
    orderDate: data.orderDate,
    storeId: data.storeId,
    storeName: data.storeName,
    rush: data.rush,
    customField1: data.customField1,
    unitNumber: data.unitNumber,
    unitCount: data.unitCount,
    sku: data.sku,
    oldSku: data.oldSku,
    title: data.title,
    backendProductInfo: data.backendProductInfo,
    process: data.process,
    requiresFront: data.requiresFront,
    requiresBack: data.requiresBack,
    frontArtwork: data.frontArtwork,
    backArtwork: data.backArtwork,
    garment: data.garment,
    color: data.color,
    size: data.size,
    vendorSku: data.vendorSku,
    status: "waiting",
    labelPrinted: false,
    labelPrintedAt: null,
    labelStock: null
  };
}

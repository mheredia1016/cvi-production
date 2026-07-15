
export function buildSsDraft(garmentRows, date) {
  return {
    id: `SS-DRAFT-${date}`,
    productionDate: date,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "draft",
    vendor: "S&S Activewear",
    submitEnabled: false,
    items: garmentRows.map((row, index) => ({
      lineId: `${date}-${index + 1}`,
      supplierSku: row.vendorSku || "",
      style: row.style || row.garment || "",
      color: row.color || "",
      size: row.size || "",
      type: row.type || "",
      requiredQty: Number(row.qty || 0),
      onHandQty: 0,
      orderQty: Number(row.qty || 0),
      notes: ""
    }))
  };
}

export function summarizeSsDraft(draft) {
  const items = draft?.items || [];
  return {
    lines: items.length,
    requiredQty: items.reduce((sum, item) => sum + Number(item.requiredQty || 0), 0),
    onHandQty: items.reduce((sum, item) => sum + Number(item.onHandQty || 0), 0),
    orderQty: items.reduce((sum, item) => sum + Number(item.orderQty || 0), 0),
    missingSupplierSku: items.filter((item) => !String(item.supplierSku || "").trim()).length
  };
}

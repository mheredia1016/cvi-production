# ProductionOS v9.1 — Blank Inventory & Receiving

## Included

- New **Blank Inventory** page
- Receive blank garments
- Manual on-hand adjustments
- Minimum stock levels
- Storage location field
- Searchable inventory table
- Inventory transaction history
- S&S exact SKU attached when the mapped catalog is available
- S&S draft automatically uses local on-hand quantities
- Purchase quantity automatically recalculates:

```text
Order Qty = Required Qty - On Hand Qty
```

- When a piece becomes fully printed, one blank is deducted
- If the completed print status is cleared, the blank is restored
- Inventory persists through the Railway Volume

## First test

1. Deploy v9.1.
2. Confirm the Railway Volume is mounted at `/data`.
3. Open **Blank Inventory**.
4. Use:

```text
Garment Name: Basic Unisex Heavy Cotton T-Shirt
Brand: Gildan
Style: 5000
Color: Black
Size: XL
Quantity Received: 5
```

5. Click **Receive Inventory**.
6. Return to **Daily Manager**.
7. Click **Build / Refresh Draft**.

For a requirement of one Black XL Gildan 5000, the draft should show:

```text
Required: 1
On Hand: 5
Order: 0
```

## Printing deduction test

1. Start with on hand `5`.
2. Load a matching piece in Printer Scan Test.
3. Mark all required sides printed.
4. Open Blank Inventory.
5. On hand should now be `4`.
6. Clear one printed side.
7. On hand should return to `5`.

## Important behavior

ProductionOS blocks completion when local on-hand inventory is zero. Receive or
adjust the blank inventory before completing that piece.

S&S order submission remains disabled in v9.1.

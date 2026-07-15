# ProductionOS Piece-Level v2

1. Deploy to Railway or run `npm install` then `node server.js`.
2. Open `/backend.html`.
3. Import Ready For Production orders.
4. Open `/piece-labels.html`.
5. Scan generated piece IDs at Print/QC.
6. Shipping uses the parent order number.

This sample creates one barcode per physical unit and production step. QC rejection creates a new replacement piece ID.

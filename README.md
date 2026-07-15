# ProductionOS Label Center v3

Adds the manager's daily label workflow:

- Rush orders are detected by ShipStation Custom Field 1 containing `Skip The Line`
- Rush labels are printed first using red 3x1 thermal label stock
- Regular labels use white 3x1 thermal stock
- Regular labels can be filtered by Backend Product Info:
  - White Ink, Back
  - DTG Light, Back
  - White Ink
  - DTG Light
  - EPT
  - Embroidery To Order
  - Embroidery
  - Poster/Sticker
  - Sublimation
  - Pre-Stock
  - DTF
- Date filter
- Unprinted-only filter
- Mark printed batches
- Garment report defaults to previous day

## Test

1. Open `/backend.html`
2. Import Ready For Production
3. Open `/label-center.html`
4. Print Rush first
5. Switch to Regular and select each Product Type

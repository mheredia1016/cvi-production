# ProductionOS v10.0 — Operator Workspace

## Main behavior change

Clicking **Open** in Daily Label Queue no longer renders every label below the
manager page.

It opens a dedicated station:

```text
/station.html?date=YYYY-MM-DD&category=White+Ink&rush=false
```

## Station workflow

1. Enter operator name.
2. Click **Print All Labels**.
   - The entire category opens as one browser print job.
   - Labels are not rendered as a long manager-page list.
3. Click **Mark All Labels Printed** after printing.
4. Work one piece at a time.
5. Load front/back artwork in Graphics Lab.
6. Mark each required side printed.
7. Click **Complete Piece & Load Next**.
8. Inventory deduction continues through the existing completion workflow.

## Controls

- Print All Labels
- Mark All Labels Printed
- Reprint Current Label
- Load Front
- Load Back
- Mark/Clear side printed
- Complete piece
- Previous
- Next
- Hold
- Skip
- Queue list

## DTF station

DTF pieces now open in their own operator workspace. The NeoStampa send button
is intentionally disabled until the official API connection is configured and
verified. Operators can manually mark DTF pieces complete during testing.

## Operator tracking

The station records the operator name on start, hold, skip, and completion
actions. The name is remembered in that browser.

This release does not yet enforce password-based user authentication or roles.
It establishes operator attribution and the station workflow first.

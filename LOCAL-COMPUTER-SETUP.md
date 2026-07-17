# ProductionOS Local Computer Setup — v8.1

Only the computer that needs to access the artwork drive and open Graphics Lab needs the local agent.

## First-time installation

1. Extract this ZIP to a permanent folder, such as:

   `C:\ProductionOS\Agent`

2. Double-click:

   `SETUP-LOCAL-AGENT.cmd`

3. Enter the two required values in `.env`:

   ```env
   SERVER_URL=https://your-productionos.up.railway.app
   AGENT_TOKEN=the-same-private-token-used-on-railway
   ```

4. Save `.env` and close Notepad.

5. Review the automatic diagnostics.

6. Start the agent with:

   `START-PRODUCTIONOS-AGENT.cmd`

## Automatic detection

At startup the agent:

- Uses the Windows computer name as the station name unless overridden.
- Checks the configured artwork path first.
- Checks `Z:\Merch Heroes\Designs`.
- Checks mapped drives `D:` through `Z:` for `Merch Heroes\Designs`.
- Uses the Windows PNG file association to open artwork in Graphics Lab.
- Creates `C:\ProductionOS\TestHotFolder`.
- Creates `C:\ProductionOS\DryRunJobs`.
- Tests its connection to Railway.
- Reports whether the artwork drive is available.

## Diagnostics

Double-click:

`CHECK-LOCAL-AGENT.cmd`

This does not start polling. It checks settings, Railway connectivity, the artwork drive, Graphics Lab mode, and local working folders.

## Optional overrides

Normally these are unnecessary:

```env
STATION_NAME=Graphics Lab Station 1
ARTWORK_ROOT=Z:\Merch Heroes\Designs
GRAPHICS_LAB_OPEN_MODE=associated_app
```

The mapped drive must be visible to the same Windows user running the agent.

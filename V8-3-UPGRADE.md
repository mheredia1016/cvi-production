# ProductionOS v8.3 — Graphics Lab Retry Fix

This release fixes front/back import requests becoming stuck.

## Changes

- Front and back jobs are tracked independently.
- Processing requests older than 45 seconds automatically return to the queue.
- Failed or active requests can be cleared per side with **Retry / Clear Job**.
- The Graphics Lab Station shows queued, processing, opened, error, or cancelled status.
- Last errors and automatic retry counts are visible.
- Status refreshes automatically every two seconds.
- Restarting Railway should no longer be required for normal failed imports.

## Upgrade

Replace the v8.2 repository files with this release and redeploy Railway.

On the production computer:

1. Pull or extract the same v8.3 files.
2. Preserve the existing `.env`.
3. Preserve:

   `agent\graphics-lab\graphics-lab.ini`

4. Run:

   `npm.cmd install`

5. Restart:

   `START-PRODUCTIONOS-AGENT.cmd`

The local `.env` must still include:

```env
GRAPHICS_LAB_OPEN_MODE=autohotkey
```

## Test

1. Open GTX Graphics Lab.
2. Start the local agent.
3. Load a front/back piece.
4. Open the front.
5. Open the back.
6. If either side fails, click **Retry / Clear Job** for that side and open it again.

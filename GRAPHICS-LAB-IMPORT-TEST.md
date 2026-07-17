# Graphics Lab Import Test

1. Install AutoHotkey v2.
2. Open GTX Graphics Lab on the shirt mockup screen.
3. Run `CALIBRATE-GRAPHICS-LAB.cmd`.
4. Hover over the center of **Add Image** and press `F8`.
5. Run `TEST-GRAPHICS-LAB-IMPORT.cmd`.
6. Paste the full path to a valid PNG.

Expected result:

- Graphics Lab becomes active.
- Add Image is clicked.
- The Windows Open dialog appears.
- The PNG path is entered.
- The image loads onto the shirt mockup.

After the standalone test works, set:

```env
GRAPHICS_LAB_OPEN_MODE=autohotkey
```

Then start the local agent and test **Open Front in Graphics Lab** from ProductionOS.

This test does not click Print.

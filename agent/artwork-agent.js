
import "dotenv/config";
import fs from "fs";
import path from "path";

const SERVER_URL = String(process.env.SERVER_URL || "http://localhost:3000").replace(/\/+$/, "");
const AGENT_TOKEN = process.env.AGENT_TOKEN || "change-this-private-token";
const ARTWORK_ROOT = process.env.MERCH_HEROES_ARTWORK_ROOT || "Z:\\Merch Heroes\\Designs";
const POLL_MS = Number(process.env.ARTWORK_AGENT_POLL_MS || 3000);
const PREVIEW_MAX_BYTES = Number(process.env.ARTWORK_PREVIEW_MAX_MB || 3) * 1024 * 1024;
const GRAPHICS_TEST_HOTFOLDER = process.env.GRAPHICS_TEST_HOTFOLDER || "C:\\ProductionOS\\TestHotFolder";
const PRINT_DRY_RUN_ROOT = process.env.PRINT_DRY_RUN_ROOT || "C:\\ProductionOS\\DryRunJobs";

let fileIndex = new Map();
let indexing = false;

function normalizeFilename(value) {
  return String(value || "").trim().toLowerCase();
}

async function walk(directory) {
  const results = [];
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      results.push(...await walk(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) {
      results.push(fullPath);
    }
  }

  return results;
}

async function rebuildIndex() {
  if (indexing) return;
  indexing = true;

  try {
    console.log(`Indexing artwork under: ${ARTWORK_ROOT}`);
    const files = await walk(ARTWORK_ROOT);
    const nextIndex = new Map();

    for (const filePath of files) {
      const key = normalizeFilename(path.basename(filePath));

      if (!nextIndex.has(key)) nextIndex.set(key, []);
      nextIndex.get(key).push(filePath);
    }

    fileIndex = nextIndex;
    console.log(`Artwork index ready: ${files.length} PNG files.`);
  } finally {
    indexing = false;
  }
}

async function previewFor(filePath) {
  if (!filePath) return null;

  const stats = await fs.promises.stat(filePath);
  const result = {
    found: true,
    path: filePath,
    filename: path.basename(filePath),
    sizeBytes: stats.size,
    duplicateMatches: []
  };

  if (stats.size <= PREVIEW_MAX_BYTES) {
    const data = await fs.promises.readFile(filePath);
    result.previewDataUrl = `data:image/png;base64,${data.toString("base64")}`;
  } else {
    result.previewSkipped = `File exceeds ${process.env.ARTWORK_PREVIEW_MAX_MB || 5} MB preview limit.`;
  }

  return result;
}

async function resolveFile(filename) {
  if (!filename) return { found: false, filename: "" };

  const matches = fileIndex.get(normalizeFilename(filename)) || [];

  if (!matches.length) {
    return {
      found: false,
      filename,
      searchedRoot: ARTWORK_ROOT
    };
  }

  const result = await previewFor(matches[0]);
  result.duplicateMatches = matches.slice(1);
  return result;
}

async function getJobs() {
  const response = await fetch(
    `${SERVER_URL}/api/printer/agent/jobs?token=${encodeURIComponent(AGENT_TOKEN)}`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Agent jobs request failed: ${response.status}`);
  }

  return data;
}

async function completeJob(job, payload) {
  const response = await fetch(
    `${SERVER_URL}/api/printer/agent/jobs/${encodeURIComponent(job.id)}/complete?token=${encodeURIComponent(AGENT_TOKEN)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    const responseText = await response.text();
    let data = {};

    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }

    throw new Error(
      data.error ||
      `Could not complete ${job.id}. HTTP ${response.status}: ${String(data.raw || "").slice(0, 300)}`
    );
  }
}

async function processJob(job) {
  console.log(`Looking up piece ${job.pieceId}: ${job.frontFilename}${job.requiresBack ? ` + ${job.backFilename}` : ""}`);

  try {
    let front = await resolveFile(job.frontFilename);
    let back = job.requiresBack
      ? await resolveFile(job.backFilename)
      : { found: false, required: false, filename: "" };

    // Refresh the index once when a required file is missing, in case files were added.
    if (!front.found || (job.requiresBack && !back.found)) {
      await rebuildIndex();
      front = await resolveFile(job.frontFilename);
      back = job.requiresBack
        ? await resolveFile(job.backFilename)
        : { found: false, required: false, filename: "" };
    }

    await completeJob(job, { front, back });
    console.log(`Completed lookup ${job.id}. Front: ${front.found ? "FOUND" : "MISSING"}; Back: ${job.requiresBack ? (back.found ? "FOUND" : "MISSING") : "NOT REQUIRED"}`);
  } catch (error) {
    console.error(`Lookup ${job.id} failed:`, error.message);
    await completeJob(job, { error: error.message });
  }
}

async function poll() {
  try {
    const jobs = await getJobs();

    for (const job of jobs) {
      await processJob(job);
    }
  } catch (error) {
    console.error("Artwork agent error:", error.message);
  }
}


async function getGraphicsJobs() {
  const response = await fetch(
    `${SERVER_URL}/api/printer/agent/graphics-jobs?token=${encodeURIComponent(AGENT_TOKEN)}`
  );

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Graphics jobs endpoint returned non-JSON: ${text.slice(0, 200)}`);
  }

  if (!response.ok) {
    throw new Error(data.error || `Graphics jobs request failed: ${response.status}`);
  }

  return data;
}

async function completeGraphicsJob(job, payload) {
  const response = await fetch(
    `${SERVER_URL}/api/printer/agent/graphics-jobs/${encodeURIComponent(job.id)}/complete?token=${encodeURIComponent(AGENT_TOKEN)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );

  const text = await response.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      `Could not complete graphics job ${job.id}. HTTP ${response.status}: ${String(data.raw || "").slice(0, 200)}`
    );
  }
}

function safe(value) {
  return String(value || "").replace(/[^a-z0-9._-]/gi, "_");
}

async function processGraphicsJob(job) {
  try {
    await fs.promises.mkdir(GRAPHICS_TEST_HOTFOLDER, { recursive: true });

    if (!fs.existsSync(job.sourcePath)) {
      throw new Error(`Source artwork no longer exists: ${job.sourcePath}`);
    }

    const extension = path.extname(job.sourceFilename || job.sourcePath) || ".png";
    const outputName = `${safe(job.pieceId)}-${safe(job.orderNumber)}-${safe(job.side)}-${safe(job.artworkSku)}${extension}`;
    const outputPath = path.join(GRAPHICS_TEST_HOTFOLDER, outputName);

    await fs.promises.copyFile(job.sourcePath, outputPath);

    await completeGraphicsJob(job, { outputPath });

    console.log(`Graphics test copy complete: ${job.sourcePath} -> ${outputPath}`);
  } catch (error) {
    console.error(`Graphics job ${job.id} failed:`, error.message);
    await completeGraphicsJob(job, { error: error.message });
  }
}

async function pollGraphicsJobs() {
  try {
    const jobs = await getGraphicsJobs();

    for (const job of jobs) {
      await processGraphicsJob(job);
    }
  } catch (error) {
    console.error("Graphics test agent error:", error.message);
  }
}


function xmlEscape(value) {
  return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;");
}
function boolXml(value) { return value ? "true" : "false"; }

function gtOptionXml(job, artworkFileName) {
  const s = job.settings;
  return `<?xml version="1.0"?>
<GTOPTION xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <szFileName>${xmlEscape(artworkFileName)}</szFileName>
  <uiCopies>${s.copies}</uiCopies>
  <byMachineMode>0</byMachineMode>
  <byPlatenSize>${s.platenSizeCode}</byPlatenSize>
  <byResolution>${s.resolutionCode}</byResolution>
  <byInk>${s.inkCode}</byInk>
  <byInkVolume>${s.inkVolumeOption}</byInkVolume>
  <byHighlight>${s.highlight}</byHighlight>
  <byMask>${s.mask}</byMask>
  <bMultiple>false</bMultiple>
  <bTransColor>false</bTransColor>
  <colorTrans>0</colorTrans>
  <byTolerance>0</byTolerance>
  <byChoke>${s.choke}</byChoke>
  <bPause>false</bPause>
  <bFastMode>${boolXml(s.fastMode)}</bFastMode>
  <bySaturation>${s.saturation}</bySaturation>
  <byContrast>${s.contrast}</byContrast>
  <bUniPrint>false</bUniPrint>
  <byDoublePrint>${s.doublePrint}</byDoublePrint>
  <bMaterialBlack>${boolXml(s.materialBlack)}</bMaterialBlack>
  <byMinWhite>${s.minWhite}</byMinWhite>
  <byBrightness>${s.brightness}</byBrightness>
  <bEcoMode>${boolXml(s.ecoMode)}</bEcoMode>
  <iCyanBalance>0</iCyanBalance><iMagentaBalance>0</iMagentaBalance><iYellowBalance>0</iYellowBalance><iBlackBalance>0</iBlackBalance>
  <bDivide>false</bDivide><byDivideSpan>0</byDivideSpan><byPauseSpan>0</byPauseSpan>
</GTOPTION>`;
}

function gtDataXml(job, jobName) {
  const s = job.settings;
  return `<?xml version="1.0" encoding="utf-8"?>
<GTDATA xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <szJobName>${xmlEscape(jobName)}</szJobName>
  <szDateTime>${new Date().toLocaleString()}</szDateTime>
  <szPlatenSize>${xmlEscape(s.platenSize)}</szPlatenSize>
  <byInk>${s.inkCode}</byInk><bEcoMode>${boolXml(s.ecoMode)}</bEcoMode><byResolution>${s.resolutionCode}</byResolution>
  <byHighlight>${s.highlight}</byHighlight><byMask>${s.mask}</byMask><byInkVolume>${s.inkVolumeOption}</byInkVolume>
  <byDoublePrint>${s.doublePrint}</byDoublePrint><uiTime>0</uiTime><uiWhiteness>0</uiWhiteness>
  <bFastMode>${boolXml(s.fastMode)}</bFastMode><bDivide>false</bDivide><byDivideSpan>0</byDivideSpan>
  <bPause>false</bPause><byPauseSpan>0</byPauseSpan><bMaterialBlack>${boolXml(s.materialBlack)}</bMaterialBlack>
  <bMultiple>false</bMultiple><bTransColor>false</bTransColor><colorTrans>0</colorTrans><byTolerance>0</byTolerance>
  <byMinWhite>${s.minWhite}</byMinWhite><byChoke>${s.choke}</byChoke><bySaturation>${s.saturation}</bySaturation>
  <byBrightness>${s.brightness}</byBrightness><byContrast>${s.contrast}</byContrast>
  <iCyanBalance>0</iCyanBalance><iMagentaBalance>0</iMagentaBalance><iYellowBalance>0</iYellowBalance><iBlackBalance>0</iBlackBalance>
  <bUniPrint>false</bUniPrint><uiInkColor>0</uiInkColor><uiInkWhite>0</uiInkWhite><uiCopies>${s.copies}</uiCopies>
</GTDATA>`;
}

async function getDryRunJobs() {
  const response = await fetch(`${SERVER_URL}/api/printer/agent/dry-run-jobs?token=${encodeURIComponent(AGENT_TOKEN)}`);
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { throw new Error(`Dry-run endpoint returned non-JSON: ${text.slice(0,200)}`); }
  if (!response.ok) throw new Error(data.error || `Dry-run jobs request failed: ${response.status}`);
  return data;
}

async function completeDryRunJob(job, payload) {
  const response = await fetch(`${SERVER_URL}/api/printer/agent/dry-run-jobs/${encodeURIComponent(job.id)}/complete?token=${encodeURIComponent(AGENT_TOKEN)}`, {
    method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Could not complete dry-run job ${job.id}: ${response.status}`);
}

async function writeSidePackage(job, side, art) {
  const sideFolder = path.join(PRINT_DRY_RUN_ROOT, safe(job.id), side.toUpperCase());
  await fs.promises.mkdir(sideFolder, {recursive:true});
  const outputArtName = `${safe(job.pieceId)}-${safe(side)}-${safe(job.artworkSku)}.png`;
  const outputArtPath = path.join(sideFolder, outputArtName);
  const optionPath = path.join(sideFolder, `${safe(job.pieceId)}-${safe(side)}-GTOPTION.xml`);
  const infoPath = path.join(sideFolder, `${safe(job.pieceId)}-${safe(side)}-Info.xml`);
  await fs.promises.copyFile(art.sourcePath, outputArtPath);
  await fs.promises.writeFile(optionPath, gtOptionXml(job, outputArtName), "utf8");
  await fs.promises.writeFile(infoPath, gtDataXml(job, outputArtName), "utf8");
  return {side, artwork:outputArtPath, gtoption:optionPath, gtdata:infoPath};
}

async function processDryRunJob(job) {
  try {
    const root = path.join(PRINT_DRY_RUN_ROOT, safe(job.id));
    await fs.promises.mkdir(root, {recursive:true});
    const sides = [await writeSidePackage(job, "front", job.front)];
    if (job.requiresBack && job.back) sides.push(await writeSidePackage(job, "back", job.back));
    const manifestPath = path.join(root, "job-manifest.json");
    await fs.promises.writeFile(manifestPath, JSON.stringify({
      dryRun:true,
      warning:"No ARX generated. No printer command executed.",
      generatedAt:new Date().toISOString(),
      job
    }, null, 2), "utf8");
    await completeDryRunJob(job, {outputFolder:root, files:{manifest:manifestPath, sides}});
    console.log(`Brother dry-run package complete: ${root}`);
  } catch(error) {
    console.error(`Dry-run job ${job.id} failed:`, error.message);
    await completeDryRunJob(job, {error:error.message});
  }
}

async function pollDryRunJobs() {
  try {
    const jobs = await getDryRunJobs();
    for (const job of jobs) await processDryRunJob(job);
  } catch(error) {
    console.error("Print engine dry-run error:", error.message);
  }
}

async function start() {
  console.log("ProductionOS Merch Heroes Artwork Agent");
  console.log("Server:", SERVER_URL);
  console.log("Artwork root:", ARTWORK_ROOT);
  console.log("Graphics test hot folder:", GRAPHICS_TEST_HOTFOLDER);
  console.log("Print dry-run root:", PRINT_DRY_RUN_ROOT);

  if (!fs.existsSync(ARTWORK_ROOT)) {
    console.error(`Artwork root is not accessible: ${ARTWORK_ROOT}`);
    console.error("Confirm that Z: is mapped for the same Windows user running this terminal.");
  } else {
    await rebuildIndex();
  }

  setInterval(poll, POLL_MS);
  setInterval(pollGraphicsJobs, Number(process.env.GRAPHICS_AGENT_POLL_MS || 2000));
  setInterval(pollDryRunJobs, Number(process.env.PRINT_ENGINE_POLL_MS || 2000));
  await poll();
  await pollGraphicsJobs();
  await pollDryRunJobs();
}

start().catch((error) => {
  console.error("Agent startup failed:", error);
  process.exitCode = 1;
});

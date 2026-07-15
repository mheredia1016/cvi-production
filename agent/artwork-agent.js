
import "dotenv/config";
import fs from "fs";
import path from "path";

const SERVER_URL = String(process.env.SERVER_URL || "http://localhost:3000").replace(/\/+$/, "");
const AGENT_TOKEN = process.env.AGENT_TOKEN || "change-this-private-token";
const ARTWORK_ROOT = process.env.MERCH_HEROES_ARTWORK_ROOT || "Z:\\Merch Heroes\\Designs";
const POLL_MS = Number(process.env.ARTWORK_AGENT_POLL_MS || 3000);
const PREVIEW_MAX_BYTES = Number(process.env.ARTWORK_PREVIEW_MAX_MB || 5) * 1024 * 1024;

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
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Could not complete ${job.id}`);
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

async function start() {
  console.log("ProductionOS Merch Heroes Artwork Agent");
  console.log("Server:", SERVER_URL);
  console.log("Artwork root:", ARTWORK_ROOT);

  if (!fs.existsSync(ARTWORK_ROOT)) {
    console.error(`Artwork root is not accessible: ${ARTWORK_ROOT}`);
    console.error("Confirm that Z: is mapped for the same Windows user running this terminal.");
  } else {
    await rebuildIndex();
  }

  setInterval(poll, POLL_MS);
  await poll();
}

start().catch((error) => {
  console.error("Agent startup failed:", error);
  process.exitCode = 1;
});

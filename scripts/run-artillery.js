"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function listSubdirectories(rootDir) {
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function chooseBestDirectoryMatch(partial, candidates) {
  if (!partial) return null;
  const p = partial.toLowerCase();
  const lowerCandidates = candidates.map((c) => ({
    raw: c,
    lower: c.toLowerCase(),
  }));

  // Exact match
  const exact = lowerCandidates.find((c) => c.lower === p);
  if (exact) return exact.raw;

  // Includes match → prefer the shortest name among includes
  const includesMatches = lowerCandidates.filter((c) => c.lower.includes(p));
  if (includesMatches.length > 0) {
    includesMatches.sort(
      (a, b) => a.raw.length - b.raw.length || a.raw.localeCompare(b.raw)
    );
    return includesMatches[0].raw;
  }

  // Fallback to Levenshtein distance
  let best = null;
  let bestDist = Infinity;
  for (const c of lowerCandidates) {
    const d = levenshtein(p, c.lower);
    if (d < bestDist) {
      bestDist = d;
      best = c.raw;
    }
  }
  return best;
}

function main() {
  const baseDir = path.resolve(__dirname, "..");
  const args = process.argv.slice(2);
  let ymlBaseName = "";
  let dirPartial = "";

  if (args.length >= 2) {
    // New usage: npm run tests -- <yaml-base> <directory-partial>
    ymlBaseName = String(args[0] || "")
      .trim()
      .replace(/\.ya?ml$/i, "");
    dirPartial = String(args[1] || "").trim();
  } else if (process.env.npm_lifecycle_event && args.length >= 1) {
    // Back-compat: npm run <yaml-base> -- <directory-partial>
    ymlBaseName = process.env.npm_lifecycle_event;
    dirPartial = String(args[0] || "").trim();
  } else {
    console.error("Usage: npm run tests -- <yaml-base> <directory-partial>");
    process.exit(1);
  }

  if (!ymlBaseName) {
    console.error(
      "Missing <yaml-base>. Example: npm run tests -- personal-designs dev"
    );
    process.exit(1);
  }
  if (!dirPartial) {
    console.error(
      "Missing <directory-partial>. Example: npm run tests -- %s dev",
      ymlBaseName
    );
    process.exit(1);
  }

  const ymlFileName = `${ymlBaseName}.yml`;

  const allDirs = listSubdirectories(baseDir).filter(
    (d) => d !== "node_modules" && !d.startsWith(".")
  );
  const candidateDirs = allDirs.filter((d) =>
    fs.existsSync(path.join(baseDir, d, ymlFileName))
  );
  if (candidateDirs.length === 0) {
    console.error(
      `No directories found containing ${ymlFileName}. Looked in:`,
      allDirs.join(", ")
    );
    process.exit(1);
  }

  const chosenDir = chooseBestDirectoryMatch(dirPartial, candidateDirs);
  if (!chosenDir) {
    console.error("Could not resolve directory from input:", dirPartial);
    console.error(
      "Available directories with",
      ymlFileName,
      ":",
      candidateDirs.join(", ")
    );
    process.exit(1);
  }

  const dirPath = path.join(baseDir, chosenDir);
  const ymlPath = path.join(dirPath, ymlFileName);
  const envPath = path.join(dirPath, ".env");
  const reportsDir = path.join(dirPath, "reports");
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  const reportPath = path.join(reportsDir, `${ymlBaseName}.json`);

  const npxArgs = ["artillery", "run", ymlPath];
  if (fs.existsSync(envPath)) {
    npxArgs.push("--env-file", envPath);
  }
  npxArgs.push("--output", reportPath);

  if (process.env.DRY_RUN === "1") {
    console.log("DRY_RUN: would execute ->", ["npx", ...npxArgs].join(" "));
    process.exit(0);
  }

  console.log("Executing:", "npx", npxArgs.join(" "));
  const child = spawn("npx", npxArgs, {
    stdio: "inherit",
    cwd: baseDir,
    env: process.env,
  });
  child.on("exit", (code) => process.exit(code));
}

main();

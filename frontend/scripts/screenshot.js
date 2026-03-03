const fs = require("node:fs");
const path = require("node:path");
const { chromium, devices } = require("playwright");

const ROUTES = [
  { path: "/", key: "dashboard" },
  { path: "/discover", key: "discover" },
  { path: "/watchlist", key: "watchlist" },
  { path: "/portfolio", key: "portfolio" },
  { path: "/trading", key: "trading" },
  { path: "/notifications", key: "notifications" },
];

const BASE_URL = process.env.SCREENSHOT_BASE_URL || "http://127.0.0.1:3000";

function dateStamp() {
  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

async function captureSet(browser, outputDir) {
  const desktopContext = await browser.newContext({
    viewport: { width: 1512, height: 982 },
  });
  const mobileContext = await browser.newContext({
    ...devices["iPhone 13"],
  });

  const desktopPage = await desktopContext.newPage();
  const mobilePage = await mobileContext.newPage();

  const results = [];

  for (const route of ROUTES) {
    const url = `${BASE_URL}${route.path}`;

    await desktopPage.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await desktopPage.waitForTimeout(1200);
    const desktopFile = path.join(outputDir, `${route.key}.desktop.png`);
    await desktopPage.screenshot({ path: desktopFile, fullPage: true });

    await mobilePage.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await mobilePage.waitForTimeout(1200);
    const mobileFile = path.join(outputDir, `${route.key}.mobile.png`);
    await mobilePage.screenshot({ path: mobileFile, fullPage: true });

    results.push({
      route: route.path,
      desktopFile,
      mobileFile,
      desktopFinalUrl: desktopPage.url(),
      mobileFinalUrl: mobilePage.url(),
    });
  }

  await desktopContext.close();
  await mobileContext.close();
  return results;
}

async function main() {
  const stamp = dateStamp();
  const outputDir = path.resolve(__dirname, "..", "docs", "screenshots", stamp);
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const results = await captureSet(browser, outputDir);
    const manifestPath = path.join(outputDir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify({ baseUrl: BASE_URL, results }, null, 2), "utf-8");
    process.stdout.write(`${manifestPath}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

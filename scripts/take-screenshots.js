#!/usr/bin/env node
/**
 * Takes screenshots of AI Session Manager UI for README.
 * Run: node scripts/take-screenshots.js
 */

const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");

const BASE_URL = "http://localhost:5000";
const OUT_DIR = path.join(__dirname, "../docs/screenshots");

fs.mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORT = { width: 1400, height: 860 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, filename, fn) {
  await fn(page);
  const outPath = path.join(OUT_DIR, filename);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`✓ ${filename}`);
}

async function clickNav(page, text) {
  await page.evaluate((t) => {
    const btn = Array.from(document.querySelectorAll("button.nav-item")).find(
      (b) => b.textContent.includes(t)
    );
    if (btn) btn.click();
  }, text);
  await sleep(900);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  const base = { waitUntil: "networkidle2", timeout: 15000 };

  // ── 1. Dashboard — expand first project ───────────────────
  await shot(page, "dashboard.png", async (p) => {
    await p.goto(BASE_URL, base);
    await sleep(600);
    // Click first project to expand
    await p.evaluate(() => {
      const item = document.querySelector(".project-item");
      if (item) item.click();
    });
    await sleep(800);
  });

  // ── 2. History viewer — open session content ───────────────
  await shot(page, "history.png", async (p) => {
    await p.goto(BASE_URL, base);
    await sleep(600);
    await clickNav(p, "히스토리");
    // Click first history session card to load conversation
    await p.evaluate(() => {
      const card = document.querySelector(".history-session");
      if (card) card.click();
    });
    await sleep(1500);
  });

  // ── 3. Cost dashboard ──────────────────────────────────────
  await shot(page, "cost.png", async (p) => {
    await p.goto(BASE_URL, base);
    await sleep(600);
    await clickNav(p, "비용");
    await sleep(1200); // wait for charts to render
  });

  // ── 4. Command Palette (Ctrl+K) ────────────────────────────
  await shot(page, "palette.png", async (p) => {
    await p.goto(BASE_URL, base);
    await sleep(600);
    await p.keyboard.down("Control");
    await p.keyboard.press("k");
    await p.keyboard.up("Control");
    await sleep(600);
  });

  await browser.close();
  console.log("\nAll screenshots saved to docs/screenshots/");
})();

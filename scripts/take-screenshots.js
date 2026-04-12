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

// Replace sidebar project names with clean example names
async function mockProjects(page) {
  await page.evaluate(() => {
    const fakeProjects = [
      { name: "ai-session-manager", branch: "main", dirty: true },
      { name: "aws-terraform",      branch: "main", dirty: false },
      { name: "data-dashboard",     branch: "dev",  dirty: true },
    ];
    const items = Array.from(document.querySelectorAll(".project-item"));
    items.forEach((el, i) => {
      const fake = fakeProjects[i];
      if (!fake) { el.remove(); return; }
      el.querySelector(".project-name").textContent = fake.name;
      let gitSpan = el.querySelector(".project-git");
      if (fake.branch) {
        if (!gitSpan) {
          gitSpan = document.createElement("span");
          el.appendChild(gitSpan);
        }
        gitSpan.className = "project-git" + (fake.dirty ? " dirty" : "");
        gitSpan.textContent = fake.branch + (fake.dirty ? "*" : "");
      } else if (gitSpan) {
        gitSpan.remove();
      }
    });
  });
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
    await mockProjects(p);
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
    await mockProjects(p);
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
    await mockProjects(p);
    await sleep(1200);
  });

  // ── 4. Command Palette (Ctrl+K) ────────────────────────────
  await shot(page, "palette.png", async (p) => {
    await p.goto(BASE_URL, base);
    await sleep(600);
    await mockProjects(p);
    await p.keyboard.down("Control");
    await p.keyboard.press("k");
    await p.keyboard.up("Control");
    await sleep(600);
    // Mock palette items (populated from API state)
    await p.evaluate(() => {
      const fakeItems = [
        { type: "project", name: "ai-session-manager", path: "~/workspace/ai-session-manager", selected: true },
        { type: "project", name: "aws-terraform",      path: "~/workspace/aws-terraform",      selected: false },
        { type: "project", name: "data-dashboard",     path: "~/workspace/data-dashboard",     selected: false },
        { type: "history", name: "Fix deployment pipeline issue", path: "~/workspace/aws-terraform",      selected: false },
        { type: "history", name: "Add cost dashboard charts",     path: "~/workspace/ai-session-manager", selected: false },
      ];
      const ul = document.querySelector(".cmd-palette-inner ul");
      if (!ul) return;
      ul.innerHTML = fakeItems.map(item => `
        <li class="${item.selected ? 'selected' : ''}">
          <span class="cmd-type">${item.type}</span>
          <span>${item.name}</span>
          <span style="font-size:11px;color:var(--text-dim);margin-left:auto">${item.path}</span>
        </li>
      `).join('');
    });
    await sleep(200);
  });

  await browser.close();
  console.log("\nAll screenshots saved to docs/screenshots/");
})();

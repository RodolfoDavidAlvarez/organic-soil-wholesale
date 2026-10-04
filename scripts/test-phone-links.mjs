import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const repoRoot = path.resolve(import.meta.dirname, "..");
const clientRoot = path.join(repoRoot, "client");
const canonicalTel = /^tel:\+1\d{10}$/;
const retiredPhonePatterns = [
  /\(602\) 637-0032/,
  /602-637-0032/,
  /6026370032/,
  /\+16026370032/,
];

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const file = path.join(directory, name);
    if (statSync(file).isDirectory()) return sourceFiles(file);
    return /\.(?:ts|tsx|js|jsx|html)$/.test(name) ? [file] : [];
  });
}

const activeSourceFiles = [
  ...sourceFiles(path.join(clientRoot, "src")),
  ...sourceFiles(path.join(repoRoot, "server")),
  ...sourceFiles(path.join(repoRoot, "api")),
  ...sourceFiles(path.join(repoRoot, "shared")),
  path.join(clientRoot, "index.html"),
  path.join(clientRoot, "scripts/generate-seo-pages.mjs"),
];

for (const file of activeSourceFiles) {
  const source = readFileSync(file, "utf8");
  for (const retired of retiredPhonePatterns) {
    assert.doesNotMatch(source, retired, `${file}: retired support number must not appear in active source`);
  }
}

for (const file of sourceFiles(path.join(clientRoot, "src"))) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/href=["'](tel:[^"']+)["']/g)) {
    assert.match(match[1], canonicalTel, `${file}: noncanonical literal telephone href ${match[1]}`);
  }
  assert.doesNotMatch(source, /tel:\$\{[^}]*_TEL\}/, `${file}: telephone href prepends tel: to a TEL constant`);
}

assert.match(
  readFileSync(path.join(clientRoot, "src/config/contact.ts"), "utf8"),
  /CUSTOMER_SUPPORT_PHONE_DIAL = "\+16232633386"/,
  "official support source must remain canonical +16232633386",
);
assert.match(
  readFileSync(path.join(repoRoot, "server/config/contact.ts"), "utf8"),
  /CUSTOMER_SUPPORT_PHONE_DIGITS = "\+16232633386"/,
  "server support source must remain canonical +16232633386",
);

assert.ok(existsSync(path.join(clientRoot, "dist/index.html")), "run the production build before phone-link tests");
for (const file of sourceFiles(path.join(clientRoot, "dist"))) {
  const output = readFileSync(file, "utf8");
  for (const retired of retiredPhonePatterns) {
    assert.doesNotMatch(output, retired, `${file}: retired support number must not appear in generated output`);
  }
}

const port = 4197;
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(port)], {
  cwd: clientRoot,
  stdio: "ignore",
});

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("preview server did not start");
}

try {
  await waitForServer();
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (/googletagmanager|google-analytics|callrail/i.test(request.url())) request.abort();
    else request.continue();
  });

  const viewports = [
    { name: "mobile", width: 390, height: 844 },
    { name: "desktop", width: 1440, height: 900 },
  ];
  for (const viewport of viewports) {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    for (const route of ["/", "/products", "/free-worm-castings", "/survey", "/survey/garden-class", "/checkout", "/order"]) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle2" });
      const pageState = await page.evaluate(() => ({
        text: document.body.innerText,
        official: [...document.querySelectorAll('a[data-official-support-phone="true"]')].map((link) => ({
          href: link.getAttribute("href"),
          aria: link.getAttribute("aria-label"),
        })),
      }));
      assert.doesNotMatch(pageState.text, /\(602\) 637-0032/, `${viewport.name} ${route}: retired number rendered`);
      if (route === "/free-worm-castings") {
        assert.doesNotMatch(pageState.text, /Claim My Free Bag/, `${viewport.name} ${route}: expired campaign must not show claim CTA`);
        assert.match(pageState.text, /This offer is no longer available/, `${viewport.name} ${route}: expired campaign must name the ended offer`);
      }
      for (const link of pageState.official) {
        assert.deepEqual(link, {
          href: "tel:+16232633386",
          aria: "Call (623) 263-3386",
        }, `${viewport.name} ${route}: official link must use the canonical source without DNI`);
      }

      const invalid = await page.$$eval('a[href^="tel:"]', (links) => {
      const normalize = (value) => {
        let digits = (value || "").replace(/\D/g, "");
        if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
        return digits.length === 10 ? digits : null;
      };
      return links
        .map((link) => {
          const href = link.getAttribute("href");
          const text = link.textContent?.trim() || "";
          const aria = link.getAttribute("aria-label");
          const digits = normalize(href);
          const display = digits ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : null;
          const visibleDigits = normalize(text);
          return {
            href,
            text,
            aria,
            valid:
              /^tel:\+1\d{10}$/.test(href || "") &&
              aria === `Call ${display}` &&
              (!visibleDigits || visibleDigits === digits),
          };
        })
        .filter((link) => !link.valid);
    });
      assert.deepEqual(invalid, [], `${viewport.name} ${route}: every rendered telephone link must use canonical US E.164`);
    }
  }

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  for (const route of [
    "/?utm_source=direct-test",
    "/?utm_source=google&utm_medium=cpc&utm_campaign=phone-fixture&gclid=TEST-NO-AD-CLICK",
    "/about?utm_source=google&utm_medium=cpc",
  ]) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle2" });
    const mobileCta = await page.$eval('a[data-mobile-phone-cta="true"]', (link) => ({
      text: link.textContent?.replace(/\s+/g, " ").trim(),
      href: link.getAttribute("href"),
      aria: link.getAttribute("aria-label"),
      marker: link.getAttribute("data-phone-number"),
    }));
    assert.equal(mobileCta.href, "tel:+16232633386", `${route}: mobile CTA fallback href`);
    assert.equal(mobileCta.aria, "Call (623) 263-3386", `${route}: mobile CTA fallback aria`);
    assert.equal(mobileCta.marker, "+16232633386", `${route}: mobile CTA source marker`);
    assert.match(mobileCta.text || "", /Call.*\(623\) 263-3386/, `${route}: mobile CTA visible fallback`);
  }

  // Official-number links are intentionally locked against third-party rewrites.
  await page.evaluate(() => {
    const link = document.querySelector('a[data-mobile-phone-cta="true"]');
    if (!link) throw new Error("mobile CallRail fixture target not found");
    link.setAttribute("href", "tel:+(602) 313-3897");
    link.setAttribute("aria-label", "Call (623) 263-3386");
    link.querySelector("[data-official-support-phone-text]").textContent = "(602) 313-3897";
  });
  await page.waitForFunction(() => {
    const link = document.querySelector('a[data-mobile-phone-cta="true"]');
    return link?.getAttribute("href") === "tel:+16232633386" &&
      link?.getAttribute("aria-label") === "Call (623) 263-3386" &&
      link?.querySelector("[data-official-support-phone-text]")?.textContent === "(623) 263-3386";
  });

  await page.goto(baseUrl, { waitUntil: "networkidle2" });
  await page.evaluate(() => {
    const link = [...document.querySelectorAll('a[data-official-support-phone="true"]')].find((candidate) =>
      candidate.querySelector("[data-official-support-phone-text]"),
    );
    if (!link) throw new Error("CallRail fixture target not found");
    link.setAttribute("href", "tel:+(602) 313-3897");
    link.setAttribute("aria-label", "Call (623) 263-3386");
    link.querySelector("[data-official-support-phone-text]").textContent = "(602) 313-3897";
  });
  await page.waitForFunction(() => {
    const link = [...document.querySelectorAll('a[data-official-support-phone="true"]')].find((candidate) =>
      candidate.querySelector("[data-official-support-phone-text]"),
    );
    return (
      link?.getAttribute("href") === "tel:+16232633386" &&
      link?.getAttribute("aria-label") === "Call (623) 263-3386"
    );
  });

  const synchronized = await page.evaluate(() => {
    const link = [...document.querySelectorAll('a[data-official-support-phone="true"]')].find((candidate) =>
      candidate.querySelector("[data-official-support-phone-text]"),
    );
    return {
      text: link?.querySelector("[data-official-support-phone-text]")?.textContent,
      href: link?.getAttribute("href"),
      aria: link?.getAttribute("aria-label"),
    };
  });
  assert.deepEqual(synchronized, {
    text: "(623) 263-3386",
    href: "tel:+16232633386",
    aria: "Call (623) 263-3386",
  });

  await browser.close();
  console.log("phone links: canonical source/rendered hrefs and CallRail synchronization ok");
} finally {
  server.kill("SIGTERM");
}

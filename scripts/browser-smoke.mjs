// Browser smoke tests for the static dashboard, independent of live provider uptime.
// Run after: npm install --no-save playwright@1.57.0 && npx playwright install chromium
import Assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const Root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const Snapshot_Time = Math.floor(Date.now() / 1800000) * 1800 - 120;
const Countries = ["US", "IN", "PH", "MX", "DE", "BR", "GB", "ES", "FR", "IT", "IL", "CA", "CO",
  "AR", "AU", "NL", "SE", "NO", "NZ", "JP", "KR", "ZA", "EG", "NG", "TR", "ID"];
function Counts(Base) {
  return Object.fromEntries(Countries.map((Code, Index) => [Code, Base + Index]));
}
function Total(Values) { return Object.values(Values).reduce((Sum, Value) => Sum + Value, 0); }
function Snapshot(At, Base) {
  const Adult = Counts(Base);
  const Default = Counts(Math.floor(Base / 2));
  const Combined = Counts(Base * 2);
  return {t:At, n:Total(Adult), c:Adult,
    rooms:{Default:{n:Total(Default),c:Default}, Combined:{n:Total(Combined),c:Combined}}};
}
const Fixture_History = JSON.stringify({schema:1,source:"test fixture",snapshots:[
  Snapshot(Snapshot_Time - 27*3600, 33), Snapshot(Snapshot_Time - 23*3600, 35),
  Snapshot(Snapshot_Time - 18*3600, 42), Snapshot(Snapshot_Time - 6*3600, 48),
  Snapshot(Snapshot_Time - 3600, 52), Snapshot(Snapshot_Time, 54),
]});
const Mime = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",
  ".json":"application/json; charset=utf-8"};
let Network_Requests = 0;
const Server = createServer(async (Request, Response) => {
  try {
    const Url = new URL(Request.url, "http://localhost");
    const Path = decodeURIComponent(Url.pathname === "/" ? "/index.html" : Url.pathname);
    if (Path === "/data/history.json") {
      Response.writeHead(200, {"content-type":Mime[".json"], "cache-control":"no-store"});
      Response.end(Fixture_History);
      return;
    }
    if (Path === "/data/network.json") {
      Network_Requests++;
      Response.writeHead(503, {"content-type":"text/plain"});
      Response.end("Network data intentionally unavailable in fixture");
      return;
    }
    const File = resolve(Root, "." + Path);
    if (!File.startsWith(Root + sep)) { Response.writeHead(403); Response.end(); return; }
    const Data = await readFile(File);
    const Extension = File.slice(File.lastIndexOf("."));
    Response.writeHead(200, {"content-type":Mime[Extension] || "application/octet-stream"});
    Response.end(Data);
  } catch {
    Response.writeHead(404); Response.end("Not found");
  }
});
let Browser;
try {
  await new Promise((Resolve, Reject) => Server.listen(0, "127.0.0.1", Error => Error ? Reject(Error) : Resolve()));
  Browser = await chromium.launch({headless:true});
  const Page = await Browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const Errors = [];
  Page.on("pageerror", Error => Errors.push(String(Error)));
  // No production network or authenticated browser state is needed by this test.
  await Page.route(/^https:\/\/(rest|rest2|api)\.flingster\.com\//, Route => Route.abort());
  await Page.goto("http://127.0.0.1:" + Server.address().port, {waitUntil:"domcontentloaded"});
  await Page.waitForFunction(() =>
    document.getElementById("World_Coverage")?.textContent?.includes("%") &&
    document.querySelector("#Country_Table tr[data-country-code]"), null, {timeout:20000});
  Assert.equal(Network_Requests, 0, "network history must not load on landing");
  Assert.equal(await Page.locator("#World_Chart path.World_Line").count() >= 2, true,
    "timeline segments must break over missing history");
  Assert.equal(await Page.locator("#World_Export").isEnabled(), true);
  await Page.getByRole("button", {name:"7 days"}).click();
  Assert.equal(await Page.locator('.World_Ranges button[data-window="7d"]').getAttribute("aria-pressed"), "true");
  const Last_Reading = await Page.locator("#World_Scrubber").inputValue();
  await Page.locator("#World_Scrubber").focus();
  await Page.keyboard.press("ArrowLeft");
  Assert.notEqual(await Page.locator("#World_Scrubber").inputValue(), Last_Reading);
  await Page.locator('.Pool_Tab[data-room="Default"]').click();
  await Page.waitForFunction(() => document.querySelector("#World_Series_Status")?.textContent?.includes("Default pool"));
  Assert.ok((await Page.locator("#World_Latest").textContent()).match(/\d/));
  await Page.locator("#Quick_Search").fill("United States");
  await Page.waitForFunction(() => document.querySelectorAll("#Country_Table tr[data-country-code]").length === 1);
  const More = Page.locator(".Quick_Nav_More");
  Assert.equal(await More.isVisible(), true);
  await More.locator("summary").click();
  Assert.equal(await More.locator(".Quick_Nav_More_Items a").count(), 3);
  await Page.locator("#Network_Explorer > summary").click();
  await Page.waitForFunction(() => document.querySelector("#Network_Preview")?.textContent?.includes("History unavailable"));
  Assert.equal(Network_Requests, 1, "expanded Network Explorer should fetch on demand");

  const Artifact_Dir = resolve(Root, process.env.SMOKE_ARTIFACT_DIR || "smoke-artifacts");
  await mkdir(Artifact_Dir, {recursive:true});
  for (const Width of [1440, 768, 390]) {
    await Page.setViewportSize({width:Width,height:900});
    await Page.evaluate(() => window.scrollTo(0,0));
    const Overflow = await Page.evaluate(() => ({
      viewport:innerWidth,document:document.documentElement.scrollWidth
    }));
    Assert.ok(Overflow.document <= Overflow.viewport + 1,
      Width + "px: page-wide horizontal overflow " + JSON.stringify(Overflow));
    await Page.screenshot({path:resolve(Artifact_Dir, "dashboard-" + Width + ".png"), fullPage:false});
  }
  Assert.deepEqual(Errors, [], "unexpected JavaScript exceptions: " + Errors.join("; "));
  console.log("Browser smoke passed: data fallback, gap-aware chart, keyboard, pools, search, lazy network and 1440/768/390px layouts.");
} finally {
  if (Browser) await Browser.close();
  await new Promise(Resolve => Server.close(Resolve));
}

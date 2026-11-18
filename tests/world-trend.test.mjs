import Test from "node:test";
import Assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  WORLD_WINDOWS, Read_World_Total, Select_World_Readings,
  Merge_Live_World_Reading, Summarize_World_Readings,
  Create_World_Chart_Geometry, World_Readings_Csv
} from "../assets/world-trend-utils.mjs";

const Now = 1_800_000_000;
const Snapshot = (At, Adult = 10, Default = 4, Combined = 12) => ({
  t: At, n: Adult, c: { US: Adult },
  rooms: {
    Default: { n: Default, c: { US: Default } },
    Combined: { n: Combined, c: { US: Combined } }
  }
});

Test("timeline keeps technical pools separate and rejects invalid/future data", () => {
  const Samples = [Snapshot(Now - 3600, 70, 20, 88), Snapshot(Now - 1800, 90, 25, 111),
    Snapshot(Now + 40, 999), Snapshot(Now - WORLD_WINDOWS["24h"] - 1, 300)];
  Assert.deepEqual(Select_World_Readings(Samples, "Adult", "24h", Now).map(x => x.n), [70, 90]);
  Assert.deepEqual(Select_World_Readings(Samples, "Default", "24h", Now).map(x => x.n), [20, 25]);
  Assert.deepEqual(Select_World_Readings(Samples, "Combined", "24h", Now).map(x => x.n), [88, 111]);
  Assert.deepEqual(Select_World_Readings(Samples, "Unknown", "24h", Now), []);
  Assert.equal(Read_World_Total({n: 10}, "Default"), null);
  Assert.equal(Read_World_Total({n: -5}, "Adult"), null);
});

Test("out-of-order duplicate timestamps do not double count a snapshot", () => {
  const Samples = [Snapshot(Now - 900, 90), Snapshot(Now - 3600, 30), Snapshot(Now - 900, 100)];
  const Series = Select_World_Readings(Samples, "Adult", "24h", Now);
  Assert.deepEqual(Series.map(Point => [Point.t, Point.n]), [[Now - 3600, 30], [Now - 900, 100]]);
  Assert.deepEqual(Series.map(Point => Point.kind), ["saved", "saved"]);
});

Test("a current live reading remains separately labeled, and cannot cross pool boundaries", () => {
  const Series = Select_World_Readings([Snapshot(Now - 900, 15)], "Adult", "24h", Now);
  const Current = {Room: "Adult", Online_Total: 25, Observed_At: Now, Observation_Mode: "live"};
  const Merged = Merge_Live_World_Reading(Series, Current, "Adult", "24h", Now);
  Assert.deepEqual(Merged.map(Point => Point.n), [15, 25]);
  Assert.deepEqual(Merged.map(Point => Point.kind), ["saved", "live"]);
  Assert.deepEqual(Merge_Live_World_Reading(Series, Current, "Default", "24h", Now), Series);
  Assert.deepEqual(Merge_Live_World_Reading(Series, {...Current, Observation_Mode:"saved"}, "Adult", "24h", Now), Series);
});

Test("time gap is actually disconnected rather than visually interpolated", () => {
  const Series = Select_World_Readings([Snapshot(Now - 600, 40),Snapshot(Now - 3600, 20),
    Snapshot(Now - 10800, 10)], "Adult", "24h", Now);
  const Summary = Summarize_World_Readings(Series, "24h", Now);
  Assert.equal(Summary.gaps, 1);
  Assert.equal(Summary.difference, 30);
  Assert.ok(Summary.coverage < 10);
  const Graph = Create_World_Chart_Geometry(Series, "24h", Now);
  Assert.equal(Graph.paths.length, 2);
  Assert.equal(Graph.gaps.length, 1);
  Assert.ok(Graph.gaps[0].width > 0);
  Assert.ok(Graph.points.every(Point => Number.isFinite(Point.x) && Number.isFinite(Point.y)));
});

Test("coverage counts observed half-hour slots, not duplicate samples or fake missing observations", () => {
  const Series = Select_World_Readings([Snapshot(Now - 60, 10), Snapshot(Now - 65, 20),
    Snapshot(Now - 1800, 25)], "Adult", "24h", Now);
  const Summary = Summarize_World_Readings(Series, "24h", Now);
  Assert.equal(Summary.expected, 48);
  Assert.ok(Summary.sampledSlots <= Summary.observed);
  Assert.equal(Summary.first.n, 25);
  Assert.equal(Summary.latest.n, 10);
  Assert.equal(Summary.percent, -60);
  Assert.equal(Summarize_World_Readings([], "24h", Now).difference, null);
  Assert.equal(Summarize_World_Readings([{t: Now, n: 5}], "24h", Now).difference, null);
});

Test("timeline export contains exact timestamps, pool identity and saved/live provenance", () => {
  const Text = World_Readings_Csv([
    {t: Now - 1800, n: 12, kind:"saved"}, {t: Now, n: 14, kind:"live"}
  ], "Adult");
  Assert.match(Text, /"Observation UTC","Reported online","Pool","Source"/);
  Assert.match(Text, /"Adult","saved"/);
  Assert.match(Text, /"Adult","live"/);
  Assert.ok(Text.includes(new Date(Now * 1000).toISOString()));
});

Test("dashboard keeps the global panel wired, allows manual recovery and defers network history", async () => {
  const [Html, Insights, Network, Ux, Styles] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../assets/insights.mjs", import.meta.url), "utf8"),
    readFile(new URL("../assets/network-explorer.mjs", import.meta.url), "utf8"),
    readFile(new URL("../assets/ux.mjs", import.meta.url), "utf8"),
    readFile(new URL("../assets/ux.css", import.meta.url), "utf8")
  ]);
  Assert.match(Html, /assets\/world-trend\.mjs/);
  Assert.match(Html, /assets\/world-trend\.css/);
  Assert.match(Insights, /countrypulse:reload-history/);
  Assert.match(Insights, /countrypulse:history-failed/);
  Assert.match(Insights, /fetch\(Historical_Url, \{ cache: "no-cache" \}\)/);
  Assert.match(Network, /if \(Explorer\.open\) Load_Network_Data\(\)/);
  Assert.doesNotMatch(Network, /\n  Load_Network_Data\(\);\n  setInterval/);
  Assert.match(Ux, /\["world","Overview"\]/);
  Assert.match(Ux, /Quick_Nav_More/);
  Assert.match(Styles, /#countries th:nth-child\(7\)/);
});

import Test from "node:test";
import Assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  Find_Thirty_Minute_Baseline,
  Calculate_Thirty_Minute_Changes,
  Get_Representative_Country_Time,
  Compute_Collection_Health,
} from "../assets/country-table-metrics.mjs";

function History_Reading(Time, Adult, Default = null, Combined = null) {
  const Adult_Total = Object.values(Adult).reduce((Sum, Value) => Sum + Value, 0);
  const Entry = { t: Time, n: Adult_Total, c: Adult };
  if (Default && Combined) {
    Entry.rooms = {
      Default: { n: Object.values(Default).reduce((Sum, Value) => Sum + Value, 0), c: Default },
      Combined: { n: Object.values(Combined).reduce((Sum, Value) => Sum + Value, 0), c: Combined },
    };
  }
  return Entry;
}

Test("30-minute comparisons use an actual within-window historical reading", () => {
  const Observed_At = 1800001800;
  const Earlier = History_Reading(Observed_At - 1800, { US: 100, IL: 50 });
  const Rows = [{ Code: "US", Count: 140 }, { Code: "IL", Count: 40 }];
  const Output = Calculate_Thirty_Minute_Changes(Rows, [Earlier], "Adult", Observed_At);
  Assert.equal(Output.Elapsed_Minutes, 30);
  Assert.equal(Output.Changes.get("US").Difference, 40);
  Assert.equal(Output.Changes.get("US").Percent, 40);
  Assert.equal(Output.Changes.get("IL").Difference, -10);
  Assert.equal(Output.Changes.get("IL").Percent, -20);
});

Test("sparse or too recent readings never masquerade as half-hour changes", () => {
  const At = 1800001800;
  const Too_Old = History_Reading(At - 2 * 3600, { US: 100, IL: 50 });
  const Too_New = History_Reading(At - 5 * 60, { US: 100, IL: 50 });
  const Rows = [{ Code: "US", Count: 140 }];
  const Output = Calculate_Thirty_Minute_Changes(Rows, [Too_Old, Too_New], "Adult", At);
  Assert.equal(Output.Baseline, null);
  Assert.equal(Output.Changes.size, 0);
  Assert.equal(Find_Thirty_Minute_Baseline([Too_Old, Too_New], "Adult", At), null);
});

Test("selects closest of eligible half-hour readings and keeps pools isolated", () => {
  const At = 1800001800;
  const First = History_Reading(At - 2400, { US: 100, IL: 50 },
    { US: 200, IL: 75 }, { US: 320, IL: 125 });
  const Second = History_Reading(At - 1740, { US: 110, IL: 60 },
    { US: 220, IL: 90 }, { US: 350, IL: 150 });
  const Rows = [{ Code: "US", Count: 180 }];
  const Adult = Calculate_Thirty_Minute_Changes(Rows, [First, Second], "Adult", At);
  const Default = Calculate_Thirty_Minute_Changes(Rows, [First, Second], "Default", At);
  Assert.equal(Adult.Baseline.t, Second.t);
  Assert.equal(Adult.Changes.get("US").Difference, 70);
  Assert.equal(Default.Changes.get("US").Difference, -40);
  Assert.equal(Default.Baseline.t, Second.t);
  Assert.equal(Calculate_Thirty_Minute_Changes(Rows, [First, Second], "Fake", At).Baseline, null);
});

Test("missing country and zero baseline do not manufacture percent changes", () => {
  const At = 1800001800;
  const Base = History_Reading(At - 1800, { US: 0, IL: 15 });
  const Output = Calculate_Thirty_Minute_Changes(
    [{ Code: "US", Count: 21 }, { Code: "BR", Count: 40 }], [Base], "Adult", At);
  Assert.equal(Output.Changes.get("US").Difference, 21);
  Assert.equal(Output.Changes.get("US").Percent, null);
  Assert.equal(Output.Changes.has("BR"), false);
});

Test("country clocks use representative IANA time zones and local DST rules", () => {
  const Now_Ms = Date.parse("2026-10-22T15:00:00Z");
  const Us = Get_Representative_Country_Time("US", Now_Ms);
  const Israel = Get_Representative_Country_Time("IL", Now_Ms);
  Assert.equal(Us.City, "New York");
  Assert.equal(Israel.City, "Jerusalem");
  Assert.ok(Us.Time !== Israel.Time);
  Assert.equal(Us.Zone, "America/New_York");
  Assert.equal(Get_Representative_Country_Time("!!", Now_Ms), null);
});

Test("collection health accurately labels delayed and missing snapshots", () => {
  const Now = 1800003600;
  Assert.equal(Compute_Collection_Health([], Now).Status, "unknown");
  const Fresh = Compute_Collection_Health([{ t: Now - 10 * 60 }], Now);
  Assert.equal(Fresh.Status, "recent");
  Assert.equal(Fresh.Age_Minutes, 10);
  const Delayed = Compute_Collection_Health([{ t: Now - 50 * 60 }], Now);
  Assert.equal(Delayed.Status, "delayed");
  const Late = Compute_Collection_Health([
    { t: Now - 190 * 60 }, { t: Now - 90 * 60 },
  ], Now);
  Assert.equal(Late.Status, "late");
  Assert.equal(Late.Gap_Minutes, 100);
});

Test("table, CSV export and launchd dispatch remain wired without secrets", async () => {
  const Html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const Css = await readFile(new URL("../assets/country-table.css", import.meta.url), "utf8");
  const Script = await readFile(new URL("../ops/countrypulse-dispatch.sh", import.meta.url), "utf8");
  const Plist = await readFile(new URL("../ops/com.royagiv.countrypulse.dispatch.plist", import.meta.url), "utf8");
  Assert.match(Html, /id="Table_Comparison_Head"/);
  Assert.match(Html, /Local time/);
  Assert.match(Html, /Table_Change_Pct/);
  Assert.match(Html, /Change percent \(~30m\)/);
  Assert.match(Html, /colspan="7"/);
  Assert.match(Html, /Collection_Health/);
  Assert.match(Css, /\.Table_Local_Time/);
  Assert.match(Script, /gh workflow run collect-and-deploy\.yml/);
  Assert.match(Plist, /<integer>27<\/integer>/);
  Assert.match(Plist, /<integer>57<\/integer>/);
  Assert.doesNotMatch(Script, /gh auth token|GITHUB_TOKEN|ghp_/);
});

import Test from "node:test";
import Assert from "node:assert/strict";
import {
  Get_Pool_Reading,
  Get_Pool_Snapshots,
  Find_Comparison_Snapshot,
  Calculate_Country_Movers,
  Analyze_Count_Quality,
  Calculate_Member_Growth,
  Calculate_Weekend_Average,
} from "../assets/trends-utils.mjs";
import { Parse_Online_Response, Fetch_Online_Response } from "../scripts/collect.mjs";

const T_0 = 1000000;
function Sample(Time, Adult, Default = null, Combined = null, Members = null) {
  const Entry = { t: Time, n: Adult.US + Adult.IL, c: Adult };
  if (Default && Combined) Entry.rooms = {
    Default: { n: Default.US + Default.IL, c: Default },
    Combined: { n: Combined.US + Combined.IL, c: Combined },
  };
  if (Members) Entry.members = Members;
  return Entry;
}
const Old_Snapshot = Sample(T_0 - 1800, { US: 100, IL: 80 }, { US: 200, IL: 70 }, { US: 310, IL: 151 }, 5000);
const New_Snapshot = Sample(T_0, { US: 140, IL: 60 }, { US: 170, IL: 80 }, { US: 335, IL: 135 }, 5100);

Test("preserves older Adult-only history and excludes unavailable pool data", () => {
  const Legacy = Sample(T_0 - 3600, { US: 100, IL: 70 });
  Assert.equal(Get_Pool_Reading(Legacy, "Adult").n, 170);
  Assert.equal(Get_Pool_Reading(Legacy, "Default"), null);
  Assert.equal(Get_Pool_Snapshots([Legacy, Old_Snapshot], "Default").length, 1);
  Assert.equal(Get_Pool_Snapshots([Legacy, Old_Snapshot], "Combined")[0].n, 461);
});

Test("compares activity within the same pool using real historical baseline", () => {
  const Now_Seconds = T_0;
  const Live_Rows = [{ Code: "US", Count: 140, Name: "United States" }, { Code: "IL", Count: 60, Name: "Israel" }];
  const History = [Old_Snapshot];
  const Result = Calculate_Country_Movers(Live_Rows, History, "Adult", Now_Seconds, "recent");
  Assert.equal(Result.Baseline.t, T_0 - 1800);
  Assert.equal(Result.Rises[0].Difference, 40);
  Assert.equal(Result.Rises[0].Percent, 40);
  Assert.equal(Result.Falls[0].Difference, -20);
  Assert.equal(Result.Falls[0].Percent, -25);
  const Default_Rows = [{ Code: "US", Count: 170 }, { Code: "IL", Count: 80 }];
  Assert.equal(Calculate_Country_Movers(Default_Rows, History, "Default", Now_Seconds).Falls[0].Difference, -30);
  Assert.equal(Calculate_Country_Movers(Default_Rows, History, "Combined", Now_Seconds).Rises.length, 0);
});

Test("no baseline in an uncollected pool, and no fake 24h comparison", () => {
  const Legacy = Sample(T_0 - 1800, { US: 40, IL: 20 });
  Assert.equal(Find_Comparison_Snapshot([Legacy], "Default", T_0), null);
  Assert.equal(Find_Comparison_Snapshot([Old_Snapshot], "Adult", T_0, "24h"), null);
  Assert.equal(Calculate_Country_Movers([{ Code: "US", Count: 80 }], [Legacy], "Default", T_0).Baseline, null);
});

Test("small countries are excluded from exaggerated percent-mover claims", () => {
  const History = [Sample(T_0 - 1800, { US: 21, IL: 100 })];
  const Rows = [{ Code: "US", Count: 84 }, { Code: "IL", Count: 120 }];
  const Result = Calculate_Country_Movers(Rows, History, "Adult", T_0);
  Assert.equal(Result.Changes.has("US"), false);
  Assert.equal(Result.Changes.get("IL").Difference, 20);
});

Test("detects adult multiple-seven and default multiple-twelve patterns", () => {
  const Seven = Array.from({ length: 30 }, (_, Index) => (Index % 13 + 1) * 7);
  const Twelve = Array.from({ length: 30 }, (_, Index) => (Index % 8 + 1) * 12);
  const Adult = Analyze_Count_Quality(Seven);
  const Default = Analyze_Count_Quality(Twelve);
  Assert.equal(Adult.Pattern, true);
  Assert.equal(Adult.Factor, 7);
  Assert.equal(Default.Pattern, true);
  Assert.equal(Default.Factor, 12);
  Assert.equal(Analyze_Count_Quality([13, 29, 31, 33]).Pattern, false);
});

Test("flags exactly identical long-spaced samples", () => {
  const Identical = Sample(T_0 + 1800, { US: 100, IL: 80 });
  Assert.equal(Analyze_Count_Quality(Identical.c, [Old_Snapshot, Identical]).Stale, true);
  const Moving = Sample(T_0 + 1800, { US: 101, IL: 80 });
  Assert.equal(Analyze_Count_Quality(Moving.c, [Old_Snapshot, Moving]).Stale, false);
});

Test("records reported member growth only with a 24h reference", () => {
  const Yesterday = Sample(T_0 - 86400, { US: 80, IL: 50 }, null, null, 5000);
  Assert.equal(Calculate_Member_Growth([Yesterday], 5050, T_0), 50);
  Assert.equal(Calculate_Member_Growth([Old_Snapshot], 5050, T_0), null);
});

Test("optional weekday/weekend requires multiple days from both groups", () => {
  const Base = Date.UTC(2026, 9, 19) / 1000;
  const Week = Array.from({ length: 13 }, (_, Index) =>
    Sample(Base + Index * 86400, { US: 100 + Index, IL: 50 + Index }));
  const Result = Calculate_Weekend_Average(Week, "IL");
  Assert.ok(Result && Result.Weekend > Result.Weekday);
  Assert.equal(Calculate_Weekend_Average(Week.slice(0, 3), "IL"), null);
});

Test("parser includes membership/tags but no config or user secrets", () => {
  const Countries = Object.fromEntries(Array.from({ length: 26 }, (_, Index) =>
    [String.fromCharCode(65, 65 + Index), Index + 1]));
  const Payload = { ALL: 351, ...Countries, Members: 33579065, Tags: ["flirt", "roleplay", "flirt"] };
  const Text = '<script>window.parent.postMessage({"xhrl":"online","xhrd":' +
    JSON.stringify(Payload) + ',"xhrh":{}},"*")</script>';
  const Parsed = Parse_Online_Response(Text, T_0);
  Assert.equal(Parsed.members, 33579065);
  Assert.deepEqual(Parsed.tags, ["flirt", "roleplay"]);
});

Test("room parameter is bounded to known options and Combined passes comma expression", async () => {
  let Requested_Url = "";
  const Countries = Object.fromEntries(Array.from({ length: 26 }, (_, Index) =>
    [String.fromCharCode(65, 65 + Index), Index + 1]));
  const Text = '<script>{"xhrl":"online","xhrd":' +
    JSON.stringify({ ALL: 351, ...Countries }) + ',"xhrh":{}}</script>';
  const Fake_Fetch = async (Url) => {
    Requested_Url = Url;
    return { ok: true, text: async () => Text };
  };
  await Fetch_Online_Response(Fake_Fetch, "Combined");
  Assert.equal(new URL(Requested_Url).searchParams.get("room"), "Adult,Default");
  await Assert.rejects(Fetch_Online_Response(Fake_Fetch, "Fake"), /Unsupported/);
});

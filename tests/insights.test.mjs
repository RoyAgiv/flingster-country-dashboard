import Test from "node:test";
import Assert from "node:assert/strict";
import { Aggregate_Hourly, Compare_Day_Over_Day, Calculate_Observed_Peak } from "../assets/insights-utils.mjs";

function Snapshot(ISOString, Country_Count) {
  return { t: Math.floor(new Date(ISOString).getTime() / 1000), n: Country_Count + 10, c: { IL: Country_Count, US: 10 } };
}

Test("derives hourly averages from actual country samples", () => {
  const Samples = [
    Snapshot("2026-10-20T10:00:00Z", 100),
    Snapshot("2026-10-20T10:30:00Z", 200),
    Snapshot("2026-10-21T10:00:00Z", 300),
    Snapshot("2026-10-21T10:30:00Z", 400),
    Snapshot("2026-10-21T14:00:00Z", 900),
  ];
  const Result = Aggregate_Hourly(Samples, "IL", "UTC", 7, Samples.at(-1).t + 1);
  Assert.equal(Result.Hourly[10].Average, 250);
  Assert.equal(Result.Hourly[10].Sample_Count, 4);
  Assert.equal(Result.Hourly[10].Distinct_Days, 2);
  Assert.equal(Result.Peak_Hours[0].Hour, 10);
  Assert.equal(Result.Average_Count, 380);
  Assert.equal(Result.Maximum_Count, 900);
  Assert.equal(Result.Reliable_Enough, false);
});

Test("uses requested timezone when grouping by local hour", () => {
  const Samples = [Snapshot("2026-10-21T00:30:00Z", 111)];
  const Now_Seconds = Samples[0].t + 1;
  Assert.equal(Aggregate_Hourly(Samples, "IL", "UTC", 1, Now_Seconds).Hourly[0].Average, 111);
  Assert.equal(Aggregate_Hourly(Samples, "IL", "Asia/Jerusalem", 1, Now_Seconds).Hourly[3].Average, 111);
});

Test("ignores countries missing from older responses instead of inventing zeroes", () => {
  const First = { t: 100000, n: 3, c: { US: 3 } };
  const Second = { t: 101800, n: 7, c: { IL: 7 } };
  const Result = Aggregate_Hourly([First, Second], "IL", "UTC", 7, 102000);
  Assert.equal(Result.Sample_Count, 1);
  Assert.equal(Result.Average_Count, 7);
});

Test("filters samples to the selected period", () => {
  const Old = Snapshot("2026-10-01T10:00:00Z", 900);
  const New = Snapshot("2026-10-21T10:00:00Z", 100);
  const Result = Aggregate_Hourly([Old, New], "IL", "UTC", 7, New.t + 1);
  Assert.equal(Result.Sample_Count, 1);
  Assert.equal(Result.Average_Count, 100);
});

Test("day over day compares similar clock times rather than adjacent samples", () => {
  const Samples = [Snapshot("2026-10-20T12:00:00Z", 100), Snapshot("2026-10-21T12:00:00Z", 125)];
  Assert.equal(Compare_Day_Over_Day(Samples, "IL"), 25);
  Assert.equal(Compare_Day_Over_Day([Samples[1]], "IL"), null);
});

Test("invalid hourly data remains an unavailable rather than a fake trend", () => {
  const Result = Aggregate_Hourly([], "IL", "UTC", 7, 120000);
  Assert.equal(Result.Peak_Hours.length, 0);
  Assert.equal(Result.Average_Count, null);
  Assert.equal(Result.Hourly.every((Hour) => Hour.Average === null), true);
});


Test("current live value cannot exceed the displayed highest observed", () => {
  Assert.equal(Calculate_Observed_Peak(11901, 11336), 11901);
  Assert.equal(Calculate_Observed_Peak(10000, 11336), 11336);
  Assert.equal(Calculate_Observed_Peak(11901, null), 11901);
  Assert.equal(Calculate_Observed_Peak(undefined, undefined), null);
});

import { Get_Pool_Reading } from "./trends-utils.mjs";

export const Supported_Pools = ["Adult", "Default", "Combined"];

export function Select_Latest_Saved_Reading(Historical_Snapshots, Pool_Name) {
  if (!Supported_Pools.includes(Pool_Name) || !Array.isArray(Historical_Snapshots)) return null;
  const Ordered = [...Historical_Snapshots].sort((First, Second) => Second.t - First.t);
  for (const Snapshot of Ordered) {
    const Reading = Get_Pool_Reading(Snapshot, Pool_Name);
    if (!Reading || !Number.isSafeInteger(Reading.t) || Reading.t <= 0 ||
        !Number.isSafeInteger(Reading.n) || Reading.n <= 0) continue;
    const Countries = Object.entries(Reading.c)
      .filter(([Code, Count]) => /^[A-Z]{2}$/.test(Code) && Number.isSafeInteger(Count) && Count >= 0);
    if (Countries.length < 20 || Countries.reduce((Sum, [, Count]) => Sum + Count, 0) !== Reading.n) continue;
    const Payload = { ALL: Reading.n, ...Object.fromEntries(Countries) };
    if (Number.isSafeInteger(Snapshot.members) && Snapshot.members > 1000) Payload.Members = Snapshot.members;
    if (Array.isArray(Snapshot.tags)) Payload.Tags = Snapshot.tags;
    return { Pool_Name, Payload, Timestamp: Reading.t };
  }
  return null;
}

export function Age_Label(Timestamp_Seconds, Now_Seconds = Math.floor(Date.now() / 1000)) {
  if (!Number.isFinite(Timestamp_Seconds) || Timestamp_Seconds <= 0) return "unknown age";
  const Minutes = Math.max(0, Math.floor((Now_Seconds - Timestamp_Seconds) / 60));
  if (Minutes < 1) return "just now";
  if (Minutes < 60) return Minutes + "m ago";
  const Hours = Math.floor(Minutes / 60);
  if (Hours < 48) return Hours + "h ago";
  return Math.floor(Hours / 24) + "d ago";
}

export function Retry_Delay_Seconds(Attempt_Number) {
  return Math.min(120, 15 * (2 ** Math.max(0, Math.min(4, Attempt_Number - 1))));
}

export function Determine_Chart_State(Country_Count, Fetch_State = "loading") {
  if (Country_Count > 0) return "ready";
  return Fetch_State === "error" ? "error" : Fetch_State === "loading" ? "loading" : "empty";
}

export function Compare_Countries(Country_Rows, Historical_Snapshots, Room, Observed_At, Window = "recent", Country_Codes = []) {
  if (!Supported_Pools.includes(Room) || !Number.isFinite(Observed_At)) return [];
  const Intervals = { recent: 1800, "1h": 3600, "24h": 86400, "7d": 604800 };
  const Tolerances = { recent: 2400, "1h": 2700, "24h": 5400, "7d": 14400 };
  const Seconds = Intervals[Window] ?? 1800;
  const Target = Observed_At - Seconds;
  const Before = (Array.isArray(Historical_Snapshots) ? Historical_Snapshots : [])
    .map((Snapshot) => Get_Pool_Reading(Snapshot, Room))
    .filter((Snapshot) => Snapshot && Snapshot.t < Observed_At - 600)
    .sort((First, Second) => Math.abs(First.t - Target) - Math.abs(Second.t - Target))[0];
  const Baseline = Before && Math.abs(Before.t - Target) <= Tolerances[Window] ? Before : null;
  const Total = Country_Rows.reduce((Sum, Row) => Sum + Row.Count, 0);
  return Country_Codes.slice(0, 4).map((Code) => {
    const Current = Country_Rows.find((Row) => Row.Code === Code);
    if (!Current) return null;
    const Earlier = Baseline?.c?.[Code];
    const Change = Number.isSafeInteger(Earlier) && Earlier > 0 ? Current.Count - Earlier : null;
    return {
      ...Current,
      World_Share: Total > 0 ? Current.Count / Total * 100 : null,
      Change, Change_Percent: Change !== null ? Change / Earlier * 100 : null,
      Compared_At: Change !== null ? Baseline.t : null,
    };
  }).filter(Boolean);
}

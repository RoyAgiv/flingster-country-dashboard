export const Pool_Names = ["Adult", "Default", "Combined"];
export const Comparison_Intervals = {
  recent: { Seconds: null, Tolerance: 18000, Label: "Last saved" },
  "1h": { Seconds: 3600, Tolerance: 2400, Label: "1 hour" },
  "24h": { Seconds: 86400, Tolerance: 5400, Label: "24 hours" },
  "7d": { Seconds: 604800, Tolerance: 14400, Label: "7 days" },
};

export function Get_Pool_Reading(Snapshot, Room = "Adult") {
  if (!Pool_Names.includes(Room) || !Snapshot || !Number.isSafeInteger(Snapshot.t)) return null;
  const Reading = Room === "Adult" ? Snapshot : Snapshot.rooms?.[Room];
  if (!Reading || !Number.isSafeInteger(Reading.n) || Reading.n <= 0 ||
      !Reading.c || typeof Reading.c !== "object" || Array.isArray(Reading.c)) return null;
  return { t: Snapshot.t, n: Reading.n, c: Reading.c };
}

export function Get_Pool_Snapshots(Historical_Snapshots, Room = "Adult") {
  if (!Array.isArray(Historical_Snapshots)) return [];
  return Historical_Snapshots
    .map((Snapshot) => Get_Pool_Reading(Snapshot, Room))
    .filter(Boolean)
    .sort((First, Second) => First.t - Second.t);
}

export function Find_Comparison_Snapshot(Historical_Snapshots, Room, Now_Seconds, Interval = "recent") {
  const Selection = Comparison_Intervals[Interval];
  if (!Selection || !Number.isSafeInteger(Now_Seconds)) return null;
  const Eligible = Get_Pool_Snapshots(Historical_Snapshots, Room)
    .filter((Snapshot) => Snapshot.t <= Now_Seconds - 300);
  if (!Eligible.length) return null;
  if (Interval === "recent") {
    const Latest = Eligible.at(-1);
    return Now_Seconds - Latest.t <= Selection.Tolerance ? Latest : null;
  }
  const Expected_Seconds = Now_Seconds - Selection.Seconds;
  const Best = Eligible.reduce((Closest, Snapshot) =>
    !Closest || Math.abs(Snapshot.t - Expected_Seconds) < Math.abs(Closest.t - Expected_Seconds)
      ? Snapshot : Closest, null);
  return Best && Math.abs(Best.t - Expected_Seconds) <= Selection.Tolerance ? Best : null;
}

export function Calculate_Country_Movers(Country_Rows, Historical_Snapshots, Room, Now_Seconds, Interval = "recent") {
  const Baseline = Find_Comparison_Snapshot(Historical_Snapshots, Room, Now_Seconds, Interval);
  if (!Baseline) return { Baseline: null, Rises: [], Falls: [], Changes: new Map() };
  const Changes = new Map();
  for (const Country_Row of Country_Rows) {
    if (!Country_Row || !Number.isInteger(Country_Row.Count) ||
      !Object.hasOwn(Baseline.c, Country_Row.Code)) continue;
    const Before = Baseline.c[Country_Row.Code];
    // Small countries are particularly prone to coarse factors and misleading percent swings.
    if (!Number.isInteger(Before) || Before < 25 || Country_Row.Count < 25) continue;
    const Difference = Country_Row.Count - Before;
    const Percent = Math.round((Difference / Before) * 1000) / 10;
    Changes.set(Country_Row.Code, { ...Country_Row, Before, Difference, Percent });
  }
  const Rises = [...Changes.values()].filter((Item) => Item.Difference > 0)
    .sort((First, Second) => Second.Difference - First.Difference || Second.Percent - First.Percent);
  const Falls = [...Changes.values()].filter((Item) => Item.Difference < 0)
    .sort((First, Second) => First.Difference - Second.Difference || First.Percent - Second.Percent);
  return { Baseline, Rises, Falls, Changes };
}

export function Analyze_Count_Quality(Country_Counts, Historical_Snapshots = [], Room = "Adult") {
  const Counts = Array.isArray(Country_Counts) ?
    Country_Counts.map((Row) => typeof Row === "number" ? Row : Row?.Count) :
    Object.values(Country_Counts || {});
  const Small = Counts.filter((Count) => Number.isSafeInteger(Count) && Count > 0 && Count < 100);
  const Low_Counts = Small.length;
  const Multiple_Seven = Small.filter((Count) => Count % 7 === 0).length;
  const Multiple_Twelve = Small.filter((Count) => Count % 12 === 0).length;
  const Seven_Ratio = Low_Counts ? Multiple_Seven / Low_Counts : 0;
  const Twelve_Ratio = Low_Counts ? Multiple_Twelve / Low_Counts : 0;
  const Pattern = Low_Counts >= 15 && Math.max(Seven_Ratio, Twelve_Ratio) >= 0.75;
  const Factor = Seven_Ratio >= Twelve_Ratio ? 7 : 12;
  const Past = Get_Pool_Snapshots(Historical_Snapshots, Room);
  const Two = Past.slice(-2);
  const Stale = Two.length === 2 &&
    Two[1].t - Two[0].t >= 20 * 60 &&
    JSON.stringify(Two[0].c) === JSON.stringify(Two[1].c);
  const Summary = Stale ? "Repeated snapshot" :
    Pattern ? "Patterned values" : "Site-reported estimates";
  return {
    Pattern,
    Factor: Pattern ? Factor : null,
    Low_Counts,
    Multiple_Seven,
    Multiple_Twelve,
    Seven_Ratio,
    Twelve_Ratio,
    Stale,
    Summary,
  };
}

export function Calculate_Member_Growth(Historical_Snapshots, Current_Members, Now_Seconds) {
  if (!Number.isSafeInteger(Current_Members) || Current_Members <= 0) return null;
  const History = Array.isArray(Historical_Snapshots) ? Historical_Snapshots : [];
  const Baseline = History.filter((Snapshot) => Number.isSafeInteger(Snapshot?.members) &&
    Snapshot.members > 0 && Number.isSafeInteger(Snapshot.t) &&
    Math.abs((Now_Seconds - Snapshot.t) - 86400) <= 5400)
    .sort((First, Second) =>
      Math.abs((Now_Seconds - First.t) - 86400) -
      Math.abs((Now_Seconds - Second.t) - 86400))[0];
  return Baseline ? Current_Members - Baseline.members : null;
}

export function Calculate_Weekend_Average(Historical_Snapshots, Country_Code, Room = "Adult") {
  const Weekday = [], Weekend = [];
  const Weekday_Dates = new Set(), Weekend_Dates = new Set();
  for (const Snapshot of Get_Pool_Snapshots(Historical_Snapshots, Room)) {
    const Count = Snapshot.c[Country_Code];
    if (!Number.isSafeInteger(Count)) continue;
    const Date_Object = new Date(Snapshot.t * 1000);
    const Day = Date_Object.getUTCDay();
    const Date_Key = Date_Object.toISOString().slice(0, 10);
    if (Day === 0 || Day === 6) { Weekend.push(Count); Weekend_Dates.add(Date_Key); }
    else { Weekday.push(Count); Weekday_Dates.add(Date_Key); }
  }
  if (Weekday_Dates.size < 2 || Weekend_Dates.size < 2) return null;
  const Mean = (Array_Data) => Math.round(Array_Data.reduce((Sum, Value) => Sum + Value, 0) / Array_Data.length);
  return { Weekday: Mean(Weekday), Weekend: Mean(Weekend), Timezone: "UTC" };
}

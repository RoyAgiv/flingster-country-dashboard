// Pure, source-honest world activity history helpers.
// Counts are provider-reported pool totals, never verified distinct users.
export const WORLD_WINDOWS = Object.freeze({ "24h": 86400, "7d": 7 * 86400, "30d": 30 * 86400 });
export const TARGET_SAMPLE_SECONDS = 1800;
export const MAX_CONNECTED_GAP_SECONDS = 90 * 60;

export function Read_World_Total(Snapshot, Room) {
  if (!Snapshot || !["Adult", "Default", "Combined"].includes(Room)) return null;
  const Value = Room === "Adult" ? Snapshot.n : Snapshot.rooms?.[Room]?.n;
  return Number.isSafeInteger(Value) && Value >= 0 ? Value : null;
}

export function Select_World_Readings(Snapshots, Room, Range, Now_Seconds) {
  const Window_Seconds = WORLD_WINDOWS[Range];
  if (!Window_Seconds || !Number.isSafeInteger(Now_Seconds) || !Array.isArray(Snapshots)) return [];
  const Start = Now_Seconds - Window_Seconds;
  const Readings = new Map();
  for (const Snapshot of Snapshots) {
    if (!Number.isSafeInteger(Snapshot?.t) || Snapshot.t < Start || Snapshot.t > Now_Seconds) continue;
    const Total = Read_World_Total(Snapshot, Room);
    if (Total === null) continue;
    // Last valid instance of an identical observation time wins; do not sum replicas.
    Readings.set(Snapshot.t, { t: Snapshot.t, n: Total, kind: "saved" });
  }
  return [...Readings.values()].sort((A, B) => A.t - B.t);
}

export function Merge_Live_World_Reading(Readings, Current, Room, Range, Now_Seconds) {
  if (Current?.Observation_Mode !== "live" || Current.Room !== Room ||
      !Number.isSafeInteger(Current.Observed_At) || !Number.isSafeInteger(Current.Online_Total) ||
      Current.Online_Total < 0 || !WORLD_WINDOWS[Range] ||
      Current.Observed_At < Now_Seconds - WORLD_WINDOWS[Range] || Current.Observed_At > Now_Seconds) return Readings;
  // The live point is explicitly distinguished from saved historical observations.
  return [...Readings.filter(Point => Point.t !== Current.Observed_At),
    { t: Current.Observed_At, n: Current.Online_Total, kind: "live" }]
    .sort((A, B) => A.t - B.t);
}

export function Summarize_World_Readings(Readings, Range, Now_Seconds) {
  const Window_Seconds = WORLD_WINDOWS[Range] || WORLD_WINDOWS["24h"];
  const Start = Now_Seconds - Window_Seconds;
  const Expected = Math.ceil(Window_Seconds / TARGET_SAMPLE_SECONDS);
  const Slots = new Set(Readings.filter(Point => Point.t >= Start && Point.t <= Now_Seconds)
    .map(Point => Math.min(Expected - 1, Math.floor((Point.t - Start) / TARGET_SAMPLE_SECONDS))));
  const First = Readings[0] || null;
  const Latest = Readings.at(-1) || null;
  const Difference = First && Latest && First !== Latest ? Latest.n - First.n : null;
  let Gaps = 0;
  for (let Index = 1; Index < Readings.length; Index++) {
    if (Readings[Index].t - Readings[Index - 1].t > MAX_CONNECTED_GAP_SECONDS) Gaps++;
  }
  return {
    first: First, latest: Latest, difference: Difference,
    percent: Difference !== null && First.n > 0 ? 100 * Difference / First.n : null,
    observed: Readings.length, expected: Expected, sampledSlots: Slots.size,
    coverage: Math.round(100 * Slots.size / Expected),
    gaps: Gaps,
    lastAgeSeconds: Latest ? Math.max(0, Now_Seconds - Latest.t) : null,
  };
}

export function Create_World_Chart_Geometry(Readings, Range, Now_Seconds) {
  const Start = Now_Seconds - (WORLD_WINDOWS[Range] || WORLD_WINDOWS["24h"]);
  const Left = 64, Right = 972, Top = 18, Bottom = 210;
  const Values = Readings.map(Point => Point.n);
  const Minimum = Values.length ? Math.min(...Values) : 0;
  const Maximum = Values.length ? Math.max(...Values) : 1;
  const Midpoint = (Minimum + Maximum) / 2;
  const Spread = Math.max(1, Maximum - Minimum);
  const Floor = Math.max(0, Midpoint - Spread * .60);
  const Ceiling = Math.max(Floor + 1, Midpoint + Spread * .60);
  const To_X = Time => Left + Math.max(0, Math.min(1, (Time - Start) /
    ((WORLD_WINDOWS[Range] || WORLD_WINDOWS["24h"])))) * (Right - Left);
  const To_Y = Count => Bottom - (Count - Floor) / (Ceiling - Floor) * (Bottom - Top);
  const Points = Readings.map(Point => ({ ...Point, x: To_X(Point.t), y: To_Y(Point.n) }));
  const Segments = [];
  let Segment = [];
  let Gap_Regions = [];
  Points.forEach((Point, Index) => {
    if (Index && Point.t - Points[Index - 1].t > MAX_CONNECTED_GAP_SECONDS) {
      if (Segment.length) Segments.push(Segment);
      Segment = [];
      Gap_Regions.push({ x: Points[Index - 1].x, width: Math.max(0, Point.x - Points[Index - 1].x) });
    }
    Segment.push(Point);
  });
  if (Segment.length) Segments.push(Segment);
  return { points: Points, paths: Segments.map(Segment =>
    Segment.map((Point, Index) => (Index ? "L" : "M") + Point.x.toFixed(2) + " " + Point.y.toFixed(2)).join(" ")),
    gaps: Gap_Regions, left: Left, right: Right, top: Top, bottom: Bottom,
    floor: Floor, ceiling: Ceiling, toX: To_X };
}

export function World_Readings_Csv(Readings, Room) {
  const Rows = [["Observation UTC", "Reported online", "Pool", "Source"]];
  for (const Point of Readings) {
    Rows.push([new Date(Point.t * 1000).toISOString(), Point.n, Room, Point.kind]);
  }
  return Rows.map(Row => Row.map(Item => '"' + String(Item).replaceAll('"', '""') + '"').join(",")).join("\r\n");
}

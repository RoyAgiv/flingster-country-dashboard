import { Get_Pool_Snapshots } from "./trends-utils.mjs";
import { Get_Country_Time_Zones, Format_Country_Clock } from "./country-timezones.mjs";

export const Target_Gap_Seconds = 30 * 60;
export const Minimum_Gap_Seconds = 18 * 60;
export const Maximum_Gap_Seconds = 42 * 60;

export function Find_Thirty_Minute_Baseline(Historical_Snapshots, Pool_Name, Observed_At_Seconds) {
  if (!Number.isSafeInteger(Observed_At_Seconds) || Observed_At_Seconds <= 0) return null;
  const Candidates = Get_Pool_Snapshots(Historical_Snapshots, Pool_Name)
    .filter((Snapshot) => {
      const Gap = Observed_At_Seconds - Snapshot.t;
      return Gap >= Minimum_Gap_Seconds && Gap <= Maximum_Gap_Seconds &&
        Snapshot.c && Number.isSafeInteger(Snapshot.n) && Snapshot.n > 0;
    })
    .sort((First, Second) =>
      Math.abs((Observed_At_Seconds - First.t) - Target_Gap_Seconds) -
      Math.abs((Observed_At_Seconds - Second.t) - Target_Gap_Seconds));
  return Candidates[0] || null;
}

export function Calculate_Thirty_Minute_Changes(Country_Rows, Historical_Snapshots, Pool_Name, Observed_At_Seconds) {
  const Baseline = Find_Thirty_Minute_Baseline(Historical_Snapshots, Pool_Name, Observed_At_Seconds);
  const Changes = new Map();
  if (Baseline && Array.isArray(Country_Rows)) {
    for (const Country_Row of Country_Rows) {
      const Before = Baseline.c[Country_Row.Code];
      if (!Number.isSafeInteger(Before) || Before < 0 ||
          !Number.isSafeInteger(Country_Row.Count) || Country_Row.Count < 0) continue;
      const Difference = Country_Row.Count - Before;
      Changes.set(Country_Row.Code, {
        Before, Current: Country_Row.Count, Difference,
        Percent: Before > 0 ? Math.round(Difference / Before * 1000) / 10 : null,
      });
    }
  }
  return {
    Baseline,
    Elapsed_Minutes: Baseline ? Math.round((Observed_At_Seconds - Baseline.t) / 60) : null,
    Observed_At: Observed_At_Seconds,
    Changes,
  };
}

export function Get_Representative_Country_Time(Country_Code, Now_Milliseconds = Date.now()) {
  const Zone_Record = Get_Country_Time_Zones(Country_Code)?.[0];
  if (!Zone_Record) return null;
  const Clock = Format_Country_Clock(Now_Milliseconds, Zone_Record.Zone);
  if (!Clock) return null;
  return { ...Clock, City: Zone_Record.City };
}

export function Compute_Collection_Health(Historical_Snapshots, Now_Seconds = Math.floor(Date.now() / 1000)) {
  const Recent_Times = (Array.isArray(Historical_Snapshots) ? Historical_Snapshots : [])
    .map((Snapshot) => Snapshot?.t)
    .filter((Time) => Number.isSafeInteger(Time) && Time > 0 && Time <= Now_Seconds + 60)
    .sort((First, Second) => First - Second);
  if (!Recent_Times.length) return { Status: "unknown", Age_Minutes: null, Last_Time: null, Gap_Minutes: null };
  const Last_Time = Recent_Times.at(-1);
  const Age_Minutes = Math.max(0, Math.floor((Now_Seconds - Last_Time) / 60));
  const Gap_Minutes = Recent_Times.length > 1 ?
    Math.round((Last_Time - Recent_Times.at(-2)) / 60) : null;
  return {
    Status: Age_Minutes > 65 ? "late" : Age_Minutes > 45 ? "delayed" : "recent",
    Age_Minutes, Last_Time, Gap_Minutes,
  };
}

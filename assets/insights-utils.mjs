export function Aggregate_Hourly(Snapshots, Country_Code, Timezone, Days = 7, Now_Seconds = Math.floor(Date.now() / 1000)) {
  const Cutoff_Seconds = Now_Seconds - Days * 86400;
  const Hour_Formatter = new Intl.DateTimeFormat("en-US", { timeZone: Timezone, hour: "2-digit", hourCycle: "h23" });
  const Date_Formatter = new Intl.DateTimeFormat("en-CA", { timeZone: Timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  const Hour_Bins = Array.from({ length: 24 }, (_, Hour) => ({ Hour, Sum: 0, Sample_Count: 0, Days: new Set() }));
  const Valid_Samples = [];
  const Observation_Dates = new Set();
  for (const Snapshot of Snapshots) {
    if (!Snapshot || !Number.isSafeInteger(Snapshot.t) || Snapshot.t < Cutoff_Seconds || Snapshot.t > Now_Seconds + 60 ||
        !Snapshot.c || !Object.hasOwn(Snapshot.c, Country_Code)) continue;
    const Count = Snapshot.c[Country_Code];
    if (!Number.isSafeInteger(Count) || Count < 0) continue;
    const Snapshot_Date = new Date(Snapshot.t * 1000);
    const Hour = Number(Hour_Formatter.format(Snapshot_Date));
    if (!Number.isInteger(Hour) || Hour < 0 || Hour > 23) continue;
    const Day_Label = Date_Formatter.format(Snapshot_Date);
    Observation_Dates.add(Day_Label);
    const Bin = Hour_Bins[Hour];
    Bin.Sum += Count;
    Bin.Sample_Count++;
    Bin.Days.add(Day_Label);
    Valid_Samples.push({ t: Snapshot.t, Count });
  }
  Valid_Samples.sort((First, Second) => First.t - Second.t);
  const Hourly = Hour_Bins.map((Bin) => ({
    Hour: Bin.Hour,
    Average: Bin.Sample_Count ? Math.round(Bin.Sum / Bin.Sample_Count) : null,
    Sample_Count: Bin.Sample_Count,
    Distinct_Days: Bin.Days.size,
  }));
  const Qualified_Hours = Hourly.filter((Bin) => Bin.Sample_Count >= 4 && Bin.Distinct_Days >= 2);
  const Peak_Hours = Qualified_Hours.sort((First, Second) => Second.Average - First.Average || First.Hour - Second.Hour).slice(0, 3);
  const All_Counts = Valid_Samples.map((Sample) => Sample.Count);
  const Average_Count = All_Counts.length ? Math.round(All_Counts.reduce((Sum, Value) => Sum + Value, 0) / All_Counts.length) : null;
  const Maximum_Count = All_Counts.length ? Math.max(...All_Counts) : null;
  return {
    Samples: Valid_Samples,
    Hourly,
    Peak_Hours,
    Average_Count,
    Maximum_Count,
    Observation_Days: Observation_Dates.size,
    Sample_Count: Valid_Samples.length,
    Reliable_Enough: Observation_Dates.size >= 3 && Qualified_Hours.length >= 6,
  };
}

export function Compare_Day_Over_Day(Snapshots, Country_Code) {
  const Filtered = Snapshots
    .filter((Snapshot) => Snapshot?.c && Object.hasOwn(Snapshot.c, Country_Code) &&
      Number.isSafeInteger(Snapshot.c[Country_Code]))
    .sort((First, Second) => First.t - Second.t);
  if (Filtered.length < 2) return null;
  const Latest = Filtered.at(-1);
  const Target = Latest.t - 86400;
  const Previous = Filtered.reduce((Best, Sample) => {
    const Difference = Math.abs(Sample.t - Target);
    return Difference <= 3600 && (!Best || Difference < Math.abs(Best.t - Target)) ? Sample : Best;
  }, null);
  if (!Previous || !Previous.c[Country_Code]) return null;
  return Math.round(((Latest.c[Country_Code] / Previous.c[Country_Code]) - 1) * 100);
}

export function Calculate_Observed_Peak(Live_Count, Historical_Maximum) {
  const Valid = [Live_Count, Historical_Maximum].filter((Count) =>
    Number.isSafeInteger(Count) && Count >= 0);
  return Valid.length ? Math.max(...Valid) : null;
}

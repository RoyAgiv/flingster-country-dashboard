export const Gender_Presets = {
  flingster: {
    title: "Flingster members · DatingScout",
    women: 30, couples: 0,
    source: "DatingScout (October 2026)",
    url: "https://www.datingscout.com/flingster/review",
    note: "Third-party member estimate: 70% men, 30% women. Couples not separately measured.",
  },
  dirtyroulette: {
    title: "DirtyRoulette · independent review",
    women: 15, couples: 0,
    source: "Monkey App Alternatives (2026)",
    url: "https://monkeyappalternatives.lovable.app/",
    note: "Unverified 85% men / 15% women claim; methodology unknown. Couples not measured.",
  },
  tinder: {
    title: "Tinder sample · non-comparable",
    women: 33, couples: 0,
    source: "SwipeStats (2026)",
    url: "https://www.swipestats.io/blog/dating-app-statistics",
    note: "67% men / 33% women among ~7,000 uploaded Tinder profiles. Not a Flingster measurement.",
  },
  custom: {
    title: "My hypothetical assumptions",
    women: 30, couples: 10,
    source: "Your own assumptions",
    url: null,
    note: "Custom example only. Flingster does not disclose a verified live men/women/couples split.",
  },
};

export function Calculate_Population_Relationship(Reported_Count, Population_Record) {
  const Population = Population_Record?.value;
  if (!Number.isSafeInteger(Reported_Count) || Reported_Count < 0 ||
      !Number.isSafeInteger(Population) || Population <= 0) return null;
  return {
    Population,
    Year: Population_Record.year,
    Percent: Reported_Count * 100 / Population,
    Per_Million: Reported_Count * 1000000 / Population,
  };
}

export function Format_Small_Percent(Percent) {
  if (!Number.isFinite(Percent) || Percent < 0) return "—";
  if (Percent === 0) return "0%";
  if (Percent < 0.00000001) return "<0.00000001%";
  return Percent.toFixed(Percent < 0.00001 ? 8 : 6).replace(/0+$/, "").replace(/\.$/, "") + "%";
}

export function Calculate_Gender_Scenario(Reported_Count, Women_Pct, Couples_Pct) {
  if (!Number.isSafeInteger(Reported_Count) || Reported_Count < 0 ||
      !Number.isInteger(Women_Pct) || !Number.isInteger(Couples_Pct) ||
      Women_Pct < 0 || Couples_Pct < 0 || Women_Pct + Couples_Pct > 100) return null;
  const Men_Pct = 100 - Women_Pct - Couples_Pct;
  const Categories = [
    { Key: "Men", Percent: Men_Pct },
    { Key: "Women", Percent: Women_Pct },
    { Key: "Couples", Percent: Couples_Pct },
  ];
  const Quotas = Categories.map((Category) => Reported_Count * Category.Percent / 100);
  const Result_Counts = Quotas.map((Quota) => Math.floor(Quota));
  let Leftover = Reported_Count - Result_Counts.reduce((Sum, Value) => Sum + Value, 0);
  const Order = Categories
    .map((Category, Index) => ({ Index, Remainder: Quotas[Index] - Result_Counts[Index], Valid: Category.Percent > 0 }))
    .filter((Entry) => Entry.Valid)
    .sort((First, Second) => Second.Remainder - First.Remainder || First.Index - Second.Index);
  for (let Index = 0; Index < Leftover && Order.length; Index++) {
    Result_Counts[Order[Index % Order.length].Index]++;
  }
  return {
    Men_Pct, Women_Pct, Couples_Pct,
    Men: Result_Counts[0], Women: Result_Counts[1], Couples: Result_Counts[2],
    Total: Reported_Count,
  };
}

export function Compare_Pool_Representation(Country_Code, Historical_Snapshots) {
  if (!/^[A-Z]{2}$/.test(Country_Code) || !Array.isArray(Historical_Snapshots)) return null;
  const Latest = [...Historical_Snapshots].reverse()
    .find((Snapshot) => Snapshot?.rooms?.Default && Snapshot?.n > 0 &&
      Snapshot?.rooms?.Default?.n > 0);
  if (!Latest) return null;
  const Adult_Count = Latest.c?.[Country_Code];
  const Default_Count = Latest.rooms.Default.c?.[Country_Code];
  if (!Number.isInteger(Adult_Count) || !Number.isInteger(Default_Count)) return null;
  const Adult_Share = Adult_Count / Latest.n * 100;
  const Default_Share = Default_Count / Latest.rooms.Default.n * 100;
  const Factor = Adult_Share > 0 && Default_Share > 0 ?
    Math.max(Adult_Share, Default_Share) / Math.min(Adult_Share, Default_Share) : null;
  return {
    Adult_Share, Default_Share, Factor,
    Greater_Pool: Adult_Share > Default_Share ? "Adult" :
      Default_Share > Adult_Share ? "Default" : "Equal",
    Timestamp: Latest.t,
  };
}

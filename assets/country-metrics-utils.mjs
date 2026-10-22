export const Gender_Presets = {
  official: {
    title: "Official public feed — no gender totals",
    women: null, couples: null, rank: 0, trust: "none",
    source: "Flingster public country feed",
    url: "https://rest.flingster.com/xhr.html?v=2&online=1&room=Adult&config=1&lang=en",
    note: "Best supported factual answer: the public feed reports country activity, not live men, women or couples. No official distribution is published here.",
  },
  flingster: {
    title: "Flingster review · 70% men / 30% women",
    women: 30, couples: 0, rank: 1, trust: "medium",
    source: "DatingScout Flingster review (Oct 2026)",
    url: "https://www.datingscout.com/flingster/review",
    note: "Flingster-specific third-party membership estimate; no published sampling methodology here. Not verified live participants; couples not separately measured.",
  },
  dating_survey: {
    title: "Broader dating survey · 72% / 28%",
    women: 28, couples: 0, rank: 2, trust: "low",
    source: "DatingScout, State of Online Dating 2026",
    url: "https://www.datingscout.sg/online-dating-statistics",
    note: "Cross-platform online-dater survey reports 70.9% men, 27.4% women and 1.7% unaccounted; binary-normalized and rounded to 72/28 only for this scenario. Not a Flingster population.",
  },
  tinder_uploads: {
    title: "Tinder uploads · 88% men / 12% women",
    women: 12, couples: 0, rank: 3, trust: "low",
    source: "SwipeStats Tinder uploads (7,079 profiles)",
    url: "https://www.swipestats.io/blog/tinder-statistics",
    note: "Observed gender composition of voluntary data uploads (6,235 men, 844 women); self-selection strongly limits representativeness. Different platform.",
  },
  tinder: {
    title: "Tinder editorial estimate · 67% / 33%",
    women: 33, couples: 0, rank: 4, trust: "low",
    source: "SwipeStats 2026 overview",
    url: "https://www.swipestats.io/blog/dating-app-statistics",
    note: "Editorial 67/33 Tinder estimate differs from the 88/12 composition of SwipeStats' uploaded profiles. Neither represents Flingster users.",
  },
  dirtyroulette: {
    title: "DirtyRoulette unverified claim · 85% / 15%",
    women: 15, couples: 0, rank: 5, trust: "low",
    source: "Monkey App Alternatives (2026)",
    url: "https://monkeyappalternatives.lovable.app/",
    note: "Low-confidence third-party claim with no disclosed sampling method. Same public Adult statistics pool is not a separately measured gender population.",
  },
  balanced: {
    title: "Neutral what-if · 50% / 50%",
    women: 50, couples: 0, rank: 6, trust: "none",
    source: "Illustrative assumption, not research",
    url: null,
    note: "Equal-share sensitivity example only; not a factual estimate for this platform.",
  },
  custom: {
    title: "My scenario — editable percentages",
    women: 30, couples: 10, rank: 7, trust: "none",
    source: "Your assumptions",
    url: null,
    note: "Unverified custom allocation of reported online units across three modeled categories.",
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

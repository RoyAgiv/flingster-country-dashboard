export const Monitored_Hosts = ["rest.flingster.com", "rest2.flingster.com", "api.flingster.com"];

export function Summarize_Server_Agreement(Server_Readings) {
  const Readings = (Array.isArray(Server_Readings) ? Server_Readings : [])
    .filter((Entry) => Entry && Monitored_Hosts.includes(Entry.host) &&
      Number.isSafeInteger(Entry.n) && Entry.n > 0);
  if (Readings.length < 2) {
    return { Status: "insufficient", Sample_Count: Readings.length, Spread_Pct: null,
      Member_Spread_Pct: null, Min_Total: null, Max_Total: null, Members_Aligned: false };
  }
  const Median = (Values) => {
    const Sorted = [...Values].sort((First, Second) => First - Second);
    const Mid = Math.floor(Sorted.length / 2);
    return Sorted.length % 2 ? Sorted[Mid] : (Sorted[Mid - 1] + Sorted[Mid]) / 2;
  };
  const Totals = Readings.map((Entry) => Entry.n);
  const Spread_Pct = Math.round(((Math.max(...Totals) - Math.min(...Totals)) /
    Math.max(1, Median(Totals))) * 1000) / 10;
  const Members = Readings.map((Entry) => Entry.members)
    .filter((Member_Value) => Number.isSafeInteger(Member_Value) && Member_Value > 0);
  const Member_Spread_Pct = Members.length >= 2 ?
    Math.round(((Math.max(...Members) - Math.min(...Members)) /
      Math.max(1, Median(Members))) * 10000) / 100 : null;
  const Members_Aligned = Member_Spread_Pct !== null && Member_Spread_Pct <= 0.4;
  const Status = Spread_Pct >= 3 || (Member_Spread_Pct !== null && !Members_Aligned) ?
    "divergent" : "close";
  return { Status, Sample_Count: Readings.length, Spread_Pct,
    Member_Spread_Pct, Min_Total: Math.min(...Totals), Max_Total: Math.max(...Totals), Members_Aligned };
}

export function Get_Replica_Check(Historical_Snapshots, Pool_Name = "Adult") {
  const Snapshots = Array.isArray(Historical_Snapshots) ? Historical_Snapshots : [];
  return Snapshots.slice().reverse().find((Snapshot) =>
    Snapshot?.checks && Array.isArray(Snapshot.checks[Pool_Name]) &&
    Snapshot.checks[Pool_Name].length >= 1) || null;
}

export function Summarize_Member_Reliability(Historical_Snapshots, Current_Members, Now_Seconds) {
  if (!Number.isSafeInteger(Current_Members) || Current_Members <= 0) {
    return { Trusted: false, Growth: null, Reason: "Membership total unavailable" };
  }
  const Latest_Check = Get_Replica_Check(Historical_Snapshots, "Adult");
  if (!Latest_Check || Now_Seconds - Latest_Check.t > 7200) {
    return { Trusted: false, Growth: null, Reason: "Waiting for a recent multi-server check" };
  }
  const Current_Agreement = Summarize_Server_Agreement(Latest_Check.checks.Adult);
  if (!Current_Agreement.Members_Aligned) {
    return { Trusted: false, Growth: null, Reason: "Member totals disagree between servers" };
  }
  const Latest_Primary_Members = Latest_Check.checks.Adult.find((Entry) =>
    Entry.host === "rest.flingster.com")?.members;
  if (!Number.isSafeInteger(Latest_Primary_Members) ||
      Math.abs(Current_Members - Latest_Primary_Members) / Latest_Primary_Members * 100 > 0.4) {
    return { Trusted: false, Growth: null, Reason: "Latest membership count differs from checked baseline" };
  }
  const History = (Array.isArray(Historical_Snapshots) ? Historical_Snapshots : [])
    .filter((Snapshot) => Number.isSafeInteger(Snapshot?.t) &&
      Number.isSafeInteger(Snapshot.members) && Snapshot.members > 0 &&
      Math.abs((Now_Seconds - Snapshot.t) - 86400) <= 5400)
    .sort((First, Second) => Math.abs((Now_Seconds - First.t) - 86400) -
      Math.abs((Now_Seconds - Second.t) - 86400));
  const Baseline = History.find((Snapshot) => Summarize_Server_Agreement(
    Snapshot?.checks?.Adult).Members_Aligned);
  if (!Baseline) {
    return { Trusted: false, Growth: null, Reason: "24-hour consistent baseline not available yet" };
  }
  const Growth = Current_Members - Baseline.members;
  const Change_Pct = Math.abs(Growth) / Baseline.members * 100;
  if (Growth < 0 || Change_Pct > 0.4) {
    return { Trusted: false, Growth: null, Reason: "Reported membership changed unusually fast" };
  }
  return { Trusted: true, Growth, Reason: "24-hour change cross-checked across servers" };
}

export function Analyze_Unusual_Activity_Jump(Historical_Snapshots, Pool_Name = "Adult") {
  const Samples = (Array.isArray(Historical_Snapshots) ? Historical_Snapshots : [])
    .map((Snapshot) => {
      const Pool = Pool_Name === "Adult" ? Snapshot : Snapshot?.rooms?.[Pool_Name];
      return Number.isSafeInteger(Snapshot?.t) && Number.isSafeInteger(Pool?.n) && Pool.n > 1000
        ? { t: Snapshot.t, n: Pool.n } : null;
    }).filter(Boolean).sort((First, Second) => First.t - Second.t);
  const Recent = Samples.slice(-2);
  if (Recent.length !== 2 || Recent[1].t - Recent[0].t < 1200 ||
      Recent[1].t - Recent[0].t > 5400) return null;
  const Change = (Recent[1].n - Recent[0].n) / Recent[0].n * 100;
  return Math.abs(Change) >= 35 ? { Suspected: true, Percent: Math.round(Change) } : null;
}

export function Evaluate_Interest_Tag(Tag_Text) {
  const Tag = typeof Tag_Text === "string" ? Tag_Text.trim().toLowerCase().replace(/\s+/g, "-") : "";
  if (!/^[a-z0-9-]{1,48}$/.test(Tag)) {
    return { Tag, Status: "invalid", Message: "Use letters, numbers, or hyphens." };
  }
  const Accepted = new Set(["gay","lesbian","mature","flirt","roleplay","discreet",
    "music","travel","gaming","sports","trans","bdsm","exhibitionist","dirty-talk",
    "kink","voyeur","bi-curious","one-on-one","no-strings","chat-first",
    "casual-dating","open-relationship"]);
  const Rejected = new Set(["girls","movies"]);
  return {
    Tag, Status: Accepted.has(Tag) ? "reported-accepted" : Rejected.has(Tag) ? "reported-rejected" : "unknown",
    Message: Accepted.has(Tag) ? "Previously accepted in October 2026 research; not a live API check." :
      Rejected.has(Tag) ? "Previously rejected in October 2026 research; not a live API check." :
      "Not verified. CountryPulse does not have live validation access from this site.",
  };
}

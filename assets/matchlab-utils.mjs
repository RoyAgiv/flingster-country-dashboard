export const MatchLab_Storage_Key = "countrypulse-matchlab-v1";

export function Validate_Match_Session(Session) {
  return Boolean(Session && Number.isSafeInteger(Session.started) &&
    Number.isSafeInteger(Session.ended) && Session.ended >= Session.started &&
    Session.ended - Session.started >= 30 && Session.ended - Session.started <= 86400 &&
    Number.isSafeInteger(Session.good) && Session.good >= 0 &&
    Number.isSafeInteger(Session.attempts) && Session.attempts >= Session.good &&
    typeof Session.country === "string" && Session.country.length <= 5 &&
    typeof Session.interest === "string" && Session.interest.length <= 48);
}

export function Summarize_Match_Sessions(Sessions) {
  const Valid = (Array.isArray(Sessions) ? Sessions : [])
    .filter(Validate_Match_Session).slice(-200);
  const Duration_Seconds = Valid.reduce((Sum, Session) => Sum + (Session.ended - Session.started), 0);
  const Good_Matches = Valid.reduce((Sum, Session) => Sum + Session.good, 0);
  const Attempts = Valid.reduce((Sum, Session) => Sum + Session.attempts, 0);
  const Matches_Per_Hour = Duration_Seconds ? Math.round((Good_Matches / Duration_Seconds) * 36000) / 10 : null;
  const Conversion_Rate = Attempts ? Math.round((Good_Matches / Attempts) * 1000) / 10 : null;
  const Interest_Buckets = new Map();
  for (const Session of Valid) {
    const Key = Session.interest.trim().toLowerCase() || "no interest tag";
    const Previous = Interest_Buckets.get(Key) || { Interest: Key, Seconds: 0, Good: 0, Sessions: 0 };
    Previous.Seconds += Session.ended - Session.started;
    Previous.Good += Session.good;
    Previous.Sessions++;
    Interest_Buckets.set(Key, Previous);
  }
  const Qualified_Interests = [...Interest_Buckets.values()]
    .filter((Entry) => Entry.Seconds >= 1800 && Entry.Sessions >= 2)
    .map((Entry) => ({
      ...Entry, Rate: Math.round((Entry.Good / Entry.Seconds) * 36000) / 10,
    })).sort((First, Second) => Second.Rate - First.Rate || Second.Sessions - First.Sessions);
  return {
    Sessions: Valid.length,
    Good_Matches, Attempts,
    Duration_Seconds,
    Matches_Per_Hour, Conversion_Rate,
    Best_Interest: Qualified_Interests[0] || null,
  };
}

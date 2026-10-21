import Test from "node:test";
import Assert from "node:assert/strict";
import {
  Monitored_Hosts, Summarize_Server_Agreement, Get_Replica_Check,
  Summarize_Member_Reliability, Analyze_Unusual_Activity_Jump, Evaluate_Interest_Tag,
} from "../assets/provenance-utils.mjs";

const Fixed_Time = 1792570000;
function Reading(Host, Count, Member_Count) {
  return { host: Host, n: Count, members: Member_Count };
}
const Aligned = [
  Reading("rest.flingster.com", 54000, 33579065),
  Reading("rest2.flingster.com", 54200, 33579065),
  Reading("api.flingster.com", 54100, 33579065),
];
Test("multi-server agreement flags divergent activity and member counts", () => {
  Assert.equal(Summarize_Server_Agreement(Aligned).Status, "close");
  const Divergent = [
    Reading("rest.flingster.com", 20778, 33579065),
    Reading("rest2.flingster.com", 25066, 32883787),
    Reading("api.flingster.com", 20737, 33579065),
  ];
  const Result = Summarize_Server_Agreement(Divergent);
  Assert.equal(Result.Status, "divergent");
  Assert.ok(Result.Spread_Pct > 15);
  Assert.equal(Result.Members_Aligned, false);
  Assert.equal(Summarize_Server_Agreement([Aligned[0]]).Status, "insufficient");
  Assert.equal(Summarize_Server_Agreement([Aligned[0], { host: "example.com", n: 1 }]).Status, "insufficient");
});

Test("member growth is hidden unless same-day server checks and 24h baseline agree", () => {
  const Old_Snapshot = {
    t: Fixed_Time - 86400, n: 50000, c: { US: 50000 },
    members: 33579000, checks: { Adult: [
      Reading("rest.flingster.com", 50000, 33579000),
      Reading("rest2.flingster.com", 50020, 33579000),
    ] },
  };
  const New_Snapshot = {
    t: Fixed_Time - 60, n: 54000, c: { US: 54000 },
    members: 33579065, checks: { Adult: Aligned },
  };
  const Result = Summarize_Member_Reliability([Old_Snapshot, New_Snapshot], 33579065, Fixed_Time);
  Assert.equal(Result.Trusted, true);
  Assert.equal(Result.Growth, 65);
  Assert.equal(Summarize_Member_Reliability([Old_Snapshot], 33579065, Fixed_Time).Trusted, false);
  Assert.equal(Summarize_Member_Reliability([{
    ...New_Snapshot, checks: { Adult: [
      Reading("rest.flingster.com", 54000, 33579065),
      Reading("rest2.flingster.com", 54100, 32883787),
    ] },
  }, Old_Snapshot], 33579065, Fixed_Time).Growth, null);
  Assert.equal(Summarize_Member_Reliability([Old_Snapshot, New_Snapshot], 33579065 - 500, Fixed_Time).Trusted, false);
  Assert.equal(Summarize_Member_Reliability([Old_Snapshot, New_Snapshot], 32883787, Fixed_Time).Trusted, false);
});

Test("stale source-check detection and unusual jumps require a real prior sample", () => {
  const With_Checks = [{ t: Fixed_Time, checks: { Adult: Aligned } }];
  Assert.equal(Get_Replica_Check(With_Checks)?.t, Fixed_Time);
  Assert.equal(Get_Replica_Check([], "Adult"), null);
  const Difference = [
    { t: Fixed_Time - 1800, n: 50000 },
    { t: Fixed_Time, n: 72000 },
  ];
  const Jump = Analyze_Unusual_Activity_Jump(Difference);
  Assert.equal(Jump.Suspected, true);
  Assert.equal(Jump.Percent, 44);
  Assert.equal(Analyze_Unusual_Activity_Jump([Difference[1]]), null);
  Assert.equal(Analyze_Unusual_Activity_Jump([
    {t:Fixed_Time-86400,n:50000}, {t:Fixed_Time,n:72000},
  ]), null);
});

Test("interest status is historical guidance, not fabricated live validation", () => {
  Assert.equal(Evaluate_Interest_Tag("roleplay").Status, "reported-accepted");
  Assert.equal(Evaluate_Interest_Tag("girls").Status, "reported-rejected");
  Assert.equal(Evaluate_Interest_Tag("movies").Status, "reported-rejected");
  Assert.equal(Evaluate_Interest_Tag("unfamiliar").Status, "unknown");
  Assert.equal(Evaluate_Interest_Tag("<script>").Status, "invalid");
  Assert.equal(Evaluate_Interest_Tag("dirty talk").Tag, "dirty-talk");
  Assert.deepEqual(Monitored_Hosts, ["rest.flingster.com","rest2.flingster.com","api.flingster.com"]);
});

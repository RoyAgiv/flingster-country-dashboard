import Test from "node:test";
import Assert from "node:assert/strict";
import {
  Parse_Online_Response,
  Merge_Snapshot_History,
  Fetch_Online_Response,
  Source_Url,
  Retention_Days,
  Verify_Flingster_Response_Identity,
} from "../scripts/collect.mjs";

function Build_Fixture(Country_Total = 26, Count_Override = undefined) {
  const Countries = Object.fromEntries(
    Array.from({ length: Country_Total }, (_, Index) => [
      String.fromCharCode(65 + Math.floor(Index / 26), 65 + Index % 26),
      Index + 1,
    ])
  );
  const Sum = Object.values(Countries).reduce((Total, Count) => Total + Count, 0);
  const Payload = { ALL: Count_Override ?? Sum, ...Countries, Members: 33567680, Tags: ["casual"] };
  return '<html><script>window.parent.postMessage({"xhrl":"online","xhrd":' +
    JSON.stringify(Payload) + ',"xhrh":{"x-site":"Flingster"}},"*");</script></html>';
}

Test("parses valid site-reported country counts without marketing numbers", () => {
  const Snapshot = Parse_Online_Response(Build_Fixture(), 5000);
  Assert.equal(Snapshot.t, 5000);
  Assert.equal(Snapshot.n, 351);
  Assert.equal(Object.keys(Snapshot.c).length, 26);
  Assert.equal(Snapshot.c.AA, 1);
  Assert.equal(Snapshot.c.AZ, 26);
  Assert.equal("Members" in Snapshot.c, false);
});

Test("rejects incomplete or inflated worldwide totals", () => {
  Assert.throws(() => Parse_Online_Response(Build_Fixture(26, 360)), /reconciliation/);
  Assert.throws(() => Parse_Online_Response(Build_Fixture(10)), /reconciliation/);
});

Test("rejects responses without a valid online message", () => {
  Assert.throws(() => Parse_Online_Response('<html>challenge</html>'), /online-count/);
  Assert.throws(() => Parse_Online_Response(2), /size/);
});

Test("adds an eligible new reading", () => {
  const History = { schema: 1, source: Source_Url, snapshots: [] };
  const Snapshot = { t: 5400, n: 351, c: { US: 350, IL: 1 } };
  const Result = Merge_Snapshot_History(History, Snapshot, 5500);
  Assert.equal(Result.snapshots.length, 1);
  Assert.deepEqual(Result.snapshots[0], Snapshot);
});

Test("does not collect duplicate or too-close readings", () => {
  const First_Snapshot = { t: 5400, n: 20, c: { US: 20 } };
  const History = { schema: 1, source: Source_Url, snapshots: [First_Snapshot] };
  Assert.equal(Merge_Snapshot_History(History, { t: 5500, n: 22, c: { US: 22 } }, 5500).snapshots.length, 1);
  Assert.equal(Merge_Snapshot_History(History, { t: 6000, n: 22, c: { US: 22 } }, 6000).snapshots.length, 1);
  Assert.equal(Merge_Snapshot_History(History, { t: 7200, n: 22, c: { US: 22 } }, 7200).snapshots.length, 2);
});

Test("expires readings beyond the rolling retention window", () => {
  const Now_Seconds = 60 * 86400;
  const Old_Snapshot = { t: Now_Seconds - (Retention_Days + 1) * 86400, n: 7, c: { US: 7 } };
  const Recent_Snapshot = { t: Now_Seconds - 3600, n: 8, c: { US: 8 } };
  const History = { schema: 1, source: Source_Url, snapshots: [Old_Snapshot, Recent_Snapshot] };
  const Result = Merge_Snapshot_History(History, { t: Now_Seconds, n: 9, c: { US: 9 } }, Now_Seconds);
  Assert.equal(Result.snapshots.length, 2);
  Assert.equal(Result.snapshots[0].t, Recent_Snapshot.t);
});

Test("fails closed for unknown history schemas", () => {
  Assert.throws(() => Merge_Snapshot_History({ schema: 99, snapshots: [] }, { t: 1, n: 1, c: {} }, 1), /schema/);
});

Test("uses real server shape and returns numeric snapshot", async () => {
  const Mock_Fetch = async () => ({ ok: true, text: async () => Build_Fixture() });
  const Result = await Fetch_Online_Response(Mock_Fetch);
  Assert.equal(Result.n, 351);
  Assert.ok(Result.t > 1000000000);
});


Test("rejects convincing country counts with fallback three-member identity",()=>{
  const Countries=Object.fromEntries(Array.from({length:26},(_,Index)=>[
    String.fromCharCode(65,65+Index),Index+1]));
  const Payload={ALL:351,...Countries,Members:3,Tags:Array.from({length:20},(_,Index)=>"tag"+Index)};
  const Html='<script>{"xhrl":"online","xhrd":'+JSON.stringify(Payload)+',"xhrh":{}}</script>';
  Assert.throws(()=>Parse_Online_Response(Html),/Fallback|invalid registered-member/);
});

Test("verifies both Flingster app identity and metadata instead of HTTP 200 alone",async()=>{
  const Config={Name:"Flingster",...Object.fromEntries(
    Array.from({length:30},(_,Index)=>["Setting_"+Index,true]))};
  const Metadata={ALL:0,Members:33579063,Tags:Array.from({length:17},(_,Index)=>"tag"+Index)};
  const Mock_Fetch=async(Url)=>({
    ok:true,json:async()=>Url.includes("/config?")?Config:Metadata,
  });
  const Identity=await Verify_Flingster_Response_Identity(Mock_Fetch);
  Assert.equal(Identity.Name,"Flingster");
  Assert.equal(Identity.Members,33579063);
  const Fallback=async(Url)=>({
    ok:true,json:async()=>Url.includes("/config?")?Config:{...Metadata,Members:3},
  });
  await Assert.rejects(Verify_Flingster_Response_Identity(Fallback),/Untrusted|fallback/);
  const Mismatch=async(Url)=>({
    ok:true,json:async()=>Url.includes("/config?")?{...Config,Name:"Shagle"}:Metadata,
  });
  await Assert.rejects(Verify_Flingster_Response_Identity(Mismatch),/Untrusted|fallback/);
});

import Test from "node:test";
import Assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  Select_Latest_Saved_Reading, Age_Label, Retry_Delay_Seconds, Determine_Chart_State,
  Compare_Countries,
} from "../assets/reliability-utils.mjs";
import { Get_Session_Active_Duration, Summarize_Match_Sessions } from "../assets/matchlab-utils.mjs";

function Make_Countries(Base = 7) {
  return Object.fromEntries(Array.from({length:28},(_,Index)=>[
    String.fromCharCode(65+Math.floor(Index/26),65+Index%26),Base+Index,
  ]));
}
function Make_Snapshot(Timestamp,Offset=0) {
  const Adult=Make_Countries(7+Offset);
  const Default=Make_Countries(12+Offset);
  const Combined=Make_Countries(15+Offset);
  const Sum=Entries=>Object.values(Entries).reduce((Total,Value)=>Total+Value,0);
  return {t:Timestamp,n:Sum(Adult),c:Adult,rooms:{
    Default:{n:Sum(Default),c:Default},Combined:{n:Sum(Combined),c:Combined},
  },members:33579065,tags:["flirt","roleplay"]};
}

Test("saved-history selection validates each pool independently, rejects invalid totals",()=>{
  const History=[Make_Snapshot(10000),Make_Snapshot(12000,3)];
  for(const Pool of ["Adult","Default","Combined"]) {
    const Result=Select_Latest_Saved_Reading(History,Pool);
    Assert.equal(Result.Pool_Name,Pool);
    Assert.equal(Result.Timestamp,12000);
    Assert.equal(Object.entries(Result.Payload).filter(([Code])=>/^[A-Z]{2}$/.test(Code)).length,28);
  }
  const Bad=Make_Snapshot(17000,2);
  Bad.n=3;
  Assert.equal(Select_Latest_Saved_Reading([Bad,History[0]],"Adult").Timestamp,10000);
  Assert.equal(Select_Latest_Saved_Reading([Bad],"Unknown"),null);
  Assert.equal(Select_Latest_Saved_Reading([], "Adult"),null);
});

Test("saved snapshot ages, retry backoff and chart states never conflate empty with failure",()=>{
  Assert.equal(Age_Label(9700,10000),"5m ago");
  Assert.equal(Age_Label(10000,10000),"just now");
  Assert.equal(Age_Label(6000,10000),"1h ago");
  Assert.deepEqual([1,2,3,4,5].map(Retry_Delay_Seconds),[15,30,60,120,120]);
  Assert.equal(Determine_Chart_State(0,"loading"),"loading");
  Assert.equal(Determine_Chart_State(0,"error"),"error");
  Assert.equal(Determine_Chart_State(28,"error"),"ready");
});

Test("two-country comparison calculates share and changes only from aligned same-pool samples",()=>{
  const Old=Make_Snapshot(100000);
  const Recent=Make_Snapshot(101800,5);
  const Rows=Object.entries(Recent.c).map(([Code,Count])=>({Code,Count,Name:Code}));
  const Pick=Compare_Countries(Rows,[Old,Recent],"Adult",101800,"recent",["AA","AB"]);
  Assert.equal(Pick.length,2);
  Assert.equal(Pick[0].Change,5);
  Assert.ok(Pick[0].World_Share>0 && Pick[0].World_Share<100);
  Assert.equal(Compare_Countries(Rows,[Old],"Adult",101800,"24h",["AA"])[0].Change,null);
  Assert.equal(Compare_Countries(Rows,[Old,Recent],"Default",101800,"recent",["AA"])[0].Change,0); // default baseline is for the same selected pool
});

Test("MatchLab pause durations do not count inactive time toward recommendations",()=>{
  const One={started:1000,ended:8200,paused_total:5400,country:"IL",interest:"flirt",good:3,attempts:10};
  Assert.equal(Get_Session_Active_Duration(One),1800);
  const Summary=Summarize_Match_Sessions([One]);
  Assert.equal(Summary.Duration_Seconds,1800);
  Assert.equal(Summary.Matches_Per_Hour,6);
});

Test("client has explicit saved/error UI and source-labelled UX sections",async()=>{
  const Html=await readFile(new URL("../index.html",import.meta.url),"utf8");
  const UX=await readFile(new URL("../assets/ux.mjs",import.meta.url),"utf8");
  const Matchlab=await readFile(new URL("../assets/matchlab.mjs",import.meta.url),"utf8");
  const Network=await readFile(new URL("../assets/network-explorer.mjs",import.meta.url),"utf8");
  Assert.match(Html,/countrypulse:history/);
  Assert.match(Html,/Apply_Saved_For_Room/);
  Assert.match(Html,/Data unavailable/);
  Assert.match(Html,/Refresh_Notice/);
  Assert.match(Html,/role="radiogroup"/);
  Assert.match(Html,/reliability-utils\.mjs/);
  Assert.match(UX,/Country_Compare/);
  Assert.match(UX,/Copy link/);
  Assert.match(UX,/Save view/);
  Assert.match(UX,/Best-time planner/);
  Assert.match(Matchlab,/Unknown \/ not reported/);
  Assert.match(Matchlab,/Load_Country_Directory/);
  Assert.match(Matchlab,/Toggle_Pause/);
  Assert.match(Matchlab,/Undo_Last_Connection/);
  Assert.match(Matchlab,/MatchLab_Export_Json/);
  Assert.match(Network,/Network_Compact_Table/);
  Assert.match(Network,/Network_Table_Body/);
});

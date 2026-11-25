// Shared presentation calculations; only saved, observed pool readings.
import { Calculate_Population_Relationship } from "./country-metrics-utils.mjs";
import { Get_Pool_Snapshots } from "./trends-utils.mjs";
import { MAX_CONNECTED_GAP_SECONDS, TARGET_SAMPLE_SECONDS, WORLD_WINDOWS } from "./world-trend-utils.mjs";
export const DASHBOARD_POOLS = ["Adult", "Default", "Combined"];
export const COMPARISON_WINDOWS = WORLD_WINDOWS;

export function Find_Countries(Rows, Query = "", Limit = 8) {
  const Term = String(Query).trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const Normal = Value => String(Value).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const Matches = (Rows || []).map(Row => {
    const Name = Normal(Row.Name), Code = Normal(Row.Code);
    const Score = !Term ? 0 : Code === Term || Name === Term ? 0 :
      Name.startsWith(Term) ? 1 : Code.startsWith(Term) ? 2 : Name.includes(Term) ? 3 : 99;
    return {Row, Score};
  }).filter(Item => Item.Score < 99);
  return Matches.sort((A,B) => A.Score-B.Score || B.Row.Count-A.Row.Count ||
    A.Row.Name.localeCompare(B.Row.Name)).slice(0,Limit).map(Item => Item.Row);
}

// Coverage counts unique completed UTC half-hour slots. The current partial
// slot is excluded from the denominator, but included in the latest timestamp.
export function Build_Collection_Coverage(Snapshots, Now) {
  const End = Math.floor(Now/TARGET_SAMPLE_SECONDS)*TARGET_SAMPLE_SECONDS;
  const Start = End - 48*TARGET_SAMPLE_SECONDS;
  const Week_Start = End - 336*TARGET_SAMPLE_SECONDS;
  return DASHBOARD_POOLS.map(Pool => {
    const Times = [...new Set(Get_Pool_Snapshots(Snapshots,Pool)
      .map(Point => Point.t).filter(Time => Time>0 && Time<=Now))];
    const Week = new Set(Times.filter(Time => Time>=Week_Start && Time<End)
      .map(Time => Math.floor(Time/TARGET_SAMPLE_SECONDS)));
    const Slots = Array.from({length:48},(_,Index) => {
      const Time = Start + Index*TARGET_SAMPLE_SECONDS;
      return {t:Time, Present:Week.has(Math.floor(Time/TARGET_SAMPLE_SECONDS))};
    });
    const Latest = Times.at(-1) ?? null;
    let Current_Missing=0, Longest_Missing=0;
    for (const Slot of Slots) {
      Current_Missing = Slot.Present ? 0 : Current_Missing+1;
      Longest_Missing=Math.max(Longest_Missing,Current_Missing);
    }
    const Count=Slots.filter(Slot=>Slot.Present).length;
    return {Pool, Slots, Count, Expected:48, Week_Count:Week.size,
      Week_Expected:336, Latest, Age:Latest===null?null:Math.floor((Now-Latest)/60),
      Longest_Missing, Current_Missing};
  });
}

export function Build_Country_Comparison(Snapshots, Pool, Codes, Window, Metric, Now) {
  const Duration=COMPARISON_WINDOWS[Window];
  if(!Duration || !DASHBOARD_POOLS.includes(Pool) || !["count","share"].includes(Metric))return null;
  const Start=Now-Duration;
  const By_Time=new Map(Get_Pool_Snapshots(Snapshots,Pool)
    .filter(Point=>Point.t>=Start && Point.t<=Now).map(Point=>[Point.t,Point]));
  const Points=[...By_Time.values()].sort((A,B)=>A.t-B.t);
  const Series=[...new Set(Codes)].filter(Code=>/^[A-Z]{2}$/.test(Code)).slice(0,4).map(Code=>{
    const Segments=[], Observations=[];
    let Segment=[];
    for(const Point of Points){
      const Count=Point.c[Code];
      if(!Number.isSafeInteger(Count)||Count<0||Count>Point.n){
        if(Segment.length)Segments.push(Segment);
        Segment=[];continue;
      }
      if(Segment.length && Point.t-Segment.at(-1).t>MAX_CONNECTED_GAP_SECONDS){
        Segments.push(Segment);Segment=[];
      }
      const Entry={t:Point.t, Count, Share:Count/Point.n*100,
        Value:Metric==="share"?Count/Point.n*100:Count};
      Observations.push(Entry);Segment.push(Entry);
    }
    if(Segment.length)Segments.push(Segment);
    const Values=Observations.map(Point=>Point.Value);
    return {Code, Observations, Segments, Count:Values.length,
      Latest:Observations.at(-1)??null,
      Average:Values.length?Values.reduce((Sum,Value)=>Sum+Value,0)/Values.length:null,
      Peak:Values.length?Math.max(...Values):null};
  });
  const Maximum=Math.max(0,...Series.flatMap(Item=>Item.Observations.map(Point=>Point.Value)));
  const Unit=Maximum>0?10**Math.floor(Math.log10(Maximum)):1;
  return {Pool,Metric,Window,Start,End:Now,Series,
    Maximum:Math.max(Metric==="share"?.01:1,Math.ceil(Maximum/Unit*2)/2*Unit)};
}

export function Country_Comparison_Csv(Comparison) {
  const Rows=[["Observation UTC","Pool","Country code","Reported online","World share (%)","Source"]];
  for(const Series of Comparison?.Series||[]){
    for(const Point of Series.Observations)Rows.push([new Date(Point.t*1000).toISOString(),
      Comparison.Pool,Series.Code,Point.Count,Point.Share.toFixed(6),"saved"]);
  }
  return Rows.map(Row=>Row.map(Value=>'"'+String(Value).replaceAll('"','""')+'"').join(",")).join("\r\n");
}

// One filtered/sorted view for the table and its CSV export.
export function Build_Ranking_View(Rows, Query, Minimum, Sort, Changes = new Map(), Population = {}) {
  const Filtered=Find_Countries(Rows,Query,Rows.length).filter(Row=>Row.Count>=Minimum);
  const Rate=Row=>Calculate_Population_Relationship(Row.Count,Population[Row.Code])?.Per_Million??-1;
  return Filtered.sort((A,B)=>{
    if(Sort==="name")return A.Name.localeCompare(B.Name);
    if(Sort==="smallest")return A.Count-B.Count||A.Name.localeCompare(B.Name);
    if(Sort==="per-million")return Rate(B)-Rate(A)||B.Count-A.Count;
    if(Sort==="rising"||Sort==="falling"){
      const X=Changes.get(A.Code)?.Difference,Y=Changes.get(B.Code)?.Difference;
      if(Number.isFinite(X)&&Number.isFinite(Y))return (Sort==="rising"?Y-X:X-Y)||B.Count-A.Count;
      if(Number.isFinite(X))return -1;if(Number.isFinite(Y))return 1;
    }
    return B.Count-A.Count||A.Name.localeCompare(B.Name);
  });
}

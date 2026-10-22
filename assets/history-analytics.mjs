import { Get_Country_Local_Hour } from "./country-timezones.mjs";

export function Summarize_Country_Series(Samples, Days = 7, Now_Seconds = Math.floor(Date.now()/1000)) {
  const Cutoff = Now_Seconds - Days*86400;
  const Points = (Array.isArray(Samples)?Samples:[])
    .filter((Item)=>Item && Number.isSafeInteger(Item.t) &&
      Item.t>=Cutoff && Item.t<=Now_Seconds+60 &&
      Number.isSafeInteger(Item.Count) && Item.Count>=0)
    .sort((First,Second)=>First.t-Second.t);
  const Values = Points.map((Item)=>Item.Count).sort((First,Second)=>First-Second);
  const First = Points[0] || null;
  const Latest = Points.at(-1) || null;
  const Previous = Points.at(-2) || null;
  const Min = Values.length?Values[0]:null;
  const Max = Values.length?Values.at(-1):null;
  const Median = Values.length?
    (Values[Math.floor((Values.length-1)/2)]+Values[Math.floor(Values.length/2)])/2:null;
  const Mean = Values.length?Values.reduce((Sum,Value)=>Sum+Value,0)/Values.length:null;
  const Gaps = [];
  for (let Index=1; Index<Points.length; Index++) {
    const Difference = Points[Index].t-Points[Index-1].t;
    if (Difference>90*60) Gaps.push({
      Started:Points[Index-1].t,Ended:Points[Index].t,Seconds:Difference,
    });
  }
  const Half_Hour_Slots=new Set(Points.map((Item)=>Math.floor(Item.t/1800))).size;
  const Expected=Math.max(1,Math.ceil(Days*48));
  return {
    Points, First, Latest, Previous,
    Count:Points.length, Min, Max, Median, Mean,
    Latest_Difference:Latest&&Previous?Latest.Count-Previous.Count:null,
    Latest_Percent:Latest&&Previous&&Previous.Count>0?
      (Latest.Count-Previous.Count)/Previous.Count*100:null,
    Overall_Difference:Latest&&First&&Latest!==First?Latest.Count-First.Count:null,
    Overall_Percent:Latest&&First&&Latest!==First&&First.Count>0?
      (Latest.Count-First.Count)/First.Count*100:null,
    Spread_Percent:Min!==null&&Min>0?(Max-Min)/Min*100:null,
    Coverage_Percent:Math.min(100,Half_Hour_Slots/Expected*100),
    Gaps,Gaps_Count:Gaps.length,
    Oldest_At:First?.t??null, Latest_At:Latest?.t??null,
    Expected_Slots:Expected,
  };
}

export function Build_Hourly_Experience(Samples, Zone, Day_Filter = "all", Now_Seconds = Math.floor(Date.now()/1000)) {
  if(!Zone || !["all","weekday","weekend"].includes(Day_Filter))return null;
  const Hour_Formatter=new Intl.DateTimeFormat("en-US",{
    timeZone:Zone,hour:"2-digit",hourCycle:"h23",weekday:"short",
  });
  const Date_Formatter=new Intl.DateTimeFormat("en-CA",{
    timeZone:Zone,year:"numeric",month:"2-digit",day:"2-digit",
  });
  const Hours=Array.from({length:24},(_,Hour)=>({
    Hour,Total:0,Sample_Count:0,Distinct_Days:0,Average:null,
    Min:null,Max:null,Is_Qualified:false,
    Date_Set:new Set(),
  }));
  const All_Days=new Set();
  let Sample_Count=0;
  for(const Item of (Array.isArray(Samples)?Samples:[])){
    if(!Item||!Number.isSafeInteger(Item.t)||!Number.isSafeInteger(Item.Count)||
      Item.Count<0||Item.t>Now_Seconds+60)continue;
    const Date_Object=new Date(Item.t*1000);
    const Parts=Hour_Formatter.formatToParts(Date_Object);
    const Hour=Number(Parts.find((Part)=>Part.type==="hour")?.value);
    const Weekday=Parts.find((Part)=>Part.type==="weekday")?.value;
    if(!Number.isInteger(Hour)||Hour<0||Hour>23||!Weekday)continue;
    const Weekend=["Sat","Sun"].includes(Weekday);
    if(Day_Filter==="weekend"&&!Weekend || Day_Filter==="weekday"&&Weekend)continue;
    const Day=Date_Formatter.format(Date_Object);
    const Bin=Hours[Hour];
    Bin.Total+=Item.Count;
    Bin.Sample_Count++;
    Bin.Date_Set.add(Day);
    Bin.Min=Bin.Min===null?Item.Count:Math.min(Bin.Min,Item.Count);
    Bin.Max=Bin.Max===null?Item.Count:Math.max(Bin.Max,Item.Count);
    All_Days.add(Day);
    Sample_Count++;
  }
  for(const Bin of Hours){
    Bin.Average=Bin.Sample_Count?Math.round(Bin.Total/Bin.Sample_Count):null;
    Bin.Distinct_Days=Bin.Date_Set.size;
    Bin.Is_Qualified=Bin.Sample_Count>=4 && Bin.Distinct_Days>=2;
    delete Bin.Date_Set;
  }
  const Qualified=Hours.filter((Bin)=>Bin.Is_Qualified).sort((A,B)=>B.Average-A.Average);
  const Preview=Hours.filter((Bin)=>Bin.Sample_Count>=2 && Bin.Distinct_Days>=2)
    .sort((A,B)=>B.Average-A.Average);
  const Coverage_Hours=Hours.filter((Bin)=>Bin.Sample_Count>0).length;
  const Coverage_Days=All_Days.size;
  const Confidence=Coverage_Days>=7&&Qualified.length>=16&&Coverage_Hours>=20?"good":
    Coverage_Days>=3&&Qualified.length>=6&&Coverage_Hours>=12?"emerging":"limited";
  const Now_Hour=Get_Country_Local_Hour(Now_Seconds,Zone);
  return {
    Hours, Qualified, Preview, Sample_Count, Coverage_Hours,
    Coverage_Days, Confidence,
    Now_Hour,Zone,Day_Filter,
    Best_Hours:Confidence==="limited"?[]:Qualified.slice(0,3),
  };
}

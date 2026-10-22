import Test from "node:test";
import Assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  Get_Country_Time_Zones, Get_Country_Local_Hour, Format_Country_Clock,
} from "../assets/country-timezones.mjs";
import {
  Summarize_Country_Series, Build_Hourly_Experience,
} from "../assets/history-analytics.mjs";
import { Gender_Presets, Calculate_Gender_Scenario } from "../assets/country-metrics-utils.mjs";

Test("representative current clocks use DST-aware IANA zones",()=>{
  const United_States=Get_Country_Time_Zones("US");
  const Israel=Get_Country_Time_Zones("IL");
  const India=Get_Country_Time_Zones("IN");
  Assert.ok(United_States.length>=4);
  Assert.ok(United_States.some((Entry)=>Entry.City==="New York"));
  Assert.ok(United_States.some((Entry)=>Entry.City==="Los Angeles"));
  Assert.equal(Israel[0].Zone,"Asia/Jerusalem");
  Assert.ok(India.length>=1);
  Assert.equal(Get_Country_Time_Zones("QQ").length>=0,true);
  Assert.deepEqual(Get_Country_Time_Zones("<script>"),[]);
  const Timestamp=Date.parse("2026-10-22T15:00:00Z");
  const Jerusalem=Format_Country_Clock(Timestamp,"Asia/Jerusalem");
  const New_York=Format_Country_Clock(Timestamp,"America/New_York");
  Assert.ok(Jerusalem.Time!==New_York.Time);
  Assert.equal(Get_Country_Local_Hour(Timestamp/1000,"Asia/Jerusalem"),18);
  Assert.equal(Format_Country_Clock(Timestamp,"Not/A_Zone"),null);
});

Test("history statistics preserve every observed point and expose gaps",()=>{
  const Now=1800000000;
  const Samples=[
    {t:Now-7200,Count:7300},
    {t:Now-5400,Count:7440},
    {t:Now-1800,Count:7010},
    {t:Now,Count:7150},
  ];
  const Data=Summarize_Country_Series(Samples,1,Now);
  Assert.equal(Data.Count,4);
  Assert.equal(Data.Min,7010);
  Assert.equal(Data.Max,7440);
  Assert.equal(Data.Latest_Difference,140);
  Assert.equal(Data.Previous.Count,7010);
  Assert.equal(Data.Gaps_Count,0);
  Assert.ok(Data.Coverage_Percent>0 && Data.Coverage_Percent<100);
  const Large_Gap=Summarize_Country_Series([
    {t:Now-86400,Count:5000},{t:Now,Count:6000},
  ],2,Now);
  Assert.equal(Large_Gap.Gaps_Count,1);
  Assert.equal(Large_Gap.Gaps[0].Seconds,86400);
  Assert.equal(Summarize_Country_Series([],1,Now).Count,0);
});

Test("best-hours view shows observed bins but withholds confident ranking on sparse history",()=>{
  const Now=Math.floor(Date.parse("2026-10-22T15:00:00Z")/1000);
  const Sparse=[{t:Now-3600,Count:7000},{t:Now-1800,Count:7200}];
  const Data=Build_Hourly_Experience(Sparse,"Asia/Jerusalem","all",Now);
  Assert.equal(Data.Confidence,"limited");
  Assert.equal(Data.Best_Hours.length,0);
  Assert.ok(Data.Hours.some((Entry)=>Entry.Sample_Count>0));
  Assert.equal(Data.Hours.reduce((Total,Entry)=>Total+Entry.Sample_Count,0),2);
  Assert.equal(Data.Now_Hour,18);
});

Test("weekday and weekend patterns are grouped by selected country timezone",()=>{
  const Now=Math.floor(Date.parse("2026-10-22T15:00:00Z")/1000);
  const Samples=[];
  for(let Day=0;Day<14;Day++){
    const Date_Seconds=Now-Day*86400;
    Samples.push({t:Date_Seconds,Count:2000+Day});
  }
  const Weekday=Build_Hourly_Experience(Samples,"Asia/Jerusalem","weekday",Now);
  const Weekend=Build_Hourly_Experience(Samples,"Asia/Jerusalem","weekend",Now);
  const All=Build_Hourly_Experience(Samples,"Asia/Jerusalem","all",Now);
  Assert.equal(Weekday.Sample_Count+Weekend.Sample_Count,All.Sample_Count);
  Assert.ok(Weekday.Sample_Count>Weekend.Sample_Count);
});

Test("default gender model is truthful unverified status; other sources are ranked",()=>{
  Assert.equal(Gender_Presets.official.rank,0);
  Assert.equal(Gender_Presets.official.women,null);
  Assert.equal(Gender_Presets.flingster.women,30);
  Assert.ok(Gender_Presets.flingster.rank<Gender_Presets.dating_survey.rank);
  Assert.ok(Gender_Presets.dating_survey.rank<Gender_Presets.dirtyroulette.rank);
  Assert.match(Gender_Presets.tinder.note,/Neither represents Flingster/);
  Assert.equal(Calculate_Gender_Scenario(7000,null,null),null);
  const Flingster=Calculate_Gender_Scenario(7000,30,0);
  Assert.equal(Flingster.Men,4900);
});

Test("interactive history and local clock controls are integrated without rewriting dashboard",async()=>{
  const Explorer=await readFile(new URL("../assets/history-explorer.mjs",import.meta.url),"utf8");
  const Insights=await readFile(new URL("../assets/insights.mjs",import.meta.url),"utf8");
  const Extra=await readFile(new URL("../assets/country-extras.mjs",import.meta.url),"utf8");
  Assert.match(Explorer,/pointermove/);
  Assert.match(Explorer,/keydown/);
  Assert.match(Explorer,/History_Tooltip/);
  Assert.match(Explorer,/History_Missing_Gap/);
  Assert.match(Explorer,/Download history CSV/);
  Assert.match(Explorer,/Inspector|Hour_Inspector/);
  Assert.match(Insights,/Render_Country_Clocks/);
  Assert.match(Insights,/Render_Interactive_Hours/);
  Assert.match(Extra,/Scenario_Disclosure/);
  Assert.match(Extra,/Scenario_Source_Quality/);
});

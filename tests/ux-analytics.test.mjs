import Test from "node:test";
import Assert from "node:assert/strict";
import { Find_Countries, Build_Collection_Coverage, Build_Country_Comparison, Country_Comparison_Csv, Build_Ranking_View } from "../assets/ux-analytics.mjs";
const Now=1800000000;
const Sample=(Time,US=100,IL=50,Default=true)=>({t:Time,n:US+(IL??0),c:IL===null?{US}:{US,IL},
  ...(Default?{rooms:{Default:{n:100,c:{US:100}}}}:{})});
Test("quick search prioritizes exact codes and accent-insensitive country names",()=>{
  const Rows=[{Code:"US",Name:"United States",Count:20},{Code:"GB",Name:"United Kingdom",Count:30},
    {Code:"CI",Name:"Côte d’Ivoire",Count:10}];
  Assert.equal(Find_Countries(Rows,"us")[0].Code,"US");
  Assert.equal(Find_Countries(Rows,"united")[0].Code,"GB");
  Assert.equal(Find_Countries(Rows,"cote")[0].Code,"CI");
  Assert.deepEqual(Find_Countries(Rows,"missing"),[]);
});
Test("coverage excludes current partial and future slots, deduplicates and stays pool specific",()=>{
  const Result=Build_Collection_Coverage([Sample(Now-1800),Sample(Now-1700),
    Sample(Now-3600,100,50,false),Sample(Now),Sample(Now+1800)],Now);
  Assert.equal(Result[0].Count,2);Assert.equal(Result[0].Latest,Now);
  Assert.equal(Result[1].Count,1);Assert.equal(Result[2].Count,0);
  Assert.equal(Result[0].Week_Count,2);
  Assert.equal(Result[0].Slots.length,48);Assert.equal(Result[2].Longest_Missing,48);
});
Test("comparison keeps one scale, breaks on missing or distant observations and preserves zeroes",()=>{
  const Samples=[Sample(Now-7200),Sample(Now-6600,150,null),Sample(Now-6000,100,0),Sample(Now-300,200,100)];
  const C=Build_Country_Comparison(Samples,"Adult",["IL","US","IL"],"24h","count",Now);
  Assert.equal(C.Series.length,2);Assert.equal(C.Series[0].Count,3);
  Assert.equal(C.Series[0].Segments.length,3);Assert.equal(C.Series[0].Observations[1].Value,0);
  Assert.equal(C.Series[0].Average,50);Assert.ok(C.Maximum>=200);
  const Share=Build_Country_Comparison(Samples,"Adult",["IL"],"24h","share",Now);
  Assert.equal(Share.Series[0].Latest.Value,100/300*100);
  Assert.equal(Build_Country_Comparison(Samples,"Combined",["IL"],"24h","count",Now).Series[0].Count,0);
  const CSV=Country_Comparison_Csv(C);
  Assert.ok(CSV.includes('"Adult","IL","0"'));Assert.ok(CSV.includes('"saved"'));
});

Test("ranking filters by minimum and sorts known population rates without inventing missing values",()=>{
  const Rows=[{Code:"US",Name:"United States",Count:100},{Code:"IL",Name:"Israel",Count:50},{Code:"GB",Name:"United Kingdom",Count:200}];
  const Population={US:{value:1000000,year:2025},IL:{value:100000,year:2025}};
  Assert.deepEqual(Build_Ranking_View(Rows,"",0,"per-million",new Map(),Population).map(R=>R.Code),["IL","US","GB"]);
  Assert.deepEqual(Build_Ranking_View(Rows,"united",150,"name").map(R=>R.Code),["GB"]);
  Assert.deepEqual(Build_Ranking_View(Rows,"",0,"rising",new Map([["IL",{Difference:-5}]])).map(R=>R.Code),["IL","GB","US"]);
});

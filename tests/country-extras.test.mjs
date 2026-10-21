import Test from "node:test";
import Assert from "node:assert/strict";
import {
  Gender_Presets, Calculate_Gender_Scenario, Calculate_Population_Relationship,
  Format_Small_Percent, Compare_Pool_Representation,
} from "../assets/country-metrics-utils.mjs";
import {
  Transform_Population_Response, Should_Refresh_Population,
} from "../scripts/update-population.mjs";

Test("population fraction uses the reported country count without inflating it", () => {
  const M = Calculate_Population_Relationship(11901,{value:341784857,year:2025});
  Assert.ok(M.Percent < 0.01);
  Assert.ok(M.Per_Million > 30 && M.Per_Million < 40);
  Assert.equal(M.Year,2025);
  Assert.equal(Calculate_Population_Relationship(11901,null),null);
  Assert.equal(Calculate_Population_Relationship(-10,{value:100000,year:2025}),null);
  Assert.ok(Format_Small_Percent(M.Percent).startsWith("0.003"));
  Assert.equal(Format_Small_Percent(0),"0%");
  Assert.equal(Format_Small_Percent(0.000000001),"<0.00000001%");
});

Test("modeled people and couples are a transparent assumption, not a live count", () => {
  const Flingster = Gender_Presets.flingster;
  const M = Calculate_Gender_Scenario(11800,Flingster.women,Flingster.couples);
  Assert.deepEqual([M.Men,M.Women,M.Couples],[8260,3540,0]);
  Assert.equal(M.Men+M.Women+M.Couples,M.Total);
  Assert.equal(M.Men_Pct,70);
  Assert.ok(Flingster.note.includes("not separately measured"));
  Assert.equal(Calculate_Gender_Scenario(100,80,30),null);
  Assert.equal(Calculate_Gender_Scenario(100,-1,0),null);
});

Test("modeled couples are possible and rounding never fabricates couples at 0%", () => {
  const A = Calculate_Gender_Scenario(99,30,0);
  Assert.equal(A.Couples,0);
  Assert.equal(A.Men+A.Women,99);
  const B = Calculate_Gender_Scenario(11800,25,10);
  Assert.deepEqual([B.Men,B.Women,B.Couples],[7670,2950,1180]);
  Assert.equal(B.Men+B.Women+B.Couples,11800);
  for(let T = 1; T < 100; T++) {
    const C = Calculate_Gender_Scenario(T,32,11);
    Assert.equal(C.Men+C.Women+C.Couples,T);
  }
});

Test("three gender presets have explicit source and separate couples assumption", () => {
  for(const Key of ["flingster","dirtyroulette","tinder"]) {
    const Preset = Gender_Presets[Key];
    Assert.ok(Preset.url.startsWith("https://"));
    Assert.ok(Preset.source);
    Assert.equal(Preset.couples,0);
  }
  Assert.equal(Gender_Presets.custom.couples,10);
  Assert.equal(Gender_Presets.custom.url,null);
});

Test("per-pool share uses each pool own total, not a combined inferred population", () => {
  const History = [{t:1000,n:54000,c:{US:10800,CA:2000},rooms:{Default:{n:21000,c:{US:3100,CA:200}}}}];
  const US = Compare_Pool_Representation("US",History);
  Assert.ok(US.Adult_Share>US.Default_Share);
  Assert.equal(US.Greater_Pool,"Adult");
  Assert.ok(US.Factor>1);
  Assert.equal(Compare_Pool_Representation("IL",History),null);
  Assert.equal(Compare_Pool_Representation("US",[]),null);
});

Test("World Bank latest population excludes aggregates and invalid/missing ISO2 values", () => {
  const Meta = [];
  const Indicators = [];
  for(let Index=0;Index<180;Index++) {
    const A=String.fromCharCode(65+Math.floor(Index/26));
    const B=String.fromCharCode(65+(Index%26));
    const Code=A+B;
    const Iso3=Code+"Z";
    Meta.push({id:Iso3,iso2Code:Code,region:{id:"ECS"}});
    Indicators.push({countryiso3code:Iso3,value:1000000+Index,date:"2025"});
  }
  Meta.push({id:"USA",iso2Code:"US",region:{id:"NAC"}});
  Meta.push({id:"ISR",iso2Code:"IL",region:{id:"MEA"}});
  Meta.push({id:"AFE",iso2Code:"ZH",region:{id:"NA"}});
  Indicators.push({countryiso3code:"USA",value:341784857,date:"2025"});
  Indicators.push({countryiso3code:"ISR",value:10122800,date:"2025"});
  Indicators.push({countryiso3code:"AFE",value:788844284,date:"2025"});
  const Data=Transform_Population_Response([{},Indicators],[{},Meta],"2026-10-21T00:00:00Z");
  Assert.equal(Data.by_country.US.value,341784857);
  Assert.equal(Data.by_country.IL.year,2025);
  Assert.equal(Data.by_country.ZH,undefined);
  Assert.ok(Object.keys(Data.by_country).length>=180);
  Assert.equal(Should_Refresh_Population(Data,Date.parse("2026-10-22T00:00:00Z")),false);
  Assert.equal(Should_Refresh_Population(Data,Date.parse("2026-12-22T00:00:00Z")),true);
  Assert.throws(()=>Transform_Population_Response([],[],"today"),/response/);
});

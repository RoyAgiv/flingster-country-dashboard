import Test from "node:test";
import Assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const Read_Repo_Text = (Path_Name) => readFile(new URL("../"+Path_Name,import.meta.url),"utf8");

Test("country details use a centered modal, not a side drawer, on desktop and mobile",async()=>{
  const Css=await Read_Repo_Text("assets/country-extras.css");
  Assert.match(Css,/\.Insight_Drawer\{[^}]*left:50%;top:50%;/s);
  Assert.match(Css,/transform:translate\(-50%,-50%\)/);
  Assert.match(Css,/width:min\(980px,calc\(100vw - 42px\)\)/);
  Assert.match(Css,/@media\(max-width:760px\)/);
  Assert.match(Css,/\.Insight_Detail_Grid\{display:grid;grid-template-columns/);
});

Test("country details show population as secondary context and estimates as scenarios",async()=>{
  const Frontend=await Read_Repo_Text("assets/country-extras.mjs");
  const Html=await Read_Repo_Text("index.html");
  const Insights=await Read_Repo_Text("assets/insights.mjs");
  for (const Element_Name of [
    "Country_Population_Value","Country_Population_Source",
    "Scenario_Select","Scenario_Source","Scenario_Women_Range","Scenario_Couples_Range",
    "Scenario_Men","Scenario_Women","Scenario_Couples","Country_Pool_Shares",
  ]) {
    Assert.ok(Frontend.includes(Element_Name),Element_Name);
  }
  Assert.match(Frontend,/SCENARIO · NOT LIVE DATA/);
  Assert.match(Frontend,/No source measures current country-level gender/);
  Assert.match(Frontend,/not a popularity ranking/);
  Assert.match(Insights,/countrypulse:country-open/);
  Assert.match(Html,/\.\/assets\/country-extras\.mjs/);
  Assert.match(Html,/\.\/assets\/country-extras\.css/);
});

Test("monthly World Bank publication does not interrupt normal half-hour collection",async()=>{
  const Workflow=await Read_Repo_Text(".github/workflows/collect-and-deploy.yml");
  Assert.match(Workflow,/7,37 \* \* \* \*/);
  Assert.match(Workflow,/node scripts\/collect\.mjs/);
  Assert.match(Workflow,/node scripts\/update-population\.mjs\s+continue-on-error: true/);
  Assert.match(Workflow,/git add -- data\/history\.json data\/population\.json/);
  Assert.match(Workflow,/cp data\/\*\.json _site\/data\//);
  Assert.match(Workflow,/git push origin HEAD:main/);
});

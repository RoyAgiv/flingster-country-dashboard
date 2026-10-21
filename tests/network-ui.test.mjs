import Test from "node:test";
import Assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Known_Brands, Shared_Alias, Find_Exact_Dataset_Groups } from "../assets/network-utils.mjs";

const Read_Repo_File = (Name) => readFile(new URL("../"+Name,import.meta.url),"utf8");

Test("Network Explorer is optional and does not crowd the existing home dashboard",async()=>{
  const Html = await Read_Repo_File("index.html");
  const Script = await Read_Repo_File("assets/network-explorer.mjs");
  const Css = await Read_Repo_File("assets/network-explorer.css");
  Assert.match(Html,/\.\/assets\/network-explorer\.css/);
  Assert.match(Html,/\.\/assets\/network-explorer\.mjs/);
  Assert.match(Script,/document\.createElement\("details"\)/);
  Assert.match(Script,/\.Content_Grid/);
  Assert.match(Script,/Never add their totals/);
  Assert.match(Script,/Network_Exact_Groups/);
  Assert.match(Script,/data\/network\.json/);
  Assert.match(Css,/@media\(max-width:670px\)/);
});

Test("seven brands appear, with six measured sources and one known shared alias",()=>{
  Assert.equal(Known_Brands.length,6);
  Assert.equal(Known_Brands.length+1,7);
  Assert.equal(Shared_Alias.Id,"dirtyroulette");
  Assert.equal(Shared_Alias.Source,"Flingster Adult");
  Assert.ok(Known_Brands.every((Brand)=>Brand.Host==="rest."+Brand.Domain));
});

Test("GitHub scheduling stores both geographic history and validated network config",async()=>{
  const Workflow = await Read_Repo_File(".github/workflows/collect-and-deploy.yml");
  Assert.match(Workflow,/7,37 \* \* \* \*/);
  Assert.match(Workflow,/node scripts\/collect\.mjs/);
  Assert.match(Workflow,/node scripts\/collect-network\.mjs/);
  Assert.match(Workflow,/continue-on-error: true/);
  Assert.match(Workflow,/data\/network\.json/);
  Assert.match(Workflow,/cp data\/\*\.json _site\/data\//);
  Assert.match(Workflow,/git push origin HEAD:main/);
});

Test("sampled brands are grouped only by a full identical geographic fingerprint",async()=>{
  const Network = JSON.parse(await Read_Repo_File("data/network.json"));
  Assert.equal(Network.schema,1);
  Assert.ok(Array.isArray(Network.snapshots));
  Assert.ok(Array.isArray(Network.config_history));
  const Latest = Network.snapshots.at(-1);
  Assert.ok(Latest?.t>0 && Object.keys(Latest.brands).length>=2);
  for(const Data of Object.values(Latest.brands)){
    for(const Pool of ["default","combined"]){
      Assert.ok(Data[Pool].n>0);
      Assert.ok(Data[Pool].countries>=20);
      Assert.match(Data[Pool].fingerprint,/^[a-f0-9]{64}$/);
    }
    Assert.ok(Data.members>1000);
  }
  const Groups=Find_Exact_Dataset_Groups(Latest.brands,"combined");
  Assert.ok(Array.isArray(Groups));
  Assert.ok(Groups.every((Group)=>Group.length>1));
});

Test("daily settings exclude visitor country and safely record Chatspin rewards",async()=>{
  const Network = JSON.parse(await Read_Repo_File("data/network.json"));
  const Current = Network.config_history.at(-1);
  Assert.ok(Current && Current.brands?.flingster);
  Assert.equal(Current.brands.flingster.Name,"Flingster");
  Assert.equal(Current.brands.flingster.UserCountry,undefined);
  const Chatspin=Current.brands.chatspin;
  Assert.equal(Chatspin?.Name,"Chatspin");
  Assert.equal(Chatspin?.TokensEnabled,true);
  Assert.equal(Chatspin?.Rewards?.DailyLoginBonus,"25");
});

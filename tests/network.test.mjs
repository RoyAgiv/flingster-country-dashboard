import Test from "node:test";
import Assert from "node:assert/strict";
import {
  Known_Brands, Shared_Alias, Validate_Brand_Identity,
  Validate_Live_Brand_Reading, Sanitize_Brand_Config,
  Find_Exact_Dataset_Groups, Summarize_Network_Overlap,
  Compare_Config_States,
} from "../assets/network-utils.mjs";
import {
  Country_Fingerprint, Summarize_Brand_Reading,
  Merge_Network_Document, Fetch_Brand_Config, Fetch_Brand_Pool,
} from "../scripts/collect-network.mjs";

const Brand = Known_Brands[0];
const Countries = Object.fromEntries(Array.from({length:26},(_,Index)=>[
  String.fromCharCode(65+Math.floor(Index/26),65+Index%26),Index+1]));
const Good_Config = Object.fromEntries(Array.from({length:31},(_,Index)=>["Prop_"+Index,true]));
Good_Config.Name = "Flingster";
Good_Config.MultiCountrySelection = true;
Good_Config.VIPName = "VIP";
Good_Config.TokensEnabled = false;
Good_Config.UserCountry = "IL";
const Good_Metadata = { ALL:0, Members:33579063, Tags:Array.from({length:17},(_,Index)=>"interest"+Index) };
const Good_Reading = {t:100000,n:351,c:Countries,members:33579065,tags:["flirt","roleplay"]};

Test("known brands are whitelisted and DirtyRoulette is explicitly an alias",()=>{
  Assert.equal(Known_Brands.length,6);
  Assert.equal(new Set(Known_Brands.map((Entry)=>Entry.Domain)).size,6);
  Assert.equal(Shared_Alias.Kind,"shared-adult");
  Assert.equal(Shared_Alias.Source,"Flingster Adult");
  Assert.equal(Known_Brands.some((Entry)=>Entry.Domain==="dirtyroulette.com"),false);
});

Test("recognizes genuine brand metadata, refuses HTTP-200 fallback and origin mismatch",()=>{
  Assert.equal(Validate_Brand_Identity(Brand,Good_Config,Good_Metadata).Valid,true);
  Assert.equal(Validate_Brand_Identity(Brand,Good_Config,{...Good_Metadata,Members:3}).Valid,false);
  Assert.equal(Validate_Brand_Identity(Brand,{...Good_Config,Name:"Shagle"},Good_Metadata).Reason,"identity_mismatch");
  Assert.equal(Validate_Brand_Identity(Brand,Good_Config,{...Good_Metadata,ALL:10}).Reason,"metadata_unexpected");
  Assert.equal(Validate_Brand_Identity({Id:"unknown",Expected_Name:"Flingster"},Good_Config,Good_Metadata).Valid,false);
  Assert.equal(Validate_Live_Brand_Reading(Good_Reading,Good_Metadata),true);
  Assert.equal(Validate_Live_Brand_Reading({...Good_Reading,members:3}),false);
  Assert.equal(Validate_Live_Brand_Reading({...Good_Reading,n:352}),false);
  Assert.equal(Validate_Live_Brand_Reading(Good_Reading,{...Good_Metadata,Members:28000000}),false);
});

Test("only stores safe, meaningful configuration, excluding volatile visitor identity",()=>{
  const Safe = Sanitize_Brand_Config(Brand,{...Good_Config,FacebookAppId:"secret",AppleClientId:"secret",CRules:[1,2]});
  Assert.equal(Safe.Name,"Flingster");
  Assert.equal(Safe.Field_Count,39);
  Assert.equal(Safe.MultiCountrySelection,true);
  Assert.equal(Safe.VIPName,"VIP");
  Assert.equal(Safe.UserCountry,undefined);
  Assert.equal(Safe.FacebookAppId,undefined);
  Assert.equal(Safe.CRules,undefined);
  const Chatspin = Known_Brands.find((Item)=>Item.Id==="chatspin");
  const Rewards = Sanitize_Brand_Config(Chatspin,{
    Name:"Chatspin",TokensEnabled:true,
    TokensConfig:{DailyLoginBonus:"25",ChattingBonus:"5",ChattingBonusInterval:"45",ChattingBonusMaxDaily:"500",PrivateToken:"abc"},
  });
  Assert.deepEqual(Object.keys(Rewards.Rewards).sort(),
    ["ChattingBonus","ChattingBonusInterval","ChattingBonusMaxDaily","DailyLoginBonus"]);
});

Test("country fingerprints are deterministic and detect only identical COUNTRY datasets",()=>{
  const Reordered=Object.fromEntries(Object.entries(Countries).reverse());
  const Fingerprint=Country_Fingerprint(Countries);
  Assert.equal(Fingerprint,Country_Fingerprint(Reordered));
  Assert.notEqual(Fingerprint,Country_Fingerprint({...Countries,AA:999}));
  Assert.match(Fingerprint,/^[a-f0-9]{64}$/);
  const Summary=Summarize_Brand_Reading(Good_Reading);
  Assert.equal(Summary.fingerprint,Fingerprint);
  Assert.equal(Summary.n,351);
  const Brands={
    shagle:{default:{n:351,fingerprint:Fingerprint}},
    camgo:{default:{n:351,fingerprint:Fingerprint}},
    chatrandom:{default:{n:351,fingerprint:Country_Fingerprint({...Countries,AA:999})}},
    camsurf:{default:{n:352,fingerprint:Fingerprint}},
  };
  Assert.deepEqual(Find_Exact_Dataset_Groups(Brands,"default"),[["camgo","shagle"]]);
  Assert.deepEqual(Find_Exact_Dataset_Groups(Brands,"combined"),[]);
  Assert.equal(Summarize_Network_Overlap(Brands,"default").Available,4);
});

Test("configuration comparisons ignore excluded volatile identity and track changes",()=>{
  const First=Sanitize_Brand_Config(Brand,{...Good_Config,UserCountry:"IL"});
  const Second=Sanitize_Brand_Config(Brand,{...Good_Config,UserCountry:"US"});
  Assert.deepEqual(Compare_Config_States(First,Second),[]);
  const Third={...Second,MultiCountrySelection:false};
  Assert.deepEqual(Compare_Config_States(First,Third),["MultiCountrySelection"]);
});

Test("rolling history preserves snapshots and merges same-day config without mutating the input",()=>{
  const Current=100*86400;
  const Initial={schema:1,snapshots:[
    {t:Current-47*86400,brands:{flingster:{}}},
    {t:Current-3600,brands:{flingster:{}}},
  ],config_history:[{
    t:Current-3600,day:new Date((Current-3600)*1000).toISOString().slice(0,10),
    brands:{flingster:{Name:"Flingster"}},
  }]};
  const Latest_Day=new Date((Current-3600)*1000).toISOString().slice(0,10);
  const Data=Merge_Network_Document(Initial,{
    t:Current,brands:{flingster:{},camgo:{}},
  },{
    t:Current,day:Latest_Day,brands:{chatspin:{Name:"Chatspin"}},
  },Current);
  Assert.equal(Data.snapshots.length,2);
  Assert.equal(Data.config_history.length,1);
  Assert.equal(Data.config_history[0].brands.chatspin.Name,"Chatspin");
  Assert.equal(Initial.config_history[0].brands.chatspin,undefined);
  const Repeat=Merge_Network_Document(Data,{t:Current+60,brands:{flingster:{},camgo:{}}},null,Current+60);
  Assert.equal(Repeat.snapshots.length,2);
});

Test("requests matching X-Origin and refuses metadata fallback in a read-only mock",async()=>{
  let Requests=[];
  const Mock_Fetch=async(Url,Options)=>{
    Requests.push({Url,Headers:Options.headers});
    const Path=new URL(Url).pathname;
    let Payload;
    if(Path==="/config")Payload=Good_Config;
    else if(Path==="/onlineCountries")Payload=Good_Metadata;
    else Payload=null;
    if(Payload)return {ok:true,text:async()=>JSON.stringify(Payload)};
    const Html='<script>window.parent.postMessage({"xhrl":"online","xhrd":'+JSON.stringify({
      ALL:351,...Countries,Members:33579065,Tags:["flirt"]
    })+',"xhrh":{}},"*")</script>';
    return {ok:true,text:async()=>Html};
  };
  const Result=await Fetch_Brand_Config(Brand,Mock_Fetch);
  Assert.equal(Result.configuration.Name,"Flingster");
  const Reading=await Fetch_Brand_Pool(Brand,"Combined",Result.metadata,Mock_Fetch);
  Assert.equal(Reading.n,351);
  Assert.equal(new URL(Requests.at(-1).Url).searchParams.get("room"),"Default,Adult");
  Assert.ok(Requests.every((Request)=>Request.Headers["x-origin"]==="flingster.com"));
  Assert.ok(Requests.every((Request)=>Request.Headers.referer==="https://flingster.com/"));
  Assert.equal(Requests.length,3);
});

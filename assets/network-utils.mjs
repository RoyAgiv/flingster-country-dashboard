export const Known_Brands = [
  { Id:"flingster", Name:"Flingster", Domain:"flingster.com", Host:"rest.flingster.com", Expected_Name:"Flingster", Url:"https://flingster.com/" },
  { Id:"chatrandom", Name:"Chatrandom", Domain:"chatrandom.com", Host:"rest.chatrandom.com", Expected_Name:"Chatrandom", Url:"https://chatrandom.com/" },
  { Id:"camsurf", Name:"Camsurf", Domain:"camsurf.com", Host:"rest.camsurf.com", Expected_Name:"Camsurf", Url:"https://camsurf.com/" },
  { Id:"shagle", Name:"Shagle", Domain:"shagle.com", Host:"rest.shagle.com", Expected_Name:"Shagle", Url:"https://shagle.com/" },
  { Id:"camgo", Name:"Camgo", Domain:"camgo.com", Host:"rest.camgo.com", Expected_Name:"Camgo", Url:"https://camgo.com/" },
  { Id:"chatspin", Name:"Chatspin", Domain:"chatspin.com", Host:"rest.chatspin.com", Expected_Name:"Chatspin", Url:"https://chatspin.com/" },
];
export const Shared_Alias = {
  Id:"dirtyroulette", Name:"DirtyRoulette", Domain:"dirtyroulette.com",
  Url:"https://dirtyroulette.com/", Source:"Flingster Adult", Kind:"shared-adult",
};

export const Brand_Config_Fields = [
  "MultiCountrySelection", "Signup", "Trial", "TokensEnabled", "VIPName",
  "UseFaceDetector",
];

export const Rewards_Fields = [
  "DailyLoginBonus","ChattingBonus","ChattingBonusInterval","ChattingBonusMaxDaily",
  "BonusForReferree","Cost_country","Cost_gender",
];

export function Validate_Brand_Identity(Brand, Config, Metadata) {
  if (!Known_Brands.some((Entry)=>Entry.Id===Brand?.Id)) return {Valid:false,Reason:"unknown_brand"};
  if (!Config || typeof Config!=="object" || Array.isArray(Config) ||
      Config.Name!==Brand.Expected_Name || Object.keys(Config).length<20) {
    return {Valid:false,Reason:"identity_mismatch"};
  }
  if (!Metadata || typeof Metadata!=="object" || Array.isArray(Metadata) ||
      !Number.isSafeInteger(Metadata.Members) || Metadata.Members<1000 ||
      !Array.isArray(Metadata.Tags) || Metadata.Tags.length<5) {
    return {Valid:false,Reason:"metadata_fallback"};
  }
  // Metadata ALL:0 has never been a usable live counter. Do not use it as one.
  if (Metadata.ALL!==0) return {Valid:false,Reason:"metadata_unexpected"};
  return {Valid:true,Reason:"validated"};
}

export function Validate_Live_Brand_Reading(Reading, Metadata=null) {
  if (!Reading || !Number.isSafeInteger(Reading.n) || Reading.n<=0 ||
      !Reading.c || typeof Reading.c!=="object" || Array.isArray(Reading.c) ||
      Object.keys(Reading.c).length<20 || !Number.isSafeInteger(Reading.members) ||
      Reading.members<1000) return false;
  if (Object.entries(Reading.c).some(([Code,Count])=>
      !/^[A-Z]{2}$/.test(Code)||!Number.isSafeInteger(Count)||Count<0)) return false;
  if (Object.values(Reading.c).reduce((Sum,Count)=>Sum+Count,0)!==Reading.n) return false;
  if (Metadata?.Members && Math.abs(Reading.members-Metadata.Members)/Metadata.Members>0.02) return false;
  return true;
}

export function Sanitize_Brand_Config(Brand, Config) {
  if (Config?.Name!==Brand.Expected_Name) throw Error("config identity mismatch: "+Brand.Id);
  const Result={Name:Config.Name,Field_Count:Object.keys(Config).length};
  for(const Field of Brand_Config_Fields){
    const Value=Config[Field];
    if(typeof Value==="boolean")Result[Field]=Value;
    else if(typeof Value==="string" && Value.length<=100)Result[Field]=Value;
  }
  if(Config.TokensEnabled===true && Config.TokensConfig &&
      typeof Config.TokensConfig==="object" && !Array.isArray(Config.TokensConfig)){
    const Rewards={};
    for(const Field of Rewards_Fields){
      const Value=Config.TokensConfig[Field];
      if((typeof Value==="number" && Number.isFinite(Value)) ||
         (typeof Value==="string" && /^[0-9]{1,10}$/.test(Value))){
        Rewards[Field]=String(Value);
      }
    }
    if(Object.keys(Rewards).length)Result.Rewards=Rewards;
  }
  return Result;
}

export function Find_Exact_Dataset_Groups(Brands, Pool="default") {
  if(!["default","combined"].includes(Pool))return [];
  const Group_Map=new Map();
  for(const [Brand_Id,Brand] of Object.entries(Brands||{})){
    const Reading=Brand?.[Pool];
    if(!Reading||!Number.isSafeInteger(Reading.n)||Reading.n<=0 ||
       typeof Reading.fingerprint!=="string"||
       !/^[a-f0-9]{64}$/.test(Reading.fingerprint))continue;
    const Key=String(Reading.n)+":"+Reading.fingerprint;
    const Group=Group_Map.get(Key)||[];
    Group.push(Brand_Id);
    Group_Map.set(Key,Group);
  }
  return [...Group_Map.values()].filter((Group)=>Group.length>1)
    .map((Group)=>Group.sort())
    .sort((First,Second)=>Second.length-First.length);
}

export function Summarize_Network_Overlap(Brands, Pool="default") {
  const Readings=Object.values(Brands||{}).map((Brand)=>Brand?.[Pool])
    .filter((Reading)=>Reading&&Number.isSafeInteger(Reading.n)&&Reading.n>0);
  if(!Readings.length)return {Available:0,Min:null,Max:null,Spread_Pct:null};
  const Counts=Readings.map((Reading)=>Reading.n).sort((First,Second)=>First-Second);
  const Middle=Math.floor(Counts.length/2);
  const Median=Counts.length%2?Counts[Middle]:(Counts[Middle-1]+Counts[Middle])/2;
  return {
    Available:Readings.length,Min:Counts[0],Max:Counts.at(-1),
    Spread_Pct:Math.round((Counts.at(-1)-Counts[0])/Math.max(1,Median)*1000)/10,
  };
}

export function Compare_Config_States(Previous, Current) {
  if(!Previous||!Current)return [];
  const Fields=new Set([...Object.keys(Previous),...Object.keys(Current)]);
  Fields.delete("Field_Count");
  // Registration counters are not app feature settings; track them separately.
  Fields.delete("Metadata_Members");
  return [...Fields].filter((Field)=>JSON.stringify(Previous[Field])!==JSON.stringify(Current[Field])).sort();
}

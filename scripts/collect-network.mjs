import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Parse_Online_Response } from "./collect.mjs";
import {
  Known_Brands, Validate_Brand_Identity, Validate_Live_Brand_Reading,
  Sanitize_Brand_Config,
} from "../assets/network-utils.mjs";

export const Network_Path = resolve(dirname(fileURLToPath(import.meta.url)), "../data/network.json");
export const Network_History_Days = 45;
export const Config_History_Days = 90;
export const Snapshot_Min_Gap_Seconds = 25 * 60;

export function Country_Fingerprint(Country_Values) {
  const Normalized = Object.entries(Country_Values || {})
    .filter(([Code, Count]) => /^[A-Z]{2}$/.test(Code) && Number.isSafeInteger(Count))
    .sort(([First], [Second]) => First.localeCompare(Second));
  return createHash("sha256").update(JSON.stringify(Normalized)).digest("hex");
}

export function Summarize_Brand_Reading(Reading) {
  if (!Validate_Live_Brand_Reading(Reading)) throw Error("invalid online data or fallback response");
  return {
    n: Reading.n, countries: Object.keys(Reading.c).length,
    fingerprint: Country_Fingerprint(Reading.c),
  };
}

export function Merge_Network_Document(Existing_Document, New_Snapshot = null,
    New_Config_Entry = null, Now_Seconds = Math.floor(Date.now() / 1000)) {
  if (!Existing_Document || Existing_Document.schema !== 1 ||
      !Array.isArray(Existing_Document.snapshots) ||
      !Array.isArray(Existing_Document.config_history)) {
    throw Error("Unsupported Network Explorer history schema");
  }
  const Snapshot_Cutoff = Now_Seconds - Network_History_Days * 86400;
  const Config_Cutoff = Now_Seconds - Config_History_Days * 86400;
  const Snapshots = Existing_Document.snapshots
    .filter((Entry) => Number.isSafeInteger(Entry?.t) && Entry.t >= Snapshot_Cutoff &&
      Entry.t <= Now_Seconds + 60 && Entry.brands && typeof Entry.brands === "object")
    .sort((First, Second) => First.t - Second.t);
  const Config_History = Existing_Document.config_history
    .filter((Entry) => Number.isSafeInteger(Entry?.t) && Entry.t >= Config_Cutoff &&
      Entry.t <= Now_Seconds + 60 && /^\d{4}-\d{2}-\d{2}$/.test(Entry.day||"") &&
      Entry.brands && typeof Entry.brands === "object")
    .map((Entry)=>({ ...Entry, brands:{...Entry.brands} }))
    .sort((First,Second)=>First.t-Second.t);
  const Latest_Snapshot = Snapshots.at(-1);
  if (New_Snapshot && Number.isSafeInteger(New_Snapshot.t) &&
      New_Snapshot.t <= Now_Seconds + 60 &&
      Object.keys(New_Snapshot.brands || {}).length >= 2 &&
      (!Latest_Snapshot || (New_Snapshot.t - Latest_Snapshot.t >= Snapshot_Min_Gap_Seconds &&
        Math.floor(New_Snapshot.t/1800)!==Math.floor(Latest_Snapshot.t/1800)))) {
    Snapshots.push(New_Snapshot);
  }
  if (New_Config_Entry && Object.keys(New_Config_Entry.brands||{}).length >= 1 &&
      Number.isSafeInteger(New_Config_Entry.t)) {
    const Latest_Config = Config_History.at(-1);
    if (Latest_Config && Latest_Config.day === New_Config_Entry.day) {
      // Allow a single temporarily unavailable brand to be filled in later that day.
      Latest_Config.brands = { ...Latest_Config.brands, ...New_Config_Entry.brands };
      Latest_Config.t = Math.max(Latest_Config.t, New_Config_Entry.t);
    } else if (Object.keys(New_Config_Entry.brands).length >= 2) {
      Config_History.push(New_Config_Entry);
    }
  }
  return {
    schema: 1,
    description: "Brand-specific metadata and potentially overlapping, provider-reported country statistics. Never sum as unique people.",
    snapshots: Snapshots.slice(-(Network_History_Days * 48 + 48)),
    config_history: Config_History.slice(-Config_History_Days),
  };
}

async function Fetch_With_Retry(Url, Brand, Accept, Fetch_Function = fetch) {
  let Last_Error = null;
  for (let Attempt = 1; Attempt <= 2; Attempt++) {
    try {
      const Response = await Fetch_Function(Url, {
        method: "GET", redirect: "follow", signal: AbortSignal.timeout(16000),
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; CountryPulse-Network/1.0)",
          "x-origin": Brand.Domain,
          referer: Brand.Url,
          accept: Accept,
        },
      });
      if (!Response.ok) throw Error("HTTP " + Response.status);
      const Raw = await Response.text();
      if (Raw.length > 5_000_000) throw Error("Response exceeds size limit");
      return Raw;
    } catch (Error_Object) {
      Last_Error = Error_Object;
      if (Attempt < 2) await new Promise((Resolve)=>setTimeout(Resolve, 400));
    }
  }
  throw Last_Error;
}

async function Fetch_Json(Url, Brand, Fetch_Function = fetch) {
  const Raw = await Fetch_With_Retry(Url, Brand, "application/json,text/html,*/*;q=0.8", Fetch_Function);
  if (Raw.length > 1_500_000) throw Error("Unreasonably large metadata response");
  return JSON.parse(Raw);
}

export async function Fetch_Brand_Config(Brand, Fetch_Function = fetch) {
  if (!Known_Brands.some((Known) => Known.Id === Brand?.Id)) throw Error("Unknown network brand");
  const Config = await Fetch_Json("https://" + Brand.Host + "/config?lang=en", Brand, Fetch_Function);
  const Metadata = await Fetch_Json("https://" + Brand.Host + "/onlineCountries?lang=en", Brand, Fetch_Function);
  const Validation = Validate_Brand_Identity(Brand, Config, Metadata);
  if (!Validation.Valid) throw Error("Brand identity invalid: " + Validation.Reason + " (" + Brand.Id + ")");
  return {
    configuration: {
      ...Sanitize_Brand_Config(Brand, Config),
      Tags_Count: Metadata.Tags.length,
      Suggested_Tags: [...new Set(Metadata.Tags.filter((Tag) =>
        typeof Tag === "string" && /^[a-z0-9-]{1,48}$/i.test(Tag)))].slice(0,80),
      Metadata_Members: Metadata.Members,
    },
    metadata: Metadata,
  };
}

export async function Fetch_Brand_Pool(Brand, Pool, Metadata = null, Fetch_Function = fetch) {
  if (!Known_Brands.some((Known)=>Known.Id===Brand?.Id)) throw Error("Unknown network brand");
  if (!["Default","Combined"].includes(Pool)) throw Error("Unsupported network activity pool");
  const Request_Url = new URL("https://" + Brand.Host + "/xhr.html");
  Request_Url.searchParams.set("v","2");
  Request_Url.searchParams.set("online","1");
  Request_Url.searchParams.set("room",Pool==="Default"?"Default":"Default,Adult");
  Request_Url.searchParams.set("config","1");
  Request_Url.searchParams.set("lang","en");
  Request_Url.searchParams.set("ver",String(Date.now()));
  const Raw = await Fetch_With_Retry(Request_Url.toString(), Brand, "text/html,*/*;q=0.8", Fetch_Function);
  const Reading = Parse_Online_Response(Raw);
  if (!Validate_Live_Brand_Reading(Reading, Metadata)) {
    throw Error("Invalid brand pool data, fallback, or mismatch: " + Brand.Id);
  }
  return Reading;
}

export async function Collect_Network(Fetch_Function = fetch, Now = new Date()) {
  const Now_Seconds = Math.floor(Now.getTime() / 1000);
  const Day = Now.toISOString().slice(0,10);
  const Raw = await readFile(Network_Path,"utf8");
  const Existing_Document = JSON.parse(Raw);
  if (Existing_Document.schema!==1 || !Array.isArray(Existing_Document.snapshots) ||
      !Array.isArray(Existing_Document.config_history)) throw Error("Invalid network history file");
  const Previous_Snapshot = Existing_Document.snapshots.at(-1);
  const Previous_Config = Existing_Document.config_history.at(-1);
  const Snapshot_Due = !Previous_Snapshot || (Now_Seconds-Previous_Snapshot.t>=Snapshot_Min_Gap_Seconds &&
    Math.floor(Now_Seconds/1800)!==Math.floor(Previous_Snapshot.t/1800));
  const Config_Due = !Previous_Config || Previous_Config.day!==Day ||
    Object.keys(Previous_Config.brands||{}).length<Known_Brands.length;
  if (!Snapshot_Due && !Config_Due) {
    console.log("NETWORK_SKIPPED: Snapshot is too recent; today's config is already recorded");
    return false;
  }
  const Brand_Results = await Promise.allSettled(Known_Brands.map(async (Brand) => {
    // Verify brand identity in the lightweight app config every collection cycle.
    const Config = await Fetch_Json("https://" + Brand.Host + "/config?lang=en",Brand,Fetch_Function);
    if (Config.Name!==Brand.Expected_Name || Object.keys(Config||{}).length<20) {
      throw Error("identity_mismatch");
    }
    let Metadata = null;
    let Config_Entry = null;
    if (Config_Due) {
      Metadata = await Fetch_Json("https://" + Brand.Host + "/onlineCountries?lang=en",Brand,Fetch_Function);
      const Validation = Validate_Brand_Identity(Brand,Config,Metadata);
      if (!Validation.Valid) throw Error(Validation.Reason);
      Config_Entry = {
        ...Sanitize_Brand_Config(Brand,Config),
        Tags_Count: Metadata.Tags.length,
        Suggested_Tags: [...new Set(Metadata.Tags.filter((Tag)=>
          typeof Tag === "string" && /^[a-z0-9-]{1,48}$/i.test(Tag)))].slice(0,80),
        Metadata_Members: Metadata.Members,
      };
    }
    if (!Snapshot_Due) return {Brand,Config_Entry};
    const [Default_Reading, Combined_Reading] = await Promise.all([
      Fetch_Brand_Pool(Brand,"Default",Metadata,Fetch_Function),
      Fetch_Brand_Pool(Brand,"Combined",Metadata,Fetch_Function),
    ]);
    return {
      Brand, Config_Entry,
      Sample: {
        members: Default_Reading.members,
        default: Summarize_Brand_Reading(Default_Reading),
        combined: Summarize_Brand_Reading(Combined_Reading),
      },
    };
  }));
  const Brand_Samples = {};
  const Config_Brands = {};
  const Failures = [];
  Brand_Results.forEach((Result, Index) => {
    const Brand = Known_Brands[Index];
    if (Result.status !== "fulfilled") {
      const Error_Message = String(Result.reason?.message || "unavailable");
      const Reason = Error_Message.includes("identity") ? "identity_mismatch" :
        Error_Message.includes("fallback") || Error_Message.includes("metadata") ? "metadata_invalid" :
        Error_Message.includes("HTTP") ? "http_error" : "unavailable";
      Failures.push({brand:Brand.Id,reason:Reason});
      return;
    }
    if (Result.value.Config_Entry) Config_Brands[Brand.Id] = Result.value.Config_Entry;
    if (Result.value.Sample) Brand_Samples[Brand.Id] = Result.value.Sample;
  });
  if (Snapshot_Due && Object.keys(Brand_Samples).length<2) {
    throw Error("NETWORK_UNVERIFIED: fewer than two validated brand feeds; keeping existing history");
  }
  const Snapshot = Snapshot_Due ? {
    t:Now_Seconds, brands:Brand_Samples, failures:Failures,
  } : null;
  const Config_Entry = Config_Due && Object.keys(Config_Brands).length>=2 ? {
    t:Now_Seconds, day:Day, brands:Config_Brands,
  } : null;
  if (!Snapshot && !Config_Entry) {
    console.log("NETWORK_SKIPPED: no verified changes");
    return false;
  }
  const Next_Document = Merge_Network_Document(Existing_Document,Snapshot,Config_Entry,Now_Seconds);
  if (JSON.stringify(Next_Document)===JSON.stringify(Existing_Document)) {
    console.log("NETWORK_SKIPPED: no new verified network data");
    return false;
  }
  await mkdir(dirname(Network_Path),{recursive:true});
  const Temporary_Path=Network_Path+".tmp";
  await writeFile(Temporary_Path,JSON.stringify(Next_Document)+"\n",{encoding:"utf8",mode:0o644});
  await rename(Temporary_Path,Network_Path);
  console.log("NETWORK_CAPTURED: " + Now.toISOString() +
    "; validated brands=" + Object.keys(Brand_Samples).length +
    "; config today=" + Object.keys(Config_Brands).length +
    "; snapshot count=" + Next_Document.snapshots.length +
    "; unavailable=" + Failures.length);
  return true;
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  Collect_Network().catch((Error_Object)=>{
    console.error("NETWORK_COLLECT_FAILED: "+Error_Object.message);
    process.exitCode=1;
  });
}

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const Source_Url = "https://rest.flingster.com/xhr.html?v=2&online=1&room=Adult&config=1&lang=en";
export const History_Path = resolve(dirname(fileURLToPath(import.meta.url)), "../data/history.json");
export const Retention_Days = 45;
export const Min_Snapshot_Gap_Seconds = 25 * 60;
export const Pool_Names = ["Adult", "Default", "Combined"];

export function Parse_Online_Response(Html_Text, Timestamp_Seconds = Math.floor(Date.now() / 1000)) {
  if (typeof Html_Text !== "string" || Html_Text.length > 5_000_000) {
    throw new Error("Invalid online response size");
  }
  const Match = Html_Text.match(/"xhrl"\s*:\s*"online"\s*,\s*"xhrd"\s*:\s*(\{[\s\S]*?\})\s*,\s*"xhrh"\s*:/);
  if (!Match) throw new Error("Site did not return an online-count payload");
  // JSON.parse silently keeps the *last* occurrence of a duplicate country key.
  // Reject ambiguous source payloads instead of guessing which value was intended.
  const Raw_Country_Codes = [...Match[1].matchAll(/"([A-Z]{2})"\s*:/g)]
    .map((Entry) => Entry[1]);
  if (new Set(Raw_Country_Codes).size !== Raw_Country_Codes.length) {
    throw new Error("Country count reconciliation failed: duplicate country code in provider payload");
  }
  const Payload = JSON.parse(Match[1]);
  if (!Number.isSafeInteger(Payload.ALL) || Payload.ALL <= 0) {
    throw new Error("Missing or invalid worldwide total");
  }
  if (Object.hasOwn(Payload, "Members") &&
      (!Number.isSafeInteger(Payload.Members) || Payload.Members < 1000)) {
    throw new Error("Fallback or invalid registered-member counter");
  }
  const Country_Entries = Object.entries(Payload)
    .filter(([Country_Code, Count]) => /^[A-Z]{2}$/.test(Country_Code) && Number.isSafeInteger(Count) && Count >= 0)
    .sort(([First_Code], [Second_Code]) => First_Code.localeCompare(Second_Code));
  const Total_From_Countries = Country_Entries.reduce((Sum, [, Count]) => Sum + Count, 0);
  if (Country_Entries.length < 20 || Total_From_Countries !== Payload.ALL) {
    throw new Error("Country count reconciliation failed: country sum " +
      Total_From_Countries + " differs from reported ALL " + Payload.ALL +
      " (" + Country_Entries.length + " country entries)");
  }
  const Snapshot = { t: Timestamp_Seconds, n: Payload.ALL, c: Object.fromEntries(Country_Entries) };
  if (Number.isSafeInteger(Payload.Members) && Payload.Members > 0) Snapshot.members = Payload.Members;
  if (Array.isArray(Payload.Tags)) {
    Snapshot.tags = [...new Set(Payload.Tags.filter((Tag) => typeof Tag === "string" && /^[a-z0-9-]{1,48}$/i.test(Tag)))].slice(0, 80);
  }
  return Snapshot;
}

export function Merge_Snapshot_History(Existing_History, New_Snapshot, Now_Seconds = Math.floor(Date.now() / 1000)) {
  if (!Existing_History || Existing_History.schema !== 1 || !Array.isArray(Existing_History.snapshots)) {
    throw new Error("Unsupported country history schema");
  }
  if (!Number.isSafeInteger(New_Snapshot.t) || !Number.isSafeInteger(New_Snapshot.n) || !New_Snapshot.c) {
    throw new Error("Invalid incoming snapshot");
  }
  const Cutoff_Seconds = Now_Seconds - Retention_Days * 86400;
  const Retained_Snapshots = Existing_History.snapshots
    .filter((Snapshot) => Snapshot && Number.isSafeInteger(Snapshot.t) && Snapshot.t >= Cutoff_Seconds &&
      Snapshot.t <= Now_Seconds + 60 && Number.isSafeInteger(Snapshot.n) && Snapshot.n > 0 &&
      Snapshot.c && typeof Snapshot.c === "object" && !Array.isArray(Snapshot.c))
    .sort((First, Second) => First.t - Second.t);
  const Latest_Snapshot = Retained_Snapshots.at(-1);
  if (Latest_Snapshot && (New_Snapshot.t <= Latest_Snapshot.t ||
    New_Snapshot.t - Latest_Snapshot.t < Min_Snapshot_Gap_Seconds ||
    Math.floor(New_Snapshot.t / 1800) === Math.floor(Latest_Snapshot.t / 1800))) {
    return { ...Existing_History, snapshots: Retained_Snapshots };
  }
  Retained_Snapshots.push(New_Snapshot);
  return {
    schema: 1,
    source: Source_Url,
    snapshots: Retained_Snapshots.slice(-(Retention_Days * 48 + 48)),
  };
}

export async function Fetch_Online_Response(Fetch_Function = fetch, Room = "Adult", Host_Name = "rest.flingster.com") {
  if (!Pool_Names.includes(Room)) throw new Error("Unsupported activity pool");
  if (!["rest.flingster.com", "rest2.flingster.com", "api.flingster.com"].includes(Host_Name)) {
    throw new Error("Unsupported statistics host");
  }
  const Request_Url = new URL(Source_Url);
  Request_Url.hostname = Host_Name;
  Request_Url.searchParams.set("room", Room === "Combined" ? "Adult,Default" : Room);
  Request_Url.searchParams.set("ver", String(Date.now()));
  let Last_Error = null;
  for (let Attempt = 1; Attempt <= 3; Attempt++) {
    try {
      const Response = await Fetch_Function(Request_Url.toString(), {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(18000),
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; CountryPulse/1.2)",
          referer: "https://flingster.com/",
          "x-origin": "flingster.com",
          accept: "text/html,*/*;q=0.8",
        },
      });
      if (!Response.ok) throw new Error("Source returned HTTP " + Response.status);
      const Html_Text = await Response.text();
      return Parse_Online_Response(Html_Text);
    } catch (Error_Object) {
      Last_Error = Error_Object;
      if (Attempt < 3) await new Promise((Resolve) => setTimeout(Resolve, Attempt * 1600));
    }
  }
  throw new Error("Could not collect validated " + Room + " counts: " + (Last_Error?.message || "unknown error"));
}

export async function Fetch_Validated_Pool_With_Failover(Fetch_Function = fetch, Room = "Adult") {
  if (!Pool_Names.includes(Room)) throw Error("Unsupported activity pool");
  const Allowed_Hosts = ["rest.flingster.com", "rest2.flingster.com", "api.flingster.com"];
  const Errors = [];
  for (const Host of Allowed_Hosts) {
    try {
      const Snapshot = await Fetch_Online_Response(Fetch_Function, Room, Host);
      if (Host !== Allowed_Hosts[0]) {
        console.warn("COUNTRYPULSE_FALLBACK_SOURCE " + Room + " " + Host);
      }
      return { Host, Snapshot };
    } catch (Error_Object) {
      Errors.push(Host + ": " + Error_Object.message);
    }
  }
  throw Error("No validated " + Room + " pool across allowed hosts: " + Errors.join("; "));
}

export async function Verify_Flingster_Response_Identity(Fetch_Function = fetch) {
  const Headers = {
    "user-agent": "Mozilla/5.0 (compatible; CountryPulse/1.2)",
    "x-origin": "flingster.com",
    referer: "https://flingster.com/",
    accept: "application/json,*/*;q=0.8",
  };
  const Fetch_Metadata = async (Url) => {
    const Response = await Fetch_Function(Url, {
      method:"GET",headers:Headers,signal:AbortSignal.timeout(16000),
    });
    if (!Response.ok) throw Error("Identity endpoint returned HTTP " + Response.status);
    return Response.json();
  };
  const [Config, Metadata] = await Promise.all([
    Fetch_Metadata("https://rest.flingster.com/config?lang=en"),
    Fetch_Metadata("https://rest.flingster.com/onlineCountries?lang=en"),
  ]);
  if (!Config || Config.Name !== "Flingster" || Object.keys(Config).length < 20 ||
      !Metadata || Metadata.ALL !== 0 ||
      !Number.isSafeInteger(Metadata.Members) || Metadata.Members < 1000 ||
      !Array.isArray(Metadata.Tags) || Metadata.Tags.length < 5) {
    throw Error("Untrusted or fallback Flingster response identity");
  }
  return { Name:Config.Name, Members:Metadata.Members };
}

export async function Collect_Once() {
  const Raw_History = await readFile(History_Path, "utf8");
  const Existing_History = JSON.parse(Raw_History);
  // A valid HTTP status alone is not identity proof: reject the ALL:0, Members:3 fallback.
  const Verified_Identity = await Verify_Flingster_Response_Identity();
  // One collector for every pool. No per-country proxies or platform-specific aliases.
  const Adult_Result = await Fetch_Validated_Pool_With_Failover(fetch, "Adult");
  const Adult_Snapshot = Adult_Result.Snapshot;
  // Adult is the verified main feed. A temporary failure in a secondary pool must
  // not erase a validated Adult snapshot; missing pools stay missing.
  const [Default_Attempt, Combined_Attempt] = await Promise.allSettled([
    Fetch_Validated_Pool_With_Failover(fetch, "Default"),
    Fetch_Validated_Pool_With_Failover(fetch, "Combined"),
  ]);
  const Default_Result = Default_Attempt.status === "fulfilled" ? Default_Attempt.value : null;
  const Combined_Result = Combined_Attempt.status === "fulfilled" ? Combined_Attempt.value : null;
  if (!Default_Result) console.warn("COUNTRYPULSE_POOL_UNAVAILABLE Default");
  if (!Combined_Result) console.warn("COUNTRYPULSE_POOL_UNAVAILABLE Combined");
  const Default_Snapshot = Default_Result?.Snapshot;
  const Combined_Snapshot = Combined_Result?.Snapshot;
  // Optional cross-checks are nonblocking: a replica outage must not erase a valid primary reading.
  const Replica_Queries = [
    { Host_Name: "rest2.flingster.com", Room: "Adult" },
    { Host_Name: "api.flingster.com", Room: "Adult" },
    { Host_Name: "rest2.flingster.com", Room: "Default" },
    { Host_Name: "api.flingster.com", Room: "Default" },
  ].filter((Entry) => (Entry.Room === "Adult" ?
    Entry.Host_Name !== Adult_Result.Host :
    Boolean(Default_Result) && Entry.Host_Name !== Default_Result.Host));
  const Replica_Results = await Promise.allSettled(Replica_Queries.map((Entry) =>
    Fetch_Online_Response(fetch, Entry.Room, Entry.Host_Name)));
  const Summarize_Source = (Host_Name, Snapshot) => ({
    host: Host_Name, n: Snapshot.n, members: Snapshot.members ?? null,
    countries: Object.keys(Snapshot.c).length,
    il: Snapshot.c.IL ?? null, us: Snapshot.c.US ?? null,
  });
  const Checks = {
    Adult: [Summarize_Source(Adult_Result.Host, Adult_Snapshot)],
  };
  if (Default_Result) {
    Checks.Default = [Summarize_Source(Default_Result.Host, Default_Snapshot)];
  }
  Replica_Results.forEach((Result, Index) => {
    if (Result.status !== "fulfilled") return;
    const Query = Replica_Queries[Index];
    Checks[Query.Room].push(Summarize_Source(Query.Host_Name, Result.value));
  });
  if (!Number.isSafeInteger(Adult_Snapshot.members) ||
      Math.abs(Adult_Snapshot.members - Verified_Identity.Members) / Verified_Identity.Members > 0.02) {
    throw Error("Flingster membership does not match verified brand metadata");
  }
  const Incoming_Snapshot = {
    ...Adult_Snapshot,
    rooms: {
      ...(Default_Result ? { Default: { n: Default_Snapshot.n, c: Default_Snapshot.c } } : {}),
      ...(Combined_Result ? { Combined: { n: Combined_Snapshot.n, c: Combined_Snapshot.c } } : {}),
    },
    source_hosts: {
      Adult: Adult_Result.Host,
      ...(Default_Result ? { Default: Default_Result.Host } : {}),
      ...(Combined_Result ? { Combined: Combined_Result.Host } : {}),
    },
    checks: Checks,
  };
  const New_History = Merge_Snapshot_History(Existing_History, Incoming_Snapshot, Incoming_Snapshot.t);
  if (JSON.stringify(New_History.snapshots) === JSON.stringify(Existing_History.snapshots)) {
    console.log("SKIPPED: Snapshot already captured in the current half-hour window");
    return false;
  }
  const Temporary_Path = History_Path + ".tmp";
  await mkdir(dirname(History_Path), { recursive: true });
  await writeFile(Temporary_Path, JSON.stringify(New_History) + "\n", { encoding: "utf8", mode: 0o644 });
  await rename(Temporary_Path, History_Path);
  console.log("CAPTURED: " + new Date(Incoming_Snapshot.t * 1000).toISOString() +
    ", Adult=" + Incoming_Snapshot.n +
    ", Default=" + (Default_Snapshot?.n ?? "unavailable") +
    ", Combined=" + (Combined_Snapshot?.n ?? "unavailable") +
    ", members=" + (Incoming_Snapshot.members ?? "unavailable") +
    ", snapshots=" + New_History.snapshots.length);
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Collect_Once().catch((Error_Object) => {
    console.error("COLLECT_FAILED: " + Error_Object.message);
    process.exitCode = 1;
  });
}

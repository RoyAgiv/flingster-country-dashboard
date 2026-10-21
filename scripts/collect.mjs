import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const Source_Url = "https://rest.flingster.com/xhr.html?v=2&online=1&room=Adult&config=1&lang=en";
export const History_Path = resolve(dirname(fileURLToPath(import.meta.url)), "../data/history.json");
export const Retention_Days = 45;
export const Min_Snapshot_Gap_Seconds = 25 * 60;

export function Parse_Online_Response(Html_Text, Timestamp_Seconds = Math.floor(Date.now() / 1000)) {
  if (typeof Html_Text !== "string" || Html_Text.length > 5_000_000) {
    throw new Error("Invalid online response size");
  }
  const Match = Html_Text.match(/"xhrl"\s*:\s*"online"\s*,\s*"xhrd"\s*:\s*(\{[\s\S]*?\})\s*,\s*"xhrh"\s*:/);
  if (!Match) throw new Error("Site did not return an online-count payload");
  const Payload = JSON.parse(Match[1]);
  if (!Number.isSafeInteger(Payload.ALL) || Payload.ALL <= 0) {
    throw new Error("Missing or invalid worldwide total");
  }
  const Country_Entries = Object.entries(Payload)
    .filter(([Country_Code, Count]) => /^[A-Z]{2}$/.test(Country_Code) && Number.isSafeInteger(Count) && Count >= 0)
    .sort(([First_Code], [Second_Code]) => First_Code.localeCompare(Second_Code));
  const Total_From_Countries = Country_Entries.reduce((Sum, [, Count]) => Sum + Count, 0);
  if (Country_Entries.length < 20 || Total_From_Countries !== Payload.ALL) {
    throw new Error("Country count reconciliation failed");
  }
  return { t: Timestamp_Seconds, n: Payload.ALL, c: Object.fromEntries(Country_Entries) };
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

export async function Fetch_Online_Response(Fetch_Function = fetch) {
  const Request_Url = Source_Url + "&ver=" + Date.now();
  let Last_Error = null;
  for (let Attempt = 1; Attempt <= 3; Attempt++) {
    try {
      const Response = await Fetch_Function(Request_Url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(18000),
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; CountryPulse/1.1)",
          referer: "https://flingster.com/",
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
  throw new Error("Could not collect validated country counts: " + (Last_Error?.message || "unknown error"));
}

export async function Collect_Once() {
  const Raw_History = await readFile(History_Path, "utf8");
  const Existing_History = JSON.parse(Raw_History);
  const Incoming_Snapshot = await Fetch_Online_Response();
  const New_History = Merge_Snapshot_History(Existing_History, Incoming_Snapshot, Incoming_Snapshot.t);
  if (JSON.stringify(New_History.snapshots) === JSON.stringify(Existing_History.snapshots)) {
    console.log("SKIPPED: Snapshot already captured in the current half-hour window");
    return false;
  }
  const Temporary_Path = History_Path + ".tmp";
  await mkdir(dirname(History_Path), { recursive: true });
  await writeFile(Temporary_Path, JSON.stringify(New_History) + "\n", { encoding: "utf8", mode: 0o644 });
  await rename(Temporary_Path, History_Path);
  console.log("CAPTURED: " + new Date(Incoming_Snapshot.t * 1000).toISOString() + ", " + Incoming_Snapshot.n + " online, " + Object.keys(Incoming_Snapshot.c).length + " countries, " + New_History.snapshots.length + " stored snapshots");
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Collect_Once().catch((Error_Object) => {
    console.error("COLLECT_FAILED: " + Error_Object.message);
    process.exitCode = 1;
  });
}

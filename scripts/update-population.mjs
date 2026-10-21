import { readFile, writeFile, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const Population_Path = resolve(dirname(fileURLToPath(import.meta.url)), "../data/population.json");
export const Population_Source = "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=400&mrnev=1";
export const Metadata_Source = "https://api.worldbank.org/v2/country?format=json&per_page=400";
export const Refresh_Days = 30;

export function Transform_Population_Response(Indicator_Response, Metadata_Response, Retrieved_At) {
  const Entries = Indicator_Response?.[1];
  const Metadata = Metadata_Response?.[1];
  if (!Array.isArray(Entries) || !Array.isArray(Metadata)) {
    throw new Error("Unexpected World Bank response shape");
  }
  const Real_Countries = new Map(Metadata
    .filter((Record) => /^[A-Z]{2}$/.test(Record?.iso2Code || "") &&
      /^[A-Z]{3}$/.test(Record?.id || "") &&
      Record.region?.id !== "NA")
    .map((Record) => [Record.id, Record.iso2Code]));
  const By_Country = {};
  for (const Record of Entries) {
    const Code = Real_Countries.get(Record?.countryiso3code);
    const Value = Record?.value;
    const Year = Number(Record?.date);
    if (!Code || !Number.isSafeInteger(Value) || Value <= 0 ||
        !Number.isInteger(Year) || Year < 2019 || Year > 2100) continue;
    const Existing = By_Country[Code];
    if (!Existing || Year > Existing.year) {
      By_Country[Code] = { value: Value, year: Year };
    }
  }
  if (Object.keys(By_Country).length < 175 || !By_Country.US || !By_Country.IL) {
    throw new Error("Too few recognized country populations");
  }
  return {
    schema: 1,
    source: Population_Source,
    publisher: "World Bank — Population, total (SP.POP.TOTL)",
    retrieved_at: Retrieved_At,
    by_country: Object.fromEntries(Object.entries(By_Country).sort(([First], [Second]) =>
      First.localeCompare(Second))),
  };
}

export function Should_Refresh_Population(Existing_Document, Now_Ms = Date.now()) {
  const Last_Refresh = Date.parse(Existing_Document?.retrieved_at || "");
  return !Existing_Document || Existing_Document.schema !== 1 ||
    !Number.isFinite(Last_Refresh) || Now_Ms - Last_Refresh >= Refresh_Days * 86400000 ||
    !Existing_Document.by_country || Object.keys(Existing_Document.by_country).length < 175;
}

async function Fetch_Json(Url, Fetch_Function = fetch) {
  const Response = await Fetch_Function(Url, { signal: AbortSignal.timeout(20000) });
  if (!Response.ok) throw new Error("World Bank API HTTP " + Response.status);
  return Response.json();
}

export async function Refresh_Population(Fetch_Function = fetch, Now = new Date()) {
  let Existing_Document = null;
  try { Existing_Document = JSON.parse(await readFile(Population_Path, "utf8")); }
  catch (Error_Object) { if (Error_Object.code !== "ENOENT") throw Error_Object; }
  if (!Should_Refresh_Population(Existing_Document, Now.getTime())) {
    console.log("POPULATION_CURRENT: " + Object.keys(Existing_Document.by_country).length +
      " countries; retrieved " + Existing_Document.retrieved_at);
    return false;
  }
  const [Indicator_Response, Metadata_Response] = await Promise.all([
    Fetch_Json(Population_Source, Fetch_Function),
    Fetch_Json(Metadata_Source, Fetch_Function),
  ]);
  const New_Document = Transform_Population_Response(
    Indicator_Response, Metadata_Response, Now.toISOString());
  const Temporary_Path = Population_Path + ".tmp";
  await writeFile(Temporary_Path, JSON.stringify(New_Document) + "\n", "utf8");
  await rename(Temporary_Path, Population_Path);
  console.log("POPULATION_REFRESHED: " + Object.keys(New_Document.by_country).length +
    " countries; " + Now.toISOString());
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Refresh_Population().catch((Error_Object) => {
    console.error("POPULATION_REFRESH_FAILED: " + Error_Object.message);
    process.exitCode = 1;
  });
}

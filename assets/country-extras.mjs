import {
  Gender_Presets, Calculate_Population_Relationship, Format_Small_Percent,
  Calculate_Gender_Scenario, Compare_Pool_Representation,
} from "./country-metrics-utils.mjs";

const Country_Drawer = document.querySelector(".Insight_Drawer");
const Gender_Storage_Key = "country-pulse-gender-scenarios-v1";
const Format_Number = new Intl.NumberFormat("en-US");
const Format_Compact = new Intl.NumberFormat("en-US",{maximumFractionDigits:2});
const Population_Source_Link = "https://data.worldbank.org/indicator/SP.POP.TOTL";
let Population_By_Country = {};
let Population_Last_Updated = "";
let Selected_Country_Code = null;
let Gender_Preset_Key = "flingster";
let Women_Percent = 30;
let Couples_Percent = 0;

try {
  const Stored = JSON.parse(localStorage.getItem(Gender_Storage_Key) || "{}");
  if (Object.hasOwn(Gender_Presets, Stored.preset) &&
      Number.isInteger(Stored.women) && Number.isInteger(Stored.couples) &&
      Stored.women >= 0 && Stored.couples >= 0 &&
      Stored.women + Stored.couples <= 100) {
    Gender_Preset_Key = Stored.preset;
    Women_Percent = Stored.women;
    Couples_Percent = Stored.couples;
  }
} catch (Error_Object) { /* No stored assumptions. */ }

function Save_Gender_Scenario() {
  try { localStorage.setItem(Gender_Storage_Key,
    JSON.stringify({preset:Gender_Preset_Key,women:Women_Percent,couples:Couples_Percent})); }
  catch (Error_Object) { /* Ephemeral preferences if storage disabled. */ }
}

function Set_Text(Id, Value) {
  const Element = document.getElementById(Id);
  if (Element) Element.textContent = Value;
}

function Update_Population() {
  const Element = document.getElementById("Country_Population_Value");
  if (!Element) return;
  const Record = Population_By_Country[Selected_Country_Code];
  const Reported_Count = window.CountryPulse_Data?.Country_Rows?.find(
    (Row) => Row.Code === Selected_Country_Code)?.Count;
  const Metric = Calculate_Population_Relationship(Reported_Count, Record);
  if (!Metric) {
    Element.textContent = "Population context unavailable for this country";
    document.getElementById("Country_Population_Source").textContent =
      Population_Last_Updated ? "World Bank" : "Loading World Bank data…";
    return;
  }
  const Percent_Text = Format_Small_Percent(Metric.Percent);
  const Per_Million_Text = Metric.Per_Million < 0.01 && Metric.Per_Million > 0 ?
    "<0.01" : Format_Compact.format(Metric.Per_Million);
  Element.textContent = Percent_Text + " of population · ≈" + Per_Million_Text +
    " reported per million · pop. " + Format_Number.format(Metric.Population);
  document.getElementById("Country_Population_Source").textContent =
    "World Bank " + Metric.Year;
  Element.title = "Provider-reported online count divided by the " +
    Metric.Year + " World Bank resident population; not verified people, residents, or website penetration.";
}

function Update_Scenario() {
  const Current_Preset = Gender_Presets[Gender_Preset_Key];
  const Source_Anchor = document.getElementById("Scenario_Source");
  const Source_Note = document.getElementById("Scenario_Source_Note");
  Source_Anchor.hidden = !Current_Preset.url;
  Source_Anchor.textContent = Current_Preset.source;
  if (Current_Preset.url) Source_Anchor.href = Current_Preset.url;
  else Source_Anchor.removeAttribute("href");
  Source_Note.textContent = Current_Preset.note +
    (Gender_Preset_Key === "custom" ? "" :
      " Couples set to 0% only as an initial modeling assumption.");
  document.getElementById("Scenario_Select").value = Gender_Preset_Key;
  const Women_Slider = document.getElementById("Scenario_Women_Range");
  const Couples_Slider = document.getElementById("Scenario_Couples_Range");
  Women_Slider.max = String(100 - Couples_Percent);
  Couples_Slider.max = String(100 - Women_Percent);
  Women_Slider.value = String(Women_Percent);
  Couples_Slider.value = String(Couples_Percent);
  Set_Text("Scenario_Women_Pct", Women_Percent + "%");
  Set_Text("Scenario_Couples_Pct", Couples_Percent + "%");
  const Reported_Count = window.CountryPulse_Data?.Country_Rows?.find(
    (Row) => Row.Code === Selected_Country_Code)?.Count;
  const Split = Calculate_Gender_Scenario(Reported_Count, Women_Percent, Couples_Percent);
  for (const Category of ["Men","Women","Couples"]) {
    const Card = document.getElementById("Scenario_" + Category);
    const Output = Card.querySelector("strong");
    const Label = Card.querySelector("span");
    Output.textContent = Split ? Format_Number.format(Split[Category]) : "—";
    Label.textContent = Split ? Split[Category+"_Pct"]+"% assumed" : "No live count";
  }
  for (const [Category, Percentage] of [
    ["Men",Split?.Men_Pct||0],["Women",Split?.Women_Pct||0],["Couples",Split?.Couples_Pct||0],
  ]) {
    document.querySelector(".Scenario_Bar ." + Category).style.width = Percentage + "%";
  }
  Set_Text("Scenario_Count_Note", Split ?
    "Modeled shares of " + Format_Number.format(Split.Total) +
    " provider-reported online units. Not observed genders or unique people." :
    "Choose a country to calculate a hypothetical breakdown.");
}

function Update_Pool_Shares() {
  const Result = Compare_Pool_Representation(Selected_Country_Code,
    window.CountryPulse_History || []);
  if (!Result) {
    Set_Text("Country_Pool_Shares","Pool-share comparison will appear when paired snapshots exist.");
    return;
  }
  const A = Result.Adult_Share.toFixed(2);
  const D = Result.Default_Share.toFixed(2);
  const Ratio = Result.Factor && Result.Factor <= 100 ?
    Result.Factor.toFixed(1)+"×" : "—";
  Set_Text("Country_Pool_Shares", "Country's share of each pool · Adult " + A +
    "% · Default " + D + "% · " + Ratio + " more represented in " +
    Result.Greater_Pool + " (last saved; not gender-based)");
}

function Update_Country_Extras() {
  if (!Selected_Country_Code) return;
  Update_Population();
  Update_Scenario();
  Update_Pool_Shares();
}

async function Load_Population_Data() {
  try {
    const Response = await fetch("./data/population.json?v=" + Date.now(), {cache:"no-store"});
    if (!Response.ok) throw new Error("HTTP " + Response.status);
    const Result = await Response.json();
    if (Result.schema !== 1 || !Result.by_country ||
        Object.keys(Result.by_country).length < 175) throw new Error("Invalid population dataset");
    Population_By_Country = Result.by_country;
    Population_Last_Updated = Result.retrieved_at || "";
  } catch (Error_Object) {
    Population_By_Country = {};
    Population_Last_Updated = "";
  }
  Update_Population();
}

function Create_Country_Extras() {
  if (!Country_Drawer) return;
  const Stats = Country_Drawer.querySelector(".Insight_Stats");
  const Population_Line = document.createElement("div");
  Population_Line.className = "Population_Line";
  Population_Line.id = "Country_Population_Line";
  Population_Line.innerHTML =
    '<span class="Population_Pip" aria-hidden="true"></span><span>Population context:</span>' +
    '<b id="Country_Population_Value">Loading…</b>' +
    '<a id="Country_Population_Source" href="' + Population_Source_Link +
    '" target="_blank" rel="noopener noreferrer">World Bank</a>';

  const Scenario_Section = document.createElement("section");
  Scenario_Section.className = "Scenario_Section";
  Scenario_Section.id = "Scenario_Section";
  Scenario_Section.setAttribute("aria-label","Hypothetical gender and couples split");
  Scenario_Section.innerHTML =
    '<div class="Scenario_Head"><h3>Estimated men / women / couples</h3>' +
      '<span class="Scenario_Estimate_Tag">SCENARIO · NOT LIVE DATA</span></div>' +
    '<div class="Scenario_Sources">' +
      '<select id="Scenario_Select" aria-label="Choose a source or your own assumptions">' +
        '<option value="flingster">70 / 30 · Flingster review</option>' +
        '<option value="dirtyroulette">85 / 15 · DirtyRoulette claim</option>' +
        '<option value="tinder">67 / 33 · Tinder sample</option>' +
        '<option value="custom">Custom proportions</option>' +
      '</select><a id="Scenario_Source" class="Scenario_Source_Link" target="_blank" rel="noopener noreferrer"></a></div>' +
    '<p class="Scenario_Explanation" id="Scenario_Source_Note"></p>' +
    '<div class="Scenario_Sliders">' +
      '<label class="Scenario_Slider"><span class="Scenario_Slider_Header">Women <b id="Scenario_Women_Pct">30%</b></span>' +
        '<input id="Scenario_Women_Range" type="range" min="0" max="100" step="1" value="30" aria-label="Assumed women percentage"></label>' +
      '<label class="Scenario_Slider"><span class="Scenario_Slider_Header">Couples <b id="Scenario_Couples_Pct">0%</b></span>' +
        '<input id="Scenario_Couples_Range" type="range" min="0" max="100" step="1" value="0" aria-label="Assumed couples percentage"></label>' +
    '</div>' +
    '<div class="Scenario_Values">' +
      '<div id="Scenario_Men" class="Scenario_Value"><label>Men</label><strong>—</strong><span>—</span></div>' +
      '<div id="Scenario_Women" class="Scenario_Value"><label>Women</label><strong>—</strong><span>—</span></div>' +
      '<div id="Scenario_Couples" class="Scenario_Value"><label>Couples</label><strong>—</strong><span>—</span></div></div>' +
    '<div class="Scenario_Bar" role="img" aria-label="User-chosen modeled shares">' +
      '<span class="Men"></span><span class="Women"></span><span class="Couples"></span></div>' +
    '<div class="Scenario_Foot" id="Scenario_Count_Note"></div>' +
    '<div class="Scenario_Foot">No source measures current country-level gender or couples counts. These categories can represent self-declared people or couple sessions differently.</div>';
  Stats.after(Population_Line, Scenario_Section);

  const Pool_Shares = document.createElement("div");
  Pool_Shares.id = "Country_Pool_Shares";
  Pool_Shares.className = "Pool_Share_Line";
  Country_Drawer.querySelector("#Insight_Pool_Time").after(Pool_Shares);

  const Trend_Sections = Country_Drawer.querySelectorAll(".Insight_Section");
  if (Trend_Sections.length >= 2) {
    const Layout = document.createElement("div");
    Layout.className = "Insight_Detail_Grid";
    Trend_Sections[0].before(Layout);
    Layout.append(Trend_Sections[0],Trend_Sections[1]);
  }

  document.getElementById("Scenario_Select").addEventListener("change", (Event_Object) => {
    Gender_Preset_Key = Event_Object.target.value;
    const Preset = Gender_Presets[Gender_Preset_Key];
    if (!Preset) return;
    Women_Percent = Preset.women;
    Couples_Percent = Preset.couples;
    Save_Gender_Scenario();
    Update_Scenario();
  });
  document.getElementById("Scenario_Women_Range").addEventListener("input", (Event_Object) => {
    Gender_Preset_Key = "custom";
    Women_Percent = Math.min(100-Couples_Percent,Number(Event_Object.target.value));
    Save_Gender_Scenario();
    Update_Scenario();
  });
  document.getElementById("Scenario_Couples_Range").addEventListener("input", (Event_Object) => {
    Gender_Preset_Key = "custom";
    Couples_Percent = Math.min(100-Women_Percent,Number(Event_Object.target.value));
    Save_Gender_Scenario();
    Update_Scenario();
  });
  window.addEventListener("countrypulse:country-open", (Event_Object) => {
    Selected_Country_Code = Event_Object.detail?.Code || null;
    Update_Country_Extras();
  });
  window.addEventListener("countrypulse:data", Update_Country_Extras);
  window.addEventListener("countrypulse:history", Update_Country_Extras);

  const Tag_List = document.getElementById("Tag_List");
  const Note = Tag_List?.parentElement?.querySelector(".Data_Small");
  if (Note) Note.textContent = "17 shared suggestions, not a popularity ranking or complete set. Tags such as music, travel, gaming and sports may also be accepted. No per-tag user totals available.";
  Load_Population_Data();
  Update_Scenario();
}

Create_Country_Extras();

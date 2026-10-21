import { Aggregate_Hourly, Compare_Day_Over_Day, Calculate_Observed_Peak } from "./insights-utils.mjs";
import { Get_Pool_Snapshots, Get_Pool_Reading, Calculate_Weekend_Average } from "./trends-utils.mjs";

const Format_Number = new Intl.NumberFormat("en-US");
const Browser_Timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const Favorites_Key = "country-pulse-favorites-v1";
const Historical_Url = "./data/history.json";
const History_Strip = document.createElement("section");
const Drawer_Backdrop = document.createElement("div");
const Country_Drawer = document.createElement("aside");
const Country_Table = document.getElementById("Country_Table");
const Top_Chart = document.getElementById("Top_Chart");
let Historical_Snapshots = [];
let Selected_Pool = "Adult";
let Current_Countries = [];
let Current_Total = 0;
let Selected_Country_Code = null;
let Last_Selected_Focus = null;
let Selected_Period = 7;
let Selected_Timezone = "local";
let History_Ready = false;
let Favorite_Country_Codes = [];

try {
  const Saved_Favorites = JSON.parse(localStorage.getItem(Favorites_Key) || "[]");
  if (Array.isArray(Saved_Favorites)) Favorite_Country_Codes = Saved_Favorites.filter((Country_Code) => typeof Country_Code === "string" && /^[A-Z]{2}$/.test(Country_Code)).slice(0, 15);
} catch (Error_Object) {
  Favorite_Country_Codes = [];
}

function Country_Name(Country_Code) {
  if (Country_Code === "XK") return "Kosovo";
  try {
    const Name = new Intl.DisplayNames(["en"], { type: "region" }).of(Country_Code);
    return Name === Country_Code ? Country_Code : Name;
  } catch (Error_Object) { return Country_Code; }
}

function Country_Flag(Country_Code) {
  if (Country_Code === "XK") return "🌍";
  return /^[A-Z]{2}$/.test(Country_Code) ?
    String.fromCodePoint(...[...Country_Code].map((Character) => 127397 + Character.charCodeAt(0))) : "🌍";
}

function Set_Text(Element_Id, Value) {
  const Element = document.getElementById(Element_Id);
  if (Element) Element.textContent = Value;
}

function Render_Favorites() {
  const Container = document.getElementById("Pinned_Rows");
  if (!Container) return;
  Container.replaceChildren();
  if (!Favorite_Country_Codes.length) {
    const Hint = document.createElement("span");
    Hint.className = "Pinned_Hint";
    Hint.textContent = "☆ Open a country and pin your favorites";
    Container.append(Hint);
    return;
  }
  for (const Country_Code of Favorite_Country_Codes) {
    const Button = document.createElement("button");
    Button.type = "button";
    Button.className = "Pinned_Row";
    Button.textContent = Country_Flag(Country_Code) + " " + Country_Name(Country_Code);
    Button.addEventListener("click", () => Open_Country(Country_Code));
    Container.append(Button);
  }
}

function Save_Favorites() {
  try { localStorage.setItem(Favorites_Key, JSON.stringify(Favorite_Country_Codes)); }
  catch (Error_Object) { /* Local storage can be disabled by the browser. */ }
  Render_Favorites();
  Update_Star();
}

function Update_Star() {
  const Button = document.getElementById("Insight_Star");
  if (!Button || !Selected_Country_Code) return;
  const Is_Pinned = Favorite_Country_Codes.includes(Selected_Country_Code);
  Button.dataset.pinned = String(Is_Pinned);
  Button.textContent = Is_Pinned ? "★" : "☆";
  Button.title = Is_Pinned ? "Unpin country" : "Pin country for quick access";
  Button.setAttribute("aria-label", Button.title);
}

function Toggle_Favorite() {
  if (!Selected_Country_Code) return;
  if (Favorite_Country_Codes.includes(Selected_Country_Code)) {
    Favorite_Country_Codes = Favorite_Country_Codes.filter((Country_Code) => Country_Code !== Selected_Country_Code);
  } else {
    Favorite_Country_Codes = [...Favorite_Country_Codes, Selected_Country_Code].slice(-15);
  }
  Save_Favorites();
}

function Format_Range_Time(Hour) {
  const Hour_End = (Hour + 1) % 24;
  return String(Hour).padStart(2, "0") + ":00–" + String(Hour_End).padStart(2, "0") + ":00";
}

function Date_Short(Timestamp) {
  return new Date(Timestamp * 1000).toLocaleDateString([], { month: "short", day: "numeric" });
}

function Render_Trend(Samples) {
  const Container = document.getElementById("Insight_Trend");
  const Label = document.getElementById("Insight_Trend_Labels");
  Container.replaceChildren();
  Label.replaceChildren();
  Container.classList.toggle("Single", Samples.length < 2);
  if (Samples.length === 1) {
    const First_Reading = document.createElement("div");
    First_Reading.className = "Insight_Empty";
    First_Reading.textContent = "First saved reading: " +
      Format_Number.format(Samples[0].Count) +
      ". Activity trend appears after another reading.";
    Container.append(First_Reading);
    return;
  }
  if (!Samples.length) {
    const Empty = document.createElement("div");
    Empty.className = "Insight_Empty";
    Empty.textContent = "No snapshots yet for this period. Your history will build automatically.";
    Container.append(Empty);
    return;
  }
  const Width = 520;
  const Height = 150;
  const Padding = 9;
  const Min_Time = Samples[0].t;
  const Max_Time = Math.max(Min_Time + 1, Samples.at(-1).t);
  const Max_Count = Math.max(1, ...Samples.map((Sample) => Sample.Count));
  const Format_X = (Sample) => Padding + ((Sample.t - Min_Time) / (Max_Time - Min_Time)) * (Width - Padding * 2);
  const Format_Y = (Sample) => Height - Padding - (Sample.Count / Max_Count) * (Height - Padding * 2);
  const Points = Samples.map((Sample) => [Format_X(Sample), Format_Y(Sample)]);
  const Path_Points = Points.map(([X, Y], Index) => (Index ? "L" : "M") + X.toFixed(2) + " " + Y.toFixed(2)).join(" ");
  const Create_Svg = (Name, Attributes = {}) => {
    const Element = document.createElementNS("http://www.w3.org/2000/svg", Name);
    for (const [Attribute, Value] of Object.entries(Attributes)) Element.setAttribute(Attribute, String(Value));
    return Element;
  };
  const Svg = Create_Svg("svg", { viewBox: "0 0 " + Width + " " + Height, class: "Insight_Trend_Svg", role: "img", "aria-label": "Recorded counts over the selected period" });
  for (const Proportion of [0.25, 0.5, 0.75]) {
    const Y = Height * Proportion;
    Svg.append(Create_Svg("line", { x1: 0, x2: Width, y1: Y, y2: Y, class: "Grid_Line" }));
  }
  const Bottom_Y = Height - Padding;
  Svg.append(Create_Svg("path", { d: Path_Points + " L" + Points.at(-1)[0].toFixed(2) + " " + Bottom_Y + " L" + Points[0][0].toFixed(2) + " " + Bottom_Y + " Z", class: "Area" }));
  Svg.append(Create_Svg("path", { d: Path_Points, class: "Stroke" }));
  Svg.append(Create_Svg("circle", { cx: Points.at(-1)[0], cy: Points.at(-1)[1], r: 5, class: "Last_Dot" }));
  Container.append(Svg);
  const First_Label = document.createElement("span");
  const Last_Label = document.createElement("span");
  First_Label.textContent = Date_Short(Samples[0].t);
  Last_Label.textContent = Date_Short(Samples.at(-1).t);
  Label.append(First_Label, Last_Label);
}

function Render_Hours(Insight) {
  const Peaks = document.getElementById("Insight_Peaks");
  const Grid = document.getElementById("Insight_Hours");
  Peaks.replaceChildren();
  Grid.replaceChildren();
  const Qualified = Insight.Peak_Hours;
  Grid.classList.toggle("Insufficient", Qualified.length === 0);
  if (!Qualified.length) {
    const Empty = document.createElement("div");
    Empty.className = "Insight_Empty_Hours";
    Empty.textContent = "Best hours will appear after there are readings on multiple days.";
    Peaks.append(Empty);
    return;
  } else {
    for (const Bin of Qualified) {
      const Card = document.createElement("div");
      Card.className = "Insight_Peak";
      const Time = document.createElement("b");
      Time.textContent = Format_Range_Time(Bin.Hour);
      const Detail = document.createElement("span");
      Detail.textContent = "Avg " + Format_Number.format(Bin.Average) + " · " + Bin.Distinct_Days + " days";
      Card.append(Time, Detail);
      Peaks.append(Card);
    }
  }
  const Max_Average = Math.max(1, ...Insight.Hourly.filter((Bin) => Bin.Average !== null).map((Bin) => Bin.Average));
  const Strong_Hours = new Set(Qualified.map((Bin) => Bin.Hour));
  for (const Hour_Entry of Insight.Hourly) {
    const Column = document.createElement("div");
    Column.className = "Insight_Hour_Column";
    const Bar = document.createElement("div");
    Bar.className = "Insight_Hour_Bar";
    if (Hour_Entry.Average === null) Bar.classList.add("Empty");
    if (Strong_Hours.has(Hour_Entry.Hour)) Bar.classList.add("Highlight");
    Bar.style.height = (Hour_Entry.Average === null ? 5 : Math.max(6, (Hour_Entry.Average / Max_Average) * 79)) + "px";
    Bar.title = Format_Range_Time(Hour_Entry.Hour) + ": " + (Hour_Entry.Average === null ? "no samples" : ("average " + Format_Number.format(Hour_Entry.Average) + ", " + Hour_Entry.Sample_Count + " readings"));
    const Label = document.createElement("label");
    Label.textContent = Hour_Entry.Hour % 3 === 0 ? String(Hour_Entry.Hour).padStart(2, "0") : "";
    Column.append(Bar, Label);
    Grid.append(Column);
  }
}

function Render_Country() {
  if (!Selected_Country_Code) return;
  const Country = Current_Countries.find((Item) => Item.Code === Selected_Country_Code);
  const Timezone = Selected_Timezone === "utc" ? "UTC" : Browser_Timezone;
  const Pool_Snapshots = Get_Pool_Snapshots(Historical_Snapshots, Selected_Pool);
  const Insight = Aggregate_Hourly(Pool_Snapshots, Selected_Country_Code, Timezone, Selected_Period);
  const Percentage = Country && Current_Total ? (Country.Count / Current_Total * 100).toFixed(2) + "% of worldwide feed" : "No current reading";
  Set_Text("Insight_Flag", Country_Flag(Selected_Country_Code));
  Set_Text("Insight_Name", Country_Name(Selected_Country_Code));
  Set_Text("Insight_Code", Selected_Country_Code + " · " + Selected_Pool + " · " + Percentage);
  Set_Text("Insight_Now", Country ? Format_Number.format(Country.Count) : "—");
  Set_Text("Insight_Average", Insight.Average_Count === null ? "—" : Format_Number.format(Insight.Average_Count));
  // A live reading can exceed the most recently saved high; show a comparable peak.
  const Peak_With_Live = Calculate_Observed_Peak(Country?.Count, Insight.Maximum_Count);
  Set_Text("Insight_Peak", Peak_With_Live > 0 ? Format_Number.format(Peak_With_Live) : "—");
  document.getElementById("Insight_Peak").dataset.livePeak =
    String(Country && Country.Count >= (Insight.Maximum_Count ?? 0));
  const Peak_Foot = document.getElementById("Insight_Peak").closest(".Insight_Stat")
    .querySelector(".Insight_Stat_Foot");
  Peak_Foot.textContent = "Saved history + latest live reading";
  Set_Text("Insight_Chart_Subtitle", Insight.Sample_Count + " saved readings · " + Insight.Observation_Days + " days observed");
  Set_Text("Insight_Hours_Label", Selected_Timezone === "utc" ? "UTC" : "Your time · " + Browser_Timezone.replaceAll("_", " "));
  const Day_Change = Compare_Day_Over_Day(Insight.Samples.map((Sample) => ({ t: Sample.t, c: { [Selected_Country_Code]: Sample.Count } })), Selected_Country_Code);
  Set_Text("Insight_Day_Change", Day_Change === null ? "More history needed" : ((Day_Change > 0 ? "+" : "") + Day_Change + "% vs same time yesterday"));
  Set_Text("Insight_Quality", Insight.Observation_Days < 2 ?
    "Early readings. Best hours need at least two days of observations." :
    (Insight.Reliable_Enough ? "Average based on sampled hours; readings are site-reported, not verified people." :
    "Preliminary pattern. Several days of readings improve reliability."));
  const Coverage_Target = Selected_Period * 48;
  const Coverage = Math.min(100, Math.round(Insight.Sample_Count / Coverage_Target * 1000) / 10);
  const Coverage_Bar = document.getElementById("Insight_Coverage_Bar");
  Coverage_Bar.style.width = Coverage + "%";
  Set_Text("Insight_Coverage", Coverage + "% coverage of selected period · " + Insight.Sample_Count + " readings");
  Render_Trend(Insight.Samples);
  Render_Hours(Insight);
  const Weekend_Data = Calculate_Weekend_Average(Historical_Snapshots, Selected_Country_Code, Selected_Pool);
  Set_Text("Insight_Weekend", Weekend_Data ?
    "Weekdays avg " + Format_Number.format(Weekend_Data.Weekday) +
    " · Weekends avg " + Format_Number.format(Weekend_Data.Weekend) + " (UTC)" :
    "Weekday vs weekend analysis starts after more days are recorded.");
  const Comparison = document.getElementById("Insight_Pool_Compare");
  Comparison.replaceChildren();
  const Latest_Pool_Snapshot = Historical_Snapshots.slice().reverse().find((Snapshot) =>
    Snapshot.rooms?.Default?.c && Snapshot.rooms?.Combined?.c);
  for (const Pool_Name of ["Adult", "Default", "Combined"]) {
    const Reading = Latest_Pool_Snapshot && Get_Pool_Reading(Latest_Pool_Snapshot, Pool_Name);
    const Entry = document.createElement("div");
    Entry.className = "Insight_Pool_Cell";
    const Label = document.createElement("label");
    Label.textContent = Pool_Name;
    const Value = document.createElement("strong");
    Value.textContent = Reading && Number.isSafeInteger(Reading.c[Selected_Country_Code]) ?
      Format_Number.format(Reading.c[Selected_Country_Code]) : "—";
    Entry.append(Label, Value);
    Comparison.append(Entry);
  }
  Set_Text("Insight_Pool_Time", Latest_Pool_Snapshot ?
    "Last saved across pools · " + new Date(Latest_Pool_Snapshot.t * 1000).toLocaleString() :
    "Cross-pool comparisons begin with the first new multi-pool snapshot.");
  Update_Star();
}

function Open_Country(Country_Code) {
  if (!/^[A-Z]{2}$/.test(Country_Code)) return;
  Last_Selected_Focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  Selected_Country_Code = Country_Code;
  Country_Drawer.hidden = false;
  Drawer_Backdrop.hidden = false;
  document.body.classList.add("Insight_Drawer_Open");
  Render_Country();
  document.getElementById("Insight_Close").focus();
}

function Close_Country() {
  Country_Drawer.hidden = true;
  Drawer_Backdrop.hidden = true;
  document.body.classList.remove("Insight_Drawer_Open");
  Selected_Country_Code = null;
  if (Last_Selected_Focus?.isConnected) Last_Selected_Focus.focus();
}

function Update_History_Status() {
  if (!History_Ready) return;
  const Element = document.getElementById("History_Coverage");
  if (!Historical_Snapshots.length) {
    Element.textContent = "History starting soon · next collection within ~30 minutes";
    return;
  }
  const First = Historical_Snapshots[0];
  const Last = Historical_Snapshots.at(-1);
  const Hour_Difference = Math.max(0, Math.floor((Date.now() / 1000 - Last.t) / 3600));
  const Age = Hour_Difference >= 1 ? (Hour_Difference + "h ago") :
    (Math.max(0, Math.floor((Date.now() / 1000 - Last.t) / 60)) + "m ago");
  Element.textContent = Historical_Snapshots.length + (Historical_Snapshots.length === 1 ? " snapshot" : " snapshots") + " · first " + Date_Short(First.t) + " · last " + Age;
}

async function Load_History() {
  try {
    const Response = await fetch(Historical_Url + "?v=" + Date.now(), { cache: "no-store" });
    if (!Response.ok) throw new Error("History returned HTTP " + Response.status);
    const Payload = await Response.json();
    if (!Payload || Payload.schema !== 1 || !Array.isArray(Payload.snapshots)) throw new Error("Unexpected data format");
    Historical_Snapshots = Payload.snapshots
      .filter((Snapshot) => Snapshot && Number.isSafeInteger(Snapshot.t) && Number.isSafeInteger(Snapshot.n) &&
        Snapshot.c && typeof Snapshot.c === "object")
      .sort((First, Second) => First.t - Second.t);
    History_Ready = true;
    window.CountryPulse_History = Historical_Snapshots;
    window.dispatchEvent(new CustomEvent("countrypulse:history", { detail: { Historical_Snapshots } }));
    Update_History_Status();
    if (Selected_Country_Code) Render_Country();
  } catch (Error_Object) {
    const Element = document.getElementById("History_Coverage");
    Element.textContent = Historical_Snapshots.length ? "Showing previous history · refresh later" :
      "History temporarily unavailable · live counts still work";
  }
}

function Create_Interface() {
  const Badge = document.querySelector(".Content_Grid .Panel_Head .Tiny_Tag");
  if (Badge) {
    const Label = document.createElement("label");
    Label.className = "Top_Limit_Control";
    Label.textContent = "Show ";
    const Select = document.createElement("select");
    Select.id = "Top_Limit";
    Select.setAttribute("aria-label", "Number of top countries in chart");
    for (const [Value, Text] of [["10", "Top 10"], ["25", "Top 25"], ["50", "Top 50"], ["1000", "All countries"]]) {
      const Option = document.createElement("option");
      Option.value = Value;
      Option.textContent = Text;
      Select.append(Option);
    }
    Select.addEventListener("change", () => window.dispatchEvent(new Event("countrypulse:chart-limit")));
    Label.append(Select);
    Badge.replaceWith(Label);
    Select.value = "25";
    const Chart_Footer = document.createElement("div");
    Chart_Footer.className = "Chart_Count_Foot";
    const Chart_Info = document.createElement("span");
    Chart_Info.id = "Top_Chart_Info";
    Chart_Info.textContent = "Showing more countries · scroll to explore";
    const Show_All = document.createElement("button");
    Show_All.type = "button";
    Show_All.textContent = "Show all";
    Show_All.addEventListener("click", () => {
      Select.value = "1000";
      // Reuse the actual select-change event so the chart AND count label stay synchronized.
      Select.dispatchEvent(new Event("change"));
    });
    Chart_Footer.append(Chart_Info, Show_All);
    Top_Chart.after(Chart_Footer);
    const Update_Footer = () => {
      const Latest = window.CountryPulse_Data;
      const Total = Latest?.Country_Rows?.length || 0;
      const Displayed = Math.min(Number(Select.value), Total);
      Chart_Info.textContent = Total ? "Showing " + Displayed + " of " +
        Total + " countries · scroll for more" : "Loading countries…";
      Show_All.hidden = !Total || Displayed >= Total;
    };
    Select.addEventListener("change", Update_Footer);
    window.addEventListener("countrypulse:data", Update_Footer);
    window.dispatchEvent(new Event("countrypulse:chart-limit"));
  }

  History_Strip.className = "History_Strip";
  History_Strip.innerHTML = '<div class="History_Identity"><span class="History_Beacon" aria-hidden="true"></span><strong>Activity history</strong><span class="History_Coverage" id="History_Coverage">Loading saved snapshots…</span></div><div class="Pinned_Rows" id="Pinned_Rows"></div>';
  document.querySelector(".Stats").insertAdjacentElement("afterend", History_Strip);

  Drawer_Backdrop.className = "Insight_Backdrop";
  Drawer_Backdrop.hidden = true;
  Country_Drawer.className = "Insight_Drawer";
  Country_Drawer.hidden = true;
  Country_Drawer.tabIndex = -1;
  Country_Drawer.setAttribute("role", "dialog");
  Country_Drawer.setAttribute("aria-modal", "true");
  Country_Drawer.setAttribute("aria-labelledby", "Insight_Name");
  Country_Drawer.innerHTML =
    '<div class="Insight_Inner">' +
      '<div class="Insight_Top"><div class="Insight_Eyebrow">COUNTRY ACTIVITY · HISTORY</div><button type="button" class="Insight_Icon_Button" id="Insight_Close" aria-label="Close country insights">×</button></div>' +
      '<div class="Insight_Title_Row"><span class="Insight_Country_Flag" id="Insight_Flag"></span><div style="flex:1;min-width:0"><h2 class="Insight_Country_Name" id="Insight_Name"></h2><div class="Insight_Country_Code" id="Insight_Code"></div></div><button class="Insight_Icon_Button Insight_Star" id="Insight_Star" type="button" aria-label="Pin country">☆</button></div>' +
      '<p class="Insight_Lead">When is this country most active in the reported feed?</p>' +
      '<div class="Insight_Controls"><select id="Insight_Period" aria-label="Historical period"><option value="1">Last 24 hours</option><option value="7" selected>Last 7 days</option><option value="30">Last 30 days</option></select><select id="Insight_Timezone" aria-label="Timezone for best hours"><option value="local" selected>Hours in my timezone</option><option value="utc">Hours in UTC</option></select></div>' +
      '<div class="Insight_Stats"><div class="Insight_Stat"><div class="Insight_Stat_Label">Reported now</div><div class="Insight_Stat_Value Glow" id="Insight_Now">—</div><div class="Insight_Stat_Foot">Live feed</div></div><div class="Insight_Stat"><div class="Insight_Stat_Label">Recorded average</div><div class="Insight_Stat_Value" id="Insight_Average">—</div><div class="Insight_Stat_Foot">Selected period</div></div><div class="Insight_Stat"><div class="Insight_Stat_Label">Highest observed</div><div class="Insight_Stat_Value" id="Insight_Peak">—</div><div class="Insight_Stat_Foot">Selected period</div></div></div>' +
      '<div class="Insight_Section"><div class="Insight_Section_Head"><h3>Activity over time</h3><span class="Insight_Mini_Label" id="Insight_Chart_Subtitle"></span></div><div class="Insight_Trend_Container" id="Insight_Trend"></div><div class="Insight_Trend_Labels" id="Insight_Trend_Labels"></div><div class="Insight_Disclaimer"><span aria-hidden="true">↗</span><span id="Insight_Day_Change"></span></div></div>' +
      '<div class="Insight_Section"><div class="Insight_Section_Head"><h3>Best hours on average</h3><span class="Insight_Mini_Label" id="Insight_Hours_Label"></span></div><div class="Insight_Peak_Cards" id="Insight_Peaks"></div><div class="Insight_Hour_Grid" id="Insight_Hours"></div><div class="Insight_Disclaimer"><span aria-hidden="true">ⓘ</span><span id="Insight_Quality"></span></div></div>' +
      '<div class="Insight_Section"><div class="Insight_Section_Head"><h3>History coverage</h3><span class="Insight_Mini_Label">Goal: ~2 readings/hour</span></div><div class="Insight_Mini_Label" id="Insight_Coverage"></div><div class="Insight_Sample_Progress"><span id="Insight_Coverage_Bar"></span></div><div class="Insight_Disclaimer">Stored automatically about every 30 minutes, subject to GitHub scheduling delays. 45-day rolling storage. Averages reflect unverified site-reported counts.</div></div>' +
    '</div>';
  const Comparison_Block = document.createElement("div");
  Comparison_Block.className = "Insight_Pool_Compare";
  Comparison_Block.id = "Insight_Pool_Compare";
  const Comparison_Age = document.createElement("div");
  Comparison_Age.id = "Insight_Pool_Time";
  Comparison_Age.className = "Insight_Pool_Time";
  const Weekend_Label = document.createElement("div");
  Weekend_Label.id = "Insight_Weekend";
  Weekend_Label.className = "Insight_Change";
  Country_Drawer.querySelector(".Insight_Stats").after(Comparison_Block, Comparison_Age);
  Country_Drawer.querySelector("#Insight_Hours").after(Weekend_Label);
  document.body.append(Drawer_Backdrop, Country_Drawer);

  document.getElementById("Insight_Close").addEventListener("click", Close_Country);
  Drawer_Backdrop.addEventListener("click", Close_Country);
  document.getElementById("Insight_Star").addEventListener("click", Toggle_Favorite);
  document.getElementById("Insight_Period").addEventListener("change", (Event_Object) => {
    Selected_Period = Number(Event_Object.target.value);
    Render_Country();
  });
  document.getElementById("Insight_Timezone").addEventListener("change", (Event_Object) => {
    Selected_Timezone = Event_Object.target.value;
    Render_Country();
  });
  document.addEventListener("keydown", (Event_Object) => {
    if (Event_Object.key === "Escape" && !Country_Drawer.hidden) Close_Country();
    if (Event_Object.key === "Tab" && !Country_Drawer.hidden) {
      const Focusable = Array.from(Country_Drawer.querySelectorAll("button:not(:disabled),select:not(:disabled)"));
      const First = Focusable[0];
      const Last = Focusable.at(-1);
      if (Event_Object.shiftKey && document.activeElement === First) {
        Event_Object.preventDefault();
        Last.focus();
      } else if (!Event_Object.shiftKey && document.activeElement === Last) {
        Event_Object.preventDefault();
        First.focus();
      }
    }
  });
  Country_Table.addEventListener("click", (Event_Object) => {
    const Row = Event_Object.target.closest("tr[data-country-code]");
    if (Row) Open_Country(Row.dataset.countryCode);
  });
  Country_Table.addEventListener("keydown", (Event_Object) => {
    if (Event_Object.key !== "Enter" && Event_Object.key !== " ") return;
    const Row = Event_Object.target.closest("tr[data-country-code]");
    if (!Row) return;
    Event_Object.preventDefault();
    Open_Country(Row.dataset.countryCode);
  });
  window.addEventListener("countrypulse:data", (Event_Object) => {
    if (!Event_Object.detail || !Array.isArray(Event_Object.detail.Country_Rows)) return;
    Selected_Pool = Event_Object.detail.Room || "Adult";
    Current_Countries = Event_Object.detail.Country_Rows;
    Current_Total = Event_Object.detail.Online_Total;
    if (Selected_Country_Code) Render_Country();
  });
  window.addEventListener("countrypulse:open-country", (Event_Object) => {
    if (Event_Object.detail?.Code) Open_Country(Event_Object.detail.Code);
  });
  window.addEventListener("countrypulse:pool-changing", (Event_Object) => {
    Selected_Pool = Event_Object.detail?.Room || "Adult";
    Current_Countries = [];
    Current_Total = 0;
    if (Selected_Country_Code) Render_Country();
  });
  Render_Favorites();
  Load_History();
  setInterval(() => { if (!document.hidden) Load_History(); }, 10 * 60 * 1000);
}
Create_Interface();

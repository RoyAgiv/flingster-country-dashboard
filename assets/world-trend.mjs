import {
  WORLD_WINDOWS, Select_World_Readings, Merge_Live_World_Reading,
  Summarize_World_Readings, Create_World_Chart_Geometry, World_Readings_Csv
} from "./world-trend-utils.mjs";

const NS = "http://www.w3.org/2000/svg";
const Number_Format = new Intl.NumberFormat("en-US");
const Date_Format = new Intl.DateTimeFormat(undefined, {
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short"
});
const Range_Key = "country-pulse-world-range-v1";
const Panel = document.createElement("section");
Panel.id = "world";
Panel.className = "Panel World_Pulse";
Panel.setAttribute("aria-label", "Worldwide activity over time");
Panel.innerHTML = `
  <div class="World_Header">
    <div class="World_Intro"><span class="World_Kicker">GLOBAL PULSE · REPORTED ACTIVITY</span>
      <h2>Worldwide activity over time</h2>
      <p class="Subheading">Actual observations from the selected pool. Missing readings are never filled in.</p>
    </div>
    <div class="World_Ranges" role="group" aria-label="Worldwide history period">
      <button type="button" data-window="24h" aria-pressed="true">24 hours</button>
      <button type="button" data-window="7d" aria-pressed="false">7 days</button>
      <button type="button" data-window="30d" aria-pressed="false">30 days</button>
    </div>
  </div>
  <div class="World_Summary" aria-live="polite">
    <div><span>Latest in range</span><strong id="World_Latest">—</strong><small id="World_Latest_Source">Loading saved history</small></div>
    <div><span>Change between observed endpoints</span><strong id="World_Difference">—</strong><small id="World_Difference_Context">Not enough observations</small></div>
    <div><span>30-minute sample coverage</span><strong id="World_Coverage">—</strong><small id="World_Coverage_Context">No invented samples</small></div>
  </div>
  <div class="World_Graph_Area">
    <div class="World_Graph_Bar"><span id="World_Series_Status">Preparing the timeline…</span><span class="World_Legend"><i></i> Saved observations <i class="Live"></i> Current live reading</span></div>
    <div class="World_Empty" id="World_Empty" hidden></div>
    <svg id="World_Chart" viewBox="0 0 1000 246" preserveAspectRatio="none" role="img" aria-label="Reported worldwide activity over time"></svg>
    <div class="World_Scrub">
      <label for="World_Scrubber">Inspect an observed reading</label>
      <input type="range" id="World_Scrubber" min="0" max="0" step="1" value="0" disabled aria-describedby="World_Selected" />
      <output id="World_Selected" for="World_Scrubber">Waiting for observations</output>
    </div>
  </div>
  <div class="World_Foot">
    <p id="World_Methodology">Totals are provider-reported; they are not verified unique people. Gaps and partial coverage limit trend interpretation.</p>
    <div class="World_Foot_Actions">
      <button type="button" id="World_Retry" class="Secondary_Button" hidden>Retry history</button>
      <button type="button" id="World_Export" class="Secondary_Button" disabled>Download timeline CSV</button>
    </div>
  </div>`;
document.querySelector(".Stats").after(Panel);

const Chart = Panel.querySelector("#World_Chart");
const Scrubber = Panel.querySelector("#World_Scrubber");
const Selected = Panel.querySelector("#World_Selected");
const Empty = Panel.querySelector("#World_Empty");
const Retry = Panel.querySelector("#World_Retry");
const Export = Panel.querySelector("#World_Export");
let History = Array.isArray(window.CountryPulse_History) ? window.CountryPulse_History : [];
let Current = window.CountryPulse_Data || null;
let Pool = Current?.Room || "Adult";
let Range = "24h";
let Readings = [];
let Geometry = null;
let Selected_Time = null;
let Marker = null;
let Has_History_Error = false;

try {
  const Saved = localStorage.getItem(Range_Key);
  if (WORLD_WINDOWS[Saved]) Range = Saved;
} catch { /* Browser storage is optional. */ }

function Svg_Element(Name, Attributes = {}, Text) {
  const Node = document.createElementNS(NS, Name);
  for (const [Key, Value] of Object.entries(Attributes)) Node.setAttribute(Key, String(Value));
  if (Text !== undefined) Node.textContent = Text;
  return Node;
}

function Text(Id, Value) { Panel.querySelector("#" + Id).textContent = Value; }
function Date_Label(Time) { return Date_Format.format(Time * 1000); }
function Signed_Count(Value) { return (Value > 0 ? "+" : "") + Number_Format.format(Value); }

function Show_Selected(Index) {
  if (!Readings.length || !Geometry?.points.length) return;
  const Safe = Math.max(0, Math.min(Readings.length - 1, Number(Index) || 0));
  const Point = Readings[Safe];
  const Screen_Point = Geometry.points[Safe];
  Scrubber.value = String(Safe);
  Selected_Time = Point.t;
  Selected.value = Number_Format.format(Point.n) + " reported online · " +
    Date_Label(Point.t) + " · " + (Point.kind === "live" ? "Live, not saved" : "Saved observation") +
    " (" + (Safe + 1) + " of " + Readings.length + ")";
  Selected.textContent = Selected.value;
  if (Marker) {
    Marker.setAttribute("cx", Screen_Point.x.toFixed(2));
    Marker.setAttribute("cy", Screen_Point.y.toFixed(2));
    Marker.style.display = "";
  }
}

function Render_Chart() {
  const Now = Math.floor(Date.now() / 1000);
  Readings = Select_World_Readings(History, Pool, Range, Now);
  Readings = Merge_Live_World_Reading(Readings, Current, Pool, Range, Now);
  const Stats = Summarize_World_Readings(Readings, Range, Now);
  Panel.querySelectorAll(".World_Ranges button").forEach(Button =>
    Button.setAttribute("aria-pressed", String(Button.dataset.window === Range)));
  Text("World_Latest", Stats.latest ? Number_Format.format(Stats.latest.n) : "—");
  Text("World_Latest_Source", Stats.latest ?
    (Stats.latest.kind === "live" ? "Live reading" : "Saved reading") + " · " + Date_Label(Stats.latest.t) :
    "No usable observation");
  Text("World_Difference", Stats.difference === null ? "—" : Signed_Count(Stats.difference));
  Panel.querySelector("#World_Difference").dataset.direction = Stats.difference === null ? "none" :
    Stats.difference >= 0 ? "up" : "down";
  Text("World_Difference_Context", Stats.first && Stats.latest && Stats.difference !== null ?
    "First " + Date_Label(Stats.first.t) + " · last " + Date_Label(Stats.latest.t) :
    "Requires at least two observed points");
  Text("World_Coverage", Stats.observed ? Stats.coverage + "%" : "—");
  Text("World_Coverage_Context", Stats.sampledSlots + " of ~" + Stats.expected +
    " scheduled half-hour slots in range");
  Text("World_Series_Status", Pool + " pool · " + Stats.observed + " observed readings · " +
    Stats.gaps + (Stats.gaps === 1 ? " internal gap" : " internal gaps") +
    (Stats.lastAgeSeconds !== null && Stats.lastAgeSeconds > 5400 ? " · latest reading may be stale" : ""));
  Text("World_Methodology", "Provider-reported totals (not verified unique people). " +
    "Gaps over 90 minutes are disconnected; coverage is approximate against a 30-minute target. " +
    "No missing readings or historical pool values are invented.");
  Retry.hidden = !Has_History_Error;
  Export.disabled = !Readings.length;
  const Has_Points = Readings.length > 0;
  Chart.hidden = !Has_Points;
  Scrubber.disabled = !Has_Points;
  Scrubber.max = String(Math.max(0, Readings.length - 1));
  Empty.hidden = Has_Points;
  if (!Has_Points) {
    Empty.textContent = Has_History_Error ?
      "Historical data could not be loaded. Live country counts are still available." :
      "No saved readings for this pool and period yet. Switch periods or try again later.";
    Selected.textContent = "No observed reading to inspect";
    Chart.replaceChildren();
    Geometry = null; Marker = null;
    return;
  }

  Geometry = Create_World_Chart_Geometry(Readings, Range, Now);
  Chart.replaceChildren();
  const Title = Svg_Element("title", {}, Pool + " pool over " + Range + ", " +
    Stats.observed + " observed reported totals, " + Stats.gaps + " gaps.");
  Chart.append(Title);
  for (let Part = 0; Part <= 3; Part++) {
    const Y = Geometry.top + Part * (Geometry.bottom - Geometry.top) / 3;
    Chart.append(Svg_Element("line", { x1: Geometry.left, x2: Geometry.right, y1: Y, y2: Y, class: "World_Gridline" }));
    const Value = Geometry.ceiling - Part * (Geometry.ceiling - Geometry.floor) / 3;
    Chart.append(Svg_Element("text", { x: 5, y: Y + 4, class: "World_Y_Label" }, Number_Format.format(Math.round(Value))));
  }
  for (const Gap of Geometry.gaps) {
    Chart.append(Svg_Element("rect", { x: Gap.x, y: Geometry.top, width: Gap.width,
      height: Geometry.bottom - Geometry.top, class: "World_Gap" }));
  }
  for (const Path of Geometry.paths) {
    Chart.append(Svg_Element("path", { d: Path, class: "World_Line", "vector-effect": "non-scaling-stroke" }));
  }
  Chart.append(Svg_Element("text", { x: Geometry.left, y: 239, class: "World_X_Label" },
    Date_Label(Now - WORLD_WINDOWS[Range])));
  Chart.append(Svg_Element("text", { x: Geometry.right, y: 239, class: "World_X_Label", "text-anchor": "end" },
    Date_Label(Now)));
  for (const Point of Geometry.points.filter(Point => Point.kind === "live")) {
    Chart.append(Svg_Element("circle", { cx: Point.x, cy: Point.y, r: 4, class: "World_Live_Marker" }));
  }
  Marker = Svg_Element("circle", { cx: 0, cy: 0, r: 7, class: "World_Selected_Marker" });
  Chart.append(Marker);
  const Preferred = Selected_Time === null ? -1 : Readings.findIndex(Point => Point.t === Selected_Time);
  Show_Selected(Preferred >= 0 ? Preferred : Readings.length - 1);
}

Panel.querySelectorAll(".World_Ranges button").forEach(Button => {
  Button.addEventListener("click", () => {
    Range = Button.dataset.window;
    Selected_Time = null;
    try { localStorage.setItem(Range_Key, Range); } catch { /* Optional. */ }
    Render_Chart();
  });
});
Scrubber.addEventListener("input", () => Show_Selected(Number(Scrubber.value)));
Chart.addEventListener("pointermove", Event => {
  if (!Geometry?.points?.length) return;
  const Bounds = Chart.getBoundingClientRect();
  const X = (Event.clientX - Bounds.left) / Bounds.width * 1000;
  let Low = 0, High = Geometry.points.length - 1;
  while (Low < High) {
    const Middle = Math.floor((Low + High) / 2);
    if (Geometry.points[Middle].x < X) Low = Middle + 1;
    else High = Middle;
  }
  const Index = Low && Math.abs(Geometry.points[Low - 1].x - X) <
    Math.abs(Geometry.points[Low].x - X) ? Low - 1 : Low;
  Show_Selected(Index);
});
Retry.addEventListener("click", () => {
  Has_History_Error = false;
  Retry.hidden = true;
  Empty.textContent = "Retrying saved activity history…";
  window.dispatchEvent(new CustomEvent("countrypulse:reload-history"));
});
Export.addEventListener("click", () => {
  if (!Readings.length) return;
  const Url = URL.createObjectURL(new Blob([World_Readings_Csv(Readings, Pool)], { type: "text/csv;charset=utf-8" }));
  const Link = document.createElement("a");
  Link.href = Url;
  Link.download = "countrypulse-world-" + Pool.toLowerCase() + "-" + Range + ".csv";
  document.body.append(Link);
  Link.click();
  Link.remove();
  setTimeout(() => URL.revokeObjectURL(Url), 1000);
});
window.addEventListener("countrypulse:history", Event => {
  History = Array.isArray(Event.detail?.Historical_Snapshots) ? Event.detail.Historical_Snapshots : [];
  Has_History_Error = false;
  Render_Chart();
});
window.addEventListener("countrypulse:history-failed", () => {
  Has_History_Error = true;
  Render_Chart();
});
window.addEventListener("countrypulse:data", Event => {
  Current = Event.detail || null;
  Pool = Current?.Room || Pool;
  Render_Chart();
});
window.addEventListener("countrypulse:pool-changing", Event => {
  Pool = Event.detail?.Room || Pool;
  Current = null;
  Selected_Time = null;
  Render_Chart();
});
Render_Chart();

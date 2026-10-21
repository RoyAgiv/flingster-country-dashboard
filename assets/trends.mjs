import {
  Analyze_Count_Quality,
  Calculate_Country_Movers,
  Calculate_Member_Growth,
} from "./trends-utils.mjs";

const Formatter = new Intl.NumberFormat("en-US");
const Pool_Buttons = Array.from(document.querySelectorAll(".Pool_Tab"));
const Window_Select = document.getElementById("Trend_Window");
const Trend_Rises = document.getElementById("Trend_Rises");
const Trend_Falls = document.getElementById("Trend_Falls");
const Trend_Status = document.getElementById("Trend_Status");
const Trend_Window_Label = document.getElementById("Trend_Window_Label");
const Global_Change = document.getElementById("Global_Change");
const Quality_Signal = document.getElementById("Quality_Signal");
const Tag_List = document.getElementById("Tag_List");
let Historical_Snapshots = Array.isArray(window.CountryPulse_History) ? window.CountryPulse_History : [];
let Current_Data = window.CountryPulse_Data || null;
let Trend_Window = "recent";

function Country_Flag(Country_Code) {
  if (Country_Code === "XK") return "🌍";
  return /^[A-Z]{2}$/.test(Country_Code) ?
    String.fromCodePoint(...[...Country_Code].map((Character) => 127397 + Character.charCodeAt(0))) : "🌍";
}

function Format_Signed(Value, Suffix = "") {
  return (Value > 0 ? "+" : "") + Formatter.format(Value) + Suffix;
}

function Update_Room_Buttons(Room) {
  for (const Button of Pool_Buttons) {
    Button.setAttribute("aria-checked", String(Button.dataset.room === Room));
  }
}

function Add_Empty(Container, Message) {
  Container.replaceChildren();
  const Text = document.createElement("div");
  Text.className = "Trend_Empty";
  Text.textContent = Message;
  Container.append(Text);
}

function Render_Mover_List(Container, Rows, Direction) {
  Container.replaceChildren();
  const Top_Rows = Rows.slice(0, 5);
  if (!Top_Rows.length) {
    Add_Empty(Container, Direction === "up" ? "No rising countries in this comparison." : "No falling countries in this comparison.");
    return;
  }
  for (const Row of Top_Rows) {
    const Button = document.createElement("button");
    Button.type = "button";
    Button.className = "Trend_Item";
    Button.title = "See " + Row.Name + " country history";
    const Name = document.createElement("div");
    Name.className = "Trend_Title";
    const Flag = document.createElement("span");
    Flag.textContent = Country_Flag(Row.Code);
    const Text = document.createElement("span");
    Text.textContent = Row.Name;
    Name.append(Flag, Text);
    const Change = document.createElement("div");
    Change.className = "Trend_Change " + (Direction === "up" ? "Up" : "Down");
    Change.textContent = Format_Signed(Row.Difference) + "  (" + (Row.Percent > 0 ? "+" : "") + Row.Percent + "%)";
    const Meta = document.createElement("div");
    Meta.className = "Trend_Meta";
    Meta.textContent = Formatter.format(Row.Before) + " → " + Formatter.format(Row.Count) + " reported";
    Button.append(Name, Change, Meta);
    Button.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("countrypulse:open-country", { detail: { Code: Row.Code } }));
    });
    Container.append(Button);
  }
}

function Render_Tags() {
  Tag_List.replaceChildren();
  const Tags = Array.isArray(Current_Data?.Tags) ? Current_Data.Tags : [];
  document.getElementById("Tag_Count").textContent = Tags.length ? Tags.length + " available interest tags" : "Interest tags unavailable";
  for (const Tag of Tags) {
    if (typeof Tag !== "string" || !/^[a-z0-9-]{1,48}$/i.test(Tag)) continue;
    const Chip = document.createElement("span");
    Chip.className = "Interest_Tag";
    Chip.textContent = Tag.replaceAll("-", " ");
    Tag_List.append(Chip);
  }
  const Metadata = Current_Data?.Meta || {};
  document.getElementById("Data_Meta").textContent =
    "Site: " + (Metadata.Site || "Flingster") +
    " · Visitor country: " + (Metadata.Visitor_Country || "not supplied") +
    " · " + (Metadata.Config_Fields || "—") + " configuration fields";
}

function Render_Membership() {
  const Members = Current_Data?.Adult_Members;
  const Note = document.getElementById("Members_Growth");
  if (!Number.isSafeInteger(Members)) {
    Note.textContent = "Membership history starting";
    return;
  }
  const Seconds = Math.floor(Date.now() / 1000);
  const Change = Calculate_Member_Growth(Historical_Snapshots, Members, Seconds);
  Note.textContent = Change === null ?
    "Daily growth appears after 24h" : Format_Signed(Change) + " vs 24h ago";
  Note.classList.toggle("Negative", Change !== null && Change < 0);
}

function Render_Quality() {
  if (!Current_Data?.Country_Rows?.length) {
    Quality_Signal.textContent = "Waiting for readings";
    Quality_Signal.removeAttribute("data-level");
    return;
  }
  const Quality = Analyze_Count_Quality(Current_Data.Country_Rows, Historical_Snapshots, Current_Data.Room);
  const Ratio = Quality.Factor === 12 ? Quality.Twelve_Ratio : Quality.Seven_Ratio;
  Quality_Signal.dataset.level = Quality.Pattern || Quality.Stale ? "warn" : "normal";
  Quality_Signal.textContent = Quality.Stale ? "Unchanged snapshots" :
    Quality.Pattern ? "Adjusted-looking counts" : "Site-reported counts";
  Quality_Signal.title = Quality.Stale ?
    "Two successive saved readings are identical, so historical changes may be stale." :
    Quality.Pattern ?
    Math.round(Ratio * 100) + "% of small-country counts are multiples of " + Quality.Factor +
    ". This suggests systematic rounding/scaling. Counts are not independently audited." :
    "Values are reported by the provider, not independently verified unique-user counts.";
  const Foot = document.getElementById("Trend_Quality_Foot");
  Foot.textContent = Quality.Pattern ?
    "Possible scaling (×" + Quality.Factor + ") in low counts · trends are approximate." :
    "Site-reported activity · trends are approximate, not verified headcounts.";
}

function Render_Movers() {
  Render_Quality();
  Render_Tags();
  Render_Membership();
  if (!Current_Data?.Country_Rows?.length) {
    Add_Empty(Trend_Rises, "Waiting for the current pool.");
    Add_Empty(Trend_Falls, "Waiting for the current pool.");
    Trend_Status.textContent = "—";
    Global_Change.textContent = "Waiting for history";
    return;
  }
  const Now_Seconds = Math.floor(Date.now() / 1000);
  const Result = Calculate_Country_Movers(
    Current_Data.Country_Rows, Historical_Snapshots, Current_Data.Room,
    Now_Seconds, Trend_Window
  );
  if (!Result.Baseline) {
    Add_Empty(Trend_Rises, "Collecting history…");
    Add_Empty(Trend_Falls, "Collecting history…");
    Trend_Status.textContent = "No matching historical sample yet";
    Global_Change.textContent = "More history needed";
    Trend_Window_Label.textContent = "Historical changes will appear as snapshots accumulate.";
    return;
  }
  const Elapsed_Minutes = Math.max(0, Math.round((Now_Seconds - Result.Baseline.t) / 60));
  Trend_Status.textContent = Result.Rises.length + " rising · " + Result.Falls.length + " falling";
  const Global_Difference = Current_Data.Online_Total - Result.Baseline.n;
  const Global_Percent = Math.round(Global_Difference / Result.Baseline.n * 1000) / 10;
  Global_Change.textContent = Format_Signed(Global_Difference) + " (" +
    Format_Signed(Global_Percent, "%") + ") since baseline";
  Trend_Window_Label.textContent = "Compared with " +
    (Elapsed_Minutes >= 60 ? Math.round(Elapsed_Minutes / 60) + "h" : Elapsed_Minutes + "m") +
    " ago in " + Current_Data.Room + " · countries ≥25 in both readings.";
  Render_Mover_List(Trend_Rises, Result.Rises, "up");
  Render_Mover_List(Trend_Falls, Result.Falls, "down");
}

function Render_All() {
  Update_Room_Buttons(Current_Data?.Room || "Adult");
  Render_Movers();
}

for (const Button of Pool_Buttons) {
  Button.addEventListener("keydown", (Event_Object) => {
    if(!["ArrowRight","ArrowLeft","ArrowDown","ArrowUp","Home","End"].includes(Event_Object.key))return;
    Event_Object.preventDefault();
    const Index=Pool_Buttons.indexOf(Button);
    const Next_Index=Event_Object.key==="Home"?0:Event_Object.key==="End"?Pool_Buttons.length-1:
      (Index+(["ArrowRight","ArrowDown"].includes(Event_Object.key)?1:-1)+Pool_Buttons.length)%Pool_Buttons.length;
    Pool_Buttons[Next_Index].focus();
    Pool_Buttons[Next_Index].click();
  });
  Button.addEventListener("click", () => {
    if (!Current_Data || Button.dataset.room !== Current_Data.Room) {
      Update_Room_Buttons(Button.dataset.room);
      window.dispatchEvent(new CustomEvent("countrypulse:select-pool", { detail: { Room: Button.dataset.room } }));
    }
  });
}
Window_Select.addEventListener("change", (Event_Object) => {
  Trend_Window = Event_Object.target.value;
  Render_Movers();
});
window.addEventListener("countrypulse:data", (Event_Object) => {
  Current_Data = Event_Object.detail;
  Render_All();
});
window.addEventListener("countrypulse:history", (Event_Object) => {
  Historical_Snapshots = Event_Object.detail.Historical_Snapshots || [];
  Render_All();
});
window.addEventListener("countrypulse:pool-changing", (Event_Object) => {
  Current_Data = { Room: Event_Object.detail.Room, Country_Rows: [], Tags: [], Meta: {} };
  Render_All();
});
window.addEventListener("countrypulse:request-trends", Render_All);
Render_All();
window.dispatchEvent(new Event("countrypulse:request-state"));

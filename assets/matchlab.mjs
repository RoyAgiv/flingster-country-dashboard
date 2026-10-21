import {
  MatchLab_Storage_Key,
  Summarize_Match_Sessions,
  Validate_Match_Session,
} from "./matchlab-utils.mjs";
import { Evaluate_Interest_Tag } from "./provenance-utils.mjs";

const MatchLab_Panel = document.createElement("details");
let Completed_Sessions = [];
let Active_Session = null;
const Number_Formatter = new Intl.NumberFormat("en-US");

function Load_Sessions() {
  try {
    const Stored = JSON.parse(localStorage.getItem(MatchLab_Storage_Key) || "{}");
    Completed_Sessions = Array.isArray(Stored.sessions) ?
      Stored.sessions.filter(Validate_Match_Session).slice(-200) : [];
    Active_Session = Stored.active && Number.isSafeInteger(Stored.active.started) &&
      Stored.active.started <= Math.floor(Date.now() / 1000) ? Stored.active : null;
  } catch (Error_Object) {
    Completed_Sessions = [];
    Active_Session = null;
  }
}

function Save_Sessions() {
  try {
    localStorage.setItem(MatchLab_Storage_Key,
      JSON.stringify({ sessions: Completed_Sessions.slice(-200), active: Active_Session }));
  } catch (Error_Object) {
    Set_Feedback("Browser storage unavailable. Sessions won't survive a refresh.", true);
  }
}

function Set_Feedback(Text, Is_Error = false) {
  const Element = document.getElementById("MatchLab_Feedback");
  Element.textContent = Text;
  Element.dataset.error = String(Is_Error);
}

function Format_Duration(Duration_Seconds) {
  const Seconds = Math.max(0, Math.floor(Duration_Seconds));
  const Hours = Math.floor(Seconds / 3600);
  const Minutes = Math.floor((Seconds % 3600) / 60);
  const Remainder = Seconds % 60;
  return (Hours ? String(Hours).padStart(2, "0") + ":" : "") +
    String(Minutes).padStart(2, "0") + ":" + String(Remainder).padStart(2, "0");
}

function Refresh_Country_Choices() {
  const Menu = document.getElementById("MatchLab_Country");
  const Current = Menu.value || "ALL";
  const Country_Rows = window.CountryPulse_Data?.Country_Rows || [];
  const Countries = [...Country_Rows].sort((First, Second) => First.Name.localeCompare(Second.Name));
  Menu.replaceChildren();
  const Any_Option = document.createElement("option");
  Any_Option.value = "ALL";
  Any_Option.textContent = "Any country";
  Menu.append(Any_Option);
  for (const Country of Countries) {
    if (!/^[A-Z]{2}$/.test(Country.Code)) continue;
    const Option = document.createElement("option");
    Option.value = Country.Code;
    Option.textContent = Country.Name;
    Menu.append(Option);
  }
  Menu.value = Countries.some((Country) => Country.Code === Current) ? Current : "ALL";
}

function Refresh_Tags() {
  const Suggestions = document.getElementById("MatchLab_Tag_Choices");
  const Tags = window.CountryPulse_Data?.Tags || [];
  Suggestions.replaceChildren();
  for (const Tag of Tags) {
    if (typeof Tag !== "string" || !/^[a-z0-9-]{1,48}$/i.test(Tag)) continue;
    const Option = document.createElement("option");
    Option.value = Tag;
    Suggestions.append(Option);
  }
}

function Start_Session() {
  if (Active_Session) return;
  const Selected_Country = document.getElementById("MatchLab_Country").value;
  const Selected_Interest = document.getElementById("MatchLab_Interest").value.trim().toLowerCase().slice(0,48);
  const Selected_Mode = document.getElementById("MatchLab_Mode").value;
  const Selected_Filter = document.getElementById("MatchLab_Filter").value;
  const Tag_Result = Selected_Interest ? Evaluate_Interest_Tag(Selected_Interest) : null;
  if (Tag_Result && ["invalid", "reported-rejected"].includes(Tag_Result.Status)) {
    Set_Feedback("This interest is invalid or was previously rejected by Flingster. Choose another.", true);
    return;
  }
  Active_Session = {
    started: Math.floor(Date.now() / 1000),
    country: Selected_Country || "ALL",
    interest: Selected_Interest,
    mode: Selected_Mode,
    filter: Selected_Filter,
    good: 0, attempts: 0,
  };
  Save_Sessions();
  Render_All();
  Set_Feedback("Session started. Count connections and worthwhile matches here—not in the chat.");
}

function Record_Connection(Is_Good) {
  if (!Active_Session) return;
  Active_Session.attempts++;
  if (Is_Good) Active_Session.good++;
  Save_Sessions();
  Render_All();
}

function Finish_Session() {
  if (!Active_Session) return;
  const Finished = { ...Active_Session, ended: Math.floor(Date.now() / 1000) };
  Active_Session = null;
  if (Validate_Match_Session(Finished)) {
    Completed_Sessions.push(Finished);
    Completed_Sessions = Completed_Sessions.slice(-200);
    Set_Feedback("Session saved locally. No chat content or partner details are recorded.");
  } else {
    Set_Feedback("Session shorter than 30 seconds (or longer than 24 hours) wasn't saved.", true);
  }
  Save_Sessions();
  Render_All();
}

function Export_Sessions() {
  if (!Completed_Sessions.length) return;
  const Headers = ["Started UTC", "Duration minutes", "Country", "Interest", "Mode", "Filter",
    "Connections", "Good matches"];
  const Rows = Completed_Sessions.map((Session) => [
    new Date(Session.started * 1000).toISOString(),
    ((Session.ended - Session.started) / 60).toFixed(1),
    Session.country, Session.interest, Session.mode, Session.filter,
    Session.attempts, Session.good,
  ]);
  const Csv = [Headers, ...Rows].map((Row) => Row.map((Value) =>
    '"' + String(Value).replaceAll('"', '""') + '"').join(",")).join("\r\n");
  const Csv_Url = URL.createObjectURL(new Blob([Csv], { type: "text/csv;charset=utf-8" }));
  const Download = document.createElement("a");
  Download.href = Csv_Url;
  Download.download = "country-pulse-matchlab.csv";
  document.body.append(Download);
  Download.click();
  Download.remove();
  setTimeout(() => URL.revokeObjectURL(Csv_Url), 1000);
}

function Clear_Sessions() {
  if (!confirm("Delete all your local MatchLab sessions? This cannot be undone.")) return;
  Completed_Sessions = [];
  Active_Session = null;
  Save_Sessions();
  Render_All();
  Set_Feedback("Local MatchLab data cleared.");
}

function Render_All() {
  const Active_Panel = document.getElementById("MatchLab_Active");
  Active_Panel.hidden = !Active_Session;
  document.getElementById("MatchLab_Start").disabled = Boolean(Active_Session);
  if (Active_Session) {
    document.getElementById("MatchLab_Clock").textContent = Format_Duration(
      Math.floor(Date.now() / 1000) - Active_Session.started);
    document.getElementById("MatchLab_Active_Detail").textContent =
      Active_Session.attempts + " connections · " + Active_Session.good +
      " good matches · " + (Active_Session.interest || "no interest tag");
  }
  const Summary = Summarize_Match_Sessions(Completed_Sessions);
  document.getElementById("MatchLab_Session_Count").textContent = Number_Formatter.format(Summary.Sessions);
  document.getElementById("MatchLab_Matches_Hour").textContent =
    Summary.Matches_Per_Hour === null ? "—" : String(Summary.Matches_Per_Hour);
  document.getElementById("MatchLab_Success_Rate").textContent =
    Summary.Conversion_Rate === null ? "—" : Summary.Conversion_Rate + "%";
  document.getElementById("MatchLab_Best_Tag").textContent = Summary.Best_Interest ?
    Summary.Best_Interest.Interest + " · " + Summary.Best_Interest.Rate + " good/hour" :
    "After 2+ sessions and 30m per interest";
  const List = document.getElementById("MatchLab_Recent");
  List.replaceChildren();
  for (const Session of [...Completed_Sessions].reverse().slice(0,5)) {
    const Item = document.createElement("div");
    Item.className = "MatchLab_Row";
    const Left = document.createElement("span");
    Left.textContent = new Date(Session.started * 1000).toLocaleDateString() +
      " · " + (Session.interest || "no tag") + " · " + Session.country;
    const Right = document.createElement("span");
    Right.textContent = Session.good + " good / " + Session.attempts +
      " connections · " + Format_Duration(Session.ended - Session.started);
    Item.append(Left, Right);
    List.append(Item);
  }
  document.getElementById("MatchLab_Export").disabled = !Completed_Sessions.length;
}

function Setup_MatchLab() {
  MatchLab_Panel.id = "MatchLab";
  MatchLab_Panel.className = "Data_Disclosure";
  MatchLab_Panel.innerHTML =
    '<summary>MatchLab · Track your actual match results (private)</summary>' +
    '<div class="MatchLab_Body">' +
    '<div class="MatchLab_Form">' +
      '<label class="MatchLab_Field"><span>Country</span><select id="MatchLab_Country"><option value="ALL">Any country</option></select></label>' +
      '<label class="MatchLab_Field"><span>Interest (optional)</span><input id="MatchLab_Interest" list="MatchLab_Tag_Choices" maxlength="48" placeholder="e.g. flirt"><datalist id="MatchLab_Tag_Choices"></datalist></label>' +
      '<label class="MatchLab_Field"><span>Chat mode</span><select id="MatchLab_Mode"><option value="video">Video</option><option value="text">Text</option></select></label>' +
      '<label class="MatchLab_Field"><span>Partner filter you used</span><select id="MatchLab_Filter"><option value="any">Any / none</option><option value="female">Women</option><option value="male">Men</option><option value="couples">Couples</option></select></label>' +
    '</div>' +
    '<div class="MatchLab_Actions"><button id="MatchLab_Start" class="MatchLab_Button" type="button">Start session</button><span class="Research_Muted">Local-only · no login · no recordings</span></div>' +
    '<div class="MatchLab_Active" id="MatchLab_Active" hidden><div class="MatchLab_Clock" id="MatchLab_Clock">00:00</div><div class="Research_Muted" id="MatchLab_Active_Detail"></div>' +
    '<div class="MatchLab_Actions"><button id="MatchLab_Connection" class="MatchLab_Button Secondary" type="button">+ Connection</button><button id="MatchLab_Good" class="MatchLab_Button" type="button">+ Worthwhile match</button><button id="MatchLab_Finish" class="MatchLab_Button Secondary" type="button">Finish</button></div></div>' +
    '<div class="MatchLab_Feedback" id="MatchLab_Feedback" aria-live="polite"></div>' +
    '<div class="MatchLab_Stats">' +
      '<div class="MatchLab_Stat"><strong id="MatchLab_Session_Count">0</strong><span>Saved sessions</span></div>' +
      '<div class="MatchLab_Stat"><strong id="MatchLab_Matches_Hour">—</strong><span>Good matches/hour</span></div>' +
      '<div class="MatchLab_Stat"><strong id="MatchLab_Success_Rate">—</strong><span>Connection success</span></div>' +
    '</div>' +
    '<div class="Research_Title">Best-tested interest <span class="Research_Muted" id="MatchLab_Best_Tag">After enough trials</span></div>' +
    '<div id="MatchLab_Recent" style="margin-top:10px"></div>' +
    '<div class="MatchLab_Actions"><button id="MatchLab_Export" class="MatchLab_Button Secondary" type="button">Export CSV</button>' +
    '<button id="MatchLab_Clear" class="MatchLab_Button Danger" type="button">Clear local data</button></div>' +
    '<p class="MatchLab_Foot">Only anonymous session settings, duration, connection counts and good-match totals stay in this browser. They are not synced or uploaded. Interest and partner filters must be set in the chat site separately. One lucky session is not treated as a recommendation.</p>' +
    '</div>';
  document.getElementById("More_Data").after(MatchLab_Panel);
  document.getElementById("MatchLab_Start").addEventListener("click", Start_Session);
  document.getElementById("MatchLab_Connection").addEventListener("click", () => Record_Connection(false));
  document.getElementById("MatchLab_Good").addEventListener("click", () => Record_Connection(true));
  document.getElementById("MatchLab_Finish").addEventListener("click", Finish_Session);
  document.getElementById("MatchLab_Export").addEventListener("click", Export_Sessions);
  document.getElementById("MatchLab_Clear").addEventListener("click", Clear_Sessions);
  window.addEventListener("countrypulse:data", () => {
    Refresh_Country_Choices();
    Refresh_Tags();
  });
  Refresh_Country_Choices();
  Refresh_Tags();
  Load_Sessions();
  Render_All();
  setInterval(() => { if (Active_Session) Render_All(); }, 1000);
}

Setup_MatchLab();

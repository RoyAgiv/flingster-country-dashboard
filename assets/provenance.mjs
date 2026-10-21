import {
  Get_Replica_Check,
  Summarize_Server_Agreement,
  Summarize_Member_Reliability,
  Analyze_Unusual_Activity_Jump,
  Evaluate_Interest_Tag,
} from "./provenance-utils.mjs";

const Source_Badge = document.createElement("span");
const More_Data = document.querySelector("#More_Data .Data_Inside");
const Verified_Tag_Choices = document.querySelector("#Tag_List");
let Historical_Snapshots = Array.isArray(window.CountryPulse_History) ? window.CountryPulse_History : [];
let Current_Data = window.CountryPulse_Data || null;

function Create_Research() {
  Source_Badge.id = "Source_Health";
  Source_Badge.className = "Source_Health";
  Source_Badge.dataset.state = "pending";
  Source_Badge.textContent = "Server check pending";
  document.querySelector(".Pool_Qualifier").insertBefore(Source_Badge, document.querySelector(".Pool_Qualifier details"));

  const Section = document.createElement("section");
  Section.id = "Source_Check_Details";
  Section.innerHTML = '<div class="Data_Section_Label">Server consistency</div>' +
    '<div class="Research_Title" id="Source_Summary">Waiting for the next multi-server snapshot</div>' +
    '<div id="Source_List" class="Research_Numbers"></div>' +
    '<p class="Research_Muted" id="Source_Notice">Primary and replica servers can cache different readings. Agreement does not prove these are real people.</p>';
  More_Data.prepend(Section);

  const Visits = document.querySelector(".Site_Visits");
  const Analytics = Visits.parentElement;
  const Device_Note = document.createElement("div");
  Device_Note.className = "Research_Muted";
  Device_Note.textContent = "Estimated average visit · Flingster 10m 24s · DirtyRoulette 12m 59s. September 2026, Semrush.";
  const Device_Block = document.createElement("div");
  Device_Block.className = "Research_Numbers";
  Device_Block.style.marginTop = "11px";
  for (const [Name, Label, Value] of [
    ["Flingster · US", "Mobile share · Sep 2026", "67.86%"],
    ["DirtyRoulette · US", "Mobile share · Sep 2026", "68.37%"],
    ["Flingster · India", "Mobile share · Sep 2026", "71.53%"],
    ["DirtyRoulette · India", "Mobile share · Sep 2026", "89.12%"],
  ]) {
    const Card = document.createElement("div");
    Card.className = "Research_Number";
    const Heading = document.createElement("span");
    Heading.textContent = Name;
    const Figure = document.createElement("b");
    Figure.textContent = Value;
    const Description = document.createElement("span");
    Description.textContent = Label;
    Card.append(Heading, Figure, Description);
    Device_Block.append(Card);
  }
  const Comparison_Note = document.createElement("p");
  Comparison_Note.className = "Research_Muted";
  Comparison_Note.textContent = "Based on September estimated monthly visits and average durations, the two websites imply about 5,540 average simultaneous visits, versus a much larger Adult feed. Different definitions and timing prevent a direct headcount comparison.";
  Visits.after(Device_Note, Device_Block, Comparison_Note);

  const Archive = document.createElement("section");
  Archive.innerHTML = '<div class="Data_Section_Label">DirtyRoulette studies · Historical, 2021</div>' +
    '<div class="Research_Numbers">' +
    '<div class="Research_Number"><b>52M</b><span>Reported first-half visits</span></div>' +
    '<div class="Research_Number"><b>7m 23s</b><span>Avg visit duration</span></div>' +
    '<div class="Research_Number"><b>&gt;70%</b><span>Visits on phones</span></div>' +
    '<div class="Research_Number"><b>235</b><span>Countries in its 2021 study</span></div>' +
    '</div><p class="Research_Muted">Greece: 9m 21s average visit · India: ~6m · top 20 countries: 76.45% of traffic. Historic research, not present-day counts. ' +
    '<a href="https://dirtyroulette.com/studies/" target="_blank" rel="noopener noreferrer">Original studies ↗</a></p>' +
    '<p class="Research_Muted">A study reported 37% of surveyed male gender-filter users sought men or trans partners; 24% of surveyed female gender-filter users selected women. These are filter preferences, not user gender shares.</p>';
  More_Data.append(Archive);

  const Shortcuts = document.createElement("section");
  Shortcuts.innerHTML = '<div class="Data_Section_Label">Matching options</div>' +
    '<div class="Research_Grid">' +
      '<div class="Research_Card"><strong>Working preference shortcuts</strong>' +
        '<p><a href="https://flingster.com/gay-chat/" target="_blank" rel="noopener noreferrer">Gay chat</a> (gay tag) · ' +
        '<a href="https://flingster.com/lesbian-chat/" target="_blank" rel="noopener noreferrer">Lesbian chat</a> (lesbian tag) · ' +
        '<a href="https://flingster.com/text-chat/" target="_blank" rel="noopener noreferrer">Text chat</a> (text mode)</p></div>' +
      '<div class="Research_Card"><strong>Premium gender filter</strong><p>' +
        '<a href="https://flingster.com/chat-with-girls/" target="_blank" rel="noopener noreferrer">Chat with girls</a> launches female-selection logic, but partner-gender filtering can be premium-gated.</p></div>' +
    '</div>' +
    '<p class="Research_Muted">Some other themed URLs redirect or only alter saved interest preferences; they are not separate public user pools.</p>';
  More_Data.append(Shortcuts);

  const Tag_Check = document.createElement("div");
  Tag_Check.innerHTML = '<div class="Research_Title">Interest tag checker <span class="Research_Muted">· October 2026 research, not live validation</span></div>' +
    '<div class="Tag_Checker"><input id="Tag_Check_Input" type="text" maxlength="48" autocomplete="off" placeholder="e.g. roleplay or girls" aria-label="Interest tag to check">' +
    '<button id="Tag_Check_Button" type="button">Check interest</button></div>' +
    '<div id="Tag_Check_Result" class="Tag_Check_Result" aria-live="polite">Try a suggested tag or enter another one.</div>';
  More_Data.insertBefore(Tag_Check, Verified_Tag_Choices.parentElement.nextSibling);
  document.getElementById("Tag_Check_Button").addEventListener("click", Check_Tag);
  document.getElementById("Tag_Check_Input").addEventListener("keydown", (Event_Object) => {
    if (Event_Object.key === "Enter") { Event_Object.preventDefault(); Check_Tag(); }
  });
}

function Check_Tag() {
  const Tag_Value = document.getElementById("Tag_Check_Input").value;
  if(!Tag_Value.trim()){
    const Output=document.getElementById("Tag_Check_Result");
    Output.dataset.status="invalid";
    Output.textContent="Enter an interest to check.";
    return;
  }
  const Result = Evaluate_Interest_Tag(Tag_Value);
  const Output = document.getElementById("Tag_Check_Result");
  Output.dataset.status = Result.Status;
  Output.textContent = (Result.Tag ? Result.Tag + " · " : "") + Result.Message;
}

function Render_Research() {
  if (!Current_Data) return;
  const Pool = Current_Data.Room || "Adult";
  const Latest_Check = Get_Replica_Check(Historical_Snapshots, Pool);
  const Date_Seconds = Math.floor(Date.now() / 1000);
  const Sources = Latest_Check?.checks?.[Pool];
  const Agreement = Summarize_Server_Agreement(Sources);
  const Source_List = document.getElementById("Source_List");
  Source_List.replaceChildren();
  if (Pool === "Combined" && !Sources) {
    Source_Badge.dataset.state = "pending";
    Source_Badge.textContent = "Combined: single feed";
    Source_Badge.title = "Alternate-host checks currently cover Adult and Default only.";
    document.getElementById("Source_Summary").textContent = "Combined is currently not cross-checked between hosts.";
  } else if (Agreement.Status === "insufficient") {
    Source_Badge.dataset.state = "pending";
    Source_Badge.textContent = "Server check pending";
    document.getElementById("Source_Summary").textContent =
      "The next scheduled reading will cross-check up to three statistics hosts.";
  } else {
    const Age_Minutes = Math.max(0, Math.floor((Date_Seconds - Latest_Check.t) / 60));
    const Too_Old = Age_Minutes > 120;
    Source_Badge.dataset.state = Agreement.Status === "divergent" || Too_Old ? "warning" : "normal";
    Source_Badge.textContent = Too_Old ? "Server check stale" :
      (Agreement.Status === "divergent" ? "Servers disagree" : "Servers close");
    Source_Badge.title = Agreement.Spread_Pct + "% difference in worldwide counts across " +
      Agreement.Sample_Count + " hosts; last compared " + Age_Minutes + " minutes ago.";
    document.getElementById("Source_Summary").textContent =
      "Counts differ by " + Agreement.Spread_Pct + "% · " + Agreement.Sample_Count +
      " servers · checked " + Age_Minutes + "m ago";
    for (const Entry of Sources) {
      const Card = document.createElement("div");
      Card.className = "Research_Number";
      const Host = document.createElement("span");
      Host.textContent = Entry.host;
      const Value = document.createElement("b");
      Value.textContent = new Intl.NumberFormat("en-US").format(Entry.n);
      const Members = document.createElement("span");
      Members.textContent = "Members " + (Number.isSafeInteger(Entry.members) ?
        new Intl.NumberFormat("en-US").format(Entry.members) : "unavailable");
      Card.append(Host, Value, Members);
      Source_List.append(Card);
    }
    if (Agreement.Member_Spread_Pct !== null && Agreement.Member_Spread_Pct > 0.4) {
      document.getElementById("Source_Notice").textContent =
        "Member totals differ across servers by " + Agreement.Member_Spread_Pct +
        "%. Membership growth is withheld until consistency improves.";
    } else {
      document.getElementById("Source_Notice").textContent =
        "Public endpoints may have different cache ages. Agreement is not a verification of people.";
    }
  }
  const Member_Result = Summarize_Member_Reliability(
    Historical_Snapshots, Current_Data.Adult_Members, Date_Seconds
  );
  const Growth_Label = document.getElementById("Members_Growth");
  Growth_Label.textContent = Member_Result.Trusted ?
    ((Member_Result.Growth >= 0 ? "+" : "") +
      new Intl.NumberFormat("en-US").format(Member_Result.Growth) + " vs 24h, cross-checked") :
    Member_Result.Reason;
  Growth_Label.classList.toggle("Negative", !Member_Result.Trusted);
  const Jump = Analyze_Unusual_Activity_Jump(Historical_Snapshots, Pool);
  if (Jump) Source_Badge.title += " · Latest saved pool change " + Jump.Percent + "%; unusual jump.";
}

Create_Research();
window.addEventListener("countrypulse:history", (Event_Object) => {
  Historical_Snapshots = Event_Object.detail.Historical_Snapshots || [];
  Render_Research();
});
window.addEventListener("countrypulse:data", (Event_Object) => {
  Current_Data = Event_Object.detail;
  Render_Research();
});
window.addEventListener("countrypulse:pool-changing", (Event_Object) => {
  Current_Data = { Room: Event_Object.detail.Room, Adult_Members: window.CountryPulse_Data?.Adult_Members };
  Render_Research();
});
Render_Research();

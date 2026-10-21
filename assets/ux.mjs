import { Compare_Countries, Age_Label } from "./reliability-utils.mjs";
import { Aggregate_Hourly } from "./insights-utils.mjs";
import { Get_Pool_Snapshots } from "./trends-utils.mjs";

const View_Key = "countrypulse-view-v1";
const Country_Selects = [];
const Format_Number = new Intl.NumberFormat("en-US");
const Format_Share = new Intl.NumberFormat("en-US",{maximumFractionDigits:2,minimumFractionDigits:1});
const Search_Input = document.getElementById("Search_Input");
const Sort_Select = document.getElementById("Sort_Select");
const Selected_Region_Codes = ["US","IL"];
let Current_Data = window.CountryPulse_Data || null;
let Saved_History = window.CountryPulse_History || [];
let Observation_Status = null;
let Active_Country_Code = null;
let Compare_Period = "recent";
let Has_Initialized_View = false;

function Element(Tag_Name, Class_Name = "", Content = "") {
  const Node = document.createElement(Tag_Name);
  if (Class_Name) Node.className = Class_Name;
  if (Content) Node.textContent = Content;
  return Node;
}

function Format_Signed(Value, Suffix = "") {
  return (Value > 0 ? "+" : "") + Value + Suffix;
}

function Initial_Href(Id) {
  return "#" + Id;
}

function Create_Quick_Navigation() {
  document.querySelector(".Content_Grid > .Panel").id = "rankings";
  document.querySelector(".Trends_Panel").id = "trends";
  document.querySelector('.Panel[aria-label="All countries"]').id = "countries";
  const Nav = Element("nav","Quick_Nav");
  Nav.id="Quick_Nav";
  Nav.setAttribute("aria-label","CountryPulse sections");
  const Links = Element("div","Quick_Nav_Links");
  for (const [Id,Text] of [["countries","Countries"],["trends","Trends"],["Network_Explorer","Networks"],
    ["Country_Compare","Compare"],["MatchLab","MatchLab"],["More_Data","Sources"]]) {
    const Link = Element("a","Quick_Nav_Link",Text);
    Link.href=Initial_Href(Id);
    Link.addEventListener("click",(Event_Object)=>{
      const Target = document.getElementById(Id);
      if(!Target)return;
      Event_Object.preventDefault();
      if(Target instanceof HTMLDetailsElement)Target.open=true;
      Target.scrollIntoView({behavior:"smooth",block:"start"});
    });
    Links.append(Link);
  }
  const Right = Element("div","Quick_Nav_Right");
  const Freshness = Element("span","Quick_Data_Status","Checking…");
  Freshness.id="Quick_Data_Status";
  Freshness.setAttribute("role","status");
  Freshness.setAttribute("aria-live","polite");
  const Quick_Search = Element("input","Quick_Search");
  Quick_Search.id="Quick_Search";
  Quick_Search.type="search";
  Quick_Search.autocomplete="off";
  Quick_Search.placeholder="Find country…";
  Quick_Search.setAttribute("aria-label","Find a country");
  Quick_Search.addEventListener("input",()=>{
    Search_Input.value=Quick_Search.value;
    Search_Input.dispatchEvent(new Event("input",{bubbles:true}));
  });
  Quick_Search.addEventListener("keydown",(Event_Object)=>{
    if(Event_Object.key==="Enter"){
      Event_Object.preventDefault();
      document.getElementById("countries").scrollIntoView({behavior:"smooth",block:"start"});
      Search_Input.focus();
    }
  });
  Search_Input.addEventListener("input",()=>{
    if(Quick_Search.value!==Search_Input.value)Quick_Search.value=Search_Input.value;
  });
  Right.append(Freshness,Quick_Search);
  Nav.append(Links,Right);
  document.querySelector(".Site_Bar").after(Nav);
  return Nav;
}

function Create_View_Actions() {
  const Nav = document.querySelector(".Quick_Nav");
  const Bar = Element("div","View_Actions");
  Bar.id="View_Actions";
  const Status = Element("span","View_Action_Status","");
  Status.id="View_Action_Status";
  const Status_Text = Element("div","View_Meta","");
  Status_Text.id="View_Meta";
  const View_Badge = Element("span","View_Badge","Reported estimates");
  View_Badge.id="View_Badge";
  const Button_Actions = [["Copy link",Share_View],["Save view",Save_View],["Restore view",Restore_View]];
  const Actions = Element("div","View_Buttons");
  for(const [Text,Handler] of Button_Actions){
    const Button=Element("button","Secondary_Button",Text);
    Button.type="button";
    Button.addEventListener("click",Handler);
    Actions.append(Button);
  }
  Bar.append(View_Badge,Status_Text,Actions,Status);
  Nav.after(Bar);

  const Pool_Toolbar = document.querySelector(".Pool_Toolbar");
  const Pool_Hint = Element("div","Pool_Inline_Hint","Adult · used on tested Flingster and DirtyRoulette pages");
  Pool_Hint.id="Pool_Inline_Hint";
  Pool_Toolbar.append(Pool_Hint);

  const Refresh_Notice = document.getElementById("Refresh_Notice");
  Refresh_Notice?.setAttribute("aria-live","polite");
  Render_Freshness();
}

function Collect_View() {
  return {
    pool:Current_Data?.Room || document.querySelector(".Pool_Tab[aria-checked=true]")?.dataset.room || "Adult",
    top:document.getElementById("Top_Limit")?.value || "25",
    range:document.getElementById("Trend_Window")?.value || "recent",
    search:Search_Input.value,
    sort:Sort_Select.value,
    compare:Country_Selects.map(Selector=>Selector.value).filter(Boolean).slice(0,4),
    period:Compare_Period,
  };
}

function View_Url(View) {
  const Target = new URL(location.origin+location.pathname);
  if(View.pool!=="Adult")Target.searchParams.set("pool",View.pool);
  if(View.top!=="25")Target.searchParams.set("top",View.top);
  if(View.range!=="recent")Target.searchParams.set("range",View.range);
  if(View.search)Target.searchParams.set("q",View.search);
  if(View.sort!=="largest")Target.searchParams.set("sort",View.sort);
  if(View.compare.length)Target.searchParams.set("compare",View.compare.join(","));
  if(View.period!=="recent")Target.searchParams.set("period",View.period);
  return Target.href;
}

function Report_View_Action(Message) {
  const Status = document.getElementById("View_Action_Status");
  Status.textContent=Message;
}

async function Share_View() {
  const Link = View_Url(Collect_View());
  try {
    await navigator.clipboard.writeText(Link);
    Report_View_Action("Link copied");
  } catch(Error_Object) {
    prompt("Copy this shareable view link:",Link);
    Report_View_Action("Link ready to copy");
  }
}

function Save_View() {
  try {
    localStorage.setItem(View_Key,JSON.stringify(Collect_View()));
    Report_View_Action("View saved in this browser");
  } catch(Error_Object){Report_View_Action("Browser storage unavailable");}
}

function Restore_View() {
  let View = null;
  try{View=JSON.parse(localStorage.getItem(View_Key)||"null");}
  catch(Error_Object){View=null;}
  if(!View){Report_View_Action("No saved view yet");return;}
  Apply_View(View);
  Report_View_Action("Saved view restored");
}

function Apply_View(View) {
  if(!View||typeof View!=="object")return;
  if(["Adult","Default","Combined"].includes(View.pool) &&
      View.pool!==(window.CountryPulse_Data?.Room||"Adult")) {
    window.dispatchEvent(new CustomEvent("countrypulse:select-pool",{detail:{Room:View.pool}}));
  }
  const Top = document.getElementById("Top_Limit");
  if(Top&&["10","25","50","1000"].includes(String(View.top))){
    Top.value=String(View.top);
    Top.dispatchEvent(new Event("change"));
  }
  const Range = document.getElementById("Trend_Window");
  if(Range&&["recent","1h","24h","7d"].includes(View.range)){
    Range.value=View.range;
    Range.dispatchEvent(new Event("change"));
  }
  if(typeof View.search==="string"){
    Search_Input.value=View.search.slice(0,70);
    Search_Input.dispatchEvent(new Event("input"));
  }
  if(["largest","smallest","name"].includes(View.sort)){
    Sort_Select.value=View.sort;
    Sort_Select.dispatchEvent(new Event("change"));
  }
  if(Array.isArray(View.compare)) {
    Selected_Region_Codes.splice(0,Selected_Region_Codes.length,...View.compare
      .filter(Code=>typeof Code==="string"&&/^[A-Z]{2}$/.test(Code)).slice(0,4));
  }
  if(["recent","1h","24h","7d"].includes(View.period)){
    Compare_Period=View.period;
    document.getElementById("Compare_Period").value=Compare_Period;
  }
  Refresh_Compare();
}

function Restore_From_Url() {
  if(Has_Initialized_View)return;
  Has_Initialized_View=true;
  const Params=new URLSearchParams(location.search);
  if(!["pool","top","range","q","compare","period","sort"].some(Key=>Params.has(Key)))return;
  Apply_View({
    pool:Params.get("pool")||"Adult",
    top:Params.get("top")||"25",
    range:Params.get("range")||"recent",
    search:Params.get("q")||"",
    sort:Params.get("sort")||"largest",
    compare:(Params.get("compare")||"").split(",").filter(Boolean),
    period:Params.get("period")||"recent",
  });
}

function Create_Compare() {
  const Panel = Element("details","Data_Disclosure Compare_Panel");
  Panel.id="Country_Compare";
  const Summary=Element("summary","","Compare countries · 2–4 side by side");
  const Body=Element("div","Compare_Inner");
  const Description=Element("p","Subheading","Compare the same activity pool and aligned time window. Saved readings stay labeled as saved.");
  const Toolbar=Element("div","Compare_Toolbar");
  const Compare_Selects=Element("div","Compare_Selects");
  for(let Index=0;Index<4;Index++){
    const Field=Element("label","Compare_Select_Label");
    const Caption=Element("span","",Index<2?"Country "+(Index+1):"Optional "+(Index+1));
    const Selector=Element("select","Compare_Select");
    Selector.setAttribute("aria-label","Comparison country "+(Index+1));
    Selector.addEventListener("change",()=>{Selected_Region_Codes.splice(0,Selected_Region_Codes.length,
      ...Country_Selects.map(Item=>Item.value).filter(Boolean));Render_Compare();});
    Country_Selects.push(Selector);
    Field.append(Caption,Selector);
    Compare_Selects.append(Field);
  }
  const Period=Element("select","Compare_Period");
  Period.id="Compare_Period";
  Period.setAttribute("aria-label","Country comparison time range");
  for(const [Key,Label] of [["recent","Last saved"],["1h","1 hour"],["24h","24 hours"],["7d","7 days"]]){
    const Option=Element("option","",Label);Option.value=Key;Period.append(Option);
  }
  Period.addEventListener("change",()=>{Compare_Period=Period.value;Render_Compare();});
  Toolbar.append(Compare_Selects,Period);
  const Context=Element("div","Compare_Context");
  Context.id="Compare_Context";
  const Results=Element("div","Compare_Results");
  Results.id="Compare_Results";
  Body.append(Description,Toolbar,Context,Results);
  Panel.append(Summary,Body);
  document.querySelector(".Content_Grid").after(Panel);

  const Country_Header = document.querySelector(".Insight_Title_Row");
  if(Country_Header){
    const Add=Element("button","Insight_Icon_Button Compare_Add_Button","+");
    Add.type="button";
    Add.title="Add this country to comparison";
    Add.setAttribute("aria-label","Add this country to comparison");
    Add.addEventListener("click",()=>{
      if(!Active_Country_Code)return;
      const Current=Country_Selects.map(Item=>Item.value).filter(Boolean);
      if(!Current.includes(Active_Country_Code)&&Current.length<4)Current.push(Active_Country_Code);
      else if(!Current.includes(Active_Country_Code)) {
        Report_View_Action("Remove a country from comparison first");
        return;
      }
      Selected_Region_Codes.splice(0,Selected_Region_Codes.length,...Current);
      Refresh_Compare();
      document.getElementById("Insight_Close").click();
      Panel.open=true;Panel.scrollIntoView({behavior:"smooth",block:"center"});
    });
    Country_Header.append(Add);
  }
  Refresh_Compare();
}

function Refresh_Compare() {
  const Country_Rows=window.CountryPulse_Data?.Country_Rows||[];
  const Choices=[...Country_Rows].sort((First,Second)=>First.Name.localeCompare(Second.Name));
  for(let Index=0;Index<Country_Selects.length;Index++){
    const Selector=Country_Selects[Index];
    const Selected=Selected_Region_Codes[Index]||"";
    Selector.replaceChildren();
    const Blank=Element("option","",Index<2?"Select country…":"None");Blank.value="";
    Selector.append(Blank);
    for(const Choice of Choices) {
      const Option=Element("option","",Choice.Name);Option.value=Choice.Code;
      Selector.append(Option);
    }
    Selector.value=Choices.some(Choice=>Choice.Code===Selected)?Selected:"";
  }
  Render_Compare();
}

function Render_Compare() {
  const Container=document.getElementById("Compare_Results");
  const Context=document.getElementById("Compare_Context");
  if(!Container||!Context)return;
  Container.replaceChildren();
  const Reading=window.CountryPulse_Data;
  const Codes=Country_Selects.map(Selector=>Selector.value).filter(Boolean);
  if(!Reading?.Country_Rows?.length) {
    Container.append(Element("div","Compare_Empty","Country comparison is unavailable until a live or saved reading loads."));
    Context.textContent="No verified country reading";
    return;
  }
  const Compare=Compare_Countries(Reading.Country_Rows,Saved_History,Reading.Room,Reading.Observed_At,Compare_Period,Codes);
  Context.textContent=(Reading.Observation_Mode==="live"?"Live-reported":"Saved snapshot")+
    " · "+Reading.Room+" · "+new Date(Reading.Observed_At*1000).toLocaleString()+" · "+Compare_Period;
  if(Compare.length<2){
    Container.append(Element("div","Compare_Empty","Choose two to four countries to compare."));
    return;
  }
  for(const Item of Compare){
    const Card=Element("div","Compare_Card");
    const Title=Element("div","Compare_Title",Item.Name);
    const Value=Element("strong","Compare_Big",Format_Number.format(Item.Count));
    const Share=Element("span","Compare_Small",Format_Share.format(Item.World_Share)+"% of selected pool");
    const Change=Element("span","Compare_Change",Item.Change===null?"Change: more history needed":
      Format_Signed(Item.Change)+" ("+Format_Signed(Number(Item.Change_Percent.toFixed(1)),"%")+")");
    Change.dataset.direction=Item.Change===null?"neutral":Item.Change>=0?"up":"down";
    const Baseline=Element("span","Compare_Small",Item.Compared_At?
      "Since "+new Date(Item.Compared_At*1000).toLocaleString():"No aligned baseline");
    Card.append(Title,Value,Share,Change,Baseline);
    const Open=Element("button","Secondary_Button","View country");
    Open.type="button";Open.addEventListener("click",()=>{
      window.dispatchEvent(new CustomEvent("countrypulse:open-country",{detail:{Code:Item.Code}}));
    });
    Card.append(Open);
    Container.append(Card);
  }
}

function Add_Planner() {
  const Parent=document.querySelector("#Insight_Peaks")?.closest(".Insight_Section");
  if(!Parent)return;
  const Suggestion=Element("div","Planner_Status");
  Suggestion.id="Planner_Status";
  Suggestion.setAttribute("role","status");
  Parent.append(Suggestion);
  function Update() {
    if(!Active_Country_Code)return;
    const Pool=window.CountryPulse_Data?.Room || "Adult";
    const Duration=Number(document.getElementById("Insight_Period").value)||7;
    const Timezone=document.getElementById("Insight_Timezone").value==="utc"?"UTC":
      Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC";
    const Data=Aggregate_Hourly(Get_Pool_Snapshots(Saved_History,Pool),Active_Country_Code,Timezone,Duration);
    if(!Data.Reliable_Enough||!Data.Peak_Hours.length){
      Suggestion.textContent="Best-time planner: gathering data · "+Data.Sample_Count+
        " readings on "+Data.Observation_Days+" days. Wait for wider hourly coverage.";
      return;
    }
    const Best=Data.Peak_Hours[0];
    Suggestion.textContent="Suggested hour: "+String(Best.Hour).padStart(2,"0")+":00–"+
      String((Best.Hour+1)%24).padStart(2,"0")+":00 ("+Timezone+") · "+
      Best.Sample_Count+" samples across "+Best.Distinct_Days+" days · preliminary";
  }
  window.addEventListener("countrypulse:country-open",Update);
  window.addEventListener("countrypulse:history",Update);
  for(const Id of ["Insight_Period","Insight_Timezone"]){
    document.getElementById(Id)?.addEventListener("change",Update);
  }
}

function Render_Freshness() {
  const Source=Observation_Status;
  const Badge=document.getElementById("Quick_Data_Status");
  const View_Badge=document.getElementById("View_Badge");
  const Meta=document.getElementById("View_Meta");
  if(!Badge||!View_Badge||!Meta)return;
  const Data_Kind=Source?.Has_Data?(Source.Mode==="live"?"live":"saved"):"unavailable";
  Badge.dataset.source=Data_Kind;
  Badge.textContent=Data_Kind==="live"?"Live-reported":Data_Kind==="saved"?
    "Saved "+Age_Label(Source.Timestamp):"Data unavailable";
  View_Badge.textContent=Data_Kind==="live"?"Live-reported":Data_Kind==="saved"?
    "Saved snapshot":"No country reading";
  Meta.textContent=Source?.Has_Data?
    (new Date(Source.Timestamp*1000).toLocaleString()+" · "+Source.Room+
      (Source.Fetch_State==="error"?" · live retry unavailable":"")):
    (Source?.Error||"Waiting for the first observation");
  const Pool_Hint=document.getElementById("Pool_Inline_Hint");
  if(Pool_Hint){
    const Room=Source?.Room||"Adult";
    Pool_Hint.textContent=Room==="Adult"?"Adult · shared Flingster / DirtyRoulette reported feed":
      Room==="Default"?"Default · origin unexplained; not a gender pool":
      "Combined · provider-reported, not distinct users or an arithmetic sum";
  }
}

function Update_Compare_On_Reading(Event_Object) {
  Current_Data=Event_Object.detail;
  Refresh_Compare();
}

function Setup() {
  Create_Quick_Navigation();
  Create_Compare();
  Create_View_Actions();
  Add_Planner();
  window.addEventListener("countrypulse:data",Update_Compare_On_Reading);
  window.addEventListener("countrypulse:history",(Event_Object)=>{
    Saved_History=Event_Object.detail.Historical_Snapshots||[];
    Render_Compare();
  });
  window.addEventListener("countrypulse:observation",(Event_Object)=>{
    Observation_Status=Event_Object.detail;
    Render_Freshness();
  });
  window.addEventListener("countrypulse:country-open",(Event_Object)=>{
    Active_Country_Code=Event_Object.detail?.Code||null;
  });
  window.addEventListener("countrypulse:pool-changing",()=>{
    Refresh_Compare();
  });
  window.addEventListener("countrypulse:request-state",()=>{
    Render_Freshness();
  });
  Restore_From_Url();
  if(window.CountryPulse_Data)Refresh_Compare();
  if(window.CountryPulse_History?.length)Saved_History=window.CountryPulse_History;
  if(window.CountryPulse_Data) {
    const Data=window.CountryPulse_Data;
    Observation_Status={Room:Data.Room,Mode:Data.Observation_Mode,Has_Data:true,Timestamp:Data.Observed_At};
    Render_Freshness();
  }
}

Setup();

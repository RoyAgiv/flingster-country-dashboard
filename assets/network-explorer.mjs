import {
  Known_Brands, Shared_Alias, Find_Exact_Dataset_Groups,
  Summarize_Network_Overlap, Compare_Config_States,
} from "./network-utils.mjs";

const Number_Formatter = new Intl.NumberFormat("en-US");
const Explorer = document.createElement("details");
let Network_Document = null;
let Country_History = Array.isArray(window.CountryPulse_History) ? window.CountryPulse_History : [];
let Selected_Pool = "default";

function Format_Count(Count) {
  return Number.isSafeInteger(Count) && Count >= 0 ? Number_Formatter.format(Count) : "—";
}

function Format_Age(Timestamp) {
  if (!Number.isSafeInteger(Timestamp)) return "not yet collected";
  const Minutes = Math.max(0,Math.floor((Date.now()/1000-Timestamp)/60));
  if (Minutes < 60) return Minutes+"m ago";
  if (Minutes < 1440) return Math.floor(Minutes/60)+"h ago";
  return Math.floor(Minutes/1440)+"d ago";
}

function Make_Element(Tag_Name, Class_Name, Content) {
  const Element = document.createElement(Tag_Name);
  if (Class_Name) Element.className = Class_Name;
  if (Content!==undefined) Element.textContent = Content;
  return Element;
}

function Make_Metric(Label, Value) {
  const Element = Make_Element("div","");
  Element.append(Make_Element("strong","",Value),Make_Element("span","",Label));
  return Element;
}

function Make_Feature(Label, Value) {
  const Element = Make_Element("div","");
  Element.append(Make_Element("strong","",Value),document.createTextNode(Label));
  return Element;
}

function Describe_Boolean(Value) {
  return typeof Value==="boolean" ? (Value ? "Yes" : "No") : "Unknown";
}

function Latest_Config_Brand(Brand_Id) {
  const History = Network_Document?.config_history || [];
  return [...History].reverse().map((Entry)=>Entry.brands?.[Brand_Id]).find(Boolean) || null;
}

function Latest_Snapshot() {
  const History = Network_Document?.snapshots || [];
  return History.length ? History.at(-1) : null;
}

function Latest_Adult() {
  const History = Country_History;
  return [...History].reverse().find((Entry)=>Number.isSafeInteger(Entry.n)&&Entry.n>0)||null;
}

function Render_Exact_Groups(Brands) {
  const Container = document.getElementById("Network_Exact_Groups");
  Container.replaceChildren();
  const Groups = Find_Exact_Dataset_Groups(Brands,Selected_Pool);
  if (!Groups.length) {
    Container.append(Make_Element("div","Network_Empty",
      "No identical country datasets in this saved reading. Similar totals can still reflect shared or cached reporting."));
    return Groups;
  }
  for (const Group of Groups) {
    const Element = Make_Element("div","Network_Group");
    const Icon = Make_Element("span","Network_Group_Icon","≡");
    const Name_List = Group.map((Id)=>Known_Brands.find((Brand)=>Brand.Id===Id)?.Name||Id).join(" ↔ ");
    const Content = Make_Element("div","");
    Content.append(
      Make_Element("b","",Name_List),
      Make_Element("small","","Exact country-by-country snapshot · "+(Selected_Pool==="default"?"Default":"Default,Adult")+". Not separate people."),
    );
    Element.append(Icon,Content);
    Container.append(Element);
  }
  return Groups;
}

function Config_Change_Note(Brand_Id) {
  const Config_History = (Network_Document?.config_history||[])
    .filter((Entry)=>Entry?.brands?.[Brand_Id]).sort((First,Second)=>First.t-Second.t);
  if (Config_History.length<2) return "Daily configuration tracking just started";
  const Previous = Config_History.at(-2);
  const Latest = Config_History.at(-1);
  const Changes = Compare_Config_States(Previous.brands[Brand_Id],Latest.brands[Brand_Id])
    .filter((Field)=>Field!=="Metadata_Members");
  if (!Changes.length) return "No tracked feature changes between "+Previous.day+" and "+Latest.day;
  return "Changed "+Latest.day+": "+Changes.join(", ");
}

function Make_Brand_Card(Brand, Sample, Groups) {
  const Config = Latest_Config_Brand(Brand.Id);
  const Snapshot_Brand = Sample?.brands?.[Brand.Id];
  const Reading = Snapshot_Brand?.[Selected_Pool];
  const Failure = Sample?.failures?.find((Entry)=>Entry.brand===Brand.Id) || null;
  const Card = Make_Element("article","Network_Card");
  const Header = Make_Element("div","Network_Card_Header");
  const Title = Make_Element("a","Network_Card_Title",Brand.Name);
  Title.href = Brand.Url;
  Title.target = "_blank";
  Title.rel = "noopener noreferrer";
  Header.append(Title,Make_Element("span","Network_Secondary_Label",
    Reading?"Validated feed":Failure?"Unavailable":"Awaiting reading"));
  Card.append(Header);
  if (Reading) {
    Card.append(Make_Element("div","Network_Number",Format_Count(Reading.n)));
    Card.append(Make_Element("div","Network_Count_Description",
      "Reported "+(Selected_Pool==="default"?"Default":"Default,Adult")+" · "+Reading.countries+" countries"));
  } else {
    Card.append(Make_Element("div","Network_Number","Unavailable"));
    Card.append(Make_Element("div","Network_Count_Description",
      Failure ? "Latest source was unavailable or failed validation ("+Failure.reason+")." :
        "No validated reading for the selected pool yet"));
  }
  Card.append(Make_Element("div","Network_Card_Support",
    "Reported members · "+Format_Count(Snapshot_Brand?.members??Config?.Metadata_Members)));

  const Exact_Group = Groups.find((Group)=>Group.includes(Brand.Id));
  if (Exact_Group && Reading) {
    const Pair_Names=Exact_Group.filter((Id)=>Id!==Brand.Id)
      .map((Id)=>Known_Brands.find((Item)=>Item.Id===Id)?.Name||Id).join(", ");
    Card.append(Make_Element("div","Network_Card_Foot","≡ Exact country data with "+Pair_Names));
  }
  const Details = document.createElement("details");
  const Summary = Make_Element("summary","","Configuration & history");
  Details.append(Summary);
  if (Config) {
    const Grid = Make_Element("div","Network_Feature_Grid");
    Grid.append(
      Make_Feature("Multi-country configured",Describe_Boolean(Config.MultiCountrySelection)),
      Make_Feature("Premium label",Config.VIPName||"Unknown"),
      Make_Feature("Token system",Describe_Boolean(Config.TokensEnabled)),
      Make_Feature("Signup",Describe_Boolean(Config.Signup)),
      Make_Feature("Trial",Describe_Boolean(Config.Trial)),
      Make_Feature("Suggested interests",Format_Count(Config.Tags_Count)+" tags"),
    );
    Details.append(Grid);
    if (Config.Rewards && Config.TokensEnabled) {
      const Rewards = Make_Element("div","Network_Tag_List");
      for (const [Key,Label] of [
        ["DailyLoginBonus","Daily login"],
        ["ChattingBonus","Chatting bonus"],
        ["ChattingBonusMaxDaily","Daily chat max"],
        ["ChattingBonusInterval","Bonus interval"],
        ["BonusForReferree","Referral reward"],
      ]) {
        if (Config.Rewards[Key]!==undefined) {
          Rewards.append(Make_Element("span","",Label+" "+Config.Rewards[Key]));
        }
      }
      Details.append(Rewards);
      Details.append(Make_Element("p","Network_Card_Foot",
        "Configuration values, not earned rewards. Bonus interval units and premium entitlements are not established from token costs alone."));
    }
    Details.append(Make_Element("div","Network_Card_Foot",
      "Validated app identity · "+Config.Name+" · "+Config.Field_Count+" configuration fields."));
    Details.append(Make_Element("div","Network_Card_Foot",
      "Suggestions are not interest popularity. "+Config_Change_Note(Brand.Id)+"."));
  } else {
    Details.append(Make_Element("p","Network_Card_Foot",
      "Configuration identity has not passed validation in a saved daily snapshot."));
  }
  const Footer = Make_Element("div","Network_Card_Anchor");
  Footer.append(Details);
  Card.append(Footer);
  return Card;
}

function Make_Alias_Card() {
  const Card = Make_Element("article","Network_Card Network_Alias");
  const Header = Make_Element("div","Network_Card_Header");
  const Title = Make_Element("a","Network_Card_Title",Shared_Alias.Name);
  Title.href=Shared_Alias.Url;
  Title.target="_blank";
  Title.rel="noopener noreferrer";
  Header.append(Title,Make_Element("span","Network_Secondary_Label","Shared Adult"));
  Card.append(Header);
  const Adult = Latest_Adult();
  // Do not show a separate large number for a known alias beside Default/Combined totals.
  Card.append(Make_Element("div","Network_Number","Shared Adult feed"));
  Card.append(Make_Element("div","Network_Count_Description",
    Adult?Format_Count(Adult.n)+" reported on Flingster Adult ("+Format_Age(Adult.t)+") — NOT additional users":
      "Uses Flingster Adult statistics, not a separately measured population"));
  Card.append(Make_Element("div","Network_Card_Support",
    "No independently verified DirtyRoulette member or Default/Combined count."));
  const Footer=Make_Element("div","Network_Card_Anchor");
  Footer.append(Make_Element("div","Network_Card_Foot",
    "Not an extra population. Ignore the generic three-member API fallback."));
  Card.append(Footer);
  return Card;
}

function Render_Config_Changes() {
  const Container = document.getElementById("Network_Config_Changes_List");
  Container.replaceChildren();
  const History = Network_Document?.config_history || [];
  if (History.length<2) {
    Container.append(Make_Element("span","","Daily configuration history begins today; changes will appear after another day."));
    return;
  }
  const Previous = History.at(-2);
  const Latest = History.at(-1);
  let Change_Count=0;
  for (const Brand of Known_Brands) {
    if (!Previous.brands?.[Brand.Id] || !Latest.brands?.[Brand.Id]) continue;
    const Changes = Compare_Config_States(Previous.brands[Brand.Id],Latest.brands[Brand.Id])
      .filter((Field)=>Field!=="Metadata_Members");
    if (!Changes.length) continue;
    Change_Count++;
    Container.append(Make_Element("span","",Brand.Name+": "+Changes.join(", ")));
  }
  if (!Change_Count) {
    Container.append(Make_Element("span","","No tracked feature-setting changes since the previous daily snapshot."));
  }
}

function Render_Network_Table(Snapshot, Groups) {
  const Body=document.getElementById("Network_Table_Body");
  if(!Body)return;
  Body.replaceChildren();
  const Brands=Snapshot?.brands||{};
  for(const Brand of Known_Brands){
    const Record=Brands[Brand.Id];
    const Reading=Record?.[Selected_Pool];
    const Group=Groups.find(Entry=>Entry.includes(Brand.Id));
    const Config=Latest_Config_Brand(Brand.Id);
    const Row=document.createElement("tr");
    const Label=Make_Element("td","",Brand.Name);
    const Count=Make_Element("td","",Reading?Format_Count(Reading.n):"Unavailable");
    const Countries=Make_Element("td","",Reading?String(Reading.countries):"—");
    const Membership=Make_Element("td","",Format_Count(Record?.members??Config?.Metadata_Members));
    const Relationship=Make_Element("td","",Group?
      "Exact country data with "+Group.filter(Id=>Id!==Brand.Id).map(Id=>Known_Brands.find(Item=>Item.Id===Id)?.Name||Id).join(", "):
      "No exact match in this snapshot");
    Row.append(Label,Count,Countries,Membership,Relationship);
    Body.append(Row);
  }
  const Alias_Row=document.createElement("tr");
  Alias_Row.append(Make_Element("td","",Shared_Alias.Name),
    Make_Element("td","","Shared Adult"),Make_Element("td","","—"),
    Make_Element("td","","—"),
    Make_Element("td","","Uses Flingster Adult; not additional users"));
  Body.append(Alias_Row);
}

function Render_Network() {
  const Snapshot = Latest_Snapshot();
  const Brands = Snapshot?.brands || {};
  const Available = Object.keys(Brands).length;
  const Date_Label = Snapshot ? Format_Age(Snapshot.t) : "not collected yet";
  document.getElementById("Network_Preview").textContent =
    Available+"/6 validated feeds · "+Date_Label;
  const Status = document.getElementById("Network_Status");
  const Summary = Summarize_Network_Overlap(Brands,Selected_Pool);
  Status.textContent = Summary.Available ?
    Summary.Available+" hosts · "+Format_Count(Summary.Min)+"–"+Format_Count(Summary.Max)+
    " reported · "+Summary.Spread_Pct+"% total spread" : "No validated pool readings yet";
  const Groups = Render_Exact_Groups(Brands);
  Render_Network_Table(Snapshot,Groups);
  const Grid = document.getElementById("Network_Grid");
  Grid.replaceChildren();
  Grid.append(Make_Brand_Card(Known_Brands[0],Snapshot,Groups));
  Grid.append(Make_Alias_Card());
  for (const Brand of Known_Brands.slice(1)) Grid.append(Make_Brand_Card(Brand,Snapshot,Groups));
  Render_Config_Changes();
  for (const Button of document.querySelectorAll("#Network_Tabs button")) {
    Button.setAttribute("aria-checked",String(Button.dataset.pool===Selected_Pool));
  }
  document.getElementById("Network_Retrieved").textContent =
    "Last saved "+Date_Label+" · expected roughly every 30 minutes; GitHub jobs may be delayed.";
}

async function Load_Network_Data() {
  try {
    const Response = await fetch("./data/network.json?v="+Date.now(),{cache:"no-store"});
    if (!Response.ok) throw Error("HTTP "+Response.status);
    const Data = await Response.json();
    if (Data.schema!==1 || !Array.isArray(Data.snapshots) ||
        !Array.isArray(Data.config_history)) throw Error("Unexpected data format");
    Network_Document=Data;
    Render_Network();
  } catch (Error_Object) {
    document.getElementById("Network_Preview").textContent="History unavailable";
    document.getElementById("Network_Status").textContent="Could not read saved network snapshots";
    document.getElementById("Network_Exact_Groups").replaceChildren(
      Make_Element("div","Network_Empty","Network data is temporarily unavailable. Main country data still works."));
  }
}

function Setup_Network_Explorer() {
  Explorer.className="Network_Explorer";
  Explorer.id="Network_Explorer";
  Explorer.innerHTML =
    '<summary><span class="Network_Title_Group"><span class="Network_Icon" aria-hidden="true">◎</span>'+
    '<span><span class="Network_Name">Network Explorer</span>'+
    '<span class="Network_Subtitle">Seven brands, potentially shared activity · compare without double-counting</span></span></span>'+
    '<span class="Network_Preview" id="Network_Preview">Loading verified feeds…</span></summary>'+
    '<div class="Network_Content">'+
      '<div class="Network_Notice"><i aria-hidden="true">ⓘ</i><span>These are <strong>provider-reported activity snapshots, not separate populations.</strong> Brands can share backend statistics. Never add their totals or member counters to estimate unique people.</span></div>'+
      '<div class="Network_Toolbar"><div class="Network_Tabs" id="Network_Tabs" role="radiogroup" aria-label="Network activity pool">'+
        '<button type="button" data-pool="default" role="radio" aria-checked="true">Default pool</button>'+
        '<button type="button" data-pool="combined" role="radio" aria-checked="false">Combined pool</button></div>'+
        '<span class="Network_Status" id="Network_Status">Loading statistics…</span></div>'+
      '<div class="Network_Exact_Groups" id="Network_Exact_Groups"></div>'+
      '<details class="Network_Compact_Table"><summary>Compact comparison table</summary>'+
      '<div class="Network_Table_Scroll"><table><thead><tr><th>Brand</th><th>Reported</th><th>Countries</th><th>Members</th><th>Shared snapshot</th></tr></thead><tbody id="Network_Table_Body"></tbody></table></div></details>'+
      '<div class="Network_Grid" id="Network_Grid"></div>'+
      '<div class="Network_Comparison_Text" id="Network_Retrieved"></div>'+
      '<div class="Network_Config_Changes"><h3>Daily app-configuration changes</h3>'+
      '<div class="Network_Change_Rows" id="Network_Config_Changes_List"></div></div>'+
      '<div class="Network_Reference_Links">'+
        '<a href="https://github.com/FreeCam-Chatter/random-video-chat-data-2026" target="_blank" rel="noopener noreferrer">Historical 2026 traffic dataset ↗</a>'+
        '<a href="https://shagle.com/faq/" target="_blank" rel="noopener noreferrer">Shagle matching FAQ ↗</a>'+
        '<span>Brand traffic and membership are not live unique-user counts. Historical datasets may include affiliate relationships.</span>'+
      '</div>'+
    '</div>';
  document.querySelector(".Content_Grid").after(Explorer);
  for (const Button of document.querySelectorAll("#Network_Tabs button")) {
    Button.addEventListener("keydown",(Event_Object)=>{
      if(!["ArrowRight","ArrowLeft","ArrowDown","ArrowUp"].includes(Event_Object.key))return;
      Event_Object.preventDefault();
      const Next=Array.from(document.querySelectorAll("#Network_Tabs button")).find(Item=>Item!==Button);
      Next?.focus();Next?.click();
    });
    Button.addEventListener("click",()=>{
      Selected_Pool=Button.dataset.pool;
      Render_Network();
    });
  }
  window.addEventListener("countrypulse:history",(Event_Object)=>{
    Country_History=Event_Object.detail.Historical_Snapshots||[];
    if (Network_Document) Render_Network();
  });
  Explorer.addEventListener("toggle",()=>{
    if (Explorer.open) Load_Network_Data();
  });
  Load_Network_Data();
  setInterval(()=>{if(!document.hidden && Explorer.open)Load_Network_Data();},10*60*1000);
}
Setup_Network_Explorer();

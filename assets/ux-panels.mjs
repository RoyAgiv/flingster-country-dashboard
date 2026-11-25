import { Find_Countries, Build_Collection_Coverage, Build_Country_Comparison, Country_Comparison_Csv } from "./ux-analytics.mjs";
import { Age_Label } from "./reliability-utils.mjs";
const Number_Format=new Intl.NumberFormat("en-US");
const Date_Format=new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
const Colors=["#83e8d6","#f0c67e","#b9a6fa","#8bbdfb"];
const Dashes=["","7 4","3 4","10 4 2 4"];
function El(Tag,Class="",Text=""){
  const Node=document.createElement(Tag);if(Class)Node.className=Class;if(Text)Node.textContent=Text;return Node;
}
function SVG(Tag,Attrs={}){
  const Node=document.createElementNS("http://www.w3.org/2000/svg",Tag);
  for(const [Key,Value] of Object.entries(Attrs))Node.setAttribute(Key,String(Value));return Node;
}
function Button(Text,Handler){
  const Node=El("button","Secondary_Button",Text);Node.type="button";Node.addEventListener("click",Handler);return Node;
}
function Country_Name(Code){
  try{return Code==="XK"?"Kosovo":new Intl.DisplayNames(["en"],{type:"region"}).of(Code)||Code;}catch{return Code;}
}
function Flag(Code){return /^[A-Z]{2}$/.test(Code)?String.fromCodePoint(...[...Code].map(C=>127397+C.charCodeAt(0))):"";}
export function Setup_Quick_Search(Input,Table_Input){
  const Wrap=El("div","Country_Search_Wrap");
  const Options=El("div","Country_Search_Options");
  Options.id="Country_Search_Options";Options.role="listbox";Options.hidden=true;
  Options.setAttribute("aria-label","Matching countries");
  Input.setAttribute("role","combobox");Input.setAttribute("aria-autocomplete","list");
  Input.setAttribute("aria-controls",Options.id);Input.setAttribute("aria-expanded","false");
  Wrap.append(Input,Options);
  let Matches=[],Active=-1;
  function Close(){
    Options.hidden=true;Input.setAttribute("aria-expanded","false");Input.removeAttribute("aria-activedescendant");Active=-1;
  }
  function Choose(Index){
    const Match=Matches[Index];if(!Match)return;
    Input.value=Match.Name;Table_Input.value=Match.Name;
    Table_Input.dispatchEvent(new Event("input",{bubbles:true}));
    Close();
    window.dispatchEvent(new CustomEvent("countrypulse:open-country",{detail:{Code:Match.Code}}));
  }
  function Select(Index){
    Active=Index;
    Options.querySelectorAll("[role=option]").forEach((Node,I)=>Node.setAttribute("aria-selected",String(I===Active)));
    if(Index>=0){const Node=Options.children[Index];Input.setAttribute("aria-activedescendant",Node.id);Node.scrollIntoView({block:"nearest"});}
    else Input.removeAttribute("aria-activedescendant");
  }
  function Render(){
    const Data=window.CountryPulse_Data;
    Matches=Find_Countries(Data?.Country_Rows||[],Input.value,8);Options.replaceChildren();
    if(!Matches.length){
      Options.append(El("div","Country_Search_Empty",Data?.Country_Rows?.length?"No matching country":"Waiting for country data"));
    }
    for(const [Index,Match] of Matches.entries()){
      const Row=El("div","Country_Search_Option");Row.role="option";Row.id="Country_Search_Option_"+Index;
      Row.setAttribute("aria-selected","false");
      const Name=El("span","Country_Search_Name",Flag(Match.Code)+" "+Match.Name);
      Row.append(Name,El("small","",Match.Code),El("strong","",Number_Format.format(Match.Count)));
      Row.addEventListener("pointerdown",Event=>Event.preventDefault());
      Row.addEventListener("click",()=>Choose(Index));Options.append(Row);
    }
    Options.hidden=false;Input.setAttribute("aria-expanded","true");Select(-1);
  }
  Input.addEventListener("focus",Render);
  Input.addEventListener("input",()=>{
    Table_Input.value=Input.value;Table_Input.dispatchEvent(new Event("input",{bubbles:true}));Render();
  });
  Input.addEventListener("blur",Close);
  Input.addEventListener("keydown",Event=>{
    if(Event.key==="Escape"){Close();Event.stopPropagation();return;}
    if(Event.key==="ArrowDown"||Event.key==="ArrowUp"){
      Event.preventDefault();if(Options.hidden)Render();
      if(Matches.length)Select(Active<0?(Event.key==="ArrowDown"?0:Matches.length-1):
        (Active+(Event.key==="ArrowDown"?1:-1)+Matches.length)%Matches.length);
    }else if(Event.key==="Enter"){
      Event.preventDefault();
      if(Options.hidden)Render();
      if(Matches.length)Choose(Active<0?0:Active);
      else {Close();document.getElementById("countries").scrollIntoView({block:"start"});Table_Input.focus();}
    }
  });
  Table_Input.addEventListener("input",()=>{if(Input.value!==Table_Input.value)Input.value=Table_Input.value;});
  document.addEventListener("keydown",Event=>{
    if(Event.defaultPrevented || document.body.classList.contains("Insight_Drawer_Open"))return;
    const Editing=Event.target instanceof HTMLElement && (Event.target.matches("input,textarea,select")||Event.target.isContentEditable);
    if((!Editing&&Event.key==="/")||((Event.metaKey||Event.ctrlKey)&&Event.key.toLowerCase()==="k")){
      Event.preventDefault();Input.focus();Input.select();
    }
  });
  window.addEventListener("countrypulse:data",()=>{if(document.activeElement===Input&&!Options.hidden)Render();});
  Input.title="Find a country · / or Ctrl/⌘ K";
  return Wrap;
}

export function Create_Collection_Panel(Parent){
  const Panel=El("details","Collection_Panel");Panel.id="Collection_Panel";
  const Summary=El("summary","Collection_Summary","Collection health · loading saved history");
  const Body=El("div","Collection_Inside");
  const Head=El("div","Collection_Head");
  Head.append(El("p","Subheading","Last 48 completed half-hour slots (24h). Blank slots mean no saved reading, not zero activity."),
    Button("Refresh history",()=>window.dispatchEvent(new Event("countrypulse:reload-history"))));
  const Rows=El("div","Collection_Rows");
  const Footer=El("div","Collection_Foot","Slots use UTC half-hour boundaries; tooltips show local time. Browser-only readings do not count.");
  Body.append(Head,Rows,Footer);Panel.append(Summary,Body);Parent.append(Panel);
  let History=window.CountryPulse_History||[],Failed=false,Ready=Boolean(window.CountryPulse_History);
  function Update(){
    const Health=Build_Collection_Coverage(History,Math.floor(Date.now()/1000));
    const Has_Data=Health.some(Item=>Item.Latest!==null);
    Summary.textContent=!Ready&&!Failed?"Collection health · loading saved history":
      !Has_Data?(Failed?"Collection health · history unavailable":"Collection health · no saved history"):
      "Collection health · "+Health.map(Item=>Item.Pool+" "+Item.Count+"/48").join(" · ")+(Failed?" · refresh failed":"");
    if(!Panel.open)return;
    Rows.replaceChildren();
    for(const Item of Health){
      const Row=El("section","Collection_Row");
      const Label=El("div","Collection_Row_Label");
      Label.append(El("strong","",Item.Pool),El("small","",Item.Latest===null?"No saved reading":"Last "+Age_Label(Item.Latest)));
      if(Item.Latest!==null)Label.title=Date_Format.format(Item.Latest*1000);
      const Grid=El("div","Collection_Slots");Grid.setAttribute("role","img");
      Grid.setAttribute("aria-label",Item.Pool+": "+Item.Count+" of 48 completed half-hours recorded, "+Item.Longest_Missing+" consecutive missing slots at most.");
      for(const Slot of Item.Slots){
        const Cell=El("span","Collection_Slot");Cell.dataset.present=String(Slot.Present);
        Cell.title=Date_Format.format(Slot.t*1000)+" · "+(Slot.Present?"Recorded":"No saved reading");Grid.append(Cell);
      }
      const Stats=El("div","Collection_Row_Stats",Item.Count+"/48 · "+Math.round(Item.Count/48*100)+"% last 24h");
      Stats.append(El("small","",Item.Week_Count+"/336 slots · "+Math.round(Item.Week_Count/336*100)+"% over 7d"));
      Row.append(Label,Grid,Stats);Rows.append(Row);
    }
  }
  Panel.addEventListener("toggle",Update);
  window.addEventListener("countrypulse:history",Event=>{History=Event.detail.Historical_Snapshots||[];Ready=true;Failed=false;Update();});
  window.addEventListener("countrypulse:history-failed",()=>{Failed=true;Update();});
  setInterval(()=>{if(!document.hidden)Update();},60000);Update();
}

export function Create_Comparison_History(Parent,Outer_Panel){
  const Section=El("section","Compare_History");
  const Header=El("div","Compare_History_Header");
  const Heading=El("div");Heading.append(El("h3","","Compare activity over time"),
    El("p","Subheading","Saved readings only · same pool, shared scale, no interpolation."));
  const Controls=El("div","Compare_History_Controls");
  const Range=El("select");Range.id="Compare_History_Range";Range.setAttribute("aria-label","Historical comparison range");
  for(const [Value,Label] of [["24h","Last 24h"],["7d","Last 7 days"],["30d","Last 30 days"]]){
    const O=El("option","",Label);O.value=Value;Range.append(O);
  }Range.value="7d";
  const Metric=El("select");Metric.id="Compare_History_Metric";Metric.setAttribute("aria-label","Historical comparison metric");
  for(const [Value,Label] of [["count","Reported online"],["share","World share (%)"]]){
    const O=El("option","",Label);O.value=Value;Metric.append(O);
  }
  let Result=null,Last={History:[],Pool:"Adult",Codes:[]};
  const Download=Button("History CSV",()=>{
    if(!Result)return;
    const Url=URL.createObjectURL(new Blob([Country_Comparison_Csv(Result)],{type:"text/csv;charset=utf-8"}));
    const Link=El("a");Link.href=Url;Link.download="countrypulse-compare-"+Result.Pool.toLowerCase()+"-"+Result.Window+".csv";
    document.body.append(Link);Link.click();Link.remove();setTimeout(()=>URL.revokeObjectURL(Url),1000);
  });
  Controls.append(Range,Metric,Download);Header.append(Heading,Controls);
  const Legend=El("div","Compare_History_Legend");
  const Chart=SVG("svg",{viewBox:"0 0 760 218",role:"img","aria-label":"Country historical comparison"});
  Chart.id="Compare_History_Chart";
  const Empty=El("p","Compare_Empty");
  const Details=El("div","Compare_History_Details");
  Section.append(Header,Legend,Chart,Empty,Details);Parent.append(Section);
  function Render(){
    if(!Outer_Panel.open)return;
    Result=Build_Country_Comparison(Last.History,Last.Pool,Last.Codes,Range.value,Metric.value,Math.floor(Date.now()/1000));
    Chart.replaceChildren();Legend.replaceChildren();Details.replaceChildren();
    const Series=Result?.Series||[];
    const Has_Data=Series.some(Item=>Item.Count);
    const Hide=!Has_Data||Series.length<2;
    Download.disabled=Hide;Chart.toggleAttribute("hidden",Hide);
    Empty.hidden=!Hide;
    Empty.textContent=Series.length<2?"Choose at least two countries to compare their saved history.":
      "No saved readings for the selected countries, pool and time window.";
    if(Hide)return;
    const Share=Result.Metric==="share",Left=56,Right=750,Top=12,Bottom=183;
    const X=T=>Left+(T-Result.Start)/(Result.End-Result.Start)*(Right-Left);
    const Y=V=>Bottom-V/Result.Maximum*(Bottom-Top);
    const Format=V=>Share?Number(V.toFixed(2))+"%":Number_Format.format(Math.round(V));
    const Title=SVG("title");Title.textContent=Result.Pool+" pool · "+(Share?"share of reported world total":"reported online")+" · "+Result.Window;Chart.append(Title);
    for(let I=0;I<=4;I++){
      const Value=Result.Maximum*I/4,At=Y(Value);
      Chart.append(SVG("line",{x1:Left,x2:Right,y1:At,y2:At,class:"Compare_Grid_Line"}));
      const Text=SVG("text",{x:Left-8,y:At+4,"text-anchor":"end",class:"Compare_Axis"});Text.textContent=Format(Value);Chart.append(Text);
    }
    for(let I=0;I<=3;I++){
      const Time=Result.Start+(Result.End-Result.Start)*I/3;
      const Text=SVG("text",{x:X(Time),y:206,"text-anchor":I===0?"start":I===3?"end":"middle",class:"Compare_Axis"});
      Text.textContent=Date_Format.format(Time*1000);Chart.append(Text);
    }
    for(const [Index,Item] of Series.entries()){
      const Color=Colors[Index];
      const Key=El("span","Compare_History_Key",Country_Name(Item.Code));const Swatch=El("i");Swatch.style.background=Color;Key.prepend(Swatch);Legend.append(Key);
      for(const Segment of Item.Segments){
        if(Segment.length>1)Chart.append(SVG("path",{d:Segment.map((P,I)=>(I?"L":"M")+X(P.t).toFixed(2)+" "+Y(P.Value).toFixed(2)).join(" "),
          stroke:Color,"stroke-dasharray":Dashes[Index],class:"Compare_History_Line"}));
        else Chart.append(SVG("circle",{cx:X(Segment[0].t),cy:Y(Segment[0].Value),r:3.5,fill:Color}));
      }
      if(Item.Latest)Chart.append(SVG("circle",{cx:X(Item.Latest.t),cy:Y(Item.Latest.Value),r:3.5,fill:Color}));
      const Card=El("article","Compare_History_Stat");Card.append(El("strong","",Country_Name(Item.Code)),
        El("span","",Item.Average===null?"No saved readings":"Average "+Format(Item.Average)+" · peak "+Format(Item.Peak)),
        El("small","",Item.Count+" readings"+(Item.Latest?" · last "+Date_Format.format(Item.Latest.t*1000):"")));
      Details.append(Card);
    }
    Chart.setAttribute("aria-label",Title.textContent+". "+Series.map(Item=>Country_Name(Item.Code)+": "+Item.Count+" readings"+(Item.Average===null?"":", average "+Format(Item.Average))).join("; "));
  }
  Range.addEventListener("change",Render);Metric.addEventListener("change",Render);Outer_Panel.addEventListener("toggle",Render);
  return (History,Pool,Codes)=>{Last={History,Pool,Codes};Render();};
}

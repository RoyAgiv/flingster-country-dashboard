import { Summarize_Country_Series, Build_Hourly_Experience } from "./history-analytics.mjs";
import { Format_Country_Clock, Get_Country_Time_Zones } from "./country-timezones.mjs";

const Number_Format = new Intl.NumberFormat("en-US");
const Month_Day_Time = (Timestamp, Zone) => new Intl.DateTimeFormat("en-US",{
  timeZone:Zone,month:"short",day:"numeric",hour:"numeric",minute:"2-digit",
}).format(new Date(Timestamp*1000));
const Full_Time = (Timestamp, Zone) => new Intl.DateTimeFormat("en-US",{
  timeZone:Zone,weekday:"short",month:"short",day:"numeric",year:"numeric",
  hour:"numeric",minute:"2-digit",timeZoneName:"short",
}).format(new Date(Timestamp*1000));

function Svg_Element(Name, Attributes = {}) {
  const Item = document.createElementNS("http://www.w3.org/2000/svg",Name);
  for(const [Key,Value] of Object.entries(Attributes))Item.setAttribute(Key,String(Value));
  return Item;
}
function Html_Element(Name, Class_Name = "", Text_Value = "") {
  const Item=document.createElement(Name);
  if(Class_Name)Item.className=Class_Name;
  Item.textContent=Text_Value;
  return Item;
}
function Signed_Change(Difference, Before) {
  if(Difference===null || Difference===undefined)return "First saved reading";
  return (Difference>0?"+":"") + Number_Format.format(Difference) +
    (Before>0?" ("+(Difference>0?"+":"")+(Difference/Before*100).toFixed(1)+"%)":"")+
    " since previous reading";
}
function Export_Country_History(Samples, Country_Code, Pool, Zone) {
  if(!Samples.length)return;
  const Rows=[["Timestamp UTC","Local time ("+Zone+")","Country","Pool","Reported online","Change vs previous"],...Samples.map((Item,Index)=>[
    new Date(Item.t*1000).toISOString(),Full_Time(Item.t,Zone),
    Country_Code,Pool,Item.Count,Index?Item.Count-Samples[Index-1].Count:"",
  ])];
  const Csv=Rows.map((Cells)=>Cells.map((Value)=>'"'+String(Value).replaceAll('"','""')+'"').join(",")).join("\r\n");
  const Url=URL.createObjectURL(new Blob([Csv],{type:"text/csv;charset=utf-8"}));
  const Link=document.createElement("a");
  Link.href=Url;Link.download="countrypulse-"+Country_Code.toLowerCase()+"-"+Pool.toLowerCase()+"-history.csv";
  document.body.append(Link);Link.click();Link.remove();
  setTimeout(()=>URL.revokeObjectURL(Url),1000);
}

export function Render_Country_Clocks(Container, Country_Code, Selected_Zone, On_Select) {
  Container.replaceChildren();
  const Zones=Get_Country_Time_Zones(Country_Code);
  Container.setAttribute("role","group");
  Container.setAttribute("aria-label","Current local times for this country");
  if(!Zones.length) {
    Container.append(Html_Element("span","Clock_Fallback","Country timezone unavailable."));
    return;
  }
  const Header=Html_Element("span","Clock_Header","Local time");
  Container.append(Header);
  for(const Entry of Zones){
    const Clock=Format_Country_Clock(Date.now(),Entry.Zone);
    const Button=Html_Element("button","Clock_Chip");
    Button.type="button";
    Button.dataset.zone=Entry.Zone;
    Button.dataset.city=Entry.City;
    Button.dataset.selected=String(Entry.Zone===Selected_Zone);
    Button.title="Use "+Entry.City+" time for activity charts";
    Button.setAttribute("aria-pressed",String(Entry.Zone===Selected_Zone));
    const City=Html_Element("span","Clock_City",Entry.City);
    const Time=Html_Element("strong","Clock_Time",Clock?.Time||"—");
    const Day=Html_Element("span","Clock_Day",Clock?.Day||"Unavailable");
    Button.append(City,Time,Day);
    Button.addEventListener("click",()=>On_Select(Entry.Zone));
    Container.append(Button);
  }
}

export function Refresh_Country_Clocks(Container) {
  for(const Chip of Container?.querySelectorAll?.(".Clock_Chip")||[]){
    const Clock=Format_Country_Clock(Date.now(),Chip.dataset.zone);
    if(!Clock)continue;
    Chip.querySelector(".Clock_Time").textContent=Clock.Time;
    Chip.querySelector(".Clock_Day").textContent=Clock.Day;
  }
}

export function Render_Interactive_History({
  Container,Labels,Samples,Country_Code,Pool,Zone,Days,
}) {
  const Previous_Open=Container.parentElement.querySelector(".History_Readings_Details")?.open||false;
  Container.parentElement.querySelector(".History_Explorer_Extra")?.remove();
  Container.replaceChildren();
  Labels.replaceChildren();
  const Stats=Summarize_Country_Series(Samples,Days);
  const Box=Html_Element("div","History_Chart_Stage");
  const Metrics=Html_Element("div","History_Summary_Metrics");
  const Focus=Html_Element("div","History_Focus_Row");
  const Foot=Html_Element("div","History_Explorer_Extra");
  Foot.append(Metrics,Focus);
  const First=Stats.First;
  const Latest=Stats.Latest;
  function Metric(Label,Value,Detail="") {
    const Card=Html_Element("div","History_Mini_Metric");
    Card.append(Html_Element("span","",Label),Html_Element("strong","",Value));
    if(Detail)Card.append(Html_Element("small","",Detail));
    Metrics.append(Card);
  }
  Metric("Latest saved",Latest?Number_Format.format(Latest.Count):"—",
    Latest?Month_Day_Time(Latest.t,Zone):"No reading");
  Metric("Change vs previous",Stats.Latest_Difference===null?"—":
    (Stats.Latest_Difference>0?"+":"")+Number_Format.format(Stats.Latest_Difference),
    Stats.Latest_Percent===null?"Waiting for another reading":
      (Stats.Latest_Percent>0?"+":"")+Stats.Latest_Percent.toFixed(1)+"%");
  Metric("Observed range",Stats.Count>1?
    Number_Format.format(Stats.Min)+"–"+Number_Format.format(Stats.Max):"—",
    Stats.Count>1?"From saved observations":"Insufficient history");
  if(!Stats.Points.length){
    Box.append(Html_Element("div","History_Empty","No saved readings in this time range."));
    Container.append(Box);Container.parentElement.append(Foot);
    return Stats;
  }
  if(Stats.Points.length===1){
    Box.append(Html_Element("div","History_Empty", "One recorded point: "+
      Number_Format.format(Stats.Points[0].Count)+" at "+Full_Time(Stats.Points[0].t,Zone)+
      ". More observations are needed for a trend."));
    Container.append(Box);
    Focus.textContent="First saved observation · not a trend yet";
    Container.parentElement.append(Foot);
    return Stats;
  }
  const Width=760,Height=255,Left=57,Right=18,Top=17,Bottom=31;
  const Min_X=Stats.First.t;
  const Max_X=Math.max(Min_X+1,Stats.Latest.t);
  const Range=Math.max(1,Stats.Max-Stats.Min);
  const Margin=Math.max(1,Range*0.3);
  const Min_Y=Math.max(0,Stats.Min-Margin);
  const Max_Y=Stats.Max+Margin;
  const Scale_X=(Item)=>Left+(Item.t-Min_X)/(Max_X-Min_X)*(Width-Left-Right);
  const Scale_Y=(Item)=>Top+(Max_Y-Item.Count)/(Max_Y-Min_Y)*(Height-Top-Bottom);
  const Svg=Svg_Element("svg",{
    viewBox:"0 0 "+Width+" "+Height,class:"History_Interactive_Svg",
    role:"img",tabindex:"0",
    "aria-label":Country_Code+" saved country activity chart. Use left and right arrow keys to inspect readings.",
  });
  const Defs=Svg_Element("defs");
  const Gradient=Svg_Element("linearGradient",{id:"History_Gradient",x1:"0",y1:"0",x2:"0",y2:"1"});
  Gradient.append(Svg_Element("stop",{offset:"0%","stop-color":"#5de2d0","stop-opacity":".27"}),
    Svg_Element("stop",{offset:"100%","stop-color":"#5de2d0","stop-opacity":".01"}));
  Defs.append(Gradient);
  Svg.append(Defs);
  for(const Ratio of [0,0.5,1]){
    const Y=Top+Ratio*(Height-Top-Bottom);
    Svg.append(Svg_Element("line",{x1:Left,y1:Y,x2:Width-Right,y2:Y,class:"History_Grid_Line"}));
    const Value=Math.round(Max_Y-(Max_Y-Min_Y)*Ratio);
    const Text=Svg_Element("text",{x:Left-8,y:Y+4,"text-anchor":"end",class:"History_Axis_Text"});
    Text.textContent=Number_Format.format(Value);
    Svg.append(Text);
  }
  const Groups=[];
  let Group=[];
  for(const Item of Stats.Points){
    if(Group.length&&Item.t-Group.at(-1).t>90*60){
      Groups.push(Group);
      Group=[];
    }
    Group.push(Item);
  }
  if(Group.length)Groups.push(Group);
  for(const Segment of Groups){
    const Line=Segment.map((Item,Index)=>(Index?"L":"M")+Scale_X(Item).toFixed(2)+","+
      Scale_Y(Item).toFixed(2)).join(" ");
    const Area=Line+" L"+Scale_X(Segment.at(-1)).toFixed(2)+","+
      (Height-Bottom)+" L"+Scale_X(Segment[0]).toFixed(2)+","+
      (Height-Bottom)+" Z";
    if(Segment.length>1)Svg.append(Svg_Element("path",{d:Area,class:"History_Area",fill:"url(#History_Gradient)"}));
    Svg.append(Svg_Element("path",{d:Line,class:"History_Line",fill:"none"}));
  }
  for(let Index=1;Index<Groups.length;Index++){
    const Earlier=Groups[Index-1].at(-1);
    const Later=Groups[Index][0];
    Svg.append(Svg_Element("line",{
      x1:Scale_X(Earlier),y1:Scale_Y(Earlier),x2:Scale_X(Later),y2:Scale_Y(Later),
      class:"History_Missing_Gap",
    }));
  }
  const Start_Label=Svg_Element("text",{x:Left,y:Height-6,"text-anchor":"start",class:"History_Axis_Text"});
  Start_Label.textContent=Month_Day_Time(Stats.First.t,Zone);
  const End_Label=Svg_Element("text",{x:Width-Right,y:Height-6,"text-anchor":"end",class:"History_Axis_Text"});
  End_Label.textContent=Month_Day_Time(Stats.Latest.t,Zone);
  Svg.append(Start_Label,End_Label);
  const Crosshair=Svg_Element("line",{x1:Left,y1:Top,x2:Left,y2:Height-Bottom,class:"History_Crosshair"});
  const Dot=Svg_Element("circle",{cx:Left,cy:Top,r:6,class:"History_Focus_Dot"});
  Svg.append(Crosshair,Dot);
  Box.append(Svg);
  const Tip=Html_Element("div","History_Tooltip");
  Tip.hidden=true;Box.append(Tip);
  Container.append(Box);
  const Meta=Html_Element("div","History_Axis_Caption",
    "Saved observations · auto-scaled y-axis · dashed lines = missing snapshots");
  Labels.append(Meta);
  let Selected_Index=Stats.Points.length-1;
  function Select_Point(Index,Show_Tooltip=true){
    Selected_Index=Math.max(0,Math.min(Stats.Points.length-1,Index));
    const Point=Stats.Points[Selected_Index];
    const Previous=Stats.Points[Selected_Index-1];
    const X=Scale_X(Point),Y=Scale_Y(Point);
    Crosshair.setAttribute("x1",X);Crosshair.setAttribute("x2",X);
    Dot.setAttribute("cx",X);Dot.setAttribute("cy",Y);
    const Delta=Previous?Point.Count-Previous.Count:null;
    const Text=Number_Format.format(Point.Count)+" reported · "+
      Signed_Change(Delta,Previous?.Count);
    Focus.textContent=Full_Time(Point.t,Zone)+"  ·  "+Text;
    Tip.replaceChildren();
    Tip.append(Html_Element("b","",Number_Format.format(Point.Count)+" reported"),
      Html_Element("span","",Full_Time(Point.t,Zone)),
      Html_Element("small","",Signed_Change(Delta,Previous?.Count)));
    Tip.hidden=!Show_Tooltip;
    const Percent_X=(X/Width*100);
    Tip.style.left=Math.max(12,Math.min(82,Percent_X))+"%";
    Tip.style.top=Math.max(3,Math.min(68,Y/Height*100-4))+"%";
  }
  function Select_Nearest(Event_Object){
    const Rect=Svg.getBoundingClientRect();
    const Fraction=(Event_Object.clientX-Rect.left)/Math.max(1,Rect.width);
    const Time=Min_X+(Math.min(1,Math.max(0,Fraction))*Width-Left)/
      (Width-Left-Right)*(Max_X-Min_X);
    let Nearest=0,Distance=Infinity;
    for(let Index=0;Index<Stats.Points.length;Index++){
      const Delta=Math.abs(Stats.Points[Index].t-Time);
      if(Delta<Distance){Nearest=Index;Distance=Delta;}
    }
    Select_Point(Nearest,true);
  }
  Svg.addEventListener("pointermove",Select_Nearest);
  Svg.addEventListener("pointerdown",Select_Nearest);
  Svg.addEventListener("pointerleave",()=>{Tip.hidden=true;});
  Svg.addEventListener("focus",()=>Select_Point(Selected_Index,true));
  Svg.addEventListener("blur",()=>{Tip.hidden=true;});
  Svg.addEventListener("keydown",(Event_Object)=>{
    const Steps={ArrowLeft:-1,ArrowRight:1,ArrowUp:-1,ArrowDown:1};
    if(Event_Object.key in Steps){
      Event_Object.preventDefault();
      Select_Point(Selected_Index+Steps[Event_Object.key],true);
    }else if(Event_Object.key==="Home"){Event_Object.preventDefault();Select_Point(0,true);}
    else if(Event_Object.key==="End"){Event_Object.preventDefault();Select_Point(Stats.Points.length-1,true);}
  });
  Select_Point(Stats.Points.length-1,false);

  const Details=Html_Element("details","History_Readings_Details");
  Details.open=Previous_Open;
  const Header=Html_Element("summary","",Stats.Points.length+" saved readings · inspect values");
  const Actions=Html_Element("div","History_Readings_Actions");
  const Export=Html_Element("button","Secondary_Button","Download history CSV");
  Export.type="button";
  Export.addEventListener("click",()=>Export_Country_History(Stats.Points,Country_Code,Pool,Zone));
  Actions.append(Export);
  const List=Html_Element("div","History_Readings_List");
  function Fill_List(Count=15){
    List.replaceChildren();
    const Start=Math.max(0,Stats.Points.length-Count);
    for(let Index=Stats.Points.length-1;Index>=Start;Index--){
      const Item=Stats.Points[Index];
      const Previous=Stats.Points[Index-1];
      const Row=Html_Element("button","History_Reading_Row");
      Row.type="button";
      Row.append(Html_Element("span","",Month_Day_Time(Item.t,Zone)),
        Html_Element("strong","",Number_Format.format(Item.Count)),
        Html_Element("small","",Previous?
          (Item.Count-Previous.Count>0?"+":"")+Number_Format.format(Item.Count-Previous.Count):"First"));
      Row.addEventListener("click",()=>{
        Select_Point(Index,true);
        Svg.focus();
      });
      List.append(Row);
    }
  }
  Fill_List();
  if(Stats.Points.length>15){
    const More=Html_Element("button","Secondary_Button","Show all recorded readings");
    More.type="button";More.addEventListener("click",()=>{Fill_List(Stats.Points.length);More.hidden=true;});
    Actions.append(More);
  }
  Details.append(Header,Actions,List);
  Foot.append(Details);
  Container.parentElement.append(Foot);
  const Gap_Message=Stats.Gaps_Count?
    Stats.Gaps_Count+" collection gap"+(Stats.Gaps_Count===1?"":"s")+" (>90 minutes)":
    "No long gaps between saved readings";
  Metrics.append(Html_Element("div","History_Gap_Note",
    "Coverage "+Stats.Coverage_Percent.toFixed(1)+"% · "+Gap_Message+" · "+
    Stats.Points.length+" observations"));
  return Stats;
}

export function Render_Interactive_Hours({ Peaks,Grid,Samples,Zone,Day_Filter,Country_Code }) {
  Peaks.replaceChildren();Grid.replaceChildren();
  Grid.setAttribute("role","group");
  Grid.setAttribute("aria-label","Average reported activity by hour, with coverage labels");
  const Data=Build_Hourly_Experience(Samples,Zone,Day_Filter);
  if(!Data)return null;
  let Note=Grid.parentElement.querySelector(".Hour_Inspector");
  if(!Note){Note=Html_Element("div","Hour_Inspector");Grid.after(Note);}
  const Header=Html_Element("div","Hour_Status");
  Header.textContent=Data.Confidence==="good"?"Well-covered pattern":
    Data.Confidence==="emerging"?"Emerging pattern — verify with more days":
    "Early observations — not a reliable best-time ranking";
  Peaks.append(Header);
  if(Data.Best_Hours.length){
    const Row=Html_Element("div","Hour_Peak_Cards");
    for(const Bin of Data.Best_Hours){
      const Card=Html_Element("button","Hour_Peak_Card");
      Card.type="button";
      Card.append(Html_Element("strong","",String(Bin.Hour).padStart(2,"0")+":00–"+
        String((Bin.Hour+1)%24).padStart(2,"0")+":00"),
        Html_Element("span","",Number_Format.format(Bin.Average)+" average"),
        Html_Element("small","",Bin.Sample_Count+" points across "+Bin.Distinct_Days+" days"));
      Card.addEventListener("click",()=>{
        Grid.querySelector('[data-hour="'+Bin.Hour+'"]')?.focus();
      });
      Row.append(Card);
    }
    Peaks.append(Row);
  }else if(Data.Preview.length){
    const Top=Data.Preview[0];
    Peaks.append(Html_Element("div","Hour_Preview_Note",
      "Strongest repeated sample: "+String(Top.Hour).padStart(2,"0")+":00 · "+
      Number_Format.format(Top.Average)+" average from "+Top.Sample_Count+
      " readings on "+Top.Distinct_Days+" days. Too early to recommend."));
  }else{
    Peaks.append(Html_Element("div","Hour_Preview_Note",
      "No hour has enough cross-day observations to suggest a best time yet. Explore the recorded hours below."));
  }
  const Max_Average=Math.max(1,...Data.Hours.filter((Bin)=>Bin.Average!==null).map((Bin)=>Bin.Average));
  const Min_Average=Math.min(...Data.Hours.filter((Bin)=>Bin.Average!==null).map((Bin)=>Bin.Average));
  const Range=Math.max(1,Max_Average-Min_Average);
  function Show_Hour(Bin){
    Note.textContent=String(Bin.Hour).padStart(2,"0")+":00–"+
      String((Bin.Hour+1)%24).padStart(2,"0")+":00 · "+
      (Bin.Average===null?"No saved readings":
        "Average "+Number_Format.format(Bin.Average)+" · range "+
        Number_Format.format(Bin.Min)+"–"+Number_Format.format(Bin.Max)+
        " · "+Bin.Sample_Count+(Bin.Sample_Count===1?" reading":" readings")+" across "+
        Bin.Distinct_Days+(Bin.Distinct_Days===1?" day":" days"))+
      (Bin.Is_Qualified?" · repeated sample":" · preliminary");
    for(const Item of Grid.querySelectorAll(".Insight_Hour_Column")){
      Item.dataset.selected=String(Number(Item.dataset.hour)===Bin.Hour);
    }
  }
  for(const Bin of Data.Hours){
    const Button=Html_Element("button","Insight_Hour_Column");
    Button.type="button";
    Button.dataset.hour=String(Bin.Hour);
    Button.dataset.covered=String(Bin.Average!==null);
    Button.dataset.now=String(Bin.Hour===Data.Now_Hour);
    Button.title=String(Bin.Hour).padStart(2,"0")+":00 — "+
      (Bin.Average===null?"no saved observations":Number_Format.format(Bin.Average)+
      " average from "+Bin.Sample_Count+" readings");
    const Bar=Html_Element("span","Insight_Hour_Bar");
    const Height=Bin.Average===null?5:
      16+(Bin.Average-Min_Average)/Range*70;
    Bar.style.height=Height+"px";
    if(Bin.Is_Qualified)Bar.classList.add("Highlight");
    else if(Bin.Average!==null)Bar.classList.add("Early");
    else Bar.classList.add("Empty");
    Button.append(Bar,Html_Element("small","",Bin.Hour%3===0?String(Bin.Hour).padStart(2,"0"):""));
    Button.setAttribute("aria-label",Button.title);
    Button.addEventListener("pointerenter",()=>Show_Hour(Bin));
    Button.addEventListener("focus",()=>Show_Hour(Bin));
    Button.addEventListener("click",()=>Show_Hour(Bin));
    Grid.append(Button);
  }
  const Current=Data.Hours[Data.Now_Hour??0] || Data.Hours[0];
  Show_Hour(Current);
  return Data;
}

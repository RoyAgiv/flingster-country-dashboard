import Test from "node:test";
import Assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Fetch_Online_Response } from "../scripts/collect.mjs";

Test("country chart fills its own content rather than a stretched grid cell", async () => {
  const Html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const Styles = await readFile(new URL("../assets/polish.css", import.meta.url), "utf8");
  const Insights = await readFile(new URL("../assets/insights.mjs", import.meta.url), "utf8");
  Assert.match(Styles, /\.Content_Grid\{align-items:start\}/);
  Assert.match(Styles, /#Top_Chart\{min-height:0/);
  Assert.match(Insights, /Select.value = "25"/);
  Assert.match(Insights, /Select.dispatchEvent\(new Event\("change"\)\)/);
  Assert.match(Insights, /Top_Chart_Info/);
  Assert.match(Insights, /countries · scroll for more/);
  Assert.match(Html, /assets\/polish\.css/);
});

Test("live peak, sparse graph and source provenance remain linked to the dashboard", async () => {
  const Insights = await readFile(new URL("../assets/insights.mjs", import.meta.url), "utf8");
  const Html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  Assert.match(Insights, /Calculate_Observed_Peak\(Country\?\.Count, Insight.Maximum_Count\)/);
  Assert.match(Insights, /Samples.length === 1/);
  Assert.match(Insights, /Grid.classList.toggle\("Insufficient"/);
  for (const Asset of ["provenance.mjs","matchlab.mjs","matchlab.css","polish.css"]) {
    Assert.ok(Html.includes(Asset));
  }
  Assert.doesNotMatch(Html, /Understanding the two websites/);
});

Test("alternate host requests are allowlisted and do not change the configured pool", async () => {
  const Countries = Object.fromEntries(Array.from({ length: 26 }, (_, Index) =>
    [String.fromCharCode(65, 65 + Index), Index + 1]));
  const Payload = JSON.stringify({ ALL: 351, ...Countries });
  let Captured_Url = "";
  const Mock_Fetch = async (Requested_Url) => {
    Captured_Url = Requested_Url;
    return { ok:true, text:async() => '<script>{"xhrl":"online","xhrd":' + Payload + ',"xhrh":{}}</script>' };
  };
  const Reading = await Fetch_Online_Response(Mock_Fetch,"Default","rest2.flingster.com");
  Assert.equal(Reading.n,351);
  Assert.equal(new URL(Captured_Url).hostname,"rest2.flingster.com");
  Assert.equal(new URL(Captured_Url).searchParams.get("room"),"Default");
  await Assert.rejects(Fetch_Online_Response(Mock_Fetch,"Adult","example.com"),/Unsupported statistics host/);
});

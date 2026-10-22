import Test from "node:test";
import Assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Fetch_Validated_Pool_With_Failover, Parse_Online_Response } from "../scripts/collect.mjs";

function Build_Validated_Html() {
  const Countries = Object.fromEntries(Array.from({ length: 26 }, (_, Index) => [
    String.fromCharCode(65, 65 + Index), Index + 1,
  ]));
  const Payload = { ALL: 351, ...Countries, Members: 33579065, Tags: ["flirt"] };
  return '<script>window.parent.postMessage({"xhrl":"online","xhrd":' +
    JSON.stringify(Payload) + ',"xhrh":{"x-site":"Flingster"}},"*")</script>';
}

Test("if the primary statistics host fails, a validated alternate host is used", async () => {
  const Host_Calls = [];
  const Stub_Fetch = async (Url) => {
    const Host = new URL(Url).hostname;
    Host_Calls.push(Host);
    if (Host === "rest.flingster.com") return { ok: false, status: 503 };
    return { ok: true, text: async () => Build_Validated_Html() };
  };
  const Result = await Fetch_Validated_Pool_With_Failover(Stub_Fetch, "Adult");
  Assert.equal(Result.Host, "rest2.flingster.com");
  Assert.equal(Result.Snapshot.n, 351);
  Assert.equal(Result.Snapshot.c.AA, 1);
  Assert.ok(Host_Calls.includes("rest.flingster.com"));
  Assert.ok(Host_Calls.includes("rest2.flingster.com"));
  Assert.equal(Host_Calls.includes("api.flingster.com"), false);
});

Test("ambiguous duplicate country entries remain rejected, not guessed", () => {
  const Fixture = Build_Validated_Html();
  const Ambiguous = Fixture.replace('"AZ":26,"Members"', '"AZ":26,"AA":999,"Members"');
  Assert.throws(() => Parse_Online_Response(Ambiguous), /Country count reconciliation failed/);
  const Repeated_But_Same_Value = Fixture.replace('"AZ":26,"Members"', '"AZ":26,"AA":1,"Members"');
  Assert.throws(() => Parse_Online_Response(Repeated_But_Same_Value), /duplicate country code/);
});

Test("invalid upstream observations do not block dashboard deployment", async () => {
  const Workflow = await readFile(new URL("../.github/workflows/collect-and-deploy.yml", import.meta.url), "utf8");
  Assert.match(Workflow, /id: capture\s+continue-on-error: true\s+run: node scripts\/collect\.mjs/);
  Assert.match(Workflow, /if: steps\.capture\.outcome == 'failure'/);
  Assert.match(Workflow, /last valid history remains unchanged/);
  Assert.match(Workflow, /actions\/deploy-pages@v4/);
  const Script = await readFile(new URL("../scripts/collect.mjs", import.meta.url), "utf8");
  Assert.match(Script, /source_hosts:/);
  Assert.match(Script, /COUNTRYPULSE_POOL_UNAVAILABLE/);
  Assert.match(Script, /Fetch_Validated_Pool_With_Failover/);
});

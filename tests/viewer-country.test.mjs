import test from "node:test";
import assert from "node:assert/strict";
import { Setup_Viewer_Card, Visitor_Code } from "../assets/viewer-country.mjs";

test("connection country rejects missing, non-country and unrecognized feed values", () => {
  assert.equal(Visitor_Code(" jp "), "JP");
  for (const value of [undefined, {}, "XX", "ZZ", "EU", "USA", ""]) assert.equal(Visitor_Code(value), null);
});

test("card follows the connection, respects manual choices and opens the displayed country", (t) => {
  class Control extends EventTarget {
    dataset = {};
    setAttribute() {}
    removeAttribute() {}
    replaceChildren(...children) { this.children = children; }
  }
  const nodes = new Map();
  const doc = {getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, new Control());
    return nodes.get(id);
  }};
  const settings = new Map();
  const globals = {
    document:doc, window:new EventTarget(),
    Option:class { constructor(text,value) { this.text=text; this.value=value; } },
    localStorage:{getItem:k=>settings.get(k),setItem:(k,v)=>settings.set(k,v),removeItem:k=>settings.delete(k)},
  };
  for (const [key,value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,value});
    t.after(()=>original ? Object.defineProperty(globalThis,key,original) : delete globalThis[key]);
  }
  const card = Setup_Viewer_Card(code=>code, ()=> "");
  const open = nodes.get("Viewer_Open"), choice = nodes.get("Viewer_Choice");
  let opened;
  window.addEventListener("countrypulse:open-country", event=>{ opened=event.detail.Code; });
  card.updateReading([{Code:"JP",Count:10},{Code:"US",Count:0}], 10);
  assert.ok(open.disabled);
  card.updateHistory([{c:{OM:4}, rooms:{Default:{c:{QA:1}}}}]);
  assert.ok(choice.children.some(option=>option.value === "QA"));
  assert.ok(choice.children.some(option=>option.value === "OM"));
  card.reportCountry("jp");
  assert.match(nodes.get("Viewer_Reading").textContent, /10 online/);
  open.dispatchEvent(new Event("click"));
  assert.equal(opened,"JP");

  choice.value="US";
  choice.dispatchEvent(new Event("change"));
  card.reportCountry("FR");
  assert.match(nodes.get("Viewer_Reading").textContent, /0 online/);
  open.dispatchEvent(new Event("click"));
  assert.equal(opened,"US");
  assert.equal(settings.get("countrypulse-viewer-country"),"US");

  choice.value="";
  choice.dispatchEvent(new Event("change"));
  card.reportCountry("ZZ");
  assert.equal(nodes.get("Viewer_Reading").textContent,"No count in this pool");
  open.dispatchEvent(new Event("click"));
  assert.equal(opened,"FR");
  card.updateReading([],0);
  assert.equal(nodes.get("Viewer_Reading").textContent,"Waiting for a reading");
});

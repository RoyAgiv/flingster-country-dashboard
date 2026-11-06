// Only the live, origin-checked frame supplies the connection country.
// A manual choice belongs to this browser and never changes the feed or its ranking.
const Choice_Key = "countrypulse-viewer-country";
const Region_Names = new Intl.DisplayNames(["en"], {type:"region", fallback:"none"});

export function Visitor_Code(value) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(code) || ["ZZ","EU","EZ","UN","QO","XA","XB"].includes(code)) return null;
  return Region_Names.of(code) ? code : null;
}

export function Setup_Viewer_Card(countryName, countryFlag) {
  const open = document.getElementById("Viewer_Open");
  const choice = document.getElementById("Viewer_Choice");
  const name = document.getElementById("Viewer_Name");
  const reading = document.getElementById("Viewer_Reading");
  const label = document.getElementById("Viewer_Label");
  const numbers = new Intl.NumberFormat("en-US");
  let detected = null, manual = null, rows = [], total = 0;
  try { manual = Visitor_Code(localStorage.getItem(Choice_Key)); } catch {}

  function render() {
    const code = manual || detected;
    const row = rows.find(item => item.Code === code);
    const codes = new Set(rows.map(item => item.Code));
    if (code) codes.add(code);
    const list = [...codes].sort();
    if (choice.dataset.codes !== list.join(",")) {
      const options = list.map(item => new Option(countryName(item), item))
        .sort((a,b) => a.text.localeCompare(b.text));
      choice.replaceChildren(new Option("Automatic · connection country", ""), ...options);
      choice.dataset.codes = list.join(",");
    }
    choice.value = manual || "";
    choice.disabled = !list.length;
    label.textContent = manual ? "Selected country" : "Your country";
    name.textContent = code ? countryFlag(code) + " " + countryName(code) : rows.length ? "Choose a country" : "Locating…";
    reading.textContent = row ? numbers.format(row.Count) + " online · " +
      (row.Count / total * 100).toFixed(1) + "% of pool" :
      !rows.length ? "Waiting for a reading" : code ? "No count in this pool" : "Location unavailable";
    open.disabled = !code;
    if (code) open.setAttribute("aria-label","Open " + countryName(code) + " country history. " + reading.textContent);
    else open.removeAttribute("aria-label");
  }

  open.addEventListener("click", () => {
    const code = manual || detected;
    if (code) window.dispatchEvent(new CustomEvent("countrypulse:open-country", {detail:{Code:code}}));
  });
  choice.addEventListener("change", () => {
    manual = Visitor_Code(choice.value);
    try {
      if (manual) localStorage.setItem(Choice_Key, manual);
      else localStorage.removeItem(Choice_Key);
    } catch {}
    render();
  });
  render();
  return {
    reportCountry(value) {
      const code = Visitor_Code(value);
      if (code && code !== detected) { detected = code; render(); }
    },
    updateReading(nextRows, nextTotal) {
      rows = nextRows;
      total = nextTotal;
      render();
    },
  };
}

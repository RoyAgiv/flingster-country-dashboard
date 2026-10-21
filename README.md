# CountryPulse

A small, dependency-free HTML dashboard showing country-by-country online counts reported by the **same Flingster-hosted feed** loaded by both Flingster and DirtyRoulette.

Open `index.html` in a modern browser or use the hosted GitHub Pages site. The page embeds the public `rest.flingster.com/xhr.html?v=2&online=1&room=Adult&config=1&lang=en` response in a hidden iframe and reads its `xhrl: "online"` message. The page does not collect personal data, use a proxy, or need a login.

**Important:** Values are site-reported, not independently verified counts of unique people; they may be cached, generated, or adjusted. This is a shared source and cannot identify how many visitors belong uniquely to either site. The source does not include live gender/couple counts.

Refresh manually or enable the default 60-second refresh. Search/sort locations and export CSV. The page fails visibly if no valid source response arrives.

Site is independent and unaffiliated with either platform.

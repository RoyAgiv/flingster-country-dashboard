# CountryPulse

**Live dashboard:** https://royagiv.github.io/flingster-country-dashboard/

CountryPulse is a lightweight, searchable dashboard for activity **reported** by public Flingster-hosted endpoints. It is not affiliated with Flingster or DirtyRoulette, and reported numbers should not be represented as independently verified unique users.

## Dashboard

- **Adult**, **Default**, or **Combined** technical pools. Adult is the pool used by both tested Flingster and DirtyRoulette pages. The Default pool's site ownership is unknown; Combined is a provider-reported query (`room=Adult,Default`), **not** an arithmetic sum or verified distinct-user total.
- Country rankings, top 10/25/50/all, search, sort, CSV export, and pinning countries.
- Rising/falling country cards with absolute and relative changes over the latest saved snapshot, 1 hour, 24 hours, or 7 days. Comparisons always remain **within the same pool**. Low counts (under 25) are excluded from mover rankings to avoid misleading swings.
- Click countries for saved hourly patterns, activity history, cross-pool **last-saved** counts, and weekday versus weekend averages as sufficient data accumulates.
- Reported membership with day-over-day change after a comparable full day of data; interest-tag names (not per-tag participation counts).
- Data-quality notes identify suspicious multiple-of-seven and multiple-of-twelve patterns and repeated saved snapshots. Flags indicate uncertainty, not proof of intentional inflation.
- An expandable research section contains September 2026 **estimated website visits** from Semrush and links to the historical DirtyRoulette research archive. Website traffic is distinct from simultaneous chat activity.

## CountryPulse 4: provenance and matching tools

- The ranking defaults to **Top 25**, uses a bounded scroll area, has **Show all**, and no longer stretches to the height of the neighboring trend card.
- In a country drawer, **Highest observed** includes the latest live reading plus saved peaks for the selected period, so it can never be lower than **Reported now**. The recorded average still uses saved history only.
- **Server consistency** compares up to three publicly accessible hosts (rest, rest2, and api) for Adult and Default, and stores bounded total/member-count summaries alongside new 30-minute snapshots. Replica failures are nonfatal. These hosts may share backend infrastructure and do not establish independently verified unique users.
- **Member growth** is withheld when host totals disagree, the current counter differs too much from the last check, or no valid prior-day cross-check exists.
- The expandable research area has historical 2026 Semrush website and device estimates, the 2021 DirtyRoulette study, and specialized page shortcuts. These are separate from live pool statistics.
- **Interest checker** uses the previously observed October 2026 accepted/rejected tags only, clearly indicating that it is not real-time validation. Unseen tags remain unknown.
- **MatchLab** optionally records anonymous session settings, duration, connection counts and worthwhile matches solely in your browser local storage. Data is not uploaded. Recommendations require at least two sessions and 30 minutes per interest.

## Centered country explorer and population context

Clicking any country opens a **centered, keyboard-accessible modal** that prioritizes the provider-reported online count, recent average, saved peak, and historical activity. The country popup uses a two-column chart layout on desktop and one column on mobile.

Below the main metrics is a deliberately small context line comparing the **reported** country online count against that country's latest available World Bank population. It shows the fraction as a very small percentage and as reported online counts per million residents. This does **not** measure the actual penetration of Flingster among the country population; values are provider-reported and may include shared partner activity.

A source-labeled **hypothetical gender/couples scenario calculator** supports the following starting assumptions:

- **Flingster review** — DatingScout October 2026, 70% men, 30% women; couples share unreported.
- **DirtyRoulette review** — Monkey App Alternatives, 85% men, 15% women; weak unverified methodology.
- **Tinder example** — SwipeStats 2026 sample, 67% men, 33% women; a different platform, not a Flingster measurement.
- **Custom assumptions** — editable women and couples shares, with men calculated as the remainder.

A source option with 0% couples is only a modeling default, **not evidence that no couples are online**. All resulting counts are examples, not live gender/couple data. No public country-specific gender statistics are currently available.

Country details also compare **Adult versus Default country share of each separate reported pool**, without interpreting it as user gender, tag demand, or distinct audience identity. The shared interest tags are suggestions rather than a verified popularity ranking, and some valid interests are missing from the suggestion list.

Population reference values come from the [World Bank's Population, total indicator](https://data.worldbank.org/indicator/SP.POP.TOTL), refreshed approximately monthly through the existing GitHub Actions collector. Countries missing official data show an unavailable state rather than a fabricated population.

## Network Explorer and response identity

The dashboard includes a compact expandable **Network Explorer** covering seven
brands: Flingster, DirtyRoulette, Chatrandom, Camsurf, Shagle, Camgo, and Chatspin.

- Six brands have validated technical activity feeds. DirtyRoulette is labeled
  as a **shared Flingster Adult-feed alias**, not an independent seventh pool.
- Default and provider-reported Combined (technical room: Default,Adult) can be
  compared per brand. Their reported counts may overlap and **must never be added
  together to infer unique people**.
- Country-data SHA-256 fingerprints group exactly matching geographic snapshots.
  Similar worldwide totals alone do not prove identical datasets.
- The existing 30-minute GitHub workflow also collects compact network snapshots,
  and a daily verified configuration snapshot tracks selected feature flags,
  premium labels, token settings, and public interest suggestions.
  Volatile visitor-region identifiers and member counters are not treated as
  configuration changes.
- The collector requires a known application name, expected brand identity,
  a valid worldwide-country sum, and metadata that is not the three-member fallback.
  The lightweight onlineCountries JSON reports ALL:0 and is used only as an
  identity/metadata check, never a usable live online counter.
- Temporarily unreachable brands are marked unavailable instead of reported as zero.
  The optional network collector does not replace the verified Flingster country
  history and does not force-push when Git has concurrent changes.
- Chatspin reward figures are configuration values, not proof of redemption or
  of free gender-filter access. Historic visit estimates are separate from
  live online figures.

The shared data does not prove a common matchmaking queue or independent
brand populations. The public feeds still do not show verified live gender,
interest, or waiting-user totals.

## UX resilience and comparison

- The home view falls back to the **latest validated saved reading per selected pool** if the live Flingster iframe cannot respond. Fallback data can come from the last published GitHub history snapshot or a small browser-local country-count cache. Saved data is always labeled **Saved**, with an age and exact observation time; it is never presented as live.
- Live retry state is independent from chart/table data availability. Transient failures preserve country search, rankings, CSV and country-detail access. If neither saved nor live data exists, both chart and table show **Data unavailable** with nearby retry controls, not contradictory loading/no-results messages.
- Automatically retry failed live requests with bounded 15/30/60/120-second delays. Do not create an additional server, agent or scheduled monitor; the existing collector remains authoritative for historical snapshots.
- A smaller hero, sticky sections navigation, immediate country search, saved-versus-live status, copyable filtered URL and browser-local view preset help users reach data more quickly.
- An optional **2–4 country comparison** shares pool and time range, showing reported online totals, share of the selected pool and changes only when a properly aligned historical baseline exists. No missing trend values are invented. The existing best-hours country popup now explicitly labels its time-planning confidence/sample coverage.
- The seven-brand Network Explorer also has an optional compact table; shared snapshots remain grouped and **are never summed** as distinct people.
- MatchLab country choices come from the local World Bank country directory with a small built-in fallback and an Unknown choice, not from live chat data. Pause/resume, undo, JSON backup/import and a disabled-empty clear action preserve local-only ownership and avoid claiming fabricated sessions. Pause durations are excluded from good-matches-per-hour calculations.
- Interest validation handles an empty field as **Enter an interest to check.** Existing historically accepted/rejected results remain clearly labeled as historical.

These are UI changes to provider-reported statistics; they do not change the underlying public counts or provide live gender, couples or interest-popularity data.

## Collection

The existing [CountryPulse · Capture and publish](.github/workflows/collect-and-deploy.yml) GitHub Actions workflow runs on the `7,37 * * * *` schedule and on repository pushes. GitHub schedules may be late or skipped. Its collector fetches validated Adult, Default and Combined responses, preserves historic Adult-only snapshots, and stores a rolling 45 days in `data/history.json`.

Each history record retains the original compatible Adult format (`t`, `n`, `c`); newer records also contain `rooms.Default`, `rooms.Combined`, and optional `members` and `tags`. Missing historic pool measurements are **never inferred**.

Only the collector writes `data/history.json` in scheduled deployments. GitHub actions commits are non-force; concurrent main changes fail safely rather than overwriting them. Each run builds and deploys the full static page. Pages is configured to use **GitHub Actions** as its deployment source.

**Tests:** `node --test tests/*.test.mjs`

**Manual sample:** `node scripts/collect.mjs` (skips samples within 25 minutes of the latest saved reading).

## Interpretation

Flingster and DirtyRoulette currently use the same Adult country statistics source; those figures do **not** separate websites or genders. The Default pool's origin is unknown. Reported total membership is not additive across pools.

Unusual repeated multiples of 7 and 12 are strong evidence of numerical adjustment or coarse scaling. Country counts, trends, averages, and forecasts should remain explicitly marked **provider-reported estimates**.

Historical chart comparisons and peak-hour conclusions improve only after enough saved samples and multiple days of coverage. No fabricated values are displayed for missing data.

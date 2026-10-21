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

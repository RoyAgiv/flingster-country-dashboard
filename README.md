# CountryPulse

Live dashboard: https://royagiv.github.io/flingster-country-dashboard/

A dependency-free, mobile-friendly dashboard for the **same public country-count feed** loaded by Flingster and DirtyRoulette. The numbers cannot be distinguished by platform and are not independently audited counts of unique people.

## What it does

- **Live country search, sorting, top 10 / 25 / 50 / all** and CSV export.
- Click any country to open a **history drawer** with a time-series graph, recorded average, recorded high, and the best hours based on historical samples.
- Choose **24 hours, 7 days, or 30 days**; display peak hours in your browser's timezone (the default) or UTC.
- **Pin favorite countries** for one-click access. Pinned choices stay only in your own browser.
- A scheduled GitHub Actions workflow **attempts a snapshot every 30 minutes** (07 and 37 minutes past each UTC hour), stores a rolling **45 days** in `data/history.json`, and deploys the updated static site. GitHub's scheduled workflows can run late or be skipped; the dashboard shows coverage.

## Interpreting the historical insights

The site's own public response contains country totals, not a time series or a male/female/couples breakdown. History begins only when we start collecting.

An hour must have **at least four samples across two different local days** before it can appear in the top-hours ranking. With three or more observation days and six qualified hour buckets, the dashboard considers its initial coverage usable. It still labels averages as **site-reported, unaudited, and potentially generated/rounded**, never exact real-person counts.

The country detail view defaults to **your current browser timezone** so you can see when to visit. UTC is also available. Countries with multiple timezones are not assumed to have one single local clock.

## Operations

The [CountryPulse · Capture and publish](.github/workflows/collect-and-deploy.yml) workflow is both the collector and the GitHub Pages deployment. Use **Actions → CountryPulse · Capture and publish → Run workflow** for an extra snapshot; it will avoid duplicates less than 25 minutes apart.

Tests: `node --test tests/*.test.mjs`

Manual one-shot capture: `node scripts/collect.mjs`

The repository must use **GitHub Pages → Build and deployment → Source: GitHub Actions**, because a commit made using `GITHUB_TOKEN` does not automatically trigger a separate branch-based GitHub Pages build.

The workflow pushes only `data/history.json`, without force-pushing or resetting other people's work, and fails closed if a concurrent remote commit prevents a fast-forward push.

CountryPulse is independent and not affiliated with either website.

# Job Union Scraper

An Apify Actor that runs **Google Jobs Scraper** (`johnvc/Google-Jobs-Scraper`) and **LinkedIn Jobs Scraper** (`jungle_thunder/linkedin-jobs-scraper-free-trial`) **in parallel**, normalises their outputs into a single common schema, deduplicates overlapping listings, and returns the combined results to the caller.

---

## Architecture

```
Actor.call(this actor)
         │
         ├─── runGoogleJobsScraper()  ──► johnvc/Google-Jobs-Scraper
         │                                        │
         │                               normaliseGoogle()
         │                                        │
         └─── runLinkedInJobsScraper() ──► jungle_thunder/linkedin-jobs-scraper-free-trial
                                                  │
                                         normaliseLinkedIn()
                                                  │
                                    ┌─────────────┴──────────────┐
                                    │  deduplicateJobs()          │
                                    │  (merge by title+co+loc)    │
                                    └─────────────┬──────────────┘
                                                  │
                                         Actor.pushData()
                                      (default dataset → caller)
```

Both child actors run concurrently via `Promise.all`. If either child fails, the actor logs the error and continues with results from the healthy source.

---

## Normalised output schema

Every job record in the dataset conforms to the following shape:

| Field | Type | Description |
|---|---|---|
| `title` | string | Job title |
| `company` | string | Company name |
| `location` | string | Job location |
| `country` | string\|null | Country code or name |
| `description` | string\|null | Plain-text job description |
| `descriptionHtml` | string\|null | HTML job description |
| `highlights.qualifications` | string[] | Qualification bullet points (Google) |
| `highlights.responsibilities` | string[] | Responsibility bullet points (Google) |
| `highlights.benefits` | string[] | Benefits (Google highlights / LinkedIn benefits field) |
| `employmentType` | string\|null | e.g. "Full-time", "Contract" |
| `workplaceType` | string\|null | "Remote", "Hybrid", "On-site" |
| `experienceLevel` | string\|null | e.g. "Mid-Senior", "Entry" |
| `salary` | string\|null | Salary info where available |
| `postedAt` | string\|null | Posting date |
| `applyUrl` | string\|null | Primary apply URL |
| `applyUrls` | string[] | All collected apply URLs |
| `linkedInApplyUrl` | string\|null | Direct LinkedIn job URL |
| `easyApply` | boolean | LinkedIn Easy Apply flag |
| `companyUrl` | string\|null | Company LinkedIn page URL |
| `companyLogoUrl` | string\|null | Company logo URL |
| `companySize` | string\|null | Employee count |
| `companyIndustry` | string\|null | Company industry |
| `applicantCount` | number\|null | Number of applicants |
| `viewCount` | number\|null | View count |
| `jobId` | string\|null | Source-native job ID |
| `_source` | `"google"` \| `"linkedin"` \| `"both"` | Which source(s) provided this record |
| `_sources` | string[] | Array of source names |
| `_normalisedAt` | ISO string | Timestamp when normalisation ran |
| `_dedupeKey` | string | Internal dedup key (title\|company\|location) |

When `outputNormalised` is `false`, the original raw payload is preserved in a `_raw` field.

---

## Input fields

### Orchestration

| Field | Type | Default | Description |
|---|---|---|---|
| `query` ⚠️ | string | — | **Required.** Sent to both Google Jobs and LinkedIn. |
| `location` | string | `""` | Primary location for both sources. |
| `sources` | string[] | `["google","linkedin"]` | Which sources to query. |
| `deduplicateResults` | boolean | `true` | Merge records that match on title+company+location. |
| `outputNormalised` | boolean | `true` | Emit the normalised schema; set to `false` to also get raw payloads. |
| `apifyApiToken` | string | — | Optional personal Apify API token for calling child actors (secret). |

### `googleConfig` object

| Field | Type | Default | Description |
|---|---|---|---|
| `country` | string | `"None"` | ISO 3166-1 alpha-2 country code. |
| `language` | string | `"None"` | Language code for results. |
| `google_domain` | string | `"google.com"` | Regional Google domain. |
| `num_results` | integer | `100` | Max results to return. |
| `max_pagination` | integer | `0` | Max pages (0 = unlimited). |
| `include_lrad` | boolean | `false` | Enable radius filtering. |
| `lrad_value` | string | `"10"` | Radius in km when `include_lrad` is `true`. |
| `max_delay` | integer | `1` | Seconds between requests. |

### `linkedInConfig` object — `jungle_thunder/linkedin-jobs-scraper-free-trial`

| Field | Type | Default | Description |
|---|---|---|---|
| `totalJobs` | integer | `50` | Jobs to scrape. Free trial cap: 50; paid: up to 1000. |
| `experienceLevel` | string[] | `[]` | `"Internship"`, `"Entry"`, `"Associate"`, `"Mid-Senior"`, `"Director"`, `"Executive"`. |
| `jobType` | string[] | `[]` | `"Full-time"`, `"Part-time"`, `"Contract"`, `"Temporary"`, `"Volunteer"`, `"Internship"`. |
| `remoteFilter` | string[] | `[]` | `"On-site"`, `"Remote"`, `"Hybrid"`. |
| `timePosted` | string | `"any"` | `"any"`, `"past-24h"`, `"past-week"`, `"past-month"`. |
| `companyIds` | string[] | `[]` | LinkedIn numeric company IDs to restrict results to. |
| `includeDescription` | boolean | `true` | Fetch full job descriptions (slightly slower). |
| `startOffset` | integer | `0` | Skip first N results (pagination / resume). |
| `maxConcurrency` | integer | `5` | Parallel requests. 5 = stable, 10 = fast. |

---

## Example input

```json
{
  "query": "Senior Software Engineer",
  "location": "London, UK",
  "sources": ["google", "linkedin"],
  "deduplicateResults": true,
  "outputNormalised": true,
  "googleConfig": {
    "country": "uk",
    "google_domain": "google.co.uk",
    "num_results": 50
  },
  "linkedInConfig": {
    "totalJobs": 100,
    "remoteFilter": ["Remote", "Hybrid"],
    "jobType": ["Full-time"],
    "experienceLevel": ["Mid-Senior", "Director"],
    "timePosted": "past-week",
    "includeDescription": true,
    "maxConcurrency": 10
  }
}
```

---

## Project structure

```
job-union-actor/
├── .actor/
│   ├── actor.json          # Actor metadata
│   └── input_schema.json   # Full input schema (Apify Console UI)
├── src/
│   ├── main.js             # Entry point — orchestrates everything
│   ├── googleRunner.js     # Calls johnvc/Google-Jobs-Scraper
│   ├── linkedinRunner.js   # Calls jungle_thunder/linkedin-jobs-scraper-free-trial
│   ├── normalise.js        # Normalises raw payloads to common schema
│   └── dedup.js            # Deduplication & merging logic
├── Dockerfile
├── package.json
└── README.md
```

---

## Calling from the Apify MCP server (Claude)

Claude can call this Actor via the Apify MCP server using the `Apify:call-actor` tool:

```json
{
  "actor": "your-username/job-union-scraper",
  "input": {
    "query": "Product Manager",
    "location": "Berlin, Germany",
    "sources": ["google", "linkedin"],
    "linkedInConfig": {
      "remoteFilter": ["Hybrid"],
      "timePosted": "past-week",
      "totalJobs": 50
    }
  }
}
```

The actor will return all matching jobs in the normalised schema described above.

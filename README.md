# Job Union Scraper

An Apify Actor that runs **Google Jobs Scraper** (`johnvc/Google-Jobs-Scraper`) and **LinkedIn Job Search** (`harvestapi/linkedin-job-search`) **in parallel**, normalises their outputs into a single common schema, deduplicates overlapping listings, and returns the combined results to the caller.

---

## Architecture

```
Actor.call(this actor)
         │
         ├─── runGoogleJobsScraper()  ──► johnvc/Google-Jobs-Scraper
         │                                        │
         │                               normaliseGoogle()
         │                                        │
         └─── runLinkedInJobsScraper() ──► harvestapi/linkedin-job-search
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
| `descriptionHtml` | string\|null | HTML job description (LinkedIn only) |
| `highlights.qualifications` | string[] | Qualification bullet points (Google) |
| `highlights.responsibilities` | string[] | Responsibility bullet points (Google) |
| `highlights.benefits` | string[] | Benefit bullet points (Google) |
| `employmentType` | string\|null | e.g. "Full-time", "Contract" |
| `workplaceType` | string\|null | "Remote", "Hybrid", "On-site" (LinkedIn) |
| `experienceLevel` | string\|null | e.g. "Mid-Senior level" (LinkedIn) |
| `salary` | string\|null | Salary info where available |
| `postedAt` | string\|null | Posting date (ISO-8601 or raw string) |
| `applyUrl` | string\|null | Primary apply URL |
| `applyUrls` | string[] | All collected apply URLs |
| `linkedInApplyUrl` | string\|null | Direct LinkedIn apply URL |
| `easyApply` | boolean | LinkedIn Easy Apply flag |
| `companyUrl` | string\|null | Company page URL |
| `companyLogoUrl` | string\|null | Company logo URL |
| `companySize` | string\|null | Employee count (LinkedIn) |
| `companyIndustry` | string\|null | Company industry (LinkedIn) |
| `applicantCount` | number\|null | Number of applicants |
| `viewCount` | number\|null | View count (LinkedIn) |
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

### `linkedInConfig` object

| Field | Type | Default | Description |
|---|---|---|---|
| `extraJobTitles` | string[] | `[]` | Additional LinkedIn search queries (boolean operators supported). |
| `extraLocations` | string[] | `[]` | Additional LinkedIn locations. |
| `maxItemsPerQuery` | integer | `25` | Max jobs per title×location pair. |
| `company` | string[] | — | Company page URLs or names. |
| `workplaceType` | string[] | — | `remote`, `hybrid`, `office`. |
| `employmentType` | string[] | — | `full-time`, `part-time`, `contract`, `internship`, `temporary`. |
| `experienceLevel` | string[] | — | `internship`, `entry`, `associate`, `mid-senior`, `director`, `executive`. |
| `salary` | string[] | — | LinkedIn salary brackets (`40k+` … `200k+`). |
| `under10Applicants` | boolean | `false` | Only jobs with <10 applicants. |
| `easyApply` | boolean | `false` | Only Easy Apply jobs. |
| `postedLimit` | string | — | `1h`, `24h`, `week`, `month`. |
| `sortBy` | string | `"relevance"` | `date` or `relevance`. |
| `industryIds` | string[] | — | LinkedIn industry IDs. |
| `geoIds` | string[] | — | LinkedIn geo IDs. |
| `startPage` | integer | `1` | Start page for pagination. |
| `cookie` | string | — | LinkedIn session cookies (secret). |
| `userAgent` | string | — | Custom User-Agent. |
| `proxy` | string | — | Custom proxy URL (secret). |

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
    "maxItemsPerQuery": 50,
    "workplaceType": ["remote", "hybrid"],
    "employmentType": ["full-time"],
    "experienceLevel": ["mid-senior", "director"],
    "postedLimit": "week",
    "sortBy": "date"
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
│   ├── linkedinRunner.js   # Calls harvestapi/linkedin-job-search
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
      "workplaceType": ["hybrid"],
      "postedLimit": "week"
    }
  }
}
```

The actor will return all matching jobs in the normalised schema described above.

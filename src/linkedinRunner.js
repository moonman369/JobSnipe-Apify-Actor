import { Actor, log } from "apify";
import { ApifyClient } from "apify-client";

/**
 * Calls jungle_thunder/linkedin-jobs-scraper-free-trial and returns its dataset items.
 *
 * Actor page: https://console.apify.com/actors/IVlKNE78L4uOQFvAZ
 */
export async function runLinkedInJobsScraper({
  query,
  location,
  config,
  token,
}) {
  const {
    totalJobs = 50,
    experienceLevel,
    jobType,
    remoteFilter,
    timePosted = "any",
    companyIds,
    includeDescription = true,
    startOffset = 0,
    maxConcurrency = 5,
  } = config;

  const actorInput = {
    searchKeywords: query,
    location: location || "Worldwide",
    totalJobs,
    includeDescription,
    startOffset,
    maxConcurrency,
    timePosted,
  };

  if (experienceLevel?.length) actorInput.experienceLevel = experienceLevel;
  if (jobType?.length) actorInput.jobType = jobType;
  if (remoteFilter?.length) actorInput.remoteFilter = remoteFilter;
  if (companyIds?.length) actorInput.companyIds = companyIds;

  log.debug("LinkedIn Jobs Scraper (jungle_thunder) input", actorInput);

  let run;
  try {
    run = await Actor.call(
      "jungle_thunder/linkedin-jobs-scraper-free-trial",
      actorInput,
      token ? { token } : {},
    );
  } catch (err) {
    log.error("LinkedIn Jobs Scraper run failed", { error: err.message });
    return [];
  }

  if (!run?.defaultDatasetId) {
    log.warning("LinkedIn Jobs Scraper returned no dataset ID.");
    return [];
  }

  return fetchDatasetItems(run.defaultDatasetId, token);
}

// ─── Shared dataset helper ────────────────────────────────────────────────────

/**
 * Reads all items from a child actor's dataset.
 *
 * Uses ApifyClient directly (not Actor.openDataset) so that the platform-level
 * token is used — Actor.openDataset goes through Crawlee's storage manager
 * which is scoped to the current actor and returns 403 on foreign datasets.
 *
 * @param {string}  datasetId
 * @param {string}  [token]   - Custom token; falls back to Actor.apifyClient
 */
async function fetchDatasetItems(datasetId, token) {
  const client = token ? new ApifyClient({ token }) : Actor.apifyClient;

  const allItems = [];
  let offset = 0;
  const limit = 1000;

  // Paginate through the full dataset
  while (true) {
    const page = await client
      .dataset(datasetId)
      .listItems({ offset, limit, clean: true });
    allItems.push(...(page.items ?? []));
    if (allItems.length >= page.total || page.items.length < limit) break;
    offset += limit;
  }

  return allItems;
}

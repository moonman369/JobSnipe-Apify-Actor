import { Actor, log } from "apify";
import { ApifyClient } from "apify-client";

/**
 * Calls johnvc/Google-Jobs-Scraper and returns its dataset items.
 */
export async function runGoogleJobsScraper({ query, location, config, token }) {
  const {
    country = "None",
    language = "None",
    google_domain = "google.com",
    num_results = 100,
    max_pagination = 0,
    include_lrad = false,
    lrad_value = "10",
    max_delay = 1,
  } = config;

  const actorInput = {
    query,
    ...(location ? { location } : {}),
    country,
    language,
    google_domain,
    num_results,
    max_pagination,
    include_lrad,
    max_delay,
  };

  if (include_lrad && lrad_value) {
    actorInput.lrad_value = lrad_value;
  }

  log.debug("Google Jobs Scraper input", actorInput);

  let run;
  try {
    run = await Actor.call(
      "johnvc/Google-Jobs-Scraper",
      actorInput,
      token ? { token } : {},
    );
  } catch (err) {
    log.error("Google Jobs Scraper run failed", { error: err.message });
    return [];
  }

  if (!run?.defaultDatasetId) {
    log.warning("Google Jobs Scraper returned no dataset ID.");
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

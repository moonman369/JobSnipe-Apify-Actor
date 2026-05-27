import { Actor, log } from 'apify';

/**
 * Calls johnvc/Google-Jobs-Scraper and returns its dataset items.
 *
 * @param {object} params
 * @param {string} params.query      - Main search query (shared input)
 * @param {string} params.location   - Location string (shared input)
 * @param {object} params.config     - googleConfig block from unified input
 * @returns {Promise<object[]>}
 */
export async function runGoogleJobsScraper({ query, location, config }) {
    const {
        country = 'None',
        language = 'None',
        google_domain = 'google.com',
        num_results = 100,
        max_pagination = 0,
        include_lrad = false,
        lrad_value = '10',
        max_delay = 1,
    } = config;

    /** @type {Record<string, unknown>} */
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

    log.debug('Google Jobs Scraper input', actorInput);

    let run;
    try {
        run = await Actor.call('johnvc/Google-Jobs-Scraper', actorInput);
    } catch (err) {
        log.error('Google Jobs Scraper run failed', { error: err.message });
        return [];
    }

    if (!run?.defaultDatasetId) {
        log.warning('Google Jobs Scraper returned no dataset ID.');
        return [];
    }

    const dataset = await Actor.openDataset(run.defaultDatasetId, { forceCloud: true });
    const { items } = await dataset.getData();
    return items ?? [];
}

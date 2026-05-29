import { Actor, log } from 'apify';

/**
 * Calls jungle_thunder/linkedin-jobs-scraper-free-trial and returns its dataset items.
 *
 * Actor page: https://console.apify.com/actors/IVlKNE78L4uOQFvAZ
 *
 * @param {object} params
 * @param {string} params.query      - Main search query → searchKeywords
 * @param {string} params.location   - Location string
 * @param {object} params.config     - linkedInConfig block from unified input
 * @param {string} [params.token]    - Optional Apify API token for child actor call
 * @returns {Promise<object[]>}
 */
export async function runLinkedInJobsScraper({ query, location, config, token }) {
    const {
        totalJobs = 50,
        experienceLevel,
        jobType,
        remoteFilter,
        timePosted = 'any',
        companyIds,
        includeDescription = true,
        startOffset = 0,
        maxConcurrency = 5,
    } = config;

    /** @type {Record<string, unknown>} */
    const actorInput = {
        searchKeywords: query,
        location: location || 'Worldwide',
        totalJobs,
        includeDescription,
        startOffset,
        maxConcurrency,
        timePosted,
    };

    // Optional filters — only include if explicitly provided
    if (experienceLevel?.length)  actorInput.experienceLevel = experienceLevel;
    if (jobType?.length)          actorInput.jobType         = jobType;
    if (remoteFilter?.length)     actorInput.remoteFilter    = remoteFilter;
    if (companyIds?.length)       actorInput.companyIds      = companyIds;

    log.debug('LinkedIn Jobs Scraper (jungle_thunder) input', actorInput);

    let run;
    try {
        run = await Actor.call(
            'jungle_thunder/linkedin-jobs-scraper-free-trial',
            actorInput,
            token ? { token } : {},
        );
    } catch (err) {
        log.error('LinkedIn Jobs Scraper run failed', { error: err.message });
        return [];
    }

    if (!run?.defaultDatasetId) {
        log.warning('LinkedIn Jobs Scraper returned no dataset ID.');
        return [];
    }

    const dataset = await Actor.openDataset(run.defaultDatasetId, { forceCloud: true });
    const { items } = await dataset.getData();
    return items ?? [];
}

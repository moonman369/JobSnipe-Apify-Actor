import { Actor, log } from 'apify';

/**
 * Calls harvestapi/linkedin-job-search and returns its dataset items.
 *
 * @param {object} params
 * @param {string} params.query      - Main search query → first jobTitle
 * @param {string} params.location   - Primary location string
 * @param {object} params.config     - linkedInConfig block from unified input
 * @returns {Promise<object[]>}
 */
export async function runLinkedInJobsScraper({ query, location, config }) {
    const {
        extraJobTitles = [],
        extraLocations = [],
        maxItemsPerQuery = 25,
        company,
        workplaceType,
        employmentType,
        experienceLevel,
        salary,
        under10Applicants,
        easyApply,
        postedLimit,
        sortBy = 'relevance',
        industryIds,
        geoIds,
        startPage,
        cookie,
        userAgent,
        proxy,
    } = config;

    // Merge shared query / location with any LinkedIn-specific extras
    const jobTitles = [query, ...extraJobTitles].filter(Boolean);
    const locations = [location, ...extraLocations].filter(Boolean);

    /** @type {Record<string, unknown>} */
    const actorInput = {
        jobTitles,
        ...(locations.length ? { locations } : {}),
        maxItems: maxItemsPerQuery,
        sortBy,
    };

    // Optional filters — only include them if they were explicitly provided
    if (company?.length)          actorInput.company          = company;
    if (workplaceType?.length)    actorInput.workplaceType    = workplaceType;
    if (employmentType?.length)   actorInput.employmentType   = employmentType;
    if (experienceLevel?.length)  actorInput.experienceLevel  = experienceLevel;
    if (salary?.length)           actorInput.salary           = salary;
    if (under10Applicants)        actorInput.under10Applicants = under10Applicants;
    if (easyApply)                actorInput.easyApply        = easyApply;
    if (postedLimit)              actorInput.postedLimit      = postedLimit;
    if (industryIds?.length)      actorInput.industryIds      = industryIds;
    if (geoIds?.length)           actorInput.geoIds           = geoIds;
    if (startPage != null)        actorInput.page             = startPage;
    if (cookie)                   actorInput.cookie           = cookie;
    if (userAgent)                actorInput.userAgent        = userAgent;
    if (proxy)                    actorInput.proxy            = proxy;

    log.debug('LinkedIn Job Search input', { ...actorInput, cookie: cookie ? '[REDACTED]' : undefined });

    let run;
    try {
        run = await Actor.call('harvestapi/linkedin-job-search', actorInput);
    } catch (err) {
        log.error('LinkedIn Job Search run failed', { error: err.message });
        return [];
    }

    if (!run?.defaultDatasetId) {
        log.warning('LinkedIn Job Search returned no dataset ID.');
        return [];
    }

    const dataset = await Actor.openDataset(run.defaultDatasetId, { forceCloud: true });
    const { items } = await dataset.getData();
    return items ?? [];
}

import { Actor, log } from 'apify';
import { runGoogleJobsScraper } from './googleRunner.js';
import { runLinkedInJobsScraper } from './linkedinRunner.js';
import { normaliseGoogle, normaliseLinkedIn } from './normalise.js';
import { deduplicateJobs } from './dedup.js';

await Actor.init();

// ─── Input ────────────────────────────────────────────────────────────────────
const input = await Actor.getInput();

const {
    sources = ['google', 'linkedin'],
    deduplicateResults = true,
    outputNormalised = true,
    query,
    location = '',
    googleConfig = {},
    linkedInConfig = {},
} = input ?? {};

if (!query) {
    throw new Error('Input field "query" is required.');
}

log.info('Job Union Scraper starting', { query, location, sources });

const useGoogle = sources.includes('google');
const useLinkedIn = sources.includes('linkedin');

// ─── Run child actors in parallel ─────────────────────────────────────────────
const promises = [];

if (useGoogle) {
    log.info('Launching Google Jobs Scraper…');
    promises.push(
        runGoogleJobsScraper({ query, location, config: googleConfig })
            .then((items) => {
                log.info(`Google Jobs returned ${items.length} raw items.`);
                return items.map((item) => normaliseGoogle(item, outputNormalised));
            }),
    );
} else {
    promises.push(Promise.resolve([]));
}

if (useLinkedIn) {
    log.info('Launching LinkedIn Job Search…');
    promises.push(
        runLinkedInJobsScraper({ query, location, config: linkedInConfig })
            .then((items) => {
                log.info(`LinkedIn returned ${items.length} raw items.`);
                return items.map((item) => normaliseLinkedIn(item, outputNormalised));
            }),
    );
} else {
    promises.push(Promise.resolve([]));
}

// ─── Await both ───────────────────────────────────────────────────────────────
const [googleJobs, linkedInJobs] = await Promise.all(promises);

// ─── Combine & optionally deduplicate ─────────────────────────────────────────
let combined = [...googleJobs, ...linkedInJobs];

log.info(`Combined total before dedup: ${combined.length} jobs.`);

if (deduplicateResults) {
    combined = deduplicateJobs(combined);
    log.info(`After deduplication: ${combined.length} jobs.`);
}

// ─── Push to dataset ──────────────────────────────────────────────────────────
await Actor.pushData(combined);

log.info(`Done. Pushed ${combined.length} jobs to the default dataset.`);

await Actor.exit();

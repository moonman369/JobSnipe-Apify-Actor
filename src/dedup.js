/**
 * dedup.js
 *
 * Deduplicates a mixed array of normalised job records from both sources.
 *
 * Strategy
 * ─────────
 * 1. Group records by _dedupeKey (lowercased title|company|location).
 * 2. For groups with one record — emit as-is.
 * 3. For groups with two records (one per source) — deep-merge them:
 *    - Non-null fields from the later source fill in nulls from the first.
 *    - Arrays (applyUrls, highlights.*) are unioned.
 *    - _source is set to "both", _sources lists both.
 * 4. For groups with 3+ records (shouldn't happen in normal use but handled
 *    gracefully) — merge left-to-right.
 */

/**
 * @param {object[]} jobs - Array of NormalisedJob objects
 * @returns {object[]}    - Deduplicated array
 */
export function deduplicateJobs(jobs) {
    /** @type {Map<string, object[]>} */
    const groups = new Map();

    for (const job of jobs) {
        const key = job._dedupeKey ?? '';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(job);
    }

    const result = [];

    for (const [, group] of groups) {
        if (group.length === 1) {
            result.push(group[0]);
        } else {
            result.push(mergeGroup(group));
        }
    }

    return result;
}

/**
 * Merge an array of job records into a single record.
 * The first record is used as the base; subsequent records fill in gaps.
 *
 * @param {object[]} group
 * @returns {object}
 */
function mergeGroup(group) {
    // Start from a shallow clone of the first record
    const merged = { ...group[0] };

    const allSources = [...new Set(group.flatMap((j) => j._sources ?? [j._source]).filter(Boolean))];

    for (let i = 1; i < group.length; i++) {
        const other = group[i];

        for (const key of Object.keys(other)) {
            if (key.startsWith('_')) continue;   // handled separately below
            if (merged[key] == null && other[key] != null) {
                merged[key] = other[key];
            }
        }

        // Union applyUrls
        if (Array.isArray(other.applyUrls)) {
            merged.applyUrls = [...new Set([...(merged.applyUrls ?? []), ...other.applyUrls])];
            if (!merged.applyUrl && merged.applyUrls.length) {
                merged.applyUrl = merged.applyUrls[0];
            }
        }

        // Union highlight arrays
        if (other.highlights) {
            for (const field of ['qualifications', 'responsibilities', 'benefits']) {
                const existing = merged.highlights?.[field] ?? [];
                const incoming = other.highlights?.[field]  ?? [];
                merged.highlights = merged.highlights ?? {};
                merged.highlights[field] = [...new Set([...existing, ...incoming])];
            }
        }
    }

    // Update meta fields
    merged._source    = allSources.length > 1 ? 'both' : allSources[0] ?? 'unknown';
    merged._sources   = allSources;
    merged._mergedAt  = new Date().toISOString();

    return merged;
}

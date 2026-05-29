/**
 * normalise.js
 *
 * Maps the raw output of each child actor to a common NormalisedJob schema.
 * When outputNormalised === false the raw payload is preserved and only the
 * _source / _normalisedAt / _dedupeKey meta-fields are injected.
 *
 * ─── NormalisedJob schema ────────────────────────────────────────────────────
 * {
 *   // Identity
 *   title:           string
 *   company:         string
 *   location:        string
 *   country:         string | null
 *
 *   // Description
 *   description:     string | null       (plain text)
 *   descriptionHtml: string | null
 *   highlights: {
 *     qualifications:   string[]
 *     responsibilities: string[]
 *     benefits:         string[]
 *   }
 *
 *   // Classification
 *   employmentType:  string | null       ("Full-time", "Part-time", "Contract", …)
 *   workplaceType:   string | null       ("Remote", "Hybrid", "On-site")
 *   experienceLevel: string | null
 *   salary:          string | null
 *   postedAt:        string | null       (ISO-8601 or raw string)
 *
 *   // Apply links
 *   applyUrl:           string | null    (primary apply URL)
 *   applyUrls:          string[]         (all collected apply URLs)
 *   linkedInApplyUrl:   string | null
 *   easyApply:          boolean
 *
 *   // Company extras
 *   companyUrl:         string | null
 *   companyLogoUrl:     string | null
 *   companySize:        string | null
 *   companyIndustry:    string | null
 *
 *   // Stats
 *   applicantCount:     number | null
 *   viewCount:          number | null
 *
 *   // Meta
 *   jobId:             string | null     (source-native ID)
 *   _source:           "google" | "linkedin" | "both"
 *   _sources:          ("google" | "linkedin")[]
 *   _normalisedAt:     string            (ISO timestamp)
 *   _dedupeKey:        string            (used internally for dedup)
 *   _raw:              object | null     (original payload, only when outputNormalised=false)
 * }
 */

const ts = () => new Date().toISOString();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Trim a string; return null for falsy values. */
const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Build a canonical dedup key from (title, company, location). */
export function buildDedupeKey(title, company, location) {
    return [title, company, location]
        .map((s) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim())
        .join('|');
}

// ─── Google normaliser ────────────────────────────────────────────────────────

/**
 * @param {object}  raw            - Raw item from Google Jobs Scraper
 * @param {boolean} keepNormalised - When false, preserve raw payload as _raw
 * @returns {object}               - NormalisedJob
 */
export function normaliseGoogle(raw, keepNormalised = true) {
    const title     = clean(raw.title)   ?? '';
    const company   = clean(raw.company) ?? '';
    const location  = clean(raw.location ?? raw.jobLocation) ?? '';

    // Collect apply URLs
    const applyUrls = [
        ...(raw.applyLinks ?? []).map((l) => l?.url ?? l).filter(Boolean),
        ...(raw.companyApplyLinks ?? []).map((l) => l?.url ?? l).filter(Boolean),
    ];

    const normalised = {
        title,
        company,
        location,
        country: clean(raw.country) ?? null,

        description:     clean(raw.description ?? raw.jobDescription) ?? null,
        descriptionHtml: clean(raw.descriptionHtml) ?? null,
        highlights: {
            qualifications:   raw.highlights?.qualifications   ?? raw.qualifications   ?? [],
            responsibilities: raw.highlights?.responsibilities ?? raw.responsibilities ?? [],
            benefits:         raw.highlights?.benefits         ?? raw.benefits         ?? [],
        },

        employmentType:  clean(raw.employmentType ?? raw.schedule) ?? null,
        workplaceType:   null,   // Google does not surface this
        experienceLevel: null,
        salary:          clean(raw.salary) ?? null,
        postedAt:        clean(raw.postedAt ?? raw.postingDate ?? raw.posted_at) ?? null,

        applyUrl:        applyUrls[0] ?? clean(raw.applyLink) ?? null,
        applyUrls,
        linkedInApplyUrl: null,
        easyApply:       false,

        companyUrl:      clean(raw.companyUrl) ?? null,
        companyLogoUrl:  clean(raw.companyLogoUrl ?? raw.companyLogo) ?? null,
        companySize:     null,
        companyIndustry: null,

        applicantCount:  raw.applicantCount ?? null,
        viewCount:       null,

        jobId:          clean(raw.jobId ?? raw.id) ?? null,
        _source:        'google',
        _sources:       ['google'],
        _normalisedAt:  ts(),
        _dedupeKey:     buildDedupeKey(title, company, location),
        _raw:           keepNormalised ? undefined : raw,
    };

    if (!keepNormalised) normalised._raw = raw;
    return normalised;
}

// ─── LinkedIn normaliser (jungle_thunder/linkedin-jobs-scraper-free-trial) ────
//
// This actor emits title-case enum values directly ("Full-time", "Remote",
// "Mid-Senior") so no code→label mapping tables are needed.
// Field reference based on the actor's README and typical output shape:
//   title, company, companyLogo, location, salary, employmentType,
//   seniorityLevel, remoteStatus, postedDate, applicants, description,
//   descriptionHtml, industry, jobFunction, benefits, jobUrl, scrapedAt

/**
 * @param {object}  raw            - Raw item from jungle_thunder/linkedin-jobs-scraper-free-trial
 * @param {boolean} keepNormalised - When false, preserve raw payload as _raw
 * @returns {object}               - NormalisedJob
 */
export function normaliseLinkedIn(raw, keepNormalised = true) {
    const title    = clean(raw.title)   ?? '';
    // Company can arrive as a string or as a nested object
    const company  = clean(
        typeof raw.company === 'object'
            ? (raw.company?.name ?? raw.company?.companyName)
            : (raw.company ?? raw.companyName),
    ) ?? '';
    const location = clean(raw.location ?? raw.jobLocation) ?? '';

    // Apply / job URL — this actor surfaces a direct jobUrl field
    const jobUrl        = clean(raw.jobUrl ?? raw.url ?? raw.jobLink) ?? null;
    const applyUrl      = clean(raw.applyUrl ?? raw.applicationUrl) ?? jobUrl;
    const applyUrls     = [...new Set([applyUrl, jobUrl].filter(Boolean))];

    // Salary — may come as a string or a structured object
    let salary = null;
    if (raw.salary) {
        salary = typeof raw.salary === 'object'
            ? clean(raw.salary?.text ?? raw.salary?.range ?? JSON.stringify(raw.salary))
            : clean(raw.salary);
    }

    // Company logo
    const companyLogoUrl = clean(
        raw.companyLogo ?? raw.companyLogoUrl
        ?? raw.company?.logo ?? raw.company?.logoUrl,
    ) ?? null;

    // Company URL / LinkedIn page
    const companyUrl = clean(
        raw.companyUrl ?? raw.company?.url ?? raw.company?.linkedInUrl,
    ) ?? null;

    // Company size — may be a number or string
    const companySize = raw.companySize != null
        ? clean(String(raw.companySize))
        : (raw.company?.employeeCount != null ? clean(String(raw.company.employeeCount)) : null);

    const normalised = {
        title,
        company,
        location,
        country: clean(raw.country) ?? null,

        description:     clean(raw.description ?? raw.descriptionText) ?? null,
        descriptionHtml: clean(raw.descriptionHtml) ?? null,
        highlights: {
            qualifications:   raw.qualifications   ?? [],
            responsibilities: raw.responsibilities ?? [],
            // This actor surfaces a benefits field directly
            benefits:         Array.isArray(raw.benefits) ? raw.benefits : [],
        },

        // This actor outputs title-case values natively; pass through as-is
        employmentType:  clean(raw.employmentType ?? raw.jobType) ?? null,
        workplaceType:   clean(raw.remoteStatus ?? raw.workplaceType ?? raw.remoteFilter) ?? null,
        experienceLevel: clean(raw.seniorityLevel ?? raw.experienceLevel) ?? null,
        salary,
        postedAt:        clean(raw.postedDate ?? raw.postedAt ?? raw.listedAt ?? raw.publishedAt) ?? null,

        applyUrl,
        applyUrls,
        linkedInApplyUrl: jobUrl,
        easyApply:        raw.easyApply === true,

        companyUrl,
        companyLogoUrl,
        companySize,
        companyIndustry: clean(raw.industry ?? raw.companyIndustry ?? raw.company?.industry) ?? null,

        applicantCount: raw.applicants ?? raw.applicantCount ?? raw.numApplicants ?? null,
        viewCount:      raw.viewCount ?? null,

        jobId:         clean(raw.id ?? raw.jobId ?? raw.linkedInJobId) ?? null,
        _source:       'linkedin',
        _sources:      ['linkedin'],
        _normalisedAt: ts(),
        _dedupeKey:    buildDedupeKey(title, company, location),
        _raw:          keepNormalised ? undefined : raw,
    };

    if (!keepNormalised) normalised._raw = raw;
    return normalised;
}

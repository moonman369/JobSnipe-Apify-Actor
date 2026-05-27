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

// ─── LinkedIn normaliser ──────────────────────────────────────────────────────

/** Map LinkedIn workplace type codes to human-readable strings. */
const WORKPLACE_MAP = { remote: 'Remote', hybrid: 'Hybrid', office: 'On-site' };

/** Map LinkedIn employment type codes to human-readable strings. */
const EMPLOYMENT_MAP = {
    'full-time': 'Full-time',
    'part-time': 'Part-time',
    contract:    'Contract',
    internship:  'Internship',
    temporary:   'Temporary',
};

/** Map LinkedIn experience level codes to human-readable strings. */
const EXPERIENCE_MAP = {
    internship:   'Internship',
    entry:        'Entry level',
    associate:    'Associate',
    'mid-senior': 'Mid-Senior level',
    director:     'Director',
    executive:    'Executive',
};

/**
 * @param {object}  raw            - Raw item from LinkedIn Job Search
 * @param {boolean} keepNormalised
 * @returns {object}               - NormalisedJob
 */
export function normaliseLinkedIn(raw, keepNormalised = true) {
    const title    = clean(raw.title)   ?? '';
    const company  = clean(raw.company?.name ?? raw.companyName ?? raw.company) ?? '';
    const location = clean(raw.location) ?? '';

    const applyUrl      = clean(raw.applyUrl ?? raw.jobPostingUrl) ?? null;
    const linkedInApply = clean(raw.linkedInApplyUrl ?? raw.linkedInJobUrl) ?? null;
    const applyUrls     = [applyUrl, linkedInApply].filter(Boolean);

    const normalised = {
        title,
        company,
        location,
        country: clean(raw.country) ?? null,

        description:     clean(raw.description ?? raw.descriptionText) ?? null,
        descriptionHtml: clean(raw.descriptionHtml) ?? null,
        highlights: {
            qualifications:   [],
            responsibilities: [],
            benefits:         [],
        },

        employmentType:  EMPLOYMENT_MAP[raw.employmentType] ?? clean(raw.employmentType) ?? null,
        workplaceType:   WORKPLACE_MAP[raw.workplaceType]   ?? clean(raw.workplaceType)  ?? null,
        experienceLevel: EXPERIENCE_MAP[raw.experienceLevel] ?? clean(raw.experienceLevel) ?? null,
        salary:          clean(raw.salary ?? raw.salaryInfo) ?? null,
        postedAt:        clean(raw.postedAt ?? raw.listedAt ?? raw.publishedAt) ?? null,

        applyUrl,
        applyUrls,
        linkedInApplyUrl: linkedInApply,
        easyApply:        raw.easyApply === true,

        companyUrl:      clean(raw.company?.url ?? raw.companyUrl) ?? null,
        companyLogoUrl:  clean(raw.company?.logoUrl ?? raw.companyLogoUrl) ?? null,
        companySize:     clean(raw.company?.employeeCount ?? raw.companySize != null
            ? String(raw.company?.employeeCount ?? raw.companySize)
            : null) ?? null,
        companyIndustry: clean(raw.company?.industry ?? raw.companyIndustry) ?? null,

        applicantCount: raw.applicantCount ?? raw.numApplicants ?? null,
        viewCount:      raw.viewCount ?? null,

        jobId:         clean(raw.id ?? raw.jobId ?? raw.linkedInId) ?? null,
        _source:       'linkedin',
        _sources:      ['linkedin'],
        _normalisedAt: ts(),
        _dedupeKey:    buildDedupeKey(title, company, location),
        _raw:          keepNormalised ? undefined : raw,
    };

    if (!keepNormalised) normalised._raw = raw;
    return normalised;
}

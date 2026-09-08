/**
 * Release cadence policy.
 *
 * A full release goes out at most once per calendar month; everything between
 * is a release candidate. Critical bugfixes and security patches are the only
 * exceptions, and must be claimed on their own line in the annotated tag's
 * message. See docs/contributing/development.md.
 */

/** Reasons that may bypass the monthly limit. */
export const EXCEPTION_REASONS = ['critical', 'security']

/**
 * A tag claims an exception with this on a line of its own. The value is
 * captured loosely so a malformed claim can be reported rather than read as no
 * claim at all - a security patch told it merely missed its monthly slot would
 * be a misleading rejection.
 */
const EXCEPTION_LINE = /^[ \t]*RELEASE-EXCEPTION:[ \t]*(.*?)[ \t]*$/im

const SEMVER_TAG = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

/**
 * Parse a release tag.
 *
 * @param {string} tag - Tag name, with or without the leading `v`.
 * @returns {{prerelease: boolean}|null} Parsed tag, or null when it is not semver.
 */
function parseTag(tag) {
  const match = SEMVER_TAG.exec(String(tag || '').trim())
  return match ? { prerelease: Boolean(match[4]) } : null
}

/**
 * The exception a tag message claims, if any.
 *
 * @param {string} tagMessage - Annotated tag message; a lightweight tag has none.
 * @returns {{reason: string}|{invalid: string}|{malformed: string}|null} The claim, or null.
 */
function claimedException(tagMessage) {
  const match = EXCEPTION_LINE.exec(String(tagMessage || ''))
  if (!match) return null

  const claimed = match[1]
  if (!/^\S+$/.test(claimed)) return { malformed: claimed }

  const reason = claimed.toLowerCase()
  return EXCEPTION_REASONS.includes(reason) ? { reason } : { invalid: claimed }
}

/**
 * Calendar month of a date, in UTC, as `YYYY-MM`.
 *
 * @param {string|Date} date - The date to read.
 * @returns {string|null} The month, or null when the date is missing or unparsable.
 */
function utcMonth(date) {
  const parsed = new Date(date ?? NaN)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 7)
}

/**
 * Decide whether a tag may be released.
 *
 * @param {Object} options
 * @param {string} options.tag - The tag being pushed.
 * @param {string} [options.tagMessage] - The annotated tag's message.
 * @param {Array<{tag: string, date: string}>} [options.previousReleases] - Tags already released, with their dates.
 * @param {string|Date} [options.now] - When the release is happening.
 * @returns {{allowed: boolean, reason: string, exception?: string}} The decision and why.
 */
export function evaluateReleasePolicy({ tag, tagMessage = '', previousReleases = [], now = new Date() } = {}) {
  const parsed = parseTag(tag)
  if (!parsed) {
    return { allowed: false, reason: `${tag} is not a semver tag, so no release policy can be applied to it.` }
  }

  if (parsed.prerelease) {
    return { allowed: true, reason: `${tag} is a release candidate, which is not limited.` }
  }

  const month = utcMonth(now)
  const fullReleases = previousReleases.filter(r => {
    const previous = parseTag(r.tag)
    return previous && !previous.prerelease
  })

  // A release whose date cannot be read makes the month unknowable. Releasing
  // anyway would skip the gate silently, so refuse and say which one it was.
  const undated = fullReleases.find(r => utcMonth(r.date) === null)
  if (undated) {
    return {
      allowed: false,
      reason: `${undated.tag} has no readable release date, so the monthly cadence cannot be checked for ${tag}.`,
    }
  }

  const clash = fullReleases.find(r => utcMonth(r.date) === month)

  // The first full release of a month needs no exception, so a bad claim must
  // not block it: the rejection would feed cleanup-invalid and delete the tag.
  if (!clash) {
    return { allowed: true, reason: `${tag} is the first full release of ${month}.` }
  }

  const claim = claimedException(tagMessage)

  if (claim?.malformed !== undefined) {
    return {
      allowed: false,
      reason:
        `${tag} has a RELEASE-EXCEPTION: line that could not be read ("${claim.malformed}"). ` +
        `The reason must be a single word: ${EXCEPTION_REASONS.join(' or ')}.`,
    }
  }

  if (claim?.invalid) {
    return {
      allowed: false,
      reason: `${tag} claims the exception "${claim.invalid}", which is not one of: ${EXCEPTION_REASONS.join(', ')}.`,
    }
  }

  if (claim) {
    return {
      allowed: true,
      exception: claim.reason,
      reason: `${tag} releases in ${month} despite ${clash.tag}, claiming the ${claim.reason} exception.`,
    }
  }

  return {
    allowed: false,
    reason:
      `${clash.tag} was already released in ${month}, and only one full release goes out per month. ` +
      `Tag a release candidate instead, or claim an exception in the tag message ` +
      `("RELEASE-EXCEPTION: ${EXCEPTION_REASONS.join('" or "RELEASE-EXCEPTION: ')}") for a critical bugfix or security patch.`,
  }
}

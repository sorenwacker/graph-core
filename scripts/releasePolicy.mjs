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

/** A tag claims an exception with this on a line of its own. */
const EXCEPTION_LINE = /^[ \t]*RELEASE-EXCEPTION:[ \t]*(\S+)[ \t]*$/im

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
 * @returns {{reason: string}|{invalid: string}|null} The claim, an invalid claim, or null.
 */
function claimedException(tagMessage) {
  const match = EXCEPTION_LINE.exec(String(tagMessage || ''))
  if (!match) return null
  const reason = match[1].toLowerCase()
  return EXCEPTION_REASONS.includes(reason) ? { reason } : { invalid: match[1] }
}

/** Calendar month of a date, in UTC, as `YYYY-MM`. */
function utcMonth(date) {
  return new Date(date).toISOString().slice(0, 7)
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
  const clash = previousReleases.find(r => {
    const previous = parseTag(r.tag)
    return previous && !previous.prerelease && utcMonth(r.date) === month
  })

  const claim = claimedException(tagMessage)
  if (claim?.invalid) {
    return {
      allowed: false,
      reason: `${tag} claims the exception "${claim.invalid}", which is not one of: ${EXCEPTION_REASONS.join(', ')}.`,
    }
  }

  if (!clash) {
    return { allowed: true, reason: `${tag} is the first full release of ${month}.` }
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

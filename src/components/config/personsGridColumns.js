/**
 * Column definitions for the Persons table view.
 * Each column has an id, label, CSS class, sortable flag, and optional width.
 */
export const personsTableColumns = [
  {
    id: 'color',
    label: '',
    cssClass: 'col-color',
    sortable: false,
  },
  {
    id: 'title',
    label: 'Name',
    cssClass: 'col-name',
    sortable: true,
  },
  {
    id: 'role',
    label: 'Role',
    cssClass: 'col-role',
    sortable: true,
  },
  {
    id: 'email',
    label: 'Email',
    cssClass: 'col-email',
    sortable: true,
  },
  {
    id: 'organization',
    label: 'Organization',
    cssClass: 'col-company',
    sortable: true,
  },
  {
    id: 'links',
    label: 'Links',
    cssClass: 'col-links',
    sortable: false,
  },
  {
    id: 'actions',
    label: '',
    cssClass: 'col-actions',
    sortable: false,
  },
]

/**
 * Default sort configuration for the Persons view.
 */
export const defaultPersonsSort = {
  field: 'title',
  direction: 'asc',
}

/**
 * View mode options for the Persons view.
 */
export const personsViewModes = ['cards', 'table']

/**
 * Default color for persons when no specific color is set.
 */
export const defaultPersonColor = '#6b7280'

/**
 * Legacy default color (used to detect if color should be inherited).
 */
export const legacyDefaultColor = '#0f4c75'

/**
 * Default person form values for creating a new person.
 * @param {Function} getRandomColor - Function to get a random color
 * @returns {Object} Default person object
 */
export function createDefaultPerson(getRandomColor) {
  return {
    title: '',
    email: '',
    phone: '',
    organization: '',
    role: '',
    website: '',
    notes: '',
    color: getRandomColor(),
    type: 'person',
  }
}

/**
 * Mask an email address for privacy.
 * @param {string} email - The email address to mask
 * @param {boolean} shouldMask - Whether to apply masking
 * @returns {string} The masked or original email
 */
export function maskEmail(email, shouldMask = true) {
  if (!email || !shouldMask) return email
  const [user, domain] = email.split('@')
  if (!domain) return '***'
  return user.charAt(0) + '***@' + domain
}

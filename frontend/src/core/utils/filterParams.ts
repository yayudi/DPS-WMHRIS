/**
 * Interface representing a TriState select filter value.
 */
export interface TriStateFilterValue {
  include?: (string | number)[]
  exclude?: (string | number)[]
}

/**
 * Checks whether a value matches the TriState filter object shape.
 */
export function isTriStateFilter(value: unknown): value is TriStateFilterValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const obj = value as Record<string, unknown>
  return 'include' in obj || 'exclude' in obj
}

/**
 * Serializes filter objects before sending via HTTP query parameters.
 * Converts active TriStateSelect values ({ include, exclude }) into JSON strings
 * matching Gin's JSON-unmarshaling query binder, while omitting empty filters.
 */
export function serializeFilterParams(filters: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, val] of Object.entries(filters)) {
    if (val === undefined || val === null || val === '') {
      continue
    }

    if (isTriStateFilter(val)) {
      const hasInclude = Array.isArray(val.include) && val.include.length > 0
      const hasExclude = Array.isArray(val.exclude) && val.exclude.length > 0

      if (hasInclude || hasExclude) {
        result[key] = JSON.stringify({
          include: val.include || [],
          exclude: val.exclude || [],
        })
      }
      continue
    }

    if (Array.isArray(val)) {
      if (val.length > 0) {
        result[key] = val
      }
      continue
    }

    result[key] = val
  }

  return result
}


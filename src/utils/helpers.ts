/**
 * Parse keywords from text with various delimiters
 */
export function parseKeywords(text: string, includeNewlines = true): string[] {
  if (!text || typeof text !== 'string') return []

  let separatorPattern: RegExp
  if (includeNewlines) {
    separatorPattern = /[,;\n\r\t|]+/
  } else {
    separatorPattern = /[,;\t|]+/
  }

  return text
    .split(separatorPattern)
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0 && /\S/.test(keyword))
    .flatMap((keyword) => {
      // Handle forward slash as alternative separator for keywords
      if (keyword.includes('/')) {
        const parts = keyword.split('/').map((part) => part.trim())
        // If there are valid parts after splitting, use them
        if (parts.length > 1 && parts.every((part) => part.length > 0)) {
          return parts
        }
      }

      // Split on multiple spaces (2 or more)
      return keyword
        .split(/\s{2,}/)
        .map((word) => word.trim())
        .filter((word) => word.length > 0)
    })
    .filter((keyword, index, array) => array.indexOf(keyword) === index) // Remove duplicates
}

/**
 * Parse URLs from text (different from keywords - no forward slash splitting)
 */
export function parseUrls(text: string): string[] {
  if (!text || typeof text !== 'string') return []

  // For URLs, only split on commas, newlines, semicolons, pipes, tabs - NOT forward slashes
  const separatorPattern = /[,;\n\r\t|]+/

  return text
    .split(separatorPattern)
    .map((url) => url.trim())
    .filter((url) => url.length > 0 && /\S/.test(url))
    .filter((url, index, array) => array.indexOf(url) === index) // Remove duplicates
}

/**
 * Check if a URL matches a pattern
 */
export function urlMatches(url: string, pattern: string): boolean {
  if (!pattern || !url) return false

  if (pattern.endsWith('*')) {
    const basePattern = pattern.slice(0, -1)
    return url.startsWith(basePattern)
  }

  if (pattern.startsWith('*')) {
    const endPattern = pattern.slice(1)
    return url.endsWith(endPattern)
  }

  if (pattern.includes('*')) {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'))
    return regex.test(url)
  }

  return url === pattern
}

/**
 * Escape regex special characters
 */
export function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2)
}

/**
 * Validate URL pattern
 */
export function isValidUrlPattern(pattern: string): boolean {
  if (!pattern || pattern.trim() === '') return false

  // Allow wildcards
  if (pattern.includes('*')) return true

  // Check if it looks like a URL
  try {
    // If it starts with http/https, validate as URL
    if (pattern.startsWith('http://') || pattern.startsWith('https://')) {
      new URL(pattern)
      return true
    }
    // Otherwise, just check it's not empty and has some structure
    return pattern.length > 0 && !pattern.includes(' ')
  } catch {
    return false
  }
}

/**
 * Check if extension should process this URL
 */
export function shouldProcessUrl(url: string): boolean {
  const skipPatterns = ['chrome://', 'chrome-extension://', 'moz-extension://', 'edge://', 'about:']

  return !skipPatterns.some((pattern) => url.startsWith(pattern))
}

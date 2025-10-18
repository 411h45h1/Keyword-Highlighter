import { Profile } from '../types/index.js'
import { parseUrls, urlMatches } from '../utils/helpers.js'

export class ProfileMatcher {
  private profiles: Profile[] = []

  setProfiles(profiles: Profile[]): void {
    this.profiles = Array.isArray(profiles) ? profiles : []
  }

  findMatchingProfiles(currentUrl?: string): Profile[] {
    const url = currentUrl || window.location.href
    const matchingProfiles: Profile[] = []

    if (!this.profiles || !Array.isArray(this.profiles)) {
      return []
    }

    for (const profile of this.profiles) {
      if (this.profileMatchesUrl(profile, url)) {
        matchingProfiles.push(profile)
      }
    }

    return matchingProfiles
  }

  private profileMatchesUrl(profile: Profile, currentUrl: string): boolean {
    if (profile.urlPatterns && Array.isArray(profile.urlPatterns)) {
      for (const urlPattern of profile.urlPatterns) {
        const patterns = Array.isArray(urlPattern.urlPattern)
          ? urlPattern.urlPattern
          : [urlPattern.urlPattern]

        for (const pattern of patterns) {
          const individualPatterns = typeof pattern === 'string' ? parseUrls(pattern) : [pattern]

          for (const individualPattern of individualPatterns) {
            if (
              typeof individualPattern === 'string' &&
              urlMatches(currentUrl, individualPattern.trim())
            ) {
              return true
            }
          }
        }
      }
    }

    // Check legacy single urlPattern field
    if (profile.urlPattern) {
      const individualPatterns = parseUrls(profile.urlPattern)
      for (const individualPattern of individualPatterns) {
        if (urlMatches(currentUrl, individualPattern.trim())) {
          return true
        }
      }
    }

    return false
  }

  generateProfileSignature(profiles: Profile[]): string | null {
    if (!profiles || profiles.length === 0) return null

    return profiles
      .map((profile) => this.getProfileSignature(profile))
      .sort()
      .join('||')
  }

  private getProfileSignature(profile: Profile): string {
    if (!profile) return ''

    const signatureParts: string[] = []

    if (profile.keywordGroups && Array.isArray(profile.keywordGroups)) {
      profile.keywordGroups.forEach((group) => {
        const keywords = group.keywords?.join(',') || ''
        const color = group.color || ''
        const textColor = group.textColor || ''
        signatureParts.push(`${keywords}:${color}:${textColor}`)
      })
    }

    let urlSignature = ''
    if (profile.urlPatterns && Array.isArray(profile.urlPatterns)) {
      urlSignature = profile.urlPatterns
        .map((up) => {
          const patterns = Array.isArray(up.urlPattern) ? up.urlPattern.join(',') : up.urlPattern
          const colorOverrides = JSON.stringify(up.colorOverrides || {})
          const textColorOverrides = JSON.stringify(up.textColorOverrides || {})
          return `${patterns}:${colorOverrides}:${textColorOverrides}`
        })
        .join('|')
    } else {
      urlSignature = profile.urlPattern || ''
    }

    return `${profile.id || 'no-id'}|${urlSignature}|${signatureParts.join('|')}`
  }
}

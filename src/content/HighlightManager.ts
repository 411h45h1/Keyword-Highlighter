import { Profile, UrlPattern } from '../types/index.js'
import { parseUrls, urlMatches, escapeRegex } from '../utils/helpers.js'

export class HighlightManager {
  private regexCache = new Map<string, RegExp>()
  private patternCache = new Map<string, string>()
  private highlightedElements = new Set<Element>()

  clearCaches(): void {
    this.regexCache.clear()
    this.patternCache.clear()
  }

  clearHighlights(): void {
    if (!document || !document.querySelectorAll) {
      console.warn('Document not available for clearing highlights')
      return
    }

    try {
      const highlights = document.querySelectorAll('.keyword-highlight')
      highlights.forEach((highlight) => {
        const parent = highlight.parentNode
        if (parent) {
          parent.replaceChild(document.createTextNode(highlight.textContent || ''), highlight)
          parent.normalize()
        }
      })

      const highlightedSpans = document.querySelectorAll('span[data-highlighted]')
      highlightedSpans.forEach((span) => {
        const parent = span.parentNode
        if (parent) {
          parent.replaceChild(document.createTextNode(span.textContent || ''), span)
          parent.normalize()
        }
      })

      const markedElements = document.querySelectorAll('[data-highlighted]')
      markedElements.forEach((el) => el.removeAttribute('data-highlighted'))

      this.highlightedElements.clear()
    } catch (error) {
      console.error('Error clearing highlights:', error)
    }
  }

  buildKeywordColorMap(profiles: Profile[]): {
    keywordColorMap: Map<string, Array<{ backgroundColor: string; textColor?: string }>>
    exactCase: boolean
  } {
    const keywordColorMap = new Map<
      string,
      Array<{ backgroundColor: string; textColor?: string }>
    >()
    let exactCase = false
    const currentUrl = window.location.href

    profiles.forEach((profile) => {
      if (profile.exactCase) {
        exactCase = true
      }

      const currentUrlPattern = this.findMatchingUrlPattern(profile, currentUrl)

      if (profile.keywordGroups && Array.isArray(profile.keywordGroups)) {
        profile.keywordGroups.forEach((group) => {
          if (group?.keywords && Array.isArray(group.keywords) && group.keywords.length > 0) {
            let color = group.color || '#ffff00'
            let textColor: string | null = group.textColor || null

            if (currentUrlPattern?.colorOverrides && group.id) {
              const overrideColor = currentUrlPattern.colorOverrides[group.id]
              if (overrideColor) {
                color = overrideColor
              }
            }

            if (currentUrlPattern?.textColorOverrides) {
              const globalTextColor = currentUrlPattern.textColorOverrides['global']
              if (globalTextColor) {
                textColor = globalTextColor
              }
            }

            group.keywords.forEach((keyword) => {
              const keywordKey = keyword.toLowerCase().trim()
              if (keywordKey) {
                const colorInfo = {
                  backgroundColor: color,
                  textColor: textColor || undefined,
                }

                if (keywordColorMap.has(keywordKey)) {
                  keywordColorMap.get(keywordKey)!.push(colorInfo)
                } else {
                  keywordColorMap.set(keywordKey, [colorInfo])
                }
              }
            })
          }
        })
      }
    })

    return { keywordColorMap, exactCase }
  }

  private findMatchingUrlPattern(profile: Profile, currentUrl: string): UrlPattern | null {
    if (!profile.urlPatterns || !Array.isArray(profile.urlPatterns)) {
      return null
    }

    for (const urlPattern of profile.urlPatterns) {
      const patterns = Array.isArray(urlPattern.urlPattern)
        ? urlPattern.urlPattern
        : [urlPattern.urlPattern]

      const allPatterns = patterns.flatMap((pattern) =>
        typeof pattern === 'string' ? parseUrls(pattern) : [pattern]
      )

      for (const pattern of allPatterns) {
        if (typeof pattern === 'string' && urlMatches(currentUrl, pattern.trim())) {
          return urlPattern
        }
      }
    }

    return null
  }

  highlightTextNode(
    textNode: Text,
    keywordColorMap: Map<string, Array<{ backgroundColor: string; textColor?: string }>>,
    exactCase = false
  ): void {
    if (!textNode?.parentNode || keywordColorMap.size === 0) {
      return
    }

    const text = textNode.textContent || ''
    if (!text.trim()) {
      return
    }

    let highlightedText = text
    let hasHighlights = false

    try {
      const keywords = Array.from(keywordColorMap.keys()).sort((a, b) => b.length - a.length)

      const singleLetterKeywords = keywords.filter((k) => /^[a-zA-Z]$/.test(k))
      const otherKeywords = keywords.filter((k) => !/^[a-zA-Z]$/.test(k))

      if (singleLetterKeywords.length > 0) {
        highlightedText = this.highlightKeywordGroup(
          highlightedText,
          singleLetterKeywords,
          keywordColorMap,
          exactCase
        )
        hasHighlights = true
      }

      if (otherKeywords.length > 0) {
        highlightedText = this.highlightKeywordGroup(
          highlightedText,
          otherKeywords,
          keywordColorMap,
          exactCase
        )
        hasHighlights = true
      }

      if (hasHighlights && highlightedText !== text) {
        this.replaceTextWithHighlights(textNode, highlightedText)
      }
    } catch (error) {
      console.error('Error highlighting text node:', error)
    }
  }

  private highlightKeywordGroup(
    text: string,
    keywords: string[],
    keywordColorMap: Map<string, Array<{ backgroundColor: string; textColor?: string }>>,
    exactCase: boolean
  ): string {
    const pattern = keywords.map((keyword) => this.createSmartBoundaryPattern(keyword)).join('|')

    const flags = exactCase ? 'g' : 'gi'
    const regex = new RegExp(`(${pattern})`, flags)

    return text.replace(regex, (match) => {
      const matchKey = exactCase ? match : match.toLowerCase()
      const colors = keywordColorMap.get(matchKey)

      if (!colors || colors.length === 0) return match

      const colorInfo = colors[0]
      const textColorStyle = colorInfo.textColor ? `color: ${colorInfo.textColor};` : ''

      if (colors.length > 1) {
        // Multiple colors - create blinking effect
        const hash = this.getColorHash(colors.map((c) => c.backgroundColor))
        this.addBlinkingAnimation(
          hash,
          colors.map((c) => c.backgroundColor)
        )
        return `<span class="keyword-highlight keyword-highlight-blink" style="animation: keyword-blink-${hash} 2s infinite; ${textColorStyle}">${match}</span>`
      } else {
        return `<span class="keyword-highlight" style="background-color: ${colorInfo.backgroundColor}; ${textColorStyle}">${match}</span>`
      }
    })
  }

  private createSmartBoundaryPattern(keyword: string): string {
    const cacheKey = `boundary_${keyword}`
    if (this.patternCache.has(cacheKey)) {
      return this.patternCache.get(cacheKey)!
    }

    const escaped = escapeRegex(keyword)

    // Single letter - use strict word boundaries
    if (keyword.length === 1 && /^[a-zA-Z]$/.test(keyword)) {
      const pattern = `(?<!\\w)${escaped}(?!\\w)`
      this.patternCache.set(cacheKey, pattern)
      return pattern
    }

    // Multi-word phrases
    if (keyword.includes(' ')) {
      const pattern = `\\b${escaped}\\b`
      this.patternCache.set(cacheKey, pattern)
      return pattern
    }

    const startsWithWord = /^\w/.test(keyword)
    const endsWithWord = /\w$/.test(keyword)

    const leftBoundary = startsWithWord ? '(?<!\\w)' : ''
    const rightBoundary = endsWithWord ? '(?!\\w)' : ''

    const pattern = `${leftBoundary}${escaped}${rightBoundary}`
    this.patternCache.set(cacheKey, pattern)
    return pattern
  }

  private replaceTextWithHighlights(textNode: Text, highlightedText: string): void {
    if (!textNode.parentNode) return

    const wrapper = document.createElement('div')
    wrapper.innerHTML = highlightedText

    const fragment = document.createDocumentFragment()
    while (wrapper.firstChild) {
      fragment.appendChild(wrapper.firstChild)
    }

    const parentElement = textNode.parentNode
    parentElement.replaceChild(fragment, textNode)

    // Only call createBlinkingAnimations if parentElement is a valid Element
    if (parentElement && parentElement.nodeType === Node.ELEMENT_NODE) {
      this.createBlinkingAnimations(parentElement as Element)
    }
  }

  private createBlinkingAnimations(wrapper: Element): void {
    if (!wrapper || !wrapper.querySelectorAll) {
      console.warn('Invalid wrapper element for blinking animations')
      return
    }

    try {
      const blinkingElements = wrapper.querySelectorAll('.keyword-highlight-blink')
      const addedAnimations = new Set<string>()

      blinkingElements.forEach((element) => {
        const style = (element as HTMLElement).style
        const animation = style.animation
        const match = animation.match(/keyword-blink-(\w+)/)
        if (match && !addedAnimations.has(match[1])) {
          addedAnimations.add(match[1])
        }
      })
    } catch (error) {
      console.error('Error creating blinking animations:', error)
    }
  }

  private addBlinkingAnimation(hash: string, colors: string[]): void {
    if (!document || !document.getElementById || !document.createElement) {
      console.warn('Document not available for blinking animation')
      return
    }

    const styleId = `keyword-blink-${hash}`
    if (document.getElementById(styleId)) {
      return
    }

    try {
      const style = document.createElement('style')
      style.id = styleId

      const steps = colors
        .map((color, index) => {
          const percentage = (index / colors.length) * 100
          return `${percentage}% { background-color: ${color}; }`
        })
        .join('\n')

      style.textContent = `
        @keyframes keyword-blink-${hash} {
          ${steps}
          100% { background-color: ${colors[0]}; }
        }
      `

      if (document.head) {
        document.head.appendChild(style)
      }
    } catch (error) {
      console.error('Error adding blinking animation:', error)
    }
  }

  private getColorHash(colors: string[]): string {
    return colors
      .sort()
      .join('')
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 10)
  }
}

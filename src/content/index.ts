import type { Profile, ChromeMessage } from '../types'
import { urlMatches, escapeRegex } from '../utils/helpers'

class KeywordHighlighter {
  private profiles: Profile[] = []
  private isEnabled = true
  private highlightedElements = new Set<Element>()
  private observer: MutationObserver | null = null
  private lastProfileSignature: string | null = null
  private regexCache = new Map<string, string>()

  constructor() {
    this.init()
  }

  private async init(): Promise<void> {
    await this.loadSettings()
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this))
    this.setupDOMObserver()
    this.setupUrlChangeDetection()

    if (this.isEnabled) {
      const matchingProfiles = this.findAllMatchingProfiles()
      if (matchingProfiles.length > 0) {
        this.highlightPage()
      }
    }

    this.notifyUrlChange()
  }

  private async loadSettings(): Promise<void> {
    try {
      const result = await chrome.storage.sync.get(['profiles', 'extensionEnabled'])
      this.profiles = (result.profiles || []) as Profile[]
      this.isEnabled = result.extensionEnabled !== false
    } catch (error) {
      console.error('Error loading settings:', error)
      this.profiles = []
      this.isEnabled = true
    }

    if (!Array.isArray(this.profiles)) {
      this.profiles = []
    }
  }

  private handleMessage(
    request: ChromeMessage,
    _sender: chrome.runtime.MessageSender,
    _sendResponse: (response?: unknown) => void
  ): boolean {
    switch (request.action) {
      case 'updateProfiles':
        this.handleUpdateProfiles()
        break
      case 'toggleExtension':
        this.handleToggleExtension(request.data as boolean)
        break
      case 'showNotification':
        this.showNotification(request.message || '', request.type, request.details)
        break
      case 'forceHighlightRefresh':
        this.handleForceHighlightRefresh()
        break
    }
    return true
  }

  private async handleUpdateProfiles(): Promise<void> {
    await this.loadSettings()

    if (!this.isEnabled) {
      return
    }

    const newProfiles = this.findAllMatchingProfiles()
    const newSig = this.getProfilesSignature(newProfiles)

    if (newSig === this.lastProfileSignature) {
      return
    }

    if (this.lastProfileSignature) {
      this.clearHighlights()
    }

    if (newProfiles.length > 0) {
      this.highlightPage()
    }

    this.lastProfileSignature = newSig || null
  }

  private async handleForceHighlightRefresh(): Promise<void> {
    await this.loadSettings()

    if (!this.isEnabled) {
      return
    }

    this.clearHighlights()

    const matchingProfiles = this.findAllMatchingProfiles()

    if (matchingProfiles.length > 0) {
      this.highlightPage()
      this.showHighlightRefreshFeedback()
    }
  }

  private showHighlightRefreshFeedback(): void {
    this.injectFlashEffectCSS()

    const highlightedElements = document.querySelectorAll('.keyword-highlight')

    if (highlightedElements.length > 0) {
      highlightedElements.forEach((element) => {
        element.classList.add('keyword-highlight-flash')
        setTimeout(() => {
          element.classList.remove('keyword-highlight-flash')
        }, 600)
      })
    }
  }

  private injectFlashEffectCSS(): void {
    const flashCSSId = 'keyword-highlight-flash-styles'

    if (document.getElementById(flashCSSId)) {
      return
    }

    const style = document.createElement('style')
    style.id = flashCSSId
    style.textContent = `
      .keyword-highlight-flash {
        animation: keyword-highlight-flash 0.6s ease-out !important;
      }
      
      @keyframes keyword-highlight-flash {
        0% {
          box-shadow: 0 0 0 2px #4CAF50 !important;
          transform: scale(1) !important;
        }
        50% {
          box-shadow: 0 0 8px 4px rgba(76, 175, 80, 0.4) !important;
          transform: scale(1.02) !important;
        }
        100% {
          box-shadow: 0 0 0 0 rgba(76, 175, 80, 0) !important;
          transform: scale(1) !important;
        }
      }
    `

    document.head.appendChild(style)
  }

  private getProfilesSignature(profiles: Profile[]): string | null {
    if (!profiles || profiles.length === 0) return null

    return profiles
      .map((profile) => this.getProfileSignature(profile))
      .sort()
      .join('||')
  }

  private handleToggleExtension(enabled: boolean): void {
    this.isEnabled = enabled
    if (enabled) {
      this.loadSettings().then(() => {
        const matchingProfiles = this.findAllMatchingProfiles()
        if (matchingProfiles.length > 0) {
          this.highlightPage()
        }
      })
    } else {
      this.clearHighlights()
    }
  }

  private setupDOMObserver(): void {
    if (this.observer) {
      this.observer.disconnect()
    }

    this.observer = new MutationObserver((mutations) => {
      if (!this.isEnabled) return

      let shouldHighlight = false
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of Array.from(mutation.addedNodes)) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element
              if (
                !element.hasAttribute('data-highlighted') &&
                !element.classList.contains('keyword-highlight')
              ) {
                shouldHighlight = true
                break
              }
            }
          }
        }
        if (shouldHighlight) break
      }

      if (shouldHighlight) {
        this.highlightNewContent()
      }
    })

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    })
  }

  private findAllMatchingProfiles(): Profile[] {
    const currentUrl = window.location.href
    const matchingProfiles: Profile[] = []

    if (!this.profiles || !Array.isArray(this.profiles)) {
      return []
    }

    for (const profile of this.profiles) {
      let matches = false

      if (profile.urlPatterns && Array.isArray(profile.urlPatterns)) {
        for (const urlPattern of profile.urlPatterns) {
          const patterns = Array.isArray(urlPattern.urlPattern)
            ? urlPattern.urlPattern
            : [urlPattern.urlPattern]

          for (const pattern of patterns) {
            if (typeof pattern === 'string' && urlMatches(currentUrl, pattern)) {
              matches = true
              break
            }
          }

          if (matches) break
        }
      } else if (profile.urlPattern) {
        matches = urlMatches(currentUrl, profile.urlPattern)
      }

      if (matches) {
        matchingProfiles.push(profile)
      }
    }

    return matchingProfiles
  }

  private setupUrlChangeDetection(): void {
    let currentUrl = window.location.href

    const originalPushState = history.pushState
    const originalReplaceState = history.replaceState

    history.pushState = function (...args) {
      originalPushState.apply(history, args)
      if (currentUrl !== window.location.href) {
        currentUrl = window.location.href
        window.dispatchEvent(new Event('urlchange'))
      }
    }

    history.replaceState = function (...args) {
      originalReplaceState.apply(history, args)
      if (currentUrl !== window.location.href) {
        currentUrl = window.location.href
        window.dispatchEvent(new Event('urlchange'))
      }
    }

    window.addEventListener('popstate', () => {
      if (currentUrl !== window.location.href) {
        currentUrl = window.location.href
        window.dispatchEvent(new Event('urlchange'))
      }
    })

    window.addEventListener('urlchange', () => {
      this.handleUrlChange()
    })
  }

  private handleUrlChange(): void {
    this.notifyUrlChange()

    if (this.isEnabled) {
      this.handleUpdateProfiles()
    }
  }

  private notifyUrlChange(): void {
    try {
      chrome.runtime.sendMessage({
        action: 'updateContextMenus',
      } as ChromeMessage)
    } catch (error) {
      console.error('Error notifying URL change:', error)
    }
  }

  private buildKeywordColorMap(matchingProfiles: Profile[]): {
    keywordColorMap: Map<string, string[]>
    exactCase: boolean
  } {
    const keywordColorMap = new Map<string, string[]>()
    let exactCase = false

    matchingProfiles.forEach((profile) => {
      if (profile.exactCase) {
        exactCase = true
      }

      if (profile.keywordGroups && Array.isArray(profile.keywordGroups)) {
        profile.keywordGroups.forEach((group) => {
          const color = group.color || '#ffff00'
          const textColor = group.textColor

          if (group.keywords && Array.isArray(group.keywords)) {
            group.keywords.forEach((keyword) => {
              const key = keyword.toLowerCase().trim()

              if (!keywordColorMap.has(key)) {
                keywordColorMap.set(key, [])
              }

              const colors = keywordColorMap.get(key)!
              const colorEntry = textColor ? `${color}|${textColor}` : color

              if (!colors.includes(colorEntry)) {
                colors.push(colorEntry)
              }
            })
          }
        })
      }
    })

    return { keywordColorMap, exactCase }
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
        .map((up) => (Array.isArray(up.urlPattern) ? up.urlPattern.join(',') : up.urlPattern))
        .join('|')
    } else {
      urlSignature = profile.urlPattern || ''
    }

    return `${profile.id || 'no-id'}|${urlSignature}|${signatureParts.join('|')}`
  }

  private highlightPage(): void {
    if (!this.profiles || !Array.isArray(this.profiles)) {
      return
    }

    const matchingProfiles = this.findAllMatchingProfiles()

    if (matchingProfiles.length === 0) {
      return
    }

    const { keywordColorMap, exactCase } = this.buildKeywordColorMap(matchingProfiles)

    try {
      this.highlightWithKeywordMap(document.body, keywordColorMap, exactCase)
    } catch (error) {
      console.error('Error highlighting page:', error)
    }
  }

  private highlightNewContent(): void {
    const matchingProfiles = this.findAllMatchingProfiles()
    if (matchingProfiles.length === 0) {
      return
    }

    const unprocessedElements = document.body.querySelectorAll('*:not([data-highlighted])')

    if (unprocessedElements.length > 0) {
      const { keywordColorMap, exactCase } = this.buildKeywordColorMap(matchingProfiles)
      unprocessedElements.forEach((element) => {
        if (this.shouldProcessElement(element)) {
          this.highlightWithKeywordMap(element, keywordColorMap, exactCase)
        }
      })
    }
  }

  private shouldProcessElement(element: Element): boolean {
    const tagName = element.tagName.toLowerCase()

    const skipTags = ['script', 'style', 'noscript', 'svg', 'canvas', 'iframe']
    if (skipTags.includes(tagName)) {
      return false
    }

    if (
      element.hasAttribute('data-highlighted') ||
      element.classList.contains('keyword-highlight')
    ) {
      return false
    }

    return true
  }

  private highlightWithKeywordMap(
    rootElement: Element,
    keywordColorMap: Map<string, string[]>,
    exactCase = false
  ): void {
    if (!rootElement || keywordColorMap.size === 0) {
      return
    }

    const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement
        if (!parent) return NodeFilter.FILTER_REJECT

        const tagName = parent.tagName.toLowerCase()
        const skipTags = ['script', 'style', 'noscript', 'textarea', 'input']

        if (skipTags.includes(tagName)) {
          return NodeFilter.FILTER_REJECT
        }

        if (parent.classList.contains('keyword-highlight')) {
          return NodeFilter.FILTER_REJECT
        }

        if (parent.hasAttribute('contenteditable')) {
          return NodeFilter.FILTER_REJECT
        }

        return NodeFilter.FILTER_ACCEPT
      },
    })

    const textNodes: Node[] = []
    let node: Node | null
    let nodeCount = 0
    const maxNodes = 2000

    while ((node = walker.nextNode()) && nodeCount < maxNodes) {
      textNodes.push(node)
      nodeCount++
    }

    const batchSize = 50
    let currentIndex = 0

    const processBatch = (): void => {
      const batch = textNodes.slice(currentIndex, currentIndex + batchSize)

      batch.forEach((textNode) => {
        this.highlightTextNodeWithMap(textNode as Text, keywordColorMap, exactCase)
      })

      currentIndex += batchSize

      if (currentIndex < textNodes.length) {
        requestAnimationFrame(processBatch)
      }
    }

    processBatch()
  }

  private highlightTextNodeWithMap(
    textNode: Text,
    keywordColorMap: Map<string, string[]>,
    exactCase = false
  ): void {
    if (!textNode || keywordColorMap.size === 0) {
      return
    }

    if (!textNode.parentNode) {
      return
    }

    const text = textNode.textContent || ''
    let highlightedText = text
    let hasHighlights = false

    try {
      const sortedKeywords = Array.from(keywordColorMap.keys()).sort((a, b) => b.length - a.length)

      for (const keyword of sortedKeywords) {
        const colors = keywordColorMap.get(keyword)!
        const pattern = this.createSmartBoundaryPattern(keyword)
        const flags = exactCase ? 'g' : 'gi'
        const regex = new RegExp(pattern, flags)

        if (regex.test(highlightedText)) {
          const bgColor = colors[0].split('|')[0]
          const textColor = colors[0].split('|')[1] || ''

          const textColorStyle = textColor ? ` color: ${textColor};` : ''
          const blinkClass = colors.length > 1 ? ' keyword-highlight-blink' : ''
          const colorHash = colors.length > 1 ? this.getColorHash(colors) : ''
          const animationStyle =
            colors.length > 1 ? ` animation: keyword-blink-${colorHash} 2s infinite;` : ''

          highlightedText = highlightedText.replace(
            regex,
            `<mark class="keyword-highlight${blinkClass}" style="background-color: ${bgColor};${textColorStyle}${animationStyle}" data-keyword="${keyword}">$&</mark>`
          )
          hasHighlights = true
        }
      }

      if (hasHighlights) {
        const wrapper = document.createElement('span')
        wrapper.innerHTML = highlightedText
        wrapper.setAttribute('data-highlighted', 'true')

        if (textNode.parentNode) {
          textNode.parentNode.replaceChild(wrapper, textNode)
          this.createBlinkingAnimations(wrapper)
        }
      }
    } catch (error) {
      console.error('Error highlighting text node:', error)
    }
  }

  private createBlinkingAnimations(wrapper: Element): void {
    const blinkingElements = wrapper.querySelectorAll('.keyword-highlight-blink')
    const addedAnimations = new Set<string>()

    blinkingElements.forEach((element) => {
      const animationName = element
        .getAttribute('style')
        ?.match(/animation: (keyword-blink-\w+)/)?.[1]
      if (animationName && !addedAnimations.has(animationName)) {
        addedAnimations.add(animationName)
      }
    })
  }

  private getColorHash(colors: string[]): string {
    return colors
      .sort()
      .join('')
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 10)
  }

  private createSmartBoundaryPattern(keyword: string): string {
    const cacheKey = `boundary_${keyword}`
    if (this.regexCache.has(cacheKey)) {
      return this.regexCache.get(cacheKey)!
    }

    const escaped = escapeRegex(keyword)

    // Single letter - use strict word boundaries
    if (keyword.length === 1 && /^[a-zA-Z]$/.test(keyword)) {
      const pattern = `\\b${escaped}\\b`
      this.regexCache.set(cacheKey, pattern)
      return pattern
    }

    // Multi-word phrases
    if (keyword.includes(' ')) {
      const pattern = `(?<!\\w)${escaped}(?!\\w)`
      this.regexCache.set(cacheKey, pattern)
      return pattern
    }

    const startsWithWord = /^\w/.test(keyword)
    const endsWithWord = /\w$/.test(keyword)

    const leftBoundary = startsWithWord ? '(?<!\\w)' : ''
    const rightBoundary = endsWithWord ? '(?!\\w)' : ''

    const pattern = `${leftBoundary}${escaped}${rightBoundary}`
    this.regexCache.set(cacheKey, pattern)
    return pattern
  }

  private clearHighlights(): void {
    const highlights = document.querySelectorAll('.keyword-highlight')
    highlights.forEach((highlight) => {
      const parent = highlight.parentNode
      if (parent) {
        const textNode = document.createTextNode(highlight.textContent || '')
        parent.replaceChild(textNode, highlight)
        parent.normalize()
      }
    })

    const highlightedSpans = document.querySelectorAll('span[data-highlighted]')
    highlightedSpans.forEach((span) => {
      const parent = span.parentNode
      if (parent) {
        while (span.firstChild) {
          parent.insertBefore(span.firstChild, span)
        }
        parent.removeChild(span)
        parent.normalize()
      }
    })

    this.highlightedElements.clear()
    this.lastProfileSignature = null
  }

  private showNotification(
    message: string,
    type: 'success' | 'error' | 'info' = 'success',
    details = ''
  ): void {
    this.injectNotificationCSS()

    const existingNotification = document.getElementById('keyword-highlighter-notification')
    if (existingNotification) {
      existingNotification.remove()
    }

    const notification = document.createElement('div')
    notification.id = 'keyword-highlighter-notification'
    notification.className = `keyword-notification keyword-notification-${type}`

    const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'

    notification.innerHTML = `
      <div class="keyword-notification-icon">${icon}</div>
      <div class="keyword-notification-content">
        <div class="keyword-notification-message">${message}</div>
        ${details ? `<div class="keyword-notification-details">${details}</div>` : ''}
      </div>
    `

    document.body.appendChild(notification)

    setTimeout(() => {
      notification.classList.add('keyword-notification-show')
    }, 10)

    setTimeout(() => {
      notification.classList.remove('keyword-notification-show')
      setTimeout(() => {
        notification.remove()
      }, 300)
    }, 3000)
  }

  private injectNotificationCSS(): void {
    const cssId = 'keyword-notification-styles'
    if (document.getElementById(cssId)) {
      return
    }

    const style = document.createElement('style')
    style.id = cssId
    style.textContent = `
      .keyword-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        padding: 16px;
        display: flex;
        align-items: flex-start;
        gap: 12px;
        max-width: 400px;
        z-index: 999999;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
      }

      .keyword-notification-show {
        opacity: 1;
        transform: translateX(0);
      }

      .keyword-notification-icon {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        flex-shrink: 0;
      }

      .keyword-notification-success .keyword-notification-icon {
        background: #4CAF50;
        color: white;
      }

      .keyword-notification-error .keyword-notification-icon {
        background: #f44336;
        color: white;
      }

      .keyword-notification-info .keyword-notification-icon {
        background: #2196F3;
        color: white;
      }

      .keyword-notification-content {
        flex: 1;
      }

      .keyword-notification-message {
        font-size: 14px;
        font-weight: 500;
        color: #333;
        margin-bottom: 4px;
      }

      .keyword-notification-details {
        font-size: 12px;
        color: #666;
      }
    `

    document.head.appendChild(style)
  }
}

// Initialize the highlighter
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new KeywordHighlighter()
  })
} else {
  new KeywordHighlighter()
}

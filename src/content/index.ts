import type { Profile, ChromeMessage } from '../types'
import { HighlightManager } from './HighlightManager'
import { ProfileMatcher } from './ProfileMatcher'
import { DOMProcessor } from './DOMProcessor'
import { StyleManager } from './StyleManager'
import { NotificationManager } from './NotificationManager'

class KeywordHighlighter {
  private isEnabled = true
  private lastProfileSignature: string | null = null

  private highlightManager: HighlightManager
  private profileMatcher: ProfileMatcher
  private domProcessor: DOMProcessor

  constructor() {
    this.highlightManager = new HighlightManager()
    this.profileMatcher = new ProfileMatcher()
    this.domProcessor = new DOMProcessor(this.highlightManager)
    this.init()
  }

  private async init(): Promise<void> {
    await this.loadSettings()
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this))
    StyleManager.injectBaseStyles()
    this.setupDOMObserver()
    this.setupUrlChangeDetection()

    if (this.isEnabled) {
      const matchingProfiles = this.profileMatcher.findMatchingProfiles()
      if (matchingProfiles.length > 0) {
        this.highlightPage()
      }
    }

    this.notifyUrlChange()
  }

  private async loadSettings(): Promise<void> {
    try {
      const result = await chrome.storage.sync.get(['profiles', 'extensionEnabled'])
      const profiles = (result.profiles || []) as Profile[]
      this.profileMatcher.setProfiles(profiles)
      this.isEnabled = result.extensionEnabled !== false
    } catch (error) {
      console.error('❌ Error loading settings:', error)
      this.profileMatcher.setProfiles([])
      this.isEnabled = true
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
      case 'toggleExtension': {
        const enabled = (request as any).enabled
        this.handleToggleExtension(enabled)
        break
      }
      case 'showNotification':
        NotificationManager.showNotification(request.message || '', request.type, request.details)
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

    const newProfiles = this.profileMatcher.findMatchingProfiles()
    const newSig = this.profileMatcher.generateProfileSignature(newProfiles)

    if (newSig === this.lastProfileSignature) {
      return
    }

    if (this.lastProfileSignature) {
      this.highlightManager.clearHighlights()
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

    this.highlightManager.clearHighlights()

    const matchingProfiles = this.profileMatcher.findMatchingProfiles()

    if (matchingProfiles.length > 0) {
      this.highlightPage()
      NotificationManager.showHighlightRefreshFeedback()
    }
  }

  private handleToggleExtension(enabled: boolean): void {
    this.isEnabled = enabled
    if (enabled) {
      this.highlightManager.clearHighlights()
      this.setupDOMObserver()

      this.loadSettings().then(() => {
        this.highlightPage()
        const profiles = this.profileMatcher.findMatchingProfiles()
        this.lastProfileSignature = this.profileMatcher.generateProfileSignature(profiles)
      })
    } else {
      this.domProcessor.disconnectObserver()
      this.highlightManager.clearHighlights()
      this.lastProfileSignature = null
    }
  }

  private setupDOMObserver(): void {
    this.domProcessor.setupObserver(() => {
      if (!this.isEnabled) return

      const matchingProfiles = this.profileMatcher.findMatchingProfiles()
      if (matchingProfiles.length === 0) return

      const { keywordColorMap, exactCase } =
        this.highlightManager.buildKeywordColorMap(matchingProfiles)
      this.domProcessor.processDocument(keywordColorMap, exactCase)
    })
  }

  private highlightPage(): void {
    const matchingProfiles = this.profileMatcher.findMatchingProfiles()

    if (matchingProfiles.length === 0) {
      return
    }

    this.highlightManager.clearCaches()
    const { keywordColorMap, exactCase } =
      this.highlightManager.buildKeywordColorMap(matchingProfiles)
    this.domProcessor.processDocument(keywordColorMap, exactCase)
  }

  private setupUrlChangeDetection(): void {
    let currentUrl = window.location.href

    const originalPushState = history.pushState
    const originalReplaceState = history.replaceState

    history.pushState = function (...args) {
      originalPushState.apply(history, args)
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href
        window.dispatchEvent(new Event('urlchange'))
      }
    }

    history.replaceState = function (...args) {
      originalReplaceState.apply(history, args)
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href
        window.dispatchEvent(new Event('urlchange'))
      }
    }

    window.addEventListener('popstate', () => {
      if (window.location.href !== currentUrl) {
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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new KeywordHighlighter()
  })
} else {
  new KeywordHighlighter()
}

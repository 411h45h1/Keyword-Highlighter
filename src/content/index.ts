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
    sendResponse: (response?: unknown) => void
  ): boolean | void {
    switch (request.action) {
      case 'getKeywordInfo':
        this.handleGetKeywordInfo(request.data as string)
          .then((response) => {
            sendResponse({ success: true, data: response })
          })
          .catch((error) => {
            console.error('Error getting keyword info:', error)
            sendResponse({ success: false, error: error.message })
          })
        return true
      case 'setupSelectionHandler':
        this.setupSelectionHandler()
        sendResponse({ success: true })
        break
      case 'updateProfiles':
        this.handleUpdateProfiles()
          .then(() => {
            sendResponse({ success: true })
          })
          .catch((error) => {
            console.error('Error updating profiles:', error)
            sendResponse({ success: false, error: error.message })
          })
        return true
      case 'toggleExtension': {
        const enabled = (request as ChromeMessage & { enabled: boolean }).enabled
        this.handleToggleExtension(enabled)
        sendResponse({ success: true })
        break
      }
      case 'showNotification':
        NotificationManager.showNotification(request.message || '', request.type, request.details)
        sendResponse({ success: true })
        break
      case 'forceHighlightRefresh':
        this.handleForceHighlightRefresh()
          .then(() => {
            sendResponse({ success: true })
          })
          .catch((error) => {
            console.error('Error refreshing highlights:', error)
            sendResponse({ success: false, error: error.message })
          })
        return true // Indicates async response
      default:
        sendResponse({ success: false, error: 'Unknown action' })
        break
    }
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
    this.domProcessor.setupObserver((elements: Element[]) => {
      if (!this.isEnabled) return

      const matchingProfiles = this.profileMatcher.findMatchingProfiles()
      if (matchingProfiles.length === 0) return

      const { keywordColorMap, exactCase } =
        this.highlightManager.buildKeywordColorMap(matchingProfiles)
      this.domProcessor.processElements(elements, keywordColorMap, exactCase)
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

  private async handleGetKeywordInfo(keyword: string): Promise<{
    profiles: Array<{
      profileId: string
      profileName: string
      groupName: string
      groupIndex: number
    }>
    isHighlighted: boolean
  }> {
    const matchingProfiles = this.profileMatcher.findMatchingProfiles()
    const keywordInfo: Array<{
      profileId: string
      profileName: string
      groupName: string
      groupIndex: number
    }> = []
    let isHighlighted = false

    for (const profile of matchingProfiles) {
      if (profile.keywordGroups && Array.isArray(profile.keywordGroups)) {
        profile.keywordGroups.forEach((group, groupIndex) => {
          if (group.keywords && Array.isArray(group.keywords)) {
            const normalizedKeyword = keyword.toLowerCase().trim()
            const hasKeyword = group.keywords.some(
              (k) => k.toLowerCase().trim() === normalizedKeyword
            )

            if (hasKeyword) {
              keywordInfo.push({
                profileId: profile.id,
                profileName: profile.name || `Profile ${profile.id}`,
                groupName: group.name || `Group ${groupIndex + 1}`,
                groupIndex,
              })
              isHighlighted = true
            }
          }
        })
      }
    }

    if (isHighlighted) {
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        const commonAncestor = range.commonAncestorContainer

        let current =
          commonAncestor.nodeType === Node.TEXT_NODE
            ? commonAncestor.parentElement
            : (commonAncestor as Element)

        while (current && current !== document.body) {
          if (current.classList && current.classList.contains('keyword-highlight')) {
            break
          }
          current = current.parentElement
        }

        if (!current || !current.classList?.contains('keyword-highlight')) {
          const highlightedElements = range.cloneContents().querySelectorAll?.('.keyword-highlight')
          isHighlighted = highlightedElements && highlightedElements.length > 0
        }
      }
    }

    return { profiles: keywordInfo, isHighlighted }
  }

  private setupSelectionHandler(): void {
    if (this.selectionHandler) {
      document.removeEventListener('selectionchange', this.selectionHandler)
    }

    this.selectionHandler = async () => {
      const selection = window.getSelection()
      const selectedText = selection?.toString()?.trim()

      if (!selectedText) {
        this.notifyMenuVisibility('', false)
        return
      }

      try {
        const keywordInfo = await this.handleGetKeywordInfo(selectedText)
        this.notifyMenuVisibility(selectedText, keywordInfo.isHighlighted)
      } catch (error) {
        console.error('Error checking keyword info:', error)
        this.notifyMenuVisibility(selectedText, false)
      }
    }

    document.addEventListener('selectionchange', this.selectionHandler)
  }

  private selectionHandler: (() => void) | null = null

  private notifyMenuVisibility(selectedText: string, isHighlighted: boolean): void {
    try {
      chrome.runtime
        .sendMessage({
          action: 'updateMenuVisibility',
          data: { selectedText, isHighlighted },
        } as ChromeMessage)
        .catch(() => {})
    } catch (error) {
      console.error('Error notifying menu visibility:', error)
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

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      try {
        new KeywordHighlighter()
      } catch (error) {
        console.error('Error initializing KeywordHighlighter on DOMContentLoaded:', error)
      }
    })
  } else {
    try {
      new KeywordHighlighter()
    } catch (error) {
      console.error('Error initializing KeywordHighlighter:', error)
    }
  }
} else {
  console.warn('Window or document not available, skipping KeywordHighlighter initialization')
}

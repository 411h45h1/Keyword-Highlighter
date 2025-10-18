import type { Profile, ChromeMessage } from '../types'
import { shouldProcessUrl, urlMatches, parseKeywords } from '../utils/helpers'

class BackgroundService {
  private updateContextMenusTimeout: number | null = null
  private isUpdatingContextMenus = false

  constructor() {
    this.init()
  }

  private init(): void {
    chrome.tabs.onUpdated.addListener(this.handleTabUpdate.bind(this))
    chrome.tabs.onActivated.addListener(this.handleTabActivated.bind(this))
    chrome.runtime.onInstalled.addListener(this.handleInstalled.bind(this))
    chrome.contextMenus.onClicked.addListener(this.handleContextMenuClick.bind(this))
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this))
  }

  private handleTabUpdate(
    tabId: number,
    changeInfo: { status?: string },
    tab: chrome.tabs.Tab
  ): void {
    if (changeInfo.status === 'complete' && tab.url) {
      this.processTab(tabId, tab.url)
    }
  }

  private handleTabActivated(activeInfo: { tabId: number }): void {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
      if (tab.url && tab.status === 'complete') {
        this.processTab(tab.id!, tab.url)
        this.updateContextMenus(tab.url)
      }
    })
  }

  private async processTab(tabId: number, url: string): Promise<void> {
    try {
      const result = await chrome.storage.sync.get(['extensionEnabled'])
      const isEnabled = result.extensionEnabled !== false

      if (!isEnabled) {
        await this.hideContextMenus()
        return
      }

      if (!shouldProcessUrl(url)) {
        await this.hideContextMenus()
        return
      }

      this.updateContextMenus(url)

      await chrome.tabs.sendMessage(tabId, {
        action: 'updateProfiles',
      } as ChromeMessage)
    } catch (error) {
      console.error('Error processing tab:', error)
    }
  }

  private handleInstalled(details: chrome.runtime.InstalledDetails): void {
    if (details.reason === 'install') {
      chrome.storage.sync.set({
        extensionEnabled: true,
        profiles: [],
        keywordBank: [],
      })
    } else if (details.reason === 'update') {
      chrome.storage.sync.get(['keywordBank'], (result) => {
        if (!result.keywordBank) {
          chrome.storage.sync.set({ keywordBank: [] })
        }
      })
    }

    this.createContextMenus()

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].url) {
        this.updateContextMenus(tabs[0].url)
      }
    })
  }

  private async createContextMenus(): Promise<void> {
    try {
      await chrome.contextMenus.removeAll()
      await new Promise((resolve) => setTimeout(resolve, 10))

      chrome.contextMenus.create(
        {
          id: 'quick-add-keyword',
          title: "Add '%s' to keyword group",
          contexts: ['selection'],
          visible: false,
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error('Error creating context menu:', chrome.runtime.lastError)
          }
        }
      )
    } catch (error) {
      console.error('Error in createContextMenus:', error)
    }
  }

  private async updateContextMenus(currentUrl: string): Promise<void> {
    if (this.isUpdatingContextMenus) return

    if (this.updateContextMenusTimeout) {
      clearTimeout(this.updateContextMenusTimeout)
    }

    this.updateContextMenusTimeout = setTimeout(async () => {
      await this.performContextMenuUpdate(currentUrl)
    }, 100)
  }

  private async performContextMenuUpdate(currentUrl: string): Promise<void> {
    if (this.isUpdatingContextMenus) return

    this.isUpdatingContextMenus = true

    try {
      const result = await chrome.storage.sync.get(['profiles', 'extensionEnabled'])
      const profiles = (result.profiles || []) as Profile[]
      const isEnabled = result.extensionEnabled !== false

      if (!isEnabled) {
        await this.hideContextMenus()
        return
      }

      const matchingProfiles = this.findMatchingProfiles(profiles, currentUrl)

      if (matchingProfiles.length > 0) {
        await this.showContextMenusForProfiles(matchingProfiles)
      } else {
        await this.hideContextMenus()
      }
    } catch (error) {
      console.error('Error updating context menus:', error)
    } finally {
      this.isUpdatingContextMenus = false
    }
  }

  private findMatchingProfiles(profiles: Profile[], currentUrl: string): Profile[] {
    const matchingProfiles: Profile[] = []

    for (const profile of profiles) {
      let matches = false

      if (profile.urlPatterns && Array.isArray(profile.urlPatterns)) {
        for (const urlPattern of profile.urlPatterns) {
          const patterns = Array.isArray(urlPattern.urlPattern)
            ? urlPattern.urlPattern
            : [urlPattern.urlPattern || urlPattern]

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

    // TEMPORARY DEBUG: If no profiles match, show profiles that have keyword groups for testing
    if (matchingProfiles.length === 0) {
      const profilesWithGroups = profiles.filter(
        (p) => p.keywordGroups && p.keywordGroups.length > 0
      )

      if (profilesWithGroups.length > 0) {
        // TEMPORARILY ENABLED: Force context menu to appear for testing
        return profilesWithGroups.slice(0, 1)
      }
    }

    return matchingProfiles
  }

  private async showContextMenusForProfiles(matchingProfiles: Profile[]): Promise<void> {
    try {
      await chrome.contextMenus.removeAll()
      await new Promise((resolve) => setTimeout(resolve, 10))

      const mainMenuPromise = new Promise<void>((resolve, reject) => {
        chrome.contextMenus.create(
          {
            id: 'quick-add-keyword',
            title: "Add '%s' to keyword group",
            contexts: ['selection'],
          },
          () => {
            if (chrome.runtime.lastError) {
              console.error('Error creating main menu:', chrome.runtime.lastError)
              reject(chrome.runtime.lastError)
            } else {
              resolve()
            }
          }
        )
      })

      await mainMenuPromise

      for (const profile of matchingProfiles) {
        const profileId = `profile-${profile.id}`

        const profileMenuPromise = new Promise<void>((resolve, reject) => {
          chrome.contextMenus.create(
            {
              id: profileId,
              parentId: 'quick-add-keyword',
              title: profile.name || `Profile ${profile.id}`,
              contexts: ['selection'],
            },
            () => {
              if (chrome.runtime.lastError) {
                console.error('Error creating profile menu:', chrome.runtime.lastError)
                reject(chrome.runtime.lastError)
              } else {
                resolve()
              }
            }
          )
        })

        await profileMenuPromise

        if (profile.keywordGroups && Array.isArray(profile.keywordGroups)) {
          for (let index = 0; index < profile.keywordGroups.length; index++) {
            const group = profile.keywordGroups[index]
            const groupId = `${profileId}-group-${index}`

            const groupMenuPromise = new Promise<void>((resolve, reject) => {
              chrome.contextMenus.create(
                {
                  id: groupId,
                  parentId: profileId,
                  title: group.name || `Group ${index + 1}`,
                  contexts: ['selection'],
                },
                () => {
                  if (chrome.runtime.lastError) {
                    console.error('Error creating group menu:', chrome.runtime.lastError)
                    reject(chrome.runtime.lastError)
                  } else {
                    resolve()
                  }
                }
              )
            })

            await groupMenuPromise
          }
        }
      }
    } catch (error) {
      console.error('Error showing context menus:', error)
    }
  }
  private async hideContextMenus(): Promise<void> {
    try {
      await chrome.contextMenus.removeAll()
    } catch (error) {
      console.error('Error hiding context menus:', error)
    }
  }

  private async handleContextMenuClick(
    info: chrome.contextMenus.OnClickData,
    tab?: chrome.tabs.Tab
  ): Promise<void> {
    try {
      const selectedText = info.selectionText?.trim()

      if (!selectedText || !tab?.id) {
        return
      }

      const menuId = info.menuItemId

      if (typeof menuId === 'string' && menuId.includes('-group-')) {
        const parts = menuId.split('-')

        // Expected format: "profile-{profileId}-group-{groupIndex}"
        // So parts should be: ["profile", "{profileId}", "group", "{groupIndex}"]
        if (parts.length >= 4 && parts[0] === 'profile' && parts[2] === 'group') {
          const profileId = parts[1]
          const groupIndex = parseInt(parts[3], 10)

          try {
            await this.addKeywordToGroup(profileId, groupIndex, selectedText)

            // Notify content script to update
            chrome.tabs
              .sendMessage(tab.id, {
                action: 'updateProfiles',
              } as ChromeMessage)
              .catch(() => {})

            chrome.tabs
              .sendMessage(tab.id, {
                action: 'showNotification',
                message: `Keyword "${selectedText}" added successfully!`,
                type: 'success',
                details: 'Highlights will appear automatically.',
              } as ChromeMessage)
              .catch(() => {})
          } catch (error) {
            console.error('Error adding keyword to group:', error)
            chrome.tabs
              .sendMessage(tab.id, {
                action: 'showNotification',
                message: 'Failed to add keyword to group',
                type: 'error',
                details: error instanceof Error ? error.message : 'Unknown error',
              } as ChromeMessage)
              .catch(() => {})
          }
        }
      }
    } catch (error) {
      console.error('Error handling context menu click:', error)
    }
  }

  private async addKeywordToGroup(
    profileId: string,
    groupIndex: number,
    keywordText: string
  ): Promise<{ type: string; message: string; details: string }> {
    const result = await chrome.storage.sync.get(['profiles'])
    const profiles = (result.profiles || []) as Profile[]

    const profileIndex = profiles.findIndex((p) => p.id === profileId)
    if (profileIndex === -1) {
      throw new Error('Profile not found')
    }

    const profile = profiles[profileIndex]

    if (!profile.keywordGroups || !Array.isArray(profile.keywordGroups)) {
      throw new Error('Profile does not have keyword groups')
    }

    if (groupIndex >= profile.keywordGroups.length) {
      throw new Error('Group index out of range')
    }

    const group = profile.keywordGroups[groupIndex]

    if (!group.keywords) {
      group.keywords = []
    }

    const keywords = parseKeywords(keywordText)
    const addedKeywords: string[] = []
    const existingKeywords: string[] = []

    for (const keyword of keywords) {
      const normalizedKeyword = keyword.toLowerCase().trim()
      const existingKeyword = group.keywords.find(
        (k) => k.toLowerCase().trim() === normalizedKeyword
      )

      if (!existingKeyword) {
        group.keywords.push(keyword)
        addedKeywords.push(keyword)
      } else {
        existingKeywords.push(keyword)
      }
    }

    if (addedKeywords.length > 0) {
      await chrome.storage.sync.set({ profiles })
    }

    if (addedKeywords.length > 0 && existingKeywords.length === 0) {
      const keywordList =
        addedKeywords.length === 1
          ? `"${addedKeywords[0]}"`
          : `${addedKeywords.length} keywords: ${addedKeywords.map((k) => `"${k}"`).join(', ')}`

      return {
        type: 'success',
        message: `Added ${keywordList} to keyword group`,
        details: `Profile: ${profile.name || profileId} • Group: ${group.name || `Group ${groupIndex + 1}`}`,
      }
    } else if (addedKeywords.length > 0 && existingKeywords.length > 0) {
      return {
        type: 'success',
        message: `Added ${addedKeywords.length} new keyword(s)`,
        details: `${existingKeywords.length} keyword(s) already existed`,
      }
    } else {
      return {
        type: 'info',
        message: 'No new keywords added',
        details: 'All keywords already exist in this group',
      }
    }
  }

  private handleMessage(
    request: ChromeMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ): boolean | void {
    try {
      switch (request.action) {
        case 'updateContextMenus':
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0 && tabs[0].url) {
              this.updateContextMenus(tabs[0].url)
                .then(() => {
                  sendResponse({ success: true })
                })
                .catch((error) => {
                  console.error('Error updating context menus:', error)
                  sendResponse({ success: false, error: error.message })
                })
            } else {
              sendResponse({ success: false, error: 'No active tab found' })
            }
          })
          return true // Indicates async response
        default:
          sendResponse({ success: false, error: 'Unknown action' })
          break
      }
    } catch (error) {
      console.error('Error handling message:', error)
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
}

// Initialize the background service
new BackgroundService()

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

      // Try to send message to content script, but don't fail if it doesn't exist
      try {
        await chrome.tabs.sendMessage(tabId, {
          action: 'updateProfiles',
        } as ChromeMessage)
        console.log('✅ Successfully notified content script on tab:', tabId)
      } catch (messageError) {
        // This is normal for tabs that don't have content scripts (like chrome:// pages)
        console.log(
          'ℹ️ Could not notify content script on tab:',
          tabId,
          '(this is normal for some pages)'
        )
      }
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

      // Create initial menu as hidden - will be shown when matching profiles are found
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
          } else {
            console.log('Successfully created initial context menu (hidden)')
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
      console.log('=== CONTEXT MENU UPDATE START ===')
      console.log('Current URL:', currentUrl)

      const result = await chrome.storage.sync.get(['profiles', 'extensionEnabled'])
      const profiles = (result.profiles || []) as Profile[]
      const isEnabled = result.extensionEnabled !== false

      console.log('Extension enabled:', isEnabled)
      console.log('Profiles from storage:', profiles)

      if (!isEnabled) {
        console.log('Extension disabled, hiding menus')
        await this.hideContextMenus()
        return
      }

      const matchingProfiles = this.findMatchingProfiles(profiles, currentUrl)
      console.log('Context menu update:', {
        currentUrl,
        totalProfiles: profiles.length,
        matchingProfiles: matchingProfiles.length,
        profileNames: matchingProfiles.map((p) => p.name || p.id),
      })

      if (matchingProfiles.length > 0) {
        console.log('Found matching profiles, showing context menus')
        await this.showContextMenusForProfiles(matchingProfiles)
      } else {
        console.log('No matching profiles found, hiding menus')
        await this.hideContextMenus()
      }

      console.log('=== CONTEXT MENU UPDATE END ===')
    } catch (error) {
      console.error('Error updating context menus:', error)
    } finally {
      this.isUpdatingContextMenus = false
    }
  }

  private findMatchingProfiles(profiles: Profile[], currentUrl: string): Profile[] {
    const matchingProfiles: Profile[] = []
    console.log('🔍 Finding matching profiles for URL:', currentUrl)
    console.log('📊 Total profiles to check:', profiles.length)

    // TEMPORARY DEBUG: Show all profiles for testing (remove after debugging)
    console.log(
      '🗂️ All profiles in storage:',
      profiles.map((p) => ({
        id: p.id,
        name: p.name,
        urlPatterns: p.urlPatterns,
        urlPattern: p.urlPattern,
        keywordGroups: p.keywordGroups?.length || 0,
      }))
    )

    for (const profile of profiles) {
      let matches = false
      console.log('🔎 Checking profile:', profile.name || profile.id, {
        urlPatterns: profile.urlPatterns,
        urlPattern: profile.urlPattern,
        keywordGroups: profile.keywordGroups?.length || 0,
      })

      if (profile.urlPatterns && Array.isArray(profile.urlPatterns)) {
        console.log('📋 Checking urlPatterns array...')
        for (const urlPattern of profile.urlPatterns) {
          const patterns = Array.isArray(urlPattern.urlPattern)
            ? urlPattern.urlPattern
            : [urlPattern.urlPattern || urlPattern]

          console.log('🎯 Patterns to check:', patterns)
          for (const pattern of patterns) {
            if (typeof pattern === 'string' && urlMatches(currentUrl, pattern)) {
              console.log('✅ URL matches pattern:', pattern)
              matches = true
              break
            } else {
              console.log('❌ URL does not match pattern:', pattern)
            }
          }

          if (matches) break
        }
      } else if (profile.urlPattern) {
        console.log('🎯 Checking single urlPattern:', profile.urlPattern)
        matches = urlMatches(currentUrl, profile.urlPattern)
        if (matches) {
          console.log('✅ URL matches single pattern:', profile.urlPattern)
        } else {
          console.log('❌ URL does not match single pattern:', profile.urlPattern)
        }
      } else {
        console.log('⚠️ Profile has no URL patterns defined')
      }

      if (matches) {
        matchingProfiles.push(profile)
        console.log('🎉 Profile matched:', profile.name || profile.id)
      } else {
        console.log('🚫 Profile did not match:', profile.name || profile.id)
      }
    }

    console.log('📈 Found matching profiles:', matchingProfiles.length)

    // TEMPORARY DEBUG: If no profiles match, show profiles that have keyword groups for testing
    if (matchingProfiles.length === 0) {
      const profilesWithGroups = profiles.filter(
        (p) => p.keywordGroups && p.keywordGroups.length > 0
      )
      console.log(
        '🔧 DEBUG: No matches found, but found profiles with keyword groups:',
        profilesWithGroups.length
      )

      if (profilesWithGroups.length > 0) {
        console.log('🔧 DEBUG: Using first profile with keyword groups for testing')
        // TEMPORARILY ENABLED: Force context menu to appear for testing
        return profilesWithGroups.slice(0, 1)
      }
    }

    return matchingProfiles
  }

  private async showContextMenusForProfiles(matchingProfiles: Profile[]): Promise<void> {
    try {
      console.log('🎯 Showing context menus for profiles:', matchingProfiles.length)

      console.log('🗑️ Removing all existing context menus...')
      await chrome.contextMenus.removeAll()
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Create main menu without visible: false when we have matching profiles
      console.log('🔧 Creating main context menu...')

      const mainMenuPromise = new Promise<void>((resolve, reject) => {
        chrome.contextMenus.create(
          {
            id: 'quick-add-keyword',
            title: "Add '%s' to keyword group",
            contexts: ['selection'],
          },
          () => {
            if (chrome.runtime.lastError) {
              console.error('❌ Error creating main menu:', chrome.runtime.lastError)
              reject(chrome.runtime.lastError)
            } else {
              console.log('✅ Successfully created main menu')
              resolve()
            }
          }
        )
      })

      await mainMenuPromise

      for (const profile of matchingProfiles) {
        const profileId = `profile-${profile.id}`
        console.log(`🔧 Creating profile menu for: ${profile.name || profile.id}`)

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
                console.error('❌ Error creating profile menu:', chrome.runtime.lastError)
                reject(chrome.runtime.lastError)
              } else {
                console.log('✅ Successfully created profile menu:', profileId)
                resolve()
              }
            }
          )
        })

        await profileMenuPromise

        if (profile.keywordGroups && Array.isArray(profile.keywordGroups)) {
          console.log(`📁 Profile has ${profile.keywordGroups.length} keyword groups`)

          for (let index = 0; index < profile.keywordGroups.length; index++) {
            const group = profile.keywordGroups[index]
            const groupId = `${profileId}-group-${index}`
            console.log('🔧 Creating group menu:', { groupId, profileId, groupName: group.name })

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
                    console.error('❌ Error creating group menu:', chrome.runtime.lastError)
                    reject(chrome.runtime.lastError)
                  } else {
                    console.log('✅ Successfully created group menu:', groupId)
                    resolve()
                  }
                }
              )
            })

            await groupMenuPromise
          }
        } else {
          console.log('⚠️ No keyword groups found for profile:', profile.id)
        }
      }

      console.log('🎉 Finished creating all context menus')
    } catch (error) {
      console.error('❌ Error showing context menus:', error)
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
        console.log('Context menu clicked:', menuId)
        const parts = menuId.split('-')

        // Expected format: "profile-{profileId}-group-{groupIndex}"
        // So parts should be: ["profile", "{profileId}", "group", "{groupIndex}"]
        if (parts.length >= 4 && parts[0] === 'profile' && parts[2] === 'group') {
          const profileId = parts[1]
          const groupIndex = parseInt(parts[3], 10)

          console.log('Parsed menu click:', { profileId, groupIndex, selectedText })

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
        } else {
          console.error('Invalid menu ID format:', menuId, 'Parts:', parts)
        }
      } else {
        console.log('Non-group menu item clicked:', menuId)
      }
    } catch (error) {
      if (tab?.id) {
        chrome.tabs
          .sendMessage(tab.id, {
            action: 'showNotification',
            message: 'Error adding keyword to group',
            type: 'error',
            details: error instanceof Error ? error.message : 'Unknown error',
          } as ChromeMessage)
          .catch(() => {})
      }
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

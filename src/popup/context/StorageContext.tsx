/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import type { Profile, StorageData } from '../../types'

interface StorageContextType {
  profiles: Profile[]
  keywordBank: string[]
  isEnabled: boolean
  isLoading: boolean
  setProfiles: (profiles: Profile[]) => Promise<void>
  setKeywordBank: (keywords: string[]) => Promise<void>
  setIsEnabled: (enabled: boolean) => Promise<void>
  addProfile: (profile: Profile) => Promise<void>
  updateProfile: (profile: Profile) => Promise<void>
  deleteProfile: (profileId: string) => Promise<void>
  duplicateProfile: (profile: Profile) => Promise<void>
  getAllKeywordsFromProfiles: () => string[]
  notifyContentScripts: () => Promise<void>
  refreshData: () => Promise<void>
}

const StorageContext = createContext<StorageContextType | undefined>(undefined)

interface StorageProviderProps {
  children: ReactNode
}

export function StorageProvider({ children }: StorageProviderProps) {
  const [profiles, setProfilesState] = useState<Profile[]>([])
  const [keywordBank, setKeywordBankState] = useState<string[]>([])
  const [isEnabled, setIsEnabledState] = useState(true)
  const [isLoading, setIsLoading] = useState(true)

  const notifyContentScripts = useCallback(async () => {
    try {
      const tabs = await chrome.tabs.query({})
      const messages = tabs.map((tab) => {
        if (tab.id) {
          return chrome.tabs.sendMessage(tab.id, { action: 'updateProfiles' }).catch((error) => {
            // Ignore errors for tabs that can't receive messages
            console.log('Failed to notify tab:', tab.id, error.message)
          })
        }
        return Promise.resolve()
      })
      await Promise.all(messages)
      console.log('Notified all content scripts')
    } catch (error) {
      console.error('Error notifying content scripts:', error)
    }
  }, [])

  const setProfiles = useCallback(
    async (newProfiles: Profile[]) => {
      setProfilesState(newProfiles)
      await chrome.storage.sync.set({ profiles: newProfiles })
      await notifyContentScripts()
    },
    [notifyContentScripts]
  )

  const setKeywordBank = useCallback(async (keywords: string[]) => {
    setKeywordBankState(keywords)
    await chrome.storage.sync.set({ keywordBank: keywords })
  }, [])

  const setIsEnabled = useCallback(async (enabled: boolean) => {
    setIsEnabledState(enabled)
    await chrome.storage.sync.set({ extensionEnabled: enabled })

    try {
      const tabs = await chrome.tabs.query({})
      const promises = tabs.map((tab) => {
        if (tab.id) {
          return chrome.tabs
            .sendMessage(tab.id, {
              action: 'toggleExtension',
              enabled: enabled,
            })
            .catch((error) => {
              console.log('Failed to toggle extension for tab:', tab.id, error.message)
            })
        }
        return Promise.resolve()
      })
      await Promise.all(promises)
      console.log('Toggled extension for all tabs')
    } catch (error) {
      console.error('Error toggling extension:', error)
    }
  }, [])

  const addProfile = useCallback(
    async (profile: Profile) => {
      const newProfiles = [...profiles, profile]
      await setProfiles(newProfiles)
    },
    [profiles, setProfiles]
  )

  const updateProfile = useCallback(
    async (profile: Profile) => {
      const newProfiles = profiles.map((p) => (p.id === profile.id ? profile : p))
      await setProfiles(newProfiles)
    },
    [profiles, setProfiles]
  )

  const deleteProfile = useCallback(
    async (profileId: string) => {
      const newProfiles = profiles.filter((p) => p.id !== profileId)
      await setProfiles(newProfiles)
    },
    [profiles, setProfiles]
  )

  const duplicateProfile = useCallback(
    async (profile: Profile) => {
      const newProfile: Profile = {
        ...profile,
        id: Date.now().toString(36) + Math.random().toString(36).substring(2),
        name: `${profile.name || 'Profile'} (Copy)`,
      }
      await addProfile(newProfile)
    },
    [addProfile]
  )

  const getAllKeywordsFromProfiles = useCallback(() => {
    const allKeywords = new Set<string>()
    profiles.forEach((p) => {
      p.keywordGroups?.forEach((g) => {
        g.keywords?.forEach((k) => allKeywords.add(k))
      })
    })
    return Array.from(allKeywords)
  }, [profiles])

  const refreshData = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = (await chrome.storage.sync.get([
        'extensionEnabled',
        'profiles',
        'keywordBank',
      ])) as Partial<StorageData>

      setIsEnabledState(data.extensionEnabled ?? true)
      setProfilesState(data.profiles || [])
      setKeywordBankState(data.keywordBank || [])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const value = useMemo(
    () => ({
      profiles,
      keywordBank,
      isEnabled,
      isLoading,
      setProfiles,
      setKeywordBank,
      setIsEnabled,
      addProfile,
      updateProfile,
      deleteProfile,
      duplicateProfile,
      getAllKeywordsFromProfiles,
      notifyContentScripts,
      refreshData,
    }),
    [
      profiles,
      keywordBank,
      isEnabled,
      isLoading,
      setProfiles,
      setKeywordBank,
      setIsEnabled,
      addProfile,
      updateProfile,
      deleteProfile,
      duplicateProfile,
      getAllKeywordsFromProfiles,
      notifyContentScripts,
      refreshData,
    ]
  )

  return <StorageContext.Provider value={value}>{children}</StorageContext.Provider>
}

export function useStorage() {
  const context = useContext(StorageContext)
  if (context === undefined) {
    throw new Error('useStorage must be used within a StorageProvider')
  }
  return context
}

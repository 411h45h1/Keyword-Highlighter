import { useState, useEffect } from 'react'
import type { Profile, StorageData } from '../types'
import { generateId } from '../utils/helpers'
import Header from './components/Header'
import ProfileForm from './components/ProfileForm'
import ProfilesList from './components/ProfilesList'
import KeywordBank from './components/KeywordBank'

function App() {
  const [isEnabled, setIsEnabled] = useState(true)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [view, setView] = useState<'input' | 'saved' | 'bank'>('input')
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)

  const loadData = async () => {
    try {
      const result = await chrome.storage.sync.get(['extensionEnabled', 'profiles'])
      const data = result as Partial<StorageData>
      setIsEnabled(data.extensionEnabled !== false)
      setProfiles(data.profiles || [])
    } catch (error) {
      console.error('Error loading data:', error)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
  }, [])

  const handleToggle = async (enabled: boolean) => {
    setIsEnabled(enabled)
    await chrome.storage.sync.set({ extensionEnabled: enabled })

    const tabs = await chrome.tabs.query({})
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs
          .sendMessage(tab.id, {
            action: 'toggleExtension',
            data: enabled,
          })
          .catch(() => {})
      }
    })
  }

  const handleSaveProfile = async (profile: Profile) => {
    const updatedProfiles = editingProfile
      ? profiles.map((p) => (p.id === profile.id ? profile : p))
      : [...profiles, { ...profile, id: profile.id || generateId() }]

    setProfiles(updatedProfiles)
    await chrome.storage.sync.set({ profiles: updatedProfiles })
    setEditingProfile(null)

    // Notify content scripts
    notifyContentScripts()
  }

  const handleEditProfile = (profile: Profile) => {
    setEditingProfile(profile)
    setView('input')
  }

  const handleDeleteProfile = async (profileId: string) => {
    const updatedProfiles = profiles.filter((p) => p.id !== profileId)
    setProfiles(updatedProfiles)
    await chrome.storage.sync.set({ profiles: updatedProfiles })
    notifyContentScripts()
  }

  const handleDuplicateProfile = async (profile: Profile) => {
    const newProfile: Profile = {
      ...profile,
      id: generateId(),
      name: `${profile.name || 'Profile'} (Copy)`,
    }
    const updatedProfiles = [...profiles, newProfile]
    setProfiles(updatedProfiles)
    await chrome.storage.sync.set({ profiles: updatedProfiles })
    notifyContentScripts()
  }

  const handleCancelEdit = () => {
    setEditingProfile(null)
  }

  const notifyContentScripts = async () => {
    try {
      const tabs = await chrome.tabs.query({})
      tabs.forEach((tab) => {
        if (tab.id) {
          chrome.tabs
            .sendMessage(tab.id, {
              action: 'updateProfiles',
            })
            .catch(() => {})
        }
      })
    } catch (error) {
      console.error('Error notifying content scripts:', error)
    }
  }

  return (
    <div className="w-[600px] h-[600px] bg-gray-50">
      <Header isEnabled={isEnabled} onToggle={handleToggle} />

      <div className="p-4">
        {/* View Toggle */}
        <div className="flex gap-2 mb-4 bg-white rounded-lg p-1 shadow-sm">
          <button
            onClick={() => setView('input')}
            className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
              view === 'input'
                ? 'bg-blue-600 text-white'
                : 'bg-transparent text-gray-600 hover:bg-gray-100'
            }`}
          >
            Input
          </button>
          <button
            onClick={() => setView('saved')}
            className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
              view === 'saved'
                ? 'bg-blue-600 text-white'
                : 'bg-transparent text-gray-600 hover:bg-gray-100'
            }`}
          >
            Saved ({profiles.length})
          </button>
          <button
            onClick={() => setView('bank')}
            className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
              view === 'bank'
                ? 'bg-blue-600 text-white'
                : 'bg-transparent text-gray-600 hover:bg-gray-100'
            }`}
          >
            Bank
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(600px - 180px)' }}>
          {view === 'input' ? (
            <ProfileForm
              profile={editingProfile}
              onSave={handleSaveProfile}
              onCancel={editingProfile ? handleCancelEdit : undefined}
            />
          ) : view === 'saved' ? (
            <ProfilesList
              profiles={profiles}
              onEdit={handleEditProfile}
              onDelete={handleDeleteProfile}
              onDuplicate={handleDuplicateProfile}
            />
          ) : (
            <KeywordBank />
          )}
        </div>
      </div>
    </div>
  )
}

export default App

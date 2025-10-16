import { useEffect } from 'react'
import type { Profile } from '../types'
import { generateId } from '../utils/helpers'
import { StorageProvider, useStorage, AppProvider, useApp } from './context'
import Header from './components/Header'
import ProfileForm from './components/ProfileForm'
import ProfilesList from './components/ProfilesList'
import KeywordBank from './components/KeywordBank'

function AppContent() {
  const {
    profiles,
    isEnabled,
    isLoading,
    setIsEnabled,
    addProfile,
    updateProfile,
    deleteProfile,
    duplicateProfile,
    refreshData,
  } = useStorage()

  const { view, setView, editingProfile, startEditing, cancelEditing } = useApp()

  useEffect(() => {
    refreshData()
  }, [refreshData])

  const handleSaveProfile = async (profile: Profile) => {
    if (editingProfile) {
      await updateProfile(profile)
    } else {
      await addProfile({ ...profile, id: profile.id || generateId() })
    }
    cancelEditing()
  }

  if (isLoading) {
    return (
      <div className="w-[600px] h-[600px] bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className="w-[600px] h-[600px] bg-gray-50">
      <Header isEnabled={isEnabled} onToggle={setIsEnabled} />

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
              onCancel={editingProfile ? cancelEditing : undefined}
            />
          ) : view === 'saved' ? (
            <ProfilesList
              profiles={profiles}
              onEdit={startEditing}
              onDelete={deleteProfile}
              onDuplicate={duplicateProfile}
            />
          ) : (
            <KeywordBank />
          )}
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <StorageProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </StorageProvider>
  )
}

export default App

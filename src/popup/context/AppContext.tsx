/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useMemo, type ReactNode } from 'react'
import type { Profile } from '../../types'

interface AppContextType {
  view: 'input' | 'saved' | 'bank'
  setView: (view: 'input' | 'saved' | 'bank') => void
  editingProfile: Profile | null
  setEditingProfile: (profile: Profile | null) => void
  startEditing: (profile: Profile) => void
  cancelEditing: () => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

interface AppProviderProps {
  children: ReactNode
}

export function AppProvider({ children }: AppProviderProps) {
  const [view, setView] = useState<'input' | 'saved' | 'bank'>('input')
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)

  const startEditing = (profile: Profile) => {
    setEditingProfile(profile)
    setView('input')
  }

  const cancelEditing = () => {
    setEditingProfile(null)
  }

  const value = useMemo(
    () => ({
      view,
      setView,
      editingProfile,
      setEditingProfile,
      startEditing,
      cancelEditing,
    }),
    [view, editingProfile]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}

import { useState, useEffect, useMemo } from 'react'
import type { Profile, KeywordGroup, UrlPattern, Template } from '../../types'
import { generateId, parseKeywords } from '../../utils/helpers'
import { useStorage } from '../context'
import TemplatesModal from './TemplatesModal'

interface ProfileFormProps {
  profile: Profile | null
  onSave: (profile: Profile) => void
  onCancel?: () => void
}

export default function ProfileForm({ profile, onSave, onCancel }: ProfileFormProps) {
  const { keywordBank, getAllKeywordsFromProfiles } = useStorage()

  const [profileName, setProfileName] = useState('')
  const [profileMode, setProfileMode] = useState<'single' | 'multi'>('single')
  const [urlPatterns, setUrlPatterns] = useState<UrlPattern[]>([
    { id: generateId(), urlPattern: '' },
  ])
  const [keywordGroups, setKeywordGroups] = useState<KeywordGroup[]>([
    { id: generateId(), name: '', keywords: [], color: '#ffff00' },
  ])
  const [uniqueKeywords, setUniqueKeywords] = useState(false)
  const [exactCase, setExactCase] = useState(false)
  const [showTemplatesModal, setShowTemplatesModal] = useState(false)

  const resetForm = () => {
    setProfileName('')
    setProfileMode('single')
    setUrlPatterns([{ id: generateId(), urlPattern: '' }])
    setKeywordGroups([{ id: generateId(), name: '', keywords: [], color: '#ffff00' }])
    setUniqueKeywords(false)
    setExactCase(false)
  }

  // Compute available keywords using useMemo instead of useEffect
  const availableKeywords = useMemo(() => {
    const allSavedKeywords = getAllKeywordsFromProfiles()
    const combined = [...new Set([...keywordBank, ...allSavedKeywords])]
    const newAvailable: Record<string, string[]> = {}

    keywordGroups.forEach((group) => {
      const currentKeywords = group.keywords || []
      const currentKeywordsLower = currentKeywords.map((k) => k.toLowerCase())

      let available = combined.filter((k) => !currentKeywordsLower.includes(k.toLowerCase()))

      if (uniqueKeywords) {
        const otherGroupKeywords = keywordGroups
          .filter((g) => g.id !== group.id)
          .flatMap((g) => g.keywords || [])
          .map((k) => k.toLowerCase())

        available = available.filter((k) => !otherGroupKeywords.includes(k.toLowerCase()))
      }

      newAvailable[group.id!] = available.sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
      )
    })

    return newAvailable
  }, [keywordGroups, uniqueKeywords, keywordBank, getAllKeywordsFromProfiles])

  useEffect(() => {
    if (profile) {
      setProfileName(profile.name || '')
      setProfileMode(profile.urlPatterns && profile.urlPatterns.length > 1 ? 'multi' : 'single')
      setUrlPatterns(
        profile.urlPatterns ||
          (profile.urlPattern ? [{ id: generateId(), urlPattern: profile.urlPattern }] : [])
      )
      setKeywordGroups(profile.keywordGroups || [])
      setUniqueKeywords(profile.uniqueKeywords || false)
      setExactCase(profile.exactCase || false)
    } else {
      resetForm()
    }
  }, [profile])

  const loadTemplate = (template: Template) => {
    setProfileName(template.name)
    setProfileMode(template.urlPatterns && template.urlPatterns.length > 1 ? 'multi' : 'single')
    setUrlPatterns(template.urlPatterns.map((p) => ({ ...p, id: generateId() })))
    setKeywordGroups(
      template.keywordGroups.map((g) => ({
        ...g,
        id: generateId(),
      }))
    )
  }

  const handleQuickAddKeyword = (groupId: string, keyword: string) => {
    setKeywordGroups((groups) =>
      groups.map((g) =>
        g.id === groupId ? { ...g, keywords: [...(g.keywords || []), keyword] } : g
      )
    )
  }

  const handleAddUrlPattern = () => {
    setUrlPatterns([
      ...urlPatterns,
      {
        id: generateId(),
        urlPattern: '',
        colorOverrides: {},
        textColorOverrides: {},
      },
    ])
  }

  const handleRemoveUrlPattern = (id: string) => {
    if (urlPatterns.length > 1) {
      setUrlPatterns(urlPatterns.filter((p) => p.id !== id))
    }
  }

  const handleUrlPatternChange = (id: string, value: string) => {
    setUrlPatterns(urlPatterns.map((p) => (p.id === id ? { ...p, urlPattern: value } : p)))
  }

  const updateUrlPattern = (patternId: string, updates: Partial<UrlPattern>) => {
    setUrlPatterns((patterns) =>
      patterns.map((pattern) => (pattern.id === patternId ? { ...pattern, ...updates } : pattern))
    )
  }

  const handleAddKeywordGroup = () => {
    setKeywordGroups([
      ...keywordGroups,
      { id: generateId(), name: '', keywords: [], color: '#ffff00' },
    ])
  }

  const handleRemoveKeywordGroup = (id: string) => {
    if (keywordGroups.length > 1) {
      setKeywordGroups(keywordGroups.filter((g) => g.id !== id))
    }
  }

  const handleKeywordGroupChange = (id: string, updates: Partial<KeywordGroup>) => {
    setKeywordGroups(keywordGroups.map((g) => (g.id === id ? { ...g, ...updates } : g)))
  }

  const handleSave = () => {
    const hasValidUrl = urlPatterns.some((p) => {
      const pattern = typeof p.urlPattern === 'string' ? p.urlPattern : p.urlPattern.join(',')
      return pattern.trim() !== ''
    })

    if (!hasValidUrl) {
      alert('Please enter at least one URL pattern')
      return
    }

    const hasValidKeywords = keywordGroups.some((g) => g.keywords.length > 0)
    if (!hasValidKeywords) {
      alert('Please add at least one keyword')
      return
    }

    const newProfile: Profile = {
      id: profile?.id || generateId(),
      name: profileName.trim() || undefined,
      urlPatterns: urlPatterns.map((p) => {
        const cleanedPattern: UrlPattern = {
          ...p,
          urlPattern: typeof p.urlPattern === 'string' ? p.urlPattern.trim() : p.urlPattern,
        }

        if (
          cleanedPattern.colorOverrides &&
          Object.keys(cleanedPattern.colorOverrides).length === 0
        ) {
          delete cleanedPattern.colorOverrides
        }

        if (
          cleanedPattern.textColorOverrides &&
          Object.keys(cleanedPattern.textColorOverrides).length === 0
        ) {
          delete cleanedPattern.textColorOverrides
        }

        return cleanedPattern
      }),
      keywordGroups: keywordGroups.map((g) => ({
        ...g,
        keywords: g.keywords.filter((k) => k.trim() !== ''),
      })),
      uniqueKeywords,
      exactCase,
    }

    onSave(newProfile)

    if (!profile) {
      resetForm()
    }
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm p-4">
        {/* Header with Title and Template Button */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{profile ? 'Edit Profile' : 'Add New Profile'}</h3>
          {!profile && (
            <button
              onClick={() => setShowTemplatesModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              Load Template
            </button>
          )}
        </div>

        {/* Profile Name */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Profile Name (optional)
          </label>
          <input
            type="text"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="e.g., Job Search Multi-Site"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            maxLength={50}
          />
        </div>

        {/* Profile Mode Toggle */}
        <div className="mb-4">
          <div className="flex gap-2 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => {
                setProfileMode('single')
                if (urlPatterns.length > 1) {
                  setUrlPatterns([urlPatterns[0]])
                }
              }}
              className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                profileMode === 'single'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'bg-transparent text-gray-600'
              }`}
            >
              Single URL
            </button>
            <button
              onClick={() => {
                setProfileMode('multi')
                setUrlPatterns((patterns) =>
                  patterns.map((pattern) => ({
                    ...pattern,
                    colorOverrides: pattern.colorOverrides || {},
                    textColorOverrides: pattern.textColorOverrides || {},
                  }))
                )
              }}
              className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                profileMode === 'multi'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'bg-transparent text-gray-600'
              }`}
            >
              Multi URL
            </button>
          </div>
        </div>

        {/* URL Patterns */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">URL Patterns</label>
          <div className="space-y-4">
            {urlPatterns.map((pattern) => (
              <div key={pattern.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={
                      typeof pattern.urlPattern === 'string'
                        ? pattern.urlPattern
                        : pattern.urlPattern.join(', ')
                    }
                    onChange={(e) => handleUrlPatternChange(pattern.id!, e.target.value)}
                    placeholder="e.g., https://example.com/* or paste multiple URLs"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {profileMode === 'multi' && urlPatterns.length > 1 && (
                    <button
                      onClick={() => handleRemoveUrlPattern(pattern.id!)}
                      className="px-3 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Color Overrides for Multi-URL Mode */}
                {profileMode === 'multi' && keywordGroups.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <h5 className="text-sm font-medium text-gray-700 mb-2">
                      Color Overrides for this URL
                    </h5>

                    {/* Global Text Color Override */}
                    <div className="mb-3 p-2 bg-gray-50 rounded">
                      <label className="flex items-center gap-2 mb-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!pattern.textColorOverrides?.global}
                          onChange={(e) => {
                            if (e.target.checked) {
                              updateUrlPattern(pattern.id!, {
                                textColorOverrides: {
                                  ...pattern.textColorOverrides,
                                  global: '#000000',
                                },
                              })
                            } else {
                              const { ...rest } = pattern.textColorOverrides || {}
                              updateUrlPattern(pattern.id!, {
                                textColorOverrides: Object.keys(rest).length > 0 ? rest : undefined,
                              })
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-sm font-medium">
                          Highlighted Text Color (all keywords)
                        </span>
                      </label>
                      {pattern.textColorOverrides?.global && (
                        <div className="flex gap-2 items-center ml-6">
                          <input
                            type="color"
                            value={pattern.textColorOverrides?.global || '#000000'}
                            onChange={(e) => {
                              updateUrlPattern(pattern.id!, {
                                textColorOverrides: {
                                  ...pattern.textColorOverrides,
                                  global: e.target.value,
                                },
                              })
                            }}
                            className="w-10 h-8 rounded cursor-pointer"
                          />
                          <input
                            type="text"
                            value={pattern.textColorOverrides?.global || '#000000'}
                            onChange={(e) => {
                              const hex = e.target.value.trim()
                              if (/^#[0-9A-F]{6}$/i.test(hex)) {
                                updateUrlPattern(pattern.id!, {
                                  textColorOverrides: {
                                    ...pattern.textColorOverrides,
                                    global: hex,
                                  },
                                })
                              }
                            }}
                            maxLength={7}
                            placeholder="#000000"
                            className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      )}
                      <small className="text-xs text-gray-500 block mt-1 ml-6">
                        Leave unchecked to use default text color
                      </small>
                    </div>

                    {/* Per-Group Background Color Overrides */}
                    <div className="space-y-2">
                      <div className="text-sm text-gray-600 mb-1">
                        Background color overrides per keyword group:
                      </div>
                      {keywordGroups.map((group) => {
                        if (!group.id) return null
                        return (
                          <div key={group.id} className="flex items-center gap-2">
                            <label className="text-sm flex-1">
                              {group.name || `Group ${keywordGroups.indexOf(group) + 1}`}:
                            </label>
                            <input
                              type="color"
                              value={pattern.colorOverrides?.[group.id] || group.color}
                              onChange={(e) => {
                                updateUrlPattern(pattern.id!, {
                                  colorOverrides: {
                                    ...pattern.colorOverrides,
                                    [group.id!]: e.target.value,
                                  },
                                })
                              }}
                              className="w-10 h-8 rounded cursor-pointer"
                            />
                            <input
                              type="text"
                              value={pattern.colorOverrides?.[group.id] || group.color}
                              onChange={(e) => {
                                const hex = e.target.value.trim()
                                if (/^#[0-9A-F]{6}$/i.test(hex)) {
                                  updateUrlPattern(pattern.id!, {
                                    colorOverrides: {
                                      ...pattern.colorOverrides,
                                      [group.id!]: hex,
                                    },
                                  })
                                }
                              }}
                              maxLength={7}
                              placeholder={group.color}
                              className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          {profileMode === 'multi' && (
            <button
              onClick={handleAddUrlPattern}
              className="mt-2 text-sm text-blue-600 hover:text-blue-700"
            >
              + Add URL Pattern
            </button>
          )}
        </div>

        {/* Keyword Groups */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Keyword Groups</label>
            <div className="flex gap-4 text-xs">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={uniqueKeywords}
                  onChange={(e) => setUniqueKeywords(e.target.checked)}
                  className="rounded"
                />
                <span>Unique keywords</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exactCase}
                  onChange={(e) => setExactCase(e.target.checked)}
                  className="rounded"
                />
                <span>Exact case</span>
              </label>
            </div>
          </div>

          <div className="space-y-3">
            {keywordGroups.map((group, index) => (
              <div key={group.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-start gap-2 mb-2">
                  <input
                    type="text"
                    value={group.name}
                    onChange={(e) => handleKeywordGroupChange(group.id!, { name: e.target.value })}
                    placeholder={`Group ${index + 1} name (optional)`}
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <input
                    type="color"
                    value={group.color}
                    onChange={(e) => handleKeywordGroupChange(group.id!, { color: e.target.value })}
                    className="w-10 h-8 rounded cursor-pointer"
                  />
                  {keywordGroups.length > 1 && (
                    <button
                      onClick={() => handleRemoveKeywordGroup(group.id!)}
                      className="px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <textarea
                  value={group.keywords.join(', ')}
                  onChange={(e) => {
                    const keywords = parseKeywords(e.target.value)
                    handleKeywordGroupChange(group.id!, { keywords })
                  }}
                  placeholder="Enter keywords separated by commas, new lines, or forward slashes"
                  rows={3}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="text-xs text-gray-500 mt-1">
                  {group.keywords.length} keyword{group.keywords.length !== 1 ? 's' : ''}
                </div>

                {/* Quick Add Keywords */}
                {availableKeywords[group.id!] && availableKeywords[group.id!].length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="text-xs text-gray-600 mb-2">
                      Quick add (click to add) - {availableKeywords[group.id!].length} available:
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto p-2 bg-gray-50 rounded">
                      {availableKeywords[group.id!].map((keyword, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleQuickAddKeyword(group.id!, keyword)}
                          className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-400 transition-colors"
                        >
                          {keyword}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={handleAddKeywordGroup}
            className="mt-2 px-3 py-1.5 text-sm bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
          >
            + Add Keyword Group
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mt-4">
          <button onClick={handleSave} className="btn btn-primary flex-1">
            {profile ? 'Save Changes' : 'Save Profile'}
          </button>
          {onCancel && (
            <button onClick={onCancel} className="btn btn-secondary">
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Templates Modal */}
      <TemplatesModal
        isOpen={showTemplatesModal}
        onClose={() => setShowTemplatesModal(false)}
        onSelectTemplate={loadTemplate}
      />
    </>
  )
}

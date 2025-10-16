import type { Profile } from '../../types'

interface ProfilesListProps {
  profiles: Profile[]
  onEdit: (profile: Profile) => void
  onDelete: (profileId: string) => void
  onDuplicate: (profile: Profile) => void
}

export default function ProfilesList({
  profiles,
  onEdit,
  onDelete,
  onDuplicate,
}: ProfilesListProps) {
  if (profiles.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
        <p>No profiles saved yet.</p>
        <p className="text-sm mt-2">Add your first profile using the Input tab!</p>
      </div>
    )
  }

  const formatUrlPattern = (profile: Profile): string => {
    if (profile.urlPatterns && profile.urlPatterns.length > 0) {
      const firstPattern = profile.urlPatterns[0].urlPattern
      const pattern = typeof firstPattern === 'string' ? firstPattern : firstPattern[0]
      return profile.urlPatterns.length > 1
        ? `${pattern} +${profile.urlPatterns.length - 1} more`
        : pattern
    }
    return profile.urlPattern || ''
  }

  const getTotalKeywords = (profile: Profile): number => {
    return profile.keywordGroups.reduce((sum, group) => sum + group.keywords.length, 0)
  }

  return (
    <div className="space-y-3">
      {profiles.map((profile) => (
        <div
          key={profile.id}
          className="bg-white rounded-lg shadow-sm border border-gray-200 hover:border-blue-300 transition-colors"
        >
          <div className="p-4">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">
                  {profile.name || `Profile ${profile.id.substring(0, 8)}`}
                </h3>
                <p className="text-xs text-gray-500 mt-1 break-all">{formatUrlPattern(profile)}</p>
              </div>
              <div className="flex gap-1 ml-2">
                <button
                  onClick={() => onEdit(profile)}
                  className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  title="Edit"
                >
                  ✎
                </button>
                <button
                  onClick={() => onDuplicate(profile)}
                  className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                  title="Duplicate"
                >
                  ⧉
                </button>
                <button
                  onClick={() => {
                    if (confirm('Delete this profile?')) {
                      onDelete(profile.id)
                    }
                  }}
                  className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="flex gap-4 text-xs text-gray-600 mb-3">
              <span>
                {profile.keywordGroups.length} group{profile.keywordGroups.length !== 1 ? 's' : ''}
              </span>
              <span>
                {getTotalKeywords(profile)} keyword{getTotalKeywords(profile) !== 1 ? 's' : ''}
              </span>
              {profile.exactCase && <span className="text-blue-600">Exact case</span>}
            </div>

            {/* Keyword Groups Preview */}
            <div className="space-y-2">
              {profile.keywordGroups.map((group, index) => (
                <div key={index} className="text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-4 h-4 rounded border border-gray-300"
                      style={{ backgroundColor: group.color }}
                    />
                    <span className="font-medium text-gray-700">
                      {group.name || `Group ${index + 1}`}
                    </span>
                    <span className="text-gray-500">
                      ({group.keywords.length} keyword{group.keywords.length !== 1 ? 's' : ''})
                    </span>
                  </div>
                  {group.keywords.length > 0 && (
                    <p className="text-gray-600 ml-6 truncate">
                      {group.keywords.slice(0, 5).join(', ')}
                      {group.keywords.length > 5 && ` +${group.keywords.length - 5} more`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

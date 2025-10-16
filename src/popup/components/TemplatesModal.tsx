import { useState } from 'react'
import type { Template } from '../../types'
import { templates } from '../../data/templates'

interface TemplatesModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectTemplate: (template: Template) => void
}

export default function TemplatesModal({ isOpen, onClose, onSelectTemplate }: TemplatesModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (!isOpen) return null

  const handleTemplateClick = (template: Template) => {
    setSelectedId(template.id)
    onSelectTemplate(template)
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900">Choose a Template</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close modal"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((template) => (
                <div
                  key={template.id}
                  onClick={() => handleTemplateClick(template)}
                  className={`cursor-pointer border-2 rounded-lg p-4 transition-all hover:shadow-lg ${
                    selectedId === template.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {/* Template Header */}
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-3xl">{template.icon}</span>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-gray-900">{template.name}</h3>
                      <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                    </div>
                  </div>

                  {/* URL Patterns Preview */}
                  <div className="mb-3">
                    <div className="text-xs font-semibold text-gray-700 mb-1">URL Patterns</div>
                    <div className="space-y-1">
                      {template.urlPatterns.slice(0, 2).map((pattern, idx) => (
                        <div
                          key={idx}
                          className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded truncate"
                        >
                          {typeof pattern.urlPattern === 'string'
                            ? pattern.urlPattern
                            : pattern.urlPattern[0]}
                        </div>
                      ))}
                      {template.urlPatterns.length > 2 && (
                        <div className="text-xs text-gray-500">
                          +{template.urlPatterns.length - 2} more...
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Keyword Groups Preview */}
                  <div>
                    <div className="text-xs font-semibold text-gray-700 mb-1">Keyword Groups</div>
                    <div className="flex flex-wrap gap-1">
                      {template.keywordGroups.map((group, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center px-2 py-1 rounded text-xs font-medium"
                          style={{
                            backgroundColor: `${group.color}20`,
                            border: `1px solid ${group.color}`,
                            color: group.color,
                          }}
                        >
                          {group.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Click hint */}
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="text-xs text-center text-gray-500">
                      Click to use this template
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

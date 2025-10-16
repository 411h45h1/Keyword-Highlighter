import { useState, useEffect } from 'react'
import { parseKeywords } from '../../utils/helpers'

interface KeywordBankProps {
  onKeywordAdd?: (keyword: string) => void
}

export default function KeywordBank({ onKeywordAdd }: KeywordBankProps) {
  const [keywordBankText, setKeywordBankText] = useState('')
  const [processedKeywords, setProcessedKeywords] = useState<string[]>([])
  const [keywordBank, setKeywordBank] = useState<string[]>([])

  useEffect(() => {
    const loadKeywordBank = async () => {
      try {
        const result = await chrome.storage.sync.get(['keywordBank'])
        if (result.keywordBank) {
          setKeywordBank(result.keywordBank)
        }
      } catch (error) {
        console.error('Error loading keyword bank:', error)
      }
    }
    loadKeywordBank()
  }, [])

  const handleProcessKeywords = () => {
    const keywords = parseKeywords(keywordBankText, true)
    setProcessedKeywords(keywords)
  }

  const handleSaveToBank = async () => {
    if (processedKeywords.length === 0) {
      alert('Please process keywords first')
      return
    }

    const updatedBank = [...new Set([...keywordBank, ...processedKeywords])]
    setKeywordBank(updatedBank)

    try {
      await chrome.storage.sync.set({ keywordBank: updatedBank })
      setKeywordBankText('')
      setProcessedKeywords([])
    } catch (error) {
      console.error('Error saving keyword bank:', error)
      alert('Error saving keywords to bank')
    }
  }

  const handleClearBank = async () => {
    if (window.confirm('Are you sure you want to clear the keyword bank?')) {
      setKeywordBank([])
      try {
        await chrome.storage.sync.set({ keywordBank: [] })
      } catch (error) {
        console.error('Error clearing keyword bank:', error)
      }
    }
  }

  const handleRemoveKeyword = async (keyword: string) => {
    const updatedBank = keywordBank.filter((k) => k !== keyword)
    setKeywordBank(updatedBank)
    try {
      await chrome.storage.sync.set({ keywordBank: updatedBank })
    } catch (error) {
      console.error('Error removing keyword:', error)
    }
  }

  const handleKeywordClick = (keyword: string) => {
    if (onKeywordAdd) {
      onKeywordAdd(keyword)
    }
  }

  return (
    <div className="space-y-4">
      {/* Input Section */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <h3 className="text-lg font-semibold mb-3">Process Keywords</h3>
        <p className="text-sm text-gray-600 mb-3">
          Paste keywords separated by commas, newlines, or other delimiters. They'll be parsed and
          ready to add to your bank.
        </p>

        <textarea
          value={keywordBankText}
          onChange={(e) => setKeywordBankText(e.target.value)}
          placeholder="Paste keywords here... (e.g., JavaScript, React, Python)"
          className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />

        <div className="flex gap-2 mt-3">
          <button
            onClick={handleProcessKeywords}
            disabled={!keywordBankText.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Process Keywords
          </button>
          <button
            onClick={() => setKeywordBankText('')}
            disabled={!keywordBankText}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Clear
          </button>
        </div>

        {/* Processed Keywords Preview */}
        {processedKeywords.length > 0 && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-blue-900">
                Processed: {processedKeywords.length} keywords
              </span>
              <button
                onClick={handleSaveToBank}
                className="px-3 py-1 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                Save to Bank
              </button>
            </div>
            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
              {processedKeywords.map((keyword, idx) => (
                <span
                  key={idx}
                  className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Keyword Bank Display */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Keyword Bank ({keywordBank.length})</h3>
          {keywordBank.length > 0 && (
            <button
              onClick={handleClearBank}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              Clear All
            </button>
          )}
        </div>

        {keywordBank.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No keywords in bank yet.</p>
            <p className="text-sm mt-2">Process and save keywords above to build your bank!</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              Click keywords to add them to your current profile (if editing).
            </p>
            <div className="flex flex-wrap gap-2 max-h-96 overflow-y-auto p-2 bg-gray-50 rounded-md">
              {keywordBank.map((keyword, idx) => (
                <div
                  key={idx}
                  className="group relative inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-300 rounded-md hover:border-blue-500 hover:shadow-sm cursor-pointer transition-all"
                  onClick={() => handleKeywordClick(keyword)}
                >
                  <span className="text-sm">{keyword}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveKeyword(keyword)
                    }}
                    className="opacity-0 group-hover:opacity-100 ml-1 text-red-500 hover:text-red-700 transition-opacity"
                    aria-label="Remove keyword"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

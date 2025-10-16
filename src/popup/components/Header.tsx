interface HeaderProps {
  isEnabled: boolean
  onToggle: (enabled: boolean) => void
}

export default function Header({ isEnabled, onToggle }: HeaderProps) {
  return (
    <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 shadow-md">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Keyword Highlighter</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-white opacity-90">Extension</span>
          <label className="relative inline-block w-11 h-6 cursor-pointer">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => onToggle(e.target.checked)}
              className="sr-only"
            />
            <div
              className={`
              absolute inset-0 rounded-full transition-all duration-300 ease-in-out
              ${isEnabled ? 'bg-green-500' : 'bg-white/30'}
            `}
            >
              <div
                className={`
                absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md
                transform transition-transform duration-300 ease-in-out
                ${isEnabled ? 'translate-x-5' : 'translate-x-0'}
              `}
              ></div>
            </div>
          </label>
        </div>
      </div>
    </header>
  )
}

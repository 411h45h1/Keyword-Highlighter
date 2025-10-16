interface HeaderProps {
  isEnabled: boolean
  onToggle: (enabled: boolean) => void
}

export default function Header({ isEnabled, onToggle }: HeaderProps) {
  return (
    <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 shadow-md">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Keyword Highlighter</h1>
        <label className="toggle-switch">
          <input type="checkbox" checked={isEnabled} onChange={(e) => onToggle(e.target.checked)} />
          <span className="slider"></span>
        </label>
      </div>
    </header>
  )
}

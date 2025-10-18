# Keyword Highlighter

A Chrome extension that intelligently highlights keywords on web pages to help with job searching, research, and content analysis.

## Features

- 🎨 Advanced keyword highlighting with customizable colors
- 🔗 URL-pattern-based profiles for site-specific highlighting
- 💾 Keyword bank system for centralized keyword management
- 📋 Pre-built templates for job hunting, data science, marketing, and more
- ⚡ Real-time DOM processing with mutation detection
- 🎯 Dynamic context menus for quick keyword addition

## Getting Started

### Prerequisites

- Node.js (v18+) or [Bun](https://bun.sh)
- Chrome browser

### Installation

1. Clone the repository
2. update package.json if using node/npm
3. Install dependencies:

```bash
bun install
```

### Development Scripts

- **Build the extension:**

  ```bash
  bun run build
  ```

- **Type check:**

  ```bash
  bun run type-check
  ```

- **Lint code:**

  ```bash
  bun run lint
  ```

- **Fix linting issues:**

  ```bash
  bun run lint:fix
  ```

- **Format code:**

  ```bash
  bun run format
  ```

- **Clean setup (install + lint + format + type-check):**

  ```bash
  bun run clean:setup
  ```

- **Clean rebuild:**
  ```bash
  bun run clean:build
  ```

### Loading the Extension

1. Run `bun run build` to create the dist folder
2. Open `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the `dist` folder

## Project Structure

```
src/
├── popup/          # React popup UI
├── content/        # Content script for highlighting
├── background/     # Background service worker
├── types/          # TypeScript type definitions
├── utils/          # Helper functions
└── data/           # Templates and static data
```

## Tech Stack

- **TypeScript** - Type-safe code
- **React** - UI framework
- **Tailwind CSS** - Styling
- **Vite** - Build tool
- **Chrome Extension API** - Browser integration

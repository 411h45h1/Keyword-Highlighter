import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'build-content-script',
      apply: 'build',
      async closeBundle() {
        // Build content script separately as IIFE to avoid module imports
        const contentBuild = await import('vite').then((vite) =>
          vite.build({
            configFile: false,
            build: {
              outDir: 'dist',
              emptyOutDir: false,
              lib: {
                entry: resolve(__dirname, 'src/content/index.ts'),
                name: 'ContentScript',
                formats: ['iife'],
                fileName: () => 'content.js',
              },
              rollupOptions: {
                output: {
                  extend: true,
                },
              },
            },
            define: {
              'process.env': {},
            },
          })
        )
      },
    },
    {
      name: 'build-background-script',
      apply: 'build',
      async closeBundle() {
        // Build background script separately as IIFE to avoid module import issues
        const backgroundBuild = await import('vite').then((vite) =>
          vite.build({
            configFile: false,
            build: {
              outDir: 'dist',
              emptyOutDir: false,
              lib: {
                entry: resolve(__dirname, 'src/background/index.ts'),
                name: 'BackgroundScript',
                formats: ['iife'],
                fileName: () => 'background.js',
              },
              rollupOptions: {
                output: {
                  extend: true,
                },
              },
            },
            define: {
              'process.env': {},
            },
          })
        )
      },
    },
    {
      name: 'copy-files',
      closeBundle() {
        // Copy icons
        const iconsDir = resolve(__dirname, 'dist/icons')
        if (!existsSync(iconsDir)) {
          mkdirSync(iconsDir, { recursive: true })
        }
        const iconFiles = ['icon16.png', 'icon48.png', 'icon128.png']
        iconFiles.forEach((file) => {
          const src = resolve(__dirname, 'icons', file)
          const dest = resolve(__dirname, 'dist/icons', file)
          if (existsSync(src)) {
            copyFileSync(src, dest)
          }
        })

        // Copy and fix popup.html to root
        const popupSrc = resolve(__dirname, 'dist/src/popup/index.html')
        const popupDest = resolve(__dirname, 'dist/popup.html')
        if (existsSync(popupSrc)) {
          let html = readFileSync(popupSrc, 'utf-8')
          html = html.replace(/\.\.\/\.\.\//g, './')
          writeFileSync(popupDest, html)
        }

        // Copy manifest
        const manifestSrc = resolve(__dirname, 'src/manifest.json')
        const manifestDest = resolve(__dirname, 'dist/manifest.json')
        if (existsSync(manifestSrc)) {
          copyFileSync(manifestSrc, manifestDest)
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  define: {
    'process.env': {},
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        // content and background scripts are built separately in the plugins above
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        format: 'es',
      },
    },
  },
})

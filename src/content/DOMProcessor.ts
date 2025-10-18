import { HighlightManager } from './HighlightManager.js'

const CONFIG = {
  MUTATION_DEBOUNCE_TIME: 50,
  MAX_NODES_PER_PROCESS: 2000,
  BATCH_SIZE: 50,
  MAX_ELEMENTS_PER_MUTATION: 100,
} as const

export class DOMProcessor {
  private highlightManager: HighlightManager
  private observer: MutationObserver | null = null
  private mutationDebounceTimer: number | null = null
  private isProcessing = false
  private currentMutationCallback?: (elements: Element[]) => void

  constructor(highlightManager: HighlightManager) {
    this.highlightManager = highlightManager
  }

  setupObserver(onMutationWithElements?: (elements: Element[]) => void): void {
    if (onMutationWithElements) {
      this.currentMutationCallback = onMutationWithElements
    }

    if (this.observer) {
      this.observer.disconnect()
    }

    if (!document || !document.body) {
      console.warn('Document body not available for observer setup')
      return
    }

    try {
      this.observer = new MutationObserver((mutations) => {
        if (this.isProcessing) return

        let shouldProcess = false
        const addedElements: Element[] = []

        for (const mutation of mutations) {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            for (const node of Array.from(mutation.addedNodes)) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node as Element
                if (this.shouldProcessElement(element)) {
                  addedElements.push(element)
                  shouldProcess = true
                }
              } else if (node.nodeType === Node.TEXT_NODE) {
                const parentElement = node.parentElement
                if (parentElement && this.shouldProcessElement(parentElement)) {
                  addedElements.push(parentElement)
                  shouldProcess = true
                }
              }
            }
          } else if (mutation.type === 'characterData') {
            const textNode = mutation.target
            const parentElement = textNode.parentElement
            if (parentElement && this.shouldProcessElement(parentElement)) {
              addedElements.push(parentElement)
              shouldProcess = true
            }
          } else if (mutation.type === 'attributes') {
            const element = mutation.target as Element
            if (this.shouldProcessElement(element)) {
              const attributeName = mutation.attributeName
              if (
                attributeName === 'style' ||
                attributeName === 'class' ||
                attributeName === 'hidden'
              ) {
                addedElements.push(element)
                shouldProcess = true
              }
            }
          }
        }

        if (shouldProcess && addedElements.length > 0) {
          const limitedElements = addedElements.slice(0, CONFIG.MAX_ELEMENTS_PER_MUTATION)
          this.debounceMutation(() => {
            const uniqueElements = Array.from(new Set(limitedElements))
            this.currentMutationCallback?.(uniqueElements)
          })
        }
      })

      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden'],
      })
    } catch (error) {
      console.error('Error setting up DOM observer:', error)
    }
  }

  disconnectObserver(): void {
    if (this.observer) {
      this.observer.disconnect()
    }
  }

  processElements(
    elements: Element[],
    keywordColorMap: Map<string, Array<{ backgroundColor: string; textColor?: string }>>,
    exactCase: boolean
  ): void {
    if (this.isProcessing || elements.length === 0) return

    const uniqueElements = Array.from(new Set(elements))

    this.isProcessing = true
    this.disconnectObserver()

    try {
      for (const element of uniqueElements) {
        this.processElement(element, keywordColorMap, exactCase)
      }
    } finally {
      this.isProcessing = false
      this.setupObserver(this.currentMutationCallback)
    }
  }

  processDocument(
    keywordColorMap: Map<string, Array<{ backgroundColor: string; textColor?: string }>>,
    exactCase: boolean
  ): void {
    if (this.isProcessing || keywordColorMap.size === 0) return

    if (!document || !document.body) {
      console.warn('Document body not available for processing')
      return
    }

    this.isProcessing = true
    this.disconnectObserver()

    try {
      this.processElement(document.body, keywordColorMap, exactCase)
    } catch (error) {
      console.error('Error processing document:', error)
    } finally {
      this.isProcessing = false
      this.setupObserver(this.currentMutationCallback)
    }
  }

  private processElement(
    rootElement: Element,
    keywordColorMap: Map<string, Array<{ backgroundColor: string; textColor?: string }>>,
    exactCase: boolean
  ): void {
    if (!rootElement || !document) {
      console.warn('Invalid element or document for processing')
      return
    }

    try {
      const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          const parent = node.parentNode as Element
          if (!parent) return NodeFilter.FILTER_REJECT

          const tagName = parent.tagName?.toLowerCase()
          const skipTags = ['script', 'style', 'noscript', 'svg', 'canvas', 'iframe']
          if (skipTags.includes(tagName)) return NodeFilter.FILTER_REJECT

          if (parent.classList?.contains('keyword-highlight')) return NodeFilter.FILTER_REJECT
          if (parent.hasAttribute?.('data-highlighted')) return NodeFilter.FILTER_REJECT
          if (parent.hasAttribute?.('contenteditable')) return NodeFilter.FILTER_REJECT

          return NodeFilter.FILTER_ACCEPT
        },
      })

      const textNodes: Text[] = []
      let node: Node | null
      let nodeCount = 0
      const maxNodes = CONFIG.MAX_NODES_PER_PROCESS

      while ((node = walker.nextNode()) && nodeCount < maxNodes) {
        const textContent = node.textContent?.trim()
        if (textContent && textContent.length > 0) {
          textNodes.push(node as Text)
          nodeCount++
        }
      }

      this.processTextNodesBatch(textNodes, keywordColorMap, exactCase)
    } catch (error) {
      console.error('Error highlighting text node:', error)
    }
  }

  private processTextNodesBatch(
    textNodes: Text[],
    keywordColorMap: Map<string, Array<{ backgroundColor: string; textColor?: string }>>,
    exactCase: boolean
  ): void {
    const batchSize = CONFIG.BATCH_SIZE
    let currentIndex = 0

    const processBatch = (): void => {
      const batch = textNodes.slice(currentIndex, currentIndex + batchSize)

      batch.forEach((textNode) => {
        this.highlightManager.highlightTextNode(textNode, keywordColorMap, exactCase)
      })

      currentIndex += batchSize

      if (currentIndex < textNodes.length) {
        requestAnimationFrame(processBatch)
      }
    }

    processBatch()
  }

  private shouldProcessElement(element: Element): boolean {
    if (!element || !element.tagName) return false

    const tagName = element.tagName.toLowerCase()

    const skipTags = [
      'script',
      'style',
      'noscript',
      'svg',
      'canvas',
      'iframe',
      'video',
      'audio',
      'object',
      'embed',
      'applet',
      'map',
      'area',
      'base',
      'link',
      'meta',
      'title',
    ]
    if (skipTags.includes(tagName)) return false

    if (element.hasAttribute('data-highlighted') || element.classList.contains('keyword-highlight'))
      return false

    if (element.hasAttribute('contenteditable')) return false

    if (element.hasAttribute('hidden')) return false

    const computedStyle = window.getComputedStyle(element)
    if (
      computedStyle.display === 'none' ||
      computedStyle.visibility === 'hidden' ||
      computedStyle.opacity === '0'
    ) {
      return false
    }

    const textContent = element.textContent?.trim()
    if (!textContent || textContent.length === 0) {
      return false
    }

    return true
  }

  private debounceMutation(callback: () => void): void {
    if (this.mutationDebounceTimer) {
      clearTimeout(this.mutationDebounceTimer)
    }

    this.mutationDebounceTimer = window.setTimeout(() => {
      callback()
      this.mutationDebounceTimer = null
    }, CONFIG.MUTATION_DEBOUNCE_TIME)
  }
}

import { HighlightManager } from './HighlightManager.js'

export class DOMProcessor {
  private highlightManager: HighlightManager
  private observer: MutationObserver | null = null
  private mutationDebounceTimer: number | null = null
  private isProcessing = false

  constructor(highlightManager: HighlightManager) {
    this.highlightManager = highlightManager
  }

  setupObserver(onMutation?: () => void): void {
    if (this.observer) {
      this.observer.disconnect()
    }

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
            }
          }
        }
      }

      if (shouldProcess && addedElements.length > 0) {
        this.debounceMutation(() => {
          onMutation?.()
        })
      }
    })

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    })
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

    this.isProcessing = true
    this.disconnectObserver()

    try {
      for (const element of elements) {
        this.processElement(element, keywordColorMap, exactCase)
      }
    } finally {
      this.isProcessing = false
      this.setupObserver()
    }
  }

  processDocument(
    keywordColorMap: Map<string, Array<{ backgroundColor: string; textColor?: string }>>,
    exactCase: boolean
  ): void {
    if (this.isProcessing || keywordColorMap.size === 0) return

    this.isProcessing = true
    this.disconnectObserver()

    try {
      this.processElement(document.body, keywordColorMap, exactCase)
    } finally {
      this.isProcessing = false
      this.setupObserver()
    }
  }

  private processElement(
    rootElement: Element,
    keywordColorMap: Map<string, Array<{ backgroundColor: string; textColor?: string }>>,
    exactCase: boolean
  ): void {
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
    const maxNodes = 2000

    while ((node = walker.nextNode()) && nodeCount < maxNodes) {
      const textContent = node.textContent?.trim()
      if (textContent && textContent.length > 0) {
        textNodes.push(node as Text)
        nodeCount++
      }
    }

    this.processTextNodesBatch(textNodes, keywordColorMap, exactCase)
  }

  private processTextNodesBatch(
    textNodes: Text[],
    keywordColorMap: Map<string, Array<{ backgroundColor: string; textColor?: string }>>,
    exactCase: boolean
  ): void {
    const batchSize = 50
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
    const tagName = element.tagName?.toLowerCase()
    const skipTags = ['script', 'style', 'noscript', 'svg', 'canvas', 'iframe']
    if (skipTags.includes(tagName)) return false

    if (element.hasAttribute('data-highlighted') || element.classList.contains('keyword-highlight'))
      return false

    return true
  }

  private debounceMutation(callback: () => void): void {
    if (this.mutationDebounceTimer) {
      clearTimeout(this.mutationDebounceTimer)
    }

    this.mutationDebounceTimer = window.setTimeout(() => {
      callback()
      this.mutationDebounceTimer = null
    }, 100)
  }
}

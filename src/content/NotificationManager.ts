import { StyleManager } from './StyleManager.js'

export class NotificationManager {
  private static readonly NOTIFICATION_ID = 'keyword-highlighter-notification'

  static showNotification(
    message: string,
    type: 'success' | 'error' | 'info' = 'success',
    details = ''
  ): void {
    StyleManager.injectNotificationStyles()

    const existingNotification = document.getElementById(this.NOTIFICATION_ID)
    if (existingNotification) {
      existingNotification.remove()
    }

    const notification = document.createElement('div')
    notification.id = this.NOTIFICATION_ID
    notification.className = `keyword-notification keyword-notification-${type}`

    const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'

    notification.innerHTML = `
      <div class="keyword-notification-icon">${icon}</div>
      <div class="keyword-notification-content">
        <div class="keyword-notification-message">${message}</div>
        ${details ? `<div class="keyword-notification-details">${details}</div>` : ''}
      </div>
    `

    document.body.appendChild(notification)

    // Show with animation
    setTimeout(() => {
      notification.classList.add('show')
    }, 10)

    // Auto-hide after 3 seconds
    setTimeout(() => {
      notification.classList.remove('show')
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification)
        }
      }, 300)
    }, 3000)
  }

  static showHighlightRefreshFeedback(): void {
    if (!document || !document.querySelectorAll) {
      console.warn('Document not available for highlight refresh feedback')
      return
    }

    try {
      StyleManager.injectFlashStyles()

      const highlightedElements = document.querySelectorAll('.keyword-highlight')

      if (highlightedElements.length > 0) {
        highlightedElements.forEach((element) => {
          element.classList.add('keyword-highlight-flash')
          setTimeout(() => {
            element.classList.remove('keyword-highlight-flash')
          }, 600)
        })
      }
    } catch (error) {
      console.error('Error showing highlight refresh feedback:', error)
    }
  }
}

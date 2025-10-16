export class StyleManager {
  private static readonly BASE_STYLES_ID = 'keyword-highlight-base-styles'
  private static readonly FLASH_STYLES_ID = 'keyword-highlight-flash-styles'
  private static readonly NOTIFICATION_STYLES_ID = 'keyword-notification-styles'

  static injectBaseStyles(): void {
    if (document.getElementById(this.BASE_STYLES_ID)) return

    const style = document.createElement('style')
    style.id = this.BASE_STYLES_ID
    style.textContent = `
      .keyword-highlight {
        padding: 1px 2px;
        border-radius: 2px;
        font-family: inherit !important;
        font-size: inherit !important;
        font-weight: inherit !important;
        line-height: inherit !important;
        letter-spacing: inherit !important;
        text-transform: inherit !important;
        font-style: inherit !important;
        text-decoration: inherit !important;
      }
      
      mark.keyword-highlight {
        font-family: inherit !important;
        font-size: inherit !important;
        font-weight: inherit !important;
        line-height: inherit !important;
        letter-spacing: inherit !important;
        text-transform: inherit !important;
        font-style: inherit !important;
        text-decoration: inherit !important;
      }
    `
    document.head.appendChild(style)
  }

  static injectFlashStyles(): void {
    if (document.getElementById(this.FLASH_STYLES_ID)) return

    const style = document.createElement('style')
    style.id = this.FLASH_STYLES_ID
    style.textContent = `
      .keyword-highlight-flash {
        animation: keyword-highlight-flash 0.6s ease-out !important;
      }
      
      @keyframes keyword-highlight-flash {
        0% {
          box-shadow: 0 0 0 2px #4CAF50 !important;
          transform: scale(1) !important;
        }
        50% {
          box-shadow: 0 0 8px 4px rgba(76, 175, 80, 0.4) !important;
          transform: scale(1.02) !important;
        }
        100% {
          box-shadow: 0 0 0 0 rgba(76, 175, 80, 0) !important;
          transform: scale(1) !important;
        }
      }
    `
    document.head.appendChild(style)
  }

  static injectNotificationStyles(): void {
    if (document.getElementById(this.NOTIFICATION_STYLES_ID)) return

    const style = document.createElement('style')
    style.id = this.NOTIFICATION_STYLES_ID
    style.textContent = `
      .keyword-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 12px 16px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        max-width: 300px;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        display: flex;
        align-items: flex-start;
        gap: 8px;
        transform: translateX(100%);
        transition: transform 0.3s ease;
      }
      
      .keyword-notification.show {
        transform: translateX(0);
      }
      
      .keyword-notification-icon {
        font-size: 16px;
        font-weight: bold;
        margin-top: 1px;
      }
      
      .keyword-notification-content {
        flex: 1;
      }
      
      .keyword-notification-message {
        font-weight: 500;
        margin-bottom: 4px;
      }
      
      .keyword-notification-details {
        font-size: 12px;
        color: #666;
      }
      
      .keyword-notification-success {
        border-left: 4px solid #4CAF50;
      }
      
      .keyword-notification-success .keyword-notification-icon {
        color: #4CAF50;
      }
      
      .keyword-notification-error {
        border-left: 4px solid #f44336;
      }
      
      .keyword-notification-error .keyword-notification-icon {
        color: #f44336;
      }
      
      .keyword-notification-info {
        border-left: 4px solid #2196F3;
      }
      
      .keyword-notification-info .keyword-notification-icon {
        color: #2196F3;
      }
    `
    document.head.appendChild(style)
  }
}

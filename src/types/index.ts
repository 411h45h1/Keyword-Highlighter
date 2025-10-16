export interface KeywordGroup {
  id?: string
  name: string
  keywords: string[]
  color: string
  textColor?: string
}

export interface UrlPattern {
  id?: string
  name?: string
  urlPattern: string | string[]
  color?: string
  textColor?: string
  colorOverrides?: Record<string, string> // Map of group IDs to override background colors
  textColorOverrides?: Record<string, string> // Map of group IDs to override text colors (or "global" for all)
}

export interface Profile {
  id: string
  name?: string
  urlPattern?: string
  urlPatterns?: UrlPattern[]
  keywordGroups: KeywordGroup[]
  uniqueKeywords?: boolean
  exactCase?: boolean
}

export interface StorageData {
  extensionEnabled: boolean
  profiles: Profile[]
  keywordBank: string[]
}

export type MessageAction =
  | 'updateProfiles'
  | 'toggleExtension'
  | 'showNotification'
  | 'forceHighlightRefresh'
  | 'updateContextMenus'

export interface ChromeMessage {
  action: MessageAction
  data?: unknown
  message?: string
  type?: 'success' | 'error' | 'info'
  details?: string
}

export interface NotificationOptions {
  message: string
  type?: 'success' | 'error' | 'info'
  details?: string
}

export interface KeywordColorMap {
  // Map of lowercase keyword to array of color entries (color or color|textColor)
  [key: string]: string[]
}

export interface ProfileSignatureData {
  keywordColorMap: KeywordColorMap
  exactCase: boolean
}

export interface Template {
  id: string
  name: string
  description: string
  icon: string
  urlPatterns: UrlPattern[]
  keywordGroups: KeywordGroup[]
}

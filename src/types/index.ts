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
  colorOverrides?: Record<string, string>
  textColorOverrides?: Record<string, string>
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

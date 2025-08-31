class BackgroundService {
  constructor() {
    this.updateContextMenusTimeout = null;
    this.isUpdatingContextMenus = false;
    this.init();
  }

  init() {
    chrome.tabs.onUpdated.addListener(this.handleTabUpdate.bind(this));
    chrome.tabs.onActivated.addListener(this.handleTabActivated.bind(this));
    chrome.runtime.onInstalled.addListener(this.handleInstalled.bind(this));
    chrome.contextMenus.onClicked.addListener(
      this.handleContextMenuClick.bind(this)
    );
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
  }

  handleTabUpdate(tabId, changeInfo, tab) {
    if (changeInfo.status === "complete" && tab.url) {
      this.processTab(tabId, tab.url);
    }
  }

  handleTabActivated(activeInfo) {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
      if (tab.url && tab.status === "complete") {
        this.processTab(tab.id, tab.url);
        this.updateContextMenus(tab.url);
      }
    });
  }

  async processTab(tabId, url) {
    try {
      const result = await chrome.storage.sync.get(["extensionEnabled"]);
      const isEnabled = result.extensionEnabled !== false;

      if (!isEnabled) {
        await this.hideContextMenus();
        return;
      }

      if (!this.shouldProcessUrl(url)) {
        await this.hideContextMenus();
        return;
      }

      this.updateContextMenus(url);

      chrome.tabs.sendMessage(tabId, {
        action: "updateProfiles",
      });
    } catch (error) {}
  }

  shouldProcessUrl(url) {
    const skipPatterns = [
      "chrome://",
      "chrome-extension://",
      "moz-extension://",
      "edge://",
      "about:",
    ];

    return !skipPatterns.some((pattern) => url.startsWith(pattern));
  }

  handleInstalled(details) {
    if (details.reason === "install") {
      chrome.storage.sync.set({
        extensionEnabled: true,
        profiles: [],
        keywordBank: [],
      });
    } else if (details.reason === "update") {
      chrome.storage.sync.get(["keywordBank"], (result) => {
        if (!result.keywordBank) {
          chrome.storage.sync.set({ keywordBank: [] });
        }
      });
    }

    this.createContextMenus();

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].url) {
        this.updateContextMenus(tabs[0].url);
      }
    });
  }

  async createContextMenus() {
    try {
      await chrome.contextMenus.removeAll();

      await new Promise((resolve) => setTimeout(resolve, 10));

      chrome.contextMenus.create(
        {
          id: "quick-add-keyword",
          title: "Add '%s' to keyword group",
          contexts: ["selection"],
          visible: false,
        },
        () => {
          if (chrome.runtime.lastError) {
          } else {
          }
        }
      );
    } catch (error) {}
  }

  async updateContextMenus(currentUrl) {
    if (this.isUpdatingContextMenus) {
      return;
    }

    if (this.updateContextMenusTimeout) {
      clearTimeout(this.updateContextMenusTimeout);
    }

    this.updateContextMenusTimeout = setTimeout(async () => {
      await this.performContextMenuUpdate(currentUrl);
    }, 100);
  }

  async performContextMenuUpdate(currentUrl) {
    if (this.isUpdatingContextMenus) {
      return;
    }

    this.isUpdatingContextMenus = true;

    try {
      const result = await chrome.storage.sync.get([
        "profiles",
        "extensionEnabled",
      ]);
      const profiles = result.profiles || [];
      const isEnabled = result.extensionEnabled !== false;

      if (!isEnabled) {
        await this.hideContextMenus();
        return;
      }

      const matchingProfiles = this.findMatchingProfiles(profiles, currentUrl);

      if (matchingProfiles.length > 0) {
        await this.showContextMenusForProfiles(matchingProfiles);
      } else {
        await this.hideContextMenus();
      }
    } catch (error) {
    } finally {
      this.isUpdatingContextMenus = false;
    }
  }

  findMatchingProfiles(profiles, currentUrl) {
    const matchingProfiles = [];

    for (const profile of profiles) {
      let matches = false;

      if (profile.urlPatterns && Array.isArray(profile.urlPatterns)) {
        for (const urlPattern of profile.urlPatterns) {
          const patterns = Array.isArray(urlPattern.urlPattern)
            ? urlPattern.urlPattern
            : [urlPattern.urlPattern || urlPattern];

          for (const pattern of patterns) {
            if (this.urlMatches(currentUrl, pattern)) {
              matches = true;
              break;
            }
          }

          if (matches) break;
        }
      } else if (profile.urlPattern) {
        matches = this.urlMatches(currentUrl, profile.urlPattern);
        if (matches) {
        }
      }

      if (matches) {
        matchingProfiles.push(profile);
      }
    }
    return matchingProfiles;
  }

  urlMatches(url, pattern) {
    if (!pattern || !url) {
      return false;
    }

    if (pattern.endsWith("*")) {
      const basePattern = pattern.slice(0, -1);
      const matches = url.startsWith(basePattern);
      return matches;
    }

    if (pattern.startsWith("*")) {
      const endPattern = pattern.slice(1);
      const matches = url.endsWith(endPattern);
      return matches;
    }

    if (pattern.includes("*")) {
      const regex = new RegExp(pattern.replace(/\*/g, ".*"));
      const matches = regex.test(url);
      return matches;
    }

    const matches = url === pattern;

    return matches;
  }

  async showContextMenusForProfiles(matchingProfiles) {
    try {
      await chrome.contextMenus.removeAll();

      await new Promise((resolve) => setTimeout(resolve, 10));

      const mainMenuId = chrome.contextMenus.create(
        {
          id: "quick-add-keyword",
          title: "Add '%s' to keyword group",
          contexts: ["selection"],
        },
        () => {
          if (chrome.runtime.lastError) {
          } else {
          }
        }
      );

      for (const profile of matchingProfiles) {
        const profileId = `profile-${profile.id}`;
        const profileMenuId = chrome.contextMenus.create(
          {
            id: profileId,
            parentId: "quick-add-keyword",
            title: profile.name || `Profile ${profile.id}`,
            contexts: ["selection"],
          },
          () => {
            if (chrome.runtime.lastError) {
            } else {
            }
          }
        );

        if (profile.keywordGroups && Array.isArray(profile.keywordGroups)) {
          profile.keywordGroups.forEach((group, index) => {
            const groupId = `${profileId}-group-${index}`;
            const groupName = group.name || `Group ${index + 1}`;
            const groupMenuId = chrome.contextMenus.create(
              {
                id: groupId,
                parentId: profileId,
                title: groupName,
                contexts: ["selection"],
              },
              () => {
                if (chrome.runtime.lastError) {
                } else {
                }
              }
            );
          });
        } else {
        }
      }
    } catch (error) {}
  }

  async hideContextMenus() {
    try {
      await chrome.contextMenus.removeAll();
    } catch (error) {}
  }

  async handleContextMenuClick(info, tab) {
    try {
      const selectedText = info.selectionText?.trim();

      if (!selectedText) {
        return;
      }

      const menuId = info.menuItemId;

      if (typeof menuId === "string" && menuId.includes("-group-")) {
        const parts = menuId.split("-");
        const profileId = parts[1];
        const groupIndex = parseInt(parts[3], 10);
        const result = await this.addKeywordToGroup(
          profileId,
          groupIndex,
          selectedText
        );

        chrome.tabs
          .sendMessage(tab.id, {
            action: "updateProfiles",
          })
          .then(() => {})
          .catch(() => {});

        chrome.tabs
          .sendMessage(tab.id, {
            action: "showNotification",
            message: `Keyword "${selectedText}" added successfully!`,
            type: "success",
            details: "Highlights will appear automatically.",
          })
          .catch(() => {});
      } else {
      }
    } catch (error) {
      chrome.tabs
        .sendMessage(tab.id, {
          action: "showNotification",
          message: "Error adding keyword to group",
          type: "error",
          details: error.message,
        })
        .catch(() => {});
    }
  }

  async addKeywordToGroup(profileId, groupIndex, keywordText) {
    try {
      const result = await chrome.storage.sync.get(["profiles"]);
      const profiles = result.profiles || [];

      const profileIndex = profiles.findIndex((p) => p.id === profileId);
      if (profileIndex === -1) {
        throw new Error("Profile not found");
      }

      const profile = profiles[profileIndex];

      if (!profile.keywordGroups || !Array.isArray(profile.keywordGroups)) {
        throw new Error("Profile does not have keyword groups");
      }

      if (groupIndex >= profile.keywordGroups.length) {
        throw new Error("Group index out of range");
      }

      const group = profile.keywordGroups[groupIndex];

      if (!group.keywords) {
        group.keywords = [];
      }

      const keywords = keywordText
        .split(/[,;\n\r\t|]+/)
        .map((k) => k.trim())
        .filter((k) => k.length > 0 && /\S/.test(k))
        .flatMap((k) => {
          if (k.includes("/")) {
            if (/\w\/\w/.test(k)) {
              return [k];
            } else {
              return k
                .split("/")
                .map((part) => part.trim())
                .filter((part) => part.length > 0);
            }
          }

          return k
            .split(/\s{2,}/)
            .map((word) => word.trim())
            .filter((word) => word.length > 0);
        })
        .filter((keyword, index, array) => array.indexOf(keyword) === index);
      const addedKeywords = [];
      const existingKeywords = [];

      for (const keyword of keywords) {
        const normalizedKeyword = keyword.toLowerCase().trim();
        const existingKeyword = group.keywords.find(
          (k) => k.toLowerCase().trim() === normalizedKeyword
        );

        if (!existingKeyword) {
          group.keywords.push(keyword);
          addedKeywords.push(keyword);
        } else {
          existingKeywords.push(keyword);
        }
      }

      if (addedKeywords.length > 0) {
        await chrome.storage.sync.set({ profiles });
      }

      if (addedKeywords.length > 0 && existingKeywords.length === 0) {
        const keywordList =
          addedKeywords.length === 1
            ? `"${addedKeywords[0]}"`
            : `${addedKeywords.length} keywords: ${addedKeywords
                .map((k) => `"${k}"`)
                .join(", ")}`;

        return {
          type: "success",
          message: `Added ${keywordList} to keyword group`,
          details: `Profile: ${profile.name || profileId} • Group: ${
            group.name || `Group ${groupIndex + 1}`
          }`,
        };
      } else if (addedKeywords.length > 0 && existingKeywords.length > 0) {
        return {
          type: "success",
          message: `Added ${addedKeywords.length} new keyword${
            addedKeywords.length === 1 ? "" : "s"
          }. ${existingKeywords.length} already existed`,
          details: `Added: ${addedKeywords.join(
            ", "
          )} • Skipped: ${existingKeywords.join(", ")}`,
        };
      } else {
        const keywordList =
          existingKeywords.length === 1
            ? `"${existingKeywords[0]}"`
            : `All ${existingKeywords.length} keywords`;

        return {
          type: "info",
          message: `${keywordList} already exist${
            existingKeywords.length === 1 ? "s" : ""
          } in this group`,
          details: `No changes made • Profile: ${
            profile.name || profileId
          } • Group: ${group.name || `Group ${groupIndex + 1}`}`,
        };
      }
    } catch (error) {
      throw error;
    }
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case "updateContextMenus":
          if (request.url) {
            await this.updateContextMenus(request.url);
          }
          break;
        default:
          break;
      }
    } catch (error) {}
    return true;
  }
}

const backgroundService = new BackgroundService();

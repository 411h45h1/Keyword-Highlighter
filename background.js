class BackgroundService {
  constructor() {
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
    console.log("Extension: Tab updated:", {
      tabId,
      status: changeInfo.status,
      url: tab.url,
    });
    if (changeInfo.status === "complete" && tab.url) {
      this.processTab(tabId, tab.url);
    }
  }

  handleTabActivated(activeInfo) {
    console.log("Extension: Tab activated:", activeInfo.tabId);
    chrome.tabs.get(activeInfo.tabId, (tab) => {
      if (chrome.runtime.lastError) {
        console.log(
          "Extension: Error getting tab info:",
          chrome.runtime.lastError.message
        );
        return;
      }

      console.log("Extension: Tab info:", { url: tab.url, status: tab.status });
      if (tab.url && tab.status === "complete") {
        this.processTab(tab.id, tab.url);
        this.updateContextMenus(tab.url);
      }
    });
  }

  async processTab(tabId, url) {
    console.log("Extension: Processing tab:", { tabId, url });
    try {
      const result = await chrome.storage.sync.get(["extensionEnabled"]);
      const isEnabled = result.extensionEnabled !== false;

      console.log("Extension: Enabled status:", isEnabled);

      if (!isEnabled) {
        console.log("Extension: Extension disabled, skipping tab processing");
        await this.hideContextMenus();
        return;
      }

      if (!this.shouldProcessUrl(url)) {
        console.log("Extension: URL should not be processed:", url);
        await this.hideContextMenus();
        return;
      }

      this.updateContextMenus(url);

      chrome.tabs
        .sendMessage(tabId, {
          action: "updateProfiles",
        })
        .catch(() => {
          console.log("Extension: Content script not ready for tab:", tabId);
        });
    } catch (error) {
      console.error("Error processing tab:", error);
    }
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
    console.log("Extension: Installation event:", details.reason);
    if (details.reason === "install") {
      console.log("Extension: First install, setting default settings");
      chrome.storage.sync.set({
        extensionEnabled: true,
        profiles: [],
        keywordBank: [],
      });
    } else if (details.reason === "update") {
      console.log("Extension: Updated, ensuring keywordBank exists");
      chrome.storage.sync.get(["keywordBank"], (result) => {
        if (!result.keywordBank) {
          chrome.storage.sync.set({ keywordBank: [] });
        }
      });
    }

    this.createContextMenus();

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].url) {
        console.log(
          "Extension: Updating context menus for current tab:",
          tabs[0].url
        );
        this.updateContextMenus(tabs[0].url);
      }
    });
  }

  async createContextMenus() {
    try {
      await chrome.contextMenus.removeAll();

      chrome.contextMenus.create({
        id: "quick-add-keyword",
        title: "Add '%s' to keyword group",
        contexts: ["selection"],
        visible: false,
      });

      console.log("Context menus created successfully");
    } catch (error) {
      console.error("Error creating context menus:", error);
    }
  }

  async updateContextMenus(currentUrl) {
    console.log("Extension: Updating context menus for URL:", currentUrl);
    try {
      const result = await chrome.storage.sync.get([
        "profiles",
        "extensionEnabled",
      ]);
      const profiles = result.profiles || [];
      const isEnabled = result.extensionEnabled !== false;

      console.log("Extension: Extension enabled:", isEnabled);
      console.log("Extension: Total profiles:", profiles.length);

      if (!isEnabled) {
        console.log("Extension: Extension disabled, hiding context menus");
        await this.hideContextMenus();
        return;
      }

      const matchingProfiles = this.findMatchingProfiles(profiles, currentUrl);

      if (matchingProfiles.length > 0) {
        console.log("Extension: Showing context menus for matching profiles");
        await this.showContextMenusForProfiles(matchingProfiles);
      } else {
        console.log("Extension: No matching profiles, hiding context menus");
        await this.hideContextMenus();
      }
    } catch (error) {
      console.error("Error updating context menus:", error);
    }
  }

  findMatchingProfiles(profiles, currentUrl) {
    console.log("Extension: Finding matching profiles for URL:", currentUrl);
    const matchingProfiles = [];

    for (const profile of profiles) {
      let matches = false;

      if (profile.urlPatterns && Array.isArray(profile.urlPatterns)) {
        for (const urlPattern of profile.urlPatterns) {
          const pattern = urlPattern.urlPattern || urlPattern;
          console.log(`Extension: Testing pattern "${pattern}" against URL`);
          if (this.urlMatches(currentUrl, pattern)) {
            console.log(`Extension: ✓ Pattern "${pattern}" matches!`);
            matches = true;
            break;
          }
        }
      } else if (profile.urlPattern) {
        console.log(
          `Extension: Testing legacy pattern "${profile.urlPattern}" against URL`
        );
        matches = this.urlMatches(currentUrl, profile.urlPattern);
        if (matches) {
          console.log(
            `Extension: ✓ Legacy pattern "${profile.urlPattern}" matches!`
          );
        }
      }

      if (matches) {
        matchingProfiles.push(profile);
        console.log(
          `Extension: Profile "${
            profile.name || profile.id
          }" added to matching profiles`
        );
      }
    }

    console.log(
      `Extension: Found ${matchingProfiles.length} matching profiles`
    );
    return matchingProfiles;
  }

  urlMatches(url, pattern) {
    console.log(
      `Extension: Matching URL "${url}" against pattern "${pattern}"`
    );

    if (!pattern || !url) {
      console.log("Extension: URL or pattern is empty");
      return false;
    }

    if (pattern.endsWith("*")) {
      const basePattern = pattern.slice(0, -1);
      const matches = url.startsWith(basePattern);
      console.log(
        `Extension: Wildcard match: ${matches} (base: "${basePattern}")`
      );
      return matches;
    }

    if (pattern.startsWith("*")) {
      const endPattern = pattern.slice(1);
      const matches = url.endsWith(endPattern);
      console.log(
        `Extension: End wildcard match: ${matches} (end: "${endPattern}")`
      );
      return matches;
    }

    if (pattern.includes("*")) {
      const regex = new RegExp(pattern.replace(/\*/g, ".*"));
      const matches = regex.test(url);
      console.log(
        `Extension: Regex wildcard match: ${matches} (regex: ${regex})`
      );
      return matches;
    }

    const matches = url === pattern;
    console.log(`Extension: Exact match: ${matches}`);
    return matches;
  }

  async showContextMenusForProfiles(matchingProfiles) {
    console.log(
      "Extension: Creating context menus for profiles:",
      matchingProfiles.map((p) => p.name || p.id)
    );
    try {
      await chrome.contextMenus.removeAll();

      const mainMenuId = chrome.contextMenus.create({
        id: "quick-add-keyword",
        title: "Add '%s' to keyword group",
        contexts: ["selection"],
      });
      console.log("Extension: Created main context menu item:", mainMenuId);

      for (const profile of matchingProfiles) {
        const profileId = `profile-${profile.id}`;
        const profileMenuId = chrome.contextMenus.create({
          id: profileId,
          parentId: "quick-add-keyword",
          title: profile.name || `Profile ${profile.id}`,
          contexts: ["selection"],
        });
        console.log(
          `Extension: Created profile menu for "${
            profile.name || profile.id
          }":`,
          profileMenuId
        );

        if (profile.keywordGroups && Array.isArray(profile.keywordGroups)) {
          profile.keywordGroups.forEach((group, index) => {
            const groupId = `${profileId}-group-${index}`;
            const groupName = group.name || `Group ${index + 1}`;
            const groupMenuId = chrome.contextMenus.create({
              id: groupId,
              parentId: profileId,
              title: groupName,
              contexts: ["selection"],
            });
            console.log(
              `Extension: Created group menu "${groupName}":`,
              groupMenuId
            );
          });
        } else {
          console.log(
            `Extension: Profile "${
              profile.name || profile.id
            }" has no keyword groups`
          );
        }
      }
    } catch (error) {
      console.error("Error showing context menus:", error);
    }
  }

  async hideContextMenus() {
    try {
      await chrome.contextMenus.removeAll();
    } catch (error) {
      console.error("Error hiding context menus:", error);
    }
  }

  async handleContextMenuClick(info, tab) {
    console.log("Extension: Context menu clicked!", { info, tab: tab.url });
    try {
      const selectedText = info.selectionText?.trim();
      console.log("Extension: Selected text:", selectedText);

      if (!selectedText) {
        console.log("Extension: No text selected, ignoring click");
        return;
      }

      const menuId = info.menuItemId;
      console.log("Extension: Menu ID clicked:", menuId);

      if (typeof menuId === "string" && menuId.includes("-group-")) {
        const parts = menuId.split("-");
        const profileId = parts[1];
        const groupIndex = parseInt(parts[3], 10);

        console.log("Extension: Parsed menu click:", {
          profileId,
          groupIndex,
          selectedText,
        });

        const result = await this.addKeywordToGroup(
          profileId,
          groupIndex,
          selectedText
        );
        console.log("Extension: Add keyword result:", result);

        chrome.tabs
          .sendMessage(tab.id, {
            action: "updateProfiles",
          })
          .then(() => {
            console.log("Extension: Successfully sent updateProfiles message");
          })
          .catch(() => {
            console.log("Extension: Failed to send updateProfiles message");
          });

        chrome.tabs
          .sendMessage(tab.id, {
            action: "showNotification",
            message: `Keyword "${selectedText}" added successfully!`,
            type: "success",
            details: "Highlights will appear automatically.",
          })
          .catch(() => {
            console.log("Extension: Failed to send showNotification message");
          });
      } else {
        console.log(
          "Extension: Menu ID doesn't match expected pattern:",
          menuId
        );
      }
    } catch (error) {
      console.error("Error handling context menu click:", error);

      chrome.tabs
        .sendMessage(tab.id, {
          action: "showNotification",
          message: "Error adding keyword to group",
          type: "error",
          details: error.message,
        })
        .catch(() => {
          console.log("Extension: Failed to send error notification");
        });
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
        .split(/[,;\/\n]+/)
        .map((k) => k.trim())
        .filter((k) => k.length > 0 && /\S/.test(k));

      console.log(
        `Extension: Parsed ${keywords.length} keywords from "${keywordText}":`,
        keywords
      );

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
          console.log(
            `Extension: Added keyword "${keyword}" to profile ${profileId}, group ${groupIndex}`
          );
        } else {
          existingKeywords.push(keyword);
          console.log(
            `Extension: Keyword "${keyword}" already exists in the group (existing: "${existingKeyword}")`
          );
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
      console.error("Error adding keywords to group:", error);
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
    } catch (error) {
      console.error("Error handling message:", error);
    }
    return true;
  }
}

console.log("Extension: Background script loading...");
const backgroundService = new BackgroundService();
console.log("Extension: Background service initialized");

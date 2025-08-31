class KeywordHighlighter {
  constructor() {
    this.profiles = [];
    this.isEnabled = true;
    this.highlightedElements = new Set();
    this.observer = null;
    this.lastProfileSignature = null;
    this.regexCache = new Map();
    this.init();
  }

  log(...args) {
  }

  logError(...args) {
  }

  async init() {
    await this.loadSettings();
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    this.setupDOMObserver();
    this.setupUrlChangeDetection();

    if (this.isEnabled) {
      this.highlightPage();
      const profiles = this.findAllMatchingProfiles();
      this.lastProfileSignature = this.getProfilesSignature(profiles);
    } else {
    }

    this.notifyUrlChange();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get([
        "profiles",
        "extensionEnabled",
      ]);

      this.profiles = Array.isArray(result.profiles) ? result.profiles : [];
      this.isEnabled = result.extensionEnabled !== false;
    } catch (error) {
      this.profiles = [];
      this.isEnabled = true;
    }

    if (!Array.isArray(this.profiles)) {
      this.profiles = [];
    }
  }

  handleMessage(request, sender, sendResponse) {
    switch (request.action) {
      case "updateProfiles":
        this.handleUpdateProfiles();
        break;
      case "toggleExtension":
        this.handleToggleExtension(request.enabled);
        break;
      case "showNotification":
        this.showNotification(request.message, request.type, request.details);
        break;
      case "debugInfo":
        const matchingProfiles = this.findAllMatchingProfiles();

        this.profiles?.forEach((profile, index) => {
          console.log(`Profile ${index} URL test:`, {
            name: profile.name || profile.id,
            urlPatterns: profile.urlPatterns
              ?.map((up) =>
                Array.isArray(up.urlPattern) ? up.urlPattern : [up.urlPattern]
              )
              .flat() || [profile.urlPattern],
            matches: this.testProfileUrlMatch(profile),
          });
        });

        sendResponse({
          enabled: this.isEnabled,
          profilesCount: this.profiles?.length || 0,
          currentUrl: window.location.href,
          matchingProfiles: matchingProfiles.length,
          highlightedCount: this.highlightedElements.size,
        });
        break;
    }
    return true;
  }

  async handleUpdateProfiles() {
    await this.loadSettings();

    if (!this.isEnabled) {
      return;
    }

    const newProfiles = this.findAllMatchingProfiles();
    const newSig = this.getProfilesSignature(newProfiles);
    if (newSig === this.lastProfileSignature) {
      this.highlightNewContent();
      return;
    }

    if (this.lastProfileSignature) {
      this.clearHighlights();
    }

    if (newProfiles.length > 0) {
      this.highlightPage();
    } else {
    }

    this.lastProfileSignature = newSig || null;
  }

  async handleForceHighlightRefresh() {
    await this.loadSettings();

    if (!this.isEnabled) {
      return;
    }

    this.clearHighlights();

    const matchingProfiles = this.findAllMatchingProfiles();

    if (matchingProfiles.length > 0) {
      this.highlightPage();

      this.lastProfileSignature = this.getProfilesSignature(matchingProfiles);

      this.showHighlightRefreshFeedback();
    } else {
      this.lastProfileSignature = null;
    }
  }

  showHighlightRefreshFeedback() {
    this.injectFlashEffectCSS();

    const highlightedElements = document.querySelectorAll(".keyword-highlight");

    if (highlightedElements.length > 0) {
      highlightedElements.forEach((element) => {
        element.classList.add("keyword-highlight-flash");
      });

      setTimeout(() => {
        highlightedElements.forEach((element) => {
          element.classList.remove("keyword-highlight-flash");
        });
      }, 600);
    }
  }

  injectFlashEffectCSS() {
    const flashCSSId = "keyword-highlight-flash-styles";

    if (document.getElementById(flashCSSId)) {
      return;
    }

    const style = document.createElement("style");
    style.id = flashCSSId;
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
    `;

    document.head.appendChild(style);
  }

  getProfilesSignature(profiles) {
    if (!profiles || profiles.length === 0) return null;

    return profiles
      .map((profile) => this.getProfileSignature(profile))
      .sort()
      .join("||");
  }

  testProfileUrlMatch(profile) {
    const currentUrl = window.location.href;

    if (profile.urlPatterns && Array.isArray(profile.urlPatterns)) {
      return profile.urlPatterns.some((urlPattern) => {
        const patterns = Array.isArray(urlPattern.urlPattern)
          ? urlPattern.urlPattern
          : [urlPattern.urlPattern];

        return patterns.some((pattern) => this.urlMatches(currentUrl, pattern));
      });
    } else if (profile.urlPattern) {
      return this.urlMatches(currentUrl, profile.urlPattern);
    }

    return false;
  }

  handleToggleExtension(enabled) {
    this.isEnabled = enabled;
    if (enabled) {
      if (!this.profiles || !Array.isArray(this.profiles)) {
        this.loadSettings()
          .then(() => {
            this.highlightPage();
            const profiles = this.findAllMatchingProfiles();
            this.lastProfileSignature = this.getProfilesSignature(profiles);
          })
          .catch((error) => {
          });
      } else {
        this.highlightPage();
        const profiles = this.findAllMatchingProfiles();
        this.lastProfileSignature = this.getProfilesSignature(profiles);
      }
    } else {
      this.clearHighlights();
      this.lastProfileSignature = null;
    }
  }

  setupDOMObserver() {
    if (this.observer) {
      this.observer.disconnect();
    }

    this.observer = new MutationObserver((mutations) => {
      if (!this.isEnabled) return;

      let shouldRehighlight = false;
      for (const mutation of mutations) {
        if (
          mutation.type === "childList" &&
          mutation.addedNodes &&
          mutation.addedNodes.length > 0
        ) {
          for (const node of mutation.addedNodes) {
            if (
              node.nodeType === Node.TEXT_NODE ||
              (node.nodeType === Node.ELEMENT_NODE && node.textContent.trim())
            ) {
              shouldRehighlight = true;
              break;
            }
          }
        }
        if (shouldRehighlight) break;
      }

      if (shouldRehighlight) {
        clearTimeout(this.highlightTimeout);
        this.highlightTimeout = setTimeout(() => {
          this.highlightNewContent();
        }, 100);
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  findMatchingProfile() {
    const currentUrl = window.location.href;

    if (!this.profiles || !Array.isArray(this.profiles)) {
      return null;
    }

    for (const profile of this.profiles) {
      if (profile.urlPatterns && Array.isArray(profile.urlPatterns)) {
        for (const urlPattern of profile.urlPatterns) {
          const patterns = Array.isArray(urlPattern.urlPattern)
            ? urlPattern.urlPattern
            : [urlPattern.urlPattern];

          for (const pattern of patterns) {
            if (this.urlMatches(currentUrl, pattern)) {
              return {
                ...profile,
                currentUrlPattern: urlPattern,
              };
            }
          }
        }
      } else if (
        profile.urlPattern &&
        this.urlMatches(currentUrl, profile.urlPattern)
      ) {
        return profile;
      }
    }

    return null;
  }

  findAllMatchingProfiles() {
    const currentUrl = window.location.href;
    const matchingProfiles = [];

    if (!this.profiles || !Array.isArray(this.profiles)) {
      return matchingProfiles;
    }

    for (const profile of this.profiles) {
      if (profile.urlPatterns && Array.isArray(profile.urlPatterns)) {
        let foundMatch = false;
        for (const urlPattern of profile.urlPatterns) {
          const patterns = Array.isArray(urlPattern.urlPattern)
            ? urlPattern.urlPattern
            : [urlPattern.urlPattern];

          for (const pattern of patterns) {
            if (this.urlMatches(currentUrl, pattern)) {
              matchingProfiles.push({
                ...profile,
                currentUrlPattern: urlPattern,
                matchedUrl: pattern,
                id: `${profile.id}_${pattern}`,
              });
              foundMatch = true;
              break;
            } else {
            }
          }

          if (foundMatch) break;
        }
        if (foundMatch) {
        }
      } else if (
        profile.urlPattern &&
        this.urlMatches(currentUrl, profile.urlPattern)
      ) {
        matchingProfiles.push(profile);
      } else if (profile.urlPattern) {
      }
    }
    return matchingProfiles;
  }

  setupUrlChangeDetection() {
    let currentUrl = window.location.href;

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      setTimeout(() => {
        const newUrl = window.location.href;
        if (newUrl !== currentUrl) {
          currentUrl = newUrl;
          window.keywordHighlighter?.handleUrlChange();
        }
      }, 0);
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      setTimeout(() => {
        const newUrl = window.location.href;
        if (newUrl !== currentUrl) {
          currentUrl = newUrl;
          window.keywordHighlighter?.handleUrlChange();
        }
      }, 0);
    };

    window.addEventListener("popstate", () => {
      setTimeout(() => {
        const newUrl = window.location.href;
        if (newUrl !== currentUrl) {
          currentUrl = newUrl;
          this.handleUrlChange();
        }
      }, 0);
    });

    window.addEventListener("hashchange", () => {
      const newUrl = window.location.href;
      if (newUrl !== currentUrl) {
        currentUrl = newUrl;
        this.handleUrlChange();
      }
    });
  }

  handleUrlChange() {
    this.notifyUrlChange();

    if (this.isEnabled) {
      this.handleUpdateProfiles();
    }
  }

  notifyUrlChange() {
    try {
      chrome.runtime.sendMessage({
        action: "updateContextMenus",
        url: window.location.href,
      });
    } catch (error) {
    }
  }

  buildKeywordColorMap(matchingProfiles) {
    const keywordColorMap = new Map();
    let exactCase = false;
    matchingProfiles.forEach((profile, profileIndex) => {
      console.log(`Extension: Profile data:`, {
        id: profile.id,
        name: profile.name,
        hasKeywordGroups: !!(
          profile.keywordGroups && profile.keywordGroups.length > 0
        ),
        keywordGroupsCount: profile.keywordGroups?.length || 0,
        hasCurrentUrlPattern: !!profile.currentUrlPattern,
        matchedUrl: profile.matchedUrl,
      });

      if (profile.exactCase) {
        exactCase = true;
      }

      if (profile.currentUrlPattern) {
        const urlDisplay =
          profile.matchedUrl ||
          (Array.isArray(profile.currentUrlPattern.urlPattern)
            ? profile.currentUrlPattern.urlPattern[0]
            : profile.currentUrlPattern.urlPattern);
      }

      if (profile.keywordGroups && Array.isArray(profile.keywordGroups)) {
        profile.keywordGroups.forEach((group, groupIndex) => {
          console.log(`Extension: Processing group ${groupIndex}:`, {
            groupId: group?.id,
            groupName: group?.name,
            hasKeywords: !!(group?.keywords && Array.isArray(group.keywords)),
            keywordCount: group?.keywords?.length || 0,
            groupColor: group?.color,
          });

          if (
            group &&
            group.keywords &&
            Array.isArray(group.keywords) &&
            group.keywords.length > 0
          ) {
            let color = group.color || "#ffff00";
            let textColor = null;
            if (
              profile.currentUrlPattern &&
              profile.currentUrlPattern.colorOverrides &&
              group.id
            ) {
              const overrideColor =
                profile.currentUrlPattern.colorOverrides[group.id];
              if (overrideColor) {
                color = overrideColor;
                const urlDisplay =
                  profile.matchedUrl ||
                  (Array.isArray(profile.currentUrlPattern.urlPattern)
                    ? profile.currentUrlPattern.urlPattern[0]
                    : profile.currentUrlPattern.urlPattern);
              } else {
                const urlDisplay =
                  profile.matchedUrl ||
                  (Array.isArray(profile.currentUrlPattern.urlPattern)
                    ? profile.currentUrlPattern.urlPattern[0]
                    : profile.currentUrlPattern.urlPattern);
              }
            } else {
            }

            if (
              profile.currentUrlPattern &&
              profile.currentUrlPattern.textColorOverrides &&
              profile.currentUrlPattern.textColorOverrides["global"]
            ) {
              textColor =
                profile.currentUrlPattern.textColorOverrides["global"];
            }

            group.keywords.forEach((keyword) => {
              const keywordKey = keyword.toLowerCase().trim();

              if (keywordKey) {
                const colorInfo = {
                  backgroundColor: color,
                  textColor: textColor,
                };

                if (keywordColorMap.has(keywordKey)) {
                  keywordColorMap.get(keywordKey).push(colorInfo);
                } else {
                  keywordColorMap.set(keywordKey, [colorInfo]);
                }
              }
            });
          } else {
          }
        });
      } else if (
        profile.keywords &&
        Array.isArray(profile.keywords) &&
        profile.keywords.length > 0
      ) {
        const color = profile.color || "#ffff00";

        profile.keywords.forEach((keyword) => {
          const normalizedKeyword = keyword.toLowerCase().trim();
          if (normalizedKeyword) {
            const colorInfo = { backgroundColor: color, textColor: null };

            if (keywordColorMap.has(normalizedKeyword)) {
              keywordColorMap.get(normalizedKeyword).push(colorInfo);
            } else {
              keywordColorMap.set(normalizedKeyword, [colorInfo]);
            }
          }
        });
      } else {
      }
    });
    return { keywordColorMap, exactCase };
  }

  urlMatches(url, pattern) {
    if (pattern.endsWith("*")) {
      const basePattern = pattern.slice(0, -1);

      if (basePattern.length < 8 || !basePattern.includes("://")) {
        return false;
      }

      try {
        const testUrl = new URL(basePattern);
        if (
          testUrl.protocol !== "file:" &&
          (!testUrl.hostname || testUrl.hostname.length === 0)
        ) {
          return false;
        }
      } catch {
        return false;
      }

      if (url.startsWith(basePattern)) {
        return true;
      }

      if (basePattern.endsWith("/") && url === basePattern.slice(0, -1)) {
        return true;
      }

      if (
        !basePattern.endsWith("/") &&
        (url === basePattern || url.startsWith(basePattern + "/"))
      ) {
        return true;
      }

      return false;
    }

    return url === pattern;
  }

  getProfileSignature(profile) {
    if (!profile) return null;

    let signatureParts = [];

    if (profile.keywordGroups && Array.isArray(profile.keywordGroups)) {
      profile.keywordGroups.forEach((group) => {
        const sortedKeywords = Array.isArray(group.keywords)
          ? [...group.keywords].sort((a, b) => a.localeCompare(b))
          : [];
        const name = group.name || "";
        signatureParts.push(
          `${group.color}:${name}:${sortedKeywords.join(",")}`
        );
      });
    } else if (profile.keywords && Array.isArray(profile.keywords)) {
      const sortedKeywords = [...profile.keywords].sort((a, b) =>
        a.localeCompare(b)
      );
      signatureParts.push(
        `${profile.color || "#ffff00"}::${sortedKeywords.join(",")}`
      );
    }

    let urlSignature = "";
    if (profile.urlPatterns && Array.isArray(profile.urlPatterns)) {
      const urlParts = profile.urlPatterns
        .map((up) => up.urlPattern || up)
        .sort();
      urlSignature = urlParts.join(";");
    } else {
      urlSignature = profile.urlPattern || "";
    }

    return `${profile.id || "no-id"}|${urlSignature}|${signatureParts.join(
      "|"
    )}`;
  }

  highlightPage() {
    if (!this.profiles || !Array.isArray(this.profiles)) {
      return;
    }

    const matchingProfiles = this.findAllMatchingProfiles();

    if (matchingProfiles.length === 0) {
      return;
    }
    const { keywordColorMap, exactCase } =
      this.buildKeywordColorMap(matchingProfiles);
    try {
      this.highlightWithKeywordMap(document.body, keywordColorMap, exactCase);
    } catch (error) {
    }
  }

  highlightNewContent() {
    const matchingProfiles = this.findAllMatchingProfiles();
    if (matchingProfiles.length === 0) {
      return;
    }

    const unprocessedElements = document.body.querySelectorAll(
      "*:not([data-highlighted])"
    );
    if (unprocessedElements.length > 0) {
      const { keywordColorMap, exactCase } =
        this.buildKeywordColorMap(matchingProfiles);

      for (const element of unprocessedElements) {
        if (this.shouldProcessElement(element)) {
          this.highlightWithKeywordMap(element, keywordColorMap, exactCase);
        }
      }
    }
  }

  shouldProcessElement(element) {
    const tagName = element.tagName.toLowerCase();

    const skipTags = ["script", "style", "noscript", "svg", "canvas", "iframe"];
    if (skipTags.includes(tagName)) {
      return false;
    }

    if (
      element.hasAttribute("data-highlighted") ||
      element.classList.contains("keyword-highlight")
    ) {
      return false;
    }

    return true;
  }

  highlightWithKeywordMap(rootElement, keywordColorMap, exactCase = false) {
    if (!rootElement || keywordColorMap.size === 0) {
      return;
    }

    const walker = document.createTreeWalker(
      rootElement,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          const tagName = parent.tagName.toLowerCase();
          const skipTags = [
            "script",
            "style",
            "noscript",
            "svg",
            "canvas",
            "iframe",
          ];
          if (skipTags.includes(tagName)) {
            return NodeFilter.FILTER_REJECT;
          }

          if (parent.classList.contains("keyword-highlight")) {
            return NodeFilter.FILTER_REJECT;
          }

          if (node.textContent.trim().length === 0) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const textNodes = [];
    let node;
    let nodeCount = 0;
    const maxNodes = 2000;

    while ((node = walker.nextNode()) && nodeCount < maxNodes) {
      textNodes.push(node);
      nodeCount++;
    }
    const batchSize = 50;
    let currentIndex = 0;

    const processBatch = () => {
      const end = Math.min(currentIndex + batchSize, textNodes.length);

      for (let i = currentIndex; i < end; i++) {
        const textNode = textNodes[i];
        if (textNode && textNode.parentNode) {
          this.highlightTextNodeWithMap(textNode, keywordColorMap, exactCase);
        } else {
        }
      }

      currentIndex = end;

      if (currentIndex < textNodes.length) {
        requestIdleCallback(processBatch, { timeout: 16 });
      } else {
        if (rootElement) {
          rootElement.setAttribute("data-highlighted", "true");
        }
      }
    };

    processBatch();
  }

  highlightTextNodeWithMap(textNode, keywordColorMap, exactCase = false) {
    if (!textNode || keywordColorMap.size === 0) {
      return;
    }

    if (!textNode.parentNode) {
      return;
    }

    const text = textNode.textContent;
    let highlightedText = text;
    let hasHighlights = false;

    console.log("Extension: Processing text node:", {
      text: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
      availableKeywords: Array.from(keywordColorMap.keys()),
    });

    try {
      const keywords = Array.from(keywordColorMap.keys()).sort(
        (a, b) => b.length - a.length
      );

      const singleLetterKeywords = keywords.filter((k) => /^[a-zA-Z]$/.test(k));
      const otherKeywords = keywords.filter((k) => !/^[a-zA-Z]$/.test(k));

      if (singleLetterKeywords.length > 0) {
        const singleLetterPattern = singleLetterKeywords
          .map((keyword) => this.createSmartBoundaryPattern(keyword))
          .join("|");

        const singleLetterRegex = new RegExp(`(${singleLetterPattern})`, "g");
        highlightedText = highlightedText.replace(
          singleLetterRegex,
          (match) => {
            hasHighlights = true;

            const lookupKey = match.toLowerCase().trim();
            const colors = keywordColorMap.get(lookupKey);
            if (colors && colors.length > 0) {
              if (colors.length === 1) {
                const colorInfo = colors[0];
                const backgroundColor = colorInfo.backgroundColor || colorInfo;
                const textColor = colorInfo.textColor;
                const textColorStyle = textColor ? `color: ${textColor}; ` : "";
                return `<span class="keyword-highlight" style="background-color: ${backgroundColor}; ${textColorStyle}padding: 1px 2px;">${match}</span>`;
              } else {
                const uniqueColorInfos = colors.filter((color, index, self) => {
                  const colorKey =
                    typeof color === "object"
                      ? `${color.backgroundColor}-${color.textColor || ""}`
                      : color;
                  return (
                    index ===
                    self.findIndex((c) => {
                      const cKey =
                        typeof c === "object"
                          ? `${c.backgroundColor}-${c.textColor || ""}`
                          : c;
                      return cKey === colorKey;
                    })
                  );
                });
                const uniqueBackgroundColors = uniqueColorInfos.map((info) =>
                  typeof info === "object" ? info.backgroundColor : info
                );
                const colorList = uniqueBackgroundColors.join(",");
                const firstColorInfo = uniqueColorInfos[0];
                const backgroundColor =
                  typeof firstColorInfo === "object"
                    ? firstColorInfo.backgroundColor
                    : firstColorInfo;
                const textColor =
                  typeof firstColorInfo === "object"
                    ? firstColorInfo.textColor
                    : null;
                const textColorStyle = textColor ? `color: ${textColor}; ` : "";

                return `<span class="keyword-highlight keyword-highlight-blink" data-colors="${colorList}" style="background-color: ${backgroundColor}; ${textColorStyle}padding: 1px 2px; animation: keyword-blink-${this.getColorHash(
                  uniqueBackgroundColors
                )} 2s infinite;">${match}</span>`;
              }
            }

            return match;
          }
        );
      }

      if (otherKeywords.length > 0) {
        const keywordPattern = otherKeywords
          .map((keyword) => this.createSmartBoundaryPattern(keyword))
          .join("|");

        const regex = new RegExp(`(${keywordPattern})`, "gi");
        highlightedText = highlightedText.replace(regex, (match) => {
          hasHighlights = true;

          const lookupKey = match.toLowerCase().trim();
          const colors = keywordColorMap.get(lookupKey);
          if (colors && colors.length > 0) {
            if (colors.length === 1) {
              const colorInfo = colors[0];
              const backgroundColor = colorInfo.backgroundColor || colorInfo;
              const textColor = colorInfo.textColor;
              const textColorStyle = textColor ? `color: ${textColor}; ` : "";
              return `<span class="keyword-highlight" style="background-color: ${backgroundColor}; ${textColorStyle}padding: 1px 2px;">${match}</span>`;
            } else {
              const uniqueColorInfos = colors.filter((color, index, self) => {
                const colorKey =
                  typeof color === "object"
                    ? `${color.backgroundColor}-${color.textColor || ""}`
                    : color;
                return (
                  index ===
                  self.findIndex((c) => {
                    const cKey =
                      typeof c === "object"
                        ? `${c.backgroundColor}-${c.textColor || ""}`
                        : c;
                    return cKey === colorKey;
                  })
                );
              });
              const uniqueBackgroundColors = uniqueColorInfos.map((info) =>
                typeof info === "object" ? info.backgroundColor : info
              );
              const colorList = uniqueBackgroundColors.join(",");
              const firstColorInfo = uniqueColorInfos[0];
              const backgroundColor =
                typeof firstColorInfo === "object"
                  ? firstColorInfo.backgroundColor
                  : firstColorInfo;
              const textColor =
                typeof firstColorInfo === "object"
                  ? firstColorInfo.textColor
                  : null;
              const textColorStyle = textColor ? `color: ${textColor}; ` : "";

              return `<span class="keyword-highlight keyword-highlight-blink" data-colors="${colorList}" style="background-color: ${backgroundColor}; ${textColorStyle}padding: 1px 2px; animation: keyword-blink-${this.getColorHash(
                uniqueBackgroundColors
              )} 2s infinite;">${match}</span>`;
            }
          }

          return match;
        });
      }

      if (hasHighlights) {
        if (!textNode.parentNode) {
          return;
        }

        const wrapper = document.createElement("span");
        wrapper.innerHTML = highlightedText;
        wrapper.setAttribute("data-keyword-wrapper", "true");

        try {
          textNode.parentNode.replaceChild(wrapper, textNode);
          this.highlightedElements.add(wrapper);

          this.createBlinkingAnimations(wrapper);
        } catch (error) {
        }
      } else {
      }
    } catch (error) {
    }
  }

  createBlinkingAnimations(wrapper) {
    const blinkingElements = wrapper.querySelectorAll(
      ".keyword-highlight-blink"
    );
    const addedAnimations = new Set();

    blinkingElements.forEach((element) => {
      const colors = element.getAttribute("data-colors")?.split(",") || [];
      if (colors.length > 1) {
        const hash = this.getColorHash(colors);

        if (!addedAnimations.has(hash)) {
          addedAnimations.add(hash);
          this.addBlinkingAnimation(hash, colors);
        }
      }
    });
  }

  getColorHash(colors) {
    return colors
      .sort()
      .join("")
      .replace(/[^a-zA-Z0-9]/g, "")
      .substring(0, 10);
  }

  addBlinkingAnimation(hash, colors) {
    const styleId = `keyword-blink-${hash}`;

    if (document.getElementById(styleId)) {
      return;
    }

    const style = document.createElement("style");
    style.id = styleId;

    const steps = colors
      .map((color, index) => {
        const percent = ((index / colors.length) * 100).toFixed(2);
        return `${percent}% { background-color: ${color}; }`;
      })
      .join("\n    ");

    style.textContent = `
      @keyframes keyword-blink-${hash} {
        ${steps}
        100% { background-color: ${colors[0]}; }
      }
    `;

    document.head.appendChild(style);
  }

  highlightTextNode(textNode, keywords, color) {
    if (
      !textNode ||
      !keywords ||
      !Array.isArray(keywords) ||
      keywords.length === 0
    ) {
      return;
    }
    const text = textNode.textContent;
    let highlightedText = text;
    let hasHighlights = false;

    console.log("Extension: Processing text node:", {
      text: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
      keywords: keywords,
    });

    try {
      const keywordPattern = keywords
        .map((keyword) => {
          return this.escapeRegex(keyword);
        })
        .join("|");

      const regex = new RegExp(`\\b(${keywordPattern})\\b`, "gi");

      highlightedText = highlightedText.replace(regex, (match) => {
        hasHighlights = true;

        return `<span class="keyword-highlight" style="background-color: ${color}; padding: 1px 2px;">${match}</span>`;
      });

      if (hasHighlights) {
        const wrapper = document.createElement("span");
        wrapper.innerHTML = highlightedText;
        wrapper.setAttribute("data-keyword-wrapper", "true");

        textNode.parentNode.replaceChild(wrapper, textNode);
        this.highlightedElements.add(wrapper);
      } else {
      }
    } catch (error) {
    }
  }

  escapeRegex(string) {
    if (!this.regexCache.has(string)) {
      this.regexCache.set(
        string,
        string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      );
    }
    return this.regexCache.get(string);
  }

  createSmartBoundaryPattern(keyword) {
    const cacheKey = `boundary_${keyword}`;
    if (this.regexCache.has(cacheKey)) {
      return this.regexCache.get(cacheKey);
    }

    const escaped = this.escapeRegex(keyword);

    if (keyword.length === 1 && /^[a-zA-Z]$/.test(keyword)) {
      const pattern = `\\b${escaped}\\b`;
      this.regexCache.set(cacheKey, pattern);
      return pattern;
    }

    if (keyword.includes(" ")) {
      const words = keyword.split(/\s+/).map((word) => {
        const escapedWord = this.escapeRegex(word);
        const startsWithWord = /^\w/.test(word);
        const endsWithWord = /\w$/.test(word);

        let pattern = escapedWord;
        if (startsWithWord) pattern = `\\b${pattern}`;
        if (endsWithWord) pattern = `${pattern}\\b`;

        return pattern;
      });

      const result = words.join("\\s+");
      this.regexCache.set(cacheKey, result);
      return result;
    }

    const startsWithWord = /^\w/.test(keyword);
    const endsWithWord = /\w$/.test(keyword);

    let pattern = escaped;

    if (startsWithWord) pattern = `\\b${pattern}`;
    if (endsWithWord) pattern = `${pattern}\\b`;

    this.regexCache.set(cacheKey, pattern);
    return pattern;
  }

  clearHighlights() {
    if (this.regexCache.size > 1000) {
      this.regexCache.clear();
    }

    const highlightedSpans = document.querySelectorAll(".keyword-highlight");
    highlightedSpans.forEach((span) => {
      const parent = span.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(span.textContent), span);
        parent.normalize();
      }
    });

    const wrappers = document.querySelectorAll("[data-keyword-wrapper]");

    wrappers.forEach((wrapper) => {
      const parent = wrapper.parentNode;
      if (parent) {
        while (wrapper.firstChild) {
          parent.insertBefore(wrapper.firstChild, wrapper);
        }
        parent.removeChild(wrapper);
        parent.normalize();
      }
    });

    const processedElements = document.querySelectorAll("[data-highlighted]");
    processedElements.forEach((element) => {
      element.removeAttribute("data-highlighted");
    });

    const animationStyles = document.querySelectorAll(
      'style[id^="keyword-blink-"]'
    );
    animationStyles.forEach((style) => {
      style.remove();
    });

    this.highlightedElements.clear();
  }

  showNotification(message, type = "success", details = "") {
    this.injectNotificationCSS();

    const existingNotifications = document.querySelectorAll(
      ".context-menu-notification"
    );
    existingNotifications.forEach((notification) => notification.remove());

    const notification = document.createElement("div");
    notification.className = `context-menu-notification ${type}`;

    if (type === "success") {
      notification.classList.add("success-clean");
    }

    const icon = document.createElement("span");
    icon.className = "notification-icon";

    const messageEl = document.createElement("div");
    messageEl.className = "notification-message";
    messageEl.textContent = message;

    notification.appendChild(icon);
    notification.appendChild(messageEl);

    if (details) {
      const detailsEl = document.createElement("div");
      detailsEl.className = "notification-details";
      detailsEl.textContent = details;
      notification.appendChild(detailsEl);
    }

    document.body.appendChild(notification);

    requestAnimationFrame(() => {
      notification.classList.add("show");
    });

    const timeout = type === "success" ? 1500 : 2000;

    setTimeout(() => {
      if (notification.parentNode) {
        notification.classList.remove("show");
        notification.classList.add("hide");
        setTimeout(() => {
          if (notification.parentNode) {
            notification.remove();
          }
        }, 150);
      }
    }, timeout);
  }

  injectNotificationCSS() {
    const notificationCSSId = "keyword-highlight-notification-styles";

    if (document.getElementById(notificationCSSId)) {
      return;
    }

    const style = document.createElement("style");
    style.id = notificationCSSId;
    style.textContent = `
      .context-menu-notification {
        position: fixed !important;
        top: 20px !important;
        right: 20px !important;
        z-index: 999999 !important;
        background: #ffffff !important;
        border-radius: 6px !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15) !important;
        padding: 12px 16px !important;
        min-width: 260px !important;
        max-width: 340px !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        font-size: 13px !important;
        line-height: 1.4 !important;
        color: #2d3748 !important;
        border-left: 3px solid #48bb78 !important;
        opacity: 0 !important;
        transform: translateX(20px) !important;
        transition: all 0.15s ease-out !important;
      }

      .context-menu-notification.success-clean {
        border-left: 3px solid #48bb78 !important;
        background: #ffffff !important;
      }

      .context-menu-notification.show {
        opacity: 1 !important;
        transform: translateX(0) !important;
      }

      .context-menu-notification.hide {
        opacity: 0 !important;
        transform: translateX(20px) !important;
        transition: all 0.1s ease-in !important;
      }

      .context-menu-notification.error {
        border-left-color: #f56565 !important;
        background: linear-gradient(135deg, #ffffff 0%, #fef5f5 100%) !important;
      }

      .context-menu-notification .notification-icon {
        display: inline-block !important;
        margin-right: 10px !important;
        font-size: 16px !important;
        vertical-align: top !important;
        margin-top: 1px !important;
      }

      .context-menu-notification.success .notification-icon::before,
      .context-menu-notification.success-clean .notification-icon::before {
        content: "✓" !important;
        color: #48bb78 !important;
        font-weight: bold !important;
      }

      .context-menu-notification.error .notification-icon::before {
        content: "⚠" !important;
        color: #f56565 !important;
        font-weight: bold !important;
      }

      .context-menu-notification .notification-message {
        font-weight: 500 !important;
        color: #2d3748 !important;
        margin-bottom: 0 !important;
        display: inline-block !important;
        vertical-align: top !important;
        width: calc(100% - 26px) !important;
      }

      .context-menu-notification .notification-details {
        font-size: 12px !important;
        color: #718096 !important;
        margin-top: 6px !important;
        font-weight: 400 !important;
        line-height: 1.4 !important;
      }

      .context-menu-notification.success-clean .notification-details {
        color: #68d391 !important;
      }

      .context-menu-notification.error .notification-details {
        color: #f56565 !important;
      }

      /* Subtle hover effect for interactivity feedback */
      .context-menu-notification:hover {
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15), 0 3px 10px rgba(0, 0, 0, 0.1) !important;
        transform: translateY(-1px) !important;
        transition: all 0.2s ease-in-out !important;
      }
    `;

    document.head.appendChild(style);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    window.keywordHighlighter = new KeywordHighlighter();
  });
} else {
  window.keywordHighlighter = new KeywordHighlighter();
}


class KeywordHighlighter {
  constructor() {
    this.profiles = [];
    this.isEnabled = true;
    this.highlightedElements = new Set();
    this.observer = null;
    this.lastProfileSignature = null;
    this.init();
  }

  async init() {
    console.log("=== CONTENT SCRIPT INITIALIZING ===");
    await this.loadSettings();
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    this.setupDOMObserver();
    this.setupUrlChangeDetection();

    if (this.isEnabled) {
      console.log("Extension: Extension is enabled, highlighting page on init");
      this.highlightPage();
      const profiles = this.findAllMatchingProfiles();
      this.lastProfileSignature = this.getProfilesSignature(profiles);
    } else {
      console.log("Extension: Extension is disabled on init");
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
      console.error("Extension error loading settings:", error);
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
        console.log("=== CONTENT SCRIPT DEBUG INFO ===");
        console.log("Extension enabled:", this.isEnabled);
        console.log("Profiles count:", this.profiles?.length || 0);
        console.log("All profiles:", this.profiles);
        console.log("Current URL:", window.location.href);
        const matchingProfiles = this.findAllMatchingProfiles();
        console.log("All matching profiles:", matchingProfiles);
        console.log("Highlighted elements:", this.highlightedElements.size);
        console.log("Last profile signature:", this.lastProfileSignature);

        this.profiles?.forEach((profile, index) => {
          console.log(`Profile ${index} URL test:`, {
            name: profile.name || profile.id,
            urlPatterns: profile.urlPatterns?.map((up) => up.urlPattern) || [
              profile.urlPattern,
            ],
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
    console.log("=== HANDLE UPDATE PROFILES ===");
    await this.loadSettings();

    if (!this.isEnabled) {
      console.log("Extension: Extension is disabled, skipping highlighting");
      return;
    }

    const newProfiles = this.findAllMatchingProfiles();
    const newSig = this.getProfilesSignature(newProfiles);

    console.log("Extension: Profile signatures:", {
      old: this.lastProfileSignature,
      new: newSig,
      changed: newSig !== this.lastProfileSignature,
    });

    if (newSig === this.lastProfileSignature) {
      console.log(
        "Extension: No profile changes, highlighting new content only"
      );
      this.highlightNewContent();
      return;
    }

    if (this.lastProfileSignature) {
      console.log("Extension: Profile changed, clearing existing highlights");
      this.clearHighlights();
    }

    if (newProfiles.length > 0) {
      console.log("Extension: Highlighting page with new profiles");
      this.highlightPage();
    } else {
      console.log("Extension: No matching profiles, not highlighting");
    }

    this.lastProfileSignature = newSig || null;
  }

  async handleForceHighlightRefresh() {
    console.log("=== FORCE HIGHLIGHT REFRESH ===");

    await this.loadSettings();

    if (!this.isEnabled) {
      console.log("Extension: Extension disabled, skipping refresh");
      return;
    }

    this.clearHighlights();

    const matchingProfiles = this.findAllMatchingProfiles();

    if (matchingProfiles.length > 0) {
      console.log(
        "Extension: Force refreshing highlights with updated profiles"
      );
      this.highlightPage();

      this.lastProfileSignature = this.getProfilesSignature(matchingProfiles);

      this.showHighlightRefreshFeedback();
    } else {
      console.log("Extension: No matching profiles found for force refresh");
      this.lastProfileSignature = null;
    }
  }

  showHighlightRefreshFeedback() {
    this.injectFlashEffectCSS();

    const highlightedElements = document.querySelectorAll(".keyword-highlight");

    if (highlightedElements.length > 0) {
      console.log(
        `Extension: Adding refresh feedback to ${highlightedElements.length} highlighted elements`
      );

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
    console.log("Extension: Injected flash effect CSS");
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
      return profile.urlPatterns.some((urlPattern) =>
        this.urlMatches(currentUrl, urlPattern.urlPattern)
      );
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
            console.error("Extension error loading settings:", error);
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
          if (this.urlMatches(currentUrl, urlPattern.urlPattern)) {
            return {
              ...profile,
              currentUrlPattern: urlPattern,
            };
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

    console.log("Extension: Checking URL matches for:", currentUrl);

    if (!this.profiles || !Array.isArray(this.profiles)) {
      console.log("Extension: No profiles to check");
      return matchingProfiles;
    }

    for (const profile of this.profiles) {
      console.log(
        `Extension: Checking profile "${profile.name || profile.id}":`,
        {
          urlPatterns: profile.urlPatterns?.map((up) => up.urlPattern) || [
            profile.urlPattern,
          ],
          hasKeywordGroups: !!(
            profile.keywordGroups && profile.keywordGroups.length > 0
          ),
          hasLegacyKeywords: !!(
            profile.keywords && profile.keywords.length > 0
          ),
        }
      );

      if (profile.urlPatterns && Array.isArray(profile.urlPatterns)) {
        let foundMatch = false;
        for (const urlPattern of profile.urlPatterns) {
          console.log(
            `Extension: Testing pattern "${urlPattern.urlPattern}" against URL`
          );
          if (this.urlMatches(currentUrl, urlPattern.urlPattern)) {
            console.log(
              `Extension: ✓ Pattern "${urlPattern.urlPattern}" matches!`
            );
            matchingProfiles.push({
              ...profile,
              currentUrlPattern: urlPattern,
              id: `${profile.id}_${urlPattern.urlPattern}`,
            });
            foundMatch = true;
          } else {
            console.log(
              `Extension: ✗ Pattern "${urlPattern.urlPattern}" does not match`
            );
          }
        }
        if (foundMatch) {
          console.log(
            `Extension: Profile "${profile.name || profile.id}" had ${
              matchingProfiles.filter(
                (p) => p.name === profile.name || p.id.startsWith(profile.id)
              ).length
            } matching URL patterns`
          );
        }
      } else if (
        profile.urlPattern &&
        this.urlMatches(currentUrl, profile.urlPattern)
      ) {
        console.log(
          `Extension: ✓ Legacy pattern "${profile.urlPattern}" matches!`
        );
        matchingProfiles.push(profile);
      } else if (profile.urlPattern) {
        console.log(
          `Extension: ✗ Legacy pattern "${profile.urlPattern}" does not match`
        );
      }
    }

    console.log(
      `Extension: Found ${matchingProfiles.length} matching profiles total`
    );
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
    console.log("Extension: URL changed to:", window.location.href);

    this.notifyUrlChange();

    if (this.isEnabled) {
      this.handleUpdateProfiles();
    }
  }

  notifyUrlChange() {
    console.log(
      "Extension: Notifying background script of URL change:",
      window.location.href
    );
    try {
      chrome.runtime
        .sendMessage({
          action: "updateContextMenus",
          url: window.location.href,
        })
        .then(() => {
          console.log("Extension: Successfully notified background script");
        })
        .catch((error) => {
          console.log("Extension: Background script not ready:", error.message);
        });
    } catch (error) {
      console.error("Error notifying URL change:", error);
    }
  }

  buildKeywordColorMap(matchingProfiles) {
    const keywordColorMap = new Map();
    let exactCase = false;

    matchingProfiles.forEach((profile, profileIndex) => {
      console.log(
        `Extension: Processing profile ${profileIndex}: "${
          profile.name || profile.id
        }"`
      );

      if (profile.exactCase) {
        exactCase = true;
        console.log(
          `Extension: Exact case matching enabled by profile "${
            profile.name || profile.id
          }"`
        );
      }

      if (profile.currentUrlPattern) {
        console.log(
          `Extension: Profile has currentUrlPattern: "${profile.currentUrlPattern.urlPattern}" with color overrides:`,
          profile.currentUrlPattern.colorOverrides
        );
      }

      if (profile.keywordGroups && Array.isArray(profile.keywordGroups)) {
        profile.keywordGroups.forEach((group, groupIndex) => {
          if (
            group &&
            group.keywords &&
            Array.isArray(group.keywords) &&
            group.keywords.length > 0
          ) {
            let color = group.color || "#ffff00";
            if (
              profile.currentUrlPattern &&
              profile.currentUrlPattern.colorOverrides &&
              group.id
            ) {
              const overrideColor =
                profile.currentUrlPattern.colorOverrides[group.id];
              if (overrideColor) {
                color = overrideColor;
                console.log(
                  `Extension: Using color override for group ${group.id} from pattern "${profile.currentUrlPattern.urlPattern}": ${color}`
                );
              } else {
                console.log(
                  `Extension: No color override found for group ${group.id} in pattern "${profile.currentUrlPattern.urlPattern}"`
                );
              }
            } else {
              console.log(
                `Extension: Using default color for group ${group.id}: ${color}`
              );
            }

            group.keywords.forEach((keyword) => {
              const keywordKey = keyword.toLowerCase().trim();

              if (keywordKey) {
                if (keywordColorMap.has(keywordKey)) {
                  keywordColorMap.get(keywordKey).push(color);
                  console.log(
                    `Extension: Keyword "${keywordKey}" now has multiple colors:`,
                    keywordColorMap.get(keywordKey)
                  );
                } else {
                  keywordColorMap.set(keywordKey, [color]);
                  console.log(
                    `Extension: Added keyword "${keywordKey}" (original: "${keyword}") with color:`,
                    color
                  );
                }
              }
            });
          }
        });
      } else if (
        profile.keywords &&
        Array.isArray(profile.keywords) &&
        profile.keywords.length > 0
      ) {
        const color = profile.color || "#ffff00";
        console.log(`Extension: Processing legacy keywords with color:`, color);

        profile.keywords.forEach((keyword) => {
          const normalizedKeyword = keyword.toLowerCase().trim();
          if (normalizedKeyword) {
            if (keywordColorMap.has(normalizedKeyword)) {
              keywordColorMap.get(normalizedKeyword).push(color);
              console.log(
                `Extension: Legacy keyword "${normalizedKeyword}" now has multiple colors:`,
                keywordColorMap.get(normalizedKeyword)
              );
            } else {
              keywordColorMap.set(normalizedKeyword, [color]);
              console.log(
                `Extension: Added legacy keyword "${normalizedKeyword}" with color:`,
                color
              );
            }
          }
        });
      }
    });

    console.log(
      `Extension: Final keyword color map has ${keywordColorMap.size} unique keywords (always case-insensitive)`
    );
    return { keywordColorMap, exactCase: false };
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
    console.log("=== STARTING HIGHLIGHT PAGE ===");

    if (!this.profiles || !Array.isArray(this.profiles)) {
      console.log("Extension: No profiles array found");
      return;
    }

    console.log(`Extension: Found ${this.profiles.length} total profiles`);
    console.log("Extension: Current URL:", window.location.href);

    const matchingProfiles = this.findAllMatchingProfiles();

    if (matchingProfiles.length === 0) {
      console.log(
        "Extension: No matching profiles found for URL:",
        window.location.href
      );
      console.log(
        "Extension: Available profiles:",
        this.profiles.map((p) => ({
          id: p.id,
          name: p.name,
          urlPatterns: p.urlPatterns?.map((up) => up.urlPattern) || [
            p.urlPattern,
          ],
          keywordGroups: p.keywordGroups?.length || 0,
        }))
      );
      return;
    }

    console.log(
      `Extension: Found ${matchingProfiles.length} matching profiles:`,
      matchingProfiles.map((p) => ({
        id: p.id,
        name: p.name,
        keywordGroups: p.keywordGroups?.length || 0,
      }))
    );

    const { keywordColorMap, exactCase } =
      this.buildKeywordColorMap(matchingProfiles);
    console.log("Extension: Keyword color map:", keywordColorMap);
    console.log("Extension: Exact case matching:", exactCase);

    try {
      this.highlightWithKeywordMap(document.body, keywordColorMap, exactCase);
    } catch (error) {
      console.error("Extension error during highlighting:", error);
    }
  }

  highlightNewContent() {
    console.log("=== HIGHLIGHTING NEW CONTENT ===");

    const matchingProfiles = this.findAllMatchingProfiles();
    if (matchingProfiles.length === 0) {
      console.log(
        "Extension: No matching profiles for new content highlighting"
      );
      return;
    }

    const unprocessedElements = document.body.querySelectorAll(
      "*:not([data-highlighted])"
    );

    console.log(
      `Extension: Found ${unprocessedElements.length} unprocessed elements`
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
    console.log("Extension: highlightWithKeywordMap called with:", {
      rootElement: rootElement?.tagName,
      keywordCount: keywordColorMap.size,
      exactCase: exactCase,
    });

    if (!rootElement || keywordColorMap.size === 0) {
      console.log(
        "Extension: highlightWithKeywordMap early return - invalid parameters"
      );
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
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    console.log(`Extension: Found ${textNodes.length} text nodes to process`);

    for (const textNode of textNodes) {
      this.highlightTextNodeWithMap(textNode, keywordColorMap, exactCase);
    }

    if (rootElement) {
      rootElement.setAttribute("data-highlighted", "true");
    }
  }

  highlightTextNodeWithMap(textNode, keywordColorMap, exactCase = false) {
    if (!textNode || keywordColorMap.size === 0) {
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

      console.log("Extension: Keywords sorted by length:", keywords);

      const keywordPattern = keywords
        .map((keyword) => this.createSmartBoundaryPattern(keyword))
        .join("|");

      if (keywordPattern) {
        const regex = new RegExp(`(${keywordPattern})`, "gi");
        console.log(
          "Extension: Using regex pattern:",
          regex,
          "always case-insensitive"
        );

        highlightedText = highlightedText.replace(regex, (match) => {
          hasHighlights = true;

          const lookupKey = match.toLowerCase().trim();
          const colors = keywordColorMap.get(lookupKey);

          console.log(
            `Extension: Found match "${match}" (lookup key: "${lookupKey}") with colors:`,
            colors
          );

          if (colors && colors.length > 0) {
            if (colors.length === 1) {
              return `<span class="keyword-highlight" style="background-color: ${colors[0]}; padding: 1px 2px;">${match}</span>`;
            } else {
              const uniqueColors = [...new Set(colors)];
              console.log(
                `Extension: Creating blinking highlight for "${match}" with unique colors:`,
                uniqueColors
              );

              const colorList = uniqueColors.join(",");
              return `<span class="keyword-highlight keyword-highlight-blink" data-colors="${colorList}" style="background-color: ${
                uniqueColors[0]
              }; padding: 1px 2px; animation: keyword-blink-${this.getColorHash(
                uniqueColors
              )} 2s infinite;">${match}</span>`;
            }
          }

          return match;
        });
      }

      if (hasHighlights) {
        console.log("Extension: Applying highlights to text node");
        const wrapper = document.createElement("span");
        wrapper.innerHTML = highlightedText;
        wrapper.setAttribute("data-keyword-wrapper", "true");

        textNode.parentNode.replaceChild(wrapper, textNode);
        this.highlightedElements.add(wrapper);

        this.createBlinkingAnimations(wrapper);

        console.log(
          "Extension: Successfully applied highlights, total highlighted elements:",
          this.highlightedElements.size
        );
      } else {
        console.log("Extension: No highlights found in this text node");
      }
    } catch (error) {
      console.error("Error in highlightTextNodeWithMap:", error);
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
          console.log(
            `Extension: Created blinking animation for colors:`,
            colors
          );
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
    console.log(
      `Extension: Added CSS animation keyword-blink-${hash} for colors:`,
      colors
    );
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
      console.log("Extension: Using regex pattern:", regex);

      highlightedText = highlightedText.replace(regex, (match) => {
        hasHighlights = true;
        console.log("Extension: Found match:", match);
        return `<span class="keyword-highlight" style="background-color: ${color}; padding: 1px 2px;">${match}</span>`;
      });

      if (hasHighlights) {
        console.log("Extension: Applying highlights to text node");
        const wrapper = document.createElement("span");
        wrapper.innerHTML = highlightedText;
        wrapper.setAttribute("data-keyword-wrapper", "true");

        textNode.parentNode.replaceChild(wrapper, textNode);
        this.highlightedElements.add(wrapper);
        console.log(
          "Extension: Successfully applied highlights, total highlighted elements:",
          this.highlightedElements.size
        );
      } else {
        console.log("Extension: No highlights found in this text node");
      }
    } catch (error) {
      console.error("Error in highlightTextNode:", error);
    }
  }

  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  createSmartBoundaryPattern(keyword) {
    const escaped = this.escapeRegex(keyword);

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

      return words.join("\\s+");
    }

    const startsWithWord = /^\w/.test(keyword);
    const endsWithWord = /\w$/.test(keyword);

    let pattern = escaped;

    if (startsWithWord) pattern = `\\b${pattern}`;
    if (endsWithWord) pattern = `${pattern}\\b`;

    return pattern;
  }

  clearHighlights() {
    console.log("=== CLEARING HIGHLIGHTS ===");

    const highlightedSpans = document.querySelectorAll(".keyword-highlight");
    console.log(
      `Extension: Removing ${highlightedSpans.length} highlighted spans`
    );

    highlightedSpans.forEach((span) => {
      const parent = span.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(span.textContent), span);
        parent.normalize();
      }
    });

    const wrappers = document.querySelectorAll("[data-keyword-wrapper]");
    console.log(`Extension: Removing ${wrappers.length} wrapper spans`);

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
    console.log(
      `Extension: Removing data-highlighted from ${processedElements.length} elements`
    );

    processedElements.forEach((element) => {
      element.removeAttribute("data-highlighted");
    });

    const animationStyles = document.querySelectorAll(
      'style[id^="keyword-blink-"]'
    );
    console.log(
      `Extension: Removing ${animationStyles.length} CSS animation styles`
    );

    animationStyles.forEach((style) => {
      style.remove();
    });

    this.highlightedElements.clear();
    console.log("Extension: Cleared all highlights and animations");
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

    const timeout = type === "success" ? 3000 : 4000;

    setTimeout(() => {
      if (notification.parentNode) {
        notification.classList.remove("show");
        notification.classList.add("hide");
        setTimeout(() => {
          if (notification.parentNode) {
            notification.remove();
          }
        }, 300);
      }
    }, timeout);

    console.log(`Notification shown: ${message} (${type})`);
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
        border-radius: 8px !important;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08) !important;
        padding: 16px 20px !important;
        min-width: 280px !important;
        max-width: 380px !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        font-size: 14px !important;
        line-height: 1.5 !important;
        color: #2d3748 !important;
        border-left: 4px solid #48bb78 !important;
        opacity: 0 !important;
        transition: opacity 0.2s ease-in-out !important;
      }

      .context-menu-notification.success-clean {
        border-left: 4px solid #48bb78 !important;
        background: linear-gradient(135deg, #ffffff 0%, #f7fafc 100%) !important;
      }

      .context-menu-notification.show {
        opacity: 1 !important;
      }

      .context-menu-notification.hide {
        opacity: 0 !important;
        transition: opacity 0.2s ease-in-out !important;
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
    console.log("Extension: Injected clean notification CSS");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    window.keywordHighlighter = new KeywordHighlighter();
  });
} else {
  window.keywordHighlighter = new KeywordHighlighter();
}

window.debugExtension = function (enabled = true) {
  if (window.keywordHighlighter) {
    window.keywordHighlighter.debug = enabled;
    console.log(`Extension debugging ${enabled ? "enabled" : "disabled"}`);
    if (enabled) {
      console.log("Available debug functions:");
      console.log("- debugExtension(false) - disable debugging");
      console.log(
        "- runExtensionDiagnostics() - run comprehensive diagnostics"
      );
      console.log(
        "- window.keywordHighlighter.findMatchingProfile() - check current profile"
      );
      console.log(
        "- window.keywordHighlighter.highlightPage() - manually highlight page"
      );
    }
  } else {
    console.log("Extension not loaded yet");
  }
};

window.showExtensionInfo = function () {
  if (window.keywordHighlighter) {
    const highlighter = window.keywordHighlighter;
    console.log("Extension Info:", {
      enabled: highlighter.isEnabled,
      profileCount: highlighter.profiles ? highlighter.profiles.length : 0,
      currentUrl: window.location.href,
      matchingProfile: highlighter.findMatchingProfile(),
      highlightedElements: highlighter.highlightedElements.size,
    });
  } else {
    console.log("Extension not loaded yet");
  }
};

window.runExtensionDiagnostics = function () {
  if (window.keywordHighlighter) {
    return window.keywordHighlighter.runDiagnostics();
  } else {
    console.error("Extension not loaded yet");
    return null;
  }
};

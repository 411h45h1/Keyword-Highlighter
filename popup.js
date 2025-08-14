class KeywordHighlighterPopup {
  constructor() {
    this.currentEditingId = null;
    this.keywordGroupCounter = 0;
    this.urlPatternCounter = 0;
    this.profileMode = "single";
    this.uniqueKeywords = false;
    this.exactCase = false;
    this.cachedProfiles = [];
    this.keywordBank = [];
    this.templates = this.getTemplates();
    this.keywordBankInputTimeout = null;
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.cleanupInvalidColors();
    await this.loadExtensionState();
    await this.loadProfiles();
    this.addUrlPattern();
    this.addKeywordGroup();
    this.updateFormMode();

    window.addEventListener("beforeunload", () => {
      document
        .querySelectorAll(".autocomplete-dropdown")
        .forEach((dropdown) => {
          dropdown.remove();
        });
    });
  }

  async cleanupInvalidColors() {
    const result = await chrome.storage.sync.get(["profiles"]);
    let profiles = result.profiles || [];
    let cleanupCount = 0;

    const cleanedProfiles = profiles.map((profile) => {
      if (profile.keywordGroups && Array.isArray(profile.keywordGroups)) {
        profile.keywordGroups = profile.keywordGroups.map((group, index) => {
          if (group.color && !/^#[0-9A-Fa-f]{6}$/.test(group.color)) {
            const defaultColors = [
              "#ffff00",
              "#ff9999",
              "#99ff99",
              "#9999ff",
              "#ffcc99",
            ];
            group.color = defaultColors[index % defaultColors.length];
            cleanupCount++;
          }
          return group;
        });
      }

      if (profile.color && !/^#[0-9A-Fa-f]{6}$/.test(profile.color)) {
        profile.color = "#ffff00";
        cleanupCount++;
      }

      return profile;
    });

    if (cleanupCount > 0) {
      await chrome.storage.sync.set({ profiles: cleanedProfiles });
      console.log(`Cleaned up ${cleanupCount} invalid color values`);
    }

    return cleanupCount;
  }

  // Helper function to parse keywords consistently across the extension
  parseKeywords(text, includeNewlines = true) {
    if (!text || typeof text !== "string") return [];

    let separatorPattern;
    if (includeNewlines) {
      // For context menus and keyword bank - split on commas, newlines, semicolons, pipes, tabs
      // BUT preserve forward slashes between word characters (like HL7/FHIR, API/REST)
      separatorPattern = /[,;\n\r\t|]+/;
    } else {
      // For regular form inputs - split only on commas
      separatorPattern = /[,]+/;
    }

    return text
      .split(separatorPattern)
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword.length > 0 && /\S/.test(keyword))
      .flatMap((keyword) => {
        // Only split on forward slash if it's NOT between word characters
        // This preserves terms like "HL7/FHIR", "API/REST", "C++/Java", "24/7", etc.
        if (keyword.includes("/")) {
          // Check if the slash is between word characters (letters, numbers, underscore)
          if (/\w\/\w/.test(keyword)) {
            // Keep the whole term intact (e.g., "HL7/FHIR")
            return [keyword];
          } else {
            // Split on slash if it's not between word characters (e.g., "word1/ word2")
            return keyword
              .split("/")
              .map((k) => k.trim())
              .filter((k) => k.length > 0);
          }
        }

        // Handle cases where multiple keywords might be separated by multiple spaces
        return keyword
          .split(/\s{2,}/)
          .map((word) => word.trim())
          .filter((word) => word.length > 0);
      })
      .filter((keyword, index, array) => array.indexOf(keyword) === index); // Remove duplicates
  }

  // Helper function to parse URLs (different from keywords - no forward slash splitting)
  parseUrls(text) {
    if (!text || typeof text !== "string") return [];

    // For URLs, only split on commas, newlines, semicolons, pipes, tabs - NOT forward slashes
    const separatorPattern = /[,;\n\r\t|]+/;

    return text
      .split(separatorPattern)
      .map((url) => url.trim())
      .filter((url) => url.length > 0 && /\S/.test(url))
      .filter((url, index, array) => array.indexOf(url) === index); // Remove duplicates
  }

  // Helper function to group URL patterns by their color overrides
  groupUrlPatternsByColors(urlPatterns) {
    const groups = [];
    const processed = new Set();

    urlPatterns.forEach((pattern, index) => {
      if (processed.has(index)) return;

      const currentOverrides = JSON.stringify(pattern.colorOverrides || {});
      const currentTextOverrides = JSON.stringify(
        pattern.textColorOverrides || {}
      );

      // Handle both single URL strings and arrays of URLs
      let urls;
      if (Array.isArray(pattern.urlPattern)) {
        urls = [...pattern.urlPattern];
      } else {
        urls = [pattern.urlPattern || pattern];
      }

      const group = {
        urls: urls,
        colorOverrides: pattern.colorOverrides || {},
        textColorOverrides: pattern.textColorOverrides || {},
      };

      // Find other patterns with the same color overrides
      for (let i = index + 1; i < urlPatterns.length; i++) {
        if (processed.has(i)) continue;

        const otherOverrides = JSON.stringify(
          urlPatterns[i].colorOverrides || {}
        );
        const otherTextOverrides = JSON.stringify(
          urlPatterns[i].textColorOverrides || {}
        );
        if (
          currentOverrides === otherOverrides &&
          currentTextOverrides === otherTextOverrides
        ) {
          // Handle both single URL strings and arrays of URLs
          if (Array.isArray(urlPatterns[i].urlPattern)) {
            group.urls.push(...urlPatterns[i].urlPattern);
          } else {
            group.urls.push(urlPatterns[i].urlPattern || urlPatterns[i]);
          }
          processed.add(i);
        }
      }

      groups.push(group);
      processed.add(index);
    });

    return groups;
  }

  setupEventListeners() {
    document
      .getElementById("extensionToggle")
      .addEventListener("change", this.handleToggleChange.bind(this));

    document
      .getElementById("inputViewToggle")
      .addEventListener("change", this.handleViewToggle.bind(this));
    document
      .getElementById("savedViewToggle")
      .addEventListener("change", this.handleViewToggle.bind(this));

    document
      .getElementById("saveProfile")
      .addEventListener("click", this.handleSaveProfile.bind(this));
    document
      .getElementById("cancelEdit")
      .addEventListener("click", this.handleCancelEdit.bind(this));

    document
      .getElementById("addKeywordGroup")
      .addEventListener("click", () => this.addKeywordGroup());

    document
      .getElementById("profileName")
      .addEventListener("input", this.validateForm.bind(this));

    document
      .getElementById("singleUrlToggle")
      .addEventListener("change", this.handleProfileTypeChange.bind(this));
    document
      .getElementById("multiUrlToggle")
      .addEventListener("change", this.handleProfileTypeChange.bind(this));

    document
      .getElementById("uniqueKeywordsToggle")
      .addEventListener("change", this.handleUniqueKeywordsToggle.bind(this));

    document
      .getElementById("exactCaseToggle")
      .addEventListener("change", this.handleExactCaseToggle.bind(this));

    document
      .getElementById("processKeywordBank")
      .addEventListener("click", this.handleProcessKeywordBank.bind(this));
    document
      .getElementById("clearKeywordBank")
      .addEventListener("click", this.handleClearKeywordBank.bind(this));
    document
      .getElementById("keywordBankText")
      .addEventListener("input", this.handleKeywordBankInput.bind(this));

    // Templates event listeners
    document
      .getElementById("templatesButton")
      .addEventListener("click", this.showTemplatesModal.bind(this));
    document
      .getElementById("closeTemplatesModal")
      .addEventListener("click", this.hideTemplatesModal.bind(this));

    // Close modal when clicking outside
    document.getElementById("templatesModal").addEventListener("click", (e) => {
      if (e.target.id === "templatesModal") {
        this.hideTemplatesModal();
      }
    });
  }

  handleProfileTypeChange(event) {
    this.profileMode = event.target.value;
    this.updateFormMode();
  }

  handleUniqueKeywordsToggle(event) {
    this.uniqueKeywords = event.target.checked;
    this.updateAllKeywordDataLists();
    if (this.keywordBank.length > 0) {
      this.displayKeywordBankPreview(this.keywordBank);
    }
  }

  handleExactCaseToggle(event) {
    this.exactCase = event.target.checked;
    console.log(
      `Exact case matching: ${this.exactCase ? "enabled" : "disabled"}`
    );

    if (this.keywordBank.length > 0) {
      this.displayKeywordBankPreview(this.keywordBank);
    }

    if (this.uniqueKeywords) {
      this.updateAllKeywordDataLists();
    }
  }

  handleKeywordBankInput() {
    // Clear previous timeout to debounce input
    if (this.keywordBankInputTimeout) {
      clearTimeout(this.keywordBankInputTimeout);
    }

    // Debounce the processing for better performance
    this.keywordBankInputTimeout = setTimeout(() => {
      const textarea = document.getElementById("keywordBankText");
      const rawText = textarea.value.trim();

      if (rawText) {
        const keywords = this.parseKeywordBankText(rawText);
        this.updateKeywordBankCount(keywords.length);
      } else {
        this.updateKeywordBankCount(0);
      }
    }, 300); // 300ms debounce delay
  }

  handleProcessKeywordBank() {
    const textarea = document.getElementById("keywordBankText");
    const rawText = textarea.value.trim();

    if (!rawText) {
      return;
    }

    const keywords = this.parseKeywordBankText(rawText);
    this.keywordBank = keywords;

    this.displayKeywordBankPreview(keywords);
    this.updateAllKeywordDataLists();
    this.saveKeywordBank();

    this.updateKeywordBankCount(keywords.length, true);
  }

  handleClearKeywordBank() {
    const textarea = document.getElementById("keywordBankText");
    const preview = document.getElementById("keywordBankPreview");

    textarea.value = "";
    this.keywordBank = [];
    preview.style.display = "none";
    this.updateKeywordBankCount(0);
    this.updateAllKeywordDataLists();
    this.saveKeywordBank();
  }

  parseKeywordBankText(text) {
    const keywords = this.parseKeywords(text, true) // Use helper with newlines enabled
      .filter((keyword) => this.isValidKeyword(keyword))
      .map((keyword) => (this.exactCase ? keyword : keyword.toLowerCase()))
      .filter((keyword, index, array) => array.indexOf(keyword) === index);

    return keywords;
  }

  updateKeywordBankCount(count, processed = false) {
    const countDisplay = document.getElementById("keywordBankCount");
    if (processed) {
      countDisplay.textContent = `${count} keywords processed`;
      countDisplay.style.color = "#28a745";
      setTimeout(() => {
        countDisplay.style.color = "#6c757d";
      }, 2000);
    } else {
      countDisplay.textContent = `${count} keyword${count !== 1 ? "s" : ""}`;
      countDisplay.style.color = "#6c757d";
    }
  }

  displayKeywordBankPreview(keywords) {
    const preview = document.getElementById("keywordBankPreview");
    const list = document.getElementById("keywordBankList");

    if (keywords.length === 0) {
      preview.style.display = "none";
      return;
    }

    list.innerHTML = "";

    const usedKeywords = this.uniqueKeywords
      ? this.getAllRawKeywordsFromGroups()
      : [];
    const availableKeywords = this.uniqueKeywords
      ? keywords.filter((keyword) => {
          const keywordToCheck = keyword.toLowerCase();
          const usedKeywordsLowercase = usedKeywords.map((k) =>
            k.toLowerCase()
          );
          const isUsed = usedKeywordsLowercase.includes(keywordToCheck);
          return !isUsed;
        })
      : keywords;

    if (this.uniqueKeywords && keywords.length > 0) {
      console.log("Extension Debug - Keyword bank filtering:", {
        totalKeywords: keywords.length,
        availableKeywords: availableKeywords.length,
        filteredOut: keywords.length - availableKeywords.length,
        usedKeywordsRaw: usedKeywords,
        exactCase: this.exactCase,
        filteredOutKeywords: keywords.filter(
          (k) => !availableKeywords.includes(k)
        ),
      });
    }

    if (
      availableKeywords.length === 0 &&
      this.uniqueKeywords &&
      keywords.length > 0
    ) {
      const message = document.createElement("div");
      message.className = "no-keywords";
      message.textContent =
        "All keywords from the bank are already used in keyword groups";
      message.style.padding = "10px";
      message.style.color = "#6c757d";
      message.style.fontStyle = "italic";
      message.style.textAlign = "center";
      list.appendChild(message);
      preview.style.display = "block";
      return;
    }

    availableKeywords.forEach((keyword) => {
      const item = document.createElement("span");
      item.className = "keyword-bank-item";
      item.textContent = keyword;
      item.title = `Click to add "${keyword}" to current keyword group`;

      item.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.addKeywordFromBank(keyword, item);
      });

      list.appendChild(item);
    });

    preview.style.display = "block";

    if (this.uniqueKeywords && keywords.length > availableKeywords.length) {
      const countDisplay = document.getElementById("keywordBankCount");
      countDisplay.textContent = `${availableKeywords.length} of ${keywords.length} keywords available`;
      countDisplay.style.color = "#ffc107";
    }
  }

  addKeywordFromBank(keyword, itemElement) {
    const keywordGroups = document.querySelectorAll(".keyword-group");
    if (keywordGroups.length === 0) {
      this.addKeywordGroup();
    }

    const targetGroup = keywordGroups[keywordGroups.length - 1];
    const textarea = targetGroup.querySelector("textarea");

    if (!textarea) return;

    const currentKeywords = textarea.value
      .split(/[,\/]/)
      .map((k) => {
        const trimmed = k.trim();
        return this.exactCase ? trimmed : trimmed.toLowerCase();
      })
      .filter((k) => k.length > 0);

    const keywordToCheck = this.exactCase ? keyword : keyword.toLowerCase();
    if (currentKeywords.includes(keywordToCheck)) {
      itemElement.classList.add("duplicate");
      setTimeout(() => {
        itemElement.classList.remove("duplicate");
      }, 1500);
      return;
    }

    if (this.uniqueKeywords) {
      const allGroupKeywords = this.getAllRawKeywordsFromGroups();
      const allGroupKeywordsLowercase = allGroupKeywords.map((k) =>
        k.toLowerCase()
      );
      if (allGroupKeywordsLowercase.includes(keyword.toLowerCase())) {
        itemElement.classList.add("duplicate");
        setTimeout(() => {
          itemElement.classList.remove("duplicate");
        }, 1500);
        return;
      }
    }

    if (textarea.value.trim()) {
      textarea.value += ", " + keyword;
    } else {
      textarea.value = keyword;
    }

    itemElement.classList.add("added");
    setTimeout(() => {
      itemElement.classList.remove("added");
    }, 1500);

    const container = document.querySelector(".container");
    const scrollTop = container ? container.scrollTop : 0;

    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    if (container && container.scrollTop !== scrollTop) {
      container.scrollTop = scrollTop;
    }

    if (this.uniqueKeywords) {
      this.updateAllKeywordDataLists();

      if (this.keywordBank.length > 0) {
        const currentScrollTop = container ? container.scrollTop : 0;
        this.displayKeywordBankPreview(this.keywordBank);
        if (container) {
          container.scrollTop = currentScrollTop;
        }
      }
    }
  }

  getAllKeywordsFromGroups() {
    const keywords = [];
    const keywordGroups = document.querySelectorAll(".keyword-group");

    keywordGroups.forEach((group) => {
      const textarea = group.querySelector("textarea");
      if (textarea && textarea.value.trim()) {
        const groupKeywords = textarea.value
          .split(/[,\/]/)
          .map((k) => {
            const trimmed = k.trim();
            return this.exactCase ? trimmed : trimmed.toLowerCase();
          })
          .filter((k) => k.length > 0);
        keywords.push(...groupKeywords);
      }
    });

    console.log("Extension Debug - getAllKeywordsFromGroups:", {
      exactCase: this.exactCase,
      uniqueKeywords: this.uniqueKeywords,
      foundKeywords: keywords,
    });

    return keywords;
  }

  getAllRawKeywordsFromGroups() {
    const keywords = [];
    const keywordGroups = document.querySelectorAll(".keyword-group");

    keywordGroups.forEach((group) => {
      const textarea = group.querySelector("textarea");
      if (textarea && textarea.value.trim()) {
        const groupKeywords = textarea.value
          .split(/[,\/]/)
          .map((k) => k.trim())
          .filter((k) => k.length > 0);
        keywords.push(...groupKeywords);
      }
    });

    return keywords;
  }

  async saveKeywordBank() {
    try {
      await chrome.storage.sync.set({ keywordBank: this.keywordBank });
    } catch (error) {
      console.error("Error saving keyword bank:", error);
    }
  }

  loadKeywordBankToUI() {
    const textarea = document.getElementById("keywordBankText");
    const preview = document.getElementById("keywordBankPreview");

    if (this.keywordBank && this.keywordBank.length > 0) {
      textarea.value = this.keywordBank.join(", ");
      this.updateKeywordBankCount(this.keywordBank.length);
      this.displayKeywordBankPreview(this.keywordBank);
    } else {
      textarea.value = "";
      this.updateKeywordBankCount(0);
      preview.style.display = "none";
    }
  }

  updateFormMode() {
    if (this.profileMode === "single") {
      this.setupSingleUrlMode();
    } else {
      this.setupMultiUrlMode();
    }
    this.updateRemoveButtonVisibility();

    setTimeout(() => {
      this.updatePatternColors();
    }, 50);
  }

  setupSingleUrlMode() {
    const patternsContainer = document.getElementById("urlPatterns");
    patternsContainer.innerHTML = "";
    this.urlPatternCounter = 0;
    this.addUrlPattern();

    document.querySelectorAll(".keyword-group").forEach((group) => {
      const colorInputGroup = group.querySelector(".color-input-group");
      if (colorInputGroup) {
        colorInputGroup.style.display = "flex";
      }
    });
  }

  setupMultiUrlMode() {
    const patternsContainer = document.getElementById("urlPatterns");
    patternsContainer.innerHTML = "";
    this.urlPatternCounter = 0;

    // Create the add button first
    const addPatternButton = document.createElement("button");
    addPatternButton.type = "button";
    addPatternButton.className = "btn-secondary btn-small add-url-pattern-btn";
    addPatternButton.textContent = "+ Add URL Pattern";
    addPatternButton.addEventListener("click", () => this.addUrlPattern());
    patternsContainer.appendChild(addPatternButton);

    // Then add the initial pattern
    this.addUrlPattern();

    document.querySelectorAll(".keyword-group").forEach((group) => {
      const colorInputGroup = group.querySelector(".color-input-group");
      if (colorInputGroup) {
        colorInputGroup.style.display = "none";
      }
    });
  }

  addKeywordGroup(color = "#ffff00", keywords = [], customName = "") {
    const groupId = `group-${this.keywordGroupCounter++}`;
    const groupsContainer = document.getElementById("keywordGroups");

    const groupDiv = document.createElement("div");
    groupDiv.className = "keyword-group";
    groupDiv.dataset.groupId = groupId;

    const defaultName = `Keyword Group ${this.keywordGroupCounter}`;
    const displayName = customName || defaultName;

    let keywordArray = [];
    if (Array.isArray(keywords)) {
      keywordArray = keywords.filter((k) => k && k.trim());
    } else if (typeof keywords === "string" && keywords) {
      keywordArray = keywords
        .split(/[,\/]/)
        .map((k) => k.trim())
        .filter((k) => k);
    }

    groupDiv.innerHTML = `
      <div class="keyword-group-header">
        <span class="keyword-group-title">${this.escapeHtml(displayName)}</span>
        <button type="button" class="remove-group" title="Remove group">×</button>
      </div>
      <input type="text" 
        placeholder="Enter group name" 
        value="${this.escapeHtml(customName)}" 
        data-group="${groupId}" 
        data-type="name"
        class="group-name-input">
      <div class="color-input-group" style="display: ${
        this.profileMode === "single" ? "flex" : "none"
      }">
        <input type="color" value="${color}" data-group="${groupId}">
        <input type="text" value="${color}" maxlength="7" placeholder="#ffff00" data-group="${groupId}">
      </div>
      <div class="input-with-select-container" data-group="${groupId}">
        <label class="input-label">Keywords (comma-separated):</label>
        <div class="input-select-wrapper">
          <textarea 
            class="keyword-textarea" 
            placeholder="Type keywords separated by commas, or select from dropdown to add..."
            data-group="${groupId}"
            list="keywords-datalist-${groupId}"
            rows="3">${keywordArray.join(", ")}</textarea>
          <datalist id="keywords-datalist-${groupId}">
            <!-- Options will be populated dynamically -->
          </datalist>
        </div>
      </div>
    `;

    groupsContainer.appendChild(groupDiv);

    this.setupGroupEventListeners(groupDiv);

    this.updateKeywordDatalist(groupId);

    this.updatePatternColors();
    if (this.uniqueKeywords) {
      this.updateAllKeywordDataLists();
    }
    this.validateForm();
  }
  setupGroupEventListeners(groupDiv) {
    const groupId = groupDiv.dataset.groupId;
    const colorPicker = groupDiv.querySelector(
      `input[type="color"][data-group="${groupId}"]`
    );
    const hexInput = groupDiv.querySelector(
      `input[type="text"][data-group="${groupId}"]:not(.group-name-input)`
    );
    const nameInput = groupDiv.querySelector(
      `input[data-group="${groupId}"][data-type="name"]`
    );
    const removeBtn = groupDiv.querySelector(".remove-group");
    const titleSpan = groupDiv.querySelector(".keyword-group-title");
    const keywordTextarea = groupDiv.querySelector(".keyword-textarea");

    if (colorPicker && hexInput) {
      colorPicker.addEventListener("input", (e) => {
        hexInput.value = e.target.value;
      });

      hexInput.addEventListener("input", (e) => {
        const hex = e.target.value;
        if (/^#[0-9A-F]{6}$/i.test(hex)) {
          colorPicker.value = hex;
        }
      });
    }

    nameInput.addEventListener("input", (e) => {
      const customName = e.target.value.trim();
      const groupNumber = groupId.split("-")[1];
      const defaultName = `Keyword Group ${parseInt(groupNumber) + 1}`;
      titleSpan.textContent = customName || defaultName;
      this.updatePatternColors();
    });

    removeBtn.addEventListener("click", () => {
      const groupsContainer = document.getElementById("keywordGroups");
      if (groupsContainer.children.length > 1) {
        groupDiv.remove();
        this.updatePatternColors();
        if (this.uniqueKeywords) {
          const container = document.querySelector(".container");
          const scrollTop = container ? container.scrollTop : 0;

          this.updateAllKeywordDataLists();
          if (this.keywordBank.length > 0) {
            this.displayKeywordBankPreview(this.keywordBank);
          }

          if (container) {
            container.scrollTop = scrollTop;
          }
        }
        this.validateForm();
      }
    });

    if (keywordTextarea) {
      keywordTextarea.addEventListener("input", (e) => {
        if (this.uniqueKeywords) {
          const container = document.querySelector(".container");
          const scrollTop = container ? container.scrollTop : 0;

          this.updateAllKeywordDataLists();
          if (this.keywordBank.length > 0) {
            this.displayKeywordBankPreview(this.keywordBank);
          }

          if (container) {
            container.scrollTop = scrollTop;
          }
        } else {
          this.updateKeywordDatalist(groupId);
        }
        this.validateForm();
      });

      this.setupKeywordDropdownInteraction(keywordTextarea, groupId);
    }
  }

  addUrlPattern(urlPattern = "") {
    const patternId = `pattern-${this.urlPatternCounter++}`;
    const patternsContainer = document.getElementById("urlPatterns");

    const patternDiv = document.createElement("div");
    patternDiv.className = "url-pattern";
    patternDiv.dataset.patternId = patternId;

    let urlValue = "";
    if (Array.isArray(urlPattern)) {
      urlValue = urlPattern[0] || "";
    } else if (typeof urlPattern === "string" && urlPattern.trim()) {
      urlValue = urlPattern.trim();
    }

    patternDiv.innerHTML = `
      <div class="url-pattern-header">
        <button type="button" class="remove-pattern" title="Remove URL pattern">×</button>
      </div>
      <div class="form-group">
        <label>URL Patterns:</label>
        <textarea 
          class="pattern-url-input" 
          placeholder="Enter URL patterns, one per line or comma-separated (use * as wildcard)..."
          data-pattern="${patternId}"
          autocomplete="off"
          rows="4"
          required>${this.escapeHtml(urlValue)}</textarea>
        <small>Use * as wildcard at the end for matching subdirectories. Enter multiple URLs on separate lines or comma-separated. Example:<br>
        https://linkedin.com/jobs/*<br>
        https://smartapply.indeed.com/*</small>
      </div>
      ${
        this.profileMode === "multi"
          ? `
        <div class="pattern-colors-section">
          <h5>Color Overrides for this URL</h5>
          <div class="pattern-colors" data-pattern="${patternId}">
            <!-- Color overrides will be populated based on keyword groups -->
          </div>
        </div>
      `
          : ""
      }
    `;

    const addButton = patternsContainer.querySelector(".add-url-pattern-btn");
    if (addButton) {
      patternsContainer.insertBefore(patternDiv, addButton);
    } else {
      patternsContainer.appendChild(patternDiv);
    }

    this.setupPatternEventListeners(patternDiv);

    this.updateRemoveButtonVisibility();
    if (this.profileMode === "multi") {
      setTimeout(() => {
        this.updatePatternColors();
      }, 10);
    }

    return patternDiv;
  }

  updateRemoveButtonVisibility() {
    const patterns = document.querySelectorAll(".url-pattern");
    const shouldShowRemove = patterns.length > 1;

    patterns.forEach((pattern) => {
      const header = pattern.querySelector(".url-pattern-header");
      if (header) {
        header.style.display = shouldShowRemove ? "flex" : "none";
      }
    });
  }

  setupPatternEventListeners(patternDiv) {
    const patternId = patternDiv.dataset.patternId;
    const removeBtn = patternDiv.querySelector(".remove-pattern");
    const urlInput = patternDiv.querySelector(".pattern-url-input");

    removeBtn.addEventListener("click", () => {
      const patternsContainer = document.getElementById("urlPatterns");
      const patterns = patternsContainer.querySelectorAll(".url-pattern");

      if (patterns.length > 1) {
        patternDiv.remove();
        this.updateRemoveButtonVisibility();
        this.validateForm();
      } else {
        if (urlInput) {
          urlInput.value = "";
        }
        this.validateForm();
      }
    });

    if (urlInput) {
      urlInput.addEventListener("input", () => {
        this.validateForm();
      });
    }
  }

  updatePatternColors() {
    const keywordGroups = document.querySelectorAll(".keyword-group");

    if (this.profileMode === "single") {
      return;
    }

    const patternColorSections = document.querySelectorAll(".pattern-colors");

    patternColorSections.forEach((colorsContainer) => {
      if (!colorsContainer) return;

      const existingColors = {};
      const existingTextColor = {};
      const existingColorInputs = colorsContainer.querySelectorAll(
        'input[type="color"]'
      );
      existingColorInputs.forEach((input) => {
        const groupId = input.dataset.group;
        const isTextColor = input.dataset.textColor === "true";
        if (groupId) {
          if (isTextColor) {
            existingTextColor[groupId] = input.value;
          } else {
            existingColors[groupId] = input.value;
          }
        }
      });

      colorsContainer.innerHTML = "";

      // Add Highlighted Text Color option at the top
      const textColorOverrideDiv = document.createElement("div");
      textColorOverrideDiv.className = "color-override text-color-override";

      const hasExistingTextColor =
        existingTextColor["global"] &&
        existingTextColor["global"].trim() !== "";

      textColorOverrideDiv.innerHTML = `
        <label><strong>Highlighted Text Color</strong> (applies to all keywords):</label>
        <div class="text-color-controls">
          <div class="text-color-toggle">
            <input type="checkbox" id="enableTextColor-${
              colorsContainer.dataset.pattern
            }" 
                   ${hasExistingTextColor ? "checked" : ""}>
            <label for="enableTextColor-${
              colorsContainer.dataset.pattern
            }">Customize text color</label>
          </div>
          <div class="color-input-group" style="display: ${
            hasExistingTextColor ? "flex" : "none"
          };">
            <input type="color" value="${
              hasExistingTextColor ? existingTextColor["global"] : "#000000"
            }" 
                   data-pattern="${colorsContainer.dataset.pattern}" 
                   data-group="global" 
                   data-text-color="true">
            <input type="text" value="${
              hasExistingTextColor ? existingTextColor["global"] : ""
            }" 
                   maxlength="7" 
                   placeholder="e.g. #ffffff" 
                   data-pattern="${colorsContainer.dataset.pattern}" 
                   data-group="global" 
                   data-text-color="true">
          </div>
        </div>
        <small style="color: #666; font-size: 11px; margin-top: 4px; display: block;">Leave unchecked to use default text color</small>
      `;

      colorsContainer.appendChild(textColorOverrideDiv);

      const textColorCheckbox = textColorOverrideDiv.querySelector(
        'input[type="checkbox"]'
      );
      const colorInputGroup =
        textColorOverrideDiv.querySelector(".color-input-group");
      const textColorPicker = textColorOverrideDiv.querySelector(
        'input[type="color"]'
      );
      const textHexInput =
        textColorOverrideDiv.querySelector('input[type="text"]');

      // Handle checkbox toggle
      textColorCheckbox.addEventListener("change", (e) => {
        if (e.target.checked) {
          colorInputGroup.style.display = "flex";
          // Set a reasonable default color if none exists
          if (!textHexInput.value) {
            textColorPicker.value = "#000000";
            textHexInput.value = "#000000";
          }
        } else {
          colorInputGroup.style.display = "none";
          textHexInput.value = "";
          textColorPicker.value = "#000000";
        }
      });

      // Handle text color input changes
      textColorPicker.addEventListener("input", (e) => {
        textHexInput.value = e.target.value;
      });

      textHexInput.addEventListener("input", (e) => {
        const hex = e.target.value.trim();
        if (hex === "") {
          textColorCheckbox.checked = false;
          colorInputGroup.style.display = "none";
        } else if (/^#[0-9A-F]{6}$/i.test(hex)) {
          textColorPicker.value = hex;
          textColorCheckbox.checked = true;
          colorInputGroup.style.display = "flex";
        }
      });

      // Add a separator
      const separatorDiv = document.createElement("div");
      separatorDiv.style.borderTop = "1px solid #e0e0e0";
      separatorDiv.style.margin = "12px 0 8px 0";
      colorsContainer.appendChild(separatorDiv);

      keywordGroups.forEach((groupDiv) => {
        const groupId = groupDiv.dataset.groupId;
        const groupTitle = groupDiv.querySelector(
          ".keyword-group-title"
        ).textContent;
        const defaultColorInput = groupDiv.querySelector(
          `input[type="color"][data-group="${groupId}"]`
        );

        const defaultColor =
          existingColors[groupId] ||
          (defaultColorInput ? defaultColorInput.value : "#ffff00");

        const colorOverrideDiv = document.createElement("div");
        colorOverrideDiv.className = "color-override";
        colorOverrideDiv.innerHTML = `
          <label>${this.escapeHtml(groupTitle)}:</label>
          <div class="color-input-group">
            <input type="color" value="${defaultColor}" data-pattern="${
          colorsContainer.dataset.pattern
        }" data-group="${groupId}">
            <input type="text" value="${defaultColor}" maxlength="7" placeholder="#ffff00" data-pattern="${
          colorsContainer.dataset.pattern
        }" data-group="${groupId}">
          </div>
        `;

        colorsContainer.appendChild(colorOverrideDiv);

        const colorPicker = colorOverrideDiv.querySelector(
          'input[type="color"]'
        );
        const hexInput = colorOverrideDiv.querySelector('input[type="text"]');

        colorPicker.addEventListener("input", (e) => {
          hexInput.value = e.target.value;
        });

        hexInput.addEventListener("input", (e) => {
          const hex = e.target.value;
          if (/^#[0-9A-F]{6}$/i.test(hex)) {
            colorPicker.value = hex;
          }
        });
      });
    });
  }

  async loadExtensionState() {
    const result = await chrome.storage.sync.get([
      "extensionEnabled",
      "keywordBank",
    ]);
    const isEnabled = result.extensionEnabled !== false;
    document.getElementById("extensionToggle").checked = isEnabled;

    this.keywordBank = result.keywordBank || [];
    this.loadKeywordBankToUI();

    if (this.keywordBank.length > 0) {
      this.displayKeywordBankPreview(this.keywordBank);
    }
  }

  async handleToggleChange(event) {
    const isEnabled = event.target.checked;
    await chrome.storage.sync.set({ extensionEnabled: isEnabled });

    const tabs = await chrome.tabs.query({});
    tabs.forEach((tab) => {
      chrome.tabs
        .sendMessage(tab.id, {
          action: "toggleExtension",
          enabled: isEnabled,
        })
        .catch(() => {});
    });
  }

  handleViewToggle(event) {
    const viewType = event.target.value;
    const profileForm = document.getElementById("profileForm");
    const profilesSection = document.querySelector(".profiles-section");

    if (viewType === "input") {
      profileForm.style.display = "block";
      profilesSection.style.display = "none";
    } else if (viewType === "saved") {
      profileForm.style.display = "none";
      profilesSection.style.display = "block";
    }
  }

  validateForm() {
    const urlPatterns = document.querySelectorAll(".url-pattern");
    const keywordGroups = document.querySelectorAll(".keyword-group");
    const saveButton = document.getElementById("saveProfile");

    let hasValidPatterns = false;
    let hasValidGroups = false;

    console.log("=== URL VALIDATION DEBUG ===");
    urlPatterns.forEach((pattern, index) => {
      const urlInput = pattern.querySelector(".pattern-url-input");
      if (urlInput && urlInput.value.trim()) {
        const rawValue = urlInput.value.trim();
        console.log(`Pattern ${index}: Raw value: "${rawValue}"`);

        // Parse multiple URLs from the textarea using URL-specific parsing
        const urlList = this.parseUrls(rawValue);
        console.log(`Pattern ${index}: Parsed URLs:`, urlList);

        // Check if at least one URL is valid
        const validUrls = [];
        const invalidUrls = [];

        urlList.forEach((url) => {
          const isValid = this.isValidUrlPattern(url);
          console.log(`  URL "${url}" -> Valid: ${isValid}`);
          if (isValid) {
            validUrls.push(url);
          } else {
            invalidUrls.push(url);
          }
        });

        console.log(
          `Pattern ${index}: Valid URLs: ${validUrls.length}, Invalid URLs: ${invalidUrls.length}`
        );

        if (validUrls.length > 0) {
          hasValidPatterns = true;
        }
      } else {
        console.log(`Pattern ${index}: No URL input or empty value`);
      }
    });

    // Check if any keyword group has actual keywords
    keywordGroups.forEach((groupDiv) => {
      const keywords = this.getKeywordValues(groupDiv);
      if (keywords && keywords.length > 0) {
        hasValidGroups = true;
      }
    });

    const isValid = hasValidPatterns && hasValidGroups;
    saveButton.disabled = !isValid;

    console.log("URL validation result:", {
      hasValidPatterns,
      hasValidGroups,
      isValid,
      saveButtonDisabled: saveButton.disabled,
    });
    console.log("=== END URL VALIDATION DEBUG ===");
  }

  async handleSaveProfile() {
    console.log("=== HANDLE SAVE PROFILE CALLED ===");

    const saveButton = document.getElementById("saveProfile");
    if (saveButton.disabled) {
      console.log("Save button is disabled, cannot save profile");
      return;
    }

    const profileName = document.getElementById("profileName").value.trim();
    const keywordGroups = document.querySelectorAll(".keyword-group");
    const urlPatterns = document.querySelectorAll(".url-pattern");

    console.log("Save profile data:", {
      profileName,
      keywordGroupsCount: keywordGroups.length,
      urlPatternsCount: urlPatterns.length,
      currentEditingId: this.currentEditingId,
    });

    let patterns = [];
    let hasValidPatterns = false;

    urlPatterns.forEach((patternDiv, patternIndex) => {
      const urlInput = patternDiv.querySelector(".pattern-url-input");

      if (!urlInput || !urlInput.value.trim()) return;

      const urlInputValue = urlInput.value.trim();

      // Parse comma-separated and newline-separated URLs using the URL-specific parser
      const urlList = this.parseUrls(urlInputValue);

      if (urlList.length === 0) return;

      // Validate each URL
      for (const urlPattern of urlList) {
        if (!this.isValidUrlPattern(urlPattern)) {
          alert(`Please enter a valid URL pattern: ${urlPattern}`);
          return;
        }
      }

      hasValidPatterns = true;

      const colorOverrides = {};
      const textColorOverrides = {};
      if (this.profileMode === "multi") {
        const patternColors = patternDiv.querySelector(".pattern-colors");
        if (patternColors) {
          const overrideInputs = patternColors.querySelectorAll(
            'input[type="color"]'
          );
          overrideInputs.forEach((input) => {
            const groupId = input.dataset.group;
            const isTextColor = input.dataset.textColor === "true";
            const isEmpty = input.hasAttribute("data-empty");

            if (groupId) {
              if (isTextColor) {
                // Check if text color customization is enabled via checkbox
                const textColorCheckbox = patternColors.querySelector(
                  `input[type="checkbox"][id*="enableTextColor"]`
                );
                const isTextColorEnabled =
                  textColorCheckbox && textColorCheckbox.checked;

                if (isTextColorEnabled) {
                  // For text color, also check the corresponding text input
                  const textInput = patternColors.querySelector(
                    `input[type="text"][data-group="${groupId}"][data-text-color="true"]`
                  );
                  const textValue = textInput ? textInput.value.trim() : "";

                  // Only save text color if checkbox is checked and valid hex
                  if (textValue && /^#[0-9A-F]{6}$/i.test(textValue)) {
                    textColorOverrides[groupId] = textValue;
                    console.log(
                      `Saving text color override for pattern ${patternIndex}, group ${groupId}: ${textValue}`
                    );
                  }
                } else {
                  console.log(
                    `Text color disabled for pattern ${patternIndex}, group ${groupId} - not saving any text color data`
                  );
                  // Explicitly ensure no text color is saved when disabled
                  // textColorOverrides[groupId] will remain undefined
                }
              } else {
                colorOverrides[groupId] = input.value;
                console.log(
                  `Saving color override for pattern ${patternIndex}, group ${groupId}: ${input.value}`
                );
              }
            }
          });
        }
      }

      // Create a single pattern entry for all URLs from this textarea with the same color overrides
      const patternData = {
        urlPattern: urlList, // Store as array for multiple URLs
        colorOverrides: colorOverrides,
      };

      // Only include textColorOverrides if there are actually any text colors to save
      if (Object.keys(textColorOverrides).length > 0) {
        patternData.textColorOverrides = textColorOverrides;
      }

      patterns.push(patternData);
    });

    if (!hasValidPatterns) {
      alert("Please enter at least one valid URL pattern.");
      return;
    }

    const groups = [];
    keywordGroups.forEach((groupDiv) => {
      const groupId = groupDiv.dataset.groupId;
      const colorPicker = groupDiv.querySelector(
        `input[type="color"][data-group="${groupId}"]`
      );
      const nameInput = groupDiv.querySelector(
        `input[data-group="${groupId}"][data-type="name"]`
      );

      const keywords = this.getKeywordValues(groupDiv);

      const group = {
        id: groupId,
        color: colorPicker ? colorPicker.value : "#ffff00",
        keywords: keywords,
      };

      const customName = nameInput.value.trim();
      if (customName) {
        group.name = customName;
      }

      groups.push(group);
    });

    if (groups.length === 0) {
      alert("Please add at least one keyword group.");
      return;
    }

    const profile = {
      id: this.currentEditingId || this.generateId(),
      urlPatterns: patterns,
      keywordGroups: groups,
      isMultiUrl: this.profileMode === "multi",
      exactCase: this.exactCase,
    };

    if (profileName) {
      profile.name = profileName;
    }

    console.log("Final profile object to save:", profile);

    try {
      await this.saveProfile(profile);
      console.log("Profile saved successfully");
      this.resetForm();
      await this.loadProfiles();
      console.log("=== SAVE PROFILE COMPLETED ===");
    } catch (error) {
      console.error("Error saving profile:", error);
      alert("Error saving profile: " + error.message);
    }
  }

  isValidUrlPattern(pattern) {
    console.log(`    Validating URL pattern: "${pattern}"`);
    try {
      const urlToTest = pattern.replace(/\*$/, "");
      console.log(`    URL after removing trailing *: "${urlToTest}"`);

      const url = new URL(urlToTest);
      console.log(
        `    Parsed URL: protocol="${url.protocol}", hostname="${url.hostname}"`
      );

      if (!["http:", "https:", "file:"].includes(url.protocol)) {
        console.log(`    INVALID: Protocol "${url.protocol}" not allowed`);
        return false;
      }

      if (url.protocol === "file:") {
        console.log(`    VALID: File protocol accepted`);
        return true;
      }

      if (!url.hostname || url.hostname.length === 0) {
        console.log(`    INVALID: No hostname or empty hostname`);
        return false;
      }

      console.log(`    VALID: URL pattern accepted`);
      return true;
    } catch (error) {
      console.log(`    INVALID: URL parsing failed - ${error.message}`);
      return false;
    }
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  async saveProfile(profile) {
    console.log("=== SAVING PROFILE ===");
    console.log("Profile being saved:", profile);

    const result = await chrome.storage.sync.get(["profiles"]);
    let profiles = result.profiles || [];

    if (this.currentEditingId) {
      console.log("Updating existing profile with ID:", this.currentEditingId);
      const index = profiles.findIndex((p) => p.id === this.currentEditingId);
      if (index !== -1) {
        profiles[index] = profile;
        console.log("Profile updated at index:", index);
      }
    } else {
      console.log("Adding new profile");
      profiles.push(profile);
    }

    profiles.sort((a, b) => {
      const aLength = a.urlPatterns
        ? Math.max(
            ...a.urlPatterns.map((p) => {
              const urlPattern = p.urlPattern;
              if (Array.isArray(urlPattern)) {
                return Math.max(...urlPattern.map((u) => u.length));
              }
              return urlPattern?.length || 0;
            })
          )
        : a.urlPattern?.length || 0;
      const bLength = b.urlPatterns
        ? Math.max(
            ...b.urlPatterns.map((p) => {
              const urlPattern = p.urlPattern;
              if (Array.isArray(urlPattern)) {
                return Math.max(...urlPattern.map((u) => u.length));
              }
              return urlPattern?.length || 0;
            })
          )
        : b.urlPattern?.length || 0;
      return bLength - aLength;
    });

    await chrome.storage.sync.set({ profiles });
    console.log(`Total profiles saved: ${profiles.length}`);
    console.log("All profiles in storage:", profiles);

    this.cachedProfiles = profiles;

    console.log("Notifying content scripts...");
    this.notifyContentScripts();
  }

  async notifyContentScripts() {
    const tabs = await chrome.tabs.query({});

    tabs.forEach((tab, index) => {
      chrome.tabs
        .sendMessage(tab.id, {
          action: "updateProfiles",
        })
        .catch((error) => {
          console.log(`Failed to notify tab:`, error);
        });
    });
  }

  handleCancelEdit() {
    this.resetForm();
  }

  resetForm() {
    this.currentEditingId = null;
    this.keywordGroupCounter = 0;
    this.urlPatternCounter = 0;
    document.getElementById("formTitle").textContent = "Add New Profile";
    document.getElementById("profileName").value = "";
    document.getElementById("saveProfile").textContent = "Save Profile";
    document.getElementById("cancelEdit").style.display = "none";

    document.querySelectorAll(".autocomplete-dropdown").forEach((dropdown) => {
      dropdown.remove();
    });

    const patternsContainer = document.getElementById("urlPatterns");
    patternsContainer.innerHTML = "";
    this.addUrlPattern();

    const groupsContainer = document.getElementById("keywordGroups");
    groupsContainer.innerHTML = "";
    this.addKeywordGroup();

    this.exactCase = false;
    document.getElementById("exactCaseToggle").checked = false;

    if (this.keywordBank.length > 0) {
      this.displayKeywordBankPreview(this.keywordBank);
    }

    this.validateForm();
  }

  async loadProfiles() {
    const result = await chrome.storage.sync.get(["profiles", "keywordBank"]);
    const profiles = result.profiles || [];

    this.cachedProfiles = profiles;

    this.keywordBank = result.keywordBank || [];
    this.loadKeywordBankToUI();

    const profilesList = document.getElementById("profilesList");
    const noProfiles = document.getElementById("noProfiles");

    if (profiles.length === 0) {
      profilesList.style.display = "none";
      noProfiles.style.display = "block";
      return;
    }

    profilesList.style.display = "block";
    noProfiles.style.display = "none";

    profilesList.innerHTML = profiles
      .map((profile) => this.createProfileHTML(profile))
      .join("");

    profilesList.querySelectorAll(".edit-profile").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const profileId = e.currentTarget.dataset.profileId;
        this.editProfile(profileId);
      });
    });

    profilesList.querySelectorAll(".duplicate-profile").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const profileId = e.currentTarget.dataset.profileId;
        this.duplicateProfile(profileId);
      });
    });

    profilesList.querySelectorAll(".delete-profile").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const profileId = e.currentTarget.dataset.profileId;
        this.deleteProfile(profileId);
      });
    });
  }

  getUniqueUrls() {
    const result = new Set();
    const profiles = this.getAllProfiles();

    profiles.forEach((profile) => {
      if (profile.urlPatterns && Array.isArray(profile.urlPatterns)) {
        profile.urlPatterns.forEach((pattern) => {
          if (pattern.urlPattern && pattern.urlPattern.trim()) {
            result.add(pattern.urlPattern.trim());
          }
        });
      } else if (profile.urlPattern && profile.urlPattern.trim()) {
        result.add(profile.urlPattern.trim());
      }
    });

    return Array.from(result).sort();
  }

  getUniqueKeywords() {
    const result = new Set();
    const profiles = this.getAllProfiles();

    profiles.forEach((profile) => {
      if (profile.keywordGroups && Array.isArray(profile.keywordGroups)) {
        profile.keywordGroups.forEach((group) => {
          if (group.keywords && Array.isArray(group.keywords)) {
            group.keywords.forEach((keyword) => {
              if (keyword && keyword.trim()) {
                result.add(keyword.trim());
              }
            });
          }
        });
      } else if (profile.keywords && Array.isArray(profile.keywords)) {
        profile.keywords.forEach((keyword) => {
          if (keyword && keyword.trim()) {
            result.add(keyword.trim());
          }
        });
      }
    });

    if (this.keywordBank && Array.isArray(this.keywordBank)) {
      this.keywordBank.forEach((keyword) => {
        if (keyword && keyword.trim()) {
          result.add(keyword.trim());
        }
      });
    }

    return Array.from(result).sort();
  }

  getAvailableKeywordsForGroup(excludeGroupId = null) {
    const allKeywords = this.getUniqueKeywords();

    if (!this.uniqueKeywords) {
      return allKeywords;
    }

    const usedKeywords = new Set();
    const currentGroups = document.querySelectorAll(".keyword-group");

    currentGroups.forEach((groupDiv) => {
      const groupId = groupDiv.dataset.groupId;
      if (groupId !== excludeGroupId) {
        const textarea = groupDiv.querySelector(".keyword-textarea");
        if (textarea && textarea.value.trim()) {
          const keywords = textarea.value
            .split(",")
            .map((k) => k.trim())
            .filter((k) => k);
          keywords.forEach((keyword) =>
            usedKeywords.add(keyword.toLowerCase())
          );
        }
      }
    });

    return allKeywords.filter(
      (keyword) => !usedKeywords.has(keyword.toLowerCase())
    );
  }

  updateAllKeywordDataLists() {
    const keywordGroups = document.querySelectorAll(".keyword-group");
    keywordGroups.forEach((groupDiv) => {
      const groupId = groupDiv.dataset.groupId;
      if (groupId) {
        this.updateKeywordDatalist(groupId);
      }
    });
  }

  getAllProfiles() {
    return this.cachedProfiles || [];
  }

  initializeMultiSelect(
    container,
    type,
    initialValues = [],
    singleSelect = false
  ) {
    const input = container.querySelector(".multi-select-input");
    const tagsContainer = container.querySelector(".selected-tags");

    if (!input || !tagsContainer) return;

    input._multiSelectData = {
      type: type,
      values: [...initialValues],
      singleSelect: singleSelect,
      container: container,
      tagsContainer: tagsContainer,
    };

    initialValues.forEach((value) => {
      this.addTag(input, value, false);
    });

    this.setupMultiSelectEvents(input);

    input.addEventListener("focus", () => {
      input.parentElement.classList.add("focused");
    });

    input.addEventListener("blur", () => {
      setTimeout(() => {
        input.parentElement.classList.remove("focused");
        this.removeDropdown(input);
      }, 150);
    });
  }

  setupMultiSelectEvents(input) {
    const data = input._multiSelectData;

    const showDropdown = () => {
      const suggestions =
        data.type === "keywords"
          ? this.getUniqueKeywords()
          : this.getUniqueUrls();
      const filtered = suggestions.filter(
        (item) => !data.values.includes(item)
      );

      if (filtered.length > 0) {
        this.createMultiSelectDropdown(input, filtered);
      }
    };

    input.addEventListener("focus", showDropdown);
    input.addEventListener("input", () => {
      clearTimeout(input._debounceTimeout);
      input._debounceTimeout = setTimeout(showDropdown, 200);
    });

    input.addEventListener("keydown", (e) => {
      this.handleMultiSelectKeydown(e, input);
    });

    input.addEventListener("paste", (e) => {
      setTimeout(() => {
        this.handlePastedContent(input);
      }, 0);
    });
  }

  handleMultiSelectKeydown(e, input) {
    const data = input._multiSelectData;

    switch (e.key) {
      case "Enter":
        e.preventDefault();
        if (input._dropdown) {
          this.selectHighlightedDropdownItem(input);
        } else {
          this.addCurrentInputAsTag(input);
        }
        break;

      case "Backspace":
        if (input.value === "" && data.values.length > 0) {
          e.preventDefault();
          this.removeLastTag(input);
        }
        break;

      case "ArrowDown":
      case "ArrowUp":
        if (input._dropdown) {
          e.preventDefault();
          this.navigateDropdown(input, e.key === "ArrowDown");
        }
        break;

      case "Escape":
        this.removeDropdown(input);
        break;

      case "Tab":
        if (input._dropdown) {
          e.preventDefault();
          this.selectHighlightedDropdownItem(input);
        }
        break;

      case ",":
        if (data.type === "keywords") {
          e.preventDefault();
          this.addCurrentInputAsTag(input);
        }
        break;
    }
  }

  addCurrentInputAsTag(input) {
    const value = input.value.trim();
    if (value && this.isValidTagValue(input, value)) {
      this.addTag(input, value);
      input.value = "";
      this.removeDropdown(input);
    }
  }

  isValidTagValue(input, value) {
    const data = input._multiSelectData;

    if (data.type === "url") {
      return this.isValidUrlPattern(value);
    }

    return value.length > 0;
  }

  addTag(input, value, updateValidation = true) {
    const data = input._multiSelectData;

    if (data.values.includes(value)) return;

    if (data.singleSelect) {
      data.values.forEach((existingValue) => {
        this.removeTag(input, existingValue, false);
      });
      data.values = [];
    }

    data.values.push(value);

    const tag = document.createElement("span");
    tag.className = "selected-tag";
    tag.dataset.value = value;
    tag.innerHTML = `
      <span class="tag-text">${this.escapeHtml(value)}</span>
      <button type="button" class="remove-tag" aria-label="Remove ${this.escapeHtml(
        value
      )}">×</button>
    `;

    tag.querySelector(".remove-tag").addEventListener("click", (e) => {
      e.stopPropagation();
      this.removeTag(input, value);
    });

    data.tagsContainer.appendChild(tag);

    if (updateValidation) {
      this.validateForm();
    }
  }

  removeTag(input, value, updateValidation = true) {
    const data = input._multiSelectData;
    const index = data.values.indexOf(value);

    if (index > -1) {
      data.values.splice(index, 1);

      const tagElement = data.tagsContainer.querySelector(
        `[data-value="${CSS.escape(value)}"]`
      );
      if (tagElement) {
        tagElement.remove();
      }

      if (updateValidation) {
        this.validateForm();
      }
    }
  }

  removeLastTag(input) {
    const data = input._multiSelectData;
    if (data.values.length > 0) {
      const lastValue = data.values[data.values.length - 1];
      this.removeTag(input, lastValue);
    }
  }

  handlePastedContent(input) {
    const data = input._multiSelectData;
    const value = input.value;

    if (data.type === "keywords" && value.includes(",")) {
      const items = value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item);
      input.value = "";

      items.forEach((item) => {
        if (this.isValidTagValue(input, item)) {
          this.addTag(input, item, false);
        }
      });

      this.validateForm();
    }
  }

  getMultiSelectValues(container, type) {
    if (type === "keywords") {
      return this.getKeywordValues(container);
    } else if (type === "url") {
      return this.getUrlValues(container);
    }
    return [];
  }

  getKeywordValues(container) {
    const textarea = container.querySelector(".keyword-textarea");
    if (textarea && textarea.value.trim()) {
      return this.parseKeywords(textarea.value.trim(), true).filter((k) =>
        this.isValidKeyword(k)
      );
    }
    return [];
  }

  getUrlValues(container) {
    const urlInput = container.querySelector(".pattern-url-input");
    const urlTextarea = container.querySelector(".url-textarea");

    if (urlTextarea) {
      const urlText = urlTextarea.value.trim();
      if (!urlText) return [];

      return urlText
        .split(",")
        .map((url) => url.trim())
        .filter((url) => url && this.isValidUrlPattern(url));
    } else if (urlInput && urlInput.value.trim()) {
      return [urlInput.value.trim()];
    }
    return [];
  }

  addKeywordFromInput(groupDiv) {
    const input = groupDiv.querySelector(".keyword-input");
    const keyword = input.value.trim();

    if (keyword && this.isValidKeyword(keyword)) {
      this.addKeywordTag(groupDiv, keyword);
      input.value = "";
      this.validateForm();
    }
  }

  setUrlFromInput(patternDiv) {
    const input = patternDiv.querySelector(".pattern-url-input");
    const url = input.value.trim();

    if (url && this.isValidUrlPattern(url)) {
      this.setUrlTag(patternDiv, url);
      this.validateForm();
    }
  }

  addKeywordTag(groupDiv, keyword) {
    const tagsContainer = groupDiv.querySelector(".selected-tags");
    const existingTags = tagsContainer.querySelectorAll(".tag");

    for (let tag of existingTags) {
      if (tag.dataset.value === keyword) {
        return;
      }
    }

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.dataset.value = keyword;
    tag.innerHTML = `
      <span class="tag-text">${this.escapeHtml(keyword)}</span>
      <button type="button" class="tag-remove" aria-label="Remove ${this.escapeHtml(
        keyword
      )}">×</button>
    `;

    tag.querySelector(".tag-remove").addEventListener("click", (e) => {
      e.stopPropagation();
      tag.remove();
      this.validateForm();
    });

    tagsContainer.appendChild(tag);
    this.validateForm();
  }

  setUrlTag(patternDiv, url) {
    const tagsContainer = patternDiv.querySelector(".selected-tags");
    const input = patternDiv.querySelector(".pattern-url-input");

    tagsContainer.innerHTML = "";

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.dataset.value = url;
    tag.innerHTML = `
      <span class="tag-text">${this.escapeHtml(url)}</span>
      <button type="button" class="tag-remove" aria-label="Remove ${this.escapeHtml(
        url
      )}">×</button>
    `;

    tag.querySelector(".tag-remove").addEventListener("click", (e) => {
      e.stopPropagation();
      tag.remove();
      input.value = "";
      this.validateForm();
    });

    tagsContainer.appendChild(tag);
    input.value = url;
    this.validateForm();
  }

  setupKeywordDropdownInteraction(textarea, groupId) {
    const datalist = document.getElementById(`keywords-datalist-${groupId}`);

    textarea.addEventListener("input", (e) => {
      const lastWord = this.getLastWordFromTextarea(textarea);
      const datalistOptions = Array.from(datalist.options).map(
        (opt) => opt.value
      );

      if (datalistOptions.includes(lastWord)) {
        this.ensureCommaSeparation(textarea);
      }
    });
  }

  getLastWordFromTextarea(textarea) {
    const value = textarea.value;
    const lastCommaIndex = value.lastIndexOf(",");
    return value.substring(lastCommaIndex + 1).trim();
  }

  ensureCommaSeparation(textarea) {
    let value = textarea.value;

    if (value && !value.endsWith(", ") && !value.endsWith(",")) {
      if (!value.endsWith(" ")) {
        value += ", ";
      } else {
        value = value.trimEnd() + ", ";
      }
      textarea.value = value;
    }
  }

  addKeywordToTextarea(textarea, keyword) {
    let currentValue = textarea.value.trim();

    const existingKeywords = currentValue
      .split(/[,\/]/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    if (existingKeywords.includes(keyword)) {
      return;
    }

    if (currentValue) {
      if (!currentValue.endsWith(",")) {
        currentValue += ", ";
      } else {
        currentValue += " ";
      }
    }

    textarea.value = currentValue + keyword + ", ";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    this.validateForm();
  }

  updateKeywordDatalist(groupId) {
    const datalist = document.getElementById(`keywords-datalist-${groupId}`);
    if (!datalist) return;

    const availableKeywords = this.getAvailableKeywordsForGroup(groupId);
    const groupDiv = document.querySelector(
      `.keyword-group[data-group-id="${groupId}"]`
    );
    const existingKeywords = this.getKeywordValues(groupDiv);

    const filteredKeywords = availableKeywords.filter(
      (k) => !existingKeywords.includes(k)
    );

    datalist.innerHTML = filteredKeywords
      .map(
        (keyword) =>
          `<option value="${this.escapeHtml(keyword)}">${this.escapeHtml(
            keyword
          )}</option>`
      )
      .join("");

    this.createClickableKeywordOptions(groupId, filteredKeywords);
  }

  createClickableKeywordOptions(groupId, keywords) {
    const groupDiv = document.querySelector(
      `.keyword-group[data-group-id="${groupId}"]`
    );
    if (!groupDiv) return;

    const existingOptions = groupDiv.querySelector(".clickable-keywords");
    if (existingOptions) {
      existingOptions.remove();
    }

    const uniqueKeywords = [...new Set(keywords)].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );

    const optionsContainer = document.createElement("div");
    optionsContainer.className = "clickable-keywords";

    if (uniqueKeywords.length > 0) {
      optionsContainer.innerHTML = `
        <small style="color: #666; margin-bottom: 5px; display: block;">
          Quick add (click to add) - ${uniqueKeywords.length} available:
        </small>
        <div class="keyword-options-scrollable">
          ${uniqueKeywords
            .map(
              (keyword) =>
                `<button type="button" class="keyword-option-btn" data-keyword="${this.escapeHtml(
                  keyword
                )}">${this.escapeHtml(keyword)}</button>`
            )
            .join("")}
        </div>
      `;

      optionsContainer
        .querySelectorAll(".keyword-option-btn")
        .forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            const keyword = btn.dataset.keyword;
            const textarea = groupDiv.querySelector(".keyword-textarea");
            this.addKeywordToTextarea(textarea, keyword);

            btn.style.opacity = "0.5";
            btn.disabled = true;
            btn.textContent = "✓ Added";

            setTimeout(() => {
              if (this.uniqueKeywords) {
                this.updateAllKeywordDataLists();
                if (this.keywordBank.length > 0) {
                  this.displayKeywordBankPreview(this.keywordBank);
                }
              } else {
                this.updateKeywordDatalist(groupId);
              }
            }, 500);
          });
        });
    } else {
      optionsContainer.innerHTML = `
        <small style="color: #999; margin-bottom: 5px; display: block; font-style: italic;">
          No additional keywords available from saved profiles
        </small>
      `;
    }

    const inputWrapper = groupDiv.querySelector(".input-select-wrapper");
    inputWrapper.parentNode.insertBefore(
      optionsContainer,
      inputWrapper.nextSibling
    );
  }

  updateUrlDatalist(patternId) {
    const datalist = document.getElementById(`urls-datalist-${patternId}`);
    if (!datalist) return;

    const uniqueUrls = this.getUniqueUrls();
    const patternDiv = document.querySelector(
      `.url-pattern[data-pattern-id="${patternId}"]`
    );
    const existingUrls = this.getUrlValues(patternDiv);

    const availableUrls = uniqueUrls.filter(
      (url) => !existingUrls.includes(url)
    );

    datalist.innerHTML = availableUrls
      .map((url) => `<option value="${this.escapeHtml(url)}">`)
      .join("");

    if (this.profileMode === "multi") {
      this.createClickableUrlOptions(patternId, availableUrls);
    }
  }

  createClickableUrlOptions(patternId, urls) {
    const patternDiv = document.querySelector(
      `.url-pattern[data-pattern-id="${patternId}"]`
    );
    if (!patternDiv) return;

    const optionsScrollable = patternDiv.querySelector(
      ".url-options-scrollable"
    );
    if (!optionsScrollable) return;

    const uniqueUrls = [...new Set(urls)].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );

    if (uniqueUrls.length > 0) {
      optionsScrollable.innerHTML = uniqueUrls
        .map((url) => {
          return `
          <button type="button" class="keyword-option-btn" data-url="${this.escapeHtml(
            url
          )}">
            ${this.escapeHtml(url)}
          </button>
        `;
        })
        .join("");

      optionsScrollable
        .querySelectorAll(".keyword-option-btn")
        .forEach((btn) => {
          btn.addEventListener("click", () => {
            const url = btn.dataset.url;
            const textarea = patternDiv.querySelector(".url-textarea");

            if (textarea && url) {
              this.addUrlToTextarea(textarea, url);
            }

            btn.style.opacity = "0.5";
            btn.disabled = true;
            btn.textContent = "✓ Added";

            setTimeout(() => {
              this.updateUrlDatalist(patternId);
            }, 500);
          });
        });
    } else {
      optionsScrollable.innerHTML = `
        <small style="color: #999; margin-bottom: 5px; display: block; font-style: italic;">
          No additional URLs available from saved profiles
        </small>
      `;
    }
  }

  setupUrlDropdownInteraction(textarea, patternId) {
    if (!textarea) return;

    textarea.addEventListener("input", () => {
      this.updateUrlDatalist(patternId);
    });

    textarea.addEventListener("focus", () => {
      this.updateUrlDatalist(patternId);
    });
  }

  addUrlToTextarea(textarea, url) {
    if (!textarea || !url) return;

    let currentValue = textarea.value.trim();

    const currentUrls = currentValue
      .split(",")
      .map((u) => u.trim())
      .filter((u) => u);
    if (currentUrls.includes(url)) {
      return;
    }

    if (currentValue) {
      if (!currentValue.endsWith(",")) {
        currentValue += ", ";
      } else if (!currentValue.endsWith(" ")) {
        currentValue += " ";
      }
    }

    textarea.value = currentValue + url + ", ";
    this.validateForm();
  }

  isValidKeyword(keyword) {
    return keyword && keyword.trim().length > 0;
  }

  setMultiSelectValues(container, values, singleSelect = false) {
    if (singleSelect && values.length > 0) {
      this.setUrlTag(container, values[0]);
    } else {
      const textarea = container.querySelector(".keyword-textarea");
      if (textarea && values.length > 0) {
        textarea.value = values.join(", ");
      }
    }
  }

  createDropdown(inputElement, options, onSelect) {
    this.removeDropdown(inputElement);

    if (!options || options.length === 0) {
      return;
    }

    const dropdown = document.createElement("div");
    dropdown.className = "autocomplete-dropdown";
    dropdown.style.position = "absolute";
    dropdown.style.zIndex = "1000";
    dropdown.style.backgroundColor = "white";
    dropdown.style.border = "1px solid #ccc";
    dropdown.style.borderTop = "none";
    dropdown.style.maxHeight = "150px";
    dropdown.style.overflowY = "auto";
    dropdown.style.width = inputElement.offsetWidth + "px";

    const filterValue = inputElement.value.toLowerCase();
    const filteredOptions = options.filter((option) =>
      option.toLowerCase().includes(filterValue)
    );

    filteredOptions.forEach((option) => {
      const item = document.createElement("div");
      item.className = "autocomplete-item";
      item.textContent = option;
      item.style.padding = "8px 12px";
      item.style.cursor = "pointer";
      item.style.borderBottom = "1px solid #eee";

      item.addEventListener("click", () => {
        onSelect(option);
        this.removeDropdown(inputElement);
      });

      item.addEventListener("mouseenter", () => {
        item.style.backgroundColor = "#f0f0f0";
      });

      item.addEventListener("mouseleave", () => {
        item.style.backgroundColor = "white";
      });

      dropdown.appendChild(item);
    });

    this.positionDropdown(inputElement, dropdown);

    inputElement._dropdown = dropdown;

    const container = inputElement.closest(".container") || document.body;
    container.appendChild(dropdown);

    let scrollTimeout;
    const updatePosition = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (inputElement._dropdown) {
          this.positionDropdown(inputElement, dropdown);
        }
      }, 10);
    };

    const scrollContainer = document.querySelector(".container");
    if (scrollContainer) {
      scrollContainer.addEventListener("scroll", updatePosition, {
        passive: true,
      });
      inputElement._scrollListener = updatePosition;
    }

    const closeDropdown = (e) => {
      if (!dropdown.contains(e.target) && e.target !== inputElement) {
        this.removeDropdown(inputElement);
        document.removeEventListener("click", closeDropdown);
        if (scrollContainer && inputElement._scrollListener) {
          scrollContainer.removeEventListener(
            "scroll",
            inputElement._scrollListener
          );
        }
      }
    };
    setTimeout(() => document.addEventListener("click", closeDropdown), 0);
  }

  positionDropdown(inputElement, dropdown) {
    const container = inputElement.closest(".container") || document.body;
    const containerRect = container.getBoundingClientRect();
    const inputRect = inputElement.getBoundingClientRect();

    const top = inputRect.bottom - containerRect.top + container.scrollTop;
    const left = inputRect.left - containerRect.left + container.scrollLeft;

    const dropdownHeight = 150;
    const containerBottom = container.scrollTop + container.clientHeight;

    let finalTop = top;

    if (top + dropdownHeight > containerBottom) {
      const inputTop = inputRect.top - containerRect.top + container.scrollTop;
      finalTop = inputTop - dropdownHeight;

      if (finalTop < container.scrollTop) {
        finalTop = top;
        dropdown.style.maxHeight =
          Math.min(dropdownHeight, containerBottom - top - 10) + "px";
      } else {
        dropdown.style.maxHeight = "150px";
      }
    } else {
      dropdown.style.maxHeight = "150px";
    }

    dropdown.style.top = finalTop + "px";
    dropdown.style.left = left + "px";
    dropdown.style.width = inputElement.offsetWidth + "px";
  }

  removeDropdown(inputElement) {
    if (inputElement._dropdown) {
      inputElement._dropdown.remove();
      inputElement._dropdown = null;
    }

    if (inputElement._scrollListener) {
      const scrollContainer = document.querySelector(".container");
      if (scrollContainer) {
        scrollContainer.removeEventListener(
          "scroll",
          inputElement._scrollListener
        );
      }
      inputElement._scrollListener = null;
    }

    if (inputElement._inputTimeout) {
      clearTimeout(inputElement._inputTimeout);
      inputElement._inputTimeout = null;
    }
  }

  setupUrlDropdown(urlInput) {
    const showDropdown = () => {
      const urls = this.getUniqueUrls();
      if (urls.length === 0) return;

      this.createDropdown(urlInput, urls, (selectedUrl) => {
        urlInput.value = selectedUrl;
        this.validateForm();
        setTimeout(() => {
          if (document.activeElement === urlInput) {
            this.showFilteredDropdown(urlInput, urls);
          }
        }, 50);
      });
    };

    urlInput.addEventListener("focus", showDropdown);

    urlInput.addEventListener("input", showDropdown);

    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        this.navigateDropdown(urlInput, e.key === "ArrowDown");
      } else if (e.key === "Enter" && urlInput._dropdown) {
        e.preventDefault();
        this.selectHighlightedDropdownItem(urlInput);
      } else if (e.key === "Escape") {
        this.removeDropdown(urlInput);
      }
    });
  }

  setupKeywordDropdown(keywordTextarea) {
    let isMultiSelecting = false;

    const showDropdown = () => {
      let keywords;

      if (this.uniqueKeywords) {
        keywords = this.getUniqueKeywords();

        const allUsedKeywords = this.getAllRawKeywordsFromGroups();
        const allUsedKeywordsLowercase = allUsedKeywords.map((k) =>
          k.toLowerCase()
        );

        keywords = keywords.filter((keyword) => {
          return !allUsedKeywordsLowercase.includes(keyword.toLowerCase());
        });

        console.log("Extension Debug - Dropdown unique mode:", {
          totalAvailable: keywords.length,
          keywords: keywords,
          allUsedKeywords: allUsedKeywords,
          filteredOut: this.getUniqueKeywords().length - keywords.length,
        });
      } else {
        keywords = this.getUniqueKeywords();
      }

      if (keywords.length === 0) return;

      const currentKeywords = this.getCurrentKeywords(keywordTextarea);
      const availableKeywords = keywords.filter((keyword) => {
        const keywordToCheck = this.exactCase ? keyword : keyword.toLowerCase();
        return !currentKeywords.includes(keywordToCheck);
      });

      this.createKeywordDropdown(
        keywordTextarea,
        availableKeywords,
        (selectedKeyword) => {
          this.addKeywordToTextarea(keywordTextarea, selectedKeyword);
          this.validateForm();

          if (!isMultiSelecting) {
            setTimeout(() => {
              if (document.activeElement === keywordTextarea) {
                isMultiSelecting = true;
                showDropdown();
                isMultiSelecting = false;
              }
            }, 100);
          }
        }
      );
    };

    keywordTextarea.addEventListener("focus", showDropdown);

    keywordTextarea.addEventListener("input", () => {
      clearTimeout(keywordTextarea._inputTimeout);
      keywordTextarea._inputTimeout = setTimeout(showDropdown, 200);
    });

    keywordTextarea.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (keywordTextarea._dropdown) {
          e.preventDefault();
          this.navigateDropdown(keywordTextarea, e.key === "ArrowDown");
        }
      } else if (e.key === "Enter" && keywordTextarea._dropdown) {
        e.preventDefault();
        this.selectHighlightedDropdownItem(keywordTextarea);
      } else if (e.key === "Escape") {
        this.removeDropdown(keywordTextarea);
      } else if (e.key === "Tab" && keywordTextarea._dropdown) {
        e.preventDefault();
        this.selectHighlightedDropdownItem(keywordTextarea);
      }
    });
  }

  getCurrentKeywords(textarea) {
    const value = textarea.value.trim();
    if (!value) return [];

    return value
      .split(/[,\/]/)
      .map((keyword) => {
        const trimmed = keyword.trim();
        return this.exactCase ? trimmed : trimmed.toLowerCase();
      })
      .filter((keyword) => keyword.length > 0);
  }

  addKeywordToTextarea(textarea, keyword) {
    const currentValue = textarea.value.trim();
    const currentKeywords = this.getCurrentKeywords(textarea);

    const keywordToCheck = this.exactCase ? keyword : keyword.toLowerCase();
    if (currentKeywords.includes(keywordToCheck)) {
      return;
    }

    let newValue;
    if (currentValue === "") {
      newValue = keyword;
    } else if (currentValue.endsWith(",") || currentValue.endsWith(", ")) {
      newValue =
        currentValue + (currentValue.endsWith(", ") ? "" : " ") + keyword;
    } else {
      newValue = currentValue + ", " + keyword;
    }

    textarea.value = newValue;

    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    const cursorPos = newValue.length;
    textarea.setSelectionRange(cursorPos, cursorPos);
    textarea.focus();
  }

  navigateDropdown(inputElement, isDown) {
    const dropdown = inputElement._dropdown;
    if (!dropdown) return;

    const items = dropdown.querySelectorAll(".autocomplete-item");
    if (items.length === 0) return;

    let currentIndex = -1;
    items.forEach((item, index) => {
      if (item.classList.contains("highlighted")) {
        currentIndex = index;
        item.classList.remove("highlighted");
        item.style.backgroundColor = "white";
      }
    });

    if (isDown) {
      currentIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
    } else {
      currentIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
    }

    items[currentIndex].classList.add("highlighted");
    items[currentIndex].style.backgroundColor = "#f0f0f0";
    items[currentIndex].scrollIntoView({ block: "nearest" });
  }

  createKeywordDropdown(inputElement, options, onSelect) {
    this.removeDropdown(inputElement);

    if (!options || options.length === 0) {
      return;
    }

    const dropdown = document.createElement("div");
    dropdown.className = "autocomplete-dropdown keyword-dropdown";
    dropdown.style.position = "absolute";
    dropdown.style.zIndex = "1000";
    dropdown.style.backgroundColor = "white";
    dropdown.style.border = "1px solid #ccc";
    dropdown.style.borderTop = "none";
    dropdown.style.maxHeight = "200px";
    dropdown.style.overflowY = "auto";
    dropdown.style.width = inputElement.offsetWidth + "px";

    const header = document.createElement("div");
    header.className = "dropdown-header";
    header.innerHTML = `
      <small style="padding: 6px 12px; display: block; background: #f8f9fa; border-bottom: 1px solid #eee; color: #6c757d; font-size: 11px;">
        💡 Click multiple keywords to add them quickly
      </small>
    `;
    dropdown.appendChild(header);

    const filterValue =
      this.getLastKeywordFromInput(inputElement).toLowerCase();
    const filteredOptions = options.filter((option) =>
      option.toLowerCase().includes(filterValue)
    );

    if (filteredOptions.length > 1) {
      const addAllItem = document.createElement("div");
      addAllItem.className = "autocomplete-item add-all-item";
      addAllItem.innerHTML = `<strong>📝 Add all visible (${filteredOptions.length} keywords)</strong>`;
      addAllItem.style.padding = "8px 12px";
      addAllItem.style.cursor = "pointer";
      addAllItem.style.borderBottom = "1px solid #eee";
      addAllItem.style.backgroundColor = "#e7f3ff";
      addAllItem.style.fontWeight = "bold";

      addAllItem.addEventListener("click", () => {
        filteredOptions.forEach((keyword) => {
          this.addKeywordToTextarea(inputElement, keyword);
        });
        this.validateForm();
        this.removeDropdown(inputElement);
        setTimeout(() => {
          inputElement.focus();
          this.setupKeywordDropdown(inputElement);
        }, 100);
      });

      dropdown.appendChild(addAllItem);
    }

    filteredOptions.forEach((option, index) => {
      const item = document.createElement("div");
      item.className = "autocomplete-item";
      item.style.padding = "8px 12px";
      item.style.cursor = "pointer";
      item.style.borderBottom = "1px solid #eee";
      item.style.display = "flex";
      item.style.justifyContent = "space-between";
      item.style.alignItems = "center";

      const regex = new RegExp(`(${this.escapeRegex(filterValue)})`, "gi");
      const highlightedText = option.replace(
        regex,
        '<mark style="background: #fff3cd;">$1</mark>'
      );

      item.innerHTML = `
        <span>${highlightedText}</span>
        <small style="color: #28a745; opacity: 0; transition: opacity 0.2s;">✓ Added</small>
      `;

      item.addEventListener("click", () => {
        onSelect(option);

        const feedback = item.querySelector("small");
        feedback.style.opacity = "1";
        item.style.backgroundColor = "#d4edda";

        setTimeout(() => {
          feedback.style.opacity = "0";
          item.style.backgroundColor = "white";
        }, 800);
      });

      item.addEventListener("mouseenter", () => {
        if (item.style.backgroundColor !== "rgb(212, 237, 218)") {
          item.style.backgroundColor = "#f0f0f0";
        }
      });

      item.addEventListener("mouseleave", () => {
        if (item.style.backgroundColor !== "rgb(212, 237, 218)") {
          item.style.backgroundColor = "white";
        }
      });

      dropdown.appendChild(item);
    });

    if (filteredOptions.length > 0) {
      const footer = document.createElement("div");
      footer.className = "dropdown-footer";
      footer.innerHTML = `
        <small style="padding: 6px 12px; display: block; background: #f8f9fa; border-top: 1px solid #eee; color: #6c757d; font-size: 10px;">
          ⌨️ Use Tab/Enter to select • ↑↓ to navigate • Esc to close
        </small>
      `;
      dropdown.appendChild(footer);
    }

    this.positionDropdown(inputElement, dropdown);

    inputElement._dropdown = dropdown;

    const container = inputElement.closest(".container") || document.body;
    container.appendChild(dropdown);

    let scrollTimeout;
    const updatePosition = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (inputElement._dropdown) {
          this.positionDropdown(inputElement, dropdown);
        }
      }, 10);
    };

    const scrollContainer = document.querySelector(".container");
    if (scrollContainer) {
      scrollContainer.addEventListener("scroll", updatePosition, {
        passive: true,
      });
      inputElement._scrollListener = updatePosition;
    }

    const closeDropdown = (e) => {
      if (!dropdown.contains(e.target) && e.target !== inputElement) {
        this.removeDropdown(inputElement);
        document.removeEventListener("click", closeDropdown);
        if (scrollContainer && inputElement._scrollListener) {
          scrollContainer.removeEventListener(
            "scroll",
            inputElement._scrollListener
          );
        }
      }
    };
    setTimeout(() => document.addEventListener("click", closeDropdown), 0);
  }

  getLastKeywordFromInput(textarea) {
    const value = textarea.value;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastCommaIndex = textBeforeCursor.lastIndexOf(",");

    if (lastCommaIndex === -1) {
      return textBeforeCursor.trim();
    } else {
      return textBeforeCursor.substring(lastCommaIndex + 1).trim();
    }
  }

  showFilteredDropdown(urlInput, allUrls) {
    const filterValue = urlInput.value.toLowerCase();
    const filteredUrls = allUrls.filter(
      (url) => url.toLowerCase().includes(filterValue) && url !== urlInput.value
    );

    if (filteredUrls.length > 0) {
      this.createDropdown(urlInput, filteredUrls, (selectedUrl) => {
        urlInput.value = selectedUrl;
        this.validateForm();
      });
    }
  }

  createMultiSelectDropdown(input, options) {
    this.removeDropdown(input);

    if (!options || options.length === 0) return;

    const data = input._multiSelectData;
    const dropdown = document.createElement("div");
    dropdown.className = "autocomplete-dropdown multi-select-dropdown";

    const filterValue = input.value.toLowerCase();
    const filteredOptions = options.filter((option) =>
      option.toLowerCase().includes(filterValue)
    );

    if (filteredOptions.length === 0) return;

    if (data.type === "keywords" && filteredOptions.length > 1) {
      const addAllItem = document.createElement("div");
      addAllItem.className = "autocomplete-item add-all-item";
      addAllItem.innerHTML = `
        <strong>📝 Add all visible (${filteredOptions.length} keywords)</strong>
      `;

      addAllItem.addEventListener("click", () => {
        filteredOptions.forEach((option) => {
          this.addTag(input, option, false);
        });
        this.validateForm();
        this.removeDropdown(input);
        input.focus();
      });

      dropdown.appendChild(addAllItem);
    }

    filteredOptions.forEach((option) => {
      const item = document.createElement("div");
      item.className = "autocomplete-item";

      const regex = new RegExp(`(${this.escapeRegex(filterValue)})`, "gi");
      const highlightedText = option.replace(regex, "<mark>$1</mark>");

      item.innerHTML = `
        <span>${highlightedText}</span>
        <small class="add-icon">+</small>
      `;

      item.addEventListener("click", () => {
        this.addTag(input, option);
        input.value = "";
        this.removeDropdown(input);
        input.focus();
      });

      item.addEventListener("mouseenter", () => {
        item.style.backgroundColor = "#f0f0f0";
      });

      item.addEventListener("mouseleave", () => {
        item.style.backgroundColor = "white";
      });

      dropdown.appendChild(item);
    });

    this.positionDropdown(input, dropdown);
    input._dropdown = dropdown;

    const container = input.closest(".container") || document.body;
    container.appendChild(dropdown);

    this.setupDropdownScrollListener(input, dropdown);

    setTimeout(() => {
      const closeHandler = (e) => {
        if (!dropdown.contains(e.target) && e.target !== input) {
          this.removeDropdown(input);
          document.removeEventListener("click", closeHandler);
        }
      };
      document.addEventListener("click", closeHandler);
    }, 0);
  }

  selectHighlightedDropdownItem(inputElement) {
    const dropdown = inputElement._dropdown;
    if (!dropdown) return;

    const highlighted = dropdown.querySelector(
      ".autocomplete-item.highlighted"
    );
    if (highlighted) {
      highlighted.click();
    }
  }

  setupDropdownScrollListener(input, dropdown) {
    let scrollTimeout;
    const updatePosition = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (input._dropdown) {
          this.positionDropdown(input, dropdown);
        }
      }, 10);
    };

    const scrollContainer = document.querySelector(".container");
    if (scrollContainer) {
      scrollContainer.addEventListener("scroll", updatePosition, {
        passive: true,
      });
      input._scrollListener = updatePosition;
    }
  }

  createProfileHTML(profile) {
    let groupsHTML = "";
    let totalKeywords = 0;

    if (profile.keywordGroups && Array.isArray(profile.keywordGroups)) {
      groupsHTML = profile.keywordGroups
        .map((group, index) => {
          const keywords = group.keywords || [];
          totalKeywords += keywords.length;
          const groupName = group.name || `Group ${index + 1}`;
          const keywordsText = keywords.join(", ");

          let colorIndicatorsHTML = "";
          if (
            profile.urlPatterns &&
            Array.isArray(profile.urlPatterns) &&
            profile.urlPatterns.length > 1
          ) {
            colorIndicatorsHTML = profile.urlPatterns
              .map((urlPattern, urlIndex) => {
                const overrideColor =
                  urlPattern.colorOverrides &&
                  urlPattern.colorOverrides[`group-${index}`]
                    ? urlPattern.colorOverrides[`group-${index}`]
                    : group.color;

                // Handle both string URLs and arrays of URLs
                let urlDisplay;
                const urlValue = urlPattern.urlPattern || urlPattern;
                if (Array.isArray(urlValue)) {
                  // For arrays, show the first URL
                  urlDisplay = urlValue[0]
                    ? urlValue[0].substring(0, 20) +
                      (urlValue[0].length > 20 ? "..." : "")
                    : "";
                  if (urlValue.length > 1) {
                    urlDisplay += ` (+${urlValue.length - 1} more)`;
                  }
                } else {
                  urlDisplay =
                    urlValue.substring(0, 20) +
                    (urlValue.length > 20 ? "..." : "");
                }
                return `<span class="group-color-indicator multi-url-color" 
                  style="background-color: ${overrideColor};" 
                  title="Color for ${this.escapeHtml(urlDisplay)}"></span>`;
              })
              .join("");
          } else {
            colorIndicatorsHTML = `<span class="group-color-indicator" 
              style="background-color: ${group.color};" 
              title="${this.escapeHtml(groupName)}"></span>`;
          }

          return `
          <div class="keyword-group-preview">
            <div class="group-header">
              <div class="color-indicators">
                ${colorIndicatorsHTML}
              </div>
              <span class="group-name">${this.escapeHtml(groupName)}</span>
              <span class="keyword-count">(${keywords.length} keyword${
            keywords.length !== 1 ? "s" : ""
          })</span>
            </div>
            <div class="keywords-text">
              ${this.escapeHtml(keywordsText) || "<em>No keywords</em>"}
            </div>
          </div>
        `;
        })
        .join("");
    } else if (profile.keywords && Array.isArray(profile.keywords)) {
      totalKeywords = profile.keywords.length;
      const color = profile.color || "#ffff00";
      const keywordsText = profile.keywords.join(", ");

      groupsHTML = `
        <div class="keyword-group-preview">
          <div class="group-header">
            <span class="group-color-indicator" style="background-color: ${color};"></span>
            <span class="group-name">Legacy Keywords</span>
            <span class="keyword-count">(${totalKeywords} keyword${
        totalKeywords !== 1 ? "s" : ""
      })</span>
          </div>
          <div class="keywords-text">
            ${this.escapeHtml(keywordsText) || "<em>No keywords</em>"}
          </div>
        </div>
      `;
    } else {
      groupsHTML = '<div class="no-keywords">No keywords defined</div>';
    }

    let urlDisplayHTML = "";
    let urlType = "single";

    if (
      profile.urlPatterns &&
      Array.isArray(profile.urlPatterns) &&
      profile.urlPatterns.length > 0
    ) {
      urlType = "multi";
      const urlCount = profile.urlPatterns.length;

      if (urlCount === 1) {
        const pattern = profile.urlPatterns[0];
        urlDisplayHTML = `
          <div class="profile-full-url">
            <span class="url-label">URL Pattern:</span>
            <div class="url-value">${this.escapeHtml(
              pattern.urlPattern || pattern
            )}</div>
          </div>
        `;
      } else {
        // Group URLs by color overrides for cleaner display
        const urlGroups = this.groupUrlPatternsByColors(profile.urlPatterns);

        if (urlGroups.length === 1) {
          // All URLs have the same color overrides, display as comma-separated
          const urlList = urlGroups[0].urls
            .map((url) => this.escapeHtml(url))
            .join(", ");
          urlDisplayHTML = `
            <div class="profile-full-url">
              <span class="url-label">URL Patterns:</span>
              <div class="url-value">${urlList}</div>
            </div>
          `;
        } else {
          // Different color overrides, show each group separately
          const groupsHTML = urlGroups
            .map((group, index) => {
              const urlList = group.urls
                .map((url) => this.escapeHtml(url))
                .join(", ");
              const hasOverrides = Object.keys(group.colorOverrides).length > 0;
              const groupLabel = hasOverrides
                ? `URL Group ${index + 1}`
                : "URLs";

              return `
              <div class="url-item">
                <span class="url-label">${groupLabel}:</span>
                <div class="url-value">${urlList}</div>
              </div>
            `;
            })
            .join("");

          urlDisplayHTML = `
            <div class="profile-full-url">
              ${groupsHTML}
            </div>
          `;
        }
      }
    } else if (profile.urlPattern) {
      urlDisplayHTML = `
        <div class="profile-full-url">
          <span class="url-label">URL Pattern:</span>
          <div class="url-value">${this.escapeHtml(profile.urlPattern)}</div>
        </div>
      `;
    } else {
      urlDisplayHTML = `
        <div class="profile-full-url">
          <span class="url-label">URL Pattern:</span>
          <div class="url-value">No URL pattern</div>
        </div>
      `;
    }

    const profileDisplayName = profile.name || "Unnamed Profile";
    const urlCount = profile.urlPatterns ? profile.urlPatterns.length : 1;

    return `
      <div class="profile-item" data-profile-type="${urlType}">
        <div class="profile-header">
          <div class="profile-title">
            <div class="profile-name">${this.escapeHtml(
              profileDisplayName
            )}</div>
          </div>
          <div class="profile-actions">
            <button class="btn-secondary btn-small edit-profile" data-profile-id="${
              profile.id
            }" title="Edit this profile">
              <span class="btn-icon">✏️</span> Edit
            </button>
            <button class="btn-info btn-small duplicate-profile" data-profile-id="${
              profile.id
            }" title="Duplicate this profile">
              <span class="btn-icon">📋</span> Duplicate
            </button>
            <button class="btn-danger btn-small delete-profile" data-profile-id="${
              profile.id
            }" title="Delete this profile">
              <span class="btn-icon">🗑️</span> Delete
            </button>
          </div>
        </div>
        ${urlDisplayHTML}
        <div class="profile-content">
          ${groupsHTML}
        </div>
      </div>
    `;
  }

  formatUrlPattern(pattern) {
    if (!pattern) {
      return { html: "No URL pattern", type: "invalid", label: "Invalid" };
    }

    const escaped = this.escapeHtml(pattern);

    if (pattern.startsWith("file://")) {
      return {
        html: `<span class="url-protocol">file://</span><span class="url-path">${escaped.substring(
          7
        )}</span>`,
        type: "file",
        label: "Local File",
      };
    } else if (
      pattern.startsWith("http://localhost") ||
      pattern.startsWith("https://localhost")
    ) {
      const parts = pattern.split("/");
      const host = parts[2] || "localhost";
      const path = parts.slice(3).join("/");
      return {
        html: `<span class="url-protocol">${parts[0]}//</span><span class="url-host">${host}</span><span class="url-path">/${path}</span>`,
        type: "localhost",
        label: "Local Server",
      };
    } else if (
      pattern.startsWith("http://") ||
      pattern.startsWith("https://")
    ) {
      try {
        const url = new URL(pattern.replace("*", ""));
        const pathPart = pattern.includes("*")
          ? pattern.substring(url.origin.length)
          : url.pathname;
        return {
          html: `<span class="url-protocol">${url.protocol}//</span><span class="url-host">${url.host}</span><span class="url-path">${pathPart}</span>`,
          type: "web",
          label: "Website",
        };
      } catch {
        return {
          html: escaped,
          type: "invalid",
          label: "Invalid URL",
        };
      }
    } else {
      return {
        html: escaped,
        type: "unknown",
        label: "Unknown",
      };
    }
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  async editProfile(profileId) {
    const result = await chrome.storage.sync.get(["profiles"]);
    const profiles = result.profiles || [];
    const profile = profiles.find((p) => p.id === profileId);

    if (!profile) return;

    this.currentEditingId = profileId;
    document.getElementById("formTitle").textContent = "Edit Profile";

    const isMultiUrl =
      profile.urlPatterns &&
      Array.isArray(profile.urlPatterns) &&
      profile.urlPatterns.length > 1;

    this.profileMode = isMultiUrl ? "multi" : "single";
    document.getElementById("singleUrlToggle").checked = !isMultiUrl;
    document.getElementById("multiUrlToggle").checked = isMultiUrl;
    this.updateFormMode();

    const urlPatternsContainer = document.getElementById("urlPatterns");
    urlPatternsContainer.innerHTML = "";
    this.urlPatternCounter = 0;

    if (profile.urlPatterns && Array.isArray(profile.urlPatterns)) {
      // Group URLs by their color overrides
      const urlGroups = this.groupUrlPatternsByColors(profile.urlPatterns);

      urlGroups.forEach((group) => {
        // Join URLs with commas for display in a single input
        const urlString = group.urls.join(", ");
        const patternDiv = this.addUrlPattern(urlString);

        // Apply color overrides if in multi-URL mode
        if (
          this.profileMode === "multi" &&
          (Object.keys(group.colorOverrides).length > 0 ||
            Object.keys(group.textColorOverrides || {}).length > 0)
        ) {
          setTimeout(() => {
            const patternColors = patternDiv.querySelector(".pattern-colors");
            if (patternColors) {
              // Apply background color overrides
              Object.entries(group.colorOverrides).forEach(
                ([groupId, color]) => {
                  const colorInput = patternColors.querySelector(
                    `input[data-group="${groupId}"]:not([data-text-color])`
                  );
                  if (colorInput) {
                    colorInput.value = color;
                    const textInput = patternColors.querySelector(
                      `input[type="text"][data-group="${groupId}"]:not([data-text-color])`
                    );
                    if (textInput) {
                      textInput.value = color;
                    }
                  }
                }
              );

              // Apply text color overrides - only if there are actual text color values
              const textColorEntries = Object.entries(
                group.textColorOverrides || {}
              );
              if (textColorEntries.length > 0) {
                textColorEntries.forEach(([groupId, color]) => {
                  if (color && color.trim() && color !== "#000000") {
                    const textColorCheckbox = patternColors.querySelector(
                      `input[type="checkbox"][id*="enableTextColor"]`
                    );
                    const textColorInput = patternColors.querySelector(
                      `input[data-group="${groupId}"][data-text-color="true"]`
                    );
                    const colorInputGroup =
                      patternColors.querySelector(".color-input-group");

                    if (
                      textColorCheckbox &&
                      textColorInput &&
                      colorInputGroup
                    ) {
                      // Enable the checkbox and show the controls
                      textColorCheckbox.checked = true;
                      colorInputGroup.style.display = "flex";

                      textColorInput.value = color;
                      const textInput = patternColors.querySelector(
                        `input[type="text"][data-group="${groupId}"][data-text-color="true"]`
                      );
                      if (textInput) {
                        textInput.value = color;
                      }
                    }
                  }
                });
              } else {
                // Ensure checkbox is unchecked when no text color overrides exist
                const textColorCheckbox = patternColors.querySelector(
                  `input[type="checkbox"][id*="enableTextColor"]`
                );
                const colorInputGroup =
                  patternColors.querySelector(".color-input-group");

                if (textColorCheckbox) {
                  textColorCheckbox.checked = false;
                }
                if (colorInputGroup) {
                  colorInputGroup.style.display = "none";
                }
              }
            }
          }, 50); // Small delay to ensure color override inputs are created
        }
      });
    } else if (profile.urlPattern) {
      this.addUrlPattern(profile.urlPattern);
    } else {
      this.addUrlPattern();
    }

    if (this.profileMode === "multi") {
      const urlPatternsContainer = document.getElementById("urlPatterns");
      const addPatternButton = document.createElement("button");
      addPatternButton.type = "button";
      addPatternButton.className = "btn-secondary btn-small";
      addPatternButton.textContent = "+ Add URL Pattern";
      addPatternButton.addEventListener("click", () => this.addUrlPattern());
      urlPatternsContainer.appendChild(addPatternButton);
    }

    document.getElementById("profileName").value = profile.name || "";
    document.getElementById("saveProfile").textContent = "Update Profile";
    document.getElementById("cancelEdit").style.display = "inline-block";

    this.exactCase = profile.exactCase || false;
    document.getElementById("exactCaseToggle").checked = this.exactCase;

    const groupsContainer = document.getElementById("keywordGroups");
    groupsContainer.innerHTML = "";
    this.keywordGroupCounter = 0;

    if (profile.keywordGroups && Array.isArray(profile.keywordGroups)) {
      profile.keywordGroups.forEach((group) => {
        this.addKeywordGroup(group.color, group.keywords, group.name || "");
      });
    } else if (profile.keywords && Array.isArray(profile.keywords)) {
      this.addKeywordGroup(profile.color || "#ffff00", profile.keywords, "");
    } else {
      this.addKeywordGroup();
    }

    this.updatePatternColors();

    if (profile.urlPatterns && Array.isArray(profile.urlPatterns)) {
      setTimeout(() => {
        profile.urlPatterns.forEach((pattern, patternIndex) => {
          if (pattern.colorOverrides) {
            const patternId = `pattern-${patternIndex}`;
            const patternDiv = document.querySelector(
              `[data-pattern-id="${patternId}"]`
            );
            if (patternDiv) {
              Object.entries(pattern.colorOverrides).forEach(
                ([groupId, color]) => {
                  const colorInput = patternDiv.querySelector(
                    `input[type="color"][data-group="${groupId}"]`
                  );
                  const textInput = patternDiv.querySelector(
                    `input[type="text"][data-group="${groupId}"]`
                  );
                  if (colorInput) {
                    colorInput.value = color;
                    console.log(
                      `Set color input for group ${groupId} to ${color}`
                    );
                  }
                  if (textInput) {
                    textInput.value = color;
                    console.log(
                      `Set text input for group ${groupId} to ${color}`
                    );
                  }
                }
              );
            } else {
            }
          }
        });
      }, 100);
    }

    document
      .getElementById("profileForm")
      .scrollIntoView({ behavior: "smooth" });
    this.validateForm();
  }

  async duplicateProfile(profileId) {
    const result = await chrome.storage.sync.get(["profiles"]);
    const profiles = result.profiles || [];
    const profile = profiles.find((p) => p.id === profileId);

    if (!profile) return;

    this.currentEditingId = null;
    document.getElementById("formTitle").textContent = "Add New Profile";
    document.getElementById("saveProfile").textContent = "Save Profile";
    document.getElementById("cancelEdit").style.display = "none";

    const isMultiUrl =
      profile.urlPatterns &&
      Array.isArray(profile.urlPatterns) &&
      profile.urlPatterns.length > 1;

    this.profileMode = isMultiUrl ? "multi" : "single";
    document.getElementById("singleUrlToggle").checked = !isMultiUrl;
    document.getElementById("multiUrlToggle").checked = isMultiUrl;
    this.updateFormMode();

    const urlPatternsContainer = document.getElementById("urlPatterns");
    urlPatternsContainer.innerHTML = "";
    this.urlPatternCounter = 0;

    if (profile.urlPatterns && Array.isArray(profile.urlPatterns)) {
      for (let i = 0; i < profile.urlPatterns.length; i++) {
        this.addUrlPattern("");
      }
    } else {
      this.addUrlPattern("");
    }

    if (this.profileMode === "multi") {
      const addPatternButton = document.createElement("button");
      addPatternButton.type = "button";
      addPatternButton.className = "btn-secondary btn-small";
      addPatternButton.textContent = "+ Add URL Pattern";
      addPatternButton.addEventListener("click", () => this.addUrlPattern());
      urlPatternsContainer.appendChild(addPatternButton);
    }

    const originalName = profile.name || "Unnamed Profile";
    document.getElementById("profileName").value = `Copy of ${originalName}`;

    const groupsContainer = document.getElementById("keywordGroups");
    groupsContainer.innerHTML = "";
    this.keywordGroupCounter = 0;

    if (profile.keywordGroups && Array.isArray(profile.keywordGroups)) {
      profile.keywordGroups.forEach((group) => {
        this.addKeywordGroup(group.color, group.keywords, group.name || "");
      });
    } else if (profile.keywords && Array.isArray(profile.keywords)) {
      this.addKeywordGroup(profile.color || "#ffff00", profile.keywords, "");
    } else {
      this.addKeywordGroup();
    }

    this.updatePatternColors();

    document
      .getElementById("profileForm")
      .scrollIntoView({ behavior: "smooth" });
    this.validateForm();
  }

  async deleteProfile(profileId) {
    if (!confirm("Are you sure you want to delete this profile?")) {
      return;
    }

    const result = await chrome.storage.sync.get(["profiles"]);
    let profiles = result.profiles || [];
    profiles = profiles.filter((p) => p.id !== profileId);

    await chrome.storage.sync.set({ profiles });

    this.cachedProfiles = profiles;

    await this.loadProfiles();
    this.notifyContentScripts();
  }

  getTemplates() {
    return [
      {
        id: "job-hunt",
        name: "Job Hunt",
        description:
          "Perfect for job hunting on tech job boards. Includes common programming languages, frameworks, and experience levels suitable for various tech roles.",
        profileName: "Job Hunt Multi-Site",
        urlPatterns: [
          "https://ca.indeed.com/*",
          "https://www.linkedin.com/jobs/search-results/*",
          "https://www.linkedin.com/jobs/search/*",
          "https://jobs.lever.co/*",
          "https://boards.greenhouse.io/*",
        ],
        keywordGroups: [
          {
            name: "Most Experience",
            color: "#4CAF50",
            keywords: [
              "JavaScript",
              "React",
              "Node.js",
              "Python",
              "TypeScript",
              "AWS",
              "Docker",
              "Git",
            ],
          },
          {
            name: "Medium Experience",
            color: "#FF9800",
            keywords: [
              "Vue.js",
              "Angular",
              "Express.js",
              "MongoDB",
              "PostgreSQL",
              "Redis",
              "Kubernetes",
            ],
          },
          {
            name: "Low Experience",
            color: "#2196F3",
            keywords: [
              "GraphQL",
              "Microservices",
              "DevOps",
              "CI/CD",
              "Terraform",
              "Go",
              "Rust",
            ],
          },
          {
            name: "Green Flags",
            color: "#8BC34A",
            keywords: [
              "remote",
              "work-life balance",
              "mentorship",
              "learning opportunities",
              "career growth",
            ],
          },
          {
            name: "Red Flags",
            color: "#F44336",
            keywords: [
              "rockstar",
              "ninja",
              "guru",
              "unpaid overtime",
              "fast-paced environment",
            ],
          },
        ],
        keywordBank:
          "JavaScript, TypeScript, React, Vue.js, Angular, Node.js, Express.js, Python, Django, Flask, Java, Spring, C#, .NET, PHP, Laravel, Go, Rust, Swift, Kotlin, SQL, MySQL, PostgreSQL, MongoDB, Redis, GraphQL, REST API, HTML, CSS, SASS, SCSS, Bootstrap, Tailwind, Git, GitHub, GitLab, Docker, Kubernetes, AWS, Azure, GCP, CI/CD, Jenkins, DevOps, Agile, Scrum, TDD, Unit Testing, Integration Testing, Microservices, API Design, Database Design, System Design, Machine Learning, AI, Data Science, Frontend, Backend, Full Stack, Mobile Development, Web Development, Cloud Computing, Serverless, Lambda, Terraform, Ansible, Linux, Unix, Bash, Shell Scripting, Monitoring, Logging, Performance Optimization, Security, OAuth, JWT, HTTPS, SSL, Websockets, Real-time, Caching, Load Balancing, CDN, Nginx, Apache",
      },
      {
        id: "data-scientist",
        name: "Data Scientist",
        description:
          "Tailored for data science and analytics roles. Covers machine learning, statistical tools, and data technologies.",
        profileName: "Data Science & Analytics",
        urlPatterns: [
          "https://ca.indeed.com/*",
          "https://www.linkedin.com/jobs/search-results/*",
          "https://www.kaggle.com/jobs/*",
          "https://jobs.lever.co/*",
        ],
        keywordGroups: [
          {
            name: "Programming & Tools",
            color: "#4CAF50",
            keywords: [
              "Python",
              "R",
              "SQL",
              "Jupyter",
              "pandas",
              "NumPy",
              "scikit-learn",
              "TensorFlow",
            ],
          },
          {
            name: "Machine Learning",
            color: "#FF9800",
            keywords: [
              "Deep Learning",
              "Neural Networks",
              "NLP",
              "Computer Vision",
              "MLOps",
              "Feature Engineering",
            ],
          },
          {
            name: "Data & Analytics",
            color: "#2196F3",
            keywords: [
              "Big Data",
              "Spark",
              "Hadoop",
              "Tableau",
              "Power BI",
              "Statistics",
              "A/B Testing",
            ],
          },
          {
            name: "Cloud & Infrastructure",
            color: "#9C27B0",
            keywords: [
              "AWS",
              "Azure",
              "GCP",
              "Docker",
              "Kubernetes",
              "Airflow",
              "Data Pipeline",
            ],
          },
          {
            name: "Domain Knowledge",
            color: "#607D8B",
            keywords: [
              "Business Intelligence",
              "Data Warehousing",
              "ETL",
              "Data Mining",
              "Predictive Analytics",
            ],
          },
        ],
        keywordBank:
          "Python, R, SQL, Java, Scala, Julia, MATLAB, SAS, SPSS, Jupyter, IPython, pandas, NumPy, SciPy, matplotlib, seaborn, plotly, scikit-learn, TensorFlow, PyTorch, Keras, XGBoost, LightGBM, CatBoost, NLTK, spaCy, OpenCV, Hugging Face, Machine Learning, Deep Learning, Neural Networks, CNN, RNN, LSTM, GAN, Transformer, BERT, GPT, Computer Vision, Natural Language Processing, NLP, Reinforcement Learning, Supervised Learning, Unsupervised Learning, Classification, Regression, Clustering, Dimensionality Reduction, Feature Engineering, Feature Selection, Model Selection, Hyperparameter Tuning, Cross Validation, A/B Testing, Statistical Analysis, Hypothesis Testing, Bayesian Analysis, Time Series Analysis, Forecasting, Big Data, Apache Spark, Hadoop, Hive, Pig, Kafka, Elasticsearch, MongoDB, Cassandra, Redis, PostgreSQL, MySQL, SQLite, Data Warehousing, ETL, ELT, Data Pipeline, Data Lake, Data Mesh, Apache Airflow, Luigi, Prefect, dbt, Tableau, Power BI, Looker, QlikView, D3.js, Grafana, AWS, S3, EC2, EMR, Redshift, Glue, SageMaker, Azure, Azure ML, Google Cloud, BigQuery, Dataflow, Vertex AI, Docker, Kubernetes, Git, GitHub, CI/CD, MLOps, Model Deployment, Model Monitoring, Data Governance, Data Quality, Business Intelligence, KPI, Metrics, Dashboard, Reporting, Data Visualization, Statistical Modeling, Predictive Analytics, Prescriptive Analytics, Descriptive Analytics, Data Mining, Web Scraping, API, JSON, XML, REST, GraphQL",
      },
      {
        id: "digital-marketing",
        name: "Digital Marketing",
        description:
          "Comprehensive template for digital marketing professionals covering SEO, SEM, social media, and analytics.",
        profileName: "Digital Marketing Professional",
        urlPatterns: [
          "https://ca.indeed.com/*",
          "https://www.linkedin.com/jobs/search-results/*",
          "https://jobs.lever.co/*",
          "https://angel.co/jobs/*",
        ],
        keywordGroups: [
          {
            name: "SEO & Content",
            color: "#4CAF50",
            keywords: [
              "SEO",
              "Content Marketing",
              "Keyword Research",
              "Google Analytics",
              "WordPress",
              "Copywriting",
            ],
          },
          {
            name: "Paid Advertising",
            color: "#FF9800",
            keywords: [
              "Google Ads",
              "Facebook Ads",
              "PPC",
              "Display Advertising",
              "Retargeting",
              "Conversion Optimization",
            ],
          },
          {
            name: "Social Media",
            color: "#2196F3",
            keywords: [
              "Social Media Marketing",
              "Instagram",
              "Facebook",
              "Twitter",
              "LinkedIn",
              "TikTok",
              "Influencer Marketing",
            ],
          },
          {
            name: "Analytics & Tools",
            color: "#9C27B0",
            keywords: [
              "Google Analytics",
              "Google Tag Manager",
              "HubSpot",
              "Mailchimp",
              "Hootsuite",
              "Canva",
            ],
          },
          {
            name: "Strategy & Growth",
            color: "#607D8B",
            keywords: [
              "Marketing Strategy",
              "Brand Management",
              "Lead Generation",
              "Email Marketing",
              "Marketing Automation",
            ],
          },
        ],
        keywordBank:
          "SEO, SEM, Content Marketing, Social Media Marketing, Digital Marketing, Marketing Strategy, Brand Management, Google Analytics, Google Ads, Google Tag Manager, Facebook Ads, Instagram Marketing, LinkedIn Marketing, Twitter Marketing, TikTok Marketing, YouTube Marketing, Influencer Marketing, Email Marketing, Marketing Automation, Lead Generation, Conversion Optimization, A/B Testing, Landing Page Optimization, PPC, Pay Per Click, Display Advertising, Retargeting, Remarketing, Affiliate Marketing, Partnership Marketing, Growth Hacking, Customer Acquisition, Customer Retention, CRM, HubSpot, Salesforce, Mailchimp, Constant Contact, Hootsuite, Buffer, Sprout Social, Canva, Adobe Creative Suite, Photoshop, Illustrator, Video Marketing, Podcast Marketing, Webinar Marketing, Event Marketing, PR, Public Relations, Media Relations, Press Release, Copywriting, Content Creation, Blog Writing, Keyword Research, Link Building, Technical SEO, Local SEO, E-commerce SEO, WordPress, Shopify, WooCommerce, Magento, HTML, CSS, JavaScript, Google Search Console, SEMrush, Ahrefs, Moz, Screaming Frog, Hotjar, Crazy Egg, Optimizely, Unbounce, Leadpages, ClickFunnels, Zapier, IFTTT, Marketing Analytics, ROI, ROAS, CTR, CPC, CPM, CPA, LTV, CAC, Funnel Analysis, Customer Journey Mapping, Persona Development, Market Research, Competitive Analysis, SWOT Analysis, Marketing Mix, 4Ps, Branding, Brand Positioning, Brand Identity, Visual Identity, Logo Design, Marketing Campaigns, Campaign Management, Project Management, Agile Marketing, Marketing Operations",
      },
      {
        id: "product-manager",
        name: "Product Manager",
        description:
          "Ideal for product management roles with focus on strategy, analytics, and cross-functional collaboration.",
        profileName: "Product Management",
        urlPatterns: [
          "https://ca.indeed.com/*",
          "https://www.linkedin.com/jobs/search-results/*",
          "https://jobs.lever.co/*",
          "https://angel.co/jobs/*",
          "https://boards.greenhouse.io/*",
        ],
        keywordGroups: [
          {
            name: "Product Strategy",
            color: "#4CAF50",
            keywords: [
              "Product Strategy",
              "Roadmap",
              "Vision",
              "OKRs",
              "KPIs",
              "Product Analytics",
              "User Research",
            ],
          },
          {
            name: "Technical Skills",
            color: "#FF9800",
            keywords: [
              "SQL",
              "API",
              "Agile",
              "Scrum",
              "JIRA",
              "A/B Testing",
              "Data Analysis",
              "Wireframing",
            ],
          },
          {
            name: "Business Acumen",
            color: "#2196F3",
            keywords: [
              "Go-to-Market",
              "Pricing",
              "Competitive Analysis",
              "Market Research",
              "Business Case",
              "P&L",
            ],
          },
          {
            name: "Collaboration",
            color: "#9C27B0",
            keywords: [
              "Cross-functional",
              "Stakeholder Management",
              "Leadership",
              "Communication",
              "Prioritization",
            ],
          },
          {
            name: "Tools & Platforms",
            color: "#607D8B",
            keywords: [
              "Figma",
              "Miro",
              "Confluence",
              "Amplitude",
              "Mixpanel",
              "Google Analytics",
              "Tableau",
            ],
          },
        ],
        keywordBank:
          "Product Management, Product Strategy, Product Planning, Product Development, Product Launch, Product Marketing, Product Analytics, Product Metrics, Product Roadmap, Product Vision, Product Requirements, PRD, Product Specification, User Stories, Epic, Feature Definition, Product Backlog, Prioritization, Product Lifecycle, Go-to-Market, GTM, Market Research, Competitive Analysis, User Research, User Experience, UX, User Interface, UI, Customer Journey, Customer Development, Customer Feedback, Customer Success, Stakeholder Management, Cross-functional Collaboration, Agile, Scrum, Kanban, Sprint Planning, Retrospective, JIRA, Confluence, Trello, Asana, Monday.com, Notion, Figma, Sketch, InVision, Miro, Lucidchart, Balsamiq, Wireframing, Prototyping, Mockups, Design Thinking, MVP, Minimum Viable Product, A/B Testing, Experimentation, Hypothesis Testing, Data Analysis, SQL, Python, R, Excel, Google Sheets, Google Analytics, Amplitude, Mixpanel, Heap, Segment, Tableau, Power BI, Looker, KPI, Key Performance Indicators, OKR, Objectives and Key Results, Metrics, Conversion Rate, Retention Rate, Churn Rate, LTV, Customer Lifetime Value, CAC, Customer Acquisition Cost, ARPU, Monthly Active Users, MAU, DAU, Daily Active Users, API, REST, GraphQL, JSON, Database, Cloud Computing, AWS, Azure, SaaS, B2B, B2C, E-commerce, Mobile App, Web Application, iOS, Android, Technical Specifications, System Architecture, Integration, Third-party, SDK, Business Case, ROI, Return on Investment, P&L, Profit and Loss, Budget, Forecasting, Pricing Strategy, Revenue Model, Market Sizing, TAM, SAM, SOM, Persona, User Segmentation, Customer Segmentation, Journey Mapping, Pain Points, Jobs to be Done, JTBD, Feature Flag, Release Management, Beta Testing, User Acceptance Testing, UAT, QA, Quality Assurance, Risk Management, Compliance, Privacy, GDPR, Leadership, Team Management, Mentoring, Communication, Presentation, Storytelling, Influence, Negotiation, Decision Making, Problem Solving, Critical Thinking, Innovation, Creativity",
      },
      {
        id: "ux-designer",
        name: "UX/UI Designer",
        description:
          "Complete template for UX/UI design roles covering design tools, methodologies, and user research.",
        profileName: "UX/UI Design Professional",
        urlPatterns: [
          "https://ca.indeed.com/*",
          "https://www.linkedin.com/jobs/search-results/*",
          "https://dribbble.com/jobs/*",
          "https://www.behance.net/jobboard/*",
          "https://jobs.lever.co/*",
        ],
        keywordGroups: [
          {
            name: "Design Tools",
            color: "#4CAF50",
            keywords: [
              "Figma",
              "Sketch",
              "Adobe XD",
              "InVision",
              "Principle",
              "Framer",
              "Zeplin",
              "Abstract",
            ],
          },
          {
            name: "UX Methods",
            color: "#FF9800",
            keywords: [
              "User Research",
              "Usability Testing",
              "Wireframing",
              "Prototyping",
              "Journey Mapping",
              "Persona Development",
            ],
          },
          {
            name: "UI & Visual",
            color: "#2196F3",
            keywords: [
              "Visual Design",
              "Design Systems",
              "Typography",
              "Color Theory",
              "Iconography",
              "Illustration",
            ],
          },
          {
            name: "Technical Skills",
            color: "#9C27B0",
            keywords: [
              "HTML",
              "CSS",
              "JavaScript",
              "React",
              "Responsive Design",
              "Accessibility",
              "Design Tokens",
            ],
          },
          {
            name: "Collaboration",
            color: "#607D8B",
            keywords: [
              "Design Thinking",
              "Agile",
              "Cross-functional",
              "Stakeholder Management",
              "Design Critique",
            ],
          },
        ],
        keywordBank:
          "UX Design, UI Design, User Experience, User Interface, Interaction Design, Visual Design, Graphic Design, Web Design, Mobile Design, App Design, Responsive Design, Design Systems, Component Library, Style Guide, Brand Guidelines, Design Tokens, Figma, Sketch, Adobe XD, Adobe Creative Suite, Photoshop, Illustrator, InDesign, After Effects, Principle, Framer, ProtoPie, InVision, Marvel, Zeplin, Abstract, Avocode, User Research, User Testing, Usability Testing, A/B Testing, Card Sorting, Tree Testing, First Click Testing, 5 Second Test, User Interviews, Focus Groups, Surveys, Questionnaires, Analytics, Heatmaps, User Personas, Customer Journey Mapping, User Flow, Task Flow, Site Map, Information Architecture, IA, Wireframing, Low-fidelity Wireframes, High-fidelity Wireframes, Prototyping, Interactive Prototypes, Clickable Prototypes, Paper Prototyping, Digital Prototyping, MVP, Minimum Viable Product, Design Thinking, Human-Centered Design, Lean UX, Agile UX, Design Sprint, Google Design Sprint, Double Diamond, Jobs to be Done, JTBD, Empathy Mapping, Affinity Mapping, Problem Definition, Ideation, Brainstorming, Sketching, Storyboarding, Mood Board, Inspiration Board, Typography, Font Pairing, Hierarchy, Contrast, Color Theory, Color Palette, Accessibility, WCAG, Section 508, Screen Reader, Keyboard Navigation, Color Contrast, Alt Text, Inclusive Design, Universal Design, Mobile First, Progressive Enhancement, Grid System, Layout, Composition, White Space, Visual Hierarchy, Gestalt Principles, F-Pattern, Z-Pattern, Scannable Design, Iconography, Icon Design, Illustration, Custom Illustrations, Stock Photos, Image Optimization, SVG, PNG, JPG, GIF, Animation, Micro-interactions, Transitions, Loading States, Empty States, Error States, Onboarding, Progressive Disclosure, Design Patterns, UI Patterns, Navigation, Menu Design, Button Design, Form Design, Modal Design, Dropdown, Carousel, Tabs, Accordion, Search, Filters, Pagination, HTML, CSS, SASS, SCSS, JavaScript, jQuery, React, Vue, Angular, Bootstrap, Foundation, Material Design, iOS Human Interface Guidelines, Android Material Design, Atomic Design, Component-Based Design, Design System, Pattern Library, Cross-functional Collaboration, Stakeholder Management, Design Critique, Design Review, Design Handoff, Developer Handoff, Quality Assurance, QA, Design Testing, Design Validation, Iteration, Design Process, Design Methodology, Design Strategy, Business Goals, User Goals, KPI, Metrics, Conversion Rate, User Satisfaction, Task Completion Rate, Time on Task, Error Rate, Portfolio, Case Study, Design Documentation, Design Specs, Red Lines, Design Tokens, Version Control, Git, Design Ops, Design System Management",
      },
    ];
  }

  showTemplatesModal() {
    const modal = document.getElementById("templatesModal");
    const templatesList = document.getElementById("templatesList");

    // Clear existing templates
    templatesList.innerHTML = "";

    // Generate template cards
    this.templates.forEach((template) => {
      const templateCard = this.createTemplateCard(template);
      templatesList.appendChild(templateCard);
    });

    modal.style.display = "flex";
    document.body.style.overflow = "hidden"; // Prevent background scrolling
  }

  hideTemplatesModal() {
    const modal = document.getElementById("templatesModal");
    modal.style.display = "none";
    document.body.style.overflow = "auto"; // Restore scrolling
  }

  createTemplateCard(template) {
    const card = document.createElement("div");
    card.className = "template-card";
    card.addEventListener("click", () => this.applyTemplate(template));

    card.innerHTML = `
      <div class="template-title">${template.name}</div>
      <div class="template-description">${template.description}</div>
      <div class="template-preview">
        <div class="template-preview-section">
          <div class="template-preview-label">URL Patterns</div>
          <div class="template-preview-content">
            <div class="template-url-list">
              ${template.urlPatterns
                .slice(0, 3)
                .map(
                  (url) =>
                    `<div class="template-url-item">${this.formatUrlForDisplay(
                      url
                    )}</div>`
                )
                .join("")}
              ${
                template.urlPatterns.length > 3
                  ? `<div class="template-url-item">+${
                      template.urlPatterns.length - 3
                    } more...</div>`
                  : ""
              }
            </div>
          </div>
        </div>
        <div class="template-preview-section">
          <div class="template-preview-label">Keyword Groups</div>
          <div class="template-preview-content">
            <div class="template-keyword-groups">
              ${template.keywordGroups
                .map(
                  (group) =>
                    `<span class="template-keyword-group-tag" style="background-color: ${group.color}20; border: 1px solid ${group.color}; color: ${group.color};">${group.name}</span>`
                )
                .join("")}
            </div>
          </div>
        </div>
      </div>
    `;

    return card;
  }

  formatUrlForDisplay(url) {
    // Remove protocol and simplify for display
    return url.replace(/^https?:\/\//, "").replace(/\/\*$/, "/...");
  }

  async applyTemplate(template) {
    // Reset form first
    this.resetForm();

    // Set profile name
    document.getElementById("profileName").value = template.profileName;

    // Set to multi-URL mode if template has multiple URLs
    if (template.urlPatterns.length > 1) {
      document.getElementById("multiUrlToggle").checked = true;
      this.profileMode = "multi";
      this.updateFormMode();
    }

    // Clear existing URL patterns and keyword groups
    document.getElementById("urlPatterns").innerHTML = "";
    document.getElementById("keywordGroups").innerHTML = "";
    this.urlPatternCounter = 0;
    this.keywordGroupCounter = 0;

    // Add URL patterns
    if (template.urlPatterns.length > 0) {
      // Join all URL patterns with commas for a single input
      const urlString = template.urlPatterns.join(", ");
      this.addUrlPattern(urlString);
    }

    // Add keyword groups
    template.keywordGroups.forEach((group) => {
      const keywordString = group.keywords.join(", ");
      this.addKeywordGroup(group.color, keywordString, group.name);
    });

    // Set keyword bank
    if (template.keywordBank) {
      document.getElementById("keywordBankText").value = template.keywordBank;
      this.handleProcessKeywordBank();
    }

    // Hide modal
    this.hideTemplatesModal();

    // Validate form
    this.validateForm();

    // Scroll to top of form
    document
      .querySelector(".profile-form")
      .scrollIntoView({ behavior: "smooth" });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const popup = new KeywordHighlighterPopup();

  window.debugExtension = async function () {
    console.log("=== EXTENSION DEBUG INFO ===");

    const storage = await chrome.storage.sync.get([
      "profiles",
      "extensionEnabled",
      "keywordBank",
    ]);
    console.log("Storage contents:", storage);

    console.log("Popup state:", {
      profileMode: popup.profileMode,
      uniqueKeywords: popup.uniqueKeywords,
      keywordBank: popup.keywordBank,
      cachedProfiles: popup.cachedProfiles,
    });

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      console.log("Current tab:", tabs[0].url);

      try {
        await chrome.tabs.sendMessage(tabs[0].id, { action: "debugInfo" });
      } catch (error) {
        console.log("Content script not available or error:", error);
      }
    }

    return storage;
  };
});

window.popupDebug = {
  async getStorageInfo() {
    return await chrome.storage.sync.get([
      "profiles",
      "extensionEnabled",
      "keywordBank",
    ]);
  },

  async testNotification() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      return await chrome.tabs.sendMessage(tabs[0].id, {
        action: "updateProfiles",
      });
    }
  },
};

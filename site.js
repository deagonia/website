function wait(ms) {
  return new Promise(function (resolve) {
    window.setTimeout(resolve, ms);
  });
}

function normalizePathname(value) {
  var normalized = String(value || "/");
  if (normalized.endsWith("/index.html")) {
    return normalized.slice(0, -"index.html".length);
  }
  return normalized;
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function escapeSelectorValue(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(String(value || ""));
  }

  return String(value || "").replace(/[^a-zA-Z0-9\-_]/g, "\\$&");
}

function registerDeagoniaWebsite(AlpineInstance) {
  AlpineInstance.data("deagoniaWebsite", function (config) {
    return {
      config: config || { initialPage: "landing", assetVersion: "0.0.1", pageMap: {} },
      menuOpen: false,
      tocOpen: false,
      chapterPickerOpen: false,
      isLoading: false,
      currentSlug: "landing",
      currentChapterSlug: "",
      currentNewsYear: "",
      activePage: null,
      activeSectionId: "",
      tocHtml: "",
      tocQuery: "",
      tocHasNoResults: false,
      isScrolled: false,
      activeTocEntryId: "",
      siteBasePath: "/",
      sectionObserver: null,
      tocEntries: [],
      chapterEntries: [],
      volumeManifests: {},
      volumeManifestPromises: {},
      chapterMap: {},
      newsEntriesByYear: {},

      async init() {
        this.siteBasePath = window.DEAGONIA_SITE_BASE || this.resolveSiteBasePath();
        this.currentSlug = this.resolveSlugFromPath(this.config.currentPath || window.location.pathname);
        this.activePage = this.config.pageMap[this.currentSlug] || null;
        this.tocHtml = this.$refs.toc ? this.$refs.toc.innerHTML.trim() : "";

        if (this.isVolumeSlug(this.currentSlug)) {
          await this.ensureVolumeManifest(this.currentSlug);
          this.currentChapterSlug =
            this.resolveChapterSlugFromPath(this.config.currentPath || window.location.pathname, this.currentSlug) ||
            this.config.initialChapter ||
            this.defaultChapterSlug(this.currentSlug);
          this.syncChapterEntries(this.currentSlug);
        }

        this.syncDocumentMeta();
        this.bindBodyLinks();
        this.refreshSectionBindings();
        this.refreshTocBindings();

        if (this.isVolumeSlug(this.currentSlug)) {
          await this.applyCurrentVolumeLocation(true, true);
        } else if (this.isNewsSlug(this.currentSlug)) {
          await this.applyCurrentNewsLocation(true, true);
        } else {
          this.applyCurrentHash(true, true);
        }

        this.syncScrollState();

        window.addEventListener("popstate", this.handlePopState.bind(this));
        window.addEventListener("hashchange", this.handleHashChange.bind(this));
        window.addEventListener("scroll", this.syncScrollState.bind(this), { passive: true });
        window.addEventListener("resize", this.syncScrollState.bind(this), { passive: true });
      },

      resolveSiteBasePath() {
        return "/";
      },

      currentHash() {
        return window.location.hash ? safeDecodeURIComponent(window.location.hash.slice(1)) : "";
      },

      relativeSitePath(pathname) {
        var normalizedPath = normalizePathname(pathname || window.location.pathname);
        var basePath = this.siteBasePath || "/";
        var relativePath = normalizedPath.startsWith(basePath)
          ? normalizedPath.slice(basePath.length)
          : normalizedPath.replace(/^\/+/, "");

        return relativePath.replace(/^\/+/, "");
      },

      pageHref(slug) {
        return this.siteBasePath + String((this.config.pageMap[slug] || {}).path || "");
      },

      pageConfig(slug) {
        return this.config.pageMap[slug] || null;
      },

      isVolumeSlug(slug) {
        var page = this.pageConfig(slug);
        return Boolean(page && page.pageType === "volume");
      },

      isNewsSlug(slug) {
        var page = this.pageConfig(slug);
        return Boolean(page && page.pageType === "news");
      },

      currentVolumeSlug() {
        return this.isVolumeSlug(this.currentSlug) ? this.currentSlug : "";
      },

      siteAssetHref(filename) {
        var source = String(filename || "");
        if (!source) {
          return "";
        }

        if (/^(?:https?:)?\/\//.test(source)) {
          return source;
        }

        if (source.startsWith("/")) {
          return source;
        }

        var normalizedSource = source.replace(/^\/+/, "");
        if (!normalizedSource.startsWith("assets/")) {
          normalizedSource = "assets/" + normalizedSource.replace(/^assets\/+/, "");
        }

        return "/" + normalizedSource;
      },

      fragmentHref(slug, kind) {
        return "/fragments/" + slug + "." + kind + ".html?v=" + this.config.assetVersion;
      },

      volumeManifestHref(volumeSlug) {
        var page = this.pageConfig(volumeSlug);
        if (!page || page.pageType !== "volume" || !page.manifestPath) {
          return "";
        }

        return "/" + String(page.manifestPath).replace(/^\/+/, "") + "?v=" + this.config.assetVersion;
      },

      newsYears() {
        var page = this.pageConfig("news");
        return page && Array.isArray(page.newsYears) ? page.newsYears : [];
      },

      latestNewsYear() {
        var page = this.pageConfig("news");
        if (!page) {
          return "";
        }

        if (page.latestNewsYear) {
          return String(page.latestNewsYear);
        }

        var years = this.newsYears();
        return years.length > 0 ? String(years[0]) : "";
      },

      defaultNewsYear() {
        return this.config.initialNewsYear || this.latestNewsYear() || "";
      },

      newsYearHref(year) {
        var normalizedYear = String(year || "").trim();
        if (!normalizedYear) {
          return this.pageHref("news");
        }

        if (normalizedYear === this.latestNewsYear()) {
          return this.pageHref("news");
        }

        return this.siteBasePath + "aktualnosci/" + encodeURIComponent(normalizedYear) + "/";
      },

      newsDataHref(year) {
        return this.siteBasePath + "aktualnosci/data/" + encodeURIComponent(String(year || "")) + ".json?v=" + this.config.assetVersion;
      },

      resolveSlugFromPath(pathname) {
        var relativePath = this.relativeSitePath(pathname);
        var pageEntries = Object.keys(this.config.pageMap || {})
          .map(
            function (slug) {
              var page = this.config.pageMap[slug] || {};
              var normalizedPath = String(page.path || "").replace(/^\/+|\/+$/g, "");
              return { slug: slug, path: normalizedPath };
            }.bind(this)
          )
          .sort(function (left, right) {
            return right.path.length - left.path.length;
          });

        for (var index = 0; index < pageEntries.length; index += 1) {
          var entry = pageEntries[index];
          if (!entry.path) {
            continue;
          }
          if (relativePath === entry.path || relativePath.startsWith(entry.path + "/")) {
            return entry.slug;
          }
        }

        return "landing";
      },

      resolveChapterSlugFromPath(pathname, volumeSlug) {
        var page = this.pageConfig(volumeSlug || this.currentSlug);
        if (!page || page.pageType !== "volume") {
          return "";
        }

        var relativePath = this.relativeSitePath(pathname);
        var relativeParts = relativePath.split("/").filter(Boolean);
        var baseParts = String(page.path || "")
          .split("/")
          .filter(Boolean);

        if (relativeParts.length !== baseParts.length + 1) {
          return "";
        }

        for (var index = 0; index < baseParts.length; index += 1) {
          if (relativeParts[index] !== baseParts[index]) {
            return "";
          }
        }

        return safeDecodeURIComponent(relativeParts[relativeParts.length - 1]);
      },

      resolveNewsYearFromPath(pathname) {
        var page = this.pageConfig("news");
        if (!page) {
          return "";
        }

        var relativePath = this.relativeSitePath(pathname);
        var relativeParts = relativePath.split("/").filter(Boolean);
        var baseParts = String(page.path || "")
          .split("/")
          .filter(Boolean);

        if (relativeParts.length === baseParts.length) {
          return this.defaultNewsYear();
        }

        if (relativeParts.length !== baseParts.length + 1) {
          return "";
        }

        for (var index = 0; index < baseParts.length; index += 1) {
          if (relativeParts[index] !== baseParts[index]) {
            return "";
          }
        }

        return safeDecodeURIComponent(relativeParts[relativeParts.length - 1]);
      },

      resolveSlugFromHref(href) {
        if (!href || href.startsWith("#")) {
          return null;
        }

        try {
          var absoluteUrl = new URL(href, document.baseURI || window.location.href);
          if (absoluteUrl.origin !== window.location.origin) {
            return null;
          }

          return this.resolveSlugFromPath(absoluteUrl.pathname);
        } catch {
          return null;
        }
      },

      resolveVolumeTargetFromHref(href) {
        try {
          var absoluteUrl = new URL(href, document.baseURI || window.location.href);
          if (absoluteUrl.origin !== window.location.origin) {
            return null;
          }

          var slug = this.resolveSlugFromPath(absoluteUrl.pathname);
          if (!this.isVolumeSlug(slug)) {
            return null;
          }

          return {
            slug: slug,
            chapterSlug: this.resolveChapterSlugFromPath(absoluteUrl.pathname, slug) || "",
            anchor: absoluteUrl.hash ? safeDecodeURIComponent(absoluteUrl.hash.slice(1)) : "",
          };
        } catch {
          return null;
        }
      },

      async ensureNewsYear(year) {
        var normalizedYear = String(year || "");
        if (!normalizedYear) {
          return null;
        }

        if (this.newsEntriesByYear[normalizedYear]) {
          return this.newsEntriesByYear[normalizedYear];
        }

        var response = await fetch(this.newsDataHref(normalizedYear));
        if (!response.ok) {
          throw new Error("Could not load news year");
        }

        var payload = await response.json();
        payload.year = String(payload.year || normalizedYear);
        payload.entries = Array.isArray(payload.entries) ? payload.entries : [];
        this.newsEntriesByYear[normalizedYear] = payload;
        return payload;
      },

      formatNewsDate(rawDate) {
        try {
          return new Intl.DateTimeFormat("pl-PL", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }).format(new Date(rawDate));
        } catch {
          return String(rawDate || "");
        }
      },

      escapeHtml(value) {
        return String(value || "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      },

      renderNewsNavigation(years, currentYear, extraClass) {
        if (!years.length) {
          return "";
        }

        var classSuffix = extraClass ? " " + extraClass : "";

        return years
          .map(
            function (year) {
              var href = this.newsYearHref(year);
              var activeClass = String(year) === String(currentYear) ? " is-active" : "";
              return `<a class="site-news-year-link${classSuffix}${activeClass}" href="${this.escapeHtml(href)}" data-news-year="${this.escapeHtml(year)}">${this.escapeHtml(year)}</a>`;
            }.bind(this)
          )
          .join("");
      },

      renderNewsEntries(data) {
        if (!data || !Array.isArray(data.entries) || data.entries.length === 0) {
          return '<p class="site-news-empty">Brak wpisów w tym roczniku.</p>';
        }

        return data.entries
          .map(
            function (entry) {
              var body = Array.isArray(entry.body)
                ? entry.body
                    .map(
                      function (paragraph) {
                        return `<p>${this.escapeHtml(paragraph)}</p>`;
                      }.bind(this)
                    )
                    .join("")
                : "";
              var signoff = entry.signoff
                ? `<p class="site-news-signoff">Podpisano: ${this.escapeHtml(entry.signoff)}</p>`
                : "";
              return `<section class="level2"><p class="site-news-date">${this.escapeHtml(this.formatNewsDate(entry.date))}</p><h2>${this.escapeHtml(entry.title)}</h2>${body}${signoff}</section>`;
            }.bind(this)
          )
          .join("");
      },

      hydrateNewsBody(data) {
        if (!this.$refs.body) {
          return;
        }

        var yearsContainer = this.$refs.body.querySelector("[data-news-years]");
        var feedContainer = this.$refs.body.querySelector("[data-news-feed]");
        var footerContainer = this.$refs.body.querySelector("[data-news-footer]");
        if (!yearsContainer || !feedContainer) {
          return;
        }

        var years = this.newsYears();
        yearsContainer.innerHTML = this.renderNewsNavigation(years, this.currentNewsYear);
        feedContainer.innerHTML = `${this.renderNewsEntries(data)}`;
        footerContainer.innerHTML = `<nav class="site-news-years site-news-years--footer" aria-label="Roczniki aktualności">${this.renderNewsNavigation(years, this.currentNewsYear)}</nav>`;
      },

      async ensureVolumeManifest(volumeSlug) {
        if (!this.isVolumeSlug(volumeSlug)) {
          return null;
        }

        if (this.volumeManifests[volumeSlug]) {
          return this.volumeManifests[volumeSlug];
        }

        if (!this.volumeManifestPromises[volumeSlug]) {
          var self = this;
          this.volumeManifestPromises[volumeSlug] = fetch(this.volumeManifestHref(volumeSlug))
            .then(function (response) {
              if (!response.ok) {
                throw new Error("Could not load volume manifest");
              }
              return response.json();
            })
            .then(function (manifest) {
              self.volumeManifests[volumeSlug] = manifest || { chapters: [], anchorMap: {}, defaultChapter: "" };
              if (self.currentVolumeSlug() === volumeSlug) {
                self.chapterMap = {};
                Array.prototype.forEach.call(
                  (self.volumeManifests[volumeSlug] && self.volumeManifests[volumeSlug].chapters) || [],
                  function (chapter, index) {
                    self.chapterMap[chapter.slug] = Object.assign({ index: index }, chapter);
                  }
                );
                self.syncChapterEntries(volumeSlug);
              }
              return self.volumeManifests[volumeSlug];
            })
            .catch(function (error) {
              self.volumeManifestPromises[volumeSlug] = null;
              throw error;
            });
        }

        return this.volumeManifestPromises[volumeSlug];
      },

      syncChapterEntries(volumeSlug) {
        var manifest = this.volumeManifests[volumeSlug || this.currentVolumeSlug()] || null;
        var chapters = (manifest && manifest.chapters) || [];
        this.chapterMap = {};
        this.chapterEntries = chapters.map(function (chapter, index) {
          this.chapterMap[chapter.slug] = Object.assign({ index: index }, chapter);
          return {
            id: chapter.slug,
            slug: chapter.slug,
            label: chapter.title,
            title: chapter.title,
            path: chapter.path,
            prev: chapter.prev,
            next: chapter.next,
            index: index,
          };
        }, this);
      },

      defaultChapterSlug(volumeSlug) {
        var manifest = this.volumeManifests[volumeSlug || this.currentVolumeSlug()] || null;
        return (manifest && manifest.defaultChapter) || "";
      },

      currentChapter() {
        return this.chapterMap[this.currentChapterSlug] || null;
      },

      currentChapterTitle() {
        var chapter = this.currentChapter();
        return chapter ? chapter.title : "";
      },

      currentChapterLabel() {
        var page = this.pageConfig(this.currentVolumeSlug());
        return this.currentChapterTitle() || (page && (page.title || page.pageTitle)) || "Tom";
      },

      async loadNewsYear(year, options) {
        var settings = Object.assign(
          {
            immediate: false,
            historyMode: "push",
          },
          options || {}
        );

        var targetYear = String(year || this.defaultNewsYear() || "");
        if (!targetYear) {
          return;
        }

        this.currentSlug = "news";
        this.isLoading = true;
        this.closeTransientPanels();
        if (this.$refs.body) {
          this.$refs.body.setAttribute("data-loading", "true");
        }

        try {
          var data = await this.ensureNewsYear(targetYear);
          this.currentNewsYear = targetYear;
          this.syncDocumentMeta();
          this.hydrateNewsBody(data);
          this.bindBodyLinks();
          this.refreshSectionBindings();

          if (settings.historyMode !== "none") {
            var nextUrl = this.newsYearHref(targetYear);
            var state = { slug: "news", year: targetYear };
            if (settings.historyMode === "replace") {
              window.history.replaceState(state, "", nextUrl);
            } else {
              window.history.pushState(state, "", nextUrl);
            }
          }

          window.scrollTo({ top: 0, behavior: settings.immediate ? "auto" : "smooth" });
          this.syncScrollState();
        } catch (error) {
          window.location.href = this.newsYearHref(targetYear);
        } finally {
          this.isLoading = false;
          if (this.$refs.body) {
            this.$refs.body.setAttribute("data-loading", "false");
          }
        }
      },

      async applyCurrentNewsLocation(immediate, skipHistory) {
        var targetYear = this.resolveNewsYearFromPath(window.location.pathname) || this.defaultNewsYear();
        if (!targetYear) {
          return;
        }

        await this.loadNewsYear(targetYear, {
          immediate: immediate,
          historyMode: skipHistory ? "none" : "replace",
        });
      },

      previousChapter() {
        var chapter = this.currentChapter();
        if (!chapter || !chapter.prev) {
          return null;
        }
        return this.chapterMap[chapter.prev] || null;
      },

      nextChapter() {
        var chapter = this.currentChapter();
        if (!chapter || !chapter.next) {
          return null;
        }
        return this.chapterMap[chapter.next] || null;
      },

      hasAdjacentChapter(offset) {
        return offset < 0 ? Boolean(this.previousChapter()) : Boolean(this.nextChapter());
      },

      chapterIndexLabel(chapterId) {
        var chapter = this.chapterMap[chapterId];
        if (!chapter) {
          return "";
        }
        return String(chapter.index + 1).padStart(2, "0");
      },

      toggleMenu() {
        if (!this.activePage || this.activePage.menuMode === "toc") {
          return;
        }

        this.menuOpen = !this.menuOpen;
        if (this.menuOpen) {
          this.tocOpen = false;
          this.chapterPickerOpen = false;
        }
      },

      toggleToc() {
        if (!this.activePage || this.activePage.menuMode !== "toc") {
          return;
        }

        this.tocOpen = !this.tocOpen;
        if (this.tocOpen) {
          this.menuOpen = false;
          this.chapterPickerOpen = false;
          this.$nextTick(this.syncActiveTocLink.bind(this, true));
        }
      },

      toggleChapterPicker() {
        if (!this.isVolumeSlug(this.currentSlug) || this.chapterEntries.length === 0) {
          return;
        }

        this.chapterPickerOpen = !this.chapterPickerOpen;
        if (this.chapterPickerOpen) {
          this.menuOpen = false;
          this.tocOpen = false;
        }
      },

      closeTransientPanels() {
        this.menuOpen = false;
        this.tocOpen = false;
        this.chapterPickerOpen = false;
      },

      syncDocumentMeta() {
        var page = this.config.pageMap[this.currentSlug];
        if (!page) {
          return;
        }

        this.activePage = page;

        var documentTitle = page.documentTitle || this.config.siteTitle || document.title;
        if (page.pageType === "volume") {
          var chapterTitle = this.currentChapterTitle();
          if (chapterTitle) {
            documentTitle += " — " + chapterTitle;
          }
        } else if (page.pageType === "news" && this.currentNewsYear) {
          documentTitle += " — " + this.currentNewsYear;
        }
        document.title = documentTitle;

        var descriptionMeta = document.querySelector("meta[name='description']");
        if (descriptionMeta && page.description) {
          descriptionMeta.setAttribute("content", page.description);
        }
      },

      activeVolumeMetaLabel() {
        if (!this.activePage || this.activePage.pageType !== "volume") {
          return "";
        }

        var metaParts = [];
        if (this.activePage.title) {
          metaParts.push(this.activePage.title);
        }
        if (this.activePage.version) {
          metaParts.push("v" + this.activePage.version);
        }
        if (this.activePage.releaseDate) {
          metaParts.push(this.activePage.releaseDate);
        }

        return metaParts.join(" • ");
      },

      currentSections() {
        if (!this.activePage || !Array.isArray(this.activePage.sections)) {
          return [];
        }

        return this.activePage.sections;
      },

      sectionHref(sectionId) {
        return this.pageHref(this.currentSlug) + "#" + encodeURIComponent(sectionId);
      },

      scrollToElementId(elementId, immediate) {
        if (!elementId) {
          return false;
        }

        var element = this.findLocalAnchorElement(elementId);
        if (!element) {
          return false;
        }

        element.scrollIntoView({ behavior: immediate ? "auto" : "smooth", block: "start" });
        return true;
      },

      updateVolumeHistory(volumeSlug, chapterSlug, anchor, historyMode, useRootPath) {
        if (historyMode === "none") {
          return;
        }

        var baseUrl = useRootPath
          ? this.pageHref(volumeSlug)
          : this.chapterHref(volumeSlug, chapterSlug);
        var nextUrl = anchor ? baseUrl + "#" + encodeURIComponent(anchor) : baseUrl;
        var state = { slug: volumeSlug, chapter: chapterSlug, anchor: anchor || "" };

        if (historyMode === "replace") {
          window.history.replaceState(state, "", nextUrl);
          return;
        }

        window.history.pushState(state, "", nextUrl);
      },

      chapterHref(volumeSlug, chapterSlug) {
        var chapter = this.chapterMap[chapterSlug];
        if (!chapter) {
          return this.pageHref(volumeSlug);
        }

        return this.siteBasePath + String(chapter.path || "").replace(/^\/+/, "");
      },

      async loadPageFragments(slug, immediate, skipHistory) {
        if (!this.config.pageMap[slug]) {
          return;
        }

        if (this.isVolumeSlug(slug)) {
          await this.ensureVolumeManifest(slug);
          var defaultSlug = this.defaultChapterSlug(slug);
          await this.loadChapter(slug, defaultSlug, {
            immediate: immediate,
            historyMode: skipHistory ? "none" : "push",
            useRootPath: true,
          });
          return;
        }

        if (this.isNewsSlug(slug) && slug === this.currentSlug) {
          await this.applyCurrentNewsLocation(immediate, skipHistory);
          this.syncScrollState();
          return;
        }

        if (slug === this.currentSlug) {
          this.closeTransientPanels();
          window.scrollTo({ top: 0, behavior: immediate ? "auto" : "smooth" });
          if (!skipHistory) {
            window.history.replaceState({ slug: slug }, "", this.pageHref(slug));
          }
          this.applyCurrentHash(true, true);
          this.syncScrollState();
          return;
        }

        this.isLoading = true;
        this.closeTransientPanels();
        this.tocQuery = "";
        this.tocHasNoResults = false;
        if (this.$refs.body) {
          this.$refs.body.setAttribute("data-loading", "true");
        }

        if (!immediate) {
          await wait(130);
        }

        try {
          var page = this.config.pageMap[slug];
          var bodyPromise = fetch(this.fragmentHref(slug, "body")).then(function (response) {
            if (!response.ok) {
              throw new Error("Could not load body fragment");
            }
            return response.text();
          });
          var tocPromise = page.showToc
            ? fetch(this.fragmentHref(slug, "toc")).then(function (response) {
                if (!response.ok) {
                  throw new Error("Could not load toc fragment");
                }
                return response.text();
              })
            : Promise.resolve("");

          var results = await Promise.all([bodyPromise, tocPromise]);
          var bodyHtml = results[0];
          var tocHtml = results[1];

          if (!skipHistory) {
            window.history.pushState({ slug: slug }, "", this.pageHref(slug));
          }

          this.currentSlug = slug;
          this.currentChapterSlug = "";
          this.chapterEntries = [];
          this.chapterMap = {};
          if (this.$refs.body) {
            this.$refs.body.innerHTML = bodyHtml;
          }
          if (this.$refs.toc) {
            this.$refs.toc.innerHTML = tocHtml;
          }
          this.tocHtml = tocHtml.trim();
          this.syncDocumentMeta();
          this.bindBodyLinks();
          this.refreshSectionBindings();
          this.refreshTocBindings();
          if (this.isNewsSlug(slug)) {
            await this.applyCurrentNewsLocation(true, true);
          } else {
            this.applyCurrentHash(true, true);
          }
          window.scrollTo({ top: 0, behavior: immediate ? "auto" : "smooth" });
          this.syncScrollState();
        } catch (error) {
          window.location.href = this.pageHref(slug);
        } finally {
          this.isLoading = false;
          if (this.$refs.body) {
            this.$refs.body.setAttribute("data-loading", "false");
          }
        }
      },

      async go(slug, immediate, skipHistory) {
        await this.loadPageFragments(slug, immediate, skipHistory);
      },

      async loadChapter(volumeSlug, chapterSlug, options) {
        var settings = Object.assign(
          {
            anchor: "",
            immediate: false,
            historyMode: "push",
            useRootPath: false,
          },
          options || {}
        );

        await this.ensureVolumeManifest(volumeSlug);
        this.syncChapterEntries(volumeSlug);

        var targetSlug = chapterSlug || this.defaultChapterSlug(volumeSlug);
        var chapter = this.chapterMap[targetSlug];
        if (!chapter) {
          return;
        }

        if (
          this.currentSlug === volumeSlug &&
          this.currentChapterSlug === targetSlug &&
          this.$refs.body &&
          this.$refs.body.innerHTML.trim().length > 0
        ) {
          this.closeTransientPanels();
          this.currentSlug = volumeSlug;
          this.currentChapterSlug = targetSlug;
          this.syncDocumentMeta();
          if (settings.historyMode !== "none") {
            this.updateVolumeHistory(
              volumeSlug,
              targetSlug,
              settings.anchor,
              settings.historyMode,
              settings.useRootPath
            );
          }

          if (settings.anchor) {
            await this.goToAnchor(settings.anchor, {
              immediate: settings.immediate,
              historyMode: "none",
            });
          } else {
            window.scrollTo({ top: 0, behavior: settings.immediate ? "auto" : "smooth" });
          }
          this.syncScrollState();
          return;
        }

        this.isLoading = true;
        this.closeTransientPanels();
        this.tocQuery = "";
        this.tocHasNoResults = false;
        if (this.$refs.body) {
          this.$refs.body.setAttribute("data-loading", "true");
        }

        if (!settings.immediate) {
          await wait(130);
        }

        try {
          var bodyHref = this.siteBasePath + String(chapter.bodyFragment || "").replace(/^\/+/, "") + "?v=" + this.config.assetVersion;
          var tocHref = this.siteBasePath + String(chapter.tocFragment || "").replace(/^\/+/, "") + "?v=" + this.config.assetVersion;

          var results = await Promise.all([
            fetch(bodyHref).then(function (response) {
              if (!response.ok) {
                throw new Error("Could not load chapter body");
              }
              return response.text();
            }),
            fetch(tocHref).then(function (response) {
              if (!response.ok) {
                throw new Error("Could not load chapter toc");
              }
              return response.text();
            }),
          ]);

          var bodyHtml = results[0];
          var tocHtml = results[1];

          this.currentSlug = volumeSlug;
          this.currentChapterSlug = targetSlug;
          if (this.$refs.body) {
            this.$refs.body.innerHTML = bodyHtml;
          }
          if (this.$refs.toc) {
            this.$refs.toc.innerHTML = tocHtml;
          }
          this.tocHtml = tocHtml.trim();
          this.syncDocumentMeta();
          this.bindBodyLinks();
          this.refreshSectionBindings();
          this.refreshTocBindings();

          if (settings.historyMode !== "none") {
            this.updateVolumeHistory(
              volumeSlug,
              targetSlug,
              settings.anchor,
              settings.historyMode,
              settings.useRootPath
            );
          }

          if (settings.anchor) {
            await this.goToAnchor(settings.anchor, {
              immediate: true,
              historyMode: "none",
            });
          } else {
            window.scrollTo({ top: 0, behavior: settings.immediate ? "auto" : "smooth" });
          }

          this.syncScrollState();
        } catch (error) {
          window.location.href = this.chapterHref(volumeSlug, targetSlug);
        } finally {
          this.isLoading = false;
          if (this.$refs.body) {
            this.$refs.body.setAttribute("data-loading", "false");
          }
        }
      },

      async goToAnchor(anchor, options) {
        var settings = Object.assign(
          {
            immediate: false,
            historyMode: "push",
            useRootPath: false,
          },
          options || {}
        );

        if (!anchor) {
          return;
        }

        if (!this.isVolumeSlug(this.currentSlug)) {
          if (this.scrollToElementId(anchor, settings.immediate) && settings.historyMode !== "none") {
            var localHref = this.pageHref(this.currentSlug) + "#" + encodeURIComponent(anchor);
            if (settings.historyMode === "replace") {
              window.history.replaceState({ slug: this.currentSlug }, "", localHref);
            } else {
              window.history.pushState({ slug: this.currentSlug }, "", localHref);
            }
          }
          return;
        }

        var activeVolumeSlug = this.currentVolumeSlug();
        await this.ensureVolumeManifest(activeVolumeSlug);

        var localElement = this.findLocalAnchorElement(anchor);

        if (localElement) {
          localElement.scrollIntoView({
            behavior: settings.immediate ? "auto" : "smooth",
            block: "start",
          });

          if (settings.historyMode !== "none") {
            this.updateVolumeHistory(
              activeVolumeSlug,
              this.currentChapterSlug,
              anchor,
              settings.historyMode,
              settings.useRootPath
            );
          }

          if (window.matchMedia("(max-width: 1099px)").matches) {
            this.tocOpen = false;
          }

          this.syncScrollState();
          return;
        }

        var targetChapterSlug =
          this.volumeManifests[activeVolumeSlug] &&
          this.volumeManifests[activeVolumeSlug].anchorMap &&
          this.volumeManifests[activeVolumeSlug].anchorMap[anchor];

        if (targetChapterSlug && targetChapterSlug !== this.currentChapterSlug) {
          await this.loadChapter(activeVolumeSlug, targetChapterSlug, {
            anchor: anchor,
            immediate: settings.immediate,
            historyMode: settings.historyMode,
            useRootPath: settings.useRootPath,
          });
          return;
        }

        return;
      },

      async goChapter(chapterId) {
        this.chapterPickerOpen = false;
        await this.loadChapter(this.currentVolumeSlug(), chapterId, {
          immediate: false,
          historyMode: "push",
        });
      },

      async goAdjacentChapter(offset) {
        var chapter = offset < 0 ? this.previousChapter() : this.nextChapter();
        if (!chapter) {
          return;
        }

        await this.loadChapter(this.currentVolumeSlug(), chapter.slug, {
          immediate: false,
          historyMode: "push",
        });
      },

      async goToPreviousChapter() {
        await this.goAdjacentChapter(-1);
      },

      async goToNextChapter() {
        await this.goAdjacentChapter(1);
      },

      async applyCurrentVolumeLocation(immediate, skipHistory) {
        var volumeSlug = this.resolveSlugFromPath(window.location.pathname);
        await this.ensureVolumeManifest(volumeSlug);
        var targetChapter =
          this.resolveChapterSlugFromPath(window.location.pathname, volumeSlug) ||
          this.currentChapterSlug ||
          this.defaultChapterSlug(volumeSlug);
        var anchor = this.currentHash();

        if (!targetChapter) {
          return;
        }

        if (this.currentChapterSlug !== targetChapter) {
          await this.loadChapter(volumeSlug, targetChapter, {
            anchor: anchor,
            immediate: immediate,
            historyMode: "none",
          });
          return;
        }

        if (anchor) {
          await this.goToAnchor(anchor, {
            immediate: immediate,
            historyMode: skipHistory ? "none" : "replace",
          });
          return;
        }

        window.scrollTo({ top: 0, behavior: immediate ? "auto" : "smooth" });
        this.syncScrollState();
      },

      findLocalAnchorElement(anchor) {
        if (!anchor) {
          return null;
        }

        return (
          document.getElementById(anchor) ||
          (this.$refs.body
            ? this.$refs.body.querySelector("#" + escapeSelectorValue(anchor))
            : null)
        );
      },
      
      async handlePopState() {
        var nextSlug = this.resolveSlugFromPath(window.location.pathname);
        if (this.isNewsSlug(nextSlug)) {
          await this.applyCurrentNewsLocation(true, true);
          return;
        }

        if (!this.isVolumeSlug(nextSlug)) {
          if (nextSlug === this.currentSlug) {
            this.applyCurrentHash(true, true);
            return;
          }

          await this.go(nextSlug, true, true);
          return;
        }

        await this.applyCurrentVolumeLocation(true, true);
      },

      async handleHashChange() {
        if (this.isVolumeSlug(this.resolveSlugFromPath(window.location.pathname))) {
          await this.applyCurrentVolumeLocation(true, true);
          return;
        }

        this.applyCurrentHash(true, true);
        this.syncScrollState();
      },

      applyCurrentHash(immediate, skipHistory) {
        if (!this.activePage || this.activePage.menuMode !== "sections") {
          this.activeSectionId = "";
          return;
        }

        var fallbackSection = this.currentSections()[0];
        var hash = this.currentHash();

        if (hash) {
          this.scrollToSection(hash, immediate, skipHistory);
          return;
        }

        this.activeSectionId = fallbackSection ? fallbackSection.id : "";
      },

      scrollToSection(sectionId, immediate, skipHistory) {
        if (!sectionId || !this.activePage || this.activePage.menuMode !== "sections") {
          return;
        }

        var section = document.getElementById(sectionId);
        if (!section) {
          return;
        }

        this.menuOpen = false;
        this.activeSectionId = sectionId;
        section.scrollIntoView({ behavior: immediate ? "auto" : "smooth", block: "start" });

        if (!skipHistory) {
          window.history.replaceState({ slug: this.currentSlug }, "", this.sectionHref(sectionId));
        }
      },

      bindBodyLinks() {
        if (!this.$refs.body) {
          return;
        }

        var self = this;
        Array.prototype.forEach.call(this.$refs.body.querySelectorAll("a[href]"), function (link) {
          if (link.dataset.deagoniaBound === "true") {
            return;
          }

          link.dataset.deagoniaBound = "true";
          link.addEventListener("click", function (event) {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === "_blank") {
              return;
            }

            var chapterLink = link.dataset.chapterLink;
            if (chapterLink) {
              event.preventDefault();
              self.loadChapter(self.currentVolumeSlug(), chapterLink, {
                immediate: false,
                historyMode: "push",
              });
              return;
            }

            var newsYear = link.dataset.newsYear;
            if (newsYear) {
              event.preventDefault();
              self.loadNewsYear(newsYear, {
                immediate: false,
                historyMode: "push",
              });
              return;
            }

            var rawHref = link.getAttribute("href") || "";
            if (!rawHref) {
              return;
            }

            if (rawHref.startsWith("#")) {
              if (self.isVolumeSlug(self.currentSlug)) {
                event.preventDefault();
                self.goToAnchor(safeDecodeURIComponent(rawHref.slice(1)), {
                  immediate: false,
                  historyMode: "push",
                });
              }
              return;
            }

            var slug = self.resolveSlugFromHref(rawHref);
            if (!slug) {
              return;
            }

            event.preventDefault();
            if (self.isVolumeSlug(slug)) {
              var target = self.resolveVolumeTargetFromHref(rawHref) || {};
              if (target.chapterSlug) {
                self.loadChapter(target.slug || slug, target.chapterSlug, {
                  anchor: target.anchor,
                  immediate: false,
                  historyMode: "push",
                });
              } else if (target.anchor) {
                self.loadChapter(target.slug || slug, "", {
                  anchor: target.anchor,
                  immediate: false,
                  historyMode: "push",
                  useRootPath: true,
                });
              } else {
                self.go(slug, false);
              }
              return;
            }

            self.go(slug, false);
          });
        });
      },

      refreshTocBindings() {
        this.tocEntries = [];

        if (!this.activePage || !this.activePage.showToc || !this.$refs.toc) {
          this.tocHtml = "";
          this.tocHasNoResults = false;
          this.activeTocEntryId = "";
          return;
        }

        this.tocHtml = this.$refs.toc.innerHTML.trim();
        if (!this.tocHtml) {
          this.tocHasNoResults = false;
          this.activeTocEntryId = "";
          return;
        }

        var self = this;
        var tocLinks = Array.prototype.slice.call(this.$refs.toc.querySelectorAll("a[href]"));

        tocLinks.forEach(function (link) {
          if (link.dataset.deagoniaBound === "true") {
            return;
          }

          link.dataset.deagoniaBound = "true";
          link.addEventListener("click", function (event) {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
              return;
            }

            var href = link.getAttribute("href") || "";
            if (href.startsWith("#")) {
              event.preventDefault();
              self.goToAnchor(safeDecodeURIComponent(href.slice(1)), {
                immediate: false,
                historyMode: "push",
              });
              return;
            }
          });
        });

        tocLinks.forEach(function (link) {
          var href = link.getAttribute("href") || "";
          if (!href.startsWith("#")) {
            return;
          }

          var id = safeDecodeURIComponent(href.slice(1));
          var section = document.getElementById(id);
          if (!section) {
            return;
          }

          self.tocEntries.push({ id: id, link: link, section: section, item: link.closest("li") });
        });

        this.filterToc();
        this.syncScrollState();
      },

      filterToc() {
        if (!this.$refs.toc) {
          this.tocHasNoResults = false;
          return;
        }

        var query = String(this.tocQuery || "").trim().toLocaleLowerCase("pl");
        var rootList = this.$refs.toc.querySelector("ul");

        if (!rootList) {
          this.tocHasNoResults = false;
          return;
        }

        function visit(list) {
          var hasVisibleItem = false;

          Array.prototype.forEach.call(list.children, function (item) {
            if (!item.matches("li")) {
              return;
            }

            var link = item.querySelector(":scope > a");
            var childList = item.querySelector(":scope > ul");
            var selfMatches =
              !query ||
              (link && link.textContent && link.textContent.toLocaleLowerCase("pl").includes(query));
            var childMatches = childList ? visit(childList) : false;
            var isVisible = !query || selfMatches || childMatches;

            item.hidden = !isVisible;
            if (link) {
              link.classList.toggle("is-match", Boolean(query) && Boolean(selfMatches));
            }

            if (isVisible) {
              hasVisibleItem = true;
            }
          });

          return hasVisibleItem;
        }

        this.tocHasNoResults = query ? !visit(rootList) : false;

        if (!query) {
          Array.prototype.forEach.call(this.$refs.toc.querySelectorAll("a.is-match"), function (link) {
            link.classList.remove("is-match");
          });
        }

        this.syncActiveTocLink();
      },

      syncScrollState() {
        this.isScrolled = window.scrollY > 8;
        this.syncTocFooterClearance();
        this.syncActiveTocLink();
      },

      syncActiveTocLink(forceCenter) {
        if (!this.activePage || !this.activePage.showToc || !Array.isArray(this.tocEntries) || this.tocEntries.length === 0) {
          this.activeTocEntryId = "";
          return;
        }

        var visibleEntries = this.tocEntries.filter(function (entry) {
          return entry.item && !entry.item.hidden && entry.link.offsetParent !== null;
        });

        if (visibleEntries.length === 0) {
          this.activeTocEntryId = "";
          this.tocEntries.forEach(function (entry) {
            entry.link.classList.remove("is-active");
          });
          return;
        }

        var offset =
          this.activePage && this.activePage.pageType === "volume"
            ? this.isScrolled
              ? 170
              : 186
            : this.isScrolled
              ? 118
              : 134;
        var currentEntry = visibleEntries[0];
        var documentElement = document.documentElement;
        var scrollBottom = window.scrollY + window.innerHeight;
        var pageBottom = Math.max(
          document.body ? document.body.scrollHeight : 0,
          documentElement ? documentElement.scrollHeight : 0
        );
        var isNearPageBottom = pageBottom - scrollBottom <= Math.max(72, window.innerHeight * 0.08);

        if (isNearPageBottom) {
          currentEntry = visibleEntries[visibleEntries.length - 1];
        } else {
          visibleEntries.forEach(function (entry) {
            if (entry.section.getBoundingClientRect().top - offset <= 0) {
              currentEntry = entry;
            }
          });
        }

        var previousEntryId = this.activeTocEntryId;
        this.activeTocEntryId = currentEntry.id;

        this.tocEntries.forEach(function (entry) {
          entry.link.classList.toggle("is-active", entry === currentEntry);
        });

        if (currentEntry && (forceCenter || previousEntryId !== currentEntry.id)) {
          this.centerActiveTocEntry(currentEntry, !previousEntryId);
        }
      },

      centerActiveTocEntry(entry, immediate) {
        if (!entry || !entry.link || !this.$refs.toc) {
          return;
        }

        var container = this.$refs.toc;
        if (!container || container.getClientRects().length === 0 || container.clientHeight < 40) {
          return;
        }

        var linkRect = entry.link.getBoundingClientRect();
        var containerRect = container.getBoundingClientRect();
        var maxScrollTop = container.scrollHeight - container.clientHeight;

        if (maxScrollTop <= 0) {
          return;
        }

        var delta = linkRect.top - containerRect.top - container.clientHeight / 2 + linkRect.height / 2;
        var nextScrollTop = Math.max(0, Math.min(maxScrollTop, container.scrollTop + delta));

        if (Math.abs(nextScrollTop - container.scrollTop) < 10) {
          return;
        }

        container.scrollTo({
          top: nextScrollTop,
          behavior:
            immediate || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        });
      },

      syncTocFooterClearance() {
        var tocPanel = document.getElementById("site-toc");
        if (!tocPanel) {
          return;
        }

        tocPanel.style.setProperty("--toc-footer-shift", "0px");

        if (!this.activePage || !this.activePage.showToc || window.innerWidth < 1100) {
          return;
        }

        var footer = document.querySelector(".site-footer");
        if (!footer) {
          return;
        }

        var footerRect = footer.getBoundingClientRect();
        var intrusion = Math.max(0, window.innerHeight - footerRect.top + 20);
        var maxShift = Math.max(0, window.innerHeight - 220);
        var nextShift = Math.min(intrusion, maxShift);

        tocPanel.style.setProperty("--toc-footer-shift", nextShift + "px");
      },

      refreshSectionBindings() {
        if (this.sectionObserver) {
          this.sectionObserver.disconnect();
          this.sectionObserver = null;
        }

        if (!this.activePage || this.activePage.menuMode !== "sections") {
          this.activeSectionId = "";
          return;
        }

        var observedSections = this.currentSections()
          .map(function (section) {
            return document.getElementById(section.id);
          })
          .filter(Boolean);

        if (observedSections.length === 0) {
          this.activeSectionId = "";
          return;
        }

        this.activeSectionId = observedSections[0].id;

        if (!("IntersectionObserver" in window)) {
          return;
        }

        var self = this;
        this.sectionObserver = new IntersectionObserver(
          function (entries) {
            var visibleEntries = entries
              .filter(function (entry) {
                return entry.isIntersecting;
              })
              .sort(function (left, right) {
                return left.boundingClientRect.top - right.boundingClientRect.top;
              });

            if (visibleEntries.length === 0) {
              return;
            }

            self.activeSectionId = visibleEntries[0].target.id;
          },
          {
            rootMargin: "-18% 0px -68% 0px",
            threshold: [0.15, 0.5, 1],
          }
        );

        observedSections.forEach(function (section) {
          self.sectionObserver.observe(section);
        });
      },
    };
  });
}

if (window.Alpine) {
  registerDeagoniaWebsite(window.Alpine);
} else {
  document.addEventListener("alpine:init", function () {
    registerDeagoniaWebsite(window.Alpine);
  });
}

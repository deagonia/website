(function loadGoogleFonts() {
  if (document.querySelector("[data-deagonia-fonts='true']")) {
    return;
  }

  var preconnectApi = document.createElement("link");
  preconnectApi.rel = "preconnect";
  preconnectApi.href = "https://fonts.googleapis.com";
  preconnectApi.setAttribute("data-deagonia-fonts", "true");

  var preconnectStatic = document.createElement("link");
  preconnectStatic.rel = "preconnect";
  preconnectStatic.href = "https://fonts.gstatic.com";
  preconnectStatic.crossOrigin = "anonymous";
  preconnectStatic.setAttribute("data-deagonia-fonts", "true");

  var stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href =
    "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=GFS+Didot&family=IBM+Plex+Mono:wght@400;500&family=Literata:opsz,wght@7..72,400;7..72,500;7..72,600;7..72,700&family=Source+Sans+3:wght@400;500;600;700&display=swap";
  stylesheet.setAttribute("data-deagonia-fonts", "true");

  document.head.appendChild(preconnectApi);
  document.head.appendChild(preconnectStatic);
  document.head.appendChild(stylesheet);
})();

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

function registerDeagoniaWebsite(AlpineInstance) {
  AlpineInstance.data("deagoniaWebsite", function (config) {
    return {
      config: config || { initialPage: "landing", assetVersion: "0.0.1", pageMap: {} },
      menuOpen: false,
      tocOpen: false,
      isLoading: false,
      currentSlug: "landing",
      activePage: null,
      activeSectionId: "",
      tocHtml: "",
      tocQuery: "",
      tocHasNoResults: false,
      isScrolled: false,
      activeTocEntryId: "",
      siteBasePath: "/",
      sectionObserver: null,
      tocObserver: null,
      tocEntries: [],

      async init() {
        this.currentSlug = this.config.initialPage || "landing";
        this.activePage = this.config.pageMap[this.currentSlug] || null;
        this.tocHtml = this.$refs.toc ? this.$refs.toc.innerHTML.trim() : "";
        this.siteBasePath = this.resolveSiteBasePath();

        this.syncDocumentMeta();
        this.bindBodyLinks();
        this.refreshSectionBindings();
        this.refreshTocBindings();
        this.applyCurrentHash(true, true);
        this.syncScrollState();

        window.addEventListener("popstate", this.handlePopState.bind(this));
        window.addEventListener("hashchange", this.handleHashChange.bind(this));
        window.addEventListener("scroll", this.syncScrollState.bind(this), { passive: true });
        window.addEventListener("resize", this.syncScrollState.bind(this), { passive: true });
      },

      resolveSiteBasePath() {
        var normalizedPath = normalizePathname(window.location.pathname);
        var currentPage = this.config.pageMap[this.currentSlug] || { path: "" };
        var currentSuffix = String(currentPage.path || "");
        if (currentSuffix && normalizedPath.endsWith(currentSuffix)) {
          var slicedPath = normalizedPath.slice(0, -currentSuffix.length);
          return slicedPath.endsWith("/") ? slicedPath : slicedPath + "/";
        }
        return normalizedPath.endsWith("/") ? normalizedPath : normalizedPath + "/";
      },

      pageHref(slug) {
        return this.siteBasePath + String((this.config.pageMap[slug] || {}).path || "");
      },

      siteAssetHref(filename) {
        return this.siteBasePath + String(filename || "") + "?v=" + this.config.assetVersion;
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

      toggleMenu() {
        if (!this.activePage || this.activePage.menuMode === "toc") {
          return;
        }

        var nextState = !this.menuOpen;
        this.menuOpen = nextState;
        if (nextState) {
          this.tocOpen = false;
        }
      },

      toggleToc() {
        if (!this.activePage || this.activePage.menuMode !== "toc") {
          return;
        }

        var nextState = !this.tocOpen;
        this.tocOpen = nextState;
        if (nextState) {
          this.menuOpen = false;
          this.$nextTick(this.syncActiveTocLink.bind(this, true));
        }
      },

      fragmentHref(slug, kind) {
        return this.siteBasePath + "fragments/" + slug + "." + kind + ".html?v=" + this.config.assetVersion;
      },

      resolveSlugFromPath(pathname) {
        var normalizedPath = normalizePathname(pathname);
        var siteBasePath = this.siteBasePath || this.resolveSiteBasePath();
        var relativePath = normalizedPath.startsWith(siteBasePath)
          ? normalizedPath.slice(siteBasePath.length)
          : normalizedPath;

        if (relativePath.startsWith("community/")) {
          return "community";
        }

        if (relativePath.startsWith("handbook/")) {
          return "handbook";
        }

        return "landing";
      },

      resolveSlugFromHref(href) {
        if (!href || href.startsWith("#")) {
          return null;
        }

        try {
          var absoluteUrl = new URL(href, window.location.href);
          if (absoluteUrl.origin !== window.location.origin) {
            return null;
          }

          return this.resolveSlugFromPath(absoluteUrl.pathname);
        } catch {
          return null;
        }
      },

      syncDocumentMeta() {
        var page = this.config.pageMap[this.currentSlug];
        if (!page) {
          return;
        }

        this.activePage = page;
        document.title = page.documentTitle || this.config.siteTitle || document.title;

        var descriptionMeta = document.querySelector("meta[name='description']");
        if (descriptionMeta && page.description) {
          descriptionMeta.setAttribute("content", page.description);
        }
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

      applyCurrentHash(immediate, skipHistory) {
        if (!this.activePage || this.activePage.menuMode !== "sections") {
          this.activeSectionId = "";
          return;
        }

        var fallbackSection = this.currentSections()[0];
        var hash = window.location.hash ? decodeURIComponent(window.location.hash.slice(1)) : "";

        if (hash) {
          this.scrollToSection(hash, immediate, skipHistory);
          return;
        }

        this.activeSectionId = fallbackSection ? fallbackSection.id : "";
      },

      async go(slug, immediate, skipHistory) {
        if (!this.config.pageMap[slug]) {
          return;
        }

        if (slug === this.currentSlug) {
          this.menuOpen = false;
          if (slug !== "handbook") {
            this.tocOpen = false;
          }
          window.scrollTo({ top: 0, behavior: immediate ? "auto" : "smooth" });
          if (!skipHistory) {
            window.history.replaceState({ slug: slug }, "", this.pageHref(slug));
          }
          this.applyCurrentHash(true, true);
          this.syncScrollState();
          return;
        }

        this.isLoading = true;
        this.menuOpen = false;
        this.tocOpen = false;
        this.tocQuery = "";
        this.tocHasNoResults = false;
        this.$refs.body.setAttribute("data-loading", "true");

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
          this.$refs.body.innerHTML = bodyHtml;
          if (this.$refs.toc) {
            this.$refs.toc.innerHTML = tocHtml;
          }
          this.tocHtml = tocHtml.trim();
          this.syncDocumentMeta();
          this.bindBodyLinks();
          this.refreshSectionBindings();
          this.refreshTocBindings();
          this.applyCurrentHash(true, true);
          window.scrollTo({ top: 0, behavior: immediate ? "auto" : "smooth" });
          this.syncScrollState();
        } catch (error) {
          window.location.href = this.pageHref(slug);
          return;
        } finally {
          this.isLoading = false;
          this.$refs.body.setAttribute("data-loading", "false");
        }
      },

      handlePopState() {
        var nextSlug = this.resolveSlugFromPath(window.location.pathname);
        if (nextSlug === this.currentSlug) {
          this.applyCurrentHash(true, true);
          return;
        }

        this.go(nextSlug, true, true);
      },

      handleHashChange() {
        this.applyCurrentHash(true, true);
        this.syncScrollState();
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

          var slug = self.resolveSlugFromHref(link.getAttribute("href"));
          if (!slug || link.target === "_blank") {
            return;
          }

          link.dataset.deagoniaBound = "true";
          link.addEventListener("click", function (event) {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
              return;
            }

            event.preventDefault();
            self.go(slug, false);
          });
        });
      },

      refreshTocBindings() {
        if (this.tocObserver) {
          this.tocObserver.disconnect();
          this.tocObserver = null;
        }

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
        var tocLinks = Array.prototype.slice.call(this.$refs.toc.querySelectorAll("a[href^='#']"));

        tocLinks.forEach(function (link) {
          link.addEventListener("click", function () {
            if (window.matchMedia("(max-width: 1099px)").matches) {
              self.tocOpen = false;
            }
          });
        });

        if (tocLinks.length === 0) {
          return;
        }

        tocLinks.forEach(function (link) {
          var id = decodeURIComponent(link.getAttribute("href").slice(1));
          var section = document.getElementById(id);
          if (!section) {
            return;
          }

          self.tocEntries.push({ id: id, link: link, section: section });
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

        var offset = this.isScrolled ? 118 : 134;
        var currentEntry = this.tocEntries[0];

        this.tocEntries.forEach(function (entry) {
          if (entry.section.getBoundingClientRect().top - offset <= 0) {
            currentEntry = entry;
          }
        });

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

        var container = this.$refs.toc.closest(".site-toc-card");
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

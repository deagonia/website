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

document.addEventListener("alpine:init", function () {
  Alpine.data("deagoniaWebsite", function (config) {
    return {
      config: config || { initialPage: "landing", assetVersion: "0.0.1", pageMap: {} },
      menuOpen: false,
      tocOpen: false,
      isLoading: false,
      currentSlug: "landing",
      activePage: null,
      tocHtml: "",
      siteBasePath: "/",
      tocObserver: null,

      async init() {
        this.currentSlug = this.config.initialPage || "landing";
        this.activePage = this.config.pageMap[this.currentSlug] || null;
        this.tocHtml = this.$refs.toc ? this.$refs.toc.innerHTML.trim() : "";
        this.siteBasePath = this.resolveSiteBasePath();

        this.syncDocumentMeta();
        this.bindBodyLinks();
        this.refreshTocBindings();

        window.addEventListener("popstate", this.handlePopState.bind(this));
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

      async go(slug, immediate, skipHistory) {
        if (!this.config.pageMap[slug]) {
          return;
        }

        if (slug === this.currentSlug) {
          this.menuOpen = false;
          if (slug !== "handbook") {
            this.tocOpen = false;
          }
          return;
        }

        this.isLoading = true;
        this.menuOpen = false;
        this.tocOpen = false;
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
          this.refreshTocBindings();
          window.scrollTo({ top: 0, behavior: immediate ? "auto" : "smooth" });
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
          return;
        }

        this.go(nextSlug, true, true);
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

        if (!this.activePage || !this.activePage.showToc || !this.$refs.toc) {
          this.tocHtml = "";
          return;
        }

        this.tocHtml = this.$refs.toc.innerHTML.trim();
        if (!this.tocHtml) {
          return;
        }

        var self = this;
        var tocLinks = Array.prototype.slice.call(this.$refs.toc.querySelectorAll("#TOC a[href^='#']"));

        tocLinks.forEach(function (link) {
          link.addEventListener("click", function () {
            if (window.matchMedia("(max-width: 1099px)").matches) {
              self.tocOpen = false;
            }
          });
        });

        if (!("IntersectionObserver" in window) || tocLinks.length === 0) {
          return;
        }

        var linkMap = new Map();
        var observed = [];

        tocLinks.forEach(function (link) {
          var id = decodeURIComponent(link.getAttribute("href").slice(1));
          var section = document.getElementById(id);
          if (!section) {
            return;
          }

          linkMap.set(section, link);
          observed.push(section);
        });

        if (observed.length === 0) {
          return;
        }

        var activeLink = null;
        this.tocObserver = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (!entry.isIntersecting) {
                return;
              }

              var nextLink = linkMap.get(entry.target);
              if (!nextLink || nextLink === activeLink) {
                return;
              }

              if (activeLink) {
                activeLink.classList.remove("is-active");
              }

              nextLink.classList.add("is-active");
              activeLink = nextLink;
            });
          },
          {
            rootMargin: "-16% 0px -70% 0px",
            threshold: [0, 1],
          }
        );

        observed.forEach(
          function (section) {
            this.tocObserver.observe(section);
          }.bind(this)
        );
      },
    };
  });
});

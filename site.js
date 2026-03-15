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
    "https://fonts.googleapis.com/css2?family=GFS+Didot&family=GFS+Neohellenic:wght@400;700&family=IBM+Plex+Mono:wght@400;500&family=Noto+Serif:wght@400;500;600;700&display=swap";
  stylesheet.setAttribute("data-deagonia-fonts", "true");

  document.head.appendChild(preconnectApi);
  document.head.appendChild(preconnectStatic);
  document.head.appendChild(stylesheet);
})();

(function () {
  var toggle = document.querySelector("[data-toc-toggle]");
  var panel = document.querySelector("[data-toc-panel]");
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll("#TOC a[href^='#']"));

  function setPanelOpen(nextState) {
    if (!panel || !toggle) {
      return;
    }

    panel.setAttribute("data-open", nextState ? "true" : "false");
    toggle.setAttribute("aria-expanded", nextState ? "true" : "false");
  }

  if (toggle && panel) {
    toggle.addEventListener("click", function () {
      var isOpen = panel.getAttribute("data-open") === "true";
      setPanelOpen(!isOpen);
    });

    tocLinks.forEach(function (link) {
      link.addEventListener("click", function () {
        if (window.matchMedia("(max-width: 1099px)").matches) {
          setPanelOpen(false);
        }
      });
    });
  }

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
  var observer = new IntersectionObserver(
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

  observed.forEach(function (section) {
    observer.observe(section);
  });
})();

// item-zoom.js (V2 only: works with #item-layout-root-v2 + #tpl-unified-v2)

document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("item-layout-root-v2");
    const tpl = document.getElementById("tpl-unified-v2");
  
    if (!root || !tpl) {
      console.warn("[zoom v2] missing root/template nodes");
      return;
    }
  
    // Mount unified template once
    root.innerHTML = "";
    root.appendChild(tpl.content.cloneNode(true));
  
    const activeRoot = root.querySelector(".item-carousel-v2") || root.firstElementChild;
    if (!activeRoot) {
      console.warn("[zoom v2] mounted layout not found");
      return;
    }
  
    // Zoom overlay
    const overlay =
      document.querySelector(".image-selector-v2") ||
      document.querySelector(".image-selector");
  
    if (!overlay) {
      console.warn("[zoom v2] missing zoom overlay");
      return;
    }
  
    const overlayImg =
      overlay.querySelector(".photo-v2") ||
      overlay.querySelector(".photo") ||
      overlay.querySelector("img");
  
    const closeButton =
      overlay.querySelector(".close-v2") ||
      overlay.querySelector(".close");
  
    const catalogue = Array.from(document.querySelectorAll(".catalogue"));
    const navbar = Array.from(document.querySelectorAll(".navbar"));
  
    // Backdrop for reliable close behavior
    let backdrop = overlay.querySelector(".zoom-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "zoom-backdrop";
      overlay.prepend(backdrop);
    }
  
    const ensureSrc = (img) => {
      if (!img) return;
      if (img.getAttribute("src")) return;
      const ds = img.getAttribute("data-src");
      if (ds) img.setAttribute("src", ds);
    };
  
    const setOverlayClosed = () => {
      overlay.style.display = "none";
      overlay.style.opacity = "0";
      overlay.style.pointerEvents = "none";
      overlay.classList.remove("active");
      document.body.classList.remove("lock-scroll");
    };
  
    const setOverlayOpen = () => {
      overlay.style.display = "block";
      overlay.style.opacity = "1";
      overlay.style.pointerEvents = "auto";
      overlay.classList.add("active");
      document.body.classList.add("lock-scroll");
    };
  
    setOverlayClosed();
  
    // --- V2 carousel / snap elements
    const host = activeRoot.querySelector("[data-wb-snap]");
    const track = activeRoot.querySelector("[data-wb-track]");
    const slides = Array.from(activeRoot.querySelectorAll("[data-wb-slide]"));
    const dotsWrap = activeRoot.querySelector("[data-wb-dots]");
    const prevBtn = activeRoot.querySelector("[data-wb-prev]");
    const nextBtn = activeRoot.querySelector("[data-wb-next]");
  
    if (!host || !track || !slides.length) {
      console.warn("[zoom v2] snap carousel elements not found");
      return;
    }
  
    // Load first image immediately
    ensureSrc(slides[0].querySelector("img"));
  
    // Load nearby images
    const preloadAround = (index) => {
      const current = slides[index]?.querySelector("img");
      const next = slides[index + 1]?.querySelector("img");
      const prev = slides[index - 1]?.querySelector("img");
  
      ensureSrc(current);
      ensureSrc(next);
      ensureSrc(prev);
    };
  
    let currentIndex = 0;
    let isProgrammaticScroll = false;
  
    // Dots
    const dots = slides.map((_, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "wb-dot";
      dot.setAttribute("aria-label", `Go to image ${index + 1}`);
      dot.addEventListener("click", () => goTo(index));
      dotsWrap?.appendChild(dot);
      return dot;
    });
  
    const updateDots = () => {
      dots.forEach((dot, index) => {
        dot.classList.toggle("is-active", index === currentIndex);
      });
    };
  
    const getSlideWidth = () => host.clientWidth;
  
    const goTo = (index, behavior = "smooth") => {
      const clamped = ((index % slides.length) + slides.length) % slides.length;
      currentIndex = clamped;
      preloadAround(currentIndex);
  
      isProgrammaticScroll = true;
      host.scrollTo({
        left: getSlideWidth() * currentIndex,
        behavior,
      });
  
      updateDots();
  
      window.setTimeout(() => {
        isProgrammaticScroll = false;
      }, behavior === "smooth" ? 350 : 50);
    };
  
    const syncIndexFromScroll = () => {
      const width = getSlideWidth();
      if (!width) return;
  
      const newIndex = Math.round(host.scrollLeft / width);
      const clamped = Math.max(0, Math.min(slides.length - 1, newIndex));
  
      if (clamped !== currentIndex) {
        currentIndex = clamped;
        preloadAround(currentIndex);
        updateDots();
      }
    };
  
    const onScroll = () => {
      if (isProgrammaticScroll) return;
      syncIndexFromScroll();
    };
  
    let scrollTimer = null;
    const onScrollEndish = () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        goTo(currentIndex);
      }, 80);
    };
  
    host.addEventListener("scroll", onScroll, { passive: true });
    host.addEventListener("scroll", onScrollEndish, { passive: true });
  
    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        goTo(currentIndex - 1);
      });
    }
  
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        goTo(currentIndex + 1);
      });
    }
  
    // Keep correct position on resize
    const onResize = () => goTo(currentIndex, "auto");
    window.addEventListener("resize", onResize);
  
    // --- Zoom logic
    const clickableImgs = slides
      .map((slide) => slide.querySelector("img"))
      .filter(Boolean);
  
    let zoomIndex = 0;
  
    const showZoomImage = (index) => {
      if (!clickableImgs.length || !overlayImg) return;
  
      zoomIndex = ((index % clickableImgs.length) + clickableImgs.length) % clickableImgs.length;
  
      const img = clickableImgs[zoomIndex];
      ensureSrc(img);
  
      const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
      const alt = img.getAttribute("alt") || "";
  
      overlayImg.src = src;
      overlayImg.alt = alt;
    };
  
    const openOverlay = (index) => {
      showZoomImage(index);
      setOverlayOpen();
  
      catalogue.forEach((el) => {
        el.dataset.prevDisplay = el.style.display;
        el.style.display = "none";
      });
  
      navbar.forEach((el) => {
        el.dataset.prevDisplay = el.style.display;
        el.style.display = "none";
      });
    };
  
    const closeOverlay = () => {
      setOverlayClosed();
  
      catalogue.forEach((el) => {
        el.style.display = el.dataset.prevDisplay || "";
      });
  
      navbar.forEach((el) => {
        el.style.display = el.dataset.prevDisplay || "";
      });
    };
  
    window.prevImageV2 = () => showZoomImage(zoomIndex - 1);
    window.nextImageV2 = () => showZoomImage(zoomIndex + 1);
  
    const onBackdropClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeOverlay();
    };
  
    backdrop.addEventListener("click", onBackdropClick);
  
    if (closeButton) {
      closeButton.addEventListener("click", closeOverlay);
    }
  
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeOverlay();
      if (!overlay.classList.contains("active")) return;
  
      if (e.key === "ArrowLeft") showZoomImage(zoomIndex - 1);
      if (e.key === "ArrowRight") showZoomImage(zoomIndex + 1);
    });
  
    activeRoot.addEventListener(
      "pointerup",
      (e) => {
        if (overlay.classList.contains("active")) return;
  
        const img = e.target.closest("[data-wb-slide] img, .images img");
        if (!img) return;
  
        const index = clickableImgs.indexOf(img);
        if (index === -1) return;
  
        e.preventDefault();
        e.stopPropagation();
  
        openOverlay(index);
      },
      { capture: true }
    );
  
    // Initial state
    updateDots();
    goTo(0, "auto");
  });
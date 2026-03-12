// item-zoom.js
// desktop: tpl-desktop
// mobile:  tpl-unified-v2

document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("item-layout-root-v2");
  const tplDesktop = document.getElementById("tpl-desktop");
  const tplMobile = document.getElementById("tpl-unified-v2");

  if (!root || !tplDesktop || !tplMobile) {
    console.warn("[item-zoom] missing root/template nodes");
    return;
  }

  const overlay =
    document.querySelector(".image-selector-v2") ||
    document.querySelector(".image-selector");

  if (!overlay) {
    console.warn("[item-zoom] missing zoom overlay");
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

  const mq = window.matchMedia("(max-width: 700px)");
  let cleanupFns = [];

  const mount = (isMobile) => {
    cleanupFns.forEach((fn) => fn());
    cleanupFns = [];

    root.innerHTML = "";
    root.appendChild((isMobile ? tplMobile : tplDesktop).content.cloneNode(true));

    const activeRoot = isMobile
      ? root.querySelector(".item-carousel-v2")
      : root.querySelector(".item");

    if (!activeRoot) {
      console.warn("[item-zoom] active root not found", { isMobile });
      return;
    }

    if (isMobile) {
      mountMobile(activeRoot);
    } else {
      mountDesktop(activeRoot);
    }
  };

  const mountDesktop = (activeRoot) => {
    const imgsWithDataSrc = Array.from(activeRoot.querySelectorAll(".main-images img[data-src]"));
    imgsWithDataSrc.forEach(ensureSrc);

    const clickableImgs = Array.from(activeRoot.querySelectorAll(".main-images img"));

    let currentIndex = 0;

    const showZoomImage = (index) => {
      if (!clickableImgs.length || !overlayImg) return;

      currentIndex = ((index % clickableImgs.length) + clickableImgs.length) % clickableImgs.length;

      const img = clickableImgs[currentIndex];
      ensureSrc(img);

      overlayImg.src = img.getAttribute("src") || img.getAttribute("data-src") || "";
      overlayImg.alt = img.getAttribute("alt") || "";
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

    window.prevImageV2 = () => showZoomImage(currentIndex - 1);
    window.nextImageV2 = () => showZoomImage(currentIndex + 1);

    const onBackdropClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeOverlay();
    };
    backdrop.addEventListener("click", onBackdropClick);
    cleanupFns.push(() => backdrop.removeEventListener("click", onBackdropClick));

    if (closeButton) {
      const onClose = () => closeOverlay();
      closeButton.addEventListener("click", onClose);
      cleanupFns.push(() => closeButton.removeEventListener("click", onClose));
    }

    const onKeyDown = (e) => {
      if (e.key === "Escape") closeOverlay();
      if (!overlay.classList.contains("active")) return;
      if (e.key === "ArrowLeft") showZoomImage(currentIndex - 1);
      if (e.key === "ArrowRight") showZoomImage(currentIndex + 1);
    };
    document.addEventListener("keydown", onKeyDown);
    cleanupFns.push(() => document.removeEventListener("keydown", onKeyDown));

    const onPointerUp = (e) => {
      if (overlay.classList.contains("active")) return;

      const img = e.target.closest(".main-images img");
      if (!img) return;

      const index = clickableImgs.indexOf(img);
      if (index === -1) return;

      e.preventDefault();
      e.stopPropagation();
      openOverlay(index);
    };

    activeRoot.addEventListener("pointerup", onPointerUp, { capture: true });
    cleanupFns.push(() =>
      activeRoot.removeEventListener("pointerup", onPointerUp, { capture: true })
    );
  };

  const mountMobile = (activeRoot) => {
    const host = activeRoot.querySelector("[data-wb-snap]");
    const track = activeRoot.querySelector("[data-wb-track]");
    const slides = Array.from(activeRoot.querySelectorAll("[data-wb-slide]"));
    const dotsWrap = activeRoot.querySelector("[data-wb-dots]");
    const prevBtn = activeRoot.querySelector("[data-wb-prev]");
    const nextBtn = activeRoot.querySelector("[data-wb-next]");

    if (!host || !track || !slides.length) {
      console.warn("[item-zoom] mobile snap carousel elements not found");
      return;
    }

    const slideImgs = slides
      .map((slide) => slide.querySelector("img"))
      .filter(Boolean);

    ensureSrc(slideImgs[0]);

    const preloadAround = (index) => {
      ensureSrc(slideImgs[index]);
      ensureSrc(slideImgs[index - 1]);
      ensureSrc(slideImgs[index + 1]);
    };

    let currentIndex = 0;
    let zoomIndex = 0;
    let isProgrammaticScroll = false;

    if (dotsWrap) dotsWrap.innerHTML = "";

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
      currentIndex = ((index % slides.length) + slides.length) % slides.length;
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
    cleanupFns.push(() => {
      host.removeEventListener("scroll", onScroll);
      host.removeEventListener("scroll", onScrollEndish);
    });

    if (prevBtn) {
      const onPrev = () => goTo(currentIndex - 1);
      prevBtn.addEventListener("click", onPrev);
      cleanupFns.push(() => prevBtn.removeEventListener("click", onPrev));
    }

    if (nextBtn) {
      const onNext = () => goTo(currentIndex + 1);
      nextBtn.addEventListener("click", onNext);
      cleanupFns.push(() => nextBtn.removeEventListener("click", onNext));
    }

    const onResize = () => goTo(currentIndex, "auto");
    window.addEventListener("resize", onResize);
    cleanupFns.push(() => window.removeEventListener("resize", onResize));

    const showZoomImage = (index) => {
      if (!slideImgs.length || !overlayImg) return;

      zoomIndex = ((index % slideImgs.length) + slideImgs.length) % slideImgs.length;

      const img = slideImgs[zoomIndex];
      ensureSrc(img);

      overlayImg.src = img.getAttribute("src") || img.getAttribute("data-src") || "";
      overlayImg.alt = img.getAttribute("alt") || "";
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
    cleanupFns.push(() => backdrop.removeEventListener("click", onBackdropClick));

    if (closeButton) {
      const onClose = () => closeOverlay();
      closeButton.addEventListener("click", onClose);
      cleanupFns.push(() => closeButton.removeEventListener("click", onClose));
    }

    const onKeyDown = (e) => {
      if (e.key === "Escape") closeOverlay();
      if (!overlay.classList.contains("active")) return;
      if (e.key === "ArrowLeft") showZoomImage(zoomIndex - 1);
      if (e.key === "ArrowRight") showZoomImage(zoomIndex + 1);
    };
    document.addEventListener("keydown", onKeyDown);
    cleanupFns.push(() => document.removeEventListener("keydown", onKeyDown));

    const onPointerUp = (e) => {
      if (overlay.classList.contains("active")) return;

      const img = e.target.closest("[data-wb-slide] img");
      if (!img) return;

      const index = slideImgs.indexOf(img);
      if (index === -1) return;

      e.preventDefault();
      e.stopPropagation();
      openOverlay(index);
    };

    activeRoot.addEventListener("pointerup", onPointerUp, { capture: true });
    cleanupFns.push(() =>
      activeRoot.removeEventListener("pointerup", onPointerUp, { capture: true })
    );

    updateDots();
    goTo(0, "auto");
  };

  mount(mq.matches);
  mq.addEventListener("change", (e) => mount(e.matches));
});

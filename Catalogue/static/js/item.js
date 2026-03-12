// item-zoom.js
// desktop: tpl-desktop
// mobile: tpl-unified-v2

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

  const hideChrome = () => {
    catalogue.forEach((el) => {
      el.dataset.prevDisplay = el.style.display;
      el.style.display = "none";
    });

    navbar.forEach((el) => {
      el.dataset.prevDisplay = el.style.display;
      el.style.display = "none";
    });
  };

  const showChrome = () => {
    catalogue.forEach((el) => {
      el.style.display = el.dataset.prevDisplay || "";
    });

    navbar.forEach((el) => {
      el.style.display = el.dataset.prevDisplay || "";
    });
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
    const imgsWithDataSrc = Array.from(
      activeRoot.querySelectorAll(".main-images img[data-src]")
    );
    imgsWithDataSrc.forEach(ensureSrc);

    const clickableImgs = Array.from(activeRoot.querySelectorAll(".main-images img"));
    let currentIndex = 0;

    const showZoomImage = (index) => {
      if (!clickableImgs.length || !overlayImg) return;

      currentIndex =
        ((index % clickableImgs.length) + clickableImgs.length) % clickableImgs.length;

      const img = clickableImgs[currentIndex];
      ensureSrc(img);

      overlayImg.src = img.getAttribute("src") || img.getAttribute("data-src") || "";
      overlayImg.alt = img.getAttribute("alt") || "";
    };

    const openOverlay = (index) => {
      showZoomImage(index);
      setOverlayOpen();
      hideChrome();
    };

    const closeOverlay = () => {
      setOverlayClosed();
      showChrome();
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
    if (!host || !track) {
      console.warn("[item-zoom] mobile snap carousel elements not found");
      return;
    }

    const originalSlides = Array.from(track.querySelectorAll("[data-wb-slide]"));
    if (!originalSlides.length) return;

    ensureSrc(track.querySelector("img[data-src]"));

    const dotsWrap = activeRoot.querySelector("[data-wb-dots]");
    const prevBtn = activeRoot.querySelector("[data-wb-prev]");
    const nextBtn = activeRoot.querySelector("[data-wb-next]");

    // ---------------------------------------------------------
    // Dots
    // ---------------------------------------------------------
    const dots = [];

    const setActiveDot = (idx) => {
      dots.forEach((d, i) => d.classList.toggle("is-active", i === idx));
    };

    // ---------------------------------------------------------
    // Clone first + last for real infinite effect
    // ---------------------------------------------------------
    const cloneFirst = originalSlides[0].cloneNode(true);
    const cloneLast = originalSlides[originalSlides.length - 1].cloneNode(true);

    cloneFirst.setAttribute("data-wb-clone", "first");
    cloneLast.setAttribute("data-wb-clone", "last");

    track.insertBefore(cloneLast, originalSlides[0]);
    track.appendChild(cloneFirst);

    const allSlides = Array.from(track.querySelectorAll("[data-wb-slide]"));
    const realCount = originalSlides.length;

    if (dotsWrap) {
      dotsWrap.innerHTML = "";
      for (let i = 0; i < realCount; i++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "wb-dot" + (i === 0 ? " is-active" : "");
        b.setAttribute("aria-label", `Go to image ${i + 1}`);
        b.addEventListener("click", (e) => {
          e.preventDefault();
          moveToRealIndex(i, true);
        });
        dotsWrap.appendChild(b);
        dots.push(b);
      }
    }

    // IMPORTANT: preserve your old working carousel behavior
    const slideW = () => track.clientWidth;
    const realToDom = (realIdx) => realIdx + 1; // dom 0 = cloneLast
    const normalizeIndex = (idx) => ((idx % realCount) + realCount) % realCount;

    let currentRealIndex = 0;
    let zoomIndex = 0;
    let isAutoJumping = false;
    let isAnimatingByButton = false;
    let settleRaf = null;
    let lastScrollLeft = track.scrollLeft;
    let stableFrames = 0;
    let activeScrollAnimation = null;

    const loadNeighbors = (realIdx) => {
      const domIdx = realToDom(realIdx);
      ensureSrc(allSlides[domIdx]?.querySelector("img[data-src]"));
      ensureSrc(allSlides[domIdx - 1]?.querySelector("img[data-src]"));
      ensureSrc(allSlides[domIdx + 1]?.querySelector("img[data-src]"));
    };

    const setScrollSnap = (enabled) => {
      track.style.scrollSnapType = enabled ? "" : "none";
    };

    const instantScrollTo = (left) => {
      if (activeScrollAnimation) {
        cancelAnimationFrame(activeScrollAnimation);
        activeScrollAnimation = null;
      }

      isAutoJumping = true;
      setScrollSnap(false);
      track.scrollLeft = left;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setScrollSnap(true);
          isAutoJumping = false;
        });
      });
    };

    const syncUI = (realIdx) => {
      currentRealIndex = normalizeIndex(realIdx);
      setActiveDot(currentRealIndex);
      loadNeighbors(currentRealIndex);
    };

    const animateScrollTo = (targetLeft, duration = 160) => {
      if (activeScrollAnimation) {
        cancelAnimationFrame(activeScrollAnimation);
        activeScrollAnimation = null;
      }

      const startLeft = track.scrollLeft;
      const distance = targetLeft - startLeft;

      if (!duration || duration <= 0 || Math.abs(distance) < 1) {
        track.scrollLeft = targetLeft;
        return;
      }

      let startTime = null;
      const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

      const step = (timestamp) => {
        if (startTime === null) startTime = timestamp;

        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeOutCubic(progress);

        track.scrollLeft = startLeft + distance * eased;

        if (progress < 1) {
          activeScrollAnimation = requestAnimationFrame(step);
        } else {
          activeScrollAnimation = null;
        }
      };

      activeScrollAnimation = requestAnimationFrame(step);
    };

    const moveToDomIndex = (domIdx, smooth = true) => {
      const left = domIdx * slideW();

      if (!smooth) {
        if (activeScrollAnimation) {
          cancelAnimationFrame(activeScrollAnimation);
          activeScrollAnimation = null;
        }
        track.scrollLeft = left;
        return;
      }

      animateScrollTo(left, 160);
    };

    const moveToRealIndex = (realIdx, smooth = true) => {
      const normalized = normalizeIndex(realIdx);
      syncUI(normalized);
      moveToDomIndex(realToDom(normalized), smooth);
    };

    const getNearestDomIndex = () => {
      const w = slideW();
      if (!w) return 1;
      return Math.round(track.scrollLeft / w);
    };

    const handleLoopRepositionIfNeeded = () => {
      const domIdx = getNearestDomIndex();

      // 0 = cloneLast
      if (domIdx === 0) {
        instantScrollTo(realCount * slideW());
        syncUI(realCount - 1);
        return;
      }

      // realCount + 1 = cloneFirst
      if (domIdx === realCount + 1) {
        instantScrollTo(slideW());
        syncUI(0);
        return;
      }

      // normal real slides
      syncUI(domIdx - 1);
    };

    const onScrollSettled = () => {
      handleLoopRepositionIfNeeded();
      isAnimatingByButton = false;
    };

    const watchScrollSettled = () => {
      cancelAnimationFrame(settleRaf);

      const check = () => {
        const now = track.scrollLeft;

        if (Math.abs(now - lastScrollLeft) < 0.5) {
          stableFrames += 1;
        } else {
          stableFrames = 0;
          lastScrollLeft = now;
        }

        if (stableFrames >= 3) {
          stableFrames = 0;
          onScrollSettled();
          return;
        }

        settleRaf = requestAnimationFrame(check);
      };

      lastScrollLeft = track.scrollLeft;
      stableFrames = 0;
      settleRaf = requestAnimationFrame(check);
    };

    // ---------------------------------------------------------
    // Initial position: first real slide
    // ---------------------------------------------------------
    instantScrollTo(slideW());
    syncUI(0);

    // ---------------------------------------------------------
    // Scroll observer
    // ---------------------------------------------------------
    if ("onscrollend" in track) {
      const onScrollEnd = () => {
        if (isAutoJumping) return;
        onScrollSettled();
      };
      track.addEventListener("scrollend", onScrollEnd);
      cleanupFns.push(() => track.removeEventListener("scrollend", onScrollEnd));
    } else {
      const onScroll = () => {
        if (isAutoJumping) return;
        watchScrollSettled();
      };
      track.addEventListener("scroll", onScroll);
      cleanupFns.push(() => track.removeEventListener("scroll", onScroll));
    }

    // ---------------------------------------------------------
    // Prev / Next buttons with REAL loop effect
    // ---------------------------------------------------------
    if (nextBtn) {
      const onNext = (e) => {
        e.preventDefault();
        if (isAnimatingByButton) return;
        isAnimatingByButton = true;

        if (currentRealIndex === realCount - 1) {
          setActiveDot(0);
          loadNeighbors(0);
          moveToDomIndex(realCount + 1, true);
        } else {
          moveToRealIndex(currentRealIndex + 1, true);
        }
      };

      nextBtn.addEventListener("click", onNext);
      cleanupFns.push(() => nextBtn.removeEventListener("click", onNext));
    }

    if (prevBtn) {
      const onPrev = (e) => {
        e.preventDefault();
        if (isAnimatingByButton) return;
        isAnimatingByButton = true;

        if (currentRealIndex === 0) {
          setActiveDot(realCount - 1);
          loadNeighbors(realCount - 1);
          moveToDomIndex(0, true);
        } else {
          moveToRealIndex(currentRealIndex - 1, true);
        }
      };

      prevBtn.addEventListener("click", onPrev);
      cleanupFns.push(() => prevBtn.removeEventListener("click", onPrev));
    }

    // ---------------------------------------------------------
    // ZOOM OVERLAY V2
    // ---------------------------------------------------------
    const getRealImgAt = (realIdx) => {
      const domIdx = realToDom(normalizeIndex(realIdx));
      return allSlides[domIdx]?.querySelector("img");
    };

    const showZoom = (realIdx) => {
      const normalized = normalizeIndex(realIdx);
      const img = getRealImgAt(normalized);

      ensureSrc(img);

      const src = img?.getAttribute("src") || img?.getAttribute("data-src") || "";
      if (overlayImg) overlayImg.src = src;
      if (overlayImg) overlayImg.alt = img?.getAttribute("alt") || "";

      zoomIndex = normalized;
      currentRealIndex = normalized;
      setActiveDot(currentRealIndex);
    };

    const openZoom = (realIdx) => {
      setOverlayOpen();
      hideChrome();
      showZoom(realIdx);
    };

    const closeZoom = () => {
      setOverlayClosed();
      showChrome();
    };

    window.prevImageV2 = () => {
      const nextIdx = normalizeIndex(zoomIndex - 1);
      showZoom(nextIdx);
      moveToRealIndex(nextIdx, false);
    };

    window.nextImageV2 = () => {
      const nextIdx = normalizeIndex(zoomIndex + 1);
      showZoom(nextIdx);
      moveToRealIndex(nextIdx, false);
    };

    const onPointerUp = (e) => {
      if (overlay.style.display === "block") return;

      const img = e.target.closest(".wb-snap__slide img");
      if (!img) return;

      e.preventDefault();
      e.stopPropagation();

      const slideEl = img.closest("[data-wb-slide]");
      const idxInAll = allSlides.indexOf(slideEl);

      let realIdx;
      if (idxInAll === 0) {
        realIdx = realCount - 1;
      } else if (idxInAll === realCount + 1) {
        realIdx = 0;
      } else {
        realIdx = idxInAll - 1;
      }

      openZoom(realIdx);
    };

    track.addEventListener("pointerup", onPointerUp, { capture: true });
    cleanupFns.push(() =>
      track.removeEventListener("pointerup", onPointerUp, { capture: true })
    );

    const onBackdropClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeZoom();
    };
    backdrop.addEventListener("click", onBackdropClick);
    cleanupFns.push(() => backdrop.removeEventListener("click", onBackdropClick));

    if (closeButton) {
      const onClose = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        closeZoom();
      };
      closeButton.addEventListener("click", onClose);
      cleanupFns.push(() => closeButton.removeEventListener("click", onClose));
    }

    const onKeyDown = (e) => {
      if (e.key === "Escape") closeZoom();
      if (!overlay.classList.contains("active")) return;
      if (e.key === "ArrowLeft") window.prevImageV2();
      if (e.key === "ArrowRight") window.nextImageV2();
    };
    document.addEventListener("keydown", onKeyDown);
    cleanupFns.push(() => document.removeEventListener("keydown", onKeyDown));

    const onResize = () => {
      instantScrollTo(realToDom(currentRealIndex) * slideW());
      syncUI(currentRealIndex);
    };
    window.addEventListener("resize", onResize);
    cleanupFns.push(() => window.removeEventListener("resize", onResize));
  };

  mount(mq.matches);

  const onMqChange = (e) => mount(e.matches);
  if (mq.addEventListener) {
    mq.addEventListener("change", onMqChange);
  } else {
    mq.addListener(onMqChange);
  }
});

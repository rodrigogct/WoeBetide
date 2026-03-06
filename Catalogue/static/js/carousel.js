document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("item-layout-root-v2");
    const tpl = document.getElementById("tpl-unified-v2");
    if (!root || !tpl) return;
  
    // Mount ONCE
    root.innerHTML = "";
    root.appendChild(tpl.content.cloneNode(true));
  
    const host = root.querySelector("[data-wb-snap]");
    const track = root.querySelector("[data-wb-track]");
    if (!host || !track) return;
  
    // ---------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------
    const ensureSrc = (img) => {
      if (!img) return;
      if (img.getAttribute("src")) return;
      const ds = img.getAttribute("data-src");
      if (ds) img.setAttribute("src", ds);
    };
  
    const originalSlides = Array.from(track.querySelectorAll("[data-wb-slide]"));
    if (!originalSlides.length) return;
  
    ensureSrc(track.querySelector("img[data-src]"));
  
    // ---------------------------------------------------------
    // Dots
    // ---------------------------------------------------------
    const dotsWrap = root.querySelector("[data-wb-dots]");
    const dots = [];
  
    const setActiveDot = (idx) => {
      dots.forEach((d, i) => d.classList.toggle("is-active", i === idx));
    };
  
    // moveToRealIndex is defined later, but click handlers run after that
    if (dotsWrap) {
      dotsWrap.innerHTML = "";
      for (let i = 0; i < originalSlides.length; i++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "wb-dot" + (i === 0 ? " is-active" : "");
        b.addEventListener("click", (e) => {
          e.preventDefault();
          moveToRealIndex(i, true);
        });
        dotsWrap.appendChild(b);
        dots.push(b);
      }
    }
  
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
  
    const slideW = () => track.clientWidth;
    const realToDom = (realIdx) => realIdx + 1; // dom 0 = cloneLast
    const normalizeIndex = (idx) => ((idx % realCount) + realCount) % realCount;
  
    let currentRealIndex = 0;
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
      track.addEventListener("scrollend", () => {
        if (isAutoJumping) return;
        onScrollSettled();
      });
    } else {
      track.addEventListener("scroll", () => {
        if (isAutoJumping) return;
        watchScrollSettled();
      });
    }
  
    // ---------------------------------------------------------
    // Prev / Next buttons with REAL loop effect
    // ---------------------------------------------------------
    const prevBtn = root.querySelector("[data-wb-prev]");
    const nextBtn = root.querySelector("[data-wb-next]");
  
    if (nextBtn) {
      nextBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (isAnimatingByButton) return;
        isAnimatingByButton = true;
  
        // If on last real, animate to cloneFirst
        if (currentRealIndex === realCount - 1) {
          setActiveDot(0);
          loadNeighbors(0);
          moveToDomIndex(realCount + 1, true);
        } else {
          moveToRealIndex(currentRealIndex + 1, true);
        }
      });
    }
  
    if (prevBtn) {
      prevBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (isAnimatingByButton) return;
        isAnimatingByButton = true;
  
        // If on first real, animate to cloneLast
        if (currentRealIndex === 0) {
          setActiveDot(realCount - 1);
          loadNeighbors(realCount - 1);
          moveToDomIndex(0, true);
        } else {
          moveToRealIndex(currentRealIndex - 1, true);
        }
      });
    }
  
    // ---------------------------------------------------------
    // ZOOM OVERLAY V2
    // ---------------------------------------------------------
    const overlay = document.querySelector(".image-selector.image-selector-v2");
    if (!overlay) return;
  
    let backdrop = overlay.querySelector(".zoom-backdrop-v2");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "zoom-backdrop-v2";
      overlay.prepend(backdrop);
    }
  
    const overlayImg = overlay.querySelector(".photo-v2");
    const closeBtn =
      overlay.querySelector(".close-v2") || overlay.querySelector(".close");
  
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
  
      currentRealIndex = normalized;
      setActiveDot(currentRealIndex);
    };
  
    const openZoom = (realIdx) => {
      setOverlayOpen();
      showZoom(realIdx);
    };
  
    const closeZoom = () => {
      setOverlayClosed();
    };
  
    window.prevImageV2 = () => {
      const nextIdx = normalizeIndex(currentRealIndex - 1);
      showZoom(nextIdx);
      moveToRealIndex(nextIdx, false);
    };
  
    window.nextImageV2 = () => {
      const nextIdx = normalizeIndex(currentRealIndex + 1);
      showZoom(nextIdx);
      moveToRealIndex(nextIdx, false);
    };
  
    // Open zoom on image tap/click
    track.addEventListener(
      "pointerup",
      (e) => {
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
      },
      { capture: true }
    );
  
    // Close overlay
    backdrop.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeZoom();
    });
  
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeZoom();
      });
    }
  
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeZoom();
    });
  
    // Resize
    window.addEventListener("resize", () => {
      instantScrollTo(realToDom(currentRealIndex) * slideW());
      syncUI(currentRealIndex);
    });
  });
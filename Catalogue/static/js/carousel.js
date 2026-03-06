// carousel.js
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
  
    // ---- Lazy-load helper
    const ensureSrc = (img) => {
      if (!img) return;
      if (img.getAttribute("src")) return;
      const ds = img.getAttribute("data-src");
      if (ds) img.setAttribute("src", ds);
    };
  
    // Initial image load
    ensureSrc(track.querySelector("img[data-src]"));
  
    const originalSlides = Array.from(track.querySelectorAll("[data-wb-slide]"));
    if (originalSlides.length === 0) return;
  
    // ---- Dots
    const dotsWrap = root.querySelector("[data-wb-dots]");
    const dots = [];
  
    const setActiveDot = (idx) => {
      if (!dots.length) return;
      dots.forEach((d, i) => d.classList.toggle("is-active", i === idx));
    };
  
    if (dotsWrap) {
      dotsWrap.innerHTML = "";
      for (let i = 0; i < originalSlides.length; i++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "wb-dot" + (i === 0 ? " is-active" : "");
        b.addEventListener("click", (e) => {
          e.preventDefault();
          goToIndex(i, { smooth: true });
        });
        dotsWrap.appendChild(b);
        dots.push(b);
      }
    }
  
    // ---- Infinite loop via clones
    const cloneFirst = originalSlides[0].cloneNode(true);
    const cloneLast = originalSlides[originalSlides.length - 1].cloneNode(true);
  
    cloneFirst.setAttribute("data-wb-clone", "first");
    cloneLast.setAttribute("data-wb-clone", "last");
  
    track.insertBefore(cloneLast, originalSlides[0]);
    track.appendChild(cloneFirst);
  
    const allSlides = Array.from(track.querySelectorAll("[data-wb-slide]"));
    const realCount = originalSlides.length;
  
    const slideW = () => track.clientWidth;
  
    let currentRealIndex = 0;
    let scrollTimer = null;
    let isInstantJumping = false;
  
    const normalizeIndex = (idx) => ((idx % realCount) + realCount) % realCount;
  
    const getRealDomIndex = (realIdx) => realIdx + 1; // +1 because cloneLast is first
  
    const computeIndexFromScroll = () => {
      const w = slideW();
      if (!w) return { raw: 1, real: currentRealIndex, isClone: false };
  
      const x = track.scrollLeft;
      const raw = Math.round(x / w);
  
      if (raw <= 0) {
        return { raw: 0, real: realCount - 1, isClone: true };
      }
  
      if (raw >= realCount + 1) {
        return { raw: realCount + 1, real: 0, isClone: true };
      }
  
      return {
        raw,
        real: raw - 1,
        isClone: false,
      };
    };
  
    const loadNeighbors = (realIdx) => {
      const domIdx = getRealDomIndex(realIdx);
  
      const cur = allSlides[domIdx]?.querySelector("img[data-src]");
      const prev = allSlides[domIdx - 1]?.querySelector("img[data-src]");
      const next = allSlides[domIdx + 1]?.querySelector("img[data-src]");
  
      ensureSrc(cur);
      ensureSrc(prev);
      ensureSrc(next);
    };
  
    const syncToRealIndex = (realIdx, { smooth = false } = {}) => {
      const normalizedIndex = normalizeIndex(realIdx);
      const x = (normalizedIndex + 1) * slideW();
  
      currentRealIndex = normalizedIndex;
      setActiveDot(currentRealIndex);
      loadNeighbors(currentRealIndex);
  
      track.scrollTo({
        left: x,
        behavior: smooth ? "smooth" : "auto",
      });
    };
  
    const goToIndex = (realIndex, { smooth = true } = {}) => {
      const normalizedIndex = normalizeIndex(realIndex);
      currentRealIndex = normalizedIndex;
      setActiveDot(currentRealIndex);
      loadNeighbors(currentRealIndex);
  
      const x = (normalizedIndex + 1) * slideW();
      track.scrollTo({
        left: x,
        behavior: smooth ? "smooth" : "auto",
      });
    };
  
    // Initial alignment to first REAL slide
    syncToRealIndex(0, { smooth: false });
  
    // ---- Scroll handling
    track.addEventListener("scroll", () => {
      if (isInstantJumping) return;
  
      if (scrollTimer) window.clearTimeout(scrollTimer);
  
      scrollTimer = window.setTimeout(() => {
        const info = computeIndexFromScroll();
  
        currentRealIndex = info.real;
        setActiveDot(currentRealIndex);
        loadNeighbors(currentRealIndex);
  
        // If landed on clone, jump instantly to matching real slide
        if (info.raw === 0) {
          isInstantJumping = true;
          track.scrollTo({
            left: realCount * slideW(),
            behavior: "auto",
          });
          currentRealIndex = realCount - 1;
          setActiveDot(currentRealIndex);
          loadNeighbors(currentRealIndex);
  
          requestAnimationFrame(() => {
            isInstantJumping = false;
          });
        } else if (info.raw === realCount + 1) {
          isInstantJumping = true;
          track.scrollTo({
            left: slideW(),
            behavior: "auto",
          });
          currentRealIndex = 0;
          setActiveDot(currentRealIndex);
          loadNeighbors(currentRealIndex);
  
          requestAnimationFrame(() => {
            isInstantJumping = false;
          });
        }
      }, 80);
    });
  
    // ---- Arrow buttons
    const prevBtn = root.querySelector("[data-wb-prev]");
    const nextBtn = root.querySelector("[data-wb-next]");
  
    if (prevBtn) {
      prevBtn.addEventListener("click", (e) => {
        e.preventDefault();
        goToIndex(currentRealIndex - 1, { smooth: true });
      });
    }
  
    if (nextBtn) {
      nextBtn.addEventListener("click", (e) => {
        e.preventDefault();
        goToIndex(currentRealIndex + 1, { smooth: true });
      });
    }
  
    // =========================================================
    // ZOOM OVERLAY V2
    // =========================================================
    const overlay = document.querySelector(".image-selector.image-selector-v2");
    if (!overlay) return;
  
    let backdrop = overlay.querySelector(".zoom-backdrop-v2");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "zoom-backdrop-v2";
      overlay.prepend(backdrop);
    }
  
    const overlayImg = overlay.querySelector(".photo-v2");
    const closeBtn = overlay.querySelector(".close-v2") || overlay.querySelector(".close");
  
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
      const domIdx = getRealDomIndex(normalizeIndex(realIdx));
      return allSlides[domIdx]?.querySelector("img");
    };
  
    const showZoom = (realIdx) => {
      currentRealIndex = normalizeIndex(realIdx);
  
      const img = getRealImgAt(currentRealIndex);
      ensureSrc(img);
  
      const src = img?.getAttribute("src") || img?.getAttribute("data-src") || "";
      if (overlayImg) overlayImg.src = src;
  
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
      syncToRealIndex(nextIdx, { smooth: false });
    };
  
    window.nextImageV2 = () => {
      const nextIdx = normalizeIndex(currentRealIndex + 1);
      showZoom(nextIdx);
      syncToRealIndex(nextIdx, { smooth: false });
    };
  
    // Open zoom when clicking image
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
  
    // Keep alignment on resize
    window.addEventListener("resize", () => {
      syncToRealIndex(currentRealIndex, { smooth: false });
    });
  });
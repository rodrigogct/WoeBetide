// item-carousel-v2.js
document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("item-layout-root-v2");
    const tpl = document.getElementById("tpl-unified-v2");
    if (!root || !tpl) return;
  
    // Mount ONCE (no desktop/mobile swap, no duplicate DOM)
    root.innerHTML = "";
    root.appendChild(tpl.content.cloneNode(true));
  
    const host = root.querySelector("[data-wb-snap]");
    const track = root.querySelector("[data-wb-track]");
    if (!host || !track) return;
  
    // ---- Lazy-load helper (uses your existing data-src approach)
    const ensureSrc = (img) => {
      if (!img) return;
      if (img.getAttribute("src")) return;
      const ds = img.getAttribute("data-src");
      if (ds) img.setAttribute("src", ds);
    };
  
    // Initial load first image (fastest)
    ensureSrc(track.querySelector("img[data-src]"));
  
    const slides = Array.from(track.querySelectorAll("[data-wb-slide]"));
    if (slides.length === 0) return;
  
    // ---- Dots
    const dotsWrap = root.querySelector("[data-wb-dots]");
    const dots = [];
    if (dotsWrap) {
      dotsWrap.innerHTML = "";
      for (let i = 0; i < slides.length; i++) {
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
  
    // ---- Infinite loop via clones (first and last)
    // We clone nodes so we can scroll "past ends" then jump seamlessly.
    const cloneFirst = slides[0].cloneNode(true);
    const cloneLast = slides[slides.length - 1].cloneNode(true);
    cloneFirst.setAttribute("data-wb-clone", "first");
    cloneLast.setAttribute("data-wb-clone", "last");
  
    track.insertBefore(cloneLast, slides[0]);
    track.appendChild(cloneFirst);
  
    // Recompute after clones
    const allSlides = Array.from(track.querySelectorAll("[data-wb-slide]"));
    const realCount = slides.length;
  
    // Each slide is 100% width; we can scroll by clientWidth.
    const slideW = () => track.clientWidth;
  
    // Start at first REAL slide (index 1 because 0 is cloneLast)
    let currentRealIndex = 0;
    let isJumping = false;
  
    const setActiveDot = (idx) => {
      if (!dots.length) return;
      dots.forEach((d, i) => d.classList.toggle("is-active", i === idx));
    };
  
    const goToIndex = (realIndex, { smooth } = { smooth: true }) => {
      const x = (realIndex + 1) * slideW(); // +1 offset because of cloneLast at start
      isJumping = true;
      track.scrollTo({ left: x, behavior: smooth ? "smooth" : "auto" });
      // allow scroll event to settle
      window.setTimeout(() => (isJumping = false), smooth ? 250 : 0);
    };
  
    // Jump to first real on load (no animation)
    track.scrollTo({ left: slideW(), behavior: "auto" });
  
    // ---- Determine active index from scroll position
    const computeIndexFromScroll = () => {
      const x = track.scrollLeft;
      const w = slideW();
      const raw = Math.round(x / w); // 0..realCount+1 including clones
      // raw=0 -> cloneLast, raw=realCount+1 -> cloneFirst
      if (raw <= 0) return { raw, real: realCount - 1, isClone: true };
      if (raw >= realCount + 1) return { raw, real: 0, isClone: true };
      return { raw, real: raw - 1, isClone: false };
    };
  
    // Lazy-load current + neighbors
    const loadNeighbors = (realIdx) => {
      // real slide in DOM is at position realIdx+1
      const domIdx = realIdx + 1;
      const cur = allSlides[domIdx]?.querySelector("img[data-src]");
      const prev = allSlides[domIdx - 1]?.querySelector("img[data-src]");
      const next = allSlides[domIdx + 1]?.querySelector("img[data-src]");
      ensureSrc(cur);
      ensureSrc(prev);
      ensureSrc(next);
    };
  
    // On scroll end-ish: update dots, lazy load, loop jump if on clone
    let scrollTimer = null;
    track.addEventListener("scroll", () => {
      if (isJumping) return;
      if (scrollTimer) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        const info = computeIndexFromScroll();
  
        currentRealIndex = info.real;
        setActiveDot(currentRealIndex);
        loadNeighbors(currentRealIndex);
  
        // If user landed on a clone, jump instantly to corresponding real slide
        if (info.raw === 0) {
          // cloneLast -> jump to last real
          track.scrollTo({ left: realCount * slideW(), behavior: "auto" });
        } else if (info.raw === realCount + 1) {
          // cloneFirst -> jump to first real
          track.scrollTo({ left: slideW(), behavior: "auto" });
        }
      }, 80);
    });
  
    // ---- Arrow buttons (optional)
    const prevBtn = root.querySelector("[data-wb-prev]");
    const nextBtn = root.querySelector("[data-wb-next]");
    if (prevBtn) prevBtn.addEventListener("click", () => goToIndex(currentRealIndex - 1));
    if (nextBtn) nextBtn.addEventListener("click", () => goToIndex(currentRealIndex + 1));
  

    // V2 ZOOM OVERLAY (separate)
    const overlay = document.querySelector(".image-selector.image-selector-v2");
    if (!overlay) return;
  
    // Backdrop that always catches clicks
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
      // real slide DOM index is realIdx+1
      return allSlides[realIdx + 1]?.querySelector("img");
    };
  
    const showZoom = (realIdx) => {
      currentRealIndex = (realIdx + realCount) % realCount;
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
  
    const closeZoom = () => setOverlayClosed();
  
    window.prevImageV2 = () => {
      const nextIdx = (currentRealIndex - 1 + realCount) % realCount;
      showZoom(nextIdx);
      goToIndex(nextIdx, { smooth: false });
    };
  
    window.nextImageV2 = () => {
      const nextIdx = (currentRealIndex + 1) % realCount;
      showZoom(nextIdx);
      goToIndex(nextIdx, { smooth: false });
    };
  
    // Open zoom when tapping image
    track.addEventListener(
      "pointerup",
      (e) => {
        if (overlay.style.display === "block") return;
        const img = e.target.closest(".wb-snap__slide img");
        if (!img) return;
  
        e.preventDefault();
        e.stopPropagation();
  
        // Figure which REAL slide was clicked
        const slideEl = img.closest("[data-wb-slide]");
        const idxInAll = allSlides.indexOf(slideEl); // includes clones
        // Convert DOM index -> real index:
        // idxInAll 0 = cloneLast => last real
        // idxInAll realCount+1 = cloneFirst => first real
        let realIdx;
        if (idxInAll === 0) realIdx = realCount - 1;
        else if (idxInAll === realCount + 1) realIdx = 0;
        else realIdx = idxInAll - 1;
  
        openZoom(realIdx);
      },
      { capture: true }
    );
  
    // Close mechanisms
    backdrop.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeZoom();
    });
  
    if (closeBtn) closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      closeZoom();
    });
  
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeZoom();
    });
  
    // Re-align on resize (important because width = 100% snap)
    window.addEventListener("resize", () => {
      track.scrollTo({ left: (currentRealIndex + 1) * slideW(), behavior: "auto" });
    });
  });
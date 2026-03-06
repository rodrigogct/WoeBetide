document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("item-layout-root-v2");
    const tpl = document.getElementById("tpl-unified-v2");
    if (!root || !tpl) return;
  
    root.innerHTML = "";
    root.appendChild(tpl.content.cloneNode(true));
  
    const host = root.querySelector("[data-wb-snap]");
    const track = root.querySelector("[data-wb-track]");
    if (!host || !track) return;
  
    const ensureSrc = (img) => {
      if (!img) return;
      if (img.getAttribute("src")) return;
      const ds = img.getAttribute("data-src");
      if (ds) img.setAttribute("src", ds);
    };
  
    const originalSlides = Array.from(track.querySelectorAll("[data-wb-slide]"));
    if (!originalSlides.length) return;
  
    ensureSrc(track.querySelector("img[data-src]"));
  
    const dotsWrap = root.querySelector("[data-wb-dots]");
    const dots = [];
  
    const setActiveDot = (idx) => {
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
          moveToRealIndex(i, true);
        });
        dotsWrap.appendChild(b);
        dots.push(b);
      }
    }
  
    const cloneFirst = originalSlides[0].cloneNode(true);
    const cloneLast = originalSlides[originalSlides.length - 1].cloneNode(true);
  
    cloneFirst.setAttribute("data-wb-clone", "first");
    cloneLast.setAttribute("data-wb-clone", "last");
  
    track.insertBefore(cloneLast, originalSlides[0]);
    track.appendChild(cloneFirst);
  
    const allSlides = Array.from(track.querySelectorAll("[data-wb-slide]"));
    const realCount = originalSlides.length;
  
    const slideW = () => track.clientWidth;
    const realToDom = (realIdx) => realIdx + 1;
    const normalizeIndex = (idx) => ((idx % realCount) + realCount) % realCount;
  
    let currentRealIndex = 0;
    let isAutoJumping = false;
    let isAnimatingByButton = false;
    let settleRaf = null;
    let lastScrollLeft = track.scrollLeft;
    let stableFrames = 0;
  
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
  
    const moveToDomIndex = (domIdx, smooth = true) => {
      const left = domIdx * slideW();
      track.scrollTo({
        left,
        behavior: smooth ? "smooth" : "auto",
      });
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
  
      if (domIdx === 0) {
        instantScrollTo(realCount * slideW());
        syncUI(realCount - 1);
        return;
      }
  
      if (domIdx === realCount + 1) {
        instantScrollTo(slideW());
        syncUI(0);
        return;
      }
  
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
  
    instantScrollTo(slideW());
    syncUI(0);
  
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
  
    const prevBtn = root.querySelector("[data-wb-prev]");
    const nextBtn = root.querySelector("[data-wb-next]");
  
    if (nextBtn) {
      nextBtn.addEventListener("click", (e) => {
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
      });
    }
  
    if (prevBtn) {
      prevBtn.addEventListener("click", (e) => {
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
      });
    }
  
    window.addEventListener("resize", () => {
      instantScrollTo(realToDom(currentRealIndex) * slideW());
      syncUI(currentRealIndex);
    });
  });
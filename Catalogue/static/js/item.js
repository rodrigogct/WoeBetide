// item-zoom.js
// desktop: tpl-desktop
// mobile: tpl-unified-v2
// overlay zoom: click to zoom at point, click again to unzoom
// zoomed image supports trackpad scroll + click-drag pan

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

  const zoomTrack = overlay.querySelector("[data-zoom-track]");
  if (!zoomTrack) {
    console.warn("[item-zoom] missing [data-zoom-track]");
    return;
  }

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

  const mq = window.matchMedia("(max-width: 700px)");
  const DESKTOP_ZOOM_SCALE = 2.25;

  let cleanupFns = [];
  let zoomIndex = 0;
  let zoomSourceImgs = [];
  let zoomScrollRaf = null;
  let zoomLastScrollLeft = 0;
  let zoomStableFrames = 0;

  let dragState = {
    active: false,
    pointerId: null,
    slide: null,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
    moved: false,
  };

  let swipeCloseState = {
    active: false,
    startX: 0,
    startY: 0,
    deltaX: 0,
    deltaY: 0,
    lockedDirection: null, // "x" | "y" | null
  };

  const SWIPE_CLOSE_THRESHOLD = 140;
  const SWIPE_CLOSE_DIRECTION_LOCK = 12;
  const SWIPE_CLOSE_MAX_HORIZONTAL = 90;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const ensureSrc = (img) => {
    if (!img) return;
    if (img.getAttribute("src")) return;
    const ds = img.getAttribute("data-src");
    if (ds) img.setAttribute("src", ds);
  };

  const normalizeZoomIndex = (idx) => {
    const total = zoomSourceImgs.length || 1;
    return ((idx % total) + total) % total;
  };

  const getZoomSlides = () =>
    Array.from(zoomTrack.querySelectorAll("[data-zoom-slide]"));

  const getZoomedSlide = () =>
    zoomTrack.querySelector('.zoom-slide[data-zoomed="true"]');

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

  const resetOverlayDragVisual = (animate = true) => {
    overlay.style.transition = animate
      ? "opacity 0.25s ease, transform 0.25s ease"
      : "";
    overlay.style.transform = "translateY(0)";
    overlay.style.opacity = "1";
  };

  const setOverlayClosed = () => {
    overlay.style.display = "none";
    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
    overlay.style.transform = "translateY(0)";
    overlay.classList.remove("active");
    document.body.classList.remove("lock-scroll");
    zoomTrack.innerHTML = "";
  };

  const setOverlayOpen = () => {
    overlay.style.display = "block";
    overlay.style.opacity = "1";
    overlay.style.pointerEvents = "auto";
    overlay.style.transform = "translateY(0)";
    overlay.classList.add("active");
    document.body.classList.add("lock-scroll");
  };

  const buildZoomCarousel = (sourceImgs) => {
    zoomTrack.innerHTML = "";
    zoomSourceImgs = sourceImgs.slice();

    zoomSourceImgs.forEach((img, index) => {
      ensureSrc(img);

      const slide = document.createElement("div");
      slide.className = "zoom-slide";
      slide.setAttribute("data-zoom-slide", "");
      slide.setAttribute("data-zoomed", "false");

      const inner = document.createElement("div");
      inner.className = "zoom-slide-inner";

      const zoomImg = document.createElement("img");
      zoomImg.src = img.getAttribute("src") || img.getAttribute("data-src") || "";
      zoomImg.alt = img.getAttribute("alt") || `Image ${index + 1}`;
      zoomImg.draggable = false;

      inner.appendChild(zoomImg);
      slide.appendChild(inner);
      zoomTrack.appendChild(slide);
    });
  };

  const clearSlideZoom = (slide, resetScroll = true) => {
    if (!slide) return;

    const inner = slide.querySelector(".zoom-slide-inner");
    const img = slide.querySelector("img");

    slide.classList.remove("is-zoomed", "is-dragging");
    slide.setAttribute("data-zoomed", "false");

    if (inner) {
      inner.style.width = "";
      inner.style.height = "";
    }

    if (img) {
      img.style.width = "";
      img.style.height = "";
      img.style.maxWidth = "";
      img.style.maxHeight = "";
    }

    if (resetScroll) {
      slide.scrollLeft = 0;
      slide.scrollTop = 0;
    }
  };

  const resetZoomState = () => {
    getZoomSlides().forEach((slide) => clearSlideZoom(slide, true));
    zoomTrack.classList.remove("is-locked");
    dragState.active = false;
    dragState.pointerId = null;
    dragState.slide = null;
    dragState.moved = false;
  };

  const zoomSlideAtPoint = (slide, clientX, clientY) => {
    if (!slide) return;

    const inner = slide.querySelector(".zoom-slide-inner");
    const img = slide.querySelector("img");
    if (!inner || !img) return;

    const imgRect = img.getBoundingClientRect();
    const slideRect = slide.getBoundingClientRect();

    if (!imgRect.width || !imgRect.height) return;

    const relX = clamp((clientX - imgRect.left) / imgRect.width, 0, 1);
    const relY = clamp((clientY - imgRect.top) / imgRect.height, 0, 1);

    const viewportOffsetX = clientX - slideRect.left;
    const viewportOffsetY = clientY - slideRect.top;

    const zoomW = Math.round(imgRect.width * DESKTOP_ZOOM_SCALE);
    const zoomH = Math.round(imgRect.height * DESKTOP_ZOOM_SCALE);

    resetZoomState();

    slide.classList.add("is-zoomed");
    slide.setAttribute("data-zoomed", "true");

    inner.style.width = `${zoomW}px`;
    inner.style.height = `${zoomH}px`;

    img.style.width = `${zoomW}px`;
    img.style.height = `${zoomH}px`;
    img.style.maxWidth = "none";
    img.style.maxHeight = "none";

    zoomTrack.classList.add("is-locked");

    requestAnimationFrame(() => {
      const maxLeft = Math.max(0, slide.scrollWidth - slide.clientWidth);
      const maxTop = Math.max(0, slide.scrollHeight - slide.clientHeight);

      const targetLeft = relX * zoomW - viewportOffsetX;
      const targetTop = relY * zoomH - viewportOffsetY;

      slide.scrollLeft = clamp(targetLeft, 0, maxLeft);
      slide.scrollTop = clamp(targetTop, 0, maxTop);
    });
  };

  const toggleSlideZoomAtPoint = (slide, clientX, clientY) => {
    if (!slide) return;

    const isZoomed = slide.getAttribute("data-zoomed") === "true";

    if (isZoomed) {
      clearSlideZoom(slide, true);
      zoomTrack.classList.remove("is-locked");
      return;
    }

    zoomSlideAtPoint(slide, clientX, clientY);
  };

  const scrollZoomTo = (index, smooth = true) => {
    const slides = zoomTrack.querySelectorAll("[data-zoom-slide]");
    if (!slides.length) return;

    resetZoomState();
    zoomIndex = normalizeZoomIndex(index);

    zoomTrack.scrollTo({
      left: zoomIndex * zoomTrack.clientWidth,
      behavior: smooth ? "smooth" : "auto",
    });
  };

  const syncZoomIndexFromScroll = () => {
    const width = zoomTrack.clientWidth || 1;
    zoomIndex = Math.round(zoomTrack.scrollLeft / width);
    zoomIndex = Math.max(0, Math.min(zoomIndex, zoomSourceImgs.length - 1));
  };

  const watchZoomScrollSettled = () => {
    cancelAnimationFrame(zoomScrollRaf);

    const check = () => {
      const now = zoomTrack.scrollLeft;

      if (Math.abs(now - zoomLastScrollLeft) < 0.5) {
        zoomStableFrames += 1;
      } else {
        zoomStableFrames = 0;
        zoomLastScrollLeft = now;
      }

      if (zoomStableFrames >= 3) {
        syncZoomIndexFromScroll();
        zoomStableFrames = 0;
        return;
      }

      zoomScrollRaf = requestAnimationFrame(check);
    };

    zoomLastScrollLeft = zoomTrack.scrollLeft;
    zoomStableFrames = 0;
    zoomScrollRaf = requestAnimationFrame(check);
  };

  const attachOverlayListeners = () => {
    const onZoomTrackScroll = () => {
      if (!overlay.classList.contains("active")) return;
      if (zoomTrack.classList.contains("is-locked")) return;
      watchZoomScrollSettled();
    };

    const onWheel = (e) => {
      const zoomedSlide = getZoomedSlide();
      if (!zoomedSlide) return;

      e.preventDefault();

      zoomedSlide.scrollLeft += e.deltaX;
      zoomedSlide.scrollTop += e.deltaY;

      if (e.shiftKey && e.deltaY !== 0 && e.deltaX === 0) {
        zoomedSlide.scrollLeft += e.deltaY;
      }
    };

    const onClick = (e) => {
      if (window.innerWidth <= 700) return;
      if (dragState.moved) return;

      const slide = e.target.closest(".zoom-slide");
      if (!slide) return;

      const isZoomed = slide.getAttribute("data-zoomed") === "true";

      e.preventDefault();
      e.stopPropagation();

      if (isZoomed) {
        clearSlideZoom(slide, true);
        zoomTrack.classList.remove("is-locked");
        return;
      }

      const img = e.target.closest(".zoom-slide img");
      if (!img) return;

      toggleSlideZoomAtPoint(slide, e.clientX, e.clientY);
    };

    const onPointerDown = (e) => {
      if (window.innerWidth <= 700) return;

      const slide = e.target.closest(".zoom-slide");
      if (!slide) return;
      if (slide.getAttribute("data-zoomed") !== "true") return;

      dragState.active = true;
      dragState.pointerId = e.pointerId;
      dragState.slide = slide;
      dragState.startX = e.clientX;
      dragState.startY = e.clientY;
      dragState.startScrollLeft = slide.scrollLeft;
      dragState.startScrollTop = slide.scrollTop;
      dragState.moved = false;

      slide.classList.add("is-dragging");

      if (slide.setPointerCapture) {
        try {
          slide.setPointerCapture(e.pointerId);
        } catch (_) {}
      }

      e.preventDefault();
    };

    const onPointerMove = (e) => {
      if (!dragState.active) return;
      if (dragState.pointerId !== e.pointerId) return;
      if (!dragState.slide) return;

      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        dragState.moved = true;
      }

      dragState.slide.scrollLeft = dragState.startScrollLeft - dx;
      dragState.slide.scrollTop = dragState.startScrollTop - dy;

      e.preventDefault();
    };

    const endPointerDrag = (e) => {
      if (!dragState.active) return;
      if (dragState.pointerId !== e.pointerId) return;

      if (dragState.slide) {
        dragState.slide.classList.remove("is-dragging");
        if (dragState.slide.releasePointerCapture) {
          try {
            dragState.slide.releasePointerCapture(e.pointerId);
          } catch (_) {}
        }
      }

      dragState.active = false;
      dragState.pointerId = null;
      dragState.slide = null;

      setTimeout(() => {
        dragState.moved = false;
      }, 0);
    };

    const onTouchStart = (e) => {
      if (!overlay.classList.contains("active")) return;
      if (window.innerWidth > 700) return;
      if (!e.touches || e.touches.length !== 1) return;
      if (getZoomedSlide()) return;

      const targetSlide = e.target.closest(".zoom-slide");
      if (!targetSlide) return;

      swipeCloseState.active = true;
      swipeCloseState.startX = e.touches[0].clientX;
      swipeCloseState.startY = e.touches[0].clientY;
      swipeCloseState.deltaX = 0;
      swipeCloseState.deltaY = 0;
      swipeCloseState.lockedDirection = null;

      overlay.style.transition = "none";
    };

    const onTouchMove = (e) => {
      if (!swipeCloseState.active) return;
      if (window.innerWidth > 700) return;
      if (!e.touches || e.touches.length !== 1) return;
      if (getZoomedSlide()) return;

      const touch = e.touches[0];
      swipeCloseState.deltaX = touch.clientX - swipeCloseState.startX;
      swipeCloseState.deltaY = touch.clientY - swipeCloseState.startY;

      if (!swipeCloseState.lockedDirection) {
        const absX = Math.abs(swipeCloseState.deltaX);
        const absY = Math.abs(swipeCloseState.deltaY);

        if (
          absX < SWIPE_CLOSE_DIRECTION_LOCK &&
          absY < SWIPE_CLOSE_DIRECTION_LOCK
        ) {
          return;
        }

        swipeCloseState.lockedDirection = absY > absX ? "y" : "x";
      }

      if (swipeCloseState.lockedDirection !== "y") return;
      if (swipeCloseState.deltaY <= 0) return;
      if (Math.abs(swipeCloseState.deltaX) > SWIPE_CLOSE_MAX_HORIZONTAL) return;

      const dragY = swipeCloseState.deltaY * 0.55;
      const fade = Math.max(0.55, 1 - swipeCloseState.deltaY / 420);

      overlay.style.transform = `translateY(${dragY}px)`;
      overlay.style.opacity = String(fade);
    };

    const onTouchEnd = () => {
      if (!swipeCloseState.active) return;

      const shouldClose =
        swipeCloseState.lockedDirection === "y" &&
        swipeCloseState.deltaY > SWIPE_CLOSE_THRESHOLD &&
        Math.abs(swipeCloseState.deltaX) < SWIPE_CLOSE_MAX_HORIZONTAL &&
        !getZoomedSlide();

      swipeCloseState.active = false;

      if (shouldClose) {
        closeZoomCarousel();
        return;
      }

      resetOverlayDragVisual(true);
    };

    const onTouchCancel = () => {
      if (!swipeCloseState.active) return;
      swipeCloseState.active = false;
      resetOverlayDragVisual(true);
    };

    const onBackdropClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeZoomCarousel();
    };

    const onClose = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeZoomCarousel();
    };

    const onKeyDown = (e) => {
      if (!overlay.classList.contains("active")) return;

      if (e.key === "Escape") closeZoomCarousel();
      if (e.key === "ArrowLeft") window.prevImageV2();
      if (e.key === "ArrowRight") window.nextImageV2();
    };

    const onResize = () => {
      if (!overlay.classList.contains("active")) return;
      scrollZoomTo(zoomIndex, false);
      resetOverlayDragVisual(false);
    };

    zoomTrack.addEventListener("scroll", onZoomTrackScroll);
    zoomTrack.addEventListener("wheel", onWheel, { passive: false });
    zoomTrack.addEventListener("click", onClick);
    zoomTrack.addEventListener("pointerdown", onPointerDown);
    zoomTrack.addEventListener("pointermove", onPointerMove);
    zoomTrack.addEventListener("pointerup", endPointerDrag);
    zoomTrack.addEventListener("pointercancel", endPointerDrag);

    overlay.addEventListener("touchstart", onTouchStart, { passive: true });
    overlay.addEventListener("touchmove", onTouchMove, { passive: true });
    overlay.addEventListener("touchend", onTouchEnd);
    overlay.addEventListener("touchcancel", onTouchCancel);

    backdrop.addEventListener("click", onBackdropClick);
    if (closeButton) closeButton.addEventListener("click", onClose);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);

    cleanupFns.push(() => zoomTrack.removeEventListener("scroll", onZoomTrackScroll));
    cleanupFns.push(() => zoomTrack.removeEventListener("wheel", onWheel));
    cleanupFns.push(() => zoomTrack.removeEventListener("click", onClick));
    cleanupFns.push(() => zoomTrack.removeEventListener("pointerdown", onPointerDown));
    cleanupFns.push(() => zoomTrack.removeEventListener("pointermove", onPointerMove));
    cleanupFns.push(() => zoomTrack.removeEventListener("pointerup", endPointerDrag));
    cleanupFns.push(() => zoomTrack.removeEventListener("pointercancel", endPointerDrag));

    cleanupFns.push(() => overlay.removeEventListener("touchstart", onTouchStart));
    cleanupFns.push(() => overlay.removeEventListener("touchmove", onTouchMove));
    cleanupFns.push(() => overlay.removeEventListener("touchend", onTouchEnd));
    cleanupFns.push(() => overlay.removeEventListener("touchcancel", onTouchCancel));

    cleanupFns.push(() => backdrop.removeEventListener("click", onBackdropClick));
    if (closeButton) cleanupFns.push(() => closeButton.removeEventListener("click", onClose));
    cleanupFns.push(() => document.removeEventListener("keydown", onKeyDown));
    cleanupFns.push(() => window.removeEventListener("resize", onResize));
  };

  const openZoomCarousel = (sourceImgs, index) => {
    buildZoomCarousel(sourceImgs);
    setOverlayOpen();
    hideChrome();
    resetOverlayDragVisual(false);
    scrollZoomTo(index, false);
  };

  const closeZoomCarousel = () => {
    cancelAnimationFrame(zoomScrollRaf);
    zoomScrollRaf = null;
    zoomStableFrames = 0;

    swipeCloseState.active = false;
    swipeCloseState.deltaX = 0;
    swipeCloseState.deltaY = 0;
    swipeCloseState.lockedDirection = null;

    resetZoomState();
    resetOverlayDragVisual(false);
    setOverlayClosed();
    showChrome();
  };

  window.prevImageV2 = () => {
    if (!overlay.classList.contains("active")) return;
    scrollZoomTo(zoomIndex - 1, true);
  };

  window.nextImageV2 = () => {
    if (!overlay.classList.contains("active")) return;
    scrollZoomTo(zoomIndex + 1, true);
  };

  const mountDesktop = (activeRoot) => {
    const imgsWithDataSrc = Array.from(
      activeRoot.querySelectorAll(".main-images img[data-src]")
    );
    imgsWithDataSrc.forEach(ensureSrc);

    const clickableImgs = Array.from(activeRoot.querySelectorAll(".main-images img"));

    const onPointerUp = (e) => {
      if (overlay.classList.contains("active")) return;

      const img = e.target.closest(".main-images img");
      if (!img) return;

      const index = clickableImgs.indexOf(img);
      if (index === -1) return;

      e.preventDefault();
      e.stopPropagation();

      openZoomCarousel(clickableImgs, index);
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

    const dots = [];

    const setActiveDot = (idx) => {
      dots.forEach((d, i) => d.classList.toggle("is-active", i === idx));
    };

    const cloneFirst = originalSlides[0].cloneNode(true);
    const cloneLast = originalSlides[originalSlides.length - 1].cloneNode(true);

    cloneFirst.setAttribute("data-wb-clone", "first");
    cloneLast.setAttribute("data-wb-clone", "last");

    track.insertBefore(cloneLast, originalSlides[0]);
    track.appendChild(cloneFirst);

    const allSlides = Array.from(track.querySelectorAll("[data-wb-slide]"));
    const realCount = originalSlides.length;
    const realImgs = originalSlides.map((slide) => slide.querySelector("img"));

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

    const slideW = () => track.clientWidth;
    const realToDom = (realIdx) => realIdx + 1;
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

    const onPointerUp = (e) => {
      if (overlay.classList.contains("active")) return;

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

      openZoomCarousel(realImgs, realIdx);
    };

    track.addEventListener("pointerup", onPointerUp, { capture: true });
    cleanupFns.push(() =>
      track.removeEventListener("pointerup", onPointerUp, { capture: true })
    );

    const onResize = () => {
      instantScrollTo(realToDom(currentRealIndex) * slideW());
      syncUI(currentRealIndex);
    };
    window.addEventListener("resize", onResize);
    cleanupFns.push(() => window.removeEventListener("resize", onResize));
  };

  const mount = (isMobile) => {
    cleanupFns.forEach((fn) => fn());
    cleanupFns = [];

    closeZoomCarousel();

    root.innerHTML = "";
    root.appendChild((isMobile ? tplMobile : tplDesktop).content.cloneNode(true));

    const activeRoot = isMobile
      ? root.querySelector(".item-carousel-v2")
      : root.querySelector(".item");

    if (!activeRoot) {
      console.warn("[item-zoom] active root not found", { isMobile });
      return;
    }

    attachOverlayListeners();

    if (isMobile) {
      mountMobile(activeRoot);
    } else {
      mountDesktop(activeRoot);
    }
  };

  setOverlayClosed();
  mount(mq.matches);

  const onMqChange = (e) => mount(e.matches);
  if (mq.addEventListener) {
    mq.addEventListener("change", onMqChange);
  } else {
    mq.addListener(onMqChange);
  }
});
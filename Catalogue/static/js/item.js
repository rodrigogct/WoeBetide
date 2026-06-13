// item-zoom.js
// Desktop:
// - click image to open selector
// - opens directly on the selected image
// - click to zoom / click again to unzoom
// - drag or trackpad while zoomed to pan
// - horizontal trackpad swipe changes image
// - vertical trackpad swipe closes selector
//
// Mobile:
// - keeps the existing snap carousel and touch behavior

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

  const catalogue = Array.from(
    document.querySelectorAll(".catalogue")
  );

  const navbar = Array.from(
    document.querySelectorAll(".navbar")
  );

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

  let zoomAnimationRaf = null;
  let isDesktopSlideAnimating = false;
  let desktopSlideAnimationEndTimer = null;

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
    lockedDirection: null,
  };

  const SWIPE_CLOSE_THRESHOLD = 140;
  const SWIPE_CLOSE_DIRECTION_LOCK = 12;
  const SWIPE_CLOSE_MAX_HORIZONTAL = 90;

  const clamp = (value, min, max) =>
    Math.min(Math.max(value, min), max);

  const ensureSrc = (img) => {
    if (!img) return;
    if (img.getAttribute("src")) return;

    const dataSrc = img.getAttribute("data-src");

    if (dataSrc) {
      img.setAttribute("src", dataSrc);
    }
  };

  const normalizeZoomIndex = (index) => {
    const total = zoomSourceImgs.length || 1;
    return ((index % total) + total) % total;
  };

  const getZoomSlides = () =>
    Array.from(
      zoomTrack.querySelectorAll("[data-zoom-slide]")
    );

  const getZoomedSlide = () =>
    zoomTrack.querySelector(
      '.zoom-slide[data-zoomed="true"]'
    );

  const hideChrome = () => {
    catalogue.forEach((element) => {
      element.dataset.prevDisplay =
        element.style.display;

      element.style.display = "none";
    });

    navbar.forEach((element) => {
      element.dataset.prevDisplay =
        element.style.display;

      element.style.display = "none";
    });
  };

  const showChrome = () => {
    catalogue.forEach((element) => {
      element.style.display =
        element.dataset.prevDisplay || "";
    });

    navbar.forEach((element) => {
      element.style.display =
        element.dataset.prevDisplay || "";
    });
  };

  const resetOverlayDragVisual = (
    animate = true
  ) => {
    overlay.style.transition = animate
      ? "opacity 0.25s ease, transform 0.25s ease"
      : "none";

    overlay.style.transform = "translateY(0)";
    overlay.style.opacity = "1";
  };

  const setOverlayClosed = () => {
    overlay.style.display = "none";
    overlay.style.visibility = "hidden";
    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
    overlay.style.transform = "translateY(0)";
    overlay.style.transition = "none";

    overlay.classList.remove("active");

    document.body.classList.remove(
      "lock-scroll"
    );

    zoomTrack.innerHTML = "";
  };

  const buildZoomCarousel = (
    sourceImgs
  ) => {
    zoomTrack.innerHTML = "";
    zoomSourceImgs = sourceImgs.slice();

    zoomSourceImgs.forEach(
      (img, index) => {
        ensureSrc(img);

        const slide =
          document.createElement("div");

        slide.className = "zoom-slide";

        slide.setAttribute(
          "data-zoom-slide",
          ""
        );

        slide.setAttribute(
          "data-zoomed",
          "false"
        );

        const inner =
          document.createElement("div");

        inner.className =
          "zoom-slide-inner";

        const zoomImg =
          document.createElement("img");

        zoomImg.src =
          img.getAttribute("src") ||
          img.getAttribute("data-src") ||
          "";

        zoomImg.alt =
          img.getAttribute("alt") ||
          `Image ${index + 1}`;

        zoomImg.draggable = false;

        inner.appendChild(zoomImg);
        slide.appendChild(inner);
        zoomTrack.appendChild(slide);
      }
    );
  };

  const clearSlideZoom = (
    slide,
    resetScroll = true
  ) => {
    if (!slide) return;

    const inner = slide.querySelector(
      ".zoom-slide-inner"
    );

    const img =
      slide.querySelector("img");

    slide.classList.remove(
      "is-zoomed",
      "is-dragging"
    );

    slide.setAttribute(
      "data-zoomed",
      "false"
    );

    if (inner) {
      inner.style.width = "";
      inner.style.height = "";
      inner.style.minWidth = "";
      inner.style.minHeight = "";
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
    getZoomSlides().forEach((slide) => {
      clearSlideZoom(slide, true);
    });

    zoomTrack.classList.remove(
      "is-locked"
    );

    dragState.active = false;
    dragState.pointerId = null;
    dragState.slide = null;
    dragState.moved = false;
  };

  const zoomSlideAtPoint = (
    slide,
    clientX,
    clientY
  ) => {
    if (!slide) return;

    const inner = slide.querySelector(
      ".zoom-slide-inner"
    );

    const img =
      slide.querySelector("img");

    if (!inner || !img) return;

    const imgRect =
      img.getBoundingClientRect();

    const slideRect =
      slide.getBoundingClientRect();

    if (
      !imgRect.width ||
      !imgRect.height
    ) {
      return;
    }

    const relativeX = clamp(
      (clientX - imgRect.left) /
        imgRect.width,
      0,
      1
    );

    const relativeY = clamp(
      (clientY - imgRect.top) /
        imgRect.height,
      0,
      1
    );

    const viewportOffsetX =
      clientX - slideRect.left;

    const viewportOffsetY =
      clientY - slideRect.top;

    const minScaleForHorizontalPan =
      (slideRect.width + 120) /
      imgRect.width;

    const minScaleForVerticalPan =
      (slideRect.height + 120) /
      imgRect.height;

    const scale = Math.max(
      DESKTOP_ZOOM_SCALE,
      minScaleForHorizontalPan,
      minScaleForVerticalPan
    );

    const zoomWidth = Math.round(
      imgRect.width * scale
    );

    const zoomHeight = Math.round(
      imgRect.height * scale
    );

    resetZoomState();

    slide.classList.add("is-zoomed");

    slide.setAttribute(
      "data-zoomed",
      "true"
    );

    inner.style.width =
      `${zoomWidth}px`;

    inner.style.height =
      `${zoomHeight}px`;

    inner.style.minWidth =
      `${zoomWidth}px`;

    inner.style.minHeight =
      `${zoomHeight}px`;

    img.style.width =
      `${zoomWidth}px`;

    img.style.height =
      `${zoomHeight}px`;

    img.style.maxWidth = "none";
    img.style.maxHeight = "none";

    zoomTrack.classList.add(
      "is-locked"
    );

    requestAnimationFrame(() => {
      const maxLeft = Math.max(
        0,
        slide.scrollWidth -
          slide.clientWidth
      );

      const maxTop = Math.max(
        0,
        slide.scrollHeight -
          slide.clientHeight
      );

      const targetLeft =
        relativeX * zoomWidth -
        viewportOffsetX;

      const targetTop =
        relativeY * zoomHeight -
        viewportOffsetY;

      slide.scrollLeft = clamp(
        targetLeft,
        0,
        maxLeft
      );

      slide.scrollTop = clamp(
        targetTop,
        0,
        maxTop
      );
    });
  };

  const toggleSlideZoomAtPoint = (
    slide,
    clientX,
    clientY
  ) => {
    if (!slide) return;

    const isZoomed =
      slide.getAttribute(
        "data-zoomed"
      ) === "true";

    if (isZoomed) {
      clearSlideZoom(slide, true);

      zoomTrack.classList.remove(
        "is-locked"
      );

      return;
    }

    zoomSlideAtPoint(
      slide,
      clientX,
      clientY
    );
  };

  const syncZoomIndexFromScroll = () => {
    const width =
      zoomTrack.clientWidth || 1;

    zoomIndex = Math.round(
      zoomTrack.scrollLeft / width
    );

    zoomIndex = Math.max(
      0,
      Math.min(
        zoomIndex,
        zoomSourceImgs.length - 1
      )
    );
  };

  const clearDesktopSlideAnimationTimer = () => {
    if (!desktopSlideAnimationEndTimer) {
      return;
    }

    clearTimeout(
      desktopSlideAnimationEndTimer
    );

    desktopSlideAnimationEndTimer = null;
  };

  const finishDesktopSlideAnimation = (
    targetLeft,
    previousSnapType,
    previousScrollBehavior
  ) => {
    zoomTrack.scrollLeft = targetLeft;

    requestAnimationFrame(() => {
      zoomTrack.style.scrollSnapType =
        previousSnapType;

      zoomTrack.style.scrollBehavior =
        previousScrollBehavior;

      isDesktopSlideAnimating = false;
      syncZoomIndexFromScroll();
    });
  };

  const cancelZoomAnimation = () => {
    if (zoomAnimationRaf) {
      cancelAnimationFrame(
        zoomAnimationRaf
      );

      zoomAnimationRaf = null;
    }

    clearDesktopSlideAnimationTimer();
    isDesktopSlideAnimating = false;
  };

  const scrollZoomTo = (
    index,
    smooth = true
  ) => {
    const slides =
      zoomTrack.querySelectorAll(
        "[data-zoom-slide]"
      );

    if (!slides.length) return;

    resetZoomState();
    cancelZoomAnimation();

    zoomIndex =
      normalizeZoomIndex(index);

    const targetLeft =
      zoomIndex *
      zoomTrack.clientWidth;

    if (
      !smooth ||
      window.innerWidth <= 700
    ) {
      zoomTrack.scrollLeft =
        targetLeft;

      syncZoomIndexFromScroll();
      return;
    }

    const startLeft =
      zoomTrack.scrollLeft;

    const distance =
      targetLeft - startLeft;

    if (Math.abs(distance) < 1) {
      zoomTrack.scrollLeft =
        targetLeft;

      syncZoomIndexFromScroll();
      return;
    }

    const previousSnapType =
      zoomTrack.style.scrollSnapType;

    const previousScrollBehavior =
      zoomTrack.style.scrollBehavior;

    zoomTrack.style.scrollSnapType =
      "none";

    zoomTrack.style.scrollBehavior =
      "auto";

    isDesktopSlideAnimating = true;

    const duration = 175;
    let startTime = null;

    const easeOutQuart = (progress) =>
      1 -
      Math.pow(
        1 - progress,
        4
      );

    const animate = (timestamp) => {
      if (startTime === null) {
        startTime = timestamp;
      }

      const elapsed =
        timestamp - startTime;

      const progress = Math.min(
        elapsed / duration,
        1
      );

      const eased =
        easeOutQuart(progress);

      zoomTrack.scrollLeft =
        startLeft +
        distance * eased;

      if (progress < 1) {
        zoomAnimationRaf =
          requestAnimationFrame(
            animate
          );
      } else {
        zoomAnimationRaf = null;

        finishDesktopSlideAnimation(
          targetLeft,
          previousSnapType,
          previousScrollBehavior
        );
      }
    };

    zoomAnimationRaf =
      requestAnimationFrame(
        animate
      );

    desktopSlideAnimationEndTimer =
      setTimeout(() => {
        if (!isDesktopSlideAnimating) {
          return;
        }

        if (zoomAnimationRaf) {
          cancelAnimationFrame(
            zoomAnimationRaf
          );

          zoomAnimationRaf = null;
        }

        finishDesktopSlideAnimation(
          targetLeft,
          previousSnapType,
          previousScrollBehavior
        );
      }, duration + 80);
  };

  const watchZoomScrollSettled = () => {
    if (isDesktopSlideAnimating) {
      return;
    }

    cancelAnimationFrame(
      zoomScrollRaf
    );

    const check = () => {
      if (isDesktopSlideAnimating) {
        return;
      }

      const currentScrollLeft =
        zoomTrack.scrollLeft;

      if (
        Math.abs(
          currentScrollLeft -
            zoomLastScrollLeft
        ) < 0.5
      ) {
        zoomStableFrames += 1;
      } else {
        zoomStableFrames = 0;

        zoomLastScrollLeft =
          currentScrollLeft;
      }

      if (zoomStableFrames >= 3) {
        syncZoomIndexFromScroll();

        zoomStableFrames = 0;
        return;
      }

      zoomScrollRaf =
        requestAnimationFrame(
          check
        );
    };

    zoomLastScrollLeft =
      zoomTrack.scrollLeft;

    zoomStableFrames = 0;

    zoomScrollRaf =
      requestAnimationFrame(
        check
      );
  };

  const closeZoomCarousel = () => {
    cancelAnimationFrame(
      zoomScrollRaf
    );

    cancelZoomAnimation();

    zoomScrollRaf = null;
    zoomStableFrames = 0;

    swipeCloseState.active = false;
    swipeCloseState.deltaX = 0;
    swipeCloseState.deltaY = 0;
    swipeCloseState.lockedDirection =
      null;

    resetZoomState();
    resetOverlayDragVisual(false);
    setOverlayClosed();
    showChrome();
  };

  const openZoomCarousel = (
    sourceImgs,
    index
  ) => {
    buildZoomCarousel(sourceImgs);

    overlay.style.display = "block";
    overlay.style.visibility = "hidden";
    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
    overlay.style.transform = "translateY(0)";
    overlay.style.transition = "none";

    overlay.classList.add("active");

    document.body.classList.add(
      "lock-scroll"
    );

    hideChrome();
    resetZoomState();
    cancelZoomAnimation();

    zoomIndex =
      normalizeZoomIndex(index);

    void overlay.offsetWidth;
    void zoomTrack.offsetWidth;

    const selectedPosition =
      zoomIndex *
      zoomTrack.clientWidth;

    const previousSnap =
      zoomTrack.style.scrollSnapType;

    const previousBehavior =
      zoomTrack.style.scrollBehavior;

    zoomTrack.style.scrollSnapType =
      "none";

    zoomTrack.style.scrollBehavior =
      "auto";

    zoomTrack.scrollLeft =
      selectedPosition;

    void zoomTrack.offsetWidth;

    requestAnimationFrame(() => {
      zoomTrack.style.scrollSnapType =
        previousSnap;

      zoomTrack.style.scrollBehavior =
        previousBehavior;

      overlay.style.visibility = "visible";
      overlay.style.opacity = "1";
      overlay.style.pointerEvents = "auto";
      overlay.style.transform = "translateY(0)";
    });
  };

  window.prevImageV2 = () => {
    if (
      !overlay.classList.contains(
        "active"
      )
    ) {
      return;
    }

    if (isDesktopSlideAnimating) {
      return;
    }

    scrollZoomTo(
      zoomIndex - 1,
      true
    );
  };

  window.nextImageV2 = () => {
    if (
      !overlay.classList.contains(
        "active"
      )
    ) {
      return;
    }

    if (isDesktopSlideAnimating) {
      return;
    }

    scrollZoomTo(
      zoomIndex + 1,
      true
    );
  };

  const attachOverlayListeners = () => {
    const onZoomTrackScroll = () => {
      if (
        !overlay.classList.contains(
          "active"
        )
      ) {
        return;
      }

      if (
        zoomTrack.classList.contains(
          "is-locked"
        )
      ) {
        return;
      }

      if (isDesktopSlideAnimating) {
        return;
      }

      watchZoomScrollSettled();
    };

    let wheelAccumX = 0;
    let wheelAccumY = 0;
    let wheelDirection = null;
    let wheelGestureTimer = null;
    let horizontalCooldownUntil = 0;

    const clearWheelTimer = () => {
      if (!wheelGestureTimer) return;

      clearTimeout(
        wheelGestureTimer
      );

      wheelGestureTimer = null;
    };

    const resetWheelGesture = (
      resetVisual = true
    ) => {
      wheelAccumX = 0;
      wheelAccumY = 0;
      wheelDirection = null;

      clearWheelTimer();

      if (
        resetVisual &&
        overlay.classList.contains(
          "active"
        )
      ) {
        resetOverlayDragVisual(true);
      }
    };

    const scheduleWheelReset = () => {
      clearWheelTimer();

      wheelGestureTimer = setTimeout(
        () => {
          resetWheelGesture(true);
        },
        120
      );
    };

    const onWheel = (event) => {
      if (
        !overlay.classList.contains(
          "active"
        )
      ) {
        return;
      }

      const zoomedSlide =
        getZoomedSlide();

      if (zoomedSlide) {
        event.preventDefault();

        zoomedSlide.scrollLeft +=
          event.deltaX;

        zoomedSlide.scrollTop +=
          event.deltaY;

        if (
          event.shiftKey &&
          event.deltaY !== 0 &&
          event.deltaX === 0
        ) {
          zoomedSlide.scrollLeft +=
            event.deltaY;
        }

        return;
      }

      if (window.innerWidth <= 700) {
        return;
      }

      const absoluteX = Math.abs(
        event.deltaX
      );

      const absoluteY = Math.abs(
        event.deltaY
      );

      if (
        absoluteX < 2 &&
        absoluteY < 2
      ) {
        return;
      }

      event.preventDefault();

      if (isDesktopSlideAnimating) {
        return;
      }

      scheduleWheelReset();

      if (!wheelDirection) {
        if (
          absoluteX >
          absoluteY * 1.12
        ) {
          wheelDirection =
            "horizontal";
        } else if (
          absoluteY >
          absoluteX * 1.12
        ) {
          wheelDirection =
            "vertical";
        } else {
          return;
        }
      }

      if (
        wheelDirection ===
        "horizontal"
      ) {
        const currentTime =
          performance.now();

        if (
          currentTime <
          horizontalCooldownUntil
        ) {
          return;
        }

        wheelAccumX += event.deltaX;

        const HORIZONTAL_THRESHOLD = 42;
        const HORIZONTAL_COOLDOWN = 220;

        if (
          wheelAccumX >
          HORIZONTAL_THRESHOLD
        ) {
          wheelAccumX = 0;

          horizontalCooldownUntil =
            currentTime +
            HORIZONTAL_COOLDOWN;

          window.nextImageV2();
          return;
        }

        if (
          wheelAccumX <
          -HORIZONTAL_THRESHOLD
        ) {
          wheelAccumX = 0;

          horizontalCooldownUntil =
            currentTime +
            HORIZONTAL_COOLDOWN;

          window.prevImageV2();
        }

        return;
      }

      if (
        wheelDirection ===
        "vertical"
      ) {
        if (
          event.deltaY < 0 &&
          wheelAccumY <= 0
        ) {
          wheelAccumY = Math.max(
            wheelAccumY +
              event.deltaY * 0.15,
            -35
          );

          overlay.style.transition =
            "none";

          overlay.style.transform =
            `translateY(${wheelAccumY * 0.12}px)`;

          overlay.style.opacity = "1";

          return;
        }

        wheelAccumY += event.deltaY;

        wheelAccumY = Math.max(
          0,
          wheelAccumY
        );

        const visualDistance =
          Math.min(
            wheelAccumY * 0.55,
            window.innerHeight
          );

        const opacity = Math.max(
          0.45,
          1 - wheelAccumY / 430
        );

        overlay.style.transition =
          "none";

        overlay.style.transform =
          `translateY(${visualDistance}px)`;

        overlay.style.opacity =
          String(opacity);

        const VERTICAL_CLOSE_THRESHOLD =
          115;

        if (
          wheelAccumY >=
          VERTICAL_CLOSE_THRESHOLD
        ) {
          resetWheelGesture(false);
          closeZoomCarousel();
        }
      }
    };

    const onClick = (event) => {
      if (window.innerWidth <= 700) {
        return;
      }

      if (dragState.moved) return;

      const slide =
        event.target.closest(
          ".zoom-slide"
        );

      if (!slide) return;

      const isZoomed =
        slide.getAttribute(
          "data-zoomed"
        ) === "true";

      event.preventDefault();
      event.stopPropagation();

      if (isZoomed) {
        clearSlideZoom(
          slide,
          true
        );

        zoomTrack.classList.remove(
          "is-locked"
        );

        return;
      }

      const img =
        event.target.closest(
          ".zoom-slide img"
        );

      if (!img) return;

      toggleSlideZoomAtPoint(
        slide,
        event.clientX,
        event.clientY
      );
    };

    const onPointerDown = (event) => {
      if (window.innerWidth <= 700) {
        return;
      }

      const slide =
        event.target.closest(
          ".zoom-slide"
        );

      if (!slide) return;

      if (
        slide.getAttribute(
          "data-zoomed"
        ) !== "true"
      ) {
        return;
      }

      dragState.active = true;
      dragState.pointerId =
        event.pointerId;

      dragState.slide = slide;
      dragState.startX =
        event.clientX;

      dragState.startY =
        event.clientY;

      dragState.startScrollLeft =
        slide.scrollLeft;

      dragState.startScrollTop =
        slide.scrollTop;

      dragState.moved = false;

      slide.classList.add(
        "is-dragging"
      );

      if (slide.setPointerCapture) {
        try {
          slide.setPointerCapture(
            event.pointerId
          );
        } catch (_) {}
      }

      event.preventDefault();
    };

    const onPointerMove = (event) => {
      if (!dragState.active) return;

      if (
        dragState.pointerId !==
        event.pointerId
      ) {
        return;
      }

      if (!dragState.slide) return;

      const deltaX =
        event.clientX -
        dragState.startX;

      const deltaY =
        event.clientY -
        dragState.startY;

      if (
        Math.abs(deltaX) > 3 ||
        Math.abs(deltaY) > 3
      ) {
        dragState.moved = true;
      }

      dragState.slide.scrollLeft =
        dragState.startScrollLeft -
        deltaX;

      dragState.slide.scrollTop =
        dragState.startScrollTop -
        deltaY;

      event.preventDefault();
    };

    const endPointerDrag = (event) => {
      if (!dragState.active) return;

      if (
        dragState.pointerId !==
        event.pointerId
      ) {
        return;
      }

      if (dragState.slide) {
        dragState.slide.classList.remove(
          "is-dragging"
        );

        if (
          dragState.slide
            .releasePointerCapture
        ) {
          try {
            dragState.slide
              .releasePointerCapture(
                event.pointerId
              );
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

    const onTouchStart = (event) => {
      if (
        !overlay.classList.contains(
          "active"
        )
      ) {
        return;
      }

      if (window.innerWidth > 700) {
        return;
      }

      if (
        !event.touches ||
        event.touches.length !== 1
      ) {
        return;
      }

      if (getZoomedSlide()) return;

      const targetSlide =
        event.target.closest(
          ".zoom-slide"
        );

      if (!targetSlide) return;

      swipeCloseState.active = true;

      swipeCloseState.startX =
        event.touches[0].clientX;

      swipeCloseState.startY =
        event.touches[0].clientY;

      swipeCloseState.deltaX = 0;
      swipeCloseState.deltaY = 0;

      swipeCloseState.lockedDirection =
        null;

      overlay.style.transition =
        "none";
    };

    const onTouchMove = (event) => {
      if (
        !swipeCloseState.active
      ) {
        return;
      }

      if (window.innerWidth > 700) {
        return;
      }

      if (
        !event.touches ||
        event.touches.length !== 1
      ) {
        return;
      }

      if (getZoomedSlide()) return;

      const touch =
        event.touches[0];

      swipeCloseState.deltaX =
        touch.clientX -
        swipeCloseState.startX;

      swipeCloseState.deltaY =
        touch.clientY -
        swipeCloseState.startY;

      if (
        !swipeCloseState.lockedDirection
      ) {
        const absoluteX = Math.abs(
          swipeCloseState.deltaX
        );

        const absoluteY = Math.abs(
          swipeCloseState.deltaY
        );

        if (
          absoluteX <
            SWIPE_CLOSE_DIRECTION_LOCK &&
          absoluteY <
            SWIPE_CLOSE_DIRECTION_LOCK
        ) {
          return;
        }

        swipeCloseState.lockedDirection =
          absoluteY > absoluteX
            ? "y"
            : "x";
      }

      if (
        swipeCloseState.lockedDirection !==
        "y"
      ) {
        return;
      }

      if (
        swipeCloseState.deltaY <= 0
      ) {
        return;
      }

      if (
        Math.abs(
          swipeCloseState.deltaX
        ) >
        SWIPE_CLOSE_MAX_HORIZONTAL
      ) {
        return;
      }

      const dragY =
        swipeCloseState.deltaY *
        0.55;

      const fade = Math.max(
        0.55,
        1 -
          swipeCloseState.deltaY /
            420
      );

      overlay.style.transform =
        `translateY(${dragY}px)`;

      overlay.style.opacity =
        String(fade);
    };

    const onTouchEnd = () => {
      if (
        !swipeCloseState.active
      ) {
        return;
      }

      const shouldClose =
        swipeCloseState
          .lockedDirection === "y" &&
        swipeCloseState.deltaY >
          SWIPE_CLOSE_THRESHOLD &&
        Math.abs(
          swipeCloseState.deltaX
        ) <
          SWIPE_CLOSE_MAX_HORIZONTAL &&
        !getZoomedSlide();

      swipeCloseState.active = false;

      if (shouldClose) {
        closeZoomCarousel();
        return;
      }

      resetOverlayDragVisual(true);
    };

    const onTouchCancel = () => {
      if (
        !swipeCloseState.active
      ) {
        return;
      }

      swipeCloseState.active = false;
      resetOverlayDragVisual(true);
    };

    const onBackdropClick = (event) => {
      event.preventDefault();
      event.stopPropagation();

      closeZoomCarousel();
    };

    const onClose = (event) => {
      event.preventDefault();
      event.stopPropagation();

      closeZoomCarousel();
    };

    const onKeyDown = (event) => {
      if (
        !overlay.classList.contains(
          "active"
        )
      ) {
        return;
      }

      if (event.key === "Escape") {
        closeZoomCarousel();
      }

      if (event.key === "ArrowLeft") {
        window.prevImageV2();
      }

      if (event.key === "ArrowRight") {
        window.nextImageV2();
      }
    };

    const onResize = () => {
      if (
        !overlay.classList.contains(
          "active"
        )
      ) {
        return;
      }

      scrollZoomTo(
        zoomIndex,
        false
      );

      resetOverlayDragVisual(false);
    };

    zoomTrack.addEventListener(
      "scroll",
      onZoomTrackScroll
    );

    zoomTrack.addEventListener(
      "wheel",
      onWheel,
      { passive: false }
    );

    zoomTrack.addEventListener(
      "click",
      onClick
    );

    zoomTrack.addEventListener(
      "pointerdown",
      onPointerDown
    );

    zoomTrack.addEventListener(
      "pointermove",
      onPointerMove
    );

    zoomTrack.addEventListener(
      "pointerup",
      endPointerDrag
    );

    zoomTrack.addEventListener(
      "pointercancel",
      endPointerDrag
    );

    overlay.addEventListener(
      "touchstart",
      onTouchStart,
      { passive: true }
    );

    overlay.addEventListener(
      "touchmove",
      onTouchMove,
      { passive: true }
    );

    overlay.addEventListener(
      "touchend",
      onTouchEnd
    );

    overlay.addEventListener(
      "touchcancel",
      onTouchCancel
    );

    backdrop.addEventListener(
      "click",
      onBackdropClick
    );

    if (closeButton) {
      closeButton.addEventListener(
        "click",
        onClose
      );
    }

    document.addEventListener(
      "keydown",
      onKeyDown
    );

    window.addEventListener(
      "resize",
      onResize
    );

    cleanupFns.push(() =>
      zoomTrack.removeEventListener(
        "scroll",
        onZoomTrackScroll
      )
    );

    cleanupFns.push(() =>
      zoomTrack.removeEventListener(
        "wheel",
        onWheel
      )
    );

    cleanupFns.push(() =>
      zoomTrack.removeEventListener(
        "click",
        onClick
      )
    );

    cleanupFns.push(() =>
      zoomTrack.removeEventListener(
        "pointerdown",
        onPointerDown
      )
    );

    cleanupFns.push(() =>
      zoomTrack.removeEventListener(
        "pointermove",
        onPointerMove
      )
    );

    cleanupFns.push(() =>
      zoomTrack.removeEventListener(
        "pointerup",
        endPointerDrag
      )
    );

    cleanupFns.push(() =>
      zoomTrack.removeEventListener(
        "pointercancel",
        endPointerDrag
      )
    );

    cleanupFns.push(() =>
      overlay.removeEventListener(
        "touchstart",
        onTouchStart
      )
    );

    cleanupFns.push(() =>
      overlay.removeEventListener(
        "touchmove",
        onTouchMove
      )
    );

    cleanupFns.push(() =>
      overlay.removeEventListener(
        "touchend",
        onTouchEnd
      )
    );

    cleanupFns.push(() =>
      overlay.removeEventListener(
        "touchcancel",
        onTouchCancel
      )
    );

    cleanupFns.push(() =>
      backdrop.removeEventListener(
        "click",
        onBackdropClick
      )
    );

    if (closeButton) {
      cleanupFns.push(() =>
        closeButton.removeEventListener(
          "click",
          onClose
        )
      );
    }

    cleanupFns.push(() =>
      document.removeEventListener(
        "keydown",
        onKeyDown
      )
    );

    cleanupFns.push(() =>
      window.removeEventListener(
        "resize",
        onResize
      )
    );
  };

  const mountDesktop = (
    activeRoot
  ) => {
    const imgsWithDataSrc =
      Array.from(
        activeRoot.querySelectorAll(
          ".main-images img[data-src]"
        )
      );

    imgsWithDataSrc.forEach(
      ensureSrc
    );

    const clickableImgs =
      Array.from(
        activeRoot.querySelectorAll(
          ".main-images img"
        )
      );

    const onPointerUp = (
      event
    ) => {
      if (
        overlay.classList.contains(
          "active"
        )
      ) {
        return;
      }

      const img =
        event.target.closest(
          ".main-images img"
        );

      if (!img) return;

      const index =
        clickableImgs.indexOf(img);

      if (index === -1) return;

      event.preventDefault();
      event.stopPropagation();

      openZoomCarousel(
        clickableImgs,
        index
      );
    };

    activeRoot.addEventListener(
      "pointerup",
      onPointerUp,
      { capture: true }
    );

    cleanupFns.push(() =>
      activeRoot.removeEventListener(
        "pointerup",
        onPointerUp,
        { capture: true }
      )
    );
  };

  const mountMobile = (
    activeRoot
  ) => {
    const host =
      activeRoot.querySelector(
        "[data-wb-snap]"
      );

    const track =
      activeRoot.querySelector(
        "[data-wb-track]"
      );

    if (!host || !track) {
      console.warn(
        "[item-zoom] mobile snap carousel elements not found"
      );

      return;
    }

    const originalSlides =
      Array.from(
        track.querySelectorAll(
          "[data-wb-slide]"
        )
      );

    if (!originalSlides.length) {
      return;
    }

    ensureSrc(
      track.querySelector(
        "img[data-src]"
      )
    );

    const dotsWrap =
      activeRoot.querySelector(
        "[data-wb-dots]"
      );

    const prevButton =
      activeRoot.querySelector(
        "[data-wb-prev]"
      );

    const nextButton =
      activeRoot.querySelector(
        "[data-wb-next]"
      );

    const dots = [];

    const setActiveDot = (
      index
    ) => {
      dots.forEach(
        (dot, dotIndex) => {
          dot.classList.toggle(
            "is-active",
            dotIndex === index
          );
        }
      );
    };

    const cloneFirst =
      originalSlides[0]
        .cloneNode(true);

    const cloneLast =
      originalSlides[
        originalSlides.length - 1
      ].cloneNode(true);

    cloneFirst.setAttribute(
      "data-wb-clone",
      "first"
    );

    cloneLast.setAttribute(
      "data-wb-clone",
      "last"
    );

    track.insertBefore(
      cloneLast,
      originalSlides[0]
    );

    track.appendChild(
      cloneFirst
    );

    const allSlides =
      Array.from(
        track.querySelectorAll(
          "[data-wb-slide]"
        )
      );

    const realCount =
      originalSlides.length;

    const realImgs =
      originalSlides.map(
        (slide) =>
          slide.querySelector("img")
      );

    const slideWidth = () =>
      track.clientWidth;

    const realToDom = (
      realIndex
    ) => realIndex + 1;

    const normalizeIndex = (
      index
    ) =>
      (
        (index % realCount) +
        realCount
      ) %
      realCount;

    let currentRealIndex = 0;
    let isAutoJumping = false;
    let isAnimatingByButton =
      false;

    let settleRaf = null;
    let lastScrollLeft =
      track.scrollLeft;

    let stableFrames = 0;

    let activeScrollAnimation =
      null;

    const loadNeighbors = (
      realIndex
    ) => {
      const domIndex =
        realToDom(realIndex);

      ensureSrc(
        allSlides[
          domIndex
        ]?.querySelector(
          "img[data-src]"
        )
      );

      ensureSrc(
        allSlides[
          domIndex - 1
        ]?.querySelector(
          "img[data-src]"
        )
      );

      ensureSrc(
        allSlides[
          domIndex + 1
        ]?.querySelector(
          "img[data-src]"
        )
      );
    };

    const setScrollSnap = (
      enabled
    ) => {
      track.style.scrollSnapType =
        enabled ? "" : "none";
    };

    const instantScrollTo = (
      left
    ) => {
      if (activeScrollAnimation) {
        cancelAnimationFrame(
          activeScrollAnimation
        );

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

    const syncUI = (
      realIndex
    ) => {
      currentRealIndex =
        normalizeIndex(realIndex);

      setActiveDot(
        currentRealIndex
      );

      loadNeighbors(
        currentRealIndex
      );
    };

    const animateScrollTo = (
      targetLeft,
      duration = 160
    ) => {
      if (activeScrollAnimation) {
        cancelAnimationFrame(
          activeScrollAnimation
        );

        activeScrollAnimation = null;
      }

      const startLeft =
        track.scrollLeft;

      const distance =
        targetLeft - startLeft;

      if (
        !duration ||
        duration <= 0 ||
        Math.abs(distance) < 1
      ) {
        track.scrollLeft =
          targetLeft;

        return;
      }

      let startTime = null;

      const easeOutCubic = (
        progress
      ) =>
        1 -
        Math.pow(
          1 - progress,
          3
        );

      const step = (
        timestamp
      ) => {
        if (startTime === null) {
          startTime = timestamp;
        }

        const elapsed =
          timestamp - startTime;

        const progress =
          Math.min(
            elapsed / duration,
            1
          );

        const eased =
          easeOutCubic(progress);

        track.scrollLeft =
          startLeft +
          distance * eased;

        if (progress < 1) {
          activeScrollAnimation =
            requestAnimationFrame(
              step
            );
        } else {
          activeScrollAnimation =
            null;
        }
      };

      activeScrollAnimation =
        requestAnimationFrame(
          step
        );
    };

    const moveToDomIndex = (
      domIndex,
      smooth = true
    ) => {
      const left =
        domIndex * slideWidth();

      if (!smooth) {
        if (
          activeScrollAnimation
        ) {
          cancelAnimationFrame(
            activeScrollAnimation
          );

          activeScrollAnimation =
            null;
        }

        track.scrollLeft = left;
        return;
      }

      animateScrollTo(
        left,
        160
      );
    };

    const moveToRealIndex = (
      realIndex,
      smooth = true
    ) => {
      const normalized =
        normalizeIndex(realIndex);

      syncUI(normalized);

      moveToDomIndex(
        realToDom(normalized),
        smooth
      );
    };

    if (dotsWrap) {
      dotsWrap.innerHTML = "";

      for (
        let index = 0;
        index < realCount;
        index += 1
      ) {
        const button =
          document.createElement(
            "button"
          );

        button.type = "button";

        button.className =
          "wb-dot" +
          (
            index === 0
              ? " is-active"
              : ""
          );

        button.setAttribute(
          "aria-label",
          `Go to image ${index + 1}`
        );

        button.addEventListener(
          "click",
          (event) => {
            event.preventDefault();

            moveToRealIndex(
              index,
              true
            );
          }
        );

        dotsWrap.appendChild(
          button
        );

        dots.push(button);
      }
    }

    const getNearestDomIndex =
      () => {
        const width =
          slideWidth();

        if (!width) return 1;

        return Math.round(
          track.scrollLeft / width
        );
      };

    const handleLoopRepositionIfNeeded =
      () => {
        const domIndex =
          getNearestDomIndex();

        if (domIndex === 0) {
          instantScrollTo(
            realCount *
              slideWidth()
          );

          syncUI(
            realCount - 1
          );

          return;
        }

        if (
          domIndex ===
          realCount + 1
        ) {
          instantScrollTo(
            slideWidth()
          );

          syncUI(0);
          return;
        }

        syncUI(
          domIndex - 1
        );
      };

    const onScrollSettled = () => {
      handleLoopRepositionIfNeeded();

      isAnimatingByButton =
        false;
    };

    const watchScrollSettled =
      () => {
        cancelAnimationFrame(
          settleRaf
        );

        const check = () => {
          const currentScrollLeft =
            track.scrollLeft;

          if (
            Math.abs(
              currentScrollLeft -
                lastScrollLeft
            ) < 0.5
          ) {
            stableFrames += 1;
          } else {
            stableFrames = 0;

            lastScrollLeft =
              currentScrollLeft;
          }

          if (
            stableFrames >= 3
          ) {
            stableFrames = 0;

            onScrollSettled();
            return;
          }

          settleRaf =
            requestAnimationFrame(
              check
            );
        };

        lastScrollLeft =
          track.scrollLeft;

        stableFrames = 0;

        settleRaf =
          requestAnimationFrame(
            check
          );
      };

    instantScrollTo(
      slideWidth()
    );

    syncUI(0);

    if ("onscrollend" in track) {
      const onScrollEnd = () => {
        if (isAutoJumping) {
          return;
        }

        onScrollSettled();
      };

      track.addEventListener(
        "scrollend",
        onScrollEnd
      );

      cleanupFns.push(() =>
        track.removeEventListener(
          "scrollend",
          onScrollEnd
        )
      );
    } else {
      const onScroll = () => {
        if (isAutoJumping) {
          return;
        }

        watchScrollSettled();
      };

      track.addEventListener(
        "scroll",
        onScroll
      );

      cleanupFns.push(() =>
        track.removeEventListener(
          "scroll",
          onScroll
        )
      );
    }

    if (nextButton) {
      const onNext = (
        event
      ) => {
        event.preventDefault();

        if (
          isAnimatingByButton
        ) {
          return;
        }

        isAnimatingByButton =
          true;

        if (
          currentRealIndex ===
          realCount - 1
        ) {
          setActiveDot(0);
          loadNeighbors(0);

          moveToDomIndex(
            realCount + 1,
            true
          );
        } else {
          moveToRealIndex(
            currentRealIndex + 1,
            true
          );
        }
      };

      nextButton.addEventListener(
        "click",
        onNext
      );

      cleanupFns.push(() =>
        nextButton.removeEventListener(
          "click",
          onNext
        )
      );
    }

    if (prevButton) {
      const onPrev = (
        event
      ) => {
        event.preventDefault();

        if (
          isAnimatingByButton
        ) {
          return;
        }

        isAnimatingByButton =
          true;

        if (
          currentRealIndex === 0
        ) {
          setActiveDot(
            realCount - 1
          );

          loadNeighbors(
            realCount - 1
          );

          moveToDomIndex(
            0,
            true
          );
        } else {
          moveToRealIndex(
            currentRealIndex - 1,
            true
          );
        }
      };

      prevButton.addEventListener(
        "click",
        onPrev
      );

      cleanupFns.push(() =>
        prevButton.removeEventListener(
          "click",
          onPrev
        )
      );
    }

    const onPointerUp = (
      event
    ) => {
      if (
        overlay.classList.contains(
          "active"
        )
      ) {
        return;
      }

      const img =
        event.target.closest(
          ".wb-snap__slide img"
        );

      if (!img) return;

      event.preventDefault();
      event.stopPropagation();

      const slideElement =
        img.closest(
          "[data-wb-slide]"
        );

      const indexInAll =
        allSlides.indexOf(
          slideElement
        );

      let realIndex;

      if (indexInAll === 0) {
        realIndex =
          realCount - 1;
      } else if (
        indexInAll ===
        realCount + 1
      ) {
        realIndex = 0;
      } else {
        realIndex =
          indexInAll - 1;
      }

      openZoomCarousel(
        realImgs,
        realIndex
      );
    };

    track.addEventListener(
      "pointerup",
      onPointerUp,
      { capture: true }
    );

    cleanupFns.push(() =>
      track.removeEventListener(
        "pointerup",
        onPointerUp,
        { capture: true }
      )
    );

    const onResize = () => {
      instantScrollTo(
        realToDom(
          currentRealIndex
        ) *
          slideWidth()
      );

      syncUI(
        currentRealIndex
      );
    };

    window.addEventListener(
      "resize",
      onResize
    );

    cleanupFns.push(() =>
      window.removeEventListener(
        "resize",
        onResize
      )
    );
  };

  const mount = (isMobile) => {
    cleanupFns.forEach(
      (cleanup) => {
        cleanup();
      }
    );

    cleanupFns = [];

    closeZoomCarousel();

    root.innerHTML = "";

    const template = isMobile
      ? tplMobile
      : tplDesktop;

    root.appendChild(
      template.content.cloneNode(
        true
      )
    );

    const activeRoot = isMobile
      ? root.querySelector(
          ".item-carousel-v2"
        )
      : root.querySelector(
          ".item"
        );

    if (!activeRoot) {
      console.warn(
        "[item-zoom] active root not found",
        { isMobile }
      );

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

  const onMqChange = (event) => {
    mount(event.matches);
  };

  if (mq.addEventListener) {
    mq.addEventListener(
      "change",
      onMqChange
    );
  } else {
    mq.addListener(
      onMqChange
    );
  }
});
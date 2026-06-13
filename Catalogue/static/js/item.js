// item-zoom.js
// Desktop overlay uses translate3d instead of scrollLeft.
// This completely removes the scroll-snap / momentum bounce-back problem.
// Mobile keeps its native snap carousel behavior.

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

  const mq = window.matchMedia("(max-width: 700px)");

  let backdrop = overlay.querySelector(".zoom-backdrop");

  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "zoom-backdrop";
    overlay.prepend(backdrop);
  }

  const DESKTOP_ZOOM_SCALE = 2.25;
  const DESKTOP_SLIDE_DURATION = 170;
  const DESKTOP_WHEEL_THRESHOLD = 44;
  const DESKTOP_WHEEL_RELEASE_DELAY = 260;

  let cleanupFns = [];
  let zoomSourceImgs = [];
  let zoomIndex = 0;

  let desktopAnimating = false;
  let desktopAnimationTimer = null;

  let desktopWheelLocked = false;
  let desktopWheelReleaseTimer = null;
  let desktopWheelAccumX = 0;
  let desktopWheelAccumY = 0;
  let desktopWheelDirection = null;
  let desktopWheelResetTimer = null;

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

  let mobileCloseState = {
    active: false,
    startX: 0,
    startY: 0,
    deltaX: 0,
    deltaY: 0,
    direction: null,
  };

  const clamp = (value, min, max) =>
    Math.min(Math.max(value, min), max);

  const ensureSrc = (img) => {
    if (!img || img.getAttribute("src")) {
      return;
    }

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

  const resetOverlayVisual = (
    animate = true
  ) => {
    overlay.style.transition = animate
      ? "opacity 0.22s ease, transform 0.22s ease"
      : "none";

    overlay.style.transform = "translateY(0)";
    overlay.style.opacity = "1";
  };

  const clearDesktopTimers = () => {
    if (desktopAnimationTimer) {
      clearTimeout(desktopAnimationTimer);
      desktopAnimationTimer = null;
    }

    if (desktopWheelReleaseTimer) {
      clearTimeout(desktopWheelReleaseTimer);
      desktopWheelReleaseTimer = null;
    }

    if (desktopWheelResetTimer) {
      clearTimeout(desktopWheelResetTimer);
      desktopWheelResetTimer = null;
    }

    desktopAnimating = false;
    desktopWheelLocked = false;
    desktopWheelAccumX = 0;
    desktopWheelAccumY = 0;
    desktopWheelDirection = null;
  };

  const configureDesktopTrack = () => {
    zoomTrack.style.display = "flex";
    zoomTrack.style.width = "100%";
    zoomTrack.style.height = "100%";
    zoomTrack.style.overflow = "visible";
    zoomTrack.style.scrollSnapType = "none";
    zoomTrack.style.scrollBehavior = "auto";
    zoomTrack.style.willChange = "transform";
    zoomTrack.style.transition = "none";

    zoomTrack.style.transform =
      `translate3d(${-zoomIndex * 100}%, 0, 0)`;

    getZoomSlides().forEach((slide) => {
      slide.style.flex = "0 0 100%";
      slide.style.width = "100%";
      slide.style.minWidth = "100%";
      slide.style.height = "100%";
      slide.style.scrollSnapAlign = "none";
    });
  };

  const configureMobileTrack = () => {
    zoomTrack.style.display = "flex";
    zoomTrack.style.width = "100%";
    zoomTrack.style.height = "100%";
    zoomTrack.style.overflowX = "auto";
    zoomTrack.style.overflowY = "hidden";
    zoomTrack.style.scrollSnapType = "x mandatory";
    zoomTrack.style.scrollBehavior = "auto";
    zoomTrack.style.willChange = "auto";
    zoomTrack.style.transition = "none";
    zoomTrack.style.transform = "none";

    getZoomSlides().forEach((slide) => {
      slide.style.flex = "0 0 100%";
      slide.style.width = "100%";
      slide.style.minWidth = "100%";
      slide.style.height = "100%";
      slide.style.scrollSnapAlign = "start";
    });
  };

  const buildZoomCarousel = (
    sourceImgs
  ) => {
    zoomTrack.innerHTML = "";
    zoomSourceImgs = sourceImgs.slice();

    zoomSourceImgs.forEach(
      (sourceImg, index) => {
        ensureSrc(sourceImg);

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

        const img =
          document.createElement("img");

        img.src =
          sourceImg.getAttribute("src") ||
          sourceImg.getAttribute("data-src") ||
          "";

        img.alt =
          sourceImg.getAttribute("alt") ||
          `Image ${index + 1}`;

        img.draggable = false;

        inner.appendChild(img);
        slide.appendChild(inner);
        zoomTrack.appendChild(slide);
      }
    );
  };

  const clearSlideZoom = (
    slide,
    resetScroll = true
  ) => {
    if (!slide) {
      return;
    }

    const inner =
      slide.querySelector(
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

    slide.style.overflow = "";

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
    getZoomSlides().forEach(
      (slide) => {
        clearSlideZoom(slide, true);
      }
    );

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
    if (!slide) {
      return;
    }

    const inner =
      slide.querySelector(
        ".zoom-slide-inner"
      );

    const img =
      slide.querySelector("img");

    if (!inner || !img) {
      return;
    }

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

    const scale = Math.max(
      DESKTOP_ZOOM_SCALE,
      (slideRect.width + 120) /
        imgRect.width,
      (slideRect.height + 120) /
        imgRect.height
    );

    const zoomWidth =
      Math.round(
        imgRect.width * scale
      );

    const zoomHeight =
      Math.round(
        imgRect.height * scale
      );

    resetZoomState();

    slide.classList.add(
      "is-zoomed"
    );

    slide.setAttribute(
      "data-zoomed",
      "true"
    );

    slide.style.overflow = "auto";

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
      slide.scrollLeft = clamp(
        relativeX * zoomWidth -
          viewportOffsetX,
        0,
        Math.max(
          0,
          slide.scrollWidth -
            slide.clientWidth
        )
      );

      slide.scrollTop = clamp(
        relativeY * zoomHeight -
          viewportOffsetY,
        0,
        Math.max(
          0,
          slide.scrollHeight -
            slide.clientHeight
        )
      );
    });
  };

  const goToDesktopImage = (
    index,
    animate = true
  ) => {
    if (!zoomSourceImgs.length) {
      return;
    }

    if (desktopAnimating) {
      return;
    }

    resetZoomState();

    zoomIndex =
      normalizeZoomIndex(index);

    if (!animate) {
      zoomTrack.style.transition =
        "none";

      zoomTrack.style.transform =
        `translate3d(${-zoomIndex * 100}%, 0, 0)`;

      return;
    }

    desktopAnimating = true;
    desktopWheelLocked = true;

    zoomTrack.style.transition =
      `transform ${DESKTOP_SLIDE_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1)`;

    requestAnimationFrame(() => {
      zoomTrack.style.transform =
        `translate3d(${-zoomIndex * 100}%, 0, 0)`;
    });

    desktopAnimationTimer =
      setTimeout(() => {
        zoomTrack.style.transition =
          "none";

        zoomTrack.style.transform =
          `translate3d(${-zoomIndex * 100}%, 0, 0)`;

        desktopAnimating = false;
        desktopAnimationTimer = null;

        desktopWheelReleaseTimer =
          setTimeout(() => {
            desktopWheelLocked = false;
            desktopWheelReleaseTimer = null;
          }, DESKTOP_WHEEL_RELEASE_DELAY);
      }, DESKTOP_SLIDE_DURATION + 25);
  };

  const syncMobileOverlayIndex = () => {
    const width =
      zoomTrack.clientWidth || 1;

    zoomIndex = clamp(
      Math.round(
        zoomTrack.scrollLeft / width
      ),
      0,
      Math.max(
        0,
        zoomSourceImgs.length - 1
      )
    );
  };

  const openZoomCarousel = (
    sourceImgs,
    index
  ) => {
    clearDesktopTimers();
    buildZoomCarousel(sourceImgs);

    zoomIndex =
      normalizeZoomIndex(index);

    overlay.style.display = "block";
    overlay.style.visibility = "hidden";
    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
    overlay.style.transform =
      "translateY(0)";
    overlay.style.transition = "none";

    overlay.classList.add("active");

    document.body.classList.add(
      "lock-scroll"
    );

    hideChrome();
    resetZoomState();

    void overlay.offsetWidth;

    if (window.innerWidth > 700) {
      configureDesktopTrack();

      goToDesktopImage(
        zoomIndex,
        false
      );
    } else {
      configureMobileTrack();

      zoomTrack.scrollLeft =
        zoomIndex *
        zoomTrack.clientWidth;
    }

    void zoomTrack.offsetWidth;

    overlay.style.visibility =
      "visible";

    overlay.style.opacity = "1";
    overlay.style.pointerEvents = "auto";
  };

  const closeZoomCarousel = () => {
    clearDesktopTimers();
    resetZoomState();
    resetOverlayVisual(false);

    mobileCloseState.active = false;
    mobileCloseState.deltaX = 0;
    mobileCloseState.deltaY = 0;
    mobileCloseState.direction = null;

    overlay.style.display = "none";
    overlay.style.visibility = "hidden";
    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
    overlay.style.transform =
      "translateY(0)";
    overlay.style.transition = "none";

    overlay.classList.remove("active");

    document.body.classList.remove(
      "lock-scroll"
    );

    zoomTrack.innerHTML = "";

    showChrome();
  };

  window.prevImageV2 = () => {
    if (
      !overlay.classList.contains(
        "active"
      )
    ) {
      return;
    }

    if (window.innerWidth > 700) {
      goToDesktopImage(
        zoomIndex - 1,
        true
      );
    } else {
      zoomIndex =
        normalizeZoomIndex(
          zoomIndex - 1
        );

      zoomTrack.scrollTo({
        left:
          zoomIndex *
          zoomTrack.clientWidth,
        behavior: "smooth",
      });
    }
  };

  window.nextImageV2 = () => {
    if (
      !overlay.classList.contains(
        "active"
      )
    ) {
      return;
    }

    if (window.innerWidth > 700) {
      goToDesktopImage(
        zoomIndex + 1,
        true
      );
    } else {
      zoomIndex =
        normalizeZoomIndex(
          zoomIndex + 1
        );

      zoomTrack.scrollTo({
        left:
          zoomIndex *
          zoomTrack.clientWidth,
        behavior: "smooth",
      });
    }
  };

  const attachOverlayListeners = () => {
    const resetDesktopWheelGesture =
      () => {
        desktopWheelAccumX = 0;
        desktopWheelAccumY = 0;
        desktopWheelDirection = null;

        if (desktopWheelResetTimer) {
          clearTimeout(
            desktopWheelResetTimer
          );
        }

        desktopWheelResetTimer = null;
      };

    const scheduleDesktopWheelReset =
      () => {
        if (desktopWheelResetTimer) {
          clearTimeout(
            desktopWheelResetTimer
          );
        }

        desktopWheelResetTimer =
          setTimeout(
            resetDesktopWheelGesture,
            110
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
          event.deltaY &&
          !event.deltaX
        ) {
          zoomedSlide.scrollLeft +=
            event.deltaY;
        }

        return;
      }

      if (window.innerWidth <= 700) {
        return;
      }

      event.preventDefault();

      if (
        desktopWheelLocked ||
        desktopAnimating
      ) {
        return;
      }

      const absX =
        Math.abs(event.deltaX);

      const absY =
        Math.abs(event.deltaY);

      if (
        absX < 2 &&
        absY < 2
      ) {
        return;
      }

      scheduleDesktopWheelReset();

      if (!desktopWheelDirection) {
        if (
          absX >
          absY * 1.15
        ) {
          desktopWheelDirection =
            "horizontal";
        } else if (
          absY >
          absX * 1.15
        ) {
          desktopWheelDirection =
            "vertical";
        } else {
          return;
        }
      }

      if (
        desktopWheelDirection ===
        "horizontal"
      ) {
        desktopWheelAccumX +=
          event.deltaX;

        if (
          desktopWheelAccumX >=
          DESKTOP_WHEEL_THRESHOLD
        ) {
          resetDesktopWheelGesture();

          goToDesktopImage(
            zoomIndex + 1,
            true
          );
        } else if (
          desktopWheelAccumX <=
          -DESKTOP_WHEEL_THRESHOLD
        ) {
          resetDesktopWheelGesture();

          goToDesktopImage(
            zoomIndex - 1,
            true
          );
        }

        return;
      }

      desktopWheelAccumY +=
        event.deltaY;

      if (desktopWheelAccumY < 0) {
        desktopWheelAccumY =
          Math.max(
            desktopWheelAccumY,
            -35
          );

        overlay.style.transition =
          "none";

        overlay.style.transform =
          `translateY(${desktopWheelAccumY * 0.12}px)`;

        overlay.style.opacity = "1";

        return;
      }

      desktopWheelAccumY =
        Math.max(
          0,
          desktopWheelAccumY
        );

      const distance = Math.min(
        desktopWheelAccumY * 0.55,
        window.innerHeight
      );

      overlay.style.transition =
        "none";

      overlay.style.transform =
        `translateY(${distance}px)`;

      overlay.style.opacity =
        String(
          Math.max(
            0.45,
            1 -
              desktopWheelAccumY /
                430
          )
        );

      if (
        desktopWheelAccumY >= 115
      ) {
        resetDesktopWheelGesture();
        closeZoomCarousel();
      }
    };

    const onOverlayScroll = () => {
      if (window.innerWidth <= 700) {
        syncMobileOverlayIndex();
      }
    };

    const onClick = (event) => {
      if (
        window.innerWidth <= 700 ||
        dragState.moved
      ) {
        return;
      }

      const slide =
        event.target.closest(
          ".zoom-slide"
        );

      if (!slide) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const isZoomed =
        slide.getAttribute(
          "data-zoomed"
        ) === "true";

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

      if (!img) {
        return;
      }

      zoomSlideAtPoint(
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

      if (
        !slide ||
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

      try {
        slide.setPointerCapture?.(
          event.pointerId
        );
      } catch (_) {}

      event.preventDefault();
    };

    const onPointerMove = (event) => {
      if (
        !dragState.active ||
        dragState.pointerId !==
          event.pointerId
      ) {
        return;
      }

      if (!dragState.slide) {
        return;
      }

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
      if (
        !dragState.active ||
        dragState.pointerId !==
          event.pointerId
      ) {
        return;
      }

      if (dragState.slide) {
        dragState.slide.classList.remove(
          "is-dragging"
        );

        try {
          dragState.slide
            .releasePointerCapture?.(
              event.pointerId
            );
        } catch (_) {}
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

      if (getZoomedSlide()) {
        return;
      }

      if (
        !event.target.closest(
          ".zoom-slide"
        )
      ) {
        return;
      }

      mobileCloseState.active = true;

      mobileCloseState.startX =
        event.touches[0].clientX;

      mobileCloseState.startY =
        event.touches[0].clientY;

      mobileCloseState.deltaX = 0;
      mobileCloseState.deltaY = 0;
      mobileCloseState.direction = null;

      overlay.style.transition =
        "none";
    };

    const onTouchMove = (event) => {
      if (
        !mobileCloseState.active ||
        window.innerWidth > 700
      ) {
        return;
      }

      if (
        !event.touches ||
        event.touches.length !== 1
      ) {
        return;
      }

      if (getZoomedSlide()) {
        return;
      }

      const touch =
        event.touches[0];

      mobileCloseState.deltaX =
        touch.clientX -
        mobileCloseState.startX;

      mobileCloseState.deltaY =
        touch.clientY -
        mobileCloseState.startY;

      if (!mobileCloseState.direction) {
        const absX =
          Math.abs(
            mobileCloseState.deltaX
          );

        const absY =
          Math.abs(
            mobileCloseState.deltaY
          );

        if (
          absX < 12 &&
          absY < 12
        ) {
          return;
        }

        mobileCloseState.direction =
          absY > absX
            ? "y"
            : "x";
      }

      if (
        mobileCloseState.direction !==
        "y"
      ) {
        return;
      }

      if (
        mobileCloseState.deltaY <= 0
      ) {
        return;
      }

      if (
        Math.abs(
          mobileCloseState.deltaX
        ) > 90
      ) {
        return;
      }

      overlay.style.transform =
        `translateY(${mobileCloseState.deltaY * 0.55}px)`;

      overlay.style.opacity =
        String(
          Math.max(
            0.55,
            1 -
              mobileCloseState.deltaY /
                420
          )
        );
    };

    const onTouchEnd = () => {
      if (!mobileCloseState.active) {
        return;
      }

      const shouldClose =
        mobileCloseState.direction ===
          "y" &&
        mobileCloseState.deltaY > 140 &&
        Math.abs(
          mobileCloseState.deltaX
        ) < 90 &&
        !getZoomedSlide();

      mobileCloseState.active = false;

      if (shouldClose) {
        closeZoomCarousel();
      } else {
        resetOverlayVisual(true);
      }
    };

    const onTouchCancel = () => {
      if (!mobileCloseState.active) {
        return;
      }

      mobileCloseState.active = false;
      resetOverlayVisual(true);
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

      if (window.innerWidth > 700) {
        configureDesktopTrack();

        goToDesktopImage(
          zoomIndex,
          false
        );
      } else {
        configureMobileTrack();

        zoomTrack.scrollLeft =
          zoomIndex *
          zoomTrack.clientWidth;
      }

      resetOverlayVisual(false);
    };

    zoomTrack.addEventListener(
      "wheel",
      onWheel,
      { passive: false }
    );

    zoomTrack.addEventListener(
      "scroll",
      onOverlayScroll
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

    closeButton?.addEventListener(
      "click",
      onClose
    );

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
        "wheel",
        onWheel
      )
    );

    cleanupFns.push(() =>
      zoomTrack.removeEventListener(
        "scroll",
        onOverlayScroll
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

    cleanupFns.push(() =>
      closeButton?.removeEventListener(
        "click",
        onClose
      )
    );

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
    const images = Array.from(
      activeRoot.querySelectorAll(
        ".main-images img"
      )
    );

    images.forEach(ensureSrc);

    const onPointerUp = (event) => {
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

      if (!img) {
        return;
      }

      const index =
        images.indexOf(img);

      if (index < 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      openZoomCarousel(
        images,
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
    const track =
      activeRoot.querySelector(
        "[data-wb-track]"
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

    if (!track) {
      console.warn(
        "[item-zoom] mobile track not found"
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
      originalSlides[0]
        .querySelector("img")
    );

    const realCount =
      originalSlides.length;

    const realImgs =
      originalSlides.map(
        (slide) =>
          slide.querySelector("img")
      );

    const dots = [];

    const cloneFirst =
      originalSlides[0]
        .cloneNode(true);

    const cloneLast =
      originalSlides[
        realCount - 1
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

    let currentRealIndex = 0;
    let autoJumping = false;
    let scrollEndTimer = null;

    const width = () =>
      track.clientWidth;

    const normalize = (index) =>
      (
        (index % realCount) +
        realCount
      ) %
      realCount;

    const setDot = (index) => {
      dots.forEach(
        (dot, dotIndex) => {
          dot.classList.toggle(
            "is-active",
            dotIndex === index
          );
        }
      );
    };

    const loadAround = (
      realIndex
    ) => {
      const domIndex =
        realIndex + 1;

      ensureSrc(
        allSlides[
          domIndex
        ]?.querySelector("img")
      );

      ensureSrc(
        allSlides[
          domIndex - 1
        ]?.querySelector("img")
      );

      ensureSrc(
        allSlides[
          domIndex + 1
        ]?.querySelector("img")
      );
    };

    const sync = (index) => {
      currentRealIndex =
        normalize(index);

      setDot(currentRealIndex);
      loadAround(currentRealIndex);
    };

    const instantTo = (left) => {
      autoJumping = true;

      const previousSnap =
        track.style.scrollSnapType;

      const previousBehavior =
        track.style.scrollBehavior;

      track.style.scrollSnapType =
        "none";

      track.style.scrollBehavior =
        "auto";

      track.scrollLeft = left;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          track.style.scrollSnapType =
            previousSnap;

          track.style.scrollBehavior =
            previousBehavior;

          autoJumping = false;
        });
      });
    };

    const goToReal = (
      index,
      smooth = true
    ) => {
      const normalized =
        normalize(index);

      sync(normalized);

      track.scrollTo({
        left:
          (normalized + 1) *
          width(),

        behavior: smooth
          ? "smooth"
          : "auto",
      });
    };

    const settle = () => {
      if (autoJumping) {
        return;
      }

      const domIndex =
        Math.round(
          track.scrollLeft /
            (width() || 1)
        );

      if (domIndex === 0) {
        instantTo(
          realCount *
          width()
        );

        sync(realCount - 1);
      } else if (
        domIndex ===
        realCount + 1
      ) {
        instantTo(width());
        sync(0);
      } else {
        sync(domIndex - 1);
      }
    };

    if (dotsWrap) {
      dotsWrap.innerHTML = "";

      for (
        let index = 0;
        index < realCount;
        index += 1
      ) {
        const dot =
          document.createElement(
            "button"
          );

        dot.type = "button";

        dot.className =
          `wb-dot${index === 0 ? " is-active" : ""}`;

        dot.setAttribute(
          "aria-label",
          `Go to image ${index + 1}`
        );

        dot.addEventListener(
          "click",
          (event) => {
            event.preventDefault();

            goToReal(
              index,
              true
            );
          }
        );

        dotsWrap.appendChild(dot);
        dots.push(dot);
      }
    }

    instantTo(width());
    sync(0);

    const onScroll = () => {
      if (autoJumping) {
        return;
      }

      if (scrollEndTimer) {
        clearTimeout(
          scrollEndTimer
        );
      }

      scrollEndTimer =
        setTimeout(
          settle,
          90
        );
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

    const onNext = (event) => {
      event.preventDefault();

      if (
        currentRealIndex ===
        realCount - 1
      ) {
        setDot(0);
        loadAround(0);

        track.scrollTo({
          left:
            (realCount + 1) *
            width(),

          behavior: "smooth",
        });
      } else {
        goToReal(
          currentRealIndex + 1,
          true
        );
      }
    };

    const onPrev = (event) => {
      event.preventDefault();

      if (
        currentRealIndex === 0
      ) {
        setDot(realCount - 1);
        loadAround(realCount - 1);

        track.scrollTo({
          left: 0,
          behavior: "smooth",
        });
      } else {
        goToReal(
          currentRealIndex - 1,
          true
        );
      }
    };

    nextButton?.addEventListener(
      "click",
      onNext
    );

    prevButton?.addEventListener(
      "click",
      onPrev
    );

    cleanupFns.push(() =>
      nextButton?.removeEventListener(
        "click",
        onNext
      )
    );

    cleanupFns.push(() =>
      prevButton?.removeEventListener(
        "click",
        onPrev
      )
    );

    const onPointerUp = (event) => {
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

      if (!img) {
        return;
      }

      const slide =
        img.closest(
          "[data-wb-slide]"
        );

      const domIndex =
        allSlides.indexOf(slide);

      let realIndex;

      if (domIndex === 0) {
        realIndex =
          realCount - 1;
      } else if (
        domIndex ===
        realCount + 1
      ) {
        realIndex = 0;
      } else {
        realIndex =
          domIndex - 1;
      }

      event.preventDefault();
      event.stopPropagation();

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
      instantTo(
        (currentRealIndex + 1) *
        width()
      );

      sync(currentRealIndex);
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
      (cleanup) => cleanup()
    );

    cleanupFns = [];

    closeZoomCarousel();

    root.innerHTML = "";

    const template =
      isMobile
        ? tplMobile
        : tplDesktop;

    root.appendChild(
      template.content.cloneNode(
        true
      )
    );

    const activeRoot =
      isMobile
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

  closeZoomCarousel();
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
    mq.addListener(onMqChange);
  }
});
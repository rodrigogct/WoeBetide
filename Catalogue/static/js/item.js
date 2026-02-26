// item-zoom.js
document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("item-layout-root");
    const tplDesktop = document.getElementById("tpl-desktop");
    const tplMobile = document.getElementById("tpl-mobile");
    if (!root || !tplDesktop || !tplMobile) return;
  
    const mq = window.matchMedia("(max-width: 700px)");
  
    const ensureSrc = (img) => {
      if (!img) return;
      // If src is already there, do nothing
      if (img.getAttribute("src")) return;
      // Otherwise promote data-src -> src
      const ds = img.getAttribute("data-src");
      if (ds) img.setAttribute("src", ds);
    };
  
    // Overlay DOM is OUTSIDE templates (stays in page)
    const overlay = document.querySelector(".image-selector");
    const overlayImg =
      overlay?.querySelector("img.photo") || overlay?.querySelector("img");
    const closeButton = overlay?.querySelector("button.close");
  
    // Force safe initial hidden state so overlay NEVER blocks clicks
    if (overlay) {
      overlay.style.opacity = "0";
      overlay.style.pointerEvents = "none";
      overlay.style.display = "none";
    }
  
    // These are outside templates too, so OK to query once
    const catalogue = Array.from(document.querySelectorAll(".catalogue .elements"));
    const navbar = Array.from(document.querySelectorAll(".navbar"));
  
    let cleanupFns = [];
  
    const mount = (isMobile) => {
      // cleanup old listeners
      cleanupFns.forEach((fn) => fn());
      cleanupFns = [];
  
      // replace DOM with correct template
      root.innerHTML = "";
      root.appendChild((isMobile ? tplMobile : tplDesktop).content.cloneNode(true));
  
      const activeRoot = root.querySelector(".item") || root.querySelector(".item-carousel");
      if (!activeRoot) return;
  
      // IMPORTANT: query carousel arrows AFTER mount (they live inside template)
      const carouselControls = Array.from(
        activeRoot.querySelectorAll(".carousel-control-prev, .carousel-control-next")
      );
  
      // Activate first image(s) (for data-src images)
      const imgsWithDataSrc = Array.from(activeRoot.querySelectorAll("img[data-src]"));
      if (isMobile) {
        imgsWithDataSrc.slice(0, 1).forEach(ensureSrc);
      } else {
        imgsWithDataSrc.forEach(ensureSrc);
      }
  
      // Carousel lazy-load active + next on slide
      const carousel = activeRoot.querySelector("#carouselExampleAutoplaying");
      if (carousel) {
        ensureSrc(carousel.querySelector(".carousel-item.active img"));
        ensureSrc(
          carousel
            .querySelector(".carousel-item.active")
            ?.nextElementSibling?.querySelector("img")
        );
  
        const onSlide = (e) => {
          ensureSrc(e.relatedTarget?.querySelector("img"));
          ensureSrc(e.relatedTarget?.nextElementSibling?.querySelector("img"));
        };
  
        carousel.addEventListener("slide.bs.carousel", onSlide);
        cleanupFns.push(() => carousel.removeEventListener("slide.bs.carousel", onSlide));
      }
  
      // ===== ZOOM overlay wiring (robust + works on desktop & mobile) =====
  
      // Grab ALL images (no filtering—filtering can accidentally remove them)
      const clickableImgs = Array.from(
        activeRoot.querySelectorAll(".carousel-inner img, .images img")
      );
  
      let currentIndex = 0;
  
      const showImage = (index) => {
        if (!clickableImgs.length || !overlayImg) return;
  
        currentIndex = (index + clickableImgs.length) % clickableImgs.length;
        const img = clickableImgs[currentIndex];
  
        // ensure we have src (promote data-src)
        ensureSrc(img);
  
        const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
        overlayImg.src = src;
      };
  
      const openOverlay = (index) => {
        if (!overlay) return;
  
        // Make visible + clickable
        overlay.style.display = "block";
        overlay.style.opacity = "1";
        overlay.style.pointerEvents = "all";
        overlay.classList.add("active");
        document.body.classList.add("lock-scroll");
  
        showImage(index);
  
        // Hide Bootstrap carousel arrows + your other UI
        carouselControls.forEach((c) => (c.style.display = "none"));
        catalogue.forEach((c) => (c.style.display = "none"));
        navbar.forEach((n) => (n.style.display = "none"));
      };
  
      const closeOverlay = () => {
        if (!overlay) return;
  
        overlay.style.opacity = "0";
        overlay.style.pointerEvents = "none";
        overlay.style.display = "none";
        overlay.classList.remove("active");
        document.body.classList.remove("lock-scroll");
  
        // restore arrows (empty string lets CSS decide)
        carouselControls.forEach((c) => (c.style.display = ""));
        catalogue.forEach((c) => (c.style.display = ""));
        navbar.forEach((n) => (n.style.display = ""));
      };
  
      // Keep your inline onclick working
      window.prevImage = () => showImage(currentIndex - 1);
      window.nextImage = () => showImage(currentIndex + 1);
  
      // Close button
      if (closeButton) closeButton.onclick = closeOverlay;
  
      // ESC to close
      const onKeyDown = (e) => {
        if (e.key === "Escape") closeOverlay();
      };
      document.addEventListener("keydown", onKeyDown);
      cleanupFns.push(() => document.removeEventListener("keydown", onKeyDown));
  
      // Click outside image to close (but not when clicking the image or zoom arrows)
      const onOverlayClick = (e) => {
        if (!overlay) return;
        const clickedInside =
          e.target === overlayImg || e.target.closest(".zoomed-carousel-controls");
        if (!clickedInside) closeOverlay();
      };
      if (overlay) {
        overlay.addEventListener("click", onOverlayClick);
        cleanupFns.push(() => overlay.removeEventListener("click", onOverlayClick));
      }
  
      // ONE delegated handler that works even if nodes get replaced
      // Use CAPTURE so Bootstrap carousel doesn't swallow the event first
      const onRootClick = (e) => {
        const img = e.target.closest(".carousel-inner img, .images img");
        if (!img) return;
  
        // If overlay is open, ignore clicks behind it
        if (overlay && overlay.style.display === "block") return;
  
        e.preventDefault();
        e.stopPropagation();
  
        // ensure src before we copy it into overlay
        ensureSrc(img);
  
        const index = clickableImgs.indexOf(img);
        openOverlay(index === -1 ? 0 : index);
      };
  
      activeRoot.addEventListener("click", onRootClick, { capture: true });
      cleanupFns.push(() =>
        activeRoot.removeEventListener("click", onRootClick, { capture: true })
      );
  
      // (Optional) Also open on keyboard "Enter" when image focused
      const onRootKey = (e) => {
        if (e.key !== "Enter") return;
        const img = e.target.closest(".carousel-inner img, .images img");
        if (!img) return;
  
        e.preventDefault();
        e.stopPropagation();
  
        ensureSrc(img);
        const index = clickableImgs.indexOf(img);
        openOverlay(index === -1 ? 0 : index);
      };
  
      activeRoot.addEventListener("keydown", onRootKey, { capture: true });
      cleanupFns.push(() =>
        activeRoot.removeEventListener("keydown", onRootKey, { capture: true })
      );
    };
  
    // initial mount
    mount(mq.matches);
  
    // remount on breakpoint change
    mq.addEventListener("change", (e) => mount(e.matches));
  });


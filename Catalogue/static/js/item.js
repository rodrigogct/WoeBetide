// item-zoom.js (drop-in, backdrop-based, works on desktop + mobile)

document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("item-layout-root");
    const tplDesktop = document.getElementById("tpl-desktop");
    const tplMobile = document.getElementById("tpl-mobile");
    if (!root || !tplDesktop || !tplMobile) {
      console.warn("[zoom] missing root/template nodes");
      return;
    }
  
    const overlay = document.querySelector(".image-selector");
    if (!overlay) {
      console.warn("[zoom] missing .image-selector overlay");
      return;
    }
  
    const overlayImg = overlay.querySelector("img.photo") || overlay.querySelector("img");
    const closeButton = overlay.querySelector("button.close");
  
    // --- HARD GUARANTEE: add a backdrop div that always receives clicks ---
    let backdrop = overlay.querySelector(".zoom-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "zoom-backdrop";
      overlay.prepend(backdrop); // behind everything else (CSS will handle z-index)
    }
  
    // Ensure overlay starts fully inactive and never blocks page
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
  
    const ensureSrc = (img) => {
      if (!img) return;
      if (img.getAttribute("src")) return;
      const ds = img.getAttribute("data-src");
      if (ds) img.setAttribute("src", ds);
    };
  
    const catalogue = Array.from(document.querySelectorAll(".catalogue .elements"));
    const navbar = Array.from(document.querySelectorAll(".navbar"));
  
    const mq = window.matchMedia("(max-width: 700px)");
    let cleanupFns = [];
  
    const mount = (isMobile) => {
      cleanupFns.forEach((fn) => fn());
      cleanupFns = [];
  
      // Swap layout
      root.innerHTML = "";
      root.appendChild((isMobile ? tplMobile : tplDesktop).content.cloneNode(true));
  
      const activeRoot = root.querySelector(".item") || root.querySelector(".item-carousel");
      if (!activeRoot) return;
  
      // Find carousel controls in the mounted template (to hide them during zoom)
      const carouselControls = Array.from(
        activeRoot.querySelectorAll(".carousel-control-prev, .carousel-control-next")
      );
  
      // Load initial images
      const imgsWithDataSrc = Array.from(activeRoot.querySelectorAll("img[data-src]"));
      if (isMobile) imgsWithDataSrc.slice(0, 1).forEach(ensureSrc);
      else imgsWithDataSrc.forEach(ensureSrc);
  
      // Bootstrap carousel lazy-load
      const carousel = activeRoot.querySelector("#carouselExampleAutoplaying");
      if (carousel) {
        const onSlide = (e) => {
          ensureSrc(e.relatedTarget?.querySelector("img"));
          ensureSrc(e.relatedTarget?.nextElementSibling?.querySelector("img"));
        };
        carousel.addEventListener("slide.bs.carousel", onSlide);
        cleanupFns.push(() => carousel.removeEventListener("slide.bs.carousel", onSlide));
      }
  
      const clickableImgs = Array.from(
        activeRoot.querySelectorAll(".carousel-inner img, .images img")
      );
  
      let currentIndex = 0;
  
      const showImage = (index) => {
        if (!clickableImgs.length || !overlayImg) return;
        currentIndex = (index + clickableImgs.length) % clickableImgs.length;
  
        const img = clickableImgs[currentIndex];
        ensureSrc(img);
  
        const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
        overlayImg.src = src;
      };
  
      const openOverlay = (index) => {
        setOverlayOpen();
        showImage(index);
  
        // Hide UI behind
        carouselControls.forEach((c) => (c.style.display = "none"));
        catalogue.forEach((c) => (c.style.display = "none"));
        navbar.forEach((n) => (n.style.display = "none"));
      };
  
      const closeOverlay = () => {
        setOverlayClosed();
  
        // Restore UI behind
        carouselControls.forEach((c) => (c.style.display = ""));
        catalogue.forEach((c) => (c.style.display = ""));
        navbar.forEach((n) => (n.style.display = ""));
      };
  
      // Expose your inline controls
      window.prevImage = () => showImage(currentIndex - 1);
      window.nextImage = () => showImage(currentIndex + 1);
  
      // Close mechanisms that cannot fail:
      // 1) Backdrop click
      const onBackdropClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeOverlay();
      };
      backdrop.addEventListener("click", onBackdropClick);
      cleanupFns.push(() => backdrop.removeEventListener("click", onBackdropClick));
  
      // 2) Close button
      if (closeButton) closeButton.onclick = closeOverlay;
  
      // 3) ESC
      const onKeyDown = (e) => {
        if (e.key === "Escape") closeOverlay();
      };
      document.addEventListener("keydown", onKeyDown);
      cleanupFns.push(() => document.removeEventListener("keydown", onKeyDown));
  
      // OPEN: use CAPTURE so Bootstrap / other handlers don’t swallow it
      const onRootPointerUp = (e) => {
        // If overlay already open, ignore clicks behind
        if (overlay.style.display === "block") return;
  
        const img = e.target.closest(".carousel-inner img, .images img");
        if (!img) return;
  
        e.preventDefault();
        e.stopPropagation();
  
        const index = clickableImgs.indexOf(img);
        openOverlay(index === -1 ? 0 : index);
      };
  
      activeRoot.addEventListener("pointerup", onRootPointerUp, { capture: true });
      cleanupFns.push(() =>
        activeRoot.removeEventListener("pointerup", onRootPointerUp, { capture: true })
      );
    };
  
    mount(mq.matches);
    mq.addEventListener("change", (e) => mount(e.matches));
  });
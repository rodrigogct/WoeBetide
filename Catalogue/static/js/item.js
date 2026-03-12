// item-zoom.js
// desktop = tpl-desktop
// mobile  = tpl-unified-v2

document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("item-layout-root-v2");
    const tplDesktop = document.getElementById("tpl-desktop");
    const tplMobile = document.getElementById("tpl-unified-v2");
  
    if (!root || !tplDesktop || !tplMobile) {
      console.warn("[zoom] missing root/template nodes");
      return;
    }
  
    const overlay = document.querySelector(".image-selector-v2");
    if (!overlay) {
      console.warn("[zoom] missing .image-selector-v2 overlay");
      return;
    }
  
    const overlayImg =
      overlay.querySelector("img.photo-v2") ||
      overlay.querySelector("img.photo") ||
      overlay.querySelector("img");
  
    const closeButton =
      overlay.querySelector("button.close-v2") ||
      overlay.querySelector("button.close");
  
    let backdrop = overlay.querySelector(".zoom-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "zoom-backdrop";
      overlay.prepend(backdrop);
    }
  
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
  
      root.innerHTML = "";
      root.appendChild((isMobile ? tplMobile : tplDesktop).content.cloneNode(true));
  
      const activeRoot =
        root.querySelector(".item-carousel-v2") ||
        root.querySelector(".item-carousel") ||
        root.querySelector(".item");
  
      if (!activeRoot) return;
  
      const carouselControls = Array.from(
        activeRoot.querySelectorAll(
          ".carousel-control-prev, .carousel-control-next, [data-wb-prev], [data-wb-next]"
        )
      );
  
      const imgsWithDataSrc = Array.from(activeRoot.querySelectorAll("img[data-src]"));
  
      if (isMobile) {
        imgsWithDataSrc.slice(0, 1).forEach(ensureSrc);
      } else {
        imgsWithDataSrc.forEach(ensureSrc);
      }
  
      const carousel = activeRoot.querySelector("#carouselExampleAutoplaying");
      if (carousel) {
        const onSlide = (e) => {
          ensureSrc(e.relatedTarget?.querySelector("img"));
          ensureSrc(e.relatedTarget?.nextElementSibling?.querySelector("img"));
        };
  
        carousel.addEventListener("slide.bs.carousel", onSlide);
        cleanupFns.push(() => carousel.removeEventListener("slide.bs.carousel", onSlide));
      }
  
      let clickableImgs = [];
  
      if (isMobile) {
        clickableImgs = Array.from(activeRoot.querySelectorAll("[data-wb-slide] img"));
      } else {
        clickableImgs = Array.from(activeRoot.querySelectorAll(".images img"));
      }
  
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
  
        carouselControls.forEach((c) => (c.style.display = "none"));
        catalogue.forEach((c) => (c.style.display = "none"));
        navbar.forEach((n) => (n.style.display = "none"));
      };
  
      const closeOverlay = () => {
        setOverlayClosed();
  
        carouselControls.forEach((c) => (c.style.display = ""));
        catalogue.forEach((c) => (c.style.display = ""));
        navbar.forEach((n) => (n.style.display = ""));
      };
  
      window.prevImageV2 = () => showImage(currentIndex - 1);
      window.nextImageV2 = () => showImage(currentIndex + 1);
  
      const onBackdropClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeOverlay();
      };
      backdrop.addEventListener("click", onBackdropClick);
      cleanupFns.push(() => backdrop.removeEventListener("click", onBackdropClick));
  
      if (closeButton) {
        closeButton.onclick = closeOverlay;
        cleanupFns.push(() => {
          closeButton.onclick = null;
        });
      }
  
      const onKeyDown = (e) => {
        if (e.key === "Escape") closeOverlay();
        if (overlay.style.display === "block" && e.key === "ArrowLeft") showImage(currentIndex - 1);
        if (overlay.style.display === "block" && e.key === "ArrowRight") showImage(currentIndex + 1);
      };
      document.addEventListener("keydown", onKeyDown);
      cleanupFns.push(() => document.removeEventListener("keydown", onKeyDown));
  
      const onRootPointerUp = (e) => {
        if (overlay.style.display === "block") return;
  
        const img = isMobile
          ? e.target.closest("[data-wb-slide] img, .images img")
          : e.target.closest(".images img");
  
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
  
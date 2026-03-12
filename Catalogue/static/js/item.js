// item-zoom.js (V2 only)

document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("item-layout-root-v2");
    const tpl = document.getElementById("tpl-unified-v2");
  
    if (!root || !tpl) {
      console.warn("[zoom] missing V2 root/template nodes");
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
  
    let cleanupFns = [];
    let currentIndex = 0;
    let clickableImgs = [];
  
    const mount = () => {
      cleanupFns.forEach((fn) => fn());
      cleanupFns = [];
  
      root.innerHTML = "";
      root.appendChild(tpl.content.cloneNode(true));
  
      const activeRoot = root.querySelector(".item-carousel-v2");
      if (!activeRoot) {
        console.warn("[zoom] missing mounted .item-carousel-v2");
        return;
      }
  
      const track = activeRoot.querySelector("[data-wb-track]");
      if (!track) {
        console.warn("[zoom] missing [data-wb-track]");
        return;
      }
  
      const prevBtn = activeRoot.querySelector("[data-wb-prev]");
      const nextBtn = activeRoot.querySelector("[data-wb-next]");
  
      clickableImgs = Array.from(track.querySelectorAll("[data-wb-slide] img"));
  
      // initial load: first image only
      ensureSrc(clickableImgs[0]);
  
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
  
        if (prevBtn) prevBtn.style.display = "none";
        if (nextBtn) nextBtn.style.display = "none";
        catalogue.forEach((c) => (c.style.display = "none"));
        navbar.forEach((n) => (n.style.display = "none"));
      };
  
      const closeOverlay = () => {
        setOverlayClosed();
  
        if (prevBtn) prevBtn.style.display = "";
        if (nextBtn) nextBtn.style.display = "";
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
        if (e.key === "ArrowLeft" && overlay.style.display === "block") showImage(currentIndex - 1);
        if (e.key === "ArrowRight" && overlay.style.display === "block") showImage(currentIndex + 1);
      };
      document.addEventListener("keydown", onKeyDown);
      cleanupFns.push(() => document.removeEventListener("keydown", onKeyDown));
  
      const onRootPointerUp = (e) => {
        if (overlay.style.display === "block") return;
  
        const img = e.target.closest("[data-wb-slide] img, .images img");
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
  
      // Optional arrow behavior for non-touch / desktop
      const goToIndex = (index) => {
        if (!track || !clickableImgs.length) return;
  
        currentIndex = (index + clickableImgs.length) % clickableImgs.length;
  
        ensureSrc(clickableImgs[currentIndex]);
        ensureSrc(clickableImgs[currentIndex + 1]);
  
        const slide = clickableImgs[currentIndex].closest("[data-wb-slide]");
        if (slide) {
          slide.scrollIntoView({
            behavior: "smooth",
            inline: "start",
            block: "nearest",
          });
        }
      };
  
      if (prevBtn) {
        const onPrev = () => goToIndex(currentIndex - 1);
        prevBtn.addEventListener("click", onPrev);
        cleanupFns.push(() => prevBtn.removeEventListener("click", onPrev));
      }
  
      if (nextBtn) {
        const onNext = () => goToIndex(currentIndex + 1);
        nextBtn.addEventListener("click", onNext);
        cleanupFns.push(() => nextBtn.removeEventListener("click", onNext));
      }
    };
  
    mount();
  });
  
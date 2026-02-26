document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("item-layout-root");
    const tplDesktop = document.getElementById("tpl-desktop");
    const tplMobile = document.getElementById("tpl-mobile");
    if (!root || !tplDesktop || !tplMobile) return;
  
    const mq = window.matchMedia("(max-width: 700px)");
  
    const ensureSrc = (img) => {
      if (!img) return;
      if (img.getAttribute("src")) return;
      const ds = img.getAttribute("data-src");
      if (ds) img.setAttribute("src", ds);
    };
  
    // Overlay DOM is OUTSIDE templates
    const overlay = document.querySelector(".image-selector");
    const overlayImg = overlay?.querySelector("img.photo") || overlay?.querySelector("img");
    const closeButton = overlay?.querySelector("button.close"); // <-- scope it to overlay
  
    // Force a safe initial hidden state so overlay NEVER blocks clicks
    if (overlay) {
      overlay.style.opacity = "0";
      overlay.style.pointerEvents = "none";
      overlay.style.display = "none";
    }
  
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
  
      // Activate first image(s)
      const imgsWithDataSrc = Array.from(activeRoot.querySelectorAll("img[data-src]"));
      if (isMobile) {
        imgsWithDataSrc.slice(0, 1).forEach(ensureSrc);
      } else {
        imgsWithDataSrc.forEach(ensureSrc); // load all on desktop
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
  
      // Zoom overlay wiring
      // More robust selector: include carousel images even if markup changed
      const clickableImgs = Array.from(
        activeRoot.querySelectorAll(".carousel-inner img, .images img")
      ).filter((img) => img && (img.getAttribute("data-src") || img.getAttribute("src")));
  
      let currentIndex = 0;
  
      const showImage = (index) => {
        if (!clickableImgs.length || !overlayImg) return;
  
        currentIndex = (index + clickableImgs.length) % clickableImgs.length;
  
        const img = clickableImgs[currentIndex];
        ensureSrc(img);
  
        // If you use Cloudinary transformations, src should now exist after ensureSrc
        const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
        overlayImg.src = src;
      };
  
      const openOverlay = (index) => {
        if (!overlay) return;
  
        // Make visible + clickable
        overlay.style.display = "block";
        overlay.style.opacity = "1";
        overlay.style.pointerEvents = "all";
        overlay.classList.add("active"); // harmless if you keep/ignore it
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
  
      // Attach click listeners
      clickableImgs.forEach((img, i) => {
        const onClick = (e) => {
          // Prevent carousel drag/click weirdness
          e.preventDefault();
          e.stopPropagation();
          openOverlay(i);
        };
        img.addEventListener("click", onClick, { passive: false });
        cleanupFns.push(() => img.removeEventListener("click", onClick));
      });
  
      // Close button
      if (closeButton) {
        closeButton.onclick = closeOverlay; // overwrites safely each mount
      }
  
      // Optional: ESC to close
      const onKeyDown = (e) => {
        if (e.key === "Escape") closeOverlay();
      };
      document.addEventListener("keydown", onKeyDown);
      cleanupFns.push(() => document.removeEventListener("keydown", onKeyDown));
  
      // Optional: click outside image to close (only if you want)
      // Make sure it doesn't close when clicking the image or buttons
      const onOverlayClick = (e) => {
        if (!overlay) return;
        const clickedInsideImage = e.target === overlayImg || e.target.closest(".zoomed-carousel-controls");
        if (!clickedInsideImage) closeOverlay();
      };
      if (overlay) {
        overlay.addEventListener("click", onOverlayClick);
        cleanupFns.push(() => overlay.removeEventListener("click", onOverlayClick));
      }
    };
  
    // initial mount
    mount(mq.matches);
  
    // remount on breakpoint change
    mq.addEventListener("change", (e) => mount(e.matches));
  });




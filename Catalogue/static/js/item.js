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
    const overlayImg =
      overlay?.querySelector("img.photo") || overlay?.querySelector("img");
    const closeButton = document.querySelector(".close");
  
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
      const imgs = Array.from(activeRoot.querySelectorAll(".images img[data-src]"));
      if (isMobile) {
        imgs.slice(0, 1).forEach(ensureSrc);
      } else {
        imgs.forEach(ensureSrc); // load all on desktop
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
      const clickableImgs = Array.from(activeRoot.querySelectorAll(".images img"));
      let currentIndex = 0;
  
      const showImage = (index) => {
        if (!clickableImgs.length || !overlayImg) return;
        currentIndex = (index + clickableImgs.length) % clickableImgs.length;
        const img = clickableImgs[currentIndex];
        ensureSrc(img);
        overlayImg.src = img.getAttribute("src") || "";
      };
  
      const openOverlay = (index) => {
        if (!overlay) return;
  
        overlay.style.opacity = 1;
        overlay.style.pointerEvents = "all";
        overlay.classList.add("active"); // harmless if you keep/ignore it
        document.body.classList.add("lock-scroll");
  
        showImage(index);
  
        // hide Bootstrap carousel arrows
        carouselControls.forEach((c) => (c.style.display = "none"));
        catalogue.forEach((c) => (c.style.display = "none"));
        navbar.forEach((n) => (n.style.display = "none"));
      };
  
      const closeOverlay = () => {
        if (!overlay) return;
  
        overlay.style.opacity = 0;
        overlay.style.pointerEvents = "none";
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
  
      clickableImgs.forEach((img, i) => {
        const onClick = () => openOverlay(i);
        img.addEventListener("click", onClick);
        cleanupFns.push(() => img.removeEventListener("click", onClick));
      });
  
      if (closeButton) {
        closeButton.onclick = closeOverlay; // overwrites safely each mount
      }
  
      // Optional: close overlay when clicking background (if you want)
      // if (overlay) overlay.addEventListener("click", closeOverlay);
    };
  
    // initial mount
    mount(mq.matches);
  
    // remount on breakpoint change
    mq.addEventListener("change", (e) => mount(e.matches));
  });
  




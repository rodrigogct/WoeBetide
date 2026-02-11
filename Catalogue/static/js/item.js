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
  
    // --- Zoom overlay DOM is OUTSIDE templates, so we can wire it each mount ---
    const overlay = document.querySelector(".image-selector");
    const overlayImg = overlay?.querySelector("img.photo") || overlay?.querySelector("img");
    const closeButton = document.querySelector(".close");
    const carouselControls = Array.from(document.querySelectorAll(".carousel-control-prev, .carousel-control-next"));
    const catalogue = Array.from(document.querySelectorAll(".catalogue .elements"));
    const navbar = Array.from(document.querySelectorAll(".navbar"));
  
    let cleanupFns = [];
  
    const mount = (isMobile) => {
      // cleanup old listeners
      cleanupFns.forEach(fn => fn());
      cleanupFns = [];
  
      // replace DOM with correct template
      root.innerHTML = "";
      root.appendChild((isMobile ? tplMobile : tplDesktop).content.cloneNode(true));
  
      const activeRoot = root.querySelector(".item") || root.querySelector(".item-carousel");
      if (!activeRoot) return;
  
      // Activate first image(s)
      const imgs = Array.from(activeRoot.querySelectorAll(".images img[data-src]"));
      imgs.slice(0, isMobile ? 1 : 2).forEach(ensureSrc);
  
      // Carousel lazy-load active + next on slide
      const carousel = activeRoot.querySelector("#carouselExampleAutoplaying");
      if (carousel) {
        ensureSrc(carousel.querySelector(".carousel-item.active img"));
        ensureSrc(carousel.querySelector(".carousel-item.active")?.nextElementSibling?.querySelector("img"));
  
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
        document.body.classList.add("lock-scroll");
  
        showImage(index);
  
        carouselControls.forEach(c => c.style.display = "none");
        catalogue.forEach(c => c.style.display = "none");
        navbar.forEach(n => n.style.display = "none");
      };
  
      const closeOverlay = () => {
        if (!overlay) return;
        overlay.style.opacity = 0;
        overlay.style.pointerEvents = "none";
        document.body.classList.remove("lock-scroll");
  
        carouselControls.forEach(c => c.style.display = "block");
        catalogue.forEach(c => c.style.display = "block");
        navbar.forEach(n => n.style.display = "block");
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
        closeButton.onclick = closeOverlay; // simplest: overwrites safely each mount
      }
    };
  
    // initial mount
    mount(mq.matches);
  
    // remount on breakpoint change (DevTools / orientation change)
    mq.addEventListener("change", (e) => mount(e.matches));
  });
  




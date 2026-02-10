document.addEventListener("DOMContentLoaded", () => {
    const mqMobile = window.matchMedia("(max-width: 700px)");
  
    const desktopImgs = Array.from(document.querySelectorAll(".item .images img"));
    const mobileImgs  = Array.from(document.querySelectorAll(".item-carousel .images img"));
  
    const mainContainer = document.querySelector(".image-selector");
    if (!mainContainer) return;
  
    const secondImage = mainContainer.querySelector("img");
    const closeButton = document.querySelector(".close");
    const carouselControls = Array.from(document.querySelectorAll(".carousel-control-prev, .carousel-control-next"));
    const catalogue = Array.from(document.querySelectorAll(".catalogue .elements"));
    const navbar = Array.from(document.querySelectorAll(".navbar"));
  
    let currentIndex = 0;
    let currentList = mqMobile.matches ? mobileImgs : desktopImgs;
  
    const ensureSrc = (img) => {
      if (!img) return;
      if (img.getAttribute("src")) return;
      const ds = img.getAttribute("data-src");
      if (ds) img.setAttribute("src", ds);
    };
  
    const showImage = (index) => {
      currentList = mqMobile.matches ? mobileImgs : desktopImgs;
      if (!currentList.length) return;
  
      currentIndex = (index + currentList.length) % currentList.length;
      const clicked = currentList[currentIndex];
  
      ensureSrc(clicked);
      secondImage.src = clicked.getAttribute("src") || "";
    };
  
    const openOverlay = (index) => {
      mainContainer.style.opacity = 1;
      mainContainer.style.pointerEvents = "all";
      document.body.classList.add("lock-scroll");
  
      showImage(index);
  
      carouselControls.forEach(c => c.style.display = "none");
      catalogue.forEach(c => c.style.display = "none");
      navbar.forEach(n => n.style.display = "none");
    };
  
    const closeOverlay = () => {
      mainContainer.style.opacity = 0;
      mainContainer.style.pointerEvents = "none";
      document.body.classList.remove("lock-scroll");
  
      carouselControls.forEach(c => c.style.display = "block");
      catalogue.forEach(c => c.style.display = "block");
      navbar.forEach(n => n.style.display = "block");
    };
  
    // Make prev / next buttons work
    window.prevImage = () => showImage(currentIndex - 1);
    window.nextImage = () => showImage(currentIndex + 1);
  
    // Desktop clicks
    desktopImgs.forEach((img, index) => {
      img.addEventListener("click", () => openOverlay(index));
    });
  
    // Mobile clicks
    mobileImgs.forEach((img, index) => {
      img.addEventListener("click", () => openOverlay(index));
    });
  
    if (closeButton) closeButton.addEventListener("click", closeOverlay);
  
    // -------- Layout-based image loading --------
  
    const activateImages = (imgs, { eagerFirstN = 1 } = {}) => {
      imgs.forEach((img, i) => {
        const ds = img.getAttribute("data-src");
        if (!ds) return;
  
        if (!img.getAttribute("src")) {
          img.setAttribute("decoding", "async");
          if (i < eagerFirstN) {
            img.setAttribute("loading", "eager");
            img.setAttribute("fetchpriority", i === 0 ? "high" : "auto");
          } else {
            img.setAttribute("loading", "lazy");
            img.setAttribute("fetchpriority", "low");
          }
          img.setAttribute("src", ds);
        }
      });
    };
  
    const deactivateImages = (imgs) => {
      imgs.forEach(img => {
        const src = img.getAttribute("src");
        if (src) {
          img.setAttribute("data-src", img.getAttribute("data-src") || src);
          img.removeAttribute("src");
        }
      });
    };
  
    const applyLayoutLoading = () => {
      if (mqMobile.matches) {
        deactivateImages(desktopImgs);
        activateImages(mobileImgs, { eagerFirstN: 1 });
        currentList = mobileImgs;
      } else {
        deactivateImages(mobileImgs);
        activateImages(desktopImgs, { eagerFirstN: 2 });
        currentList = desktopImgs;
      }
    };
  
    applyLayoutLoading();
    mqMobile.addEventListener("change", applyLayoutLoading);
  });
  



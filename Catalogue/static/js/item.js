document.addEventListener("DOMContentLoaded", () => {
  // ---------- 1) inject correct layout ----------
  const root = document.getElementById("item-layout-root");
  const tplDesktop = document.getElementById("tpl-desktop");
  const tplMobile = document.getElementById("tpl-mobile");
  if (!root || !tplDesktop || !tplMobile) return;

  const isMobile = window.matchMedia("(max-width: 700px)").matches;
  root.appendChild((isMobile ? tplMobile : tplDesktop).content.cloneNode(true));

  // ---------- helpers ----------
  const ensureSrc = (img) => {
    if (!img) return;
    if (img.getAttribute("src")) return;
    const ds = img.getAttribute("data-src");
    if (ds) img.setAttribute("src", ds);
  };

  // ---------- 2) activate first image(s) ----------
  const activeRoot = root.querySelector(".item") || root.querySelector(".item-carousel");
  if (!activeRoot) return;

  const imgs = Array.from(activeRoot.querySelectorAll(".images img[data-src]"));
  // desktop grid: 2 eager, mobile carousel: 1 eager
  imgs.slice(0, isMobile ? 1 : 2).forEach(ensureSrc);

  // ---------- 3) if carousel exists, lazy-load active + next on slide ----------
  const carousel = document.getElementById("carouselExampleAutoplaying");
  if (carousel) {
    ensureSrc(carousel.querySelector(".carousel-item.active img"));
    ensureSrc(carousel.querySelector(".carousel-item.active")?.nextElementSibling?.querySelector("img"));

    carousel.addEventListener("slide.bs.carousel", (e) => {
      ensureSrc(e.relatedTarget?.querySelector("img"));
      ensureSrc(e.relatedTarget?.nextElementSibling?.querySelector("img"));
    });
  }

  // ---------- 4) zoom overlay wiring ----------
  const mainContainer = document.querySelector(".image-selector");
  if (!mainContainer) return;

  const secondImage = mainContainer.querySelector("img");
  const closeButton = document.querySelector(".close");
  const carouselControls = Array.from(document.querySelectorAll(".carousel-control-prev, .carousel-control-next"));
  const catalogue = Array.from(document.querySelectorAll(".catalogue .elements"));
  const navbar = Array.from(document.querySelectorAll(".navbar"));

  const clickableImgs = Array.from(activeRoot.querySelectorAll(".images img"));
  let currentIndex = 0;

  const showImage = (index) => {
    if (!clickableImgs.length) return;
    currentIndex = (index + clickableImgs.length) % clickableImgs.length;
    const img = clickableImgs[currentIndex];
    ensureSrc(img);
    secondImage.src = img.getAttribute("src") || "";
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

  // keep your existing onclick="prevImage()" / nextImage() working
  window.prevImage = () => showImage(currentIndex - 1);
  window.nextImage = () => showImage(currentIndex + 1);

  clickableImgs.forEach((img, i) => img.addEventListener("click", () => openOverlay(i)));
  if (closeButton) closeButton.addEventListener("click", closeOverlay);
});




document.addEventListener('DOMContentLoaded', () => {
  const wrap = document.querySelector('.wb-scroller-wrap');
  if (!wrap) return;

  const scroller = wrap.querySelector('.block.container-xxxl');
  const nextBtn = wrap.querySelector('.wb-next-btn');
  if (!scroller || !nextBtn) return;

  const MOBILE_BP = 600;
  const originalHTML = scroller.innerHTML;

  let cleanup = null;

  function isMobile() {
    return window.innerWidth <= MOBILE_BP;
  }

  function getSlides() {
    return Array.from(scroller.querySelectorAll(':scope > .col'));
  }

  function getStep() {
    const slides = getSlides();
    if (slides.length < 2) {
      return slides[0]?.getBoundingClientRect().width || 0;
    }
    return slides[1].offsetLeft - slides[0].offsetLeft;
  }

  function setScrollInstant(left) {
    scroller.style.scrollBehavior = 'auto';
    scroller.scrollLeft = left;
    scroller.offsetHeight;
    scroller.style.scrollBehavior = 'smooth';
  }

  function destroyLoop() {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    scroller.innerHTML = originalHTML;
    scroller.style.scrollBehavior = '';
    scroller.scrollLeft = 0;
  }

  function initLoop() {
    if (!isMobile()) {
      destroyLoop();
      return;
    }

    destroyLoop();

    const realSlides = getSlides();
    const realCount = realSlides.length;
    if (realCount <= 1) return;

    const fragStart = document.createDocumentFragment();
    const fragEnd = document.createDocumentFragment();

    realSlides.forEach(slide => {
      const endClone = slide.cloneNode(true);
      endClone.setAttribute('aria-hidden', 'true');
      endClone.classList.add('is-clone');
      fragEnd.appendChild(endClone);
    });

    [...realSlides].reverse().forEach(slide => {
      const startClone = slide.cloneNode(true);
      startClone.setAttribute('aria-hidden', 'true');
      startClone.classList.add('is-clone');
      fragStart.insertBefore(startClone, fragStart.firstChild);
    });

    scroller.insertBefore(fragStart, scroller.firstChild);
    scroller.appendChild(fragEnd);

    let isAdjusting = false;
    let scrollTimer = null;
    let clickLocked = false;

    function resetToRealZone() {
      if (isAdjusting) return;

      const step = getStep();
      if (!step) return;

      const startReal = step * realCount;
      const endReal = step * realCount * 2;
      const x = scroller.scrollLeft;

      if (x < startReal - step / 2) {
        isAdjusting = true;
        setScrollInstant(x + step * realCount);
        isAdjusting = false;
      } else if (x >= endReal - step / 2) {
        isAdjusting = true;
        setScrollInstant(x - step * realCount);
        isAdjusting = false;
      }
    }

    requestAnimationFrame(() => {
      const step = getStep();
      if (!step) return;
      setScrollInstant(step * realCount);
    });

    function onScroll() {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        resetToRealZone();
        clickLocked = false;
      }, 90);
    }

    function onNextClick() {
      if (clickLocked) return;

      const step = getStep();
      if (!step) return;

      clickLocked = true;
      scroller.scrollBy({
        left: step,
        behavior: 'smooth'
      });
    }

    scroller.addEventListener('scroll', onScroll, { passive: true });
    nextBtn.addEventListener('click', onNextClick);

    cleanup = () => {
      clearTimeout(scrollTimer);
      scroller.removeEventListener('scroll', onScroll);
      nextBtn.removeEventListener('click', onNextClick);
    };
  }

  initLoop();

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      initLoop();
    }, 150);
  });
});




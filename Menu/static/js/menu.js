document.addEventListener('DOMContentLoaded', () => {
  const wrap = document.querySelector('.wb-scroller-wrap');
  if (!wrap) return;

  const scroller = wrap.querySelector('.block.container-xxxl');
  const nextBtn = wrap.querySelector('.wb-next-btn');
  if (!scroller || !nextBtn) return;

  if (window.innerWidth > 600) return;

  const originalSlides = Array.from(scroller.children);
  const realCount = originalSlides.length;
  if (realCount <= 1) return;

  let isAdjusting = false;
  let clickLocked = false;
  let scrollTimer = null;

  // clone end
  originalSlides.forEach(slide => {
    const clone = slide.cloneNode(true);
    clone.classList.add('is-clone');
    clone.setAttribute('aria-hidden', 'true');
    scroller.appendChild(clone);
  });

  // clone start
  [...originalSlides].reverse().forEach(slide => {
    const clone = slide.cloneNode(true);
    clone.classList.add('is-clone');
    clone.setAttribute('aria-hidden', 'true');
    scroller.insertBefore(clone, scroller.firstChild);
  });

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

  function setInstantScroll(left) {
    scroller.style.scrollBehavior = 'auto';
    scroller.scrollLeft = left;
    scroller.offsetHeight;
    scroller.style.scrollBehavior = 'smooth';
  }

  function moveToRealStart() {
    const step = getStep();
    if (!step) return;
    setInstantScroll(step * realCount);
  }

  function normalizeLoop() {
    if (isAdjusting) return;

    const step = getStep();
    if (!step) return;

    const startReal = step * realCount;
    const endReal = step * realCount * 2;
    const current = scroller.scrollLeft;

    if (current < startReal - step / 2) {
      isAdjusting = true;
      setInstantScroll(current + step * realCount);
      isAdjusting = false;
    } else if (current >= endReal - step / 2) {
      isAdjusting = true;
      setInstantScroll(current - step * realCount);
      isAdjusting = false;
    }
  }

  requestAnimationFrame(() => {
    moveToRealStart();
  });

  scroller.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      normalizeLoop();
      clickLocked = false;
    }, 80);
  }, { passive: true });

  nextBtn.addEventListener('click', () => {
    if (clickLocked) return;

    const step = getStep();
    if (!step) return;

    clickLocked = true;
    scroller.scrollBy({
      left: step,
      behavior: 'smooth'
    });
  });
});




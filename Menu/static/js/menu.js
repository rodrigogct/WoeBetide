document.addEventListener('DOMContentLoaded', () => {
  const wrap = document.querySelector('.wb-scroller-wrap');
  if (!wrap) return;

  const scroller = wrap.querySelector('.block.container-xxxl');
  const nextBtn = wrap.querySelector('.wb-next-btn');
  if (!scroller || !nextBtn) return;

  const originalItems = Array.from(scroller.querySelectorAll('.col'));
  const originalCount = originalItems.length;
  if (!originalCount) return;

  let isResetting = false;
  let isAnimating = false;

  // Clone all items to the front
  originalItems.slice().reverse().forEach(item => {
    const clone = item.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    clone.classList.add('is-clone');
    scroller.prepend(clone);
  });

  // Clone all items to the end
  originalItems.forEach(item => {
    const clone = item.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    clone.classList.add('is-clone');
    scroller.appendChild(clone);
  });

  const getAllItems = () => Array.from(scroller.querySelectorAll('.col'));

  const getStep = () => {
    const items = getAllItems();
    if (!items.length) return 0;

    const first = items[0];
    const styles = window.getComputedStyle(first);
    const marginLeft = parseFloat(styles.marginLeft) || 0;
    const marginRight = parseFloat(styles.marginRight) || 0;

    return first.getBoundingClientRect().width + marginLeft + marginRight;
  };

  const jumpTo = (left) => {
    isResetting = true;
    scroller.style.scrollBehavior = 'auto';
    scroller.scrollLeft = left;
    scroller.offsetHeight; // force reflow
    scroller.style.scrollBehavior = 'smooth';
    isResetting = false;
  };

  const setInitialPosition = () => {
    const step = getStep();
    if (!step) return;
    scroller.style.scrollBehavior = 'auto';
    scroller.scrollLeft = step * originalCount;
    scroller.offsetHeight;
    scroller.style.scrollBehavior = 'smooth';
  };

  const normalizePosition = () => {
    if (isResetting) return;

    const step = getStep();
    if (!step) return;

    const startOfRealSet = step * originalCount;
    const endOfRealSet = step * originalCount * 2;
    const current = scroller.scrollLeft;

    // If user enters the prepended clones, jump forward
    if (current < startOfRealSet - step / 2) {
      jumpTo(current + step * originalCount);
    }

    // If user enters the appended clones, jump backward
    else if (current >= endOfRealSet - step / 2) {
      jumpTo(current - step * originalCount);
    }
  };

  let scrollTimeout;
  scroller.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      normalizePosition();
      isAnimating = false;
    }, 120);
  });

  nextBtn.addEventListener('click', () => {
    if (isAnimating) return;

    const step = getStep();
    if (!step) return;

    isAnimating = true;
    scroller.scrollBy({
      left: step,
      behavior: 'smooth'
    });
  });

  window.addEventListener('resize', () => {
    setInitialPosition();
  });

  // Start on the real first item, not the clones
  setInitialPosition();
});




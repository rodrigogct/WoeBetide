document.addEventListener('DOMContentLoaded', () => {
  const wrap = document.querySelector('.wb-scroller-wrap');
  if (!wrap) return;

  const scroller = wrap.querySelector('.block.container-xxxl');
  const nextBtn = wrap.querySelector('.wb-next-btn');
  if (!scroller || !nextBtn) return;

  const originalItems = Array.from(scroller.querySelectorAll('.col'));
  if (!originalItems.length) return;

  // Clone all original items once and append them to the end
  originalItems.forEach(item => {
    const clone = item.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    scroller.appendChild(clone);
  });

  let isAnimating = false;

  const getItemStep = () => {
    const first = scroller.querySelector('.col');
    if (!first) return 0;

    const firstStyles = window.getComputedStyle(first);
    const marginRight = parseFloat(firstStyles.marginRight) || 0;
    const marginLeft = parseFloat(firstStyles.marginLeft) || 0;

    return first.getBoundingClientRect().width + marginLeft + marginRight;
  };

  const getOriginalWidth = () => {
    return originalItems.reduce((total, item) => {
      const styles = window.getComputedStyle(item);
      const marginRight = parseFloat(styles.marginRight) || 0;
      const marginLeft = parseFloat(styles.marginLeft) || 0;
      return total + item.getBoundingClientRect().width + marginLeft + marginRight;
    }, 0);
  };

  nextBtn.addEventListener('click', () => {
    if (isAnimating) return;

    const step = getItemStep();
    const originalWidth = getOriginalWidth();
    if (!step || !originalWidth) return;

    isAnimating = true;

    scroller.scrollBy({
      left: step,
      behavior: 'smooth'
    });

    // Wait for the smooth scroll to finish, then reset if needed
    setTimeout(() => {
      if (scroller.scrollLeft >= originalWidth) {
        scroller.scrollLeft -= originalWidth;
      }

      isAnimating = false;
    }, 450);
  });

  // Optional: keep alignment clean after resize
  window.addEventListener('resize', () => {
    const originalWidth = getOriginalWidth();
    if (!originalWidth) return;

    if (scroller.scrollLeft >= originalWidth) {
      scroller.scrollLeft = scroller.scrollLeft % originalWidth;
    }
  });
});




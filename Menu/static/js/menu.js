document.addEventListener('DOMContentLoaded', () => {
  const wrap = document.querySelector('.wb-scroller-wrap');
  if (!wrap) return;

  const scroller = wrap.querySelector('.block.container-xxxl');
  const nextBtn  = wrap.querySelector('.wb-next-btn');
  if (!scroller || !nextBtn) return;

  const getStep = () => {
    const firstCol = scroller.querySelector('.col');
    const colW = firstCol ? firstCol.getBoundingClientRect().width : 200;
    return Math.max(scroller.clientWidth * 0.5, colW);
  };

  nextBtn.addEventListener('click', () => {
    scroller.scrollBy({ left: +getStep(), behavior: 'smooth' });
  });
});




document.addEventListener("DOMContentLoaded", () => {
  const helperSources = [
    "/static/images/misc/width.png",
    "/static/images/misc/length.png",
    "/static/images/misc/sleeve.png"
  ];

  helperSources.forEach(src => {
    const img = new Image();
    img.src = src;
  });

  function hideAll() {
    document.querySelectorAll(".measurements-img img").forEach(img => {
      img.style.display = "none";
    });
  }

  document.addEventListener("click", (e) => {
    const icon = e.target.closest(".measure-info");
    if (!icon) {
      hideAll();
      return;
    }

    e.stopPropagation();

    const target = icon.dataset.target;
    const wrapper = icon.closest(".measurements");
    if (!wrapper) return;

    const img = wrapper.querySelector(`.measurements-img[data-img="${target}"] img`);
    if (!img) return;

    wrapper.querySelectorAll(".measurements-img img").forEach(other => {
      if (other !== img) other.style.display = "none";
    });

    img.style.display = (img.style.display === "block") ? "none" : "block";
  });
});
document.addEventListener("DOMContentLoaded", () => {
    // Hide all measurement popups
    function hideAll() {
      document.querySelectorAll(".measurements-img img").forEach(img => {
        img.style.display = "none";
      });
    }
  
    // Event delegation: listen once for all icons (desktop + mobile)
    document.addEventListener("click", (e) => {
      const icon = e.target.closest(".measure-info");
      if (!icon) {
        hideAll();
        return;
      }
  
      e.stopPropagation();
  
      const target = icon.dataset.target; // width / length / sleeve
      const wrapper = icon.closest(".measurements"); // keep it within the current block
  
      if (!wrapper) return;
  
      const img = wrapper.querySelector(`.measurements-img[data-img="${target}"] img`);
      if (!img) return;
  
      // hide other images in THIS measurements block
      wrapper.querySelectorAll(".measurements-img img").forEach(other => {
        if (other !== img) other.style.display = "none";
      });
  
      // toggle this one
      img.style.display = (img.style.display === "block") ? "none" : "block";
    }, { passive: true });
  });
  

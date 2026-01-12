(function () {
  // --- Endpoints (must exist in urls.py) ---
  const CART_COUNT_URL = "{% url 'cart_count_api' %}";               // GET -> {"count": N}
  const ADD_TO_CART_URL_TMPL = "{% url 'CartAdd' 0 %}";          // POST qty -> session
  const UPDATE_CART_URL = "{% url 'update_cart' %}";                 // POST qty[<vid>]=N
  const REMOVE_FROM_CART_TMPL = "{% url 'remove_from_cart' 'VID' %}";// POST -> remove

  // --- Helpers ---
  function getCookie(name) {
    let c = null;
    if (document.cookie) {
      const cookies = document.cookie.split(";");
      for (const raw of cookies) {
        const cookie = raw.trim();
        if (cookie.startsWith(name + "=")) {
          c = decodeURIComponent(cookie.slice(name.length + 1));
          break;
        }
      }
    }
    return c;
  }
  const CSRF = () => ({ "X-CSRFToken": getCookie("csrftoken") });

  async function refreshCartBadge() {
    try {
      const r = await fetch(CART_COUNT_URL, { credentials: "same-origin" });
      const { count = 0 } = await r.json();
      const span = document.getElementById("wb-cart-count");
      if (span) span.textContent = `(${count})`;
    } catch (e) {
      console.warn("cart count fetch failed", e);
    }
  }

  // --- Add to cart (product/listing pages) ---
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".add-to-cart");
    if (!btn) return;
    e.preventDefault();

    const itemId = btn.getAttribute("data-item-id");
    let qty = parseInt(btn.getAttribute("data-quantity"), 10) || 1;
    if (!itemId) return;

    // clamp qty to MAX_QTY_PER_ITEM (backend enforces too, but this makes UX cleaner)
    const maxQty = parseInt(btn.getAttribute("data-max-qty"), 10) || 1;
    qty = Math.min(qty, maxQty);

    const fd = new FormData();
    fd.append("qty", qty);

    try {
      const res = await fetch(ADD_TO_CART_URL_TMPL.replace("0", itemId), {
        method: "POST",
        body: fd,
        credentials: "same-origin",
        headers: CSRF(),
      });
      
      if (!res.ok) {
        if (res.status === 409) {
          alert("Sorry — this item just sold.");
          await refreshCartBadge();
          return;
        }
        throw new Error("Failed to add to cart");
      }
      
      await refreshCartBadge();      

      // Temporary "Added!" feedback
      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = "Added!";
      setTimeout(() => {
        btn.textContent = old;
        btn.disabled = false;
      }, 900);

    } catch (err) {
      console.error(err);
      alert("Sorry, could not add item to cart.");
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    const controls = document.querySelectorAll(".quantity-control");

    controls.forEach(control => {
      const minus = control.querySelector(".btn-qty.minus");
      const plus = control.querySelector(".btn-qty.plus");
      const input = control.querySelector(".qty-input");
      const form = control.closest("form"); // the outer update form

      minus.addEventListener("click", () => {
        let val = parseInt(input.value, 10) || 0;
        if (val > 0) {
          val--;
          input.value = val;
          form.submit(); // always submit — server will remove if 0
        }
      });

      plus.addEventListener("click", () => {
        let val = parseInt(input.value, 10) || 0;
        input.value = val + 1;  // visually increments
        form.submit();          // server clamps back to 1
      });
    });
  });

  // Allow manual typing in qty input (cart page)
  document.addEventListener("change", async (e) => {
    const input = e.target.closest(".quantity-control .qty-input");
    if (!input) return;
    const variantId = input.getAttribute("data-variant-id");
    const value = parseInt(input.value, 10) || 0;

    const fd = new FormData();
    fd.append(`qty[${variantId}]`, value);
    await fetch(UPDATE_CART_URL, {
      method: "POST",
      body: fd,
      credentials: "same-origin",
      headers: CSRF(),
    });
    await refreshCartBadge();
  });

  // --- Remove line (cart page) ---
  document.addEventListener("click", async (e) => {
    const link = e.target.closest(".cart-remove"); // give your remove button this class
    if (!link) return;
    e.preventDefault();
    const vid = link.getAttribute("data-variant-id");
    if (!vid) return;

    await fetch(REMOVE_FROM_CART_TMPL.replace("VID", vid), {
      method: "POST",
      credentials: "same-origin",
      headers: CSRF(),
    });
    await refreshCartBadge();

    // optionally remove the row from DOM:
    const row = link.closest(".cart-line");
    if (row) row.remove();
  });

  document.addEventListener("DOMContentLoaded", () => {
    refreshCartBadge();

  const table = document.getElementById("cart-table");
  if (!table) return;

  const isMobile = () => window.matchMedia("(max-width: 991.98px)").matches; // Bootstrap lg

  // 1) Disable the hidden copy so only one qty[...] is posted
  function toggleDisabledByViewport() {
    table.querySelectorAll("tr").forEach(row => {
      const mobile = row.querySelector(".cellphone .qty-input");
      const desk   = row.querySelector(".tablets-laptop .qty-input");
      if (mobile) mobile.disabled = !isMobile();
      if (desk)   desk.disabled   =  isMobile();
    });
  }

  // 2) Keep both inputs in the same row visually in sync
  function syncTwins(controlEl) {
    const row = controlEl.closest("tr");
    if (!row) return;
    const val = controlEl.querySelector(".qty-input")?.value;
    if (val == null) return;
    row.querySelectorAll(".qty-input").forEach(inp => { inp.value = val; });
  }

  // Hook into your existing plus/minus listeners:
  document.querySelectorAll(".quantity-control").forEach(control => {
    const minus = control.querySelector(".btn-qty.minus");
    const plus  = control.querySelector(".btn-qty.plus");
    const input = control.querySelector(".qty-input");
    const form  = control.closest("form");

    if (minus) minus.addEventListener("click", () => {
      let v = parseInt(input.value, 10) || 0;
      if (v > 0) {
        input.value = v - 1;
        syncTwins(control);
        form.submit(); // your existing submit
      }
    });
    if (plus) plus.addEventListener("click", () => {
      let v = parseInt(input.value, 10) || 0;
      input.value = v + 1;
      syncTwins(control);
      form.submit(); // your existing submit
    });
  });

  toggleDisabledByViewport();
  window.addEventListener("resize", toggleDisabledByViewport);
});

})();







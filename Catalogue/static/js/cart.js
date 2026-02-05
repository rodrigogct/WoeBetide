(function () {
  // --- Endpoints (must exist in urls.py) ---
  const cfg = JSON.parse(document.getElementById("cart-config").textContent);
  const CART_COUNT_URL = cfg.cartCountUrl;
  const UPDATE_CART_URL = cfg.updateCartUrl;
  const REMOVE_FROM_CART_TMPL = cfg.removeFromCartTmpl;  

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
  
  function getCsrfToken() {
    // 1) Prefer hidden input in the form (works even if CSRF cookie is HttpOnly)
    const inp = document.querySelector('input[name="csrfmiddlewaretoken"]');
    if (inp?.value) return inp.value;
  
    // 2) Fallback to cookie (default Django setup)
    return getCookie("csrftoken");
  }
  
  const CSRF = () => ({ "X-CSRFToken": getCsrfToken() });
  

  async function postQty(variantId, value) {
    const fd = new FormData();
    fd.append(`qty[${variantId}]`, value);
  
    const r = await fetch(UPDATE_CART_URL, {
      method: "POST",
      body: fd,
      credentials: "same-origin",
      headers: { ...CSRF(), "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" },
    });
  
    if (!r.ok) throw new Error("update failed");
    return r.json(); // your backend currently returns {ok, count}
  }  

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

  // Allow manual typing in qty input (cart page)
  document.addEventListener("change", async (e) => {
    const input = e.target.closest(".quantity-control .qty-input");
    if (!input) return;
  
    const row = input.closest("tr.cart-line");
    const vid = row?.dataset?.variantId || input.getAttribute("data-variant-id");
    if (!vid) return;
  
    let v = parseInt(input.value, 10);
    if (Number.isNaN(v) || v < 0) v = 0;
  
    // sync both twins visually
    if (row) row.querySelectorAll(".qty-input").forEach(inp => (inp.value = v));
  
    // optimistic removal
    if (v === 0 && row) row.remove();
  
    try {
      await postQty(vid, v);
      await refreshCartBadge();
    } catch (err) {
      console.error(err);
      alert("Update failed — check Network tab for status.");
    }
  });
  

  // --- Remove line (cart page) ---
  document.addEventListener("click", async (e) => {
    const minusBtn  = e.target.closest(".btn-qty.minus");
    const removeBtn = e.target.closest(".cart-remove");
    if (!minusBtn && !removeBtn) return;
  
    const row = e.target.closest("tr.cart-line");
    const vid =
      row?.dataset?.variantId ||
      removeBtn?.dataset?.variantId ||
      removeBtn?.getAttribute("data-variant-id");
  
    if (!vid) return;
  
    // ---- REMOVE: instant UI, then sync server ----
    if (removeBtn) {
      e.preventDefault();
      if (row) row.remove(); // optimistic UI
  
      try {
        await fetch(REMOVE_FROM_CART_TMPL.replace("VID", vid), {
          method: "POST",
          credentials: "same-origin",
          headers: { ...CSRF(), "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" },
        });
        await refreshCartBadge();
      } catch (err) {
        console.error(err);
        window.location.reload();
      }
      return;
    }
  
    // ---- MINUS: update qty via AJAX, remove row if hits 0 ----
    if (minusBtn) {
      e.preventDefault();
      if (!row) return;
  
      // pick the enabled input (your viewport code disables the hidden twin)
      const input =
        row.querySelector(".qty-input:not([disabled])") ||
        row.querySelector(".qty-input");
  
      let v = parseInt(input.value, 10) || 0;
      if (v <= 0) return;
  
      v -= 1;
  
      // optimistic UI: sync both twins visually
      row.querySelectorAll(".qty-input").forEach(inp => (inp.value = v));
  
      // if it becomes 0, remove row immediately
      if (v === 0) row.remove();
  
      try {
        await postQty(vid, v);
        await refreshCartBadge();
      } catch (err) {
        console.error(err);
        window.location.reload();
      }
    }
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
  // function syncTwins(controlEl) {
  //   const row = controlEl.closest("tr");
  //   if (!row) return;
  //   const val = controlEl.querySelector(".qty-input")?.value;
  //   if (val == null) return;
  //   row.querySelectorAll(".qty-input").forEach(inp => { inp.value = val; });
  // }

  toggleDisabledByViewport();
  window.addEventListener("resize", toggleDisabledByViewport);
  });

  async function refreshCartBadge() {
    try {
      const r = await fetch(CART_COUNT_URL, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`badge fetch ${r.status}`);
      const data = await r.json();
      const span = document.getElementById("wb-cart-count");
      if (span) span.textContent = `(${data.count || 0})`;
    } catch (e) {
      console.warn("cart count fetch failed", e);
    }
  }  


})();







(function () {
  // --- Endpoints (must exist in urls.py and be exposed in base.html) ---
  const cfg = window.WB_CART_ENDPOINTS || {};
  const CART_COUNT_URL = cfg.count;
  const UPDATE_CART_URL = cfg.update;
  const REMOVE_FROM_CART_TMPL = cfg.removeTmpl;
  const ADD_TO_CART_URL_TMPL = cfg.addTmpl;

  function reconcileCartEmptyState() {
    const rows = document.querySelectorAll("tr.cart-line");
    const cartFilled = document.getElementById("cart-filled");
    const emptyMsg = document.getElementById("cart-empty-msg");

    const hasItems = rows.length > 0;
    setVisible(cartFilled, hasItems);
    setVisible(emptyMsg, !hasItems);
  }

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
    const inp = document.querySelector('input[name="csrfmiddlewaretoken"]');
    if (inp?.value) return inp.value;
    return getCookie("csrftoken");
  }

  const CSRF = () => ({
    "X-CSRFToken": getCsrfToken(),
  });

  function setVisible(el, show) {
    if (!el) return;
    el.classList.toggle("d-none", !show);
  }

  function formatMXN(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return String(n ?? "0.00");
    return new Intl.NumberFormat("es-MX", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  }

  function applyCartSummary(data) {
    const span = document.getElementById("wb-cart-count");
    if (span) span.textContent = `(${data?.count ?? 0})`;

    const subtotalEl = document.getElementById("cart-subtotal");
    if (subtotalEl && data?.grand_total != null) {
      subtotalEl.textContent = formatMXN(data.grand_total);
    }

    const checkoutBtn = document.getElementById("cart-checkout-btn");
    if (checkoutBtn && typeof data?.checkout_url === "string") {
      checkoutBtn.href = data.checkout_url;
    }

    const cartFilled = document.getElementById("cart-filled");
    const emptyMsg = document.getElementById("cart-empty-msg");
    const hasItems = (data?.count ?? 0) > 0;

    setVisible(cartFilled, hasItems);
    setVisible(emptyMsg, !hasItems);
  }

  async function refreshCartBadge() {
    if (!CART_COUNT_URL) return;

    try {
      const r = await fetch(CART_COUNT_URL, {
        credentials: "same-origin",
        headers: { "Accept": "application/json" },
      });

      if (!r.ok) throw new Error("cart count fetch failed");

      const { count = 0 } = await r.json();
      const span = document.getElementById("wb-cart-count");
      if (span) span.textContent = `(${count})`;
    } catch (e) {
      console.warn("cart count fetch failed", e);
    }
  }

  async function postQty(variantId, value) {
    const fd = new FormData();
    fd.append(`qty[${variantId}]`, value);

    const r = await fetch(UPDATE_CART_URL, {
      method: "POST",
      body: fd,
      credentials: "same-origin",
      headers: {
        ...CSRF(),
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    if (!r.ok) throw new Error("update failed");
    return r.json();
  }

  async function addToCartAjax(btn) {
    if (!btn || !ADD_TO_CART_URL_TMPL) return;

    const itemId = btn.getAttribute("data-item-id");
    let qty = parseInt(btn.getAttribute("data-quantity"), 10) || 1;
    const maxQty = parseInt(btn.getAttribute("data-max-qty"), 10) || 1;

    if (!itemId) return;

    qty = Math.min(qty, maxQty);

    const fd = new FormData();
    fd.append("qty", qty);

    try {
      btn.disabled = true;

      const res = await fetch(ADD_TO_CART_URL_TMPL.replace("0", itemId), {
        method: "POST",
        body: fd,
        credentials: "same-origin",
        headers: {
          ...CSRF(),
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
      });

      if (!res.ok) {
        if (res.status === 409) {
          alert("Sorry — this item just sold.");
          await refreshCartBadge();
          btn.disabled = false;
          return;
        }
        throw new Error("Failed to add to cart");
      }

      const data = await res.json();

      const span = document.getElementById("wb-cart-count");
      if (span) span.textContent = `(${data?.count ?? 0})`;

      const form = btn.closest("form");
      const viewCartLink = form?.querySelector(".view-cart-link");

      const old = btn.textContent;
      btn.textContent = "Added!";

      if (viewCartLink) {
        viewCartLink.style.display = "block";
      }

      setTimeout(() => {
        btn.textContent = old;
        btn.disabled = false;
      }, 900);
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      alert("Sorry, could not add item to cart.");
    }
  }

  function getAddToCartButtonFromEventTarget(target) {
    return target.closest(
      '.add-to-cart, button[data-item-id][data-quantity][data-max-qty]'
    );
  }

  // --- Add to cart (product/listing pages) ---
  document.addEventListener("click", async (e) => {
    const btn = getAddToCartButtonFromEventTarget(e.target);
    if (!btn) return;

    const form = btn.closest("form");

    // only intercept actual add-to-cart forms/buttons
    if (!form && !btn.classList.contains("add-to-cart")) return;

    e.preventDefault();
    await addToCartAjax(btn);
  });

  // fallback: if form still submits for any reason, intercept it
  document.addEventListener("submit", async (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;

    const btn = form.querySelector(
      '.add-to-cart, button[data-item-id][data-quantity][data-max-qty]'
    );

    if (!btn) return;

    e.preventDefault();
    await addToCartAjax(btn);
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

    if (row) row.querySelectorAll(".qty-input").forEach((inp) => (inp.value = v));

    if (v === 0 && row) {
      row.remove();
      reconcileCartEmptyState();
    }

    try {
      const data = await postQty(vid, v);
      applyCartSummary(data);
    } catch (err) {
      console.error(err);
      alert("Update failed — check Network tab for status.");
    }
  });

  // --- Remove line / minus (cart page) ---
  document.addEventListener("click", async (e) => {
    const minusBtn = e.target.closest(".btn-qty.minus");
    const removeBtn = e.target.closest(".cart-remove");
    if (!minusBtn && !removeBtn) return;

    const row = e.target.closest("tr.cart-line");
    const vid =
      row?.dataset?.variantId ||
      removeBtn?.dataset?.variantId ||
      removeBtn?.getAttribute("data-variant-id");

    if (!vid) return;

    if (removeBtn) {
      e.preventDefault();

      if (row) {
        row.remove();
        reconcileCartEmptyState();
      }

      try {
        const res = await fetch(REMOVE_FROM_CART_TMPL.replace("VID", vid), {
          method: "POST",
          credentials: "same-origin",
          headers: {
            ...CSRF(),
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
        });

        if (!res.ok) throw new Error("remove failed");
        const data = await res.json();
        applyCartSummary(data);
      } catch (err) {
        console.error(err);
        window.location.reload();
      }
      return;
    }

    if (minusBtn) {
      e.preventDefault();
      if (!row) return;

      const input =
        row.querySelector(".qty-input:not([disabled])") ||
        row.querySelector(".qty-input");

      let v = parseInt(input.value, 10) || 0;
      if (v <= 0) return;

      v -= 1;

      row.querySelectorAll(".qty-input").forEach((inp) => (inp.value = v));

      if (v === 0) {
        row.remove();
        reconcileCartEmptyState();
      }

      try {
        const data = await postQty(vid, v);
        applyCartSummary(data);
      } catch (err) {
        console.error(err);
        window.location.reload();
      }
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    refreshCartBadge();
    reconcileCartEmptyState();

    const table = document.getElementById("cart-table");
    if (!table) return;

    const isMobile = () => window.matchMedia("(max-width: 991.98px)").matches;

    function toggleDisabledByViewport() {
      table.querySelectorAll("tr").forEach((row) => {
        const mobile = row.querySelector(".cellphone .qty-input");
        const desk = row.querySelector(".tablets-laptop .qty-input");
        if (mobile) mobile.disabled = !isMobile();
        if (desk) desk.disabled = isMobile();
      });
    }

    toggleDisabledByViewport();
    window.addEventListener("resize", toggleDisabledByViewport);
  });
})();

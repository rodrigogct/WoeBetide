(() => {
  "use strict";
  const input = document.getElementById('pos-search-input');
  const results = document.getElementById('pos-results');
  const cartHost = document.getElementById('pos-cart-items');
  const discountInput = document.getElementById('pos-discount-demo');
  const buttons = [...document.querySelectorAll('.pos-submit')];
  const payments = [...document.querySelectorAll('.pos-payment-option')];
  const cart = new Map();
  const CART_KEY = 'woe-pos-draft-cart-v1';
  function saveCart(){try{sessionStorage.setItem(CART_KEY, JSON.stringify([...cart.values()]));}catch(_e){}}
  try {const saved=JSON.parse(sessionStorage.getItem(CART_KEY)||'[]'); if(Array.isArray(saved)) saved.forEach(g=>{if(g && typeof g.id==='string' && Number.isFinite(Number(g.price)))cart.set(g.id,g);});}catch(_e){}
  const money = n => new Intl.NumberFormat('en-MX',{style:'currency',currency:'MXN'}).format(n);
  const price = g => Number(g.price);
  let selectedPayment='Cash', debounce, lastRequest=0;
  const el = (tag, cls, txt) => {const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;};
  function refreshCart(){
    cartHost.replaceChildren();
    for (const g of cart.values()) {
      const row=el('div','pos-cart-item');
      const thumb=el('div','pos-thumbnail');
      if(g.image_url){const img=el('img');img.src=g.image_url;img.alt='';img.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:inherit';thumb.append(img)} else thumb.textContent='◇';
      const copy=el('div','pos-cart-copy');copy.append(el('strong','',g.name),el('small','',g.id));
      const remove=el('button','pos-remove','×');remove.type='button';remove.setAttribute('aria-label','Remove '+g.name);
      remove.addEventListener('click',()=>{cart.delete(g.id);saveCart();refreshCart(); if(input.value.trim())search();});
      row.append(thumb,copy,el('strong','pos-cart-price',money(price(g))),remove);cartHost.append(row);
    }
    if(!cart.size)cartHost.append(el('p','pos-help','No garments added yet.'));
    const count=document.querySelector('#pos-cart-title + .pos-subtle');if(count)count.textContent=`${cart.size} ${cart.size===1?'item':'items'}`;
    const subtotal=[...cart.values()].reduce((a,g)=>a+price(g),0);
    let discount=Number(discountInput.value)||0;discount=Math.max(0,discount);
    discountInput.max=String(subtotal);
    if(discount>subtotal){discount=subtotal;discountInput.value=String(subtotal);}
    const total=Math.max(0,subtotal-discount);
    const sub=document.querySelector('.pos-subtotal span:last-child');if(sub)sub.textContent=money(subtotal);
    const tot=document.querySelector('.pos-total strong:last-child');if(tot)tot.textContent=money(total);
    const collect=document.querySelector('.pos-collect-summary strong');if(collect)collect.textContent=money(total);
    buttons.forEach(b=>b.disabled=!cart.size);
  }
  function hideResults(){results.hidden=true; results.replaceChildren();}
  function showResults(items){
    results.replaceChildren();
    const remaining=items.filter(g=>!cart.has(g.id));
    if(!remaining.length){
      results.append(el('p','pos-search-message','No matching available garments.'));
    } else {
      for(const g of remaining){
        const btn=el('button','pos-result');btn.type='button';
        const copy=el('div','pos-result-copy');copy.append(el('strong','',g.name),el('small','',g.id));
        btn.append(copy,el('span','pos-result-price',money(price(g))),el('span','pos-add-icon','+'));
        btn.addEventListener('click',()=>{
          cart.set(g.id,g);saveCart();refreshCart();input.value='';hideResults();input.focus();
        });
        results.append(btn);
      }
      
    }
    results.hidden=false;
  }
  async function search(){
    const term=input.value.trim();
    const seq=++lastRequest;
    if(!term){hideResults();return;}
    results.replaceChildren(el('p','pos-search-message','Searching…'));
    results.hidden=false;
    try{
      const url=window.WOE_POS_SEARCH_URL+'?q='+encodeURIComponent(term);
      const response=await fetch(url,{headers:{'Accept':'application/json'},credentials:'same-origin'});
      if(!response.ok)throw new Error('Search failed ('+response.status+')');
      const payload=await response.json();if(seq!==lastRequest)return;
      showResults(payload.results||[]);
    }catch(err){
      if(seq===lastRequest){results.replaceChildren(el('p','pos-search-message','Unable to load inventory. Please try again.'));results.hidden=false;}
    }
  }
  input.addEventListener('input',()=>{
    clearTimeout(debounce);
    if(!input.value.trim()){++lastRequest;hideResults();return;}
    debounce=setTimeout(search,180);
  });
  input.addEventListener('keydown',e=>{if(e.key==='Escape'){input.value='';++lastRequest;hideResults();}});
  document.addEventListener('pointerdown',e=>{
    if(!e.target.closest('.pos-search-wrap')) hideResults();
  });
  input.addEventListener('focus',()=>{if(input.value.trim())search();});
  discountInput.addEventListener('input',refreshCart);
  payments.forEach(option=>{
    option.setAttribute('role','button');option.tabIndex=0;
    const select=()=>{payments.forEach(p=>p.classList.remove('pos-payment-selected'));option.classList.add('pos-payment-selected');selectedPayment=option.textContent.trim();};
    option.addEventListener('click',select);option.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});
  });
  buttons.forEach(button=>button.addEventListener('click',()=>{
    if(!cart.size)return;
    const subtotal=[...cart.values()].reduce((a,g)=>a+price(g),0);
    const discount=Math.min(subtotal,Math.max(0,Number(discountInput.value)||0));
    const lines=[...cart.values()].map(g=>`${g.id} — ${g.name}: ${money(price(g))}`).join('\n');
    window.alert(`SALE REVIEW — PREVIEW ONLY\n\n${lines}\n\nDiscount: ${money(discount)}\nTotal: ${money(subtotal-discount)}\nPayment: ${selectedPayment}\n\nNo sale has been recorded.`);
  }));
  // Inventory browse link returns with ?add=GARMENT_ID. Validate it against the live endpoint.
  async function importFromInventory(){
    const params=new URLSearchParams(window.location.search);
    const id=params.get('add');
    if(!id)return;
    window.history.replaceState({},'',window.location.pathname);
    try{
      const response=await fetch(window.WOE_POS_SEARCH_URL+'?id='+encodeURIComponent(id),{headers:{'Accept':'application/json'},credentials:'same-origin'});
      if(!response.ok)throw Error('lookup failed');
      const data=await response.json();
      const garment=(data.results||[]).find(g=>g.id===id);
      if(garment){cart.set(garment.id,garment);saveCart();refreshCart();}
      else window.alert('This garment is no longer available for checkout.');
    }catch(_e){window.alert('Could not load selected garment. Please retry.');}
  }
  refreshCart();hideResults();importFromInventory();
})();
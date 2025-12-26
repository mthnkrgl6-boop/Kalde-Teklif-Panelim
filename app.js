"use strict";

const groupConfig = [
  { key: "plastik", label: "Plastik ve Plastik Parçalı Ürünler" },
  { key: "metal", label: "Metal Ürün Grupları" },
  { key: "altyapi", label: "Altyapı Ürün Grupları" },
  { key: "radyator", label: "Radyatör Ürün Grupları" },
  { key: "kazan", label: "Kazan Dairesi Kollektörleri" },
  { key: "inflex", label: "Inflex Ürün Grupları" },
];

const priceData = {};
const requestItems = [];
const matchRows = new Map();

const priceGroupsContainer = document.getElementById("priceGroups");
const requestForm = document.getElementById("requestForm");
const requestTextInput = document.getElementById("requestText");
const requestQtyInput = document.getElementById("requestQty");
const preferredGroupSelect = document.getElementById("preferredGroup");
const matchBody = document.getElementById("matchBody");
const autoMatchButton = document.getElementById("autoMatch");
const generateQuoteButton = document.getElementById("generateQuote");
const monthlyRateInput = document.getElementById("monthlyRate");
const dueDaysInput = document.getElementById("dueDays");

const subtotalEl = document.getElementById("subtotal");
const vatTotalEl = document.getElementById("vatTotal");
const financeTotalEl = document.getElementById("financeTotal");
const grandTotalEl = document.getElementById("grandTotal");

const groupTemplate = document.getElementById("groupTemplate");
const matchRowTemplate = document.getElementById("matchRowTemplate");

function formatCurrency(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
  }).format(value || 0);
}

function createId(prefix = "id") {
  return `${prefix}-${Math.random().toString(16).slice(2)}`;
}

function renderGroupCards() {
  priceGroupsContainer.innerHTML = "";
  preferredGroupSelect.innerHTML = '<option value="">Hepsi</option>';

  groupConfig.forEach((group) => {
    priceData[group.key] = priceData[group.key] ?? {
      label: group.label,
      discount: 0,
      vat: 20,
      items: [],
    };

    const card = groupTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.group = group.key;
    card.querySelector(".group-title").textContent = group.label;

    const discountInput = card.querySelector(".discount-input");
    const vatInput = card.querySelector(".vat-input");
    discountInput.value = priceData[group.key].discount;
    vatInput.value = priceData[group.key].vat;

    discountInput.addEventListener("input", (e) => {
      priceData[group.key].discount = Number(e.target.value) || 0;
      syncGroupDefaults(group.key);
      recalcTotals();
    });

    vatInput.addEventListener("input", (e) => {
      priceData[group.key].vat = Number(e.target.value) || 0;
      syncGroupDefaults(group.key);
      recalcTotals();
    });

    const productBody = card.querySelector(".product-body");
    const addProductForm = card.querySelector(".add-product");

    addProductForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const formData = new FormData(addProductForm);
      const code = formData.get("code").trim();
      const name = formData.get("name").trim();
      const price = Number(formData.get("price")) || 0;
      const vat = formData.get("vat");

      if (!code || !name || price <= 0) return;

      priceData[group.key].items.push({
        id: createId("prd"),
        code,
        name,
        price,
        vat: vat === "" ? null : Number(vat),
      });

      addProductForm.reset();
      renderProducts(group.key, productBody);
      refreshProductSelects();
    });

    renderProducts(group.key, productBody);
    priceGroupsContainer.appendChild(card);

    const option = document.createElement("option");
    option.value = group.key;
    option.textContent = group.label;
    preferredGroupSelect.appendChild(option);
  });
}

function renderProducts(groupKey, bodyEl) {
  bodyEl.innerHTML = "";
  priceData[groupKey].items.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.code}</td>
      <td>${item.name}</td>
      <td>${formatCurrency(item.price)}</td>
      <td>${(item.vat ?? priceData[groupKey].vat).toFixed(2)}</td>
      <td><button type="button" class="icon-button danger">Sil</button></td>
    `;

    row.querySelector("button").addEventListener("click", () => {
      priceData[groupKey].items = priceData[groupKey].items.filter((p) => p.id !== item.id);
      renderProducts(groupKey, bodyEl);
      refreshProductSelects();
      recalcTotals();
    });

    bodyEl.appendChild(row);
  });
}

function addRequestItem(text, qty, preferredGroup) {
  const id = createId("req");
  requestItems.push({ id, text, qty, preferredGroup: preferredGroup || null });
  const matchRow = createMatchRow(id, text, qty);
  matchBody.appendChild(matchRow);
}

function createMatchRow(requestId, text, qty) {
  const row = matchRowTemplate.content.firstElementChild.cloneNode(true);
  row.dataset.requestId = requestId;
  row.querySelector(".request-text").textContent = text;

  const select = row.querySelector(".product-select");
  const qtyInput = row.querySelector(".qty-input");
  const discountInput = row.querySelector(".discount-cell");
  const vatInput = row.querySelector(".vat-cell");

  qtyInput.value = qty;
  select.addEventListener("change", () => {
    const product = getProductByValue(select.value);
    if (!product) {
      matchRows.delete(requestId);
      row.querySelector(".code-cell").textContent = "";
      row.querySelector(".price-cell").textContent = "";
      row.querySelector(".line-total").textContent = formatCurrency(0);
      return recalcTotals();
    }
    const { groupKey } = product;
    discountInput.value = priceData[groupKey].discount;
    vatInput.value = product.vat ?? priceData[groupKey].vat;
    matchRows.set(requestId, {
      requestId,
      productId: product.id,
      groupKey,
      qty: Number(qtyInput.value) || 1,
      discount: Number(discountInput.value) || 0,
      vat: Number(vatInput.value) || 0,
    });
    fillMatchCells(row, product);
    recalcTotals();
  });

  qtyInput.addEventListener("input", () => {
    const current = matchRows.get(requestId);
    if (current) {
      current.qty = Number(qtyInput.value) || 1;
      recalcTotals();
    }
  });

  discountInput.addEventListener("input", () => {
    const current = matchRows.get(requestId);
    if (current) {
      current.discount = Number(discountInput.value) || 0;
      recalcTotals();
    }
  });

  vatInput.addEventListener("input", () => {
    const current = matchRows.get(requestId);
    if (current) {
      current.vat = Number(vatInput.value) || 0;
      recalcTotals();
    }
  });

  row.querySelector(".remove-row").addEventListener("click", () => {
    matchRows.delete(requestId);
    const idx = requestItems.findIndex((r) => r.id === requestId);
    if (idx >= 0) requestItems.splice(idx, 1);
    row.remove();
    recalcTotals();
  });

  refreshProductSelect(select);
  return row;
}

function refreshProductSelect(selectEl) {
  const options = buildProductOptions();
  selectEl.innerHTML = '<option value="">Eşleşme yok</option>';
  options.forEach(({ groupKey, label, items }) => {
    const group = document.createElement("optgroup");
    group.label = label;
    items.forEach((item) => {
      const opt = document.createElement("option");
      opt.value = `${groupKey}:${item.id}`;
      opt.textContent = `${item.code} — ${item.name}`;
      group.appendChild(opt);
    });
    selectEl.appendChild(group);
  });
}

function refreshProductSelects() {
  const selects = matchBody.querySelectorAll(".product-select");
  selects.forEach(refreshProductSelect);
}

function buildProductOptions() {
  return Object.entries(priceData).map(([groupKey, data]) => ({
    groupKey,
    label: data.label,
    items: data.items,
  }));
}

function getProductByValue(value) {
  if (!value.includes(":")) return null;
  const [groupKey, productId] = value.split(":");
  const group = priceData[groupKey];
  if (!group) return null;
  const product = group.items.find((item) => item.id === productId);
  return product ? { ...product, groupKey } : null;
}

function syncGroupDefaults(groupKey) {
  matchRows.forEach((match, requestId) => {
    if (match.groupKey === groupKey) {
      const row = matchBody.querySelector(`[data-request-id="${requestId}"]`);
      if (!row) return;
      if (!row.querySelector(".product-select").value) return;
      const product = getProductByValue(row.querySelector(".product-select").value);
      if (!product) return;
      row.querySelector(".discount-cell").value = priceData[groupKey].discount;
      row.querySelector(".vat-cell").value = product.vat ?? priceData[groupKey].vat;
      match.discount = Number(row.querySelector(".discount-cell").value) || 0;
      match.vat = Number(row.querySelector(".vat-cell").value) || 0;
    }
  });
}

function findBestProduct(text, preferredGroup) {
  const haystack = text.toLowerCase();
  const words = haystack.split(/[\s-_,.;]+/).filter((w) => w.length > 2);
  let best = null;
  let bestScore = 0;

  Object.entries(priceData).forEach(([groupKey, data]) => {
    if (preferredGroup && groupKey !== preferredGroup) return;
    data.items.forEach((item) => {
      const name = item.name.toLowerCase();
      const code = item.code.toLowerCase();
      let score = 0;
      if (haystack.includes(code)) score += 3;
      words.forEach((w) => {
        if (name.includes(w)) score += 1.2;
      });
      if (score > bestScore) {
        bestScore = score;
        best = { ...item, groupKey };
      }
    });
  });
  return best;
}

function fillMatchCells(row, product) {
  const codeCell = row.querySelector(".code-cell");
  const priceCell = row.querySelector(".price-cell");
  codeCell.textContent = product.code;
  priceCell.textContent = formatCurrency(product.price);
}

function recalcTotals() {
  let subtotal = 0;
  let vatTotal = 0;

  matchRows.forEach((match) => {
    const product = getProductByValue(`${match.groupKey}:${match.productId}`);
    if (!product) return;
    const discounted = product.price * (1 - (match.discount || 0) / 100);
    const line = discounted * (match.qty || 1);
    const vatAmount = line * ((match.vat || 0) / 100);
    subtotal += line;
    vatTotal += vatAmount;

    const row = matchBody.querySelector(`[data-request-id="${match.requestId}"]`);
    if (row) {
      row.querySelector(".line-total").textContent = formatCurrency(line + vatAmount);
    }
  });

  const paymentType = document.querySelector('input[name="paymentType"]:checked').value;
  const monthlyRate = Number(monthlyRateInput.value) || 0;
  const days = Number(dueDaysInput.value) || 0;
  const finance = paymentType === "vadeli" ? ((subtotal + vatTotal) * monthlyRate * (days / 30)) / 100 : 0;

  subtotalEl.textContent = formatCurrency(subtotal);
  vatTotalEl.textContent = formatCurrency(vatTotal);
  financeTotalEl.textContent = formatCurrency(finance);
  grandTotalEl.textContent = formatCurrency(subtotal + vatTotal + finance);
}

function autoMatch() {
  requestItems.forEach((req) => {
    const row = matchBody.querySelector(`[data-request-id="${req.id}"]`);
    if (!row) return;
    const product = findBestProduct(req.text, req.preferredGroup);
    if (!product) return;
    const select = row.querySelector(".product-select");
    select.value = `${product.groupKey}:${product.id}`;
    const discountInput = row.querySelector(".discount-cell");
    const vatInput = row.querySelector(".vat-cell");
    discountInput.value = priceData[product.groupKey].discount;
    vatInput.value = product.vat ?? priceData[product.groupKey].vat;

    matchRows.set(req.id, {
      requestId: req.id,
      productId: product.id,
      groupKey: product.groupKey,
      qty: req.qty,
      discount: Number(discountInput.value) || 0,
      vat: Number(vatInput.value) || 0,
    });

    fillMatchCells(row, product);
  });

  recalcTotals();
}

function handleQuoteGeneration() {
  if (!matchRows.size) {
    alert("Teklif oluşturmak için en az bir eşleşmiş ürün seçin.");
    return;
  }

  const lines = [];
  matchRows.forEach((match) => {
    const product = getProductByValue(`${match.groupKey}:${match.productId}`);
    if (!product) return;
    const discounted = product.price * (1 - (match.discount || 0) / 100);
    const lineNet = discounted * (match.qty || 1);
    const vatAmount = lineNet * ((match.vat || 0) / 100);
    lines.push({
      requestId: match.requestId,
      product,
      qty: match.qty || 1,
      discount: match.discount || 0,
      vat: match.vat || 0,
      unit: discounted,
      total: lineNet + vatAmount,
    });
  });

  if (!lines.length) {
    alert("Eşleşmiş ürün bulunamadı.");
    return;
  }

  const paymentType = document.querySelector('input[name="paymentType"]:checked').value;
  const monthlyRate = Number(monthlyRateInput.value) || 0;
  const days = Number(dueDaysInput.value) || 0;
  const subtotal = lines.reduce((acc, l) => acc + l.unit * l.qty, 0);
  const vatTotal = lines.reduce((acc, l) => acc + l.unit * l.qty * (l.vat / 100), 0);
  const finance = paymentType === "vadeli" ? ((subtotal + vatTotal) * monthlyRate * (days / 30)) / 100 : 0;

  const html = `
    <html>
      <head>
        <title>Teklif</title>
        <style>
          body { font-family: "Inter", system-ui; padding: 32px; color: #0f172a; }
          h1 { margin: 0 0 12px; }
          .muted { color: #475569; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: left; font-size: 14px; }
          th { background: #f8fafc; }
          tfoot td { font-weight: 700; }
          .totals { margin-top: 18px; float: right; width: 300px; }
          .totals div { display: flex; justify-content: space-between; padding: 6px 0; }
          .badge { display: inline-block; background: #ecfeff; color: #0e7490; padding: 6px 10px; border-radius: 999px; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>Kalde Teklif Özeti</h1>
        <p class="muted">Müşteri talebi doğrultusunda otomatik eşleştirilen ürün listesi.</p>
        <span class="badge">${paymentType === "vadeli" ? "Vadeli" : "Peşin"}</span>
        <table>
          <thead>
            <tr>
              <th>Talep</th>
              <th>Kod</th>
              <th>Ürün Adı</th>
              <th>Adet</th>
              <th>Birim (isk. sonrası)</th>
              <th>İsk. (%)</th>
              <th>KDV (%)</th>
              <th>Toplam</th>
            </tr>
          </thead>
          <tbody>
            ${lines
              .map(
                (l) => `
              <tr>
                <td>${requestItems.find((r) => r.id === l.requestId)?.text ?? ""}</td>
                <td>${l.product.code}</td>
                <td>${l.product.name}</td>
                <td>${l.qty}</td>
                <td>${formatCurrency(l.unit)}</td>
                <td>${l.discount.toFixed(2)}</td>
                <td>${l.vat.toFixed(2)}</td>
                <td>${formatCurrency(l.total)}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
        <div class="totals">
          <div><span>Ara Toplam</span><strong>${formatCurrency(subtotal)}</strong></div>
          <div><span>KDV</span><strong>${formatCurrency(vatTotal)}</strong></div>
          <div><span>Vade Farkı</span><strong>${formatCurrency(finance)}</strong></div>
          <div style="border-top:1px solid #e2e8f0; margin-top:6px; padding-top:6px;">
            <span>Genel Toplam</span><strong>${formatCurrency(subtotal + vatTotal + finance)}</strong>
          </div>
        </div>
        <script>window.print();</script>
      </body>
    </html>
  `;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
}

function init() {
  renderGroupCards();

  requestForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = requestTextInput.value.trim();
    const qty = Number(requestQtyInput.value) || 1;
    const preferredGroup = preferredGroupSelect.value;
    if (!text) return;
    addRequestItem(text, qty, preferredGroup);
    requestForm.reset();
    requestQtyInput.value = 1;
    preferredGroupSelect.value = "";
  });

  autoMatchButton.addEventListener("click", () => autoMatch());
  generateQuoteButton.addEventListener("click", () => handleQuoteGeneration());

  document.querySelectorAll('input[name="paymentType"]').forEach((input) =>
    input.addEventListener("change", recalcTotals)
  );
  monthlyRateInput.addEventListener("input", recalcTotals);
  dueDaysInput.addEventListener("input", recalcTotals);
}

document.addEventListener("DOMContentLoaded", init);

/** @typedef {{ id: string, name: string, url: string, description: string, provider: string, category: string, formats: string[], api?: { available: boolean, docs_url?: string }, datasets: Dataset[] }} Source */
/** @typedef {{ id: string, name: string, description: string, tags: string[], url: string, update_frequency?: string, last_confirmed: string, access_method: string, notes?: string }} Dataset */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let catalog = null;
let activeCategory = "all";
let searchQuery = "";

async function init() {
  const res = await fetch("catalog.json");
  catalog = await res.json();
  renderStats();
  render();
  bindEvents();
}

function renderStats() {
  const s = catalog.stats;
  const statsEl = $("#stats");
  const items = [
    { value: s.totalSources, label: "Sources" },
    { value: s.totalDatasets, label: "Datasets" },
  ];
  const categoryLabels = {
    government: "Government",
    international: "International",
    academic: "Academic",
    private: "Private",
  };
  for (const [key, label] of Object.entries(categoryLabels)) {
    if (s.byCategory[key]) {
      items.push({ value: s.byCategory[key], label });
    }
  }
  statsEl.innerHTML = items
    .map(
      (item) =>
        `<div class="stat-item"><span class="stat-value">${item.value}</span><span class="stat-label">${item.label}</span></div>`,
    )
    .join("");
}

function getFilteredItems() {
  const results = [];
  const q = searchQuery.toLowerCase();

  for (const source of catalog.sources) {
    if (activeCategory !== "all" && source.category !== activeCategory) continue;

    for (const dataset of source.datasets) {
      if (q) {
        const haystack = [
          dataset.name,
          dataset.description,
          dataset.tags.join(" "),
          source.name,
          source.provider,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) continue;
      }
      results.push({ source, dataset });
    }
  }
  return results;
}

function render() {
  const items = getFilteredItems();
  const grid = $("#grid");
  const info = $("#results-info");

  info.textContent = `${items.length} datasets`;

  if (items.length === 0) {
    grid.innerHTML = `<p style="color: var(--c-text-secondary); grid-column: 1/-1; text-align:center; padding: 3rem 0;">該当するデータセットが見つかりませんでした</p>`;
    return;
  }

  grid.innerHTML = items.map(({ source, dataset }) => cardHTML(source, dataset)).join("");
}

function cardHTML(source, dataset) {
  const tags = dataset.tags
    .slice(0, 5)
    .map((t) => `<span class="tag">${esc(t)}</span>`)
    .join("");
  const extra = dataset.tags.length > 5 ? `<span class="tag">+${dataset.tags.length - 5}</span>` : "";

  return `
    <article class="card" data-source-id="${esc(source.id)}" data-dataset-id="${esc(dataset.id)}">
      <div class="card-header">
        <span class="card-source" data-category="${esc(source.category)}">${esc(source.provider)}</span>
        <span class="badge badge-${esc(dataset.access_method)}">${esc(dataset.access_method)}</span>
      </div>
      <div class="card-title">${esc(dataset.name)}</div>
      <div class="card-desc">${esc(dataset.description)}</div>
      <div class="card-tags">${tags}${extra}</div>
      <div class="card-meta">
        <span>${esc(source.name)}</span>
        <span>·</span>
        <span>${esc(dataset.last_confirmed)}</span>
      </div>
    </article>`;
}

function openModal(sourceId, datasetId) {
  const source = catalog.sources.find((s) => s.id === sourceId);
  if (!source) return;
  const dataset = source.datasets.find((d) => d.id === datasetId);
  if (!dataset) return;

  const tags = dataset.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  const formats = source.formats.map((f) => `<span class="tag">${esc(f)}</span>`).join("");

  const apiRow = source.api?.available
    ? `<tr><th>API</th><td>${source.api.docs_url ? `<a href="${esc(source.api.docs_url)}" target="_blank" rel="noopener">ドキュメント</a>` : "利用可能"}</td></tr>`
    : "";

  const notesRow = dataset.notes
    ? `<tr><th>備考</th><td>${esc(dataset.notes)}</td></tr>`
    : "";

  const freqRow = dataset.update_frequency
    ? `<tr><th>更新頻度</th><td>${esc(dataset.update_frequency)}</td></tr>`
    : "";

  $("#modal-body").innerHTML = `
    <div class="modal-source-name" data-category="${esc(source.category)}" style="color: var(--c-${esc(source.category)})">${esc(source.provider)}</div>
    <h2>${esc(dataset.name)}</h2>
    <p class="modal-desc">${esc(dataset.description)}</p>

    <h3>タグ</h3>
    <div class="modal-tags">${tags}</div>

    <h3>データセット情報</h3>
    <table class="detail-table">
      <tr><th>URL</th><td><a href="${esc(dataset.url)}" target="_blank" rel="noopener">${esc(dataset.url)}</a></td></tr>
      <tr><th>アクセス方法</th><td><span class="badge badge-${esc(dataset.access_method)}">${esc(dataset.access_method)}</span></td></tr>
      ${freqRow}
      <tr><th>最終確認</th><td>${esc(dataset.last_confirmed)}</td></tr>
      ${notesRow}
    </table>

    <h3>ソース情報</h3>
    <table class="detail-table">
      <tr><th>ソース名</th><td>${esc(source.name)}</td></tr>
      <tr><th>URL</th><td><a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.url)}</a></td></tr>
      <tr><th>提供元</th><td>${esc(source.provider)}</td></tr>
      <tr><th>カテゴリ</th><td>${esc(source.category)}</td></tr>
      <tr><th>フォーマット</th><td>${formats}</td></tr>
      ${apiRow}
    </table>
  `;

  $("#modal-overlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  $("#modal-overlay").classList.remove("open");
  document.body.style.overflow = "";
}

function bindEvents() {
  // 検索
  let timer;
  $("#search").addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      searchQuery = e.target.value.trim();
      render();
    }, 200);
  });

  // カテゴリフィルタ
  for (const btn of $$(".filter-btn")) {
    btn.addEventListener("click", () => {
      $$(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeCategory = btn.dataset.category;
      render();
    });
  }

  // カードクリック → モーダル
  $("#grid").addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (!card) return;
    openModal(card.dataset.sourceId, card.dataset.datasetId);
  });

  // モーダル閉じる
  $("#modal-close").addEventListener("click", closeModal);
  $("#modal-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

/** HTML エスケープ */
function esc(str) {
  if (typeof str !== "string") return String(str ?? "");
  const el = document.createElement("span");
  el.textContent = str;
  return el.innerHTML;
}

init();

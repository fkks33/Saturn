/**
 * カラマツトレイン 京都・天使突抜店 MINI入荷速報
 * Material 3 Expressive Monotone Application
 */

(function () {
  'use strict';

  // State
  let allProducts = [];
  let filteredProducts = [];
  let currentCategory = 'all';
  let searchQuery = '';
  let availableOnly = false;
  let currentSort = 'newest'; // 案B: 新着順（デフォルト）
  let currentPage = 1;
  const ITEMS_PER_PAGE = 24;

  // Lightbox Modal State
  let currentModalImages = [];
  let currentModalIndex = 0;

  // DOM Elements
  const htmlEl = document.documentElement;
  const themeToggle = document.getElementById('themeToggle');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearch');
  const availableOnlyToggle = document.getElementById('availableOnlyToggle');
  const sortSelect = document.getElementById('sortSelect');
  const categoryChipsContainer = document.getElementById('categoryChips');
  const productGrid = document.getElementById('productGrid');
  const productCount = document.getElementById('productCount');
  const emptyState = document.getElementById('emptyState');
  const resetFiltersBtn = document.getElementById('resetFiltersBtn');
  const paginationWrapper = document.getElementById('paginationWrapper');
  const loadMoreBtn = document.getElementById('loadMoreBtn');

  // Modal Elements
  const imageModal = document.getElementById('imageModal');
  const modalBackdrop = document.getElementById('modalBackdrop');
  const modalClose = document.getElementById('modalClose');
  const modalImg = document.getElementById('modalImg');
  const modalPrev = document.getElementById('modalPrev');
  const modalNext = document.getElementById('modalNext');
  const modalCaption = document.getElementById('modalCaption');
  const modalCounter = document.getElementById('modalCounter');

  /* --------------------------------------------------------------------------
     Theme Management (Light / Dark Mode)
     -------------------------------------------------------------------------- */
  function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
    setTheme(initialTheme);

    themeToggle.addEventListener('click', () => {
      const currentTheme = htmlEl.getAttribute('data-theme');
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      setTheme(nextTheme);
    });

    // Listen to OS theme changes if not explicitly set
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  function setTheme(theme) {
    htmlEl.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    const icon = themeToggle.querySelector('.theme-icon');
    if (icon) {
      icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
    }
  }

  /* --------------------------------------------------------------------------
     Data Fetching & Initialization
     -------------------------------------------------------------------------- */
  async function loadProducts() {
    try {
      const res = await fetch('products.json');
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      allProducts = await res.json();
      
      setupCategoryChips();
      applyFiltersAndSort();
    } catch (err) {
      console.error('Failed to load products.json:', err);
      productCount.textContent = 'データの読み込みに失敗しました';
      emptyState.style.display = 'block';
    }
  }

  /* --------------------------------------------------------------------------
     Category Chips Setup
     -------------------------------------------------------------------------- */
  function setupCategoryChips() {
    const categories = new Set();
    allProducts.forEach(p => {
      if (p.category && p.category !== 'その他') {
        categories.add(p.category);
      }
    });

    // Sort categories by item count descending
    const catCounts = {};
    allProducts.forEach(p => {
      const c = p.category || 'その他';
      catCounts[c] = (catCounts[c] || 0) + 1;
    });

    const sortedCats = Array.from(categories).sort((a, b) => (catCounts[b] || 0) - (catCounts[a] || 0));

    // Clear except 'all'
    categoryChipsContainer.innerHTML = '<button class="chip active" data-category="all">すべて</button>';

    sortedCats.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.dataset.category = cat;
      btn.textContent = `${cat} (${catCounts[cat]})`;
      categoryChipsContainer.appendChild(btn);
    });

    categoryChipsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      categoryChipsContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentCategory = chip.dataset.category;
      currentPage = 1;
      applyFiltersAndSort();
    });
  }

  /* --------------------------------------------------------------------------
     Filtering & Sorting Logic
     -------------------------------------------------------------------------- */
  function applyFiltersAndSort() {
    // 1. Filtering
    filteredProducts = allProducts.filter(item => {
      // Category
      if (currentCategory !== 'all' && item.category !== currentCategory) {
        return false;
      }
      // Available Only
      if (availableOnly && !item.is_available) {
        return false;
      }
      // Search Query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const idMatch = item.id && item.id.toLowerCase().includes(q);
        const titleMatch = item.title && item.title.toLowerCase().includes(q);
        const descMatch = item.description && item.description.toLowerCase().includes(q);
        const catMatch = item.category && item.category.toLowerCase().includes(q);
        if (!idMatch && !titleMatch && !descMatch && !catMatch) {
          return false;
        }
      }
      return true;
    });

    // 2. Sorting
    filteredProducts.sort((a, b) => {
      if (currentSort === 'newest') {
        // 案B: 完全新着順（最新ページ・管理番号降順）
        const numA = parseInt(a.id.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.id.replace(/\D/g, ''), 10) || 0;
        return numB - numA;
      } else if (currentSort === 'available_first') {
        // 案A: 販売中優先 ＋ 新着順
        if (a.is_available !== b.is_available) {
          return a.is_available ? -1 : 1;
        }
        const numA = parseInt(a.id.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.id.replace(/\D/g, ''), 10) || 0;
        return numB - numA;
      } else if (currentSort === 'price_asc') {
        return (a.price || 0) - (b.price || 0);
      } else if (currentSort === 'price_desc') {
        return (b.price || 0) - (a.price || 0);
      } else if (currentSort === 'id_asc') {
        const numA = parseInt(a.id.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.id.replace(/\D/g, ''), 10) || 0;
        return numA - numB;
      }
      return 0;
    });

    // Update Status Bar
    productCount.textContent = `表示中: ${filteredProducts.length} 件 (全 ${allProducts.length} 件)`;

    // Render Grid
    renderProducts();
  }

  /* --------------------------------------------------------------------------
     DOM Rendering
     -------------------------------------------------------------------------- */
  function renderProducts() {
    productGrid.innerHTML = '';

    if (filteredProducts.length === 0) {
      emptyState.style.display = 'block';
      paginationWrapper.style.display = 'none';
      return;
    }

    emptyState.style.display = 'none';

    const itemsToDisplay = filteredProducts.slice(0, currentPage * ITEMS_PER_PAGE);

    const fragment = document.createDocumentFragment();
    itemsToDisplay.forEach((item, index) => {
      fragment.appendChild(createProductCard(item, index));
    });
    productGrid.appendChild(fragment);

    // Pagination Button
    if (itemsToDisplay.length < filteredProducts.length) {
      paginationWrapper.style.display = 'flex';
      loadMoreBtn.textContent = `さらに表示する (残り ${filteredProducts.length - itemsToDisplay.length} 件)`;
    } else {
      paginationWrapper.style.display = 'none';
    }
  }

  function createProductCard(item, index) {
    const card = document.createElement('article');
    card.className = `product-card ${item.is_available ? 'available' : 'soldout'}`;

    const images = item.images && item.images.length > 0 ? item.images : ['logo2.gif'];
    const mainImgUrl = images[0];

    // Card Media Area
    const mediaDiv = document.createElement('div');
    mediaDiv.className = 'card-media';

    // Main Image
    const mainImgWrapper = document.createElement('div');
    mainImgWrapper.className = 'card-main-img-wrapper';
    mainImgWrapper.title = 'タップして画像を拡大';

    const mainImg = document.createElement('img');
    mainImg.className = 'card-main-img';
    mainImg.src = mainImgUrl;
    mainImg.alt = item.title || item.id;
    mainImg.loading = 'lazy';
    mainImgWrapper.appendChild(mainImg);

    // Badges Overlay
    const badgesDiv = document.createElement('div');
    badgesDiv.className = 'card-badges';

    const statusBadge = document.createElement('span');
    statusBadge.className = `badge ${item.is_available ? 'badge-available' : 'badge-soldout'}`;
    statusBadge.textContent = item.is_available ? '販売中' : 'SOLD OUT';

    const pageBadge = document.createElement('span');
    pageBadge.className = 'badge badge-page';
    pageBadge.textContent = item.page ? `P.${item.page}` : '';

    badgesDiv.appendChild(statusBadge);
    if (item.page) badgesDiv.appendChild(pageBadge);
    mediaDiv.appendChild(badgesDiv);
    mediaDiv.appendChild(mainImgWrapper);

    // Click Main Image to open Lightbox
    mainImgWrapper.addEventListener('click', () => {
      openModal(images, 0, `${item.id} - ${item.title}`);
    });

    // Thumbnails (if multiple images)
    if (images.length > 1) {
      const thumbsDiv = document.createElement('div');
      thumbsDiv.className = 'card-thumbs';

      images.forEach((imgUrl, idx) => {
        const thumbBtn = document.createElement('div');
        thumbBtn.className = `card-thumb ${idx === 0 ? 'active' : ''}`;
        const thumbImg = document.createElement('img');
        thumbImg.src = imgUrl;
        thumbImg.alt = `画像 ${idx + 1}`;
        thumbImg.loading = 'lazy';
        thumbBtn.appendChild(thumbImg);

        // Hover or click thumb to switch main image
        const activateThumb = () => {
          mainImg.src = imgUrl;
          thumbsDiv.querySelectorAll('.card-thumb').forEach(t => t.classList.remove('active'));
          thumbBtn.classList.add('active');
        };

        thumbBtn.addEventListener('mouseenter', activateThumb);
        thumbBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          activateThumb();
          openModal(images, idx, `${item.id} - ${item.title}`);
        });

        thumbsDiv.appendChild(thumbBtn);
      });

      mediaDiv.appendChild(thumbsDiv);
    }

    card.appendChild(mediaDiv);

    // Card Content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'card-content';

    // Header (ID & Category)
    const headerDiv = document.createElement('div');
    headerDiv.className = 'card-header';

    const idSpan = document.createElement('span');
    idSpan.className = 'card-id';
    idSpan.textContent = item.id;

    const catSpan = document.createElement('span');
    catSpan.className = 'card-category';
    catSpan.textContent = item.category ? `【${item.category}】` : '';

    headerDiv.appendChild(idSpan);
    headerDiv.appendChild(catSpan);
    contentDiv.appendChild(headerDiv);

    // Title
    const titleH2 = document.createElement('h2');
    titleH2.className = 'card-title';
    titleH2.textContent = item.title ? `「${item.title}」` : item.id;
    contentDiv.appendChild(titleH2);

    // Details Accordion
    if (item.description) {
      const detailsDiv = document.createElement('div');
      detailsDiv.className = 'card-details';

      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'details-toggle';
      toggleBtn.innerHTML = `<span>詳細を見る</span><span class="material-symbols-outlined" style="font-size: 16px;">expand_more</span>`;

      const detailsContent = document.createElement('div');
      detailsContent.className = 'details-content';
      detailsContent.textContent = item.description;

      toggleBtn.addEventListener('click', () => {
        const isOpen = detailsContent.classList.toggle('open');
        toggleBtn.querySelector('span:first-child').textContent = isOpen ? '閉じる' : '詳細を見る';
        toggleBtn.querySelector('.material-symbols-outlined').textContent = isOpen ? 'expand_less' : 'expand_more';
      });

      detailsDiv.appendChild(toggleBtn);
      detailsDiv.appendChild(detailsContent);
      contentDiv.appendChild(detailsDiv);
    }

    // Price Row
    const priceRow = document.createElement('div');
    priceRow.className = 'card-price-row';

    const priceDiv = document.createElement('div');
    if (item.price) {
      priceDiv.innerHTML = `<span class="card-price">¥${item.price.toLocaleString()}</span><span class="card-price-unit">(税込)</span>`;
    } else {
      priceDiv.innerHTML = `<span class="card-price">${item.price_raw || '要問合せ'}</span>`;
    }

    priceRow.appendChild(priceDiv);
    contentDiv.appendChild(priceRow);
    card.appendChild(contentDiv);

    return card;
  }

  /* --------------------------------------------------------------------------
     Modal / Lightbox
     -------------------------------------------------------------------------- */
  function openModal(images, index, caption) {
    currentModalImages = images;
    currentModalIndex = index;
    modalCaption.textContent = caption || '';
    updateModalImage();
    imageModal.classList.add('active');
    imageModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    imageModal.classList.remove('active');
    imageModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function updateModalImage() {
    if (!currentModalImages.length) return;
    modalImg.src = currentModalImages[currentModalIndex];
    modalCounter.textContent = `${currentModalIndex + 1} / ${currentModalImages.length}`;
    modalPrev.style.visibility = currentModalImages.length > 1 ? 'visible' : 'hidden';
    modalNext.style.visibility = currentModalImages.length > 1 ? 'visible' : 'hidden';
  }

  function nextModalImage() {
    if (currentModalImages.length <= 1) return;
    currentModalIndex = (currentModalIndex + 1) % currentModalImages.length;
    updateModalImage();
  }

  function prevModalImage() {
    if (currentModalImages.length <= 1) return;
    currentModalIndex = (currentModalIndex - 1 + currentModalImages.length) % currentModalImages.length;
    updateModalImage();
  }

  /* --------------------------------------------------------------------------
     Event Listeners
     -------------------------------------------------------------------------- */
  function setupEventListeners() {
    // Search
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      searchQuery = e.target.value.trim();
      clearSearchBtn.style.display = searchQuery ? 'flex' : 'none';
      debounceTimer = setTimeout(() => {
        currentPage = 1;
        applyFiltersAndSort();
      }, 250);
    });

    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      clearSearchBtn.style.display = 'none';
      currentPage = 1;
      applyFiltersAndSort();
      searchInput.focus();
    });

    // Available Only Toggle
    availableOnlyToggle.addEventListener('change', (e) => {
      availableOnly = e.target.checked;
      currentPage = 1;
      applyFiltersAndSort();
    });

    // Sort Select
    sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      currentPage = 1;
      applyFiltersAndSort();
    });

    // Reset Filters
    resetFiltersBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      clearSearchBtn.style.display = 'none';
      availableOnlyToggle.checked = false;
      availableOnly = false;
      sortSelect.value = 'newest';
      currentSort = 'newest';
      currentCategory = 'all';
      categoryChipsContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      categoryChipsContainer.querySelector('.chip[data-category="all"]').classList.add('active');
      currentPage = 1;
      applyFiltersAndSort();
    });

    // Pagination Load More
    loadMoreBtn.addEventListener('click', () => {
      currentPage++;
      renderProducts();
    });

    // Modal Events
    modalClose.addEventListener('click', closeModal);
    modalBackdrop.addEventListener('click', closeModal);
    modalPrev.addEventListener('click', prevModalImage);
    modalNext.addEventListener('click', nextModalImage);

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!imageModal.classList.contains('active')) return;
      if (e.key === 'Escape') closeModal();
      else if (e.key === 'ArrowRight') nextModalImage();
      else if (e.key === 'ArrowLeft') prevModalImage();
    });
  }

  /* --------------------------------------------------------------------------
     Entry Point
     -------------------------------------------------------------------------- */
  initTheme();
  setupEventListeners();
  loadProducts();
})();

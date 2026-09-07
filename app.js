/**
 * カラマツトレイン 京都・天使突抜店 MINI入荷速報
 * Material 3 Expressive Monotone Application
 */

(function () {
  'use strict';

  // Current Tab State: 'home' | 'search' | 'bookmarks'
  let currentTab = 'home';

  // Filter / Query State
  let allProducts = [];
  let filteredProducts = [];
  let currentCategory = 'all';
  let searchQuery = '';
  let availableOnly = false;
  let currentSort = 'newest'; // 案B: 新着順（デフォルト）
  let currentPage = 1;
  const ITEMS_PER_PAGE = 24;

  // Bookmarks (Set of product IDs stored in localStorage)
  let bookmarks = new Set();

  // Active Detail Modal State
  let activeModalItem = null;
  let activeModalImgIndex = 0;

  // DOM Elements
  const htmlEl = document.documentElement;
  const themeToggle = document.getElementById('themeToggle');
  const navTabs = document.querySelectorAll('.nav-item[data-tab]');
  const navBookmarkBadge = document.getElementById('navBookmarkBadge');
  const searchSection = document.getElementById('searchSection');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearch');
  const controlsSection = document.getElementById('controlsSection');
  const availableOnlyToggle = document.getElementById('availableOnlyToggle');
  const sortSelect = document.getElementById('sortSelect');
  const categoryChipsContainer = document.getElementById('categoryChips');
  const productGrid = document.getElementById('productGrid');
  const productCount = document.getElementById('productCount');
  const emptyState = document.getElementById('emptyState');
  const emptyTitle = document.getElementById('emptyTitle');
  const emptyDesc = document.getElementById('emptyDesc');
  const resetFiltersBtn = document.getElementById('resetFiltersBtn');
  const paginationWrapper = document.getElementById('paginationWrapper');
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  const toastEl = document.getElementById('toast');

  // Detail Modal Elements
  const detailModal = document.getElementById('detailModal');
  const detailBackdrop = document.getElementById('detailBackdrop');
  const detailCloseBtn = document.getElementById('detailCloseBtn');
  const detailBookmarkBtn = document.getElementById('detailBookmarkBtn');
  const detailIdBadge = document.getElementById('detailIdBadge');
  const detailMainImg = document.getElementById('detailMainImg');
  const detailPrevImg = document.getElementById('detailPrevImg');
  const detailNextImg = document.getElementById('detailNextImg');
  const detailImgCounter = document.getElementById('detailImgCounter');
  const detailThumbs = document.getElementById('detailThumbs');
  const detailCategory = document.getElementById('detailCategory');
  const detailTitle = document.getElementById('detailTitle');
  const detailPriceBox = document.getElementById('detailPriceBox');
  const detailDescText = document.getElementById('detailDescText');

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
     Navigation Tabs ('home', 'search', 'bookmarks')
     -------------------------------------------------------------------------- */
  function switchTab(tabName) {
    currentTab = tabName;
    navTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    if (tabName === 'search') {
      searchSection.style.display = 'block';
      searchInput.focus();
    } else if (tabName === 'bookmarks') {
      searchSection.style.display = 'none';
      searchQuery = '';
      searchInput.value = '';
      clearSearchBtn.style.display = 'none';
    } else { // 'home'
      searchSection.style.display = 'block';
    }

    currentPage = 1;
    applyFiltersAndSort();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* --------------------------------------------------------------------------
     Bookmarks Management (localStorage)
     -------------------------------------------------------------------------- */
  function loadBookmarks() {
    try {
      const raw = localStorage.getItem('karamatsu_bookmarks');
      if (raw) {
        bookmarks = new Set(JSON.parse(raw));
      }
    } catch (e) {
      bookmarks = new Set();
    }
    updateBookmarkCountUI();
  }

  function saveBookmarks() {
    localStorage.setItem('karamatsu_bookmarks', JSON.stringify(Array.from(bookmarks)));
    updateBookmarkCountUI();
  }

  function toggleBookmark(itemId) {
    const isAdded = !bookmarks.has(itemId);
    if (isAdded) {
      bookmarks.add(itemId);
      showToast('ブックマークに追加しました');
    } else {
      bookmarks.delete(itemId);
      showToast('ブックマークを解除しました');
    }
    saveBookmarks();
    updateModalBookmarkBtn();
    applyFiltersAndSort();
    return isAdded;
  }

  function updateBookmarkCountUI() {
    if (navBookmarkBadge) {
      if (bookmarks.size > 0) {
        navBookmarkBadge.textContent = bookmarks.size;
        navBookmarkBadge.style.display = 'inline-block';
      } else {
        navBookmarkBadge.style.display = 'none';
      }
    }
  }

  /* --------------------------------------------------------------------------
     Toast Notification
     -------------------------------------------------------------------------- */
  let toastTimer;
  function showToast(msg) {
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2200);
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

    const catCounts = {};
    allProducts.forEach(p => {
      const c = p.category || 'その他';
      catCounts[c] = (catCounts[c] || 0) + 1;
    });

    const sortedCats = Array.from(categories).sort((a, b) => (catCounts[b] || 0) - (catCounts[a] || 0));

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
    filteredProducts = allProducts.filter(item => {
      // 1. Tab filter (Bookmarks view)
      if (currentTab === 'bookmarks') {
        if (!bookmarks.has(item.id)) return false;
      }

      // 2. Category
      if (currentCategory !== 'all' && item.category !== currentCategory) {
        return false;
      }

      // 3. Available Only
      if (availableOnly && !item.is_available) {
        return false;
      }

      // 4. Search Query (Home or Search view)
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

    // Sorting
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

    // Status text
    const tabLabel = currentTab === 'bookmarks' ? 'ブックマーク' : (currentTab === 'search' ? '検索結果' : '全商品');
    productCount.textContent = `${tabLabel}: ${filteredProducts.length} 件 (全 ${allProducts.length} 件)`;

    renderProducts();
  }

  /* --------------------------------------------------------------------------
     DOM Rendering (Cards)
     -------------------------------------------------------------------------- */
  function renderProducts() {
    productGrid.innerHTML = '';
    closeAllCardMenus();

    if (filteredProducts.length === 0) {
      emptyState.style.display = 'block';
      if (currentTab === 'bookmarks') {
        emptyTitle.textContent = 'ブックマークされた商品がありません';
        emptyDesc.textContent = '商品カード右上のメニュー（︙）からブックマークに追加できます。';
      } else {
        emptyTitle.textContent = '該当する商品が見つかりませんでした';
        emptyDesc.textContent = '検索条件やカテゴリを変更してお試しください。';
      }
      paginationWrapper.style.display = 'none';
      return;
    }

    emptyState.style.display = 'none';

    const itemsToDisplay = filteredProducts.slice(0, currentPage * ITEMS_PER_PAGE);

    const fragment = document.createDocumentFragment();
    itemsToDisplay.forEach((item) => {
      fragment.appendChild(createProductCard(item));
    });
    productGrid.appendChild(fragment);

    // Pagination
    if (itemsToDisplay.length < filteredProducts.length) {
      paginationWrapper.style.display = 'flex';
      loadMoreBtn.textContent = `さらに表示する (残り ${filteredProducts.length - itemsToDisplay.length} 件)`;
    } else {
      paginationWrapper.style.display = 'none';
    }
  }

  function createProductCard(item) {
    const card = document.createElement('article');
    const isSoldOut = !item.is_available;
    const isBookmarked = bookmarks.has(item.id);

    // 売り切れの場合はグレーアウト (soldoutクラス)
    card.className = `product-card ${isSoldOut ? 'soldout' : 'available'}`;
    card.dataset.id = item.id;

    const images = item.images && item.images.length > 0 ? item.images : [];
    const mainImgUrl = images[0] || '';

    // 1. Media Area
    const mediaDiv = document.createElement('div');
    mediaDiv.className = 'card-media';

    // Main Image Box (SOLD OUT文字やスタンプは不要)
    const mainImgWrapper = document.createElement('div');
    mainImgWrapper.className = 'card-main-img-wrapper';

    const mainImg = document.createElement('img');
    mainImg.className = 'card-main-img';
    mainImg.src = mainImgUrl;
    mainImg.alt = item.title || item.id;
    mainImg.loading = 'lazy';
    mainImgWrapper.appendChild(mainImg);
    mediaDiv.appendChild(mainImgWrapper);

    // Header Overlays (Only Three Dots Menu, NO page badge, NO status overlay badges)
    const headerBar = document.createElement('div');
    headerBar.className = 'card-header-bar';

    const actionBox = document.createElement('div');
    actionBox.className = 'card-action-box';

    const moreBtn = document.createElement('button');
    moreBtn.className = 'card-more-btn';
    moreBtn.setAttribute('aria-label', 'メニュー');
    moreBtn.title = '操作メニュー';
    moreBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 20px;">more_vert</span>`;

    if (isBookmarked) {
      const bmIndicator = document.createElement('span');
      bmIndicator.className = 'card-bookmark-indicator';
      bmIndicator.innerHTML = `★`;
      moreBtn.appendChild(bmIndicator);
    }

    // Dropdown Menu
    const dropdown = document.createElement('div');
    dropdown.className = 'card-dropdown-menu';

    // Menu Item 1: Bookmark
    const bmItem = document.createElement('button');
    bmItem.className = 'menu-item';
    bmItem.innerHTML = `<span class="material-symbols-outlined">${isBookmarked ? 'bookmark_remove' : 'bookmark_add'}</span><span>${isBookmarked ? 'ブックマーク解除' : 'ブックマークに追加'}</span>`;
    bmItem.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.remove('show');
      toggleBookmark(item.id);
    });

    // Menu Item 2: Copy ID
    const copyItem = document.createElement('button');
    copyItem.className = 'menu-item';
    copyItem.innerHTML = `<span class="material-symbols-outlined">content_copy</span><span>管理番号をコピー</span>`;
    copyItem.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.remove('show');
      navigator.clipboard.writeText(item.id).then(() => {
        showToast(`管理番号「${item.id}」をコピーしました`);
      });
    });

    // Menu Item 3: Open Details
    const detailItem = document.createElement('button');
    detailItem.className = 'menu-item';
    detailItem.innerHTML = `<span class="material-symbols-outlined">visibility</span><span>詳細を見る</span>`;
    detailItem.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.remove('show');
      openDetailModal(item);
    });

    dropdown.appendChild(bmItem);
    dropdown.appendChild(copyItem);
    dropdown.appendChild(detailItem);

    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = dropdown.classList.contains('show');
      closeAllCardMenus();
      if (!wasOpen) {
        dropdown.classList.add('show');
      }
    });

    actionBox.appendChild(moreBtn);
    actionBox.appendChild(dropdown);
    headerBar.appendChild(actionBox);
    mediaDiv.appendChild(headerBar);

    // Thumbnails on Card (if > 1 image)
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

        thumbBtn.addEventListener('mouseenter', (e) => {
          mainImg.src = imgUrl;
          thumbsDiv.querySelectorAll('.card-thumb').forEach(t => t.classList.remove('active'));
          thumbBtn.classList.add('active');
        });

        thumbsDiv.appendChild(thumbBtn);
      });

      mediaDiv.appendChild(thumbsDiv);
    }

    card.appendChild(mediaDiv);

    // 2. Card Content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'card-content';

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

    // 販売中の場合のみ card-status-label available を表示、売り切れ時は文字非表示
    if (!isSoldOut) {
      const statusLabel = document.createElement('span');
      statusLabel.className = 'card-status-label available';
      statusLabel.textContent = '販売中';
      priceRow.appendChild(statusLabel);
    }

    contentDiv.appendChild(priceRow);
    card.appendChild(contentDiv);

    // Clicking anywhere on card opens Detail Popup Modal
    card.addEventListener('click', () => {
      openDetailModal(item);
    });

    return card;
  }

  function closeAllCardMenus() {
    document.querySelectorAll('.card-dropdown-menu.show').forEach(m => m.classList.remove('show'));
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.card-action-box')) {
      closeAllCardMenus();
    }
  });

  /* --------------------------------------------------------------------------
     Product Detail Modal (ポップアップダイアログ)
     -------------------------------------------------------------------------- */
  function openDetailModal(item) {
    activeModalItem = item;
    activeModalImgIndex = 0;

    // Header Badges
    detailIdBadge.textContent = item.id;

    // Bookmark button in modal
    updateModalBookmarkBtn();

    // Category & Title
    detailCategory.textContent = item.category ? `【${item.category}】` : '';
    detailTitle.textContent = item.title ? `「${item.title}」` : item.id;

    // Price
    if (item.price) {
      detailPriceBox.innerHTML = `
        <span class="detail-price-val ${!item.is_available ? 'soldout' : ''}">¥${item.price.toLocaleString()}</span>
        <span class="card-price-unit">(税込)</span>
        ${item.is_available ? '<span class="card-status-label available" style="margin-left:8px;">販売中</span>' : ''}
      `;
    } else {
      detailPriceBox.innerHTML = `<span class="detail-price-val">${item.price_raw || '要問合せ'}</span>`;
    }

    // Description
    detailDescText.textContent = item.description || '説明文はありません。';

    // Setup Gallery
    const images = item.images && item.images.length > 0 ? item.images : [];
    renderModalGallery(images);

    // Show modal
    detailModal.classList.add('active');
    detailModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function updateModalBookmarkBtn() {
    if (!activeModalItem) return;
    const isBookmarked = bookmarks.has(activeModalItem.id);
    const icon = detailBookmarkBtn.querySelector('.material-symbols-outlined');
    if (isBookmarked) {
      icon.textContent = 'bookmark';
      detailBookmarkBtn.title = 'ブックマークを解除';
      detailBookmarkBtn.style.color = 'var(--primary)';
    } else {
      icon.textContent = 'bookmark_border';
      detailBookmarkBtn.title = 'ブックマークに追加';
      detailBookmarkBtn.style.color = '';
    }
  }

  function renderModalGallery(images) {
    if (images.length === 0) {
      detailMainImg.src = '';
      detailThumbs.innerHTML = '';
      detailPrevImg.style.display = 'none';
      detailNextImg.style.display = 'none';
      detailImgCounter.style.display = 'none';
      return;
    }

    updateModalMainImg();

    // Thumbnails
    detailThumbs.innerHTML = '';
    if (images.length > 1) {
      detailPrevImg.style.display = 'flex';
      detailNextImg.style.display = 'flex';
      detailImgCounter.style.display = 'block';

      images.forEach((imgUrl, idx) => {
        const btn = document.createElement('div');
        btn.className = `detail-thumb-btn ${idx === activeModalImgIndex ? 'active' : ''}`;
        btn.innerHTML = `<img src="${imgUrl}" alt="サムネイル ${idx + 1}">`;
        btn.addEventListener('click', () => {
          activeModalImgIndex = idx;
          updateModalMainImg();
        });
        detailThumbs.appendChild(btn);
      });
    } else {
      detailPrevImg.style.display = 'none';
      detailNextImg.style.display = 'none';
      detailImgCounter.style.display = 'none';
    }
  }

  function updateModalMainImg() {
    if (!activeModalItem || !activeModalItem.images.length) return;
    const images = activeModalItem.images;
    detailMainImg.src = images[activeModalImgIndex];
    detailImgCounter.textContent = `${activeModalImgIndex + 1} / ${images.length}`;

    detailThumbs.querySelectorAll('.detail-thumb-btn').forEach((b, idx) => {
      b.classList.toggle('active', idx === activeModalImgIndex);
    });
  }

  function closeDetailModal() {
    detailModal.classList.remove('active');
    detailModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    activeModalItem = null;
  }

  /* --------------------------------------------------------------------------
     Event Listeners
     -------------------------------------------------------------------------- */
  function setupEventListeners() {
    // Navigation Tab Switching
    navTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        switchTab(tab.dataset.tab);
      });
    });

    // Search
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      searchQuery = e.target.value.trim();
      clearSearchBtn.style.display = searchQuery ? 'flex' : 'none';
      debounceTimer = setTimeout(() => {
        currentPage = 1;
        applyFiltersAndSort();
      }, 200);
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

    // Detail Modal Events
    detailCloseBtn.addEventListener('click', closeDetailModal);
    detailBackdrop.addEventListener('click', closeDetailModal);

    detailBookmarkBtn.addEventListener('click', () => {
      if (activeModalItem) {
        toggleBookmark(activeModalItem.id);
      }
    });

    detailPrevImg.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!activeModalItem || !activeModalItem.images.length) return;
      activeModalImgIndex = (activeModalImgIndex - 1 + activeModalItem.images.length) % activeModalItem.images.length;
      updateModalMainImg();
    });

    detailNextImg.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!activeModalItem || !activeModalItem.images.length) return;
      activeModalImgIndex = (activeModalImgIndex + 1) % activeModalItem.images.length;
      updateModalMainImg();
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!detailModal.classList.contains('active')) return;
      if (e.key === 'Escape') closeDetailModal();
      else if (e.key === 'ArrowRight') {
        if (activeModalItem && activeModalItem.images.length > 1) {
          activeModalImgIndex = (activeModalImgIndex + 1) % activeModalItem.images.length;
          updateModalMainImg();
        }
      } else if (e.key === 'ArrowLeft') {
        if (activeModalItem && activeModalItem.images.length > 1) {
          activeModalImgIndex = (activeModalImgIndex - 1 + activeModalItem.images.length) % activeModalItem.images.length;
          updateModalMainImg();
        }
      }
    });
  }

  /* --------------------------------------------------------------------------
     Entry Point
     -------------------------------------------------------------------------- */
  initTheme();
  loadBookmarks();
  setupEventListeners();
  loadProducts();
})();

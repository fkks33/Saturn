/**
 * カラマツトレイン 京都・天使突抜店 MINI入荷速報
 * Material 3 Expressive Monotone Application
 */

(function () {
  'use strict';

  // Current Tab State: 'home' | 'search' | 'bookmarks' | 'settings'
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

  // Guard to prevent card click when closing dropdown menu
  let menuJustClosed = false;

  // DOM Elements
  const htmlEl = document.documentElement;
  const navTabs = document.querySelectorAll('.nav-item[data-tab]');
  const navBookmarkBadge = document.getElementById('navBookmarkBadge');
  const searchSection = document.getElementById('searchSection');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearch');
  const quickKeywords = document.getElementById('quickKeywords');
  const controlsSection = document.getElementById('controlsSection');
  const productsSection = document.getElementById('productsSection');
  const settingsSection = document.getElementById('settingsSection');
  const darkModeToggle = document.getElementById('darkModeToggle');
  const refreshDataBtn = document.getElementById('refreshDataBtn');
  const summaryTotal = document.getElementById('summaryTotal');
  const summaryAvailable = document.getElementById('summaryAvailable');
  const summarySoldOut = document.getElementById('summarySoldOut');
  const summaryPages = document.getElementById('summaryPages');
  const crawlHistoryContainer = document.getElementById('crawlHistoryContainer');
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
  const detailSourceBtn = document.getElementById('detailSourceBtn');
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
     Theme Management (Light / Dark Mode in Settings)
     -------------------------------------------------------------------------- */
  function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
    setTheme(initialTheme);

    if (darkModeToggle) {
      darkModeToggle.checked = initialTheme === 'dark';
      darkModeToggle.addEventListener('change', (e) => {
        setTheme(e.target.checked ? 'dark' : 'light');
      });
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        const next = e.matches ? 'dark' : 'light';
        setTheme(next);
        if (darkModeToggle) darkModeToggle.checked = e.matches;
      }
    });
  }

  function setTheme(theme) {
    htmlEl.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    if (darkModeToggle) {
      darkModeToggle.checked = theme === 'dark';
    }
  }

  /* --------------------------------------------------------------------------
     Navigation Tabs ('home', 'search', 'bookmarks', 'settings')
     -------------------------------------------------------------------------- */
  function switchTab(tabName) {
    currentTab = tabName;
    navTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    if (tabName === 'home') {
      searchSection.style.display = 'none'; // ホームに検索バーは不要
      controlsSection.style.display = 'flex';
      productsSection.style.display = 'block';
      settingsSection.style.display = 'none';
      searchQuery = '';
      searchInput.value = '';
      clearSearchBtn.style.display = 'none';
    } else if (tabName === 'search') {
      searchSection.style.display = 'block'; // 検索タブで表示
      controlsSection.style.display = 'flex';
      productsSection.style.display = 'block';
      settingsSection.style.display = 'none';
      setTimeout(() => searchInput.focus(), 50);
    } else if (tabName === 'bookmarks') {
      searchSection.style.display = 'none';
      controlsSection.style.display = 'flex';
      productsSection.style.display = 'block';
      settingsSection.style.display = 'none';
      searchQuery = '';
      searchInput.value = '';
      clearSearchBtn.style.display = 'none';
    } else if (tabName === 'settings') {
      searchSection.style.display = 'none';
      controlsSection.style.display = 'none';
      productsSection.style.display = 'none';
      settingsSection.style.display = 'flex';
      updateDatabaseSummaryUI();
      loadCrawlHistory();
    }

    if (tabName !== 'settings') {
      currentPage = 1;
      applyFiltersAndSort();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* --------------------------------------------------------------------------
     Database Summary & Crawler History
     -------------------------------------------------------------------------- */
  function updateDatabaseSummaryUI() {
    if (!summaryTotal) return;
    const total = allProducts.length;
    const avail = allProducts.filter(p => p.is_available).length;
    const sold = total - avail;
    const pages = new Set(allProducts.map(p => p.page).filter(Boolean)).size;

    summaryTotal.textContent = total.toLocaleString() + ' 件';
    summaryAvailable.textContent = avail.toLocaleString() + ' 件';
    summarySoldOut.textContent = sold.toLocaleString() + ' 件';
    summaryPages.textContent = pages + ' ページ';
  }

  async function loadCrawlHistory() {
    if (!crawlHistoryContainer) return;
    try {
      const res = await fetch('crawl_history.json?' + new Date().getTime());
      if (!res.ok) throw new Error('履歴なし');
      const history = await res.json();
      renderCrawlHistory(history);
    } catch (err) {
      crawlHistoryContainer.innerHTML = '<div class="history-loading">実行履歴はまだありません。</div>';
    }
  }

  function renderCrawlHistory(history) {
    if (!history || history.length === 0) {
      crawlHistoryContainer.innerHTML = '<div class="history-loading">実行履歴はありません。</div>';
      return;
    }

    crawlHistoryContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();

    history.slice(0, 20).forEach(item => {
      const div = document.createElement('div');
      div.className = 'history-item';

      const minP = item.pages_crawled && item.pages_crawled.length ? Math.min(...item.pages_crawled) : '-';
      const maxP = item.pages_crawled && item.pages_crawled.length ? Math.max(...item.pages_crawled) : '-';
      const pagesStr = minP !== '-' ? `Page ${minP} 〜 ${maxP} (計 ${item.pages_crawled.length} ページ)` : '全ページ';

      div.innerHTML = `
        <div class="history-item-top">
          <span class="history-time">${item.timestamp || '日時不明'}</span>
          <span class="history-status">完了</span>
        </div>
        <div class="history-details">
          <span>商品総数: <strong>${item.total_items ? item.total_items.toLocaleString() : 0} 件</strong></span>
          <span>差分更新: <strong>${item.updated_count ? item.updated_count.toLocaleString() : 0} 件</strong></span>
        </div>
        <div class="history-pages">巡回対象: ${pagesStr}</div>
      `;
      fragment.appendChild(div);
    });

    crawlHistoryContainer.appendChild(fragment);
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
      const res = await fetch('products.json?' + new Date().getTime());
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      allProducts = await res.json();
      
      setupCategoryChips();
      applyFiltersAndSort();
      updateDatabaseSummaryUI();
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
    if (currentTab === 'settings') return;

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

      // 4. Search Query
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

    card.className = `product-card ${isSoldOut ? 'soldout' : 'available'}`;
    card.dataset.id = item.id;
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${item.title || item.id} の詳細を表示`);

    const images = item.images && item.images.length > 0 ? item.images : [];
    const mainImgUrl = images[0] || '';

    // 1. Media Area
    const mediaDiv = document.createElement('div');
    mediaDiv.className = 'card-media';

    // Main Image Box
    const mainImgWrapper = document.createElement('div');
    mainImgWrapper.className = 'card-main-img-wrapper';

    if (mainImgUrl) {
      const mainImg = document.createElement('img');
      mainImg.className = 'card-main-img';
      mainImg.src = mainImgUrl;
      mainImg.alt = item.title || item.id;
      mainImg.loading = 'lazy';
      mainImgWrapper.appendChild(mainImg);
    } else {
      mainImgWrapper.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;color:#666;height:100%;">
          <span class="material-symbols-outlined" style="font-size:36px;">image_not_supported</span>
          <span style="font-size:11px;margin-top:4px;">NO IMAGE</span>
        </div>
      `;
    }
    mediaDiv.appendChild(mainImgWrapper);

    // Header Overlays (Three Dots Menu only)
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

    // Menu Item 2: Open Source Page (元ページを開く)
    const sourceItem = document.createElement('button');
    sourceItem.className = 'menu-item';
    sourceItem.innerHTML = `<span class="material-symbols-outlined">open_in_new</span><span>元ページを開く</span>`;
    sourceItem.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.remove('show');
      if (item.source_url) {
        window.open(item.source_url, '_blank');
      }
    });

    // Menu Item 3: Copy ID
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

    // Menu Item 4: Open Details
    const detailItem = document.createElement('button');
    detailItem.className = 'menu-item';
    detailItem.innerHTML = `<span class="material-symbols-outlined">visibility</span><span>詳細を見る</span>`;
    detailItem.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.remove('show');
      openDetailModal(item);
    });

    dropdown.appendChild(bmItem);
    dropdown.appendChild(sourceItem);
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

        const switchMainImg = (e) => {
          if (e) e.stopPropagation();
          const curMain = mainImgWrapper.querySelector('.card-main-img');
          if (curMain) curMain.src = imgUrl;
          thumbsDiv.querySelectorAll('.card-thumb').forEach(t => t.classList.remove('active'));
          thumbBtn.classList.add('active');
        };

        thumbBtn.addEventListener('mouseenter', switchMainImg);
        thumbBtn.addEventListener('click', switchMainImg);

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

    // 販売中のみ表示するラベル
    if (!isSoldOut) {
      const statusLabel = document.createElement('span');
      statusLabel.className = 'card-status-label available';
      statusLabel.textContent = '販売中';
      priceRow.appendChild(statusLabel);
    }

    contentDiv.appendChild(priceRow);
    card.appendChild(contentDiv);

    // Card Click Handler (メニュー閉じた直後は発火しないガード付き)
    const handleCardClick = () => {
      if (menuJustClosed) return;
      openDetailModal(item);
    };

    card.addEventListener('click', handleCardClick);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleCardClick();
      }
    });

    return card;
  }

  function closeAllCardMenus() {
    const openMenus = document.querySelectorAll('.card-dropdown-menu.show');
    if (openMenus.length > 0) {
      openMenus.forEach(m => m.classList.remove('show'));
      menuJustClosed = true;
      setTimeout(() => {
        menuJustClosed = false;
      }, 100);
    }
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

    // Source page button
    if (detailSourceBtn) {
      detailSourceBtn.onclick = () => {
        if (item.source_url) window.open(item.source_url, '_blank');
      };
    }

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

    // Search Input
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      searchQuery = e.target.value.trim();
      clearSearchBtn.style.display = searchQuery ? 'flex' : 'none';
      debounceTimer = setTimeout(() => {
        currentPage = 1;
        applyFiltersAndSort();
      }, 180);
    });

    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      clearSearchBtn.style.display = 'none';
      currentPage = 1;
      applyFiltersAndSort();
      searchInput.focus();
    });

    // Quick Keywords (人気検索チップ)
    if (quickKeywords) {
      quickKeywords.addEventListener('click', (e) => {
        const chip = e.target.closest('.quick-chip');
        if (!chip) return;
        const query = chip.dataset.query;
        searchInput.value = query;
        searchQuery = query;
        clearSearchBtn.style.display = 'flex';
        currentPage = 1;
        applyFiltersAndSort();
      });
    }

    // Refresh Data in Settings
    if (refreshDataBtn) {
      refreshDataBtn.addEventListener('click', () => {
        showToast('最新データを再読み込みしています...');
        loadProducts().then(() => {
          showToast('データを再読み込みしました');
        });
      });
    }

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

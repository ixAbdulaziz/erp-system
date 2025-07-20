document.addEventListener('DOMContentLoaded', () => {
  // Data arrays - to be populated from external API or data source
  let purchaseOrders = [];
  let invoices = [];
  let filteredPOs = [];
  let currentEditingPO = null;
  let currentLinkingPO = null;
  let currentDeletingPO = null;
  let searchResults = [];
  let selectedInvoice = null;
  
  // Supplier autocomplete variables
  let suppliers = [];
  let selectedSupplier = null;
  let highlightedIndex = -1;
  let searchTimeout;
  
  // DOM Elements
  const elements = {
    poContainer: document.getElementById('po-container'),
    poSearch: document.getElementById('po-search'),
    addPOBtn: document.getElementById('add-po-btn'),
    poModal: document.getElementById('po-modal'),
    modalTitle: document.getElementById('modal-title'),
    poSupplier: document.getElementById('po-supplier'),
    poSupplierSuggestions: document.getElementById('po-supplier-suggestions'),
    poSupplierWarning: document.getElementById('po-supplier-warning'),
    poSupplierContainer: document.querySelector('.autocomplete-container'),
    poDescription: document.getElementById('po-description'),
    poPrice: document.getElementById('po-price'),
    poPDF: document.getElementById('po-pdf'),
    savePOBtn: document.getElementById('save-po-btn'),
    cancelPOBtn: document.getElementById('cancel-po-btn'),
    linkInvoiceModal: document.getElementById('link-invoice-modal'),
    invoiceSearch: document.getElementById('invoice-search'),
    invoiceSearchResults: document.getElementById('invoice-search-results'),
    linkInvoiceBtn: document.getElementById('link-invoice-btn'),
    cancelLinkBtn: document.getElementById('cancel-link-btn'),
    deleteModal: document.getElementById('delete-modal'),
    confirmDeleteBtn: document.getElementById('confirm-delete-btn'),
    cancelDeleteBtn: document.getElementById('cancel-delete-btn'),
    pdfModal: document.getElementById('pdf-modal'),
    pdfViewer: document.getElementById('pdf-viewer'),
    closePdfBtn: document.getElementById('close-pdf-btn')
  };
  
  // Load suppliers from existing data
  function loadSuppliers() {
    // Get unique suppliers from invoices and purchase orders
    const invoiceSuppliers = invoices.map(inv => inv.supplier?.trim()).filter(Boolean);
    const poSuppliers = purchaseOrders.map(po => po.supplier?.trim()).filter(Boolean);
    
    suppliers = [...new Set([...invoiceSuppliers, ...poSuppliers])].sort();
  }
  
  // Fuzzy search function
  function fuzzySearch(query, text) {
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();
    
    // Direct match
    if (textLower.includes(queryLower)) {
      return { score: 100, match: true };
    }
    
    // Character-by-character matching
    let score = 0;
    let queryIndex = 0;
    
    for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
      if (textLower[i] === queryLower[queryIndex]) {
        score += 2;
        queryIndex++;
      }
    }
    
    // Bonus for matching at word boundaries
    const words = textLower.split(/\s+/);
    for (const word of words) {
      if (word.startsWith(queryLower)) {
        score += 10;
        break;
      }
    }
    
    return { 
      score: score, 
      match: queryIndex === queryLower.length && score > queryLower.length 
    };
  }
  
  // Search suppliers
  function searchSuppliers(query) {
    if (query.length < 2) return [];
    
    const results = suppliers
      .map(supplier => {
        const searchResult = fuzzySearch(query, supplier);
        return {
          name: supplier,
          score: searchResult.score,
          match: searchResult.match
        };
      })
      .filter(item => item.match)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    
    return results;
  }
  
  // Highlight matching text
  function highlightMatch(text, query) {
    if (!query) return text;
    
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<span class="autocomplete-match">$1</span>');
  }
  
  // Show suggestions
  function showSuggestions(suggestions) {
    const container = elements.poSupplierSuggestions;
    
    if (suggestions.length === 0) {
      container.innerHTML = '<div class="autocomplete-no-results">لا توجد نتائج مطابقة</div>';
      container.classList.add('show');
      return;
    }
    
    const suggestionHTML = suggestions.map((item, index) => {
      const highlightedName = highlightMatch(item.name, elements.poSupplier.value);
      return `
        <div class="autocomplete-item" data-index="${index}" data-supplier="${item.name}">
          <svg class="autocomplete-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-4m-5 0H3m2 0h4M9 7h6m-6 4h6m-6 4h6m-6 4h6"></path>
          </svg>
          <span>${highlightedName}</span>
        </div>
      `;
    }).join('');
    
    container.innerHTML = suggestionHTML;
    container.classList.add('show');
    highlightedIndex = -1;
  }
  
  // Hide suggestions
  function hideSuggestions() {
    elements.poSupplierSuggestions.classList.remove('show');
    highlightedIndex = -1;
  }
  
  // Show warning
  function showWarning(message) {
    elements.poSupplierWarning.textContent = message;
    elements.poSupplierWarning.classList.add('show');
    
    setTimeout(() => {
      elements.poSupplierWarning.classList.remove('show');
    }, 5000);
  }
  
  // Hide warning
  function hideWarning() {
    elements.poSupplierWarning.classList.remove('show');
  }
  
  // Select supplier
  function selectSupplier(supplierName) {
    elements.poSupplier.value = supplierName;
    selectedSupplier = supplierName;
    elements.poSupplierContainer.classList.add('selected');
    hideSuggestions();
    hideWarning();
    
    // Add success animation
    elements.poSupplier.style.animation = 'peacefulSuccess 0.6s ease-out';
    setTimeout(() => {
      elements.poSupplier.style.animation = '';
    }, 600);
  }
  
  // Handle keyboard navigation
  function handleKeyboardNavigation(e) {
    const items = elements.poSupplierSuggestions.querySelectorAll('.autocomplete-item');
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, items.length - 1);
      updateHighlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, -1);
      updateHighlight(items);
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      const selectedItem = items[highlightedIndex];
      if (selectedItem) {
        selectSupplier(selectedItem.dataset.supplier);
      }
    } else if (e.key === 'Escape') {
      hideSuggestions();
    }
  }
  
  // Update highlight
  function updateHighlight(items) {
    items.forEach((item, index) => {
      if (index === highlightedIndex) {
        item.classList.add('highlighted');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('highlighted');
      }
    });
  }
  
  // Initialize autocomplete
  function initAutocomplete() {
    loadSuppliers();
    
    // Input event handler
    elements.poSupplier.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      selectedSupplier = null;
      elements.poSupplierContainer.classList.remove('selected');
      
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
      
      if (query.length < 2) {
        hideSuggestions();
        hideWarning();
        return;
      }
      
      // Show loading state
      elements.poSupplierSuggestions.innerHTML = '<div class="autocomplete-loading">جاري البحث...</div>';
      elements.poSupplierSuggestions.classList.add('show');
      
      // Debounce search
      searchTimeout = setTimeout(() => {
        const suggestions = searchSuppliers(query);
        showSuggestions(suggestions);
        
        if (query.length > 3 && suggestions.length === 0) {
          showWarning('لم يتم العثور على موردين مطابقين. تحقق من الاسم لتفادي التكرار.');
        } else if (query.length > 3 && !suggestions.some(s => s.name.toLowerCase() === query.toLowerCase())) {
          showWarning('تحقق من الأسماء المقترحة لتفادي تكرار الموردين.');
        } else {
          hideWarning();
        }
      }, 300);
    });
    
    // Keyboard navigation
    elements.poSupplier.addEventListener('keydown', handleKeyboardNavigation);
    
    // Click handler for suggestions
    elements.poSupplierSuggestions.addEventListener('click', (e) => {
      const item = e.target.closest('.autocomplete-item');
      if (item) {
        selectSupplier(item.dataset.supplier);
      }
    });
    
    // Focus handler
    elements.poSupplier.addEventListener('focus', () => {
      if (elements.poSupplier.value.length >= 2) {
        const suggestions = searchSuppliers(elements.poSupplier.value);
        showSuggestions(suggestions);
      }
    });
    
    // Blur handler
    elements.poSupplier.addEventListener('blur', () => {
      setTimeout(() => {
        hideSuggestions();
      }, 200);
    });
    
    // Prevent form submission when selecting from autocomplete
    elements.poSupplierSuggestions.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });
  }
  
  // Generate unique ID for purchase orders
  function generatePOId() {
    const lastPO = purchaseOrders.reduce((max, po) => {
      const num = parseInt(po.id.split('-')[1]);
      return num > max ? num : max;
    }, 0);
    return `PO-${String(lastPO + 1).padStart(3, '0')}`;
  }
  
  // Get invoices linked to PO
  function getLinkedInvoices(poId) {
    return invoices.filter(invoice => invoice.purchaseOrderId === poId);
  }
  
  // Get unlinked invoices
  function getUnlinkedInvoices() {
    return invoices.filter(invoice => !invoice.purchaseOrderId);
  }
  
  // Search invoices
  function searchInvoices(searchTerm) {
    const unlinkedInvoices = getUnlinkedInvoices();
    
    if (!searchTerm.trim()) {
      searchResults = [];
      renderSearchResults();
      return;
    }
    
    searchResults = unlinkedInvoices.filter(invoice => 
      invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.supplier.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    renderSearchResults();
  }
  
  // Render search results
  function renderSearchResults() {
    const container = elements.invoiceSearchResults;
    
    if (searchResults.length === 0) {
      if (elements.invoiceSearch.value.trim()) {
        container.innerHTML = '<div class="no-results">لا توجد فواتير تطابق البحث</div>';
        container.classList.remove('hidden');
      } else {
        container.classList.add('hidden');
      }
      return;
    }
    
    container.innerHTML = searchResults.map(invoice => `
      <div class="invoice-search-result" data-invoice="${invoice.invoiceNumber}" onclick="selectInvoice('${invoice.invoiceNumber}')">
        <div class="flex justify-between items-start mb-2">
          <div class="text-right">
            <div class="invoice-number">${invoice.invoiceNumber}</div>
            <div class="invoice-supplier">${invoice.supplier}</div>
          </div>
          <div class="text-left">
            <div class="invoice-amount">${invoice.totalAmount ? invoice.totalAmount.toLocaleString() : '0'} ر.س</div>
            <div class="invoice-date">${invoice.date}</div>
          </div>
        </div>
      </div>
    `).join('');
    
    container.classList.remove('hidden');
  }
  
  // Select invoice from search results
  function selectInvoice(invoiceNumber) {
    selectedInvoice = invoiceNumber;
    const invoice = invoices.find(inv => inv.invoiceNumber === invoiceNumber);
    
    // Clear search and hide results
    elements.invoiceSearch.value = `${invoice.invoiceNumber} - ${invoice.supplier}`;
    elements.invoiceSearchResults.classList.add('hidden');
    
    // Show invoice details
    showInvoiceDetails(invoiceNumber);
    
    // Enable link button
    elements.linkInvoiceBtn.disabled = false;
    elements.linkInvoiceBtn.style.opacity = '1';
  }
  
  // Clear search
  function clearSearch() {
    elements.invoiceSearch.value = '';
    elements.invoiceSearchResults.classList.add('hidden');
    searchResults = [];
    selectedInvoice = null;
    hideInvoiceDetails();
  }
  
  // Sort purchase orders by ID (newest first)
  function sortPurchaseOrdersById(pos) {
    return pos.sort((a, b) => {
      // استخراج الرقم التسلسلي من ID
      const idA = parseInt(a.id.split('-')[1]);
      const idB = parseInt(b.id.split('-')[1]);
      return idB - idA; // الأحدث أولاً
    });
  }
  
  // Render purchase orders
  function renderPurchaseOrders() {
    elements.poContainer.innerHTML = '';
    
    if (filteredPOs.length === 0) {
      elements.poContainer.innerHTML = '<div class="text-center py-12 text-slate-400">لا توجد أوامر شراء لعرضها</div>';
      return;
    }
    
    // ترتيب أوامر الشراء بحسب الـ ID من الأحدث إلى الأقدم
    const sortedPOs = sortPurchaseOrdersById([...filteredPOs]);
    
    sortedPOs.forEach((po, index) => {
      const linkedInvoices = getLinkedInvoices(po.id);
      const totalInvoiceAmount = linkedInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
      
      const poCard = document.createElement('div');
      poCard.className = 'po-card slide-right';
      poCard.style.animationDelay = `${index * 0.1}s`;
      poCard.dataset.poId = po.id;
      
      poCard.innerHTML = `
        <div class="flex items-start justify-between mb-6">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 po-icon rounded-2xl flex items-center justify-center">
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
              </svg>
            </div>
            <div>
              <h3 class="text-xl font-bold text-slate-100">${po.id}</h3>
              <p class="text-slate-400 text-sm">${po.createdDate}</p>
            </div>
          </div>
          
          <div class="btn-group">
            <button class="modern-btn edit" onclick="editPO('${po.id}')" title="تعديل">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
              </svg>
            </button>
            <button class="modern-btn info" onclick="linkInvoice('${po.id}')" title="ربط فاتورة">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path>
              </svg>
            </button>
            <button class="modern-btn" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); box-shadow: 0 8px 20px rgba(239, 68, 68, 0.3);" onclick="deletePO('${po.id}')" title="حذف">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- PO Details -->
        <div class="space-y-4 mb-6">
          <div class="stat-item">
            <div class="flex justify-start items-start text-right">
              <span class="text-sm text-slate-400 ml-2">المورد:</span>
              <span class="font-bold text-slate-200 flex-1">${po.supplier}</span>
            </div>
          </div>
          
          <div class="stat-item">
            <div class="flex justify-start items-start text-right">
              <span class="text-sm text-slate-400 ml-2">البيان:</span>
              <span class="text-slate-200 flex-1">${po.description}</span>
            </div>
          </div>
          
          ${po.pdfFile ? `
          <div class="stat-item">
            <div class="flex justify-between items-center text-right">
              <div class="flex justify-start items-center">
                <span class="text-sm text-slate-400 ml-2">ملف PDF:</span>
                <span class="text-slate-200">${po.pdfFile.name}</span>
              </div>
              <div class="flex gap-2">
                <button class="modern-btn info" onclick="viewPDF('${po.id}')" title="عرض الملف">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                  </svg>
                </button>
                <button class="modern-btn warning" onclick="downloadPDF('${po.id}')" title="تحميل الملف">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                  </svg>
                </button>
              </div>
            </div>
          </div>
          ` : ''}
          
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="stat-item">
              <div class="text-center">
                <p class="text-sm text-slate-400">سعر الأمر</p>
                <p class="font-bold text-blue-400 text-lg">${po.price ? po.price.toLocaleString() : '0'} ر.س</p>
              </div>
            </div>
            <div class="stat-item">
              <div class="text-center">
                <p class="text-sm text-slate-400">الفواتير المربوطة</p>
                <p class="font-bold text-green-400 text-lg">${linkedInvoices.length}</p>
              </div>
            </div>
            <div class="stat-item">
              <div class="text-center">
                <p class="text-sm text-slate-400">إجمالي الفواتير</p>
                <p class="font-bold text-yellow-400 text-lg">${totalInvoiceAmount.toLocaleString()} ر.س</p>
              </div>
            </div>
            <div class="stat-item">
              <div class="text-center">
                <p class="text-sm text-slate-400">ملف PDF</p>
                <p class="font-bold ${po.pdfFile ? 'text-green-400' : 'text-red-400'} text-lg">
                  ${po.pdfFile ? 'متوفر' : 'غير متوفر'}
                </p>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Toggle Button -->
        <div class="border-t border-slate-600/30 pt-4">
          <button class="toggle-btn w-full" onclick="toggleInvoices('${po.id}')">
            <span>عرض الفواتير المربوطة (${linkedInvoices.length})</span>
            <svg class="w-5 h-5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
            </svg>
          </button>
        </div>
        
        <!-- Linked Invoices (Hidden by default) -->
        <div class="invoice-list hidden" id="invoices-${po.id}">
          ${linkedInvoices.length > 0 ? linkedInvoices.map(invoice => `
            <div class="invoice-item">
              <div class="flex justify-between items-center">
                <div class="flex-1 text-right">
                  <div class="flex justify-start items-start mb-2">
                    <span class="text-sm text-slate-400 ml-2">رقم الفاتورة:</span>
                    <span class="font-semibold text-slate-200">${invoice.invoiceNumber}</span>
                    <span class="text-slate-400 text-sm mr-4">${invoice.date}</span>
                  </div>
                  <div class="flex justify-start items-center">
                    <span class="text-sm text-slate-400 ml-2">المورد:</span>
                    <span class="text-slate-300 text-sm font-medium">${invoice.supplier}</span>
                    <span class="font-bold text-green-400 mr-4">${(invoice.totalAmount || 0).toLocaleString()} ر.س</span>
                  </div>
                </div>
                <button class="modern-btn edit mr-4" onclick="unlinkInvoice('${invoice.invoiceNumber}')" title="إلغاء الربط">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
            </div>
          `).join('') : '<p class="text-slate-400 text-center py-4">لا توجد فواتير مربوطة بهذا الأمر</p>'}
        </div>
      `;
      
      elements.poContainer.appendChild(poCard);
    });
  }
  
  // Filter purchase orders
  function filterPurchaseOrders(searchTerm) {
    if (!searchTerm.trim()) {
      filteredPOs = [...purchaseOrders];
    } else {
      filteredPOs = purchaseOrders.filter(po => 
        po.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        po.supplier.toLowerCase().includes(searchTerm.toLowerCase()) ||
        po.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    renderPurchaseOrders();
  }
  
  // Show invoice details
  function showInvoiceDetails(invoiceNumber) {
    const invoice = invoices.find(inv => inv.invoiceNumber === invoiceNumber);
    if (!invoice) return;
    
    document.getElementById('selected-invoice-number').textContent = invoice.invoiceNumber;
    document.getElementById('selected-invoice-date').textContent = invoice.date;
    document.getElementById('selected-invoice-supplier').textContent = invoice.supplier;
    document.getElementById('selected-invoice-amount').textContent = `${(invoice.totalAmount || 0).toLocaleString()} ر.س`;
    
    document.getElementById('selected-invoice-details').classList.remove('hidden');
  }
  
  // Hide invoice details
  function hideInvoiceDetails() {
    document.getElementById('selected-invoice-details').classList.add('hidden');
    selectedInvoice = null;
    elements.linkInvoiceBtn.disabled = true;
    elements.linkInvoiceBtn.style.opacity = '0.5';
  }
  
  // Make selectInvoice globally available
  window.selectInvoice = selectInvoice;
  
  // PDF Functions
  window.viewPDF = function(poId) {
    const po = purchaseOrders.find(p => p.id === poId);
    if (!po || !po.pdfFile) return;
    
    elements.pdfViewer.src = po.pdfFile.dataUrl;
    elements.pdfModal.classList.add('show');
  };
  
  window.downloadPDF = function(poId) {
    const po = purchaseOrders.find(p => p.id === poId);
    if (!po || !po.pdfFile) return;
    
    const link = document.createElement('a');
    link.href = po.pdfFile.dataUrl;
    link.download = po.pdfFile.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  // Global functions
  window.editPO = function(poId) {
    const po = purchaseOrders.find(p => p.id === poId);
    if (!po) return;
    
    currentEditingPO = po;
    elements.modalTitle.textContent = 'تعديل أمر الشراء';
    elements.poSupplier.value = po.supplier;
    elements.poDescription.value = po.description;
    elements.poPrice.value = po.price;
    elements.poPDF.value = ''; // Can't set file input value
    
    // Reset autocomplete state
    selectedSupplier = po.supplier;
    elements.poSupplierContainer.classList.add('selected');
    hideSuggestions();
    hideWarning();
    
    elements.poModal.classList.add('show');
  };
  
  window.linkInvoice = function(poId) {
    const po = purchaseOrders.find(p => p.id === poId);
    if (!po) return;
    
    currentLinkingPO = poId;
    
    // Update PO details in modal
    document.getElementById('selected-po-id').textContent = po.id;
    document.getElementById('selected-po-supplier').textContent = po.supplier;
    
    // Clear previous search
    clearSearch();
    
    elements.linkInvoiceModal.classList.add('show');
  };
  
  window.deletePO = function(poId) {
    currentDeletingPO = poId;
    elements.deleteModal.classList.add('show');
  };
  
  window.toggleInvoices = function(poId) {
    const invoicesList = document.getElementById(`invoices-${poId}`);
    const poCard = document.querySelector(`[data-po-id="${poId}"]`);
    const arrow = poCard.querySelector('.toggle-btn svg');
    
    if (invoicesList.classList.contains('hidden')) {
      invoicesList.classList.remove('hidden');
      arrow.classList.add('rotate-180');
      poCard.classList.add('expanded');
    } else {
      invoicesList.classList.add('hidden');
      arrow.classList.remove('rotate-180');
      poCard.classList.remove('expanded');
    }
  };
  
  window.unlinkInvoice = function(invoiceNumber) {
    const invoice = invoices.find(inv => inv.invoiceNumber === invoiceNumber);
    if (invoice) {
      delete invoice.purchaseOrderId;
      renderPurchaseOrders();
    }
  };
  
  // Add new purchase order
  function addPurchaseOrder() {
    currentEditingPO = null;
    elements.modalTitle.textContent = 'إضافة أمر شراء جديد';
    elements.poSupplier.value = '';
    elements.poDescription.value = '';
    elements.poPrice.value = '';
    elements.poPDF.value = '';
    
    // Reset autocomplete state
    selectedSupplier = null;
    elements.poSupplierContainer.classList.remove('selected');
    hideSuggestions();
    hideWarning();
    
    elements.poModal.classList.add('show');
  }
  
  // Save purchase order
  function savePurchaseOrder() {
    const supplier = elements.poSupplier.value.trim();
    const description = elements.poDescription.value.trim();
    const price = parseFloat(elements.poPrice.value);
    const pdfFile = elements.poPDF.files[0];
    
    if (!supplier || !description || !price) {
      alert('يرجى ملء جميع الحقول المطلوبة');
      return;
    }
    
    function savePO(pdfData = null) {
      if (currentEditingPO) {
        // Edit existing PO
        const index = purchaseOrders.findIndex(po => po.id === currentEditingPO.id);
        if (index !== -1) {
          purchaseOrders[index] = {
            ...currentEditingPO,
            supplier,
            description,
            price,
            pdfFile: pdfData || currentEditingPO.pdfFile
          };
        }
      } else {
        // Add new PO
        const newPO = {
          id: generatePOId(),
          supplier,
          description,
          price,
          createdDate: new Date().toISOString().split('T')[0],
          status: 'active',
          pdfFile: pdfData
        };
        purchaseOrders.push(newPO);
      }
      
      // Update suppliers list for autocomplete
      if (supplier && !suppliers.includes(supplier)) {
        suppliers.push(supplier);
        suppliers.sort();
      }
      
      filteredPOs = [...purchaseOrders];
      renderPurchaseOrders();
      elements.poModal.classList.remove('show');
    }
    
    // Handle PDF file if uploaded
    if (pdfFile) {
      if (pdfFile.type !== 'application/pdf') {
        alert('يرجى اختيار ملف PDF صالح');
        return;
      }
      
      if (pdfFile.size > 10 * 1024 * 1024) { // 10MB limit
        alert('حجم الملف كبير جداً. يرجى اختيار ملف أصغر من 10 ميجابايت');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = function(e) {
        const pdfData = {
          name: pdfFile.name,
          size: pdfFile.size,
          dataUrl: e.target.result
        };
        savePO(pdfData);
      };
      reader.readAsDataURL(pdfFile);
    } else {
      savePO();
    }
  }
  
  // Link invoice to PO
  function linkInvoiceToPO() {
    if (!selectedInvoice || !currentLinkingPO) return;
    
    const invoice = invoices.find(inv => inv.invoiceNumber === selectedInvoice);
    if (invoice) {
      invoice.purchaseOrderId = currentLinkingPO;
      renderPurchaseOrders();
      elements.linkInvoiceModal.classList.remove('show');
      clearSearch();
      
      // Show success message
      const successMessage = document.createElement('div');
      successMessage.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 success-message';
      successMessage.textContent = `تم ربط الفاتورة ${selectedInvoice} بنجاح!`;
      document.body.appendChild(successMessage);
      
      setTimeout(() => {
        successMessage.remove();
      }, 3000);
    }
  }
  
  // Delete purchase order
  function deletePurchaseOrder() {
    if (!currentDeletingPO) return;
    
    // Unlink all invoices from this PO
    invoices.forEach(invoice => {
      if (invoice.purchaseOrderId === currentDeletingPO) {
        delete invoice.purchaseOrderId;
      }
    });
    
    // Remove PO
    purchaseOrders = purchaseOrders.filter(po => po.id !== currentDeletingPO);
    
    filteredPOs = [...purchaseOrders];
    renderPurchaseOrders();
    elements.deleteModal.classList.remove('show');
  }
  
  // Event listeners
  elements.addPOBtn.addEventListener('click', addPurchaseOrder);
  elements.savePOBtn.addEventListener('click', savePurchaseOrder);
  elements.cancelPOBtn.addEventListener('click', () => {
    elements.poModal.classList.remove('show');
    hideSuggestions();
    hideWarning();
  });
  elements.linkInvoiceBtn.addEventListener('click', linkInvoiceToPO);
  elements.cancelLinkBtn.addEventListener('click', () => {
    elements.linkInvoiceModal.classList.remove('show');
    clearSearch();
  });
  elements.confirmDeleteBtn.addEventListener('click', deletePurchaseOrder);
  elements.cancelDeleteBtn.addEventListener('click', () => elements.deleteModal.classList.remove('show'));
  elements.closePdfBtn.addEventListener('click', () => elements.pdfModal.classList.remove('show'));
  
  elements.poSearch.addEventListener('input', (e) => {
    filterPurchaseOrders(e.target.value);
  });
  
  // Invoice search functionality
  elements.invoiceSearch.addEventListener('input', (e) => {
    searchInvoices(e.target.value);
  });
  
  // Hide search results when clicking outside
  document.addEventListener('click', (e) => {
    if (!elements.invoiceSearch.contains(e.target) && !elements.invoiceSearchResults.contains(e.target)) {
      if (!selectedInvoice) {
        elements.invoiceSearchResults.classList.add('hidden');
      }
    }
  });
  
  // Show search results when focusing on search input
  elements.invoiceSearch.addEventListener('focus', () => {
    if (elements.invoiceSearch.value.trim() && searchResults.length > 0) {
      elements.invoiceSearchResults.classList.remove('hidden');
    }
  });
  
  // Close modals on outside click
  [elements.poModal, elements.linkInvoiceModal, elements.deleteModal, elements.pdfModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('show');
        if (modal === elements.poModal) {
          hideSuggestions();
          hideWarning();
        }
      }
    });
  });
  
  // Initialize
  initAutocomplete();
  filteredPOs = [...purchaseOrders];
  renderPurchaseOrders();
  
  // Initialize link invoice button as disabled
  elements.linkInvoiceBtn.disabled = true;
  elements.linkInvoiceBtn.style.opacity = '0.5';
  
  // Public API for external data loading
  window.PurchaseOrdersApp = {
    setPurchaseOrders: function(data) {
      purchaseOrders = data || [];
      filteredPOs = [...purchaseOrders];
      renderPurchaseOrders();
      loadSuppliers();
    },
    
    setInvoices: function(data) {
      invoices = data || [];
      loadSuppliers();
      renderPurchaseOrders();
    },
    
    getPurchaseOrders: function() {
      return purchaseOrders;
    },
    
    getInvoices: function() {
      return invoices;
    }
  };
});

// Initialize elements
const elements = {
  file: document.getElementById('pdfFile'),
  container: document.getElementById('fileContainer'),
  content: document.getElementById('fileContent'),
  analyzeBtn: document.getElementById('analyzeBtn'),
  analyzeText: document.getElementById('analyzeText'),
  saveBtn: document.getElementById('saveBtn'),
  form: document.getElementById('invoiceForm'),
  // Autocomplete elements
  supplierInput: document.getElementById('supplier'),
  supplierSuggestions: document.getElementById('supplierSuggestions'),
  supplierWarning: document.getElementById('supplierWarning'),
  supplierContainer: document.querySelector('.autocomplete-container')
};

// Suppliers data - will be loaded from API
let suppliers = [];

let selectedSupplier = null;
let highlightedIndex = -1;
let searchTimeout;

// Load suppliers from API
async function loadSuppliers() {
  try {
    const response = await fetch('/api/suppliers');
    if (response.ok) {
      const data = await response.json();
      suppliers = data.suppliers || [];
    } else {
      console.warn('Failed to load suppliers from API');
      // Fallback: empty array, user can type new supplier names
      suppliers = [];
    }
  } catch (error) {
    console.error('Error loading suppliers:', error);
    // Fallback: empty array, user can type new supplier names
    suppliers = [];
  }
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
  const container = elements.supplierSuggestions;
  
  if (suggestions.length === 0) {
    container.innerHTML = '<div class="autocomplete-no-results">لا توجد نتائج مطابقة</div>';
    container.classList.add('show');
    return;
  }
  
  const suggestionHTML = suggestions.map((item, index) => {
    const highlightedName = highlightMatch(item.name, elements.supplierInput.value);
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
  elements.supplierSuggestions.classList.remove('show');
  highlightedIndex = -1;
}

// Show warning
function showWarning(message) {
  elements.supplierWarning.textContent = message;
  elements.supplierWarning.classList.add('show');
  
  setTimeout(() => {
    elements.supplierWarning.classList.remove('show');
  }, 5000);
}

// Hide warning
function hideWarning() {
  elements.supplierWarning.classList.remove('show');
}

// Select supplier
function selectSupplier(supplierName) {
  elements.supplierInput.value = supplierName;
  selectedSupplier = supplierName;
  elements.supplierContainer.classList.add('selected');
  hideSuggestions();
  hideWarning();
  
  // Add success animation
  elements.supplierInput.style.animation = 'peacefulSuccess 0.6s ease-out';
  setTimeout(() => {
    elements.supplierInput.style.animation = '';
  }, 600);
}

// Handle keyboard navigation
function handleKeyboardNavigation(e) {
  const items = elements.supplierSuggestions.querySelectorAll('.autocomplete-item');
  
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
async function initAutocomplete() {
  // Load suppliers from API first
  await loadSuppliers();
  
  // Input event handler
  elements.supplierInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    selectedSupplier = null;
    elements.supplierContainer.classList.remove('selected');
    
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    if (query.length < 2) {
      hideSuggestions();
      hideWarning();
      return;
    }
    
    // Show loading state
    elements.supplierSuggestions.innerHTML = '<div class="autocomplete-loading">جاري البحث...</div>';
    elements.supplierSuggestions.classList.add('show');
    
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
  elements.supplierInput.addEventListener('keydown', handleKeyboardNavigation);
  
  // Click handler for suggestions
  elements.supplierSuggestions.addEventListener('click', (e) => {
    const item = e.target.closest('.autocomplete-item');
    if (item) {
      selectSupplier(item.dataset.supplier);
    }
  });
  
  // Focus handler
  elements.supplierInput.addEventListener('focus', () => {
    if (elements.supplierInput.value.length >= 2) {
      const suggestions = searchSuppliers(elements.supplierInput.value);
      showSuggestions(suggestions);
    }
  });
  
  // Blur handler
  elements.supplierInput.addEventListener('blur', () => {
    setTimeout(() => {
      hideSuggestions();
    }, 200);
  });
  
  // Prevent form submission when selecting from autocomplete
  elements.supplierSuggestions.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });
}

// Enhanced button effects
function setButtonLoading(button, isLoading, loadingText = 'جاري المعالجة...') {
  const icon = button.querySelector('.btn-icon');
  const text = button.querySelector('.btn-text');
  
  if (isLoading) {
    button.classList.add('loading');
    button.disabled = true;
    
    if (icon) {
      icon.innerHTML = `<div class="loading-progress"></div>`;
    }
    
    if (text) {
      text.innerHTML = `
        <div class="loading-squares">
          <span></span>
          <span></span>
          <span></span>
        </div>${loadingText}
      `;
    }
  } else {
    button.classList.remove('loading');
    button.disabled = false;
  }
}

function setButtonSuccess(button, successText, originalText, duration = 2000) {
  const icon = button.querySelector('.btn-icon');
  const text = button.querySelector('.btn-text');
  
  button.classList.remove('loading');
  button.classList.add('success-pulse');
  
  if (icon) {
    icon.innerHTML = `
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
      </svg>
    `;
  }
  
  if (text) {
    text.innerHTML = `
      <div style="display: inline-flex; align-items: center; gap: 6px;">
        <div style="width: 6px; height: 6px; background: #10b981; border-radius: 2px; box-shadow: 0 0 8px #10b981;"></div>${successText}
      </div>
    `;
  }
  
  setTimeout(() => {
    button.classList.remove('success-pulse');
    if (text) {
      text.textContent = originalText;
    }
    if (icon && button.id === 'analyzeBtn') {
      icon.innerHTML = `
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
        </svg>
      `;
    } else if (icon && button.id === 'saveBtn') {
      icon.innerHTML = `
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
      `;
    }
  }, duration);
}

// Format numbers
const formatNumber = num => isNaN(num) ? '' : new Intl.NumberFormat('en-US').format(num);

// Enhanced file handling
elements.file.addEventListener('change', e => {
  if (e.target.files.length) {
    const file = e.target.files[0];
    const fileName = file.name;
    const fileSize = (file.size / 1024 / 1024).toFixed(2);
    const fileType = file.type;
    
    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      showNotification('حجم الملف كبير جداً. يرجى اختيار ملف أصغر من 10 ميجابايت', 'warning');
      elements.file.value = '';
      return;
    }
    
    // Determine file icon and type
    let fileTypeText = '';
    if (fileType === 'application/pdf') {
      fileTypeText = 'PDF';
    } else if (fileType.startsWith('image/')) {
      fileTypeText = 'صورة';
    }
    
    elements.content.innerHTML = `
      <div class="file-icon" style="background: var(--success); animation: gentlePulse 2s ease-in-out infinite;">
        <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
      </div>
      <h3 class="text-base font-semibold text-green-300 mb-1">✓ تم اختيار الملف</h3>
      <p class="text-sm text-slate-300 mb-1">${fileName} (${fileTypeText})</p>
      <p class="text-xs text-slate-400">الحجم: ${fileSize} MB • انقر لتغيير الملف</p>
    `;
    elements.container.style.borderColor = 'rgba(34, 197, 94, 0.6)';
    elements.container.style.background = 'rgba(34, 197, 94, 0.1)';
  }
});

// Enhanced Drag & Drop
['dragover', 'dragleave', 'drop'].forEach(event => {
  elements.container.addEventListener(event, e => {
    e.preventDefault();
    if (event === 'dragover') {
      elements.container.style.borderColor = 'rgba(100, 116, 139, 0.6)';
      elements.container.style.transform = 'translateY(-2px)';
      elements.container.style.background = 'rgba(100, 116, 139, 0.2)';
    } else if (event === 'drop' && e.dataTransfer.files.length) {
      const file = e.dataTransfer.files[0];
      const fileType = file.type;
      
      if (fileType === 'application/pdf' || fileType.startsWith('image/')) {
        elements.file.files = e.dataTransfer.files;
        elements.file.dispatchEvent(new Event('change'));
      } else {
        showNotification('يرجى اختيار ملف PDF أو صورة فقط', 'warning');
      }
    }
    if (event !== 'dragover') {
      elements.container.style.borderColor = 'rgba(100, 116, 139, 0.4)';
      elements.container.style.transform = 'translateY(0)';
      elements.container.style.background = 'rgba(100, 116, 139, 0.15)';
    }
  });
});

// AI Invoice Analysis
elements.analyzeBtn.addEventListener('click', async () => {
  if (!elements.file.files.length) {
    showNotification('اختر ملف PDF أو صورة أولاً', 'warning');
    return;
  }
  
  const file = elements.file.files[0];
  const fileType = file.type;
  
  if (fileType !== 'application/pdf' && !fileType.startsWith('image/')) {
    showNotification('يرجى اختيار ملف PDF أو صورة صالحة', 'warning');
    return;
  }
  
  if (file.size > 10 * 1024 * 1024) {
    showNotification('حجم الملف كبير جداً. يرجى اختيار ملف أصغر من 10 ميجابايت', 'warning');
    return;
  }
  
  setButtonLoading(elements.analyzeBtn, true, 'جاري تحليل الفاتورة...');
  
  try {
    const formData = new FormData();
    formData.append('invoice', file);
    formData.append('fileType', fileType.startsWith('image/') ? 'image' : 'pdf');
    
    const res = await fetch('/api/analyze-invoice', { 
      method: 'POST', 
      body: formData
    });
    
    if (!res.ok) {
      throw new Error('خدمة التحليل غير متاحة حالياً');
    }
    
    const json = await res.json();
    const data = json.data;
    
    const fields = [
      { id: 'supplier', value: data.supplier || '' },
      { id: 'type', value: data.type || '' },
      { id: 'category', value: '' },
      { id: 'invoiceNumber', value: data.invoiceNumber || '' },
      { id: 'date', value: data.date || '' },
      { id: 'amountBeforeTax', value: formatNumber(data.amountBeforeTax) || '' },
      { id: 'taxAmount', value: formatNumber(data.taxAmount) || '' },
      { id: 'totalAmount', value: formatNumber(data.totalAmount) || '' }
    ];
    
    fields.forEach((field, i) => {
      setTimeout(() => {
        const el = document.getElementById(field.id);
        el.value = field.value;
        el.style.animation = 'peacefulSuccess 0.6s ease-out';
        el.style.borderColor = 'rgba(34, 197, 94, 0.6)';
        setTimeout(() => {
          el.style.animation = '';
          el.style.borderColor = 'rgba(100, 116, 139, 0.4)';
        }, 600);
      }, i * 100);
    });
    
    setButtonLoading(elements.analyzeBtn, false);
    setButtonSuccess(elements.analyzeBtn, 'تم التحليل بنجاح', 'تحليل الفاتورة');
    showNotification('تم تحليل الفاتورة بنجاح', 'success');
    
  } catch (err) {
    console.error(err);
    setButtonLoading(elements.analyzeBtn, false);
    
    elements.analyzeBtn.classList.remove('loading');
    elements.analyzeBtn.classList.add('error-state');
    
    const text = elements.analyzeBtn.querySelector('.btn-text');
    const icon = elements.analyzeBtn.querySelector('.btn-icon');
    
    if (icon) {
      icon.innerHTML = `
        <div style="width: 24px; height: 5px; background: rgba(239, 68, 68, 0.3); border-radius: 3px; position: relative; overflow: hidden; border: 1px solid rgba(239, 68, 68, 0.5);">
          <div style="position: absolute; top: 0; left: 0; height: 100%; width: 100%; background: #ef4444; border-radius: 3px; animation: gentlePulse 1s ease-in-out infinite;"></div>
        </div>
      `;
    }
    
    if (text) {
      text.innerHTML = `
        <div style="display: inline-flex; align-items: center; gap: 6px;">
          <div style="width: 6px; height: 6px; background: #ef4444; border-radius: 2px; box-shadow: 0 0 8px #ef4444; animation: gentlePulse 1s ease-in-out infinite;"></div>خطأ في التحليل
        </div>
      `;
    }
    
    setTimeout(() => {
      elements.analyzeBtn.classList.remove('error-state');
      if (text) text.textContent = 'تحليل الفاتورة';
      if (icon) {
        icon.innerHTML = `
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
          </svg>
        `;
      }
    }, 2500);
    
    showNotification(err.message, 'error');
  }
});

// Form submission handler
elements.form.addEventListener('submit', function(e) {
  e.preventDefault();
  
  const file = elements.file.files[0];
  
  if (!file) {
    showNotification('يرجى اختيار ملف PDF أو صورة', 'warning');
    return;
  }
  
  setButtonLoading(elements.saveBtn, true, 'جاري حفظ الفاتورة...');
  
  // Convert file to base64
  const reader = new FileReader();
  reader.onload = function(e) {
    const supplierName = elements.supplierInput.value.trim();
    const fileData = e.target.result;
    
    const invoice = {
      id: Date.now().toString(),
      supplier: supplierName,
      type: document.getElementById('type').value.trim(),
      category: document.getElementById('category').value.trim(),
      invoiceNumber: document.getElementById('invoiceNumber').value.trim(),
      date: document.getElementById('date').value,
      amountBeforeTax: parseFloat(document.getElementById('amountBeforeTax').value.replace(/,/g,'')) || 0,
      taxAmount: parseFloat(document.getElementById('taxAmount').value.replace(/,/g,'')) || 0,
      totalAmount: parseFloat(document.getElementById('totalAmount').value.replace(/,/g,'')) || 0,
      notes: document.getElementById('notes').value.trim(),
      fileData: fileData,
      fileType: file.type,
      fileName: file.name,
      fileSize: file.size,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Here you would send the invoice data to your backend API
    // For now, we'll just simulate a successful save
    setTimeout(() => {
      setButtonLoading(elements.saveBtn, false);
      setButtonSuccess(elements.saveBtn, 'تم الحفظ بنجاح', 'حفظ الفاتورة', 1200);
      
      showNotification('تم حفظ الفاتورة بنجاح', 'success');
      
      // Reset form after successful save
      setTimeout(() => {
        elements.form.reset();
        elements.content.innerHTML = `
          <div class="file-icon">
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
            </svg>
          </div>
          <h3 class="text-base font-semibold text-slate-200 mb-1">اختر ملف PDF أو صورة</h3>
          <p class="text-sm text-slate-400 mb-1">اسحب الملف هنا أو انقر للاختيار</p>
          <p class="text-xs text-slate-500">يدعم PDF, JPG, PNG, JPEG • الحد الأقصى 10MB</p>
        `;
        elements.container.style.borderColor = 'rgba(100, 116, 139, 0.4)';
        elements.container.style.background = 'rgba(100, 116, 139, 0.15)';
        elements.supplierContainer.classList.remove('selected');
        selectedSupplier = null;
      }, 1200);
    }, 1000);
  };
  
  reader.onerror = function() {
    setButtonLoading(elements.saveBtn, false);
    showNotification('حدث خطأ في قراءة الملف', 'error');
  };
  
  reader.readAsDataURL(file);
});

// Auto-format numbers
['amountBeforeTax', 'taxAmount', 'totalAmount'].forEach(id => {
  const input = document.getElementById(id);
  input.addEventListener('blur', function() {
    const value = parseFloat(this.value.replace(/,/g, ''));
    if (!isNaN(value)) {
      this.value = formatNumber(value);
      this.style.animation = 'gentlePulse 0.4s ease-out';
      setTimeout(() => this.style.animation = '', 400);
    }
  });
});

// Enhanced notification system
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateY(-20px)';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Add gentle sparkles
function createSparkles() {
  const container = document.querySelector('.page-header');
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      const sparkle = document.createElement('div');
      sparkle.className = 'sparkle';
      sparkle.style.left = Math.random() * 100 + '%';
      sparkle.style.top = Math.random() * 100 + '%';
      sparkle.style.animationDelay = Math.random() * 3 + 's';
      container.appendChild(sparkle);
      
      setTimeout(() => sparkle.remove(), 3000);
    }, i * 1000);
  }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  await initAutocomplete();
  setInterval(createSparkles, 8000);
});

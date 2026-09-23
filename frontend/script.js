/**
 * Exploratory Data Analysis (EDA) Dashboard - Client Controller
 * Pure vanilla JavaScript connecting seamlessly to Flask REST APIs.
 * Powered by Chart.js, Fetch API, and reactive DOM manipulation.
 */

// Determine backend API origin dynamically across environments (Vite/Node, Flask standalone, VS Code Live Server, Chrome, Edge)
function resolveApiBase() {
  if (typeof window === 'undefined' || !window.location) {
    return 'http://127.0.0.1:3000';
  }
  const protocol = window.location.protocol;
  const port = window.location.port;
  const origin = window.location.origin;

  // If opened via file:/// or common local static preview servers (e.g. VS Code Live Server on 5500/5501)
  if (protocol === 'file:' || port === '5500' || port === '5501' || port === '8080' || port === '5173') {
    return 'http://127.0.0.1:3000';
  }
  if (protocol.startsWith('http')) {
    return origin;
  }
  return 'http://127.0.0.1:3000';
}
const API_BASE = resolveApiBase();

// Global application state
const AppState = {
  activeTab: 'tab-dashboard',
  dataset: {
    filename: 'sample_sales.csv',
    columns: [],
    records: [],
    totalRecords: 0,
    currentPage: 1,
    perPage: 15,
    totalPages: 1,
    searchQuery: '',
    sortCol: '',
    sortDir: 'asc',
    activeFilter: 'all'
  },
  summary: null,
  charts: {},
  stats: null,
  correlations: null,
  cleaningHistory: [],
  boxplots: {
    data: null,
    selectedCol: 'all',
    showOutliersOnly: false,
    showJitter: true
  }
};

// Color palettes for Chart.js
const CHART_COLORS = {
  primary: '#4f46e5',
  secondary: '#06b6d4',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  palette: [
    '#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ec4899',
    '#8b5cf6', '#3b82f6', '#14b8a6', '#f97316', '#64748b'
  ]
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupEventListeners();
  loadFullDashboard();
});

function setupNavigation() {
  const navButtons = document.querySelectorAll('.sidebar-nav .nav-item');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });
}

function switchTab(tabId) {
  // Update sidebar active class
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });

  // Update tab pane visibility
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === tabId);
  });

  AppState.activeTab = tabId;

  // Resize charts when switching to visualizations tab to avoid canvas distortion
  if (tabId === 'tab-visualizations' || tabId === 'tab-dashboard') {
    setTimeout(() => {
      Object.values(AppState.charts).forEach(chart => {
        if (chart && typeof chart.resize === 'function') {
          chart.resize();
        }
      });
    }, 50);
  }
}

function setupEventListeners() {
  // CSV File Upload
  const fileInput = document.getElementById('csvFileInput');
  if (fileInput) {
    fileInput.addEventListener('change', handleFileUpload);
  }

  // Reset Dataset Button
  const btnReset = document.getElementById('btnResetDataset');
  if (btnReset) {
    btnReset.addEventListener('click', handleResetDataset);
  }

  // Dataset Table Controls
  const searchInput = document.getElementById('datasetSearchInput');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        AppState.dataset.searchQuery = e.target.value;
        AppState.dataset.currentPage = 1;
        fetchDatasetRecords();
      }, 300);
    });
  }

  const perPageSelect = document.getElementById('perPageSelect');
  if (perPageSelect) {
    perPageSelect.addEventListener('change', (e) => {
      AppState.dataset.perPage = parseInt(e.target.value, 10);
      AppState.dataset.currentPage = 1;
      fetchDatasetRecords();
    });
  }

  const btnPrevPage = document.getElementById('btnPrevPage');
  if (btnPrevPage) {
    btnPrevPage.addEventListener('click', () => {
      if (AppState.dataset.currentPage > 1) {
        AppState.dataset.currentPage--;
        fetchDatasetRecords();
      }
    });
  }

  const btnNextPage = document.getElementById('btnNextPage');
  if (btnNextPage) {
    btnNextPage.addEventListener('click', () => {
      if (AppState.dataset.currentPage < AppState.dataset.totalPages) {
        AppState.dataset.currentPage++;
        fetchDatasetRecords();
      }
    });
  }

  // Segmented Filter Pills (All, Missing, Duplicates, Complete)
  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.getAttribute('data-filter') || 'all';
      setDatasetFilter(filter);
    });
  });

  const btnClearFilters = document.getElementById('btnClearTableFilters');
  if (btnClearFilters) {
    btnClearFilters.addEventListener('click', () => {
      setDatasetFilter('all');
      AppState.dataset.searchQuery = '';
      const sInput = document.getElementById('datasetSearchInput');
      if (sInput) sInput.value = '';
    });
  }

  // Interactive KPI Metric Cards (Jump to filtered dataset view)
  const cardMissingBox = document.getElementById('cardMissingValuesBox');
  if (cardMissingBox) {
    cardMissingBox.addEventListener('click', () => {
      switchTab('tab-dataset');
      setDatasetFilter('missing');
      showToast('Filtered table to rows containing missing values', 'info');
    });
  }

  const cardDupBox = document.getElementById('cardDuplicateRowsBox');
  if (cardDupBox) {
    cardDupBox.addEventListener('click', () => {
      switchTab('tab-dataset');
      setDatasetFilter('duplicates');
      showToast('Filtered table to duplicate records', 'info');
    });
  }

  // Missing & Duplicate Values Diagnostic Toolbar
  const btnRefreshDiag = document.getElementById('btnRefreshDiagnostic');
  if (btnRefreshDiag) {
    btnRefreshDiag.addEventListener('click', async () => {
      showToast('Refreshing missing and duplicate diagnostics...', 'info');
      await fetchMissingAndDuplicateDiagnostics();
      showToast('Diagnostic audit updated!', 'success');
    });
  }

  const btnQuickRemDups = document.getElementById('btnQuickRemoveDups');
  if (btnQuickRemDups) {
    btnQuickRemDups.addEventListener('click', handleQuickRemoveDuplicates);
  }

  const btnQuickImpMiss = document.getElementById('btnQuickImputeMissing');
  if (btnQuickImpMiss) {
    btnQuickImpMiss.addEventListener('click', handleQuickImputeMissing);
  }

  const btnQuickDropRows = document.getElementById('btnQuickDropMissingRows');
  if (btnQuickDropRows) {
    btnQuickDropRows.addEventListener('click', handleQuickDropMissingRows);
  }

  const btnQuickRst = document.getElementById('btnQuickReset');
  if (btnQuickRst) {
    btnQuickRst.addEventListener('click', () => handleResetDataset(false));
  }

  // Data Cleaning Controls
  const btnExecuteClean = document.getElementById('btnExecuteCleaning');
  if (btnExecuteClean) {
    btnExecuteClean.addEventListener('click', handleExecuteCleaning);
  }

  const btnResetClean = document.getElementById('btnResetCleaning');
  if (btnResetClean) {
    btnResetClean.addEventListener('click', () => handleResetDataset(false));
  }

  // Report Download Buttons
  const btnDownloadReport = document.getElementById('btnDownloadReport');
  if (btnDownloadReport) {
    btnDownloadReport.addEventListener('click', () => {
      window.location.href = `${API_BASE}/api/report?download=txt`;
      showToast('Downloading comprehensive analysis report...', 'success');
    });
  }

  const btnDownloadCleanedCSV = document.getElementById('btnDownloadCleanedCSV');
  if (btnDownloadCleanedCSV) {
    btnDownloadCleanedCSV.addEventListener('click', () => {
      window.location.href = `${API_BASE}/api/report?download=csv`;
      showToast('Downloading processed CSV dataset...', 'success');
    });
  }

  // Box Plots & Outlier Controls
  const btnToggleOutliers = document.getElementById('btnToggleOutliersOnly');
  if (btnToggleOutliers) {
    btnToggleOutliers.addEventListener('click', () => {
      AppState.boxplots.showOutliersOnly = !AppState.boxplots.showOutliersOnly;
      btnToggleOutliers.classList.toggle('active-toggle', AppState.boxplots.showOutliersOnly);
      const txt = document.getElementById('toggleOutliersText');
      if (txt) {
        txt.textContent = AppState.boxplots.showOutliersOnly ? 'Showing Outliers Only' : 'Show Outliers Only';
      }
      if (AppState.boxplots.data) {
        renderIndividualBoxPlotCards(AppState.boxplots.data.columns);
      }
    });
  }

  const btnToggleJitter = document.getElementById('btnToggleJitterPoints');
  if (btnToggleJitter) {
    btnToggleJitter.addEventListener('click', () => {
      AppState.boxplots.showJitter = !AppState.boxplots.showJitter;
      btnToggleJitter.classList.toggle('active-toggle', AppState.boxplots.showJitter);
      const txt = document.getElementById('toggleJitterText');
      if (txt) {
        txt.textContent = AppState.boxplots.showJitter ? 'Data Points: Visible' : 'Data Points: Hidden';
      }
      if (AppState.boxplots.data) {
        renderIndividualBoxPlotCards(AppState.boxplots.data.columns);
      }
    });
  }

  const btnRefreshBP = document.getElementById('btnRefreshBoxPlots');
  if (btnRefreshBP) {
    btnRefreshBP.addEventListener('click', () => {
      fetchBoxPlots();
      showToast('Refreshing box plots and outlier analysis...', 'info');
    });
  }

  const btnExportOutliers = document.getElementById('btnExportOutliersCsv');
  if (btnExportOutliers) {
    btnExportOutliers.addEventListener('click', handleExportOutliersCsv);
  }

  // Delegated event listener for "Locate in Dataset" buttons
  document.addEventListener('click', (e) => {
    const btnLocate = e.target.closest('.btn-view-record');
    if (btnLocate) {
      const searchVal = btnLocate.getAttribute('data-search') || '';
      if (searchVal) {
        locateRecordInDataset(searchVal);
      }
    }
  });
}

// ============================================================================
// DATA FETCHING & DASHBOARD REFRESH
// ============================================================================

async function loadFullDashboard() {
  showLoading('Loading EDA analytics...');
  try {
    await Promise.all([
      fetchSummary(),
      fetchDatasetRecords(),
      fetchStatistics(),
      fetchCorrelations(),
      fetchVisualizations(),
      fetchMissingAndDuplicateDiagnostics(),
      fetchReport()
    ]);
  } catch (err) {
    console.error('Error loading dashboard:', err);
    showToast(`Failed to load data: ${err.message}`, 'error');
  } finally {
    hideLoading();
  }
}

async function fetchSummary() {
  try {
    const res = await fetch(`${API_BASE}/api/summary`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    const data = json.data;
    AppState.summary = data;

    // Update active file badge
    document.getElementById('activeFileName').textContent = data.filename;
    document.getElementById('reportDatasetName').textContent = data.filename;

    // Update Dashboard Metric Cards
    document.getElementById('cardTotalRecords').textContent = (data.total_rows || 0).toLocaleString();
    document.getElementById('cardMemoryUsage').textContent = `Memory: ${data.memory_usage || '0 KB'}`;

    document.getElementById('cardTotalColumns').textContent = (data.total_columns || 0).toString();
    document.getElementById('cardColumnSplit').textContent =
      `${data.numerical_columns_count} Numeric • ${data.categorical_columns_count} Categorical`;

    document.getElementById('cardMissingValues').textContent = (data.missing_values || 0).toLocaleString();
    const cellCount = (data.total_rows * data.total_columns) || 1;
    const missingPct = (((data.missing_values || 0) / cellCount) * 100).toFixed(1);
    document.getElementById('cardMissingRate').textContent = `${missingPct}% of total cells`;

    document.getElementById('cardDuplicateRows').textContent = (data.duplicate_rows || 0).toLocaleString();
    document.getElementById('cardDuplicateStatus').textContent =
      data.duplicate_rows === 0 ? 'Dataset is unique' : `${data.duplicate_rows} duplicate record(s)`;

    document.getElementById('cardAverageValue').textContent =
      data.average_value !== null ? data.average_value.toLocaleString() : 'N/A';
    document.getElementById('cardValueRange').textContent =
      data.min_value !== null ? `Min: ${data.min_value} • Max: ${data.max_value}` : 'No numeric values';

    // Quality Score
    const qScore = data.quality_score || 0;
    document.getElementById('cardQualityScore').textContent = `${qScore}%`;
    document.getElementById('qualityProgressFill').style.width = `${qScore}%`;

    const qRatingElem = document.getElementById('cardQualityRating');
    if (qScore >= 85) {
      qRatingElem.textContent = 'High Integrity';
      qRatingElem.style.color = '#10b981';
      document.getElementById('qualityProgressFill').style.background = 'linear-gradient(90deg, #10b981, #06b6d4)';
    } else if (qScore >= 65) {
      qRatingElem.textContent = 'Moderate Quality';
      qRatingElem.style.color = '#f59e0b';
      document.getElementById('qualityProgressFill').style.background = 'linear-gradient(90deg, #f59e0b, #eab308)';
    } else {
      qRatingElem.textContent = 'Needs Cleaning';
      qRatingElem.style.color = '#ef4444';
      document.getElementById('qualityProgressFill').style.background = 'linear-gradient(90deg, #ef4444, #f43f5e)';
    }

  } catch (err) {
    console.error('Error fetching summary:', err);
    throw err;
  }
}

function setDatasetFilter(filterType) {
  AppState.dataset.activeFilter = filterType;
  AppState.dataset.currentPage = 1;

  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-filter') === filterType);
  });

  fetchDatasetRecords();
}

async function fetchDatasetRecords() {
  try {
    const { currentPage, perPage, searchQuery, sortCol, sortDir, activeFilter } = AppState.dataset;
    const url = new URL(`${API_BASE}/api/data`);
    url.searchParams.set('page', currentPage);
    url.searchParams.set('per_page', perPage);
    if (searchQuery) url.searchParams.set('search', searchQuery);
    if (sortCol) {
      url.searchParams.set('sort_col', sortCol);
      url.searchParams.set('sort_dir', sortDir);
    }
    if (activeFilter && activeFilter !== 'all') {
      url.searchParams.set('filter', activeFilter);
    }

    const res = await fetch(url);
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    const data = json.data;
    AppState.dataset.columns = data.columns;
    AppState.dataset.records = data.records;
    AppState.dataset.totalRecords = data.total_records;
    AppState.dataset.totalPages = data.total_pages;

    renderDatasetTable(data);
    renderSchemaOverviewTable(data.columns_meta);

  } catch (err) {
    console.error('Error fetching dataset records:', err);
    throw err;
  }
}

function renderDatasetTable(data) {
  const thead = document.getElementById('datasetTableHead');
  const tbody = document.getElementById('datasetTableBody');

  // Update Filter Pill counts
  const countAll = document.getElementById('countPillAll');
  if (countAll && typeof data.total_dataset_rows === 'number') {
    countAll.textContent = data.total_dataset_rows.toLocaleString();
  }
  const countMissing = document.getElementById('countPillMissing');
  if (countMissing && typeof data.total_missing_rows === 'number') {
    countMissing.textContent = data.total_missing_rows.toLocaleString();
  }
  const countDuplicates = document.getElementById('countPillDuplicates');
  if (countDuplicates && typeof data.total_duplicate_rows === 'number') {
    countDuplicates.textContent = data.total_duplicate_rows.toLocaleString();
  }
  const countComplete = document.getElementById('countPillComplete');
  if (countComplete && typeof data.total_complete_rows === 'number') {
    countComplete.textContent = data.total_complete_rows.toLocaleString();
  }

  // Build Table Header
  let headHtml = '<tr><th style="width: 55px;">#</th>';
  data.columns.forEach(col => {
    const isSorted = AppState.dataset.sortCol === col;
    const icon = isSorted ? (AppState.dataset.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    headHtml += `
      <th style="cursor: pointer;" onclick="handleSortColumn('${col}')" title="Click to sort by ${col}">
        ${col} <span class="text-muted">${icon}</span>
      </th>`;
  });
  headHtml += '</tr>';
  thead.innerHTML = headHtml;

  // Build Table Rows
  const currentPage = data.current_page || 1;
  const perPage = data.per_page || 10;
  const startIdx = (currentPage - 1) * perPage;
  const records = Array.isArray(data.records) ? data.records : [];
  const totalRecords = typeof data.total_records === 'number' ? data.total_records : 0;
  const totalPages = data.total_pages || 1;

  if (records.length === 0) {
    const colSpan = (data.columns ? data.columns.length : 0) + 1;
    const filterName = AppState.dataset.activeFilter || 'all';
    let emptyMsg = 'No records matching search query.';
    if (filterName === 'missing') emptyMsg = '🎉 No records with missing values! Dataset is completely filled.';
    else if (filterName === 'duplicates') emptyMsg = '✨ Zero duplicate records detected! Dataset rows are distinct.';
    else if (filterName === 'complete') emptyMsg = 'No complete records found matching criteria.';
    tbody.innerHTML = `<tr><td colspan="${colSpan}" class="text-center text-muted py-5">${emptyMsg}</td></tr>`;
  } else {
    let rowsHtml = '';
    records.forEach((row, i) => {
      const isDup = Boolean(row._is_duplicate);
      const hasMissing = Boolean(row._has_missing);
      let rowClasses = [];
      if (isDup) rowClasses.push('row-is-duplicate');
      if (hasMissing) rowClasses.push('row-has-missing');

      const dupBadge = isDup ? `<span class="badge-duplicate" title="Duplicate record across all columns">DUP</span>` : '';
      rowsHtml += `<tr class="${rowClasses.join(' ')}"><td class="text-muted mono">${dupBadge}${startIdx + i + 1}</td>`;
      data.columns.forEach(col => {
        const val = row[col];
        if (val === null || val === undefined) {
          rowsHtml += `<td><span class="cell-missing" title="Missing value (NaN)">NaN</span></td>`;
        } else if (typeof val === 'number') {
          rowsHtml += `<td class="num-cell">${val.toLocaleString()}</td>`;
        } else {
          rowsHtml += `<td>${escapeHtml(String(val))}</td>`;
        }
      });
      rowsHtml += '</tr>';
    });
    tbody.innerHTML = rowsHtml;
  }

  // Update Pagination Controls
  const paginationInfoEl = document.getElementById('paginationInfo');
  if (paginationInfoEl) {
    paginationInfoEl.textContent =
      `Showing ${records.length > 0 ? (startIdx + 1) : 0} - ${startIdx + records.length} of ${totalRecords.toLocaleString()} records`;
  }
  const pageIndicatorEl = document.getElementById('pageIndicator');
  if (pageIndicatorEl) {
    pageIndicatorEl.textContent = `Page ${currentPage} of ${totalPages}`;
  }
  const btnPrevPageEl = document.getElementById('btnPrevPage');
  if (btnPrevPageEl) {
    btnPrevPageEl.disabled = currentPage <= 1;
  }
  const btnNextPageEl = document.getElementById('btnNextPage');
  if (btnNextPageEl) {
    btnNextPageEl.disabled = currentPage >= totalPages;
  }
  const datasetCountSummaryEl = document.getElementById('datasetCountSummary');
  if (datasetCountSummaryEl) {
    const filterName = AppState.dataset.activeFilter || 'all';
    let filterDesc = '';
    if (filterName === 'missing') filterDesc = ' • Filtered by: Incomplete Rows with Missing Values';
    else if (filterName === 'duplicates') filterDesc = ' • Filtered by: Duplicate Rows';
    else if (filterName === 'complete') filterDesc = ' • Filtered by: 100% Complete Records';

    datasetCountSummaryEl.textContent =
      `Displaying ${totalRecords.toLocaleString()} records from ${data.filename || 'dataset'}${filterDesc}`;
  }
}

function handleSortColumn(colName) {
  if (AppState.dataset.sortCol === colName) {
    AppState.dataset.sortDir = AppState.dataset.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    AppState.dataset.sortCol = colName;
    AppState.dataset.sortDir = 'asc';
  }
  AppState.dataset.currentPage = 1;
  fetchDatasetRecords();
}

function renderSchemaOverviewTable(metaList) {
  const tbody = document.getElementById('schemaTableBody');
  if (!tbody || !metaList) return;

  let html = '';
  metaList.forEach(item => {
    const isClean = item.null_count === 0;
    const statusBadge = isClean
      ? '<span class="badge badge-success">Complete</span>'
      : `<span class="badge badge-rose">${item.null_percentage}% Missing</span>`;

    html += `
      <tr>
        <td class="mono font-bold">${item.name}</td>
        <td><span class="badge badge-info">${item.dtype}</span></td>
        <td class="mono">${item.unique_count.toLocaleString()}</td>
        <td class="mono">${item.null_count.toLocaleString()}</td>
        <td class="mono">${item.null_percentage}%</td>
        <td class="mono">${item.unique_count}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

// ============================================================================
// DESCRIPTIVE STATISTICS
// ============================================================================

async function fetchStatistics() {
  try {
    const res = await fetch(`${API_BASE}/api/statistics`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    const stats = json.data;
    AppState.stats = stats;

    document.getElementById('numColsCountBadge').textContent = `${stats.numeric_cols_count} Numeric Columns`;
    document.getElementById('catColsCountBadge').textContent = `${stats.categorical_cols_count} Categorical Columns`;

    // Render Numerical Stats Table
    const numBody = document.getElementById('numericalStatsBody');
    if (!stats.numerical || stats.numerical.length === 0) {
      numBody.innerHTML = '<tr><td colspan="13" class="text-center text-muted">No numerical columns found in this dataset.</td></tr>';
    } else {
      let numHtml = '';
      stats.numerical.forEach(row => {
        numHtml += `
          <tr>
            <td class="mono font-bold">${row.column}</td>
            <td class="mono">${row.count}</td>
            <td class="mono">${row.mean !== null ? row.mean.toLocaleString() : 'N/A'}</td>
            <td class="mono">${row.median !== null ? row.median.toLocaleString() : 'N/A'}</td>
            <td class="mono">${row.std !== null ? row.std.toLocaleString() : 'N/A'}</td>
            <td class="mono">${row.min !== null ? row.min.toLocaleString() : 'N/A'}</td>
            <td class="mono">${row.q25 !== null ? row.q25.toLocaleString() : 'N/A'}</td>
            <td class="mono">${row.q50 !== null ? row.q50.toLocaleString() : 'N/A'}</td>
            <td class="mono">${row.q75 !== null ? row.q75.toLocaleString() : 'N/A'}</td>
            <td class="mono">${row.max !== null ? row.max.toLocaleString() : 'N/A'}</td>
            <td class="mono">${row.iqr !== null ? row.iqr.toLocaleString() : 'N/A'}</td>
            <td class="mono">${row.skewness !== null ? row.skewness.toLocaleString() : 'N/A'}</td>
            <td>${row.missing > 0 ? `<span class="badge badge-rose">${row.missing}</span>` : '<span class="badge badge-success">0</span>'}</td>
          </tr>
        `;
      });
      numBody.innerHTML = numHtml;
    }

    // Render Categorical Stats Table
    const catBody = document.getElementById('categoricalStatsBody');
    if (!stats.categorical || stats.categorical.length === 0) {
      catBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No categorical columns found in this dataset.</td></tr>';
    } else {
      let catHtml = '';
      stats.categorical.forEach(row => {
        const modePct = row.count > 0 ? ((row.freq / row.count) * 100).toFixed(1) : 0;
        catHtml += `
          <tr>
            <td class="mono font-bold">${row.column}</td>
            <td class="mono">${row.count.toLocaleString()}</td>
            <td class="mono">${row.unique}</td>
            <td><strong>${escapeHtml(String(row.top))}</strong></td>
            <td class="mono">${row.freq.toLocaleString()}</td>
            <td class="mono">${modePct}%</td>
            <td>${row.missing > 0 ? `<span class="badge badge-rose">${row.missing}</span>` : '<span class="badge badge-success">0</span>'}</td>
          </tr>
        `;
      });
      catBody.innerHTML = catHtml;
    }

  } catch (err) {
    console.error('Error fetching statistics:', err);
    throw err;
  }
}

// ============================================================================
// CORRELATION ANALYSIS
// ============================================================================

async function fetchCorrelations() {
  try {
    const res = await fetch(`${API_BASE}/api/correlation`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    const data = json.data;
    AppState.correlations = data;

    renderCorrelationMatrix(data);
    renderCorrelationLists(data);

  } catch (err) {
    console.error('Error fetching correlation:', err);
    throw err;
  }
}

function renderCorrelationMatrix(data) {
  const head = document.getElementById('corrMatrixHead');
  const body = document.getElementById('corrMatrixBody');

  if (!data.columns || data.columns.length < 2) {
    head.innerHTML = '<tr><th>Attribute</th><th>Notice</th></tr>';
    body.innerHTML = '<tr><td class="mono">Matrix</td><td class="text-muted">At least 2 numerical columns are required for correlation analysis.</td></tr>';
    return;
  }

  // Header row
  let headHtml = '<tr><th>Feature</th>';
  data.columns.forEach(col => {
    headHtml += `<th class="text-center">${col}</th>`;
  });
  headHtml += '</tr>';
  head.innerHTML = headHtml;

  // Body rows with dynamic heatmap coloring
  let bodyHtml = '';
  data.columns.forEach(rowCol => {
    bodyHtml += `<tr><td class="mono font-bold">${rowCol}</td>`;
    data.columns.forEach(colCol => {
      const val = data.matrix[rowCol] ? data.matrix[rowCol][colCol] : null;
      if (val === null || val === undefined) {
        bodyHtml += `<td class="text-muted">-</td>`;
      } else {
        const bgColor = getCorrelationColor(val);
        const textColor = Math.abs(val) > 0.4 ? '#ffffff' : '#0f172a';
        bodyHtml += `
          <td style="background-color: ${bgColor}; color: ${textColor};" title="${rowCol} vs ${colCol}: ${val}">
            ${val.toFixed(2)}
          </td>`;
      }
    });
    bodyHtml += '</tr>';
  });
  bodyHtml += '';
  body.innerHTML = bodyHtml;
}

function getCorrelationColor(r) {
  // r ranges from -1.0 to +1.0
  if (r >= 0) {
    // Green / Indigo scale
    const intensity = Math.min(1, Math.max(0, r));
    const alpha = (intensity * 0.85 + 0.15).toFixed(2);
    return `rgba(79, 70, 229, ${alpha})`;
  } else {
    // Red / Rose scale
    const intensity = Math.min(1, Math.max(0, Math.abs(r)));
    const alpha = (intensity * 0.85 + 0.15).toFixed(2);
    return `rgba(239, 68, 68, ${alpha})`;
  }
}

function renderCorrelationLists(data) {
  // Strong Positive
  const posCount = document.getElementById('strongPosCount');
  const posList = document.getElementById('strongPosList');
  posCount.textContent = `${data.strong_positive.length} Pairs`;
  if (data.strong_positive.length === 0) {
    posList.innerHTML = '<p class="text-muted text-sm">No strong positive correlations found (r &ge; 0.60).</p>';
  } else {
    let html = '';
    data.strong_positive.forEach(item => {
      html += `
        <div class="corr-item">
          <span class="corr-pair">${item.column1} &bull; ${item.column2}</span>
          <span class="corr-badge badge-emerald">+${item.r.toFixed(3)}</span>
        </div>`;
    });
    posList.innerHTML = html;
  }

  // Strong Negative
  const negCount = document.getElementById('strongNegCount');
  const negList = document.getElementById('strongNegList');
  negCount.textContent = `${data.strong_negative.length} Pairs`;
  if (data.strong_negative.length === 0) {
    negList.innerHTML = '<p class="text-muted text-sm">No strong negative correlations found (r &le; -0.60).</p>';
  } else {
    let html = '';
    data.strong_negative.forEach(item => {
      html += `
        <div class="corr-item">
          <span class="corr-pair">${item.column1} &bull; ${item.column2}</span>
          <span class="corr-badge badge-rose">${item.r.toFixed(3)}</span>
        </div>`;
    });
    negList.innerHTML = html;
  }

  // Moderate & Weak
  const modCount = document.getElementById('modWeakCount');
  const modList = document.getElementById('modWeakList');
  const combined = [...(data.moderate || []), ...(data.weak || [])].slice(0, 10);
  modCount.textContent = `${combined.length} Pairs`;
  if (combined.length === 0) {
    modList.innerHTML = '<p class="text-muted text-sm">None detected.</p>';
  } else {
    let html = '';
    combined.forEach(item => {
      html += `
        <div class="corr-item">
          <span class="corr-pair">${item.column1} &bull; ${item.column2}</span>
          <span class="corr-badge badge-secondary">${item.r >= 0 ? '+' : ''}${item.r.toFixed(3)}</span>
        </div>`;
    });
    modList.innerHTML = html;
  }
}

// ============================================================================
// VISUALIZATIONS MODULE (CHART.JS)
// ============================================================================

async function fetchVisualizations() {
  try {
    const res = await fetch(`${API_BASE}/api/visualizations`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    const { charts, boxplots } = json.data;
    renderAllCharts(charts);

    if (boxplots) {
      renderBoxPlotSection(boxplots);
    } else {
      fetchBoxPlots();
    }

  } catch (err) {
    console.error('Error fetching visualizations:', err);
    throw err;
  }
}

function destroyChart(key) {
  if (AppState.charts[key]) {
    AppState.charts[key].destroy();
    delete AppState.charts[key];
  }
}

function renderAllCharts(charts) {
  // Chart 1: Value by Category
  renderBarChart('dashChart1', 'chart1', charts.chart1);
  renderBarChart('vizChart1', 'viz1', charts.chart1);
  if (charts.chart1) {
    document.getElementById('chart1Title').textContent = charts.chart1.title;
    document.getElementById('chart1Badge').textContent = charts.chart1.x_label;
  }

  // Chart 2: Value by Product (Horizontal)
  renderHorizontalBarChart('vizChart2', 'viz2', charts.chart2);
  if (charts.chart2) {
    document.getElementById('chart2Title').textContent = charts.chart2.title;
  }

  // Chart 3: Category Distribution (Doughnut)
  renderDoughnutChart('dashChart3', 'chart3', charts.chart3);
  renderDoughnutChart('vizChart3', 'viz3', charts.chart3);
  if (charts.chart3) {
    document.getElementById('chart3Title').textContent = charts.chart3.title;
  }

  // Chart 4: Quantity Distribution (Histogram)
  renderBarChart('vizChart4', 'viz4', charts.chart4);
  if (charts.chart4) {
    document.getElementById('chart4Title').textContent = charts.chart4.title;
  }

  // Chart 5: Rating Distribution
  renderBarChart('vizChart5', 'viz5', charts.chart5, CHART_COLORS.warning);
  if (charts.chart5) {
    document.getElementById('chart5Title').textContent = charts.chart5.title;
  }

  // Chart 6: Trend Over Time (Line)
  renderLineChart('vizChart6', 'viz6', charts.chart6);
  if (charts.chart6) {
    document.getElementById('chart6Title').textContent = charts.chart6.title;
  }

  // Chart 7: Scatter Plot
  renderScatterChart('vizChart7', 'viz7', charts.chart7);
  if (charts.chart7) {
    document.getElementById('chart7Title').textContent = charts.chart7.title;
  }

  // Chart 8: Heatmap / Grid
  renderHeatmapGrid(charts.chart8);
}

function renderBarChart(canvasId, chartKey, chartData, customColor = null) {
  destroyChart(chartKey);
  const canvas = document.getElementById(canvasId);
  if (!canvas || !chartData) return;

  const ctx = canvas.getContext('2d');
  AppState.charts[chartKey] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: chartData.labels,
      datasets: [{
        label: chartData.y_label || 'Value',
        data: chartData.data,
        backgroundColor: customColor || CHART_COLORS.primary,
        borderRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { family: 'Plus Jakarta Sans', size: 12 },
          bodyFont: { family: 'JetBrains Mono', size: 12 }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Plus Jakarta Sans', size: 11 } }
        },
        y: {
          grid: { color: '#f1f5f9' },
          ticks: { font: { family: 'JetBrains Mono', size: 11 } }
        }
      }
    }
  });
}

function renderHorizontalBarChart(canvasId, chartKey, chartData) {
  destroyChart(chartKey);
  const canvas = document.getElementById(canvasId);
  if (!canvas || !chartData) return;

  const ctx = canvas.getContext('2d');
  AppState.charts[chartKey] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: chartData.labels,
      datasets: [{
        label: chartData.x_label || 'Total',
        data: chartData.data,
        backgroundColor: CHART_COLORS.secondary,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          bodyFont: { family: 'JetBrains Mono', size: 12 }
        }
      },
      scales: {
        x: {
          grid: { color: '#f1f5f9' },
          ticks: { font: { family: 'JetBrains Mono', size: 11 } }
        },
        y: {
          grid: { display: false },
          ticks: { font: { family: 'Plus Jakarta Sans', size: 11 } }
        }
      }
    }
  });
}

function renderDoughnutChart(canvasId, chartKey, chartData) {
  destroyChart(chartKey);
  const canvas = document.getElementById(canvasId);
  if (!canvas || !chartData) return;

  const ctx = canvas.getContext('2d');
  AppState.charts[chartKey] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: chartData.labels,
      datasets: [{
        data: chartData.data,
        backgroundColor: CHART_COLORS.palette.slice(0, chartData.labels.length),
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { font: { family: 'Plus Jakarta Sans', size: 11 }, boxWidth: 12 }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          bodyFont: { family: 'JetBrains Mono', size: 12 }
        }
      },
      cutout: '65%'
    }
  });
}

function renderLineChart(canvasId, chartKey, chartData) {
  destroyChart(chartKey);
  const canvas = document.getElementById(canvasId);
  if (!canvas || !chartData) return;

  const ctx = canvas.getContext('2d');
  AppState.charts[chartKey] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartData.labels,
      datasets: [{
        label: chartData.y_label || 'Trend',
        data: chartData.data,
        borderColor: CHART_COLORS.primary,
        backgroundColor: 'rgba(79, 70, 229, 0.08)',
        fill: true,
        tension: 0.35,
        pointBackgroundColor: CHART_COLORS.primary,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          bodyFont: { family: 'JetBrains Mono', size: 12 }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Plus Jakarta Sans', size: 11 } }
        },
        y: {
          grid: { color: '#f1f5f9' },
          ticks: { font: { family: 'JetBrains Mono', size: 11 } }
        }
      }
    }
  });
}

function renderScatterChart(canvasId, chartKey, chartData) {
  destroyChart(chartKey);
  const canvas = document.getElementById(canvasId);
  if (!canvas || !chartData || !chartData.points) return;

  const ctx = canvas.getContext('2d');
  AppState.charts[chartKey] = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: `${chartData.y_label} vs ${chartData.x_label}`,
        data: chartData.points,
        backgroundColor: 'rgba(16, 185, 129, 0.65)',
        borderColor: '#10b981',
        borderWidth: 1,
        pointRadius: 5,
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${chartData.x_label}: ${ctx.parsed.x} | ${chartData.y_label}: ${ctx.parsed.y}`
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: chartData.x_label, font: { family: 'Plus Jakarta Sans', size: 11 } },
          grid: { color: '#f1f5f9' },
          ticks: { font: { family: 'JetBrains Mono', size: 11 } }
        },
        y: {
          title: { display: true, text: chartData.y_label, font: { family: 'Plus Jakarta Sans', size: 11 } },
          grid: { color: '#f1f5f9' },
          ticks: { font: { family: 'JetBrains Mono', size: 11 } }
        }
      }
    }
  });
}

function renderHeatmapGrid(heatmapData) {
  const container = document.getElementById('correlationHeatmapContainer');
  if (!container) return;

  if (!heatmapData || !heatmapData.columns || heatmapData.columns.length < 2) {
    container.innerHTML = '<p class="text-muted text-sm text-center py-5">At least 2 numerical columns are required for a correlation heatmap.</p>';
    return;
  }

  const cols = heatmapData.columns;
  const numCols = cols.length;

  let gridHtml = `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
      <div class="heatmap-grid" style="grid-template-columns: repeat(${numCols}, 58px);">
  `;

  cols.forEach(yCol => {
    cols.forEach(xCol => {
      const cell = heatmapData.cells.find(c => c.x === xCol && c.y === yCol);
      const val = cell && cell.value !== null ? cell.value : 0;
      const color = getCorrelationColor(val);
      const textCol = Math.abs(val) > 0.4 ? '#ffffff' : '#0f172a';

      gridHtml += `
        <div class="heatmap-cell" style="background-color: ${color}; color: ${textCol};"
             title="${yCol} &bull; ${xCol}: ${val.toFixed(2)}">
          <span>${val.toFixed(2)}</span>
        </div>
      `;
    });
  });

  gridHtml += `
      </div>
      <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
        Features: ${cols.join(' • ')}
      </div>
    </div>
  `;

  container.innerHTML = gridHtml;
}

// ============================================================================
// BOX PLOTS & OUTLIER DETECTION ENGINE
// ============================================================================

async function fetchBoxPlots() {
  try {
    const res = await fetch(`${API_BASE}/api/boxplots`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    renderBoxPlotSection(json.data);
  } catch (err) {
    console.error('Error fetching box plots:', err);
  }
}

function renderBoxPlotSection(data) {
  if (!data || !data.columns) return;
  AppState.boxplots.data = data;

  // 1. Update Executive KPI Metric Strip
  const totalNumColsEl = document.getElementById('bpTotalNumCols');
  const colsNamesEl = document.getElementById('bpColsNames');
  const colsWithOutliersEl = document.getElementById('bpColsWithOutliers');
  const colsWithOutliersPctEl = document.getElementById('bpColsWithOutliersPct');
  const totalOutliersCountEl = document.getElementById('bpTotalOutliersCount');
  const totalOutliersRateEl = document.getElementById('bpTotalOutliersRate');
  const headerBadgeEl = document.getElementById('outlierHeaderBadge');

  if (totalNumColsEl) totalNumColsEl.textContent = `${data.total_numerical_columns} Columns`;
  if (colsNamesEl) colsNamesEl.textContent = data.columns.map(c => c.column).join(' · ');

  if (colsWithOutliersEl) {
    colsWithOutliersEl.textContent = `${data.columns_with_outliers} of ${data.total_numerical_columns}`;
    colsWithOutliersEl.className = data.columns_with_outliers > 0
      ? 'bp-kpi-value mono font-bold text-rose'
      : 'bp-kpi-value mono font-bold text-success';
  }

  if (colsWithOutliersPctEl) {
    const pct = data.total_numerical_columns > 0
      ? Math.round((data.columns_with_outliers / data.total_numerical_columns) * 100)
      : 0;
    colsWithOutliersPctEl.textContent = `${pct}% of numerical features`;
  }

  if (totalOutliersCountEl) {
    totalOutliersCountEl.textContent = `${data.total_outliers_count} Outliers`;
    totalOutliersCountEl.className = data.total_outliers_count > 0
      ? 'bp-kpi-value mono font-bold text-rose'
      : 'bp-kpi-value mono font-bold text-success';
  }

  if (totalOutliersRateEl) {
    totalOutliersRateEl.textContent = data.total_outliers_count > 0
      ? 'Exceeding 1.5× IQR fences'
      : 'All data points within fences';
  }

  if (headerBadgeEl) {
    if (data.total_outliers_count > 0) {
      headerBadgeEl.className = 'badge badge-rose';
      headerBadgeEl.textContent = `${data.total_outliers_count} Outliers Detected`;
    } else {
      headerBadgeEl.className = 'badge badge-success';
      headerBadgeEl.textContent = '0 Outliers · Normal Spread';
    }
  }

  // 2. Render Column Filter Buttons
  renderBoxPlotFilterButtons(data.columns);

  // 3. Render Comparative Multi-Column Normalized Box Plot
  renderComparativeBoxPlot(data.columns);

  // 4. Render Individual Box Plot Cards Grid
  renderIndividualBoxPlotCards(data.columns);

  // 5. Render Detected Outliers Catalog Table
  renderMasterOutliersTable(data.columns);
}

function renderBoxPlotFilterButtons(columns) {
  const container = document.getElementById('boxplotColumnButtons');
  if (!container) return;

  const currentSelection = AppState.boxplots.selectedCol || 'all';

  let html = `
    <button class="btn btn-sm ${currentSelection === 'all' ? 'btn-primary active' : 'btn-outline'}" data-col="all">
      All Columns (${columns.length})
    </button>
  `;

  columns.forEach(col => {
    const isActive = currentSelection === col.column;
    const hasOutliers = col.outlier_count > 0;
    const badgeText = hasOutliers ? `${col.outlier_count} outliers` : '0';
    html += `
      <button class="btn btn-sm ${isActive ? 'btn-primary active' : 'btn-outline'}" data-col="${escapeHtml(col.column)}">
        ${escapeHtml(col.column)} <span style="opacity: 0.85; font-size: 10px;">(${badgeText})</span>
      </button>
    `;
  });

  container.innerHTML = html;

  // Add click listeners to filter buttons
  container.querySelectorAll('button[data-col]').forEach(btn => {
    btn.addEventListener('click', () => {
      const selected = btn.getAttribute('data-col');
      AppState.boxplots.selectedCol = selected;
      renderBoxPlotFilterButtons(AppState.boxplots.data.columns);
      renderIndividualBoxPlotCards(AppState.boxplots.data.columns);
    });
  });
}

function renderComparativeBoxPlot(columns) {
  const container = document.getElementById('comparativeBoxplotContainer');
  if (!container) return;

  if (!columns || columns.length === 0) {
    container.innerHTML = '<div class="text-center text-muted py-4">No numerical columns available.</div>';
    return;
  }

  const svgWidth = Math.max(680, columns.length * 135);
  const svgHeight = 240;
  const padLeft = 65;
  const padRight = 35;
  const padTop = 25;
  const padBottom = 45;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;

  // Normalization maps each column's value to [0%, 100%]
  const valToNorm = (val, col) => {
    if (col.max === col.min) return 50;
    return ((val - col.min) / (col.max - col.min)) * 100;
  };

  const normToY = (normPct) => {
    return padTop + plotHeight - (normPct / 100) * plotHeight;
  };

  let svg = `
    <svg viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMidYMid meet">
      <!-- Background Guide Lines -->
  `;

  // Draw horizontal reference lines (0%, 25%, 50%, 75%, 100%)
  [0, 25, 50, 75, 100].forEach(pct => {
    const y = normToY(pct);
    svg += `
      <line x1="${padLeft}" y1="${y}" x2="${padLeft + plotWidth}" y2="${y}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="${pct === 0 || pct === 100 ? '0' : '4,4'}" />
      <text x="${padLeft - 10}" y="${y + 4}" text-anchor="end" fill="#64748b" font-size="10" font-family="JetBrains Mono">${pct}%</text>
    `;
  });

  const colSlotWidth = plotWidth / columns.length;
  const boxWidth = Math.min(38, colSlotWidth * 0.45);

  columns.forEach((col, idx) => {
    const centerX = padLeft + (idx + 0.5) * colSlotWidth;

    const normMin = valToNorm(col.min, col);
    const normMax = valToNorm(col.max, col);
    const normQ25 = valToNorm(col.q25, col);
    const normMedian = valToNorm(col.median, col);
    const normQ75 = valToNorm(col.q75, col);
    const normMean = valToNorm(col.mean, col);
    const normLowerWhisker = valToNorm(col.lower_whisker, col);
    const normUpperWhisker = valToNorm(col.upper_whisker, col);

    const yQ25 = normToY(normQ25);
    const yMedian = normToY(normMedian);
    const yQ75 = normToY(normQ75);
    const yLowerWhisker = normToY(normLowerWhisker);
    const yUpperWhisker = normToY(normUpperWhisker);
    const yMean = normToY(normMean);

    // Whiskers
    svg += `
      <!-- Column ${col.column} Whiskers -->
      <line x1="${centerX}" y1="${yLowerWhisker}" x2="${centerX}" y2="${yQ25}" stroke="#475569" stroke-width="1.8" />
      <line x1="${centerX}" y1="${yQ75}" x2="${centerX}" y2="${yUpperWhisker}" stroke="#475569" stroke-width="1.8" />
      <!-- Whisker end caps -->
      <line x1="${centerX - boxWidth * 0.35}" y1="${yLowerWhisker}" x2="${centerX + boxWidth * 0.35}" y2="${yLowerWhisker}" stroke="#475569" stroke-width="1.8" />
      <line x1="${centerX - boxWidth * 0.35}" y1="${yUpperWhisker}" x2="${centerX + boxWidth * 0.35}" y2="${yUpperWhisker}" stroke="#475569" stroke-width="1.8" />
    `;

    // IQR Box (from Q75 down to Q25)
    const boxHeight = Math.max(2, yQ25 - yQ75);
    svg += `
      <!-- Column ${col.column} IQR Box -->
      <rect x="${centerX - boxWidth / 2}" y="${yQ75}" width="${boxWidth}" height="${boxHeight}"
            fill="rgba(79, 70, 229, 0.16)" stroke="#4f46e5" stroke-width="2" rx="3"
            style="cursor: pointer;"
            onmouseenter="showBpTooltip(event, '${escapeHtml(col.column)} Summary', 'Min: <strong>${col.min}</strong><br>Q1: <strong>${col.q25}</strong><br>Median: <strong>${col.median}</strong><br>Q3: <strong>${col.q75}</strong><br>Max: <strong>${col.max}</strong><br>Outliers: <strong>${col.outlier_count}</strong>')"
            onmouseleave="hideBpTooltip()" />
    `;

    // Median Line
    svg += `
      <!-- Median line -->
      <line x1="${centerX - boxWidth / 2}" y1="${yMedian}" x2="${centerX + boxWidth / 2}" y2="${yMedian}" stroke="#0f172a" stroke-width="2.5" />
    `;

    // Mean Marker (small emerald diamond)
    svg += `
      <polygon points="${centerX},${yMean - 4} ${centerX + 4},${yMean} ${centerX},${yMean + 4} ${centerX - 4},${yMean}" fill="#10b981" stroke="#ffffff" stroke-width="1" />
    `;

    // Outlier points on comparative view
    col.outliers.forEach(outlier => {
      const normVal = valToNorm(outlier.value, col);
      const yOutlier = normToY(normVal);
      svg += `
        <circle cx="${centerX}" cy="${yOutlier}" r="4.5" fill="#e11d48" stroke="#ffffff" stroke-width="1.5" class="outlier-point"
                onmouseenter="showBpTooltip(event, '${escapeHtml(col.column)} Outlier', 'Value: <strong>${outlier.value}</strong><br>Record: <strong>${escapeHtml(outlier.label)}</strong><br>Row: <strong>#${outlier.row_number}</strong><br>Deviation: <strong>+${outlier.deviation}</strong><br>Fence: <strong>${outlier.fence}</strong>')"
                onmouseleave="hideBpTooltip()" />
      `;
    });

    // Column label at bottom
    const outlierBadge = col.outlier_count > 0 ? ` (${col.outlier_count})` : '';
    const labelColor = col.outlier_count > 0 ? '#be123c' : '#0f172a';
    svg += `
      <text x="${centerX}" y="${padTop + plotHeight + 20}" text-anchor="middle" fill="${labelColor}" font-size="11" font-weight="600" font-family="Plus Jakarta Sans">
        ${escapeHtml(col.column.length > 14 ? col.column.substring(0, 12) + '…' : col.column)}${outlierBadge}
      </text>
      <text x="${centerX}" y="${padTop + plotHeight + 34}" text-anchor="middle" fill="#64748b" font-size="9.5" font-family="JetBrains Mono">
        [${col.min} – ${col.max}]
      </text>
    `;
  });

  svg += `</svg>`;
  container.innerHTML = svg;
}

function renderIndividualBoxPlotCards(columns) {
  const container = document.getElementById('individualBoxplotsGrid');
  if (!container) return;

  const selectedCol = AppState.boxplots.selectedCol || 'all';
  const showOutliersOnly = AppState.boxplots.showOutliersOnly || false;
  const showJitter = AppState.boxplots.showJitter !== false;

  let filtered = columns;
  if (selectedCol !== 'all') {
    filtered = filtered.filter(c => c.column === selectedCol);
  }
  if (showOutliersOnly) {
    filtered = filtered.filter(c => c.outlier_count > 0);
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="card p-5 text-center">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5" style="margin: 0 auto 12px;"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>
        <h4 style="margin-bottom: 6px;">No Columns Match Filter</h4>
        <p class="text-muted text-sm">No numerical attributes match the current filter selection (${showOutliersOnly ? 'Columns with Outliers' : selectedCol}).</p>
        <div class="mt-3">
          <button class="btn btn-sm btn-outline" onclick="AppState.boxplots.selectedCol='all'; AppState.boxplots.showOutliersOnly=false; renderBoxPlotFilterButtons(AppState.boxplots.data.columns); renderIndividualBoxPlotCards(AppState.boxplots.data.columns);">
            Reset Column Filters
          </button>
        </div>
      </div>
    `;
    return;
  }

  let html = '';
  filtered.forEach(col => {
    html += generateIndividualBoxPlotCardHtml(col, showJitter);
  });

  container.innerHTML = html;

  // Add click listeners to collapsible outlier inspector toggles
  container.querySelectorAll('.bp-collapse-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const content = toggle.nextElementSibling;
      if (content) {
        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'block' : 'none';
        toggle.querySelector('.toggle-arrow').textContent = isHidden ? '▲' : '▼';
      }
    });
  });
}

function generateIndividualBoxPlotCardHtml(col, showJitter) {
  const hasOutliers = col.outlier_count > 0;
  const statusBadge = hasOutliers
    ? `<span class="bp-status-badge badge-outlier">${col.outlier_count} Outliers Detected (${col.outlier_percentage}%)</span>`
    : `<span class="bp-status-badge badge-clean">Normal Range · 0 Outliers</span>`;

  // SVG coordinate configuration
  const svgWidth = 760;
  const svgHeight = 140;
  const padLeft = 80;
  const padRight = 60;
  const padTop = 20;
  const padBottom = 35;
  const plotWidth = svgWidth - padLeft - padRight;
  const centerY = 58;

  // Establish plotting range including fences and min/max
  const plotMin = Math.min(col.min, col.lower_fence);
  const plotMax = Math.max(col.max, col.upper_fence);
  const rawSpan = plotMax - plotMin;
  const spanPadding = rawSpan > 0 ? rawSpan * 0.06 : 1.0;
  const spanMin = plotMin - spanPadding;
  const spanMax = plotMax + spanPadding;
  const totalSpan = spanMax - spanMin;

  const valToX = (val) => {
    if (totalSpan <= 0) return padLeft + plotWidth / 2;
    return padLeft + ((val - spanMin) / totalSpan) * plotWidth;
  };

  const xMin = valToX(col.min);
  const xMax = valToX(col.max);
  const xLowerWhisker = valToX(col.lower_whisker);
  const xUpperWhisker = valToX(col.upper_whisker);
  const xQ25 = valToX(col.q25);
  const xMedian = valToX(col.median);
  const xQ75 = valToX(col.q75);
  const xMean = valToX(col.mean);
  const xLowerFence = valToX(col.lower_fence);
  const xUpperFence = valToX(col.upper_fence);

  let svg = `
    <svg viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMidYMid meet">
      <!-- Outlier Zone Background Highlights -->
  `;

  // Faint red shaded area for lower outlier zone (if within visible range)
  if (col.lower_fence > spanMin) {
    const w = Math.max(0, xLowerFence - padLeft);
    svg += `
      <rect x="${padLeft}" y="12" width="${w}" height="76" fill="rgba(244, 63, 94, 0.05)" />
    `;
  }

  // Faint red shaded area for upper outlier zone
  if (col.upper_fence < spanMax) {
    const w = Math.max(0, (padLeft + plotWidth) - xUpperFence);
    svg += `
      <rect x="${xUpperFence}" y="12" width="${w}" height="76" fill="rgba(244, 63, 94, 0.05)" />
    `;
  }

  // Lower Fence line (dashed red)
  if (col.lower_fence >= spanMin && col.lower_fence <= spanMax) {
    svg += `
      <line x1="${xLowerFence}" y1="12" x2="${xLowerFence}" y2="88" stroke="#f43f5e" stroke-width="1.4" stroke-dasharray="3,3" />
      <text x="${xLowerFence}" y="10" text-anchor="middle" fill="#be123c" font-size="9" font-family="JetBrains Mono" font-weight="600">Lower Fence: ${col.lower_fence}</text>
    `;
  }

  // Upper Fence line (dashed red)
  if (col.upper_fence >= spanMin && col.upper_fence <= spanMax) {
    svg += `
      <line x1="${xUpperFence}" y1="12" x2="${xUpperFence}" y2="88" stroke="#f43f5e" stroke-width="1.4" stroke-dasharray="3,3" />
      <text x="${xUpperFence}" y="10" text-anchor="middle" fill="#be123c" font-size="9" font-family="JetBrains Mono" font-weight="600">Upper Fence: ${col.upper_fence}</text>
    `;
  }

  // Whiskers (Lower Whisker to Q1, and Q3 to Upper Whisker)
  svg += `
    <line x1="${xLowerWhisker}" y1="${centerY}" x2="${xQ25}" stroke="#475569" stroke-width="2" />
    <line x1="${xQ75}" y1="${centerY}" x2="${xUpperWhisker}" stroke="#475569" stroke-width="2" />
    <!-- Lower whisker cap -->
    <line x1="${xLowerWhisker}" y1="${centerY - 12}" x2="${xLowerWhisker}" y2="${centerY + 12}" stroke="#475569" stroke-width="2" />
    <!-- Upper whisker cap -->
    <line x1="${xUpperWhisker}" y1="${centerY - 12}" x2="${xUpperWhisker}" y2="${centerY + 12}" stroke="#475569" stroke-width="2" />
  `;

  // Interquartile Range (IQR) Box
  const boxW = Math.max(3, xQ75 - xQ25);
  svg += `
    <rect x="${xQ25}" y="${centerY - 22}" width="${boxW}" height="44"
          fill="rgba(79, 70, 229, 0.16)" stroke="#4f46e5" stroke-width="2.2" rx="4"
          onmouseenter="showBpTooltip(event, '${escapeHtml(col.column)} IQR Box', 'Q1 (25%): <strong>${col.q25}</strong><br>Median (50%): <strong>${col.median}</strong><br>Q3 (75%): <strong>${col.q75}</strong><br>IQR Span: <strong>${col.iqr}</strong>')"
          onmouseleave="hideBpTooltip()" />
  `;

  // Median line (bold vertical slate)
  svg += `
    <line x1="${xMedian}" y1="${centerY - 22}" x2="${xMedian}" y2="${centerY + 22}" stroke="#0f172a" stroke-width="3" />
    <circle cx="${xMedian}" cy="${centerY - 22}" r="2" fill="#0f172a" />
  `;

  // Mean Marker (emerald diamond)
  svg += `
    <polygon points="${xMean},${centerY - 6} ${xMean + 5},${centerY} ${xMean},${centerY + 6} ${xMean - 5},${centerY}"
             fill="#10b981" stroke="#ffffff" stroke-width="1.2"
             onmouseenter="showBpTooltip(event, '${escapeHtml(col.column)} Mean', 'Calculated Mean: <strong>${col.mean}</strong><br>Std Dev: <strong>${col.std}</strong>')"
             onmouseleave="hideBpTooltip()" />
  `;

  // Optional Data Jitter Points Overlay
  if (showJitter && col.sample_values && col.sample_values.length > 0) {
    col.sample_values.forEach((v, sIdx) => {
      // If point is not an outlier, render quiet scatter dot
      if (v >= col.lower_fence && v <= col.upper_fence) {
        const jx = valToX(v);
        const jy = centerY + (Math.sin(sIdx * 1.7) * 13);
        svg += `
          <circle cx="${jx}" cy="${jy}" r="2.5" fill="rgba(99, 102, 241, 0.35)" />
        `;
      }
    });
  }

  // OUTLIER POINTS (Prominently Highlighted with pulsing crimson rings)
  if (hasOutliers) {
    col.outliers.forEach(outlier => {
      const ox = valToX(outlier.value);
      const isExtreme = outlier.is_extreme;
      const pointColor = isExtreme ? '#be123c' : '#e11d48';

      svg += `
        <!-- Outlier Halo Ring -->
        <circle cx="${ox}" cy="${centerY}" r="11" fill="none" stroke="${isExtreme ? 'rgba(190, 18, 60, 0.45)' : 'rgba(225, 29, 72, 0.35)'}" stroke-width="1.5" />
        <!-- Outlier Node -->
        <circle cx="${ox}" cy="${centerY}" r="6.5" fill="${pointColor}" stroke="#ffffff" stroke-width="2.2" class="outlier-point"
                onmouseenter="showBpTooltip(event, '🚨 Outlier in ${escapeHtml(col.column)}', 'Value: <strong>${outlier.value}</strong><br>Threshold Fence: <strong>${outlier.fence}</strong><br>Deviation: <strong>+${outlier.deviation}</strong> (${outlier.direction})<br>Severity: <strong>${isExtreme ? 'Extreme (> 3.0× IQR)' : 'Mild (> 1.5× IQR)'}</strong><br>Record: <strong>${escapeHtml(outlier.label)}</strong> (Row #${outlier.row_number})')"
                onmouseleave="hideBpTooltip()" />
      `;
    });
  }

  // Coordinate Bottom Axis
  svg += `
    <line x1="${padLeft}" y1="98" x2="${padLeft + plotWidth}" y2="98" stroke="#cbd5e1" stroke-width="1.2" />
  `;

  // Draw 5-7 evenly spaced tick markers along the axis
  const tickCount = 6;
  for (let i = 0; i <= tickCount; i++) {
    const tickVal = spanMin + (i / tickCount) * totalSpan;
    const tx = padLeft + (i / tickCount) * plotWidth;
    svg += `
      <line x1="${tx}" y1="98" x2="${tx}" y2="103" stroke="#94a3b8" stroke-width="1" />
      <text x="${tx}" y="115" text-anchor="middle" fill="#64748b" font-size="10" font-family="JetBrains Mono">${roundVal(tickVal, 1)}</text>
    `;
  }

  svg += `</svg>`;

  // Outlier records sub-table html
  let outlierRowsHtml = '';
  if (hasOutliers) {
    col.outliers.forEach(outlier => {
      const isExtreme = outlier.is_extreme;
      const badgeClass = isExtreme ? 'badge-rose' : 'badge-warning';
      const searchKey = outlier.label.replace('Row ', '').trim();

      outlierRowsHtml += `
        <tr>
          <td class="mono font-bold">#${outlier.row_number}</td>
          <td><strong>${escapeHtml(outlier.label)}</strong></td>
          <td class="mono font-bold text-rose">${outlier.value}</td>
          <td class="mono">${outlier.fence}</td>
          <td class="mono text-rose">+${outlier.deviation}</td>
          <td><span class="badge ${outlier.direction === 'high' ? 'badge-rose' : 'badge-info'}">${outlier.direction.toUpperCase()}</span></td>
          <td><span class="badge ${badgeClass}">${isExtreme ? 'Extreme' : 'Mild'}</span></td>
          <td>
            <button class="btn btn-sm btn-outline btn-view-record" data-search="${escapeHtml(searchKey)}">
              View in Dataset
            </button>
          </td>
        </tr>
      `;
    });
  }

  return `
    <div class="boxplot-card ${hasOutliers ? 'has-outliers' : 'no-outliers'}">
      <div class="boxplot-card-header">
        <div class="bp-title-wrap">
          <span class="bp-col-title">${escapeHtml(col.column)}</span>
          <span class="text-sm text-muted">(${col.count.toLocaleString()} valid records)</span>
        </div>
        <div>
          ${statusBadge}
        </div>
      </div>

      <div class="boxplot-svg-wrap">
        ${svg}
      </div>

      <!-- Five-Number Summary Strip -->
      <div class="boxplot-stats-strip">
        <div class="bp-stat-chip">
          <div class="bp-stat-chip-label">Min</div>
          <div class="bp-stat-chip-val">${col.min}</div>
        </div>
        <div class="bp-stat-chip highlight-fence">
          <div class="bp-stat-chip-label">Lower Fence</div>
          <div class="bp-stat-chip-val">${col.lower_fence}</div>
        </div>
        <div class="bp-stat-chip">
          <div class="bp-stat-chip-label">Q1 (25%)</div>
          <div class="bp-stat-chip-val">${col.q25}</div>
        </div>
        <div class="bp-stat-chip" style="background-color: #f1f5f9; border-color: #cbd5e1;">
          <div class="bp-stat-chip-label">Median (Q2)</div>
          <div class="bp-stat-chip-val">${col.median}</div>
        </div>
        <div class="bp-stat-chip" style="border-color: #a7f3d0; background-color: #ecfdf5;">
          <div class="bp-stat-chip-label" style="color: #047857;">Mean</div>
          <div class="bp-stat-chip-val" style="color: #047857;">${col.mean}</div>
        </div>
        <div class="bp-stat-chip">
          <div class="bp-stat-chip-label">Q3 (75%)</div>
          <div class="bp-stat-chip-val">${col.q75}</div>
        </div>
        <div class="bp-stat-chip highlight-fence">
          <div class="bp-stat-chip-label">Upper Fence</div>
          <div class="bp-stat-chip-val">${col.upper_fence}</div>
        </div>
        <div class="bp-stat-chip">
          <div class="bp-stat-chip-label">Max</div>
          <div class="bp-stat-chip-val">${col.max}</div>
        </div>
        <div class="bp-stat-chip">
          <div class="bp-stat-chip-label">IQR Span</div>
          <div class="bp-stat-chip-val">${col.iqr}</div>
        </div>
      </div>

      <!-- Collapsible Outlier Records Deep-Dive -->
      ${hasOutliers ? `
        <div class="bp-outliers-collapse">
          <button class="bp-collapse-toggle">
            <span>Inspect ${col.outlier_count} Detected Outliers for <strong>${escapeHtml(col.column)}</strong></span>
            <span class="toggle-arrow">▼</span>
          </button>
          <div class="bp-collapse-content" style="display: none;">
            <div class="table-responsive mt-2">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Identifier / Label</th>
                    <th>Value</th>
                    <th>Fence Threshold</th>
                    <th>Deviation</th>
                    <th>Direction</th>
                    <th>Severity</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${outlierRowsHtml}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ` : `
        <div style="font-size: 11.5px; color: #166534; margin-top: 10px; display: flex; align-items: center; gap: 6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span>All values fall cleanly between Tukey lower fence (${col.lower_fence}) and upper fence (${col.upper_fence}).</span>
        </div>
      `}
    </div>
  `;
}

function renderMasterOutliersTable(columns) {
  const tbody = document.getElementById('outliersMasterTableBody');
  if (!tbody) return;

  const allOutliers = [];
  columns.forEach(col => {
    if (col.outliers && col.outliers.length > 0) {
      col.outliers.forEach(item => {
        allOutliers.push({
          column: col.column,
          ...item
        });
      });
    }
  });

  if (allOutliers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-success py-4">No outliers detected across any numerical columns in this dataset.</td></tr>';
    return;
  }

  // Sort all outliers by deviation amount descending
  allOutliers.sort((a, b) => b.deviation - a.deviation);

  let html = '';
  allOutliers.forEach(item => {
    const isExtreme = item.is_extreme;
    const badgeClass = isExtreme ? 'badge-rose' : 'badge-warning';
    const searchKey = item.label.replace('Row ', '').trim();

    html += `
      <tr>
        <td class="mono font-bold">${escapeHtml(item.column)}</td>
        <td class="mono">#${item.row_number}</td>
        <td><strong>${escapeHtml(item.label)}</strong></td>
        <td class="mono font-bold text-rose">${item.value}</td>
        <td class="mono">${item.fence}</td>
        <td class="mono text-rose">+${item.deviation}</td>
        <td><span class="badge ${item.direction === 'high' ? 'badge-rose' : 'badge-info'}">${item.direction.toUpperCase()}</span></td>
        <td><span class="badge ${badgeClass}">${isExtreme ? 'Extreme' : 'Mild'}</span></td>
        <td>
          <button class="btn btn-sm btn-outline btn-view-record" data-search="${escapeHtml(searchKey)}">
            View in Dataset
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function handleExportOutliersCsv() {
  const data = AppState.boxplots.data;
  if (!data || !data.columns) {
    showToast('No outlier data available to export.', 'warning');
    return;
  }

  const rows = [
    ['Column', 'Row_Number', 'Identifier_Label', 'Outlier_Value', 'Threshold_Fence', 'Deviation', 'Direction', 'Severity']
  ];

  data.columns.forEach(col => {
    if (col.outliers) {
      col.outliers.forEach(item => {
        rows.push([
          `"${col.column}"`,
          item.row_number,
          `"${item.label.replace(/"/g, '""')}"`,
          item.value,
          item.fence,
          item.deviation,
          item.direction,
          item.is_extreme ? 'Extreme' : 'Mild'
        ]);
      });
    }
  });

  if (rows.length === 1) {
    showToast('No outliers detected in the dataset to export.', 'info');
    return;
  }

  const csvContent = rows.map(e => e.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `EDA_Outliers_${AppState.dataset.filename || 'dataset'}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Outliers report downloaded successfully.', 'success');
}

function locateRecordInDataset(searchVal) {
  // 1. Switch to Dataset tab
  switchTab('tab-dataset');

  // 2. Set search input value
  const searchInput = document.getElementById('datasetSearchInput');
  if (searchInput) {
    searchInput.value = searchVal;
    AppState.dataset.searchQuery = searchVal;
    AppState.dataset.currentPage = 1;
    fetchDatasetRecords();
  }

  // 3. Scroll table into view
  const tableWrap = document.getElementById('datasetTableContainer');
  if (tableWrap) {
    tableWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  showToast(`Filtering records for "${searchVal}"...`, 'info');
}

// Tooltip utility functions
let activeTooltipEl = null;

function showBpTooltip(event, title, contentHtml) {
  if (!activeTooltipEl) {
    activeTooltipEl = document.getElementById('bpTooltip');
    if (!activeTooltipEl) {
      activeTooltipEl = document.createElement('div');
      activeTooltipEl.id = 'bpTooltip';
      activeTooltipEl.className = 'bp-tooltip';
      document.body.appendChild(activeTooltipEl);
    }
  }

  activeTooltipEl.innerHTML = `
    <div class="bp-tooltip-title">${title}</div>
    <div style="font-size: 11px;">${contentHtml}</div>
  `;

  activeTooltipEl.style.display = 'block';
  positionBpTooltip(event);
}

function positionBpTooltip(event) {
  if (!activeTooltipEl) return;
  const x = event.clientX + 14;
  const y = event.clientY + 14;
  activeTooltipEl.style.left = `${Math.min(window.innerWidth - 260, x)}px`;
  activeTooltipEl.style.top = `${y}px`;
}

function hideBpTooltip() {
  if (activeTooltipEl) {
    activeTooltipEl.style.display = 'none';
  }
}

window.showBpTooltip = showBpTooltip;
window.hideBpTooltip = hideBpTooltip;

document.addEventListener('mousemove', (e) => {
  if (activeTooltipEl && activeTooltipEl.style.display === 'block') {
    positionBpTooltip(e);
  }
});

function roundVal(val, decimals = 1) {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return Number(val).toFixed(decimals);
}

// ============================================================================
// DATA CLEANING MODULE
// ============================================================================

async function handleExecuteCleaning() {
  const actions = [];
  if (document.getElementById('cleanRemoveDups').checked) actions.push('remove_duplicates');
  if (document.getElementById('cleanFillNumeric').checked) actions.push('fill_missing_numerical');
  if (document.getElementById('cleanFillCat').checked) actions.push('fill_missing_categorical');
  if (document.getElementById('cleanDropEmptyCols').checked) actions.push('drop_empty_columns');
  if (document.getElementById('cleanDropMissingRows').checked) actions.push('drop_missing_rows');
  if (document.getElementById('cleanConvertTypes').checked) actions.push('convert_types');

  if (actions.length === 0) {
    showToast('Please select at least one cleaning operation.', 'warning');
    return;
  }

  const numStrategy = document.getElementById('numericStrategySelect').value;
  const catStrategy = document.getElementById('catStrategySelect').value;

  showLoading('Executing selected cleaning operations in Pandas...');

  try {
    const res = await fetch(`${API_BASE}/api/clean`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actions,
        numeric_strategy: numStrategy,
        categorical_strategy: catStrategy
      })
    });

    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    const data = json.data;
    displayCleaningAudit(data);
    showToast('Data cleaning transformations applied successfully!', 'success');

    // Refresh entire dashboard with updated cleaned dataset
    await loadFullDashboard();

  } catch (err) {
    console.error('Cleaning failed:', err);
    showToast(`Cleaning Error: ${err.message}`, 'error');
  } finally {
    hideLoading();
  }
}

function displayCleaningAudit(data) {
  const auditCard = document.getElementById('cleaningAuditCard');
  auditCard.style.display = 'block';

  document.getElementById('auditRowsBefore').textContent = data.before.total_rows.toLocaleString();
  document.getElementById('auditRowsAfter').textContent = data.after.total_rows.toLocaleString();
  document.getElementById('auditRowsDiff').textContent = `${data.improvements.rows_diff} rows change`;

  document.getElementById('auditMissingBefore').textContent = data.before.missing_values.toLocaleString();
  document.getElementById('auditMissingAfter').textContent = data.after.missing_values.toLocaleString();
  document.getElementById('auditMissingDiff').textContent = `${data.improvements.missing_reduced} cells resolved`;

  document.getElementById('auditDupsBefore').textContent = data.before.duplicate_rows.toLocaleString();
  document.getElementById('auditDupsAfter').textContent = data.after.duplicate_rows.toLocaleString();
  document.getElementById('auditDupsDiff').textContent = `${data.improvements.duplicates_removed} duplicates dropped`;

  document.getElementById('auditQualityBefore').textContent = `${data.before.quality_score}%`;
  document.getElementById('auditQualityAfter').textContent = `${data.after.quality_score}%`;
  const qGain = data.improvements.quality_gain;
  document.getElementById('auditQualityDiff').textContent = `${qGain >= 0 ? '+' : ''}${qGain}% Quality Shift`;

  // Render logs
  const logsBox = document.getElementById('cleaningLogsContainer');
  let logHtml = '<div><strong>Execution Pipeline Log:</strong></div>';
  data.logs.forEach(log => {
    logHtml += `<div>&bull; ${escapeHtml(log)}</div>`;
  });
  logsBox.innerHTML = logHtml;
}

// ============================================================================
// CSV UPLOAD & RESET LOGIC
// ============================================================================

async function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.name.toLowerCase().endsWith('.csv')) {
    showToast('Only .csv files are supported. Please select a CSV file.', 'error');
    e.target.value = '';
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  showLoading(`Uploading and analyzing '${file.name}' via Pandas...`);

  try {
    const res = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      body: formData
    });

    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    showToast(`Dataset '${file.name}' successfully loaded and analyzed!`, 'success');
    e.target.value = '';

    // Reset pagination to first page
    AppState.dataset.currentPage = 1;
    AppState.dataset.searchQuery = '';
    const sInput = document.getElementById('datasetSearchInput');
    if (sInput) sInput.value = '';

    // Hide previous cleaning audit
    document.getElementById('cleaningAuditCard').style.display = 'none';

    // Full dashboard refresh
    await loadFullDashboard();

  } catch (err) {
    console.error('Upload failed:', err);
    showToast(`Upload Error: ${err.message}`, 'error');
  } finally {
    hideLoading();
  }
}

async function handleResetDataset(reloadSample = false) {
  showLoading(reloadSample ? 'Reloading default sample dataset...' : 'Restoring original uncleaned dataset...');
  try {
    const res = await fetch(`${API_BASE}/api/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reload_sample: reloadSample })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    showToast(json.message || 'Dataset restored to original state.', 'success');
    const auditCard = document.getElementById('cleaningAuditCard');
    if (auditCard) auditCard.style.display = 'none';

    // Reset dataset view, search, and filter pills
    AppState.dataset.currentPage = 1;
    AppState.dataset.searchQuery = '';
    AppState.dataset.activeFilter = 'all';
    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === 'all');
    });

    const sInput = document.getElementById('datasetSearchInput');
    if (sInput) sInput.value = '';

    // Reset cleaning form checkboxes
    const cDups = document.getElementById('cleanRemoveDups');
    if (cDups) cDups.checked = true;
    const cNum = document.getElementById('cleanFillNumeric');
    if (cNum) cNum.checked = true;
    const cCat = document.getElementById('cleanFillCat');
    if (cCat) cCat.checked = true;
    const cEmpty = document.getElementById('cleanDropEmptyCols');
    if (cEmpty) cEmpty.checked = false;
    const cDropRows = document.getElementById('cleanDropMissingRows');
    if (cDropRows) cDropRows.checked = false;
    const cTypes = document.getElementById('cleanConvertTypes');
    if (cTypes) cTypes.checked = true;

    await loadFullDashboard();

  } catch (err) {
    console.error('Reset error:', err);
    showToast(`Reset Error: ${err.message}`, 'error');
  } finally {
    hideLoading();
  }
}

// ============================================================================
// MISSING VALUES & DUPLICATES DIAGNOSTICS & QUICK ACTIONS
// ============================================================================

async function fetchMissingAndDuplicateDiagnostics() {
  try {
    const res = await fetch(`${API_BASE}/api/missing-values`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    const data = json.data;
    const summary = AppState.summary || {};
    const totalRows = summary.total_rows || (data.columns && data.columns.length > 0 ? (data.columns[0].non_null_count + data.columns[0].missing_count) : 0);

    // Diagnostic stat boxes
    const diagMissingCells = document.getElementById('diagMissingCells');
    if (diagMissingCells) diagMissingCells.textContent = (data.total_missing_cells || 0).toLocaleString();

    const diagMissingPct = document.getElementById('diagMissingPct');
    if (diagMissingPct) diagMissingPct.textContent = `${data.overall_missing_percentage || 0}% of all cells`;

    const rowsWithMissing = Math.max(0, totalRows - (data.complete_cases || 0));
    const diagMissingRows = document.getElementById('diagMissingRows');
    if (diagMissingRows) diagMissingRows.textContent = rowsWithMissing.toLocaleString();

    const diagMissingRowsPct = document.getElementById('diagMissingRowsPct');
    if (diagMissingRowsPct) {
      const pct = totalRows > 0 ? ((rowsWithMissing / totalRows) * 100).toFixed(1) : '0';
      diagMissingRowsPct.textContent = `${pct}% of records`;
    }

    const diagDuplicateRows = document.getElementById('diagDuplicateRows');
    if (diagDuplicateRows) diagDuplicateRows.textContent = (data.duplicate_rows || 0).toLocaleString();

    const diagDuplicateStatus = document.getElementById('diagDuplicateStatus');
    if (diagDuplicateStatus) {
      diagDuplicateStatus.textContent = data.duplicate_rows === 0 ? 'Zero duplicates' : `${data.duplicate_rows} duplicate record(s)`;
    }

    const diagCompleteCases = document.getElementById('diagCompleteCases');
    if (diagCompleteCases) diagCompleteCases.textContent = (data.complete_cases || 0).toLocaleString();

    const diagCompleteCasesPct = document.getElementById('diagCompleteCasesPct');
    if (diagCompleteCasesPct) {
      const compPct = totalRows > 0 ? (((data.complete_cases || 0) / totalRows) * 100).toFixed(1) : '100';
      diagCompleteCasesPct.textContent = `${compPct}% clean rows`;
    }

    // Per-column missing breakdown table
    const tbody = document.getElementById('missingTableBody');
    if (tbody && data.columns) {
      if (data.columns.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">No column data available.</td></tr>';
      } else {
        let html = '';
        data.columns.forEach(col => {
          const completeness = Math.max(0, 100 - (col.missing_percentage || 0)).toFixed(1);
          const hasMissing = col.missing_count > 0;
          const isNum = col.dtype.includes('int') || col.dtype.includes('float');
          const quickActionBtn = hasMissing
            ? `<button class="btn btn-sm btn-outline" style="padding: 2px 8px; font-size: 11px;" onclick="handleQuickImputeSingleColumn('${col.column}', '${isNum ? 'mean' : 'mode'}')" title="Impute ${col.column}">Fill with ${isNum ? 'Mean' : 'Mode'}</button>`
            : `<span class="badge badge-success">100% Complete</span>`;

          html += `
            <tr>
              <td><strong>${escapeHtml(col.column)}</strong></td>
              <td><span class="badge ${isNum ? 'badge-primary' : 'badge-secondary'}">${col.dtype}</span></td>
              <td class="${hasMissing ? 'text-amber font-bold' : 'text-muted'}">${col.missing_count.toLocaleString()}</td>
              <td>${col.missing_percentage}%</td>
              <td>${col.non_null_count.toLocaleString()}</td>
              <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div class="completeness-bar-wrap" style="flex: 1;">
                    <div class="completeness-fill" style="width: ${completeness}%;"></div>
                  </div>
                  <span style="font-size: 11px; font-weight: 600; width: 38px;">${completeness}%</span>
                </div>
              </td>
              <td>${quickActionBtn}</td>
            </tr>
          `;
        });
        tbody.innerHTML = html;
      }
    }
  } catch (err) {
    console.error('Error fetching missing values diagnostic:', err);
  }
}

async function handleQuickRemoveDuplicates() {
  showLoading('Executing Pandas drop_duplicates()...');
  try {
    const res = await fetch(`${API_BASE}/api/clean`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actions: ['remove_duplicates'] })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    showToast(json.data.logs[0] || 'Duplicate rows removed!', 'success');
    displayCleaningAudit(json.data);
    await loadFullDashboard();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    hideLoading();
  }
}

async function handleQuickImputeMissing() {
  showLoading('Imputing missing values across numeric & categorical features...');
  try {
    const res = await fetch(`${API_BASE}/api/clean`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actions: ['fill_missing_numerical', 'fill_missing_categorical'],
        numeric_strategy: 'mean',
        categorical_strategy: 'mode'
      })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    showToast('Missing values successfully imputed with mean and mode!', 'success');
    displayCleaningAudit(json.data);
    await loadFullDashboard();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    hideLoading();
  }
}

async function handleQuickDropMissingRows() {
  if (!confirm('Are you sure you want to drop all rows containing missing values?')) return;
  showLoading('Dropping incomplete rows (dropna)...');
  try {
    const res = await fetch(`${API_BASE}/api/clean`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actions: ['drop_missing_rows'] })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    showToast('Incomplete records dropped!', 'success');
    displayCleaningAudit(json.data);
    await loadFullDashboard();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    hideLoading();
  }
}

window.handleQuickImputeSingleColumn = async function(columnName, strategy) {
  showLoading(`Imputing column '${columnName}' with ${strategy}...`);
  try {
    const action = (strategy === 'mode') ? 'fill_missing_categorical' : 'fill_missing_numerical';
    const res = await fetch(`${API_BASE}/api/clean`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actions: [action],
        target_column: columnName,
        numeric_strategy: strategy,
        categorical_strategy: strategy
      })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    showToast(`Column '${columnName}' imputed successfully!`, 'success');
    displayCleaningAudit(json.data);
    await loadFullDashboard();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    hideLoading();
  }
};

// ============================================================================
// REPORTS MODULE
// ============================================================================

async function fetchReport() {
  try {
    const res = await fetch(`${API_BASE}/api/report`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    const report = json.data;

    document.getElementById('reportTimestamp').textContent = report.metadata.generated_at;
    document.getElementById('repTotalRecords').textContent = report.summary.total_records.toLocaleString();
    document.getElementById('repTotalCols').textContent = report.summary.total_columns.toString();
    document.getElementById('repMissing').textContent = report.summary.missing_cells.toLocaleString();
    document.getElementById('repDuplicates').textContent = report.summary.duplicate_rows.toLocaleString();
    document.getElementById('repQuality').textContent = `${report.summary.quality_score}%`;

    // Quality visual
    document.getElementById('repQualityScoreVal').textContent = `${report.summary.quality_score}%`;
    document.getElementById('repQualityBar').style.width = `${report.summary.quality_score}%`;

    const qRec = document.getElementById('repQualityRec');
    if (report.summary.quality_score >= 85) {
      qRec.textContent = 'Excellent data health. The dataset is ready for downstream analytical models and reporting.';
      document.getElementById('repQualityBar').style.background = 'linear-gradient(90deg, #10b981, #06b6d4)';
    } else {
      qRec.textContent = 'Imputation and deduplication are advised before running heavy machine learning pipelines.';
      document.getElementById('repQualityBar').style.background = 'linear-gradient(90deg, #f59e0b, #ef4444)';
    }

    // Observations List
    const obsList = document.getElementById('reportObservationsList');
    let obsHtml = '';
    report.observations.forEach(obs => {
      obsHtml += `<li>${escapeHtml(obs)}</li>`;
    });
    obsList.innerHTML = obsHtml;

    // Audit History
    const historyContainer = document.getElementById('reportAuditHistory');
    if (!report.cleaning_history || report.cleaning_history.length === 0) {
      historyContainer.innerHTML = '<p class="text-muted text-sm">No transformations executed yet.</p>';
    } else {
      let histHtml = '';
      report.cleaning_history.forEach(item => {
        histHtml += `<div>[${item.timestamp}] <strong>${escapeHtml(item.action)}</strong> (Rows: ${item.rows}, Cols: ${item.cols})</div>`;
      });
      historyContainer.innerHTML = histHtml;
    }

  } catch (err) {
    console.error('Error compiling report:', err);
  }
}

// ============================================================================
// UTILITIES: TOASTS, LOADING, SANITIZATION
// ============================================================================

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function showLoading(msg = 'Processing Dataset Analysis...') {
  const overlay = document.getElementById('loadingOverlay');
  const msgElem = document.getElementById('loadingMessage');
  if (msgElem) msgElem.textContent = msg;
  if (overlay) overlay.classList.add('active');
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.remove('active');
}

function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"']/g, match => {
    switch (match) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return match;
    }
  });
}

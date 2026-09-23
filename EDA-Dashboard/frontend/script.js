/**
 * Exploratory Data Analysis (EDA) Dashboard - Client Controller
 * Pure vanilla JavaScript connecting seamlessly to Flask REST APIs.
 * Powered by Chart.js, Fetch API, and reactive DOM manipulation.
 */

// Determine backend API origin dynamically
const API_BASE = (window.location.protocol.startsWith('http') && window.location.port !== '5500')
  ? window.location.origin
  : 'http://127.0.0.1:5000';

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
    sortDir: 'asc'
  },
  summary: null,
  charts: {},
  stats: null,
  correlations: null,
  cleaningHistory: []
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

  // Data Cleaning Controls
  const btnExecuteClean = document.getElementById('btnExecuteCleaning');
  if (btnExecuteClean) {
    btnExecuteClean.addEventListener('click', handleExecuteCleaning);
  }

  const btnResetClean = document.getElementById('btnResetCleaning');
  if (btnResetClean) {
    btnResetClean.addEventListener('click', handleResetDataset);
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

async function fetchDatasetRecords() {
  try {
    const { currentPage, perPage, searchQuery, sortCol, sortDir } = AppState.dataset;
    const url = new URL(`${API_BASE}/api/data`);
    url.searchParams.set('page', currentPage);
    url.searchParams.set('per_page', perPage);
    if (searchQuery) url.searchParams.set('search', searchQuery);
    if (sortCol) {
      url.searchParams.set('sort_col', sortCol);
      url.searchParams.set('sort_dir', sortDir);
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

  // Build Table Header
  let headHtml = '<tr><th style="width: 45px;">#</th>';
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
  if (!data.records || data.records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${data.columns.length + 1}" class="text-center text-muted py-5">No records matching query.</td></tr>`;
  } else {
    let rowsHtml = '';
    const startIdx = (data.current_page - 1) * data.per_page;
    data.records.forEach((row, i) => {
      rowsHtml += `<tr><td class="text-muted mono">${startIdx + i + 1}</td>`;
      data.columns.forEach(col => {
        const val = row[col];
        if (val === null || val === undefined) {
          rowsHtml += `<td><span class="badge badge-secondary" title="Missing value">null</span></td>`;
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
  document.getElementById('paginationInfo').textContent =
    `Showing ${data.records.length > 0 ? (startIdx + 1) : 0} - ${startIdx + data.records.length} of ${data.total_records.toLocaleString()} records`;
  document.getElementById('pageIndicator').textContent = `Page ${data.current_page} of ${data.total_pages}`;
  document.getElementById('btnPrevPage').disabled = data.current_page <= 1;
  document.getElementById('btnNextPage').disabled = data.current_page >= data.total_pages;
  document.getElementById('datasetCountSummary').textContent =
    `Displaying ${data.total_records.toLocaleString()} total filtered records from ${data.filename}`;
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

    const { charts } = json.data;
    renderAllCharts(charts);

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
    await Promise.all([
      fetchSummary(),
      fetchDatasetRecords(),
      fetchStatistics(),
      fetchCorrelations(),
      fetchVisualizations(),
      fetchReport()
    ]);

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

async function handleResetDataset() {
  showLoading('Restoring original dataset...');
  try {
    const res = await fetch(`${API_BASE}/api/reset`, { method: 'POST' });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    showToast('Dataset reset to original state.', 'success');
    document.getElementById('cleaningAuditCard').style.display = 'none';

    AppState.dataset.currentPage = 1;
    AppState.dataset.searchQuery = '';
    const sInput = document.getElementById('datasetSearchInput');
    if (sInput) sInput.value = '';

    await loadFullDashboard();

  } catch (err) {
    console.error('Reset error:', err);
    showToast(`Reset Error: ${err.message}`, 'error');
  } finally {
    hideLoading();
  }
}

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

# Exploratory Data Analysis (EDA) Dashboard

An interactive, responsive, internship-level full-stack web application designed for comprehensive Exploratory Data Analysis (EDA), automated data cleaning, descriptive statistics, correlation detection, Chart.js visualizations, and executive report generation.

![EDA Dashboard Preview](https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80)

---

## 1. Project Overview

The **Exploratory Data Analysis (EDA) Dashboard** empowers data analysts, engineers, and business intelligence teams to upload any standard CSV dataset and instantly extract deep statistical insights. Rather than writing repetitive Python and Pandas boilerplate scripts, users gain immediate access to:

- Automated dataset profiling and metadata extraction.
- Paginated, searchable record explorer with null value highlighting.
- High-level KPI summary cards with dynamic Data Quality scoring.
- Comprehensive descriptive statistics for continuous and categorical dimensions.
- Pairwise Pearson correlation matrices and categorized association lists.
- Interactive, multi-dimensional Chart.js charts.
- Non-destructive, selectable data cleaning pipeline with before/after audit metrics.
- Exportable executive intelligence reports and cleaned CSV data files.

---

## 2. Technology Stack

### Frontend
- **HTML5 & CSS3**: Pure semantic markup and responsive CSS design system (zero external heavy UI frameworks).
- **Modern JavaScript (ES6+)**: Modular asynchronous client architecture utilizing native `fetch()`, DOM manipulation, and state management.
- **Chart.js**: Interactive visualizations (Bar, Horizontal Bar, Doughnut, Line, Scatter, and Correlation Heatmaps).

### Backend
- **Python 3**: Robust data manipulation backend.
- **Flask**: Lightweight, high-performance RESTful API server.
- **Flask-CORS**: Cross-Origin Resource Sharing middleware facilitating local frontend-backend decoupling.

### Data Analysis & Computation
- **Pandas**: High-performance DataFrame operations, aggregations, group-by transformations, and data hygiene pipelines.
- **NumPy**: Vectorized numeric operations, percentile determinations, and binning.

---

## 3. Project Folder Structure

```
EDA-Dashboard/
│
├── backend/
│   ├── app.py                # Primary Flask REST API server and analytical logic
│   ├── requirements.txt      # Python package dependencies
│   └── uploads/              # Storage directory for uploaded user datasets
│
├── frontend/
│   ├── index.html            # Main dashboard user interface
│   ├── style.css             # Complete design system, themes, and responsiveness
│   └── script.js             # Client controller, API client, and Chart.js renderer
│
├── data/
│   └── sample_sales.csv      # Default retail sales dataset (loaded on initial boot)
│
├── reports/                  # Generated audit trails and downloaded reports
│
└── README.md                 # Complete documentation and setup manual
```

---

## 4. REST API Documentation

All API responses adhere to a consistent JSON standard:

```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully"
}
```

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Serves the web dashboard (`frontend/index.html`). |
| `GET` | `/api/summary` | Returns high-level metrics (total rows, columns, null count, duplicates, quality score, memory). |
| `GET` | `/api/data` | Returns paginated dataset rows with query params: `?page=1&per_page=15&search=keyword&sort_col=col&sort_dir=asc`. |
| `POST` | `/api/upload` | Multipart form upload accepting `.csv` files up to 16MB. Validates format and reads into Pandas. |
| `GET` | `/api/statistics` | Descriptive statistics (mean, median, std, min, max, Q1, Q2, Q3, IQR, skewness, modes, counts). |
| `GET` | `/api/correlation` | Pearson correlation matrix and classified lists (strong positive, strong negative, moderate, weak). |
| `GET` | `/api/missing-values` | Detailed missing value rates per feature, duplicate records count, and empty column detection. |
| `GET` | `/api/categories` | Categorical feature cardinalities and top 10 frequent values with percentage distributions. |
| `GET` | `/api/visualizations` | Dynamically structured datasets for 8 Chart.js charts with intelligent column fallback logic. |
| `POST` | `/api/clean` | Executes selected preprocessing operations (`remove_duplicates`, `fill_missing_numerical`, etc.) and yields before/after comparison. |
| `POST` | `/api/reset` | Reverts active dataset to the original file or reloads `data/sample_sales.csv`. |
| `GET` | `/api/report` | Generates executive report. Supports `?download=txt` (text summary) or `?download=csv` (cleaned dataset). |

---

## 5. Running in VS Code, Chrome, Edge & Other Environments

The application is engineered to run seamlessly across all major operating systems (Windows, macOS, Linux) and browsers (Google Chrome, Microsoft Edge, Mozilla Firefox, Apple Safari).

### Quick Start (Recommended)

You have two simple ways to launch the app:

#### Option A: Full-Stack Node + Python Server (One Command)
```bash
# 1. Install dependencies
npm install
pip install -r requirements.txt

# 2. Start the application
npm run dev
```
- Open `http://localhost:3000` in **Google Chrome**, **Microsoft Edge**, or your favorite browser.
- Automatically launches the Python Flask backend daemon and Node.js proxy with CORS, process management, and live error reporting.

#### Option B: Standalone Python Server (Zero Node.js Required)
```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run Python server
python backend/app.py
```
- Open `http://localhost:3000` (or `http://127.0.0.1:3000`) in Chrome or Edge.
- Python directly serves both the REST API and the frontend dashboard assets without any extra runtime.

---

### Running Directly inside VS Code

1. **Open the project folder** in VS Code (`File > Open Folder...`).
2. **Press `F5`** (or go to `Run and Debug` in the left sidebar):
   - Choose **"EDA Studio: Full-Stack (Node + Python)"** to start both servers in the integrated terminal.
   - Choose **"Launch in Google Chrome"** or **"Launch in Microsoft Edge"** to automatically launch and attach the browser.
   - Or select the compound configurations **"Full-Stack + Chrome"** / **"Full-Stack + Edge"** to start the server and open the browser in a single click!
3. **VS Code Tasks**:
   - Press `Ctrl + Shift + B` (or `Cmd + Shift + B` on Mac) to run the default build/dev task.
4. **VS Code Live Server Support**:
   - If using the popular *Live Server* extension on port 5500, the frontend automatically routes API requests to `http://localhost:3000` or `http://127.0.0.1:5000` with full CORS support enabled.

---

### Browser Compatibility & Testing

| Browser | Supported | Features Tested & Verified |
|---|---|---|
| **Google Chrome** | ✅ Verified | V8 high-perf Chart.js rendering, WebKit scrollbars, drag-and-drop file upload |
| **Microsoft Edge** | ✅ Verified | Chromium engine, Edge DevTools debugging, SVG favicons, zero-flicker transitions |
| **Mozilla Firefox** | ✅ Verified | CSS `scrollbar-width: thin;`, Gecko layout engine, standard Fetch API |
| **Apple Safari** | ✅ Verified | `-webkit-font-smoothing`, responsive grid, touch-friendly UI |
| **VS Code Simple Browser** | ✅ Verified | Runs directly inside VS Code's internal browser tab |

---

## 6. How the Frontend Connects to the Flask Backend

1. **Auto-Origin Resolution**: In `frontend/script.js`, the client evaluates `window.location.origin`. When served directly from Flask, all API calls use standard relative paths (same origin), eliminating latency and cross-origin blocking.
2. **CORS Flexibility**: When working with VS Code Live Server (`http://127.0.0.1:5500`), the client seamlessly falls back to `http://127.0.0.1:5000`. Flask's `CORS(app)` ensures all requests pass without CORS rejection.
3. **Reactive Updates**: When a CSV is uploaded or cleaning operations are executed, `script.js` uses `fetch()` to execute asynchronous updates without requiring a page reload.

---

## 7. Key Functional Modules

### A. Automatic EDA Engine
- Scans data types, total rows, features, memory footprints, and completeness.
- Computes IQR-based outlier ratios to construct an objective Data Quality Score (0–100%).

### B. Interactive Visualizations
1. **Sales / Metric by Category**: Aggregated group totals bar chart.
2. **Top Products / Records**: Horizontal bar chart of top 10 performing entities.
3. **Category Distribution**: Doughnut chart illustrating volumetric market share.
4. **Quantity / Numeric Binned Distribution**: Frequency histogram across custom ranges.
5. **Satisfaction / Rating Distribution**: Ordered frequency chart.
6. **Chronological Trend**: Time-series progression grouped by month or date.
7. **Bivariate Scatter Plot**: Cross-feature dispersion inspection.
8. **Correlation Matrix Heatmap**: Color-coded Pearson grid (-1.00 to +1.00).

### C. Data Cleaning & Transformation Pipeline
Users can interactively select:
- **Deduplication**: Drops exact duplicate rows.
- **Numerical Imputation**: Mean or Median replacement strategies.
- **Categorical Imputation**: Mode or explicit `'Unknown'` replacement.
- **Column Pruning**: Eliminates columns with 100% missing values.
- **Strict Row Pruning**: Discards remaining incomplete rows.
- **Type Normalization**: Normalizes dates and numeric strings.
- **Before-vs-After Comparison**: Immediate audit view showing rows changed, cells recovered, and quality score delta.

---

## 8. Troubleshooting Common Issues

| Issue | Cause | Solution |
|---|---|---|
| `ModuleNotFoundError: No module named 'flask'` | Virtual environment not activated or packages not installed. | Run `pip install -r backend/requirements.txt` inside active `venv`. |
| `Address already in use` | Another service is using port 3000 or 5000. | Stop the conflicting process or run `PORT=5050 python backend/app.py`. |
| `Upload fails: Invalid file format` | Uploaded file does not have `.csv` extension. | Export your spreadsheet as standard comma-separated `.csv`. |
| `Charts not rendering` | CDN script blocked by browser extension. | Ensure internet access is enabled to load Chart.js from jsDelivr CDN. |

---

## 9. Preparing for GitHub & Portfolio Demonstration

To publish this project to GitHub for technical interviews and internship applications:

```bash
# Initialize git repository
git init

# Stage all project files
git add .

# Commit with a professional message
git commit -m "feat: complete exploratory data analysis (EDA) dashboard"

# Link to your remote GitHub repository
git remote add origin https://github.com/your-username/eda-dashboard.git
git branch -M main
git push -u origin main
```

---

## 10. Future Enhancements

- Support for Parquet and Excel (`.xlsx`) datasets.
- One-click machine learning baseline models (Random Forest / Logistic Regression).
- Automated PCA (Principal Component Analysis) 2D projection.
- PDF export with embedded vector charts.

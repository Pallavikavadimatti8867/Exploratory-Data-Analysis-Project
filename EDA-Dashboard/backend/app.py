"""
Exploratory Data Analysis (EDA) Dashboard - Backend API Server
Built with Flask, Flask-CORS, Pandas, and NumPy.
Provides full REST API endpoints for dataset upload, automated EDA,
statistical analysis, data cleaning, correlation calculations, visualization data,
and report generation.
"""

import os
import io
import re
import json
import math
from datetime import datetime
from werkzeug.utils import secure_filename
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS

# Initialize Flask Application
app = Flask(__name__, static_folder=None)

# Configure CORS to allow frontend communication from any local port / origin
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Configuration constants
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'backend', 'uploads')
DATA_FOLDER = os.path.join(BASE_DIR, 'data')
FRONTEND_FOLDER = os.path.join(BASE_DIR, 'frontend')
REPORTS_FOLDER = os.path.join(BASE_DIR, 'reports')

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(DATA_FOLDER, exist_ok=True)
os.makedirs(REPORTS_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB max upload size
ALLOWED_EXTENSIONS = {'csv'}

# Global dataset state management
# In production/multi-user scenarios this would be in a session store or database.
CURRENT_DATASET = {
    'df': None,
    'original_df': None,
    'filename': 'sample_sales.csv',
    'uploaded_at': None,
    'history': []
}


def allowed_file(filename):
    """Validate whether file extension is allowed (.csv)."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def clean_val_for_json(val):
    """Sanitize float / numpy / timestamp values for strict JSON serialization."""
    if val is None:
        return None
    if isinstance(val, (float, np.floating)):
        if math.isnan(val) or math.isinf(val):
            return None
        return float(val)
    if isinstance(val, (int, np.integer)):
        return int(val)
    if isinstance(val, (np.bool_, bool)):
        return bool(val)
    if pd.isna(val):
        return None
    return str(val)


def sanitize_dict_for_json(d):
    """Recursively sanitize a dictionary or list for JSON compliance."""
    if isinstance(d, dict):
        return {k: sanitize_dict_for_json(v) for k, v in d.items()}
    elif isinstance(d, list):
        return [sanitize_dict_for_json(x) for x in d]
    else:
        return clean_val_for_json(d)


def load_dataset(filepath, filename='sample_sales.csv'):
    """Load a CSV file safely into global state with multiple encoding fallbacks."""
    encodings = ['utf-8', 'latin1', 'iso-8859-1', 'cp1252']
    df = None
    last_err = None
    for enc in encodings:
        try:
            df = pd.read_csv(filepath, encoding=enc)
            break
        except Exception as e:
            last_err = e
            continue

    if df is None:
        raise ValueError(f"Unable to read CSV file: {str(last_err)}")

    # Standardize column headers (strip whitespace)
    df.columns = [str(col).strip() for col in df.columns]

    CURRENT_DATASET['df'] = df.copy()
    CURRENT_DATASET['original_df'] = df.copy()
    CURRENT_DATASET['filename'] = filename
    CURRENT_DATASET['uploaded_at'] = datetime.now().isoformat()
    CURRENT_DATASET['history'] = [{
        'action': 'Initial Load',
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'rows': int(len(df)),
        'cols': int(len(df.columns))
    }]
    return df


def get_active_df():
    """Retrieve the currently loaded dataframe or load sample_sales.csv if uninitialized."""
    if CURRENT_DATASET['df'] is None:
        sample_path = os.path.join(DATA_FOLDER, 'sample_sales.csv')
        if os.path.exists(sample_path):
            load_dataset(sample_path, 'sample_sales.csv')
        else:
            # Fallback inline sample if sample_sales.csv not on disk
            sample_data = {
                'ID': [101, 102, 103, 104, 105],
                'Product': ['Laptop', 'Mouse', 'Keyboard', 'Monitor', 'Headphones'],
                'Category': ['Electronics', 'Electronics', 'Electronics', 'Electronics', 'Audio'],
                'Sales': [1200.0, 25.5, 75.0, 300.0, 89.9],
                'Quantity': [1, 2, 1, 1, 3],
                'Rating': [4.7, 4.2, 4.5, 4.8, 4.3],
                'Order_Date': ['2024-01-10', '2024-01-12', '2024-01-15', '2024-01-18', '2024-01-20'],
                'Customer_ID': ['C001', 'C002', 'C003', 'C004', 'C005']
            }
            df = pd.DataFrame(sample_data)
            CURRENT_DATASET['df'] = df.copy()
            CURRENT_DATASET['original_df'] = df.copy()
            CURRENT_DATASET['filename'] = 'sample_sales.csv'
            CURRENT_DATASET['uploaded_at'] = datetime.now().isoformat()
            CURRENT_DATASET['history'] = []
    return CURRENT_DATASET['df']


def calculate_data_quality_score(df):
    """
    Calculate an objective, dynamic data quality score (0 to 100%).
    Factors:
    - Missing value ratio (40% weight)
    - Duplicate row ratio (30% weight)
    - Constant / empty column ratio (15% weight)
    - Outlier presence ratio (15% weight)
    """
    total_cells = df.size
    if total_cells == 0:
        return 0.0

    total_rows = len(df)
    total_cols = len(df.columns)

    missing_cells = int(df.isna().sum().sum())
    missing_ratio = missing_cells / total_cells if total_cells > 0 else 0

    duplicate_rows = int(df.duplicated().sum())
    duplicate_ratio = duplicate_rows / total_rows if total_rows > 0 else 0

    # Empty columns (100% missing)
    empty_cols = sum(1 for col in df.columns if df[col].isna().all())
    empty_col_ratio = empty_cols / total_cols if total_cols > 0 else 0

    # Numerical outlier check via IQR
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    outlier_cells = 0
    total_numeric_cells = 0
    for col in numeric_cols:
        series = df[col].dropna()
        if len(series) > 4:
            q25, q75 = series.quantile(0.25), series.quantile(0.75)
            iqr = q75 - q25
            lower_bound = q25 - 1.5 * iqr
            upper_bound = q75 + 1.5 * iqr
            outliers = ((series < lower_bound) | (series > upper_bound)).sum()
            outlier_cells += int(outliers)
            total_numeric_cells += len(series)

    outlier_ratio = outlier_cells / total_numeric_cells if total_numeric_cells > 0 else 0
    missing_pct = missing_ratio * 100.0
    duplicate_pct = duplicate_ratio * 100.0
    empty_col_pct = empty_col_ratio * 100.0
    outlier_pct = outlier_ratio * 100.0

    # Scaled penalties for data hygiene defects
    penalties = (missing_pct * 1.5) + (duplicate_pct * 2.0) + (empty_col_pct * 3.0) + (outlier_pct * 0.5)
    score = 100.0 - penalties
    return max(0.0, min(100.0, round(score, 1)))


# Initialize sample dataset on startup
try:
    sample_file = os.path.join(DATA_FOLDER, 'sample_sales.csv')
    if os.path.exists(sample_file):
        load_dataset(sample_file, 'sample_sales.csv')
except Exception as e:
    print(f"Notice: Initial sample dataset load warning: {e}")


# ============================================================================
# STATIC AND FRONTEND ROUTES
# ============================================================================

@app.route('/')
def index():
    """Serve the primary frontend dashboard index.html."""
    return send_from_directory(FRONTEND_FOLDER, 'index.html')


@app.route('/<path:filename>')
def serve_frontend_assets(filename):
    """Serve frontend CSS, JS, and static assets."""
    if os.path.exists(os.path.join(FRONTEND_FOLDER, filename)):
        return send_from_directory(FRONTEND_FOLDER, filename)
    return jsonify({'success': False, 'message': f'Asset {filename} not found'}), 404


# ============================================================================
# REST API ENDPOINTS
# ============================================================================

@app.route('/api/summary', methods=['GET'])
def get_summary():
    """
    GET /api/summary
    Returns key summary metrics for dashboard cards and dataset health.
    """
    try:
        df = get_active_df()
        total_rows = int(len(df))
        total_cols = int(len(df.columns))
        missing_count = int(df.isna().sum().sum())
        duplicate_count = int(df.duplicated().sum())

        numeric_df = df.select_dtypes(include=[np.number])
        if not numeric_df.empty:
            avg_val = round(float(numeric_df.mean().mean()), 2)
            max_val = round(float(numeric_df.max().max()), 2)
            min_val = round(float(numeric_df.min().min()), 2)
        else:
            avg_val = None
            max_val = None
            min_val = None

        quality_score = calculate_data_quality_score(df)
        memory_bytes = int(df.memory_usage(deep=True).sum())
        memory_str = f"{memory_bytes / 1024:.1f} KB" if memory_bytes < 1024 * 1024 else f"{memory_bytes / (1024 * 1024):.2f} MB"

        column_types = {}
        for col in df.columns:
            dtype_str = str(df[col].dtype)
            if 'int' in dtype_str:
                column_types[col] = 'Integer'
            elif 'float' in dtype_str:
                column_types[col] = 'Float'
            elif 'datetime' in dtype_str or 'date' in col.lower():
                column_types[col] = 'DateTime'
            else:
                column_types[col] = 'Categorical'

        return jsonify({
            'success': True,
            'message': 'Summary retrieved successfully',
            'data': {
                'filename': CURRENT_DATASET.get('filename', 'sample_sales.csv'),
                'total_rows': total_rows,
                'total_columns': total_cols,
                'missing_values': missing_count,
                'duplicate_rows': duplicate_count,
                'average_value': avg_val,
                'max_value': max_val,
                'min_value': min_val,
                'quality_score': quality_score,
                'memory_usage': memory_str,
                'numerical_columns_count': len(numeric_df.columns),
                'categorical_columns_count': total_cols - len(numeric_df.columns),
                'column_types': column_types,
                'history': CURRENT_DATASET.get('history', [])
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f"Error computing summary: {str(e)}"}), 500


@app.route('/api/data', methods=['GET'])
def get_data():
    """
    GET /api/data
    Retrieves paginated, searchable, sortable dataset records with column metadata.
    Query params:
      - page: page number (default 1)
      - per_page: rows per page (default 15)
      - search: filter keyword
      - sort_col: column name
      - sort_dir: 'asc' or 'desc'
    """
    try:
        df = get_active_df()
        filtered_df = df.copy()

        # Handle global search
        search_query = request.args.get('search', '').strip()
        if search_query:
            mask = np.column_stack([
                filtered_df[col].astype(str).str.contains(search_query, case=False, na=False)
                for col in filtered_df.columns
            ])
            filtered_df = filtered_df[mask.any(axis=1)]

        # Handle sorting
        sort_col = request.args.get('sort_col', '').strip()
        sort_dir = request.args.get('sort_dir', 'asc').lower()
        if sort_col and sort_col in filtered_df.columns:
            ascending = (sort_dir == 'asc')
            filtered_df = filtered_df.sort_values(by=sort_col, ascending=ascending)

        total_records = len(filtered_df)
        page = max(1, int(request.args.get('page', 1)))
        per_page = max(1, min(100, int(request.args.get('per_page', 15))))
        total_pages = max(1, math.ceil(total_records / per_page))

        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        paginated_df = filtered_df.iloc[start_idx:end_idx]

        # Convert records to dictionary, ensuring NaNs become None
        records = []
        for _, row in paginated_df.iterrows():
            row_dict = {}
            for col in df.columns:
                row_dict[col] = clean_val_for_json(row[col])
            records.append(row_dict)

        # Build column stats summary
        columns_meta = []
        for col in df.columns:
            null_count = int(df[col].isna().sum())
            columns_meta.append({
                'name': col,
                'dtype': str(df[col].dtype),
                'null_count': null_count,
                'null_percentage': round((null_count / len(df)) * 100, 1) if len(df) > 0 else 0,
                'unique_count': int(df[col].nunique(dropna=True))
            })

        return jsonify({
            'success': True,
            'message': 'Dataset records retrieved successfully',
            'data': {
                'columns': list(df.columns),
                'columns_meta': columns_meta,
                'records': records,
                'total_records': total_records,
                'total_dataset_rows': len(df),
                'total_columns': len(df.columns),
                'current_page': page,
                'per_page': per_page,
                'total_pages': total_pages,
                'filename': CURRENT_DATASET.get('filename', 'dataset.csv')
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f"Error fetching dataset: {str(e)}"}), 500


@app.route('/api/upload', methods=['POST'])
def upload_file():
    """
    POST /api/upload
    Receives CSV file via multipart/form-data, validates, securely saves,
    loads via Pandas, and computes instant EDA.
    """
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'message': 'No file part in the request'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'message': 'No file selected for upload'}), 400

        if not allowed_file(file.filename):
            return jsonify({
                'success': False,
                'message': 'Invalid file format. Please upload a valid .csv file'
            }), 400

        filename = secure_filename(file.filename)
        if not filename:
            filename = f"upload_{int(datetime.now().timestamp())}.csv"

        save_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(save_path)

        # Validate that the file is not completely empty
        if os.path.getsize(save_path) == 0:
            os.remove(save_path)
            return jsonify({'success': False, 'message': 'The uploaded CSV file is empty'}), 400

        # Read dataset into Pandas
        df = load_dataset(save_path, filename)

        if df.empty:
            return jsonify({'success': False, 'message': 'Dataset contains zero rows'}), 400

        return jsonify({
            'success': True,
            'message': f"Dataset '{filename}' successfully uploaded and analyzed",
            'data': {
                'filename': filename,
                'rows': int(len(df)),
                'columns': list(df.columns),
                'columns_count': int(len(df.columns)),
                'quality_score': calculate_data_quality_score(df)
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f"Failed to process CSV file: {str(e)}"}), 500


@app.route('/api/statistics', methods=['GET'])
def get_statistics():
    """
    GET /api/statistics
    Descriptive statistics for both numerical and categorical columns.
    Numerical: count, mean, median, std, min, max, 25%, 50%, 75%, IQR, variance, skewness.
    Categorical: count, unique, top, freq, missing.
    """
    try:
        df = get_active_df()
        numeric_df = df.select_dtypes(include=[np.number])
        cat_df = df.select_dtypes(exclude=[np.number])

        numerical_stats = []
        for col in numeric_df.columns:
            s = numeric_df[col].dropna()
            if s.empty:
                numerical_stats.append({
                    'column': col,
                    'count': 0,
                    'mean': None,
                    'median': None,
                    'std': None,
                    'min': None,
                    'max': None,
                    'q25': None,
                    'q50': None,
                    'q75': None,
                    'iqr': None,
                    'variance': None,
                    'skewness': None,
                    'missing': int(df[col].isna().sum())
                })
                continue

            q25 = float(s.quantile(0.25))
            q50 = float(s.median())
            q75 = float(s.quantile(0.75))
            iqr = q75 - q25
            std_val = float(s.std()) if len(s) > 1 else 0.0
            var_val = float(s.var()) if len(s) > 1 else 0.0
            skew_val = float(s.skew()) if len(s) > 2 else 0.0

            numerical_stats.append({
                'column': col,
                'count': int(len(s)),
                'mean': round(float(s.mean()), 3),
                'median': round(q50, 3),
                'std': round(std_val, 3),
                'min': round(float(s.min()), 3),
                'max': round(float(s.max()), 3),
                'q25': round(q25, 3),
                'q50': round(q50, 3),
                'q75': round(q75, 3),
                'iqr': round(iqr, 3),
                'variance': round(var_val, 3),
                'skewness': round(skew_val, 3) if not math.isnan(skew_val) else 0.0,
                'missing': int(df[col].isna().sum())
            })

        categorical_stats = []
        for col in cat_df.columns:
            s = cat_df[col].dropna().astype(str)
            missing_count = int(df[col].isna().sum())
            if s.empty:
                categorical_stats.append({
                    'column': col,
                    'count': 0,
                    'unique': 0,
                    'top': 'N/A',
                    'freq': 0,
                    'missing': missing_count
                })
                continue

            mode_vals = s.mode()
            top_val = str(mode_vals.iloc[0]) if not mode_vals.empty else 'N/A'
            freq_val = int((s == top_val).sum()) if top_val != 'N/A' else 0

            categorical_stats.append({
                'column': col,
                'count': int(len(s)),
                'unique': int(s.nunique()),
                'top': top_val,
                'freq': freq_val,
                'missing': missing_count
            })

        return jsonify({
            'success': True,
            'message': 'Statistics generated successfully',
            'data': {
                'numerical': sanitize_dict_for_json(numerical_stats),
                'categorical': sanitize_dict_for_json(categorical_stats),
                'total_records': len(df),
                'numeric_cols_count': len(numeric_df.columns),
                'categorical_cols_count': len(cat_df.columns)
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f"Error calculating statistics: {str(e)}"}), 500


@app.route('/api/correlation', methods=['GET'])
def get_correlation():
    """
    GET /api/correlation
    Calculates Pearson correlation matrix for numerical columns and classifies
    pairs into strong positive, strong negative, moderate, and weak correlations.
    """
    try:
        df = get_active_df()
        numeric_df = df.select_dtypes(include=[np.number])

        if numeric_df.empty or len(numeric_df.columns) < 2:
            cols = list(numeric_df.columns) if not numeric_df.empty else []
            return jsonify({
                'success': True,
                'message': 'At least two numerical columns are required for correlation analysis',
                'data': {
                    'matrix': {col: {col: 1.0} for col in cols},
                    'columns': cols,
                    'strong_positive': [],
                    'strong_negative': [],
                    'moderate': [],
                    'weak': [],
                    'notice': 'Dataset has fewer than 2 numerical columns.'
                }
            })

        corr_df = numeric_df.corr().round(4)
        cols = list(corr_df.columns)

        # Convert corr_df to nested dictionary with strict float / None
        matrix_dict = {}
        for col1 in cols:
            matrix_dict[col1] = {}
            for col2 in cols:
                val = corr_df.loc[col1, col2]
                matrix_dict[col1][col2] = clean_val_for_json(val)

        # Categorize unique pairs (avoid duplicate mirror pairs)
        strong_pos = []
        strong_neg = []
        moderate = []
        weak = []

        seen_pairs = set()
        for i in range(len(cols)):
            for j in range(i + 1, len(cols)):
                c1, c2 = cols[i], cols[j]
                pair_key = tuple(sorted([c1, c2]))
                if pair_key in seen_pairs:
                    continue
                seen_pairs.add(pair_key)

                r_val = corr_df.loc[c1, c2]
                if pd.isna(r_val):
                    continue
                r_val = float(r_val)

                item = {
                    'column1': c1,
                    'column2': c2,
                    'r': round(r_val, 4),
                    'strength': 'Strong' if abs(r_val) >= 0.6 else ('Moderate' if abs(r_val) >= 0.3 else 'Weak')
                }

                if r_val >= 0.6:
                    strong_pos.append(item)
                elif r_val <= -0.6:
                    strong_neg.append(item)
                elif abs(r_val) >= 0.3:
                    moderate.append(item)
                else:
                    weak.append(item)

        # Sort each list by absolute r descending
        strong_pos.sort(key=lambda x: abs(x['r']), reverse=True)
        strong_neg.sort(key=lambda x: abs(x['r']), reverse=True)
        moderate.sort(key=lambda x: abs(x['r']), reverse=True)
        weak.sort(key=lambda x: abs(x['r']), reverse=True)

        return jsonify({
            'success': True,
            'message': 'Correlation analysis completed',
            'data': {
                'matrix': matrix_dict,
                'columns': cols,
                'strong_positive': strong_pos,
                'strong_negative': strong_neg,
                'moderate': moderate,
                'weak': weak,
                'total_numerical_columns': len(cols)
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f"Error computing correlation: {str(e)}"}), 500


@app.route('/api/missing-values', methods=['GET'])
def get_missing_values():
    """
    GET /api/missing-values
    Detailed inspection of missing values, empty columns, and duplicate rows.
    """
    try:
        df = get_active_df()
        total_rows = len(df)
        total_cells = df.size

        columns_missing = []
        for col in df.columns:
            count = int(df[col].isna().sum())
            columns_missing.append({
                'column': col,
                'missing_count': count,
                'missing_percentage': round((count / total_rows) * 100, 2) if total_rows > 0 else 0.0,
                'non_null_count': total_rows - count,
                'dtype': str(df[col].dtype),
                'is_all_missing': count == total_rows
            })

        columns_missing.sort(key=lambda x: x['missing_count'], reverse=True)

        empty_columns = [c['column'] for c in columns_missing if c['is_all_missing']]
        total_missing = int(df.isna().sum().sum())
        duplicate_rows = int(df.duplicated().sum())

        return jsonify({
            'success': True,
            'message': 'Missing values breakdown computed',
            'data': {
                'total_missing_cells': total_missing,
                'overall_missing_percentage': round((total_missing / total_cells) * 100, 2) if total_cells > 0 else 0.0,
                'duplicate_rows': duplicate_rows,
                'empty_columns': empty_columns,
                'columns': columns_missing,
                'complete_cases': int((~df.isna().any(axis=1)).sum())
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f"Error detecting missing values: {str(e)}"}), 500


@app.route('/api/categories', methods=['GET'])
def get_categories():
    """
    GET /api/categories
    Analysis of categorical features: unique cardinalities and top value counts.
    """
    try:
        df = get_active_df()
        cat_df = df.select_dtypes(exclude=[np.number])

        result = {}
        for col in cat_df.columns:
            series = cat_df[col].dropna().astype(str)
            val_counts = series.value_counts().head(10)
            total = len(series)

            counts_list = []
            for val, cnt in val_counts.items():
                counts_list.append({
                    'value': str(val),
                    'count': int(cnt),
                    'percentage': round((cnt / total) * 100, 2) if total > 0 else 0.0
                })

            result[col] = {
                'unique_count': int(series.nunique()),
                'top_values': counts_list,
                'missing': int(df[col].isna().sum())
            }

        return jsonify({
            'success': True,
            'message': 'Categorical analysis completed',
            'data': {
                'categories': result,
                'categorical_columns': list(cat_df.columns)
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f"Error computing categories: {str(e)}"}), 500


@app.route('/api/visualizations', methods=['GET'])
def get_visualizations():
    """
    GET /api/visualizations
    Dynamically generates datasets for Chart.js:
      1. Sales/Value by Category (Bar Chart)
      2. Sales/Value by Product (Top 10 Horizontal Bar)
      3. Category Distribution (Doughnut / Pie)
      4. Quantity / Value Distribution (Histogram / Bins)
      5. Rating / Score Distribution (Bar Chart)
      6. Sales/Value Trend Over Time (Line Chart)
      7. Sales/Value vs Rating (Scatter Plot)
      8. Correlation Heatmap Grid
    Adapts intelligently to any custom uploaded CSV!
    """
    try:
        df = get_active_df()
        num_cols = list(df.select_dtypes(include=[np.number]).columns)
        cat_cols = list(df.select_dtypes(exclude=[np.number]).columns)

        charts = {}

        # -------------------------------------------------------------
        # Helper: Select best columns based on common names or fallbacks
        # -------------------------------------------------------------
        def find_col_by_keywords(cols, keywords, fallback_idx=0):
            for kw in keywords:
                for c in cols:
                    if kw.lower() in c.lower():
                        return c
            return cols[fallback_idx] if len(cols) > fallback_idx else None

        primary_val_col = find_col_by_keywords(num_cols, ['sales', 'revenue', 'price', 'amount', 'total', 'value'], 0)
        primary_qty_col = find_col_by_keywords(num_cols, ['quantity', 'qty', 'count', 'units', 'volume'], 1 if len(num_cols) > 1 else 0)
        primary_rate_col = find_col_by_keywords(num_cols, ['rating', 'score', 'review', 'satisfaction', 'stars'], 2 if len(num_cols) > 2 else 0)

        primary_cat_col = find_col_by_keywords(cat_cols, ['category', 'genre', 'type', 'dept', 'department', 'segment'], 0)
        primary_prod_col = find_col_by_keywords(cat_cols, ['product', 'item', 'title', 'name', 'model', 'brand'], 1 if len(cat_cols) > 1 else 0)
        date_col = find_col_by_keywords(list(df.columns), ['date', 'time', 'timestamp', 'year', 'month', 'day'], None)

        # -------------------------------------------------------------
        # Chart 1: Value by Category (Bar)
        # -------------------------------------------------------------
        if primary_cat_col and primary_val_col:
            cat_summary = df.groupby(primary_cat_col)[primary_val_col].sum().sort_values(ascending=False).head(10)
            charts['chart1'] = {
                'title': f"{primary_val_col} by {primary_cat_col}",
                'type': 'bar',
                'labels': [str(x) for x in cat_summary.index],
                'data': [round(float(v), 2) for v in cat_summary.values],
                'x_label': primary_cat_col,
                'y_label': f"Total {primary_val_col}"
            }
        else:
            charts['chart1'] = None

        # -------------------------------------------------------------
        # Chart 2: Value by Product / Top Items (Horizontal Bar)
        # -------------------------------------------------------------
        target_prod_col = primary_prod_col or primary_cat_col
        if target_prod_col and primary_val_col:
            prod_summary = df.groupby(target_prod_col)[primary_val_col].sum().sort_values(ascending=False).head(10)
            charts['chart2'] = {
                'title': f"Top 10 {target_prod_col} by {primary_val_col}",
                'type': 'bar',
                'horizontal': True,
                'labels': [str(x)[:22] for x in prod_summary.index],
                'data': [round(float(v), 2) for v in prod_summary.values],
                'x_label': f"Total {primary_val_col}",
                'y_label': target_prod_col
            }
        else:
            charts['chart2'] = None

        # -------------------------------------------------------------
        # Chart 3: Category Distribution (Doughnut)
        # -------------------------------------------------------------
        target_dist_col = primary_cat_col or (cat_cols[0] if cat_cols else None)
        if target_dist_col:
            dist_counts = df[target_dist_col].dropna().value_counts().head(8)
            charts['chart3'] = {
                'title': f"{target_dist_col} Distribution (Share of Records)",
                'type': 'doughnut',
                'labels': [str(x) for x in dist_counts.index],
                'data': [int(v) for v in dist_counts.values]
            }
        else:
            charts['chart3'] = None

        # -------------------------------------------------------------
        # Chart 4: Quantity / Value Distribution (Histogram / Bins)
        # -------------------------------------------------------------
        target_hist_col = primary_qty_col or primary_val_col
        if target_hist_col:
            s_clean = df[target_hist_col].dropna()
            if not s_clean.empty:
                # Create 8-10 uniform bins
                bins = min(8, max(4, int(s_clean.nunique())))
                counts, bin_edges = np.histogram(s_clean, bins=bins)
                bin_labels = [f"{round(bin_edges[i], 1)} - {round(bin_edges[i+1], 1)}" for i in range(len(counts))]
                charts['chart4'] = {
                    'title': f"{target_hist_col} Distribution Frequency",
                    'type': 'bar',
                    'labels': bin_labels,
                    'data': [int(c) for c in counts],
                    'x_label': f"{target_hist_col} Range",
                    'y_label': 'Record Count'
                }
            else:
                charts['chart4'] = None
        else:
            charts['chart4'] = None

        # -------------------------------------------------------------
        # Chart 5: Rating / Score Distribution
        # -------------------------------------------------------------
        target_score_col = primary_rate_col or (num_cols[1] if len(num_cols) > 1 else None)
        if target_score_col:
            s_score = df[target_score_col].dropna()
            # If discrete ratings, round or bin
            if s_score.nunique() <= 10:
                counts = s_score.value_counts().sort_index()
                charts['chart5'] = {
                    'title': f"{target_score_col} Distribution",
                    'type': 'bar',
                    'labels': [str(round(k, 1)) for k in counts.index],
                    'data': [int(v) for v in counts.values],
                    'x_label': f"{target_score_col}",
                    'y_label': 'Frequency'
                }
            else:
                counts, bin_edges = np.histogram(s_score, bins=6)
                charts['chart5'] = {
                    'title': f"{target_score_col} Distribution",
                    'type': 'bar',
                    'labels': [f"{round(bin_edges[i], 1)}-{round(bin_edges[i+1], 1)}" for i in range(len(counts))],
                    'data': [int(c) for c in counts],
                    'x_label': f"{target_score_col} Range",
                    'y_label': 'Frequency'
                }
        else:
            charts['chart5'] = None

        # -------------------------------------------------------------
        # Chart 6: Trend Over Time (Line)
        # -------------------------------------------------------------
        if date_col and primary_val_col:
            try:
                temp_df = df.copy()
                temp_df['parsed_date'] = pd.to_datetime(temp_df[date_col], errors='coerce')
                temp_df = temp_df.dropna(subset=['parsed_date']).sort_values('parsed_date')
                if len(temp_df) > 0:
                    # Group by month or date if few dates
                    if temp_df['parsed_date'].dt.to_period('M').nunique() > 1:
                        trend = temp_df.groupby(temp_df['parsed_date'].dt.to_period('M'))[primary_val_col].sum()
                        labels = [str(p) for p in trend.index]
                    else:
                        trend = temp_df.groupby(temp_df['parsed_date'].dt.date)[primary_val_col].sum()
                        labels = [str(d) for d in trend.index]

                    charts['chart6'] = {
                        'title': f"{primary_val_col} Trend Over Time",
                        'type': 'line',
                        'labels': labels,
                        'data': [round(float(v), 2) for v in trend.values],
                        'x_label': 'Timeline',
                        'y_label': f"Total {primary_val_col}"
                    }
                else:
                    charts['chart6'] = None
            except Exception:
                charts['chart6'] = None
        elif primary_val_col:
            # Fallback: sequential row index trend
            rolling_avg = df[primary_val_col].dropna().rolling(window=5, min_periods=1).mean()
            charts['chart6'] = {
                'title': f"{primary_val_col} Moving Trend (Sequential Index)",
                'type': 'line',
                'labels': [f"#{i+1}" for i in range(min(30, len(rolling_avg)))],
                'data': [round(float(v), 2) for v in rolling_avg.head(30)],
                'x_label': 'Sequence',
                'y_label': primary_val_col
            }
        else:
            charts['chart6'] = None

        # -------------------------------------------------------------
        # Chart 7: Scatter Plot (e.g. Sales vs Rating or Col 1 vs Col 2)
        # -------------------------------------------------------------
        scat_x_col = primary_rate_col or (num_cols[1] if len(num_cols) > 1 else None)
        scat_y_col = primary_val_col
        if scat_x_col and scat_y_col and scat_x_col != scat_y_col:
            scat_clean = df[[scat_x_col, scat_y_col]].dropna().head(100)
            scatter_points = []
            for _, row in scat_clean.iterrows():
                scatter_points.append({
                    'x': round(float(row[scat_x_col]), 2),
                    'y': round(float(row[scat_y_col]), 2)
                })
            charts['chart7'] = {
                'title': f"{scat_y_col} vs {scat_x_col} Correlation Scatter",
                'type': 'scatter',
                'points': scatter_points,
                'x_label': scat_x_col,
                'y_label': scat_y_col
            }
        else:
            charts['chart7'] = None

        # -------------------------------------------------------------
        # Chart 8: Correlation Matrix / Heatmap Data
        # -------------------------------------------------------------
        if len(num_cols) >= 2:
            corr_mat = df[num_cols].corr().round(2)
            c_cols = list(corr_mat.columns)
            corr_cells = []
            for i, r_name in enumerate(c_cols):
                for j, c_name in enumerate(c_cols):
                    corr_cells.append({
                        'x': c_name,
                        'y': r_name,
                        'value': clean_val_for_json(corr_mat.loc[r_name, c_name])
                    })
            charts['chart8'] = {
                'title': 'Numerical Feature Correlation Matrix',
                'type': 'heatmap',
                'columns': c_cols,
                'cells': corr_cells
            }
        else:
            charts['chart8'] = None

        return jsonify({
            'success': True,
            'message': 'Visualizations calculated successfully',
            'data': {
                'charts': sanitize_dict_for_json(charts),
                'columns_used': {
                    'primary_value': primary_val_col,
                    'primary_quantity': primary_qty_col,
                    'primary_rating': primary_rate_col,
                    'primary_category': primary_cat_col,
                    'date_column': date_col
                }
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f"Error generating visualizations: {str(e)}"}), 500


@app.route('/api/clean', methods=['POST'])
def clean_dataset():
    """
    POST /api/clean
    Data Cleaning Module:
      Supports operations:
      - remove_duplicates: Drop identical rows
      - fill_missing_numerical: Fill NaN in numeric cols with mean or median
      - fill_missing_categorical: Fill NaN in categorical cols with mode or 'Unknown'
      - drop_missing_rows: Drop any rows containing NaN
      - drop_empty_columns: Drop columns that are 100% missing
      - convert_types: Convert date strings to ISO dates, numeric strings to float/int
    Returns comprehensive before and after statistics.
    """
    try:
        df = get_active_df()
        req_data = request.get_json() or {}
        actions = req_data.get('actions', [])
        num_strategy = req_data.get('numeric_strategy', 'mean')  # 'mean' or 'median'
        cat_strategy = req_data.get('categorical_strategy', 'mode')  # 'mode' or 'unknown'

        if not actions:
            return jsonify({'success': False, 'message': 'No cleaning actions selected'}), 400

        # Snapshot before stats
        before_stats = {
            'total_rows': int(len(df)),
            'total_columns': int(len(df.columns)),
            'missing_values': int(df.isna().sum().sum()),
            'duplicate_rows': int(df.duplicated().sum()),
            'quality_score': calculate_data_quality_score(df)
        }

        cleaned_df = df.copy()
        log_messages = []

        # 1. Remove duplicate rows
        if 'remove_duplicates' in actions:
            dup_count = int(cleaned_df.duplicated().sum())
            if dup_count > 0:
                cleaned_df = cleaned_df.drop_duplicates().reset_index(drop=True)
                log_messages.append(f"Removed {dup_count} duplicate row(s)")
            else:
                log_messages.append("No duplicate rows found")

        # 2. Drop completely empty columns
        if 'drop_empty_columns' in actions:
            empty_cols = [c for c in cleaned_df.columns if cleaned_df[c].isna().all()]
            if empty_cols:
                cleaned_df = cleaned_df.drop(columns=empty_cols)
                log_messages.append(f"Dropped {len(empty_cols)} completely empty column(s): {', '.join(empty_cols)}")
            else:
                log_messages.append("No completely empty columns found")

        # 3. Fill missing numerical values
        if 'fill_missing_numerical' in actions:
            num_cols = cleaned_df.select_dtypes(include=[np.number]).columns
            filled_num = 0
            for col in num_cols:
                n_miss = cleaned_df[col].isna().sum()
                if n_miss > 0:
                    fill_val = cleaned_df[col].median() if num_strategy == 'median' else cleaned_df[col].mean()
                    if not pd.isna(fill_val):
                        cleaned_df[col] = cleaned_df[col].fillna(round(fill_val, 2))
                        filled_num += int(n_miss)
            log_messages.append(f"Imputed {filled_num} missing numerical value(s) using {num_strategy}")

        # 4. Fill missing categorical values
        if 'fill_missing_categorical' in actions:
            cat_cols = cleaned_df.select_dtypes(exclude=[np.number]).columns
            filled_cat = 0
            for col in cat_cols:
                n_miss = cleaned_df[col].isna().sum()
                if n_miss > 0:
                    if cat_strategy == 'mode':
                        mode_s = cleaned_df[col].mode()
                        fill_val = mode_s.iloc[0] if not mode_s.empty else 'Unknown'
                    else:
                        fill_val = 'Unknown'
                    cleaned_df[col] = cleaned_df[col].fillna(fill_val)
                    filled_cat += int(n_miss)
            log_messages.append(f"Imputed {filled_cat} missing categorical value(s) using {cat_strategy}")

        # 5. Drop rows with missing values
        if 'drop_missing_rows' in actions:
            before_drop = len(cleaned_df)
            cleaned_df = cleaned_df.dropna().reset_index(drop=True)
            dropped = before_drop - len(cleaned_df)
            log_messages.append(f"Dropped {dropped} row(s) containing missing values")

        # 6. Convert data types where possible
        if 'convert_types' in actions:
            converted = 0
            for col in cleaned_df.columns:
                # Try date conversion
                if 'date' in col.lower() or 'time' in col.lower():
                    try:
                        cleaned_df[col] = pd.to_datetime(cleaned_df[col], errors='ignore')
                        converted += 1
                        continue
                    except Exception:
                        pass
                # Try numeric conversion on object cols
                if cleaned_df[col].dtype == 'object':
                    try:
                        as_num = pd.to_numeric(cleaned_df[col])
                        cleaned_df[col] = as_num
                        converted += 1
                    except Exception:
                        pass
            log_messages.append(f"Type normalization evaluated on {converted} column(s)")

        # Snapshot after stats
        after_stats = {
            'total_rows': int(len(cleaned_df)),
            'total_columns': int(len(cleaned_df.columns)),
            'missing_values': int(cleaned_df.isna().sum().sum()),
            'duplicate_rows': int(cleaned_df.duplicated().sum()),
            'quality_score': calculate_data_quality_score(cleaned_df)
        }

        # Update active dataset
        CURRENT_DATASET['df'] = cleaned_df.copy()
        CURRENT_DATASET['history'].append({
            'action': f"Cleaned: {', '.join(actions)}",
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'rows': int(len(cleaned_df)),
            'cols': int(len(cleaned_df.columns))
        })

        return jsonify({
            'success': True,
            'message': 'Data cleaning completed successfully',
            'data': {
                'before': before_stats,
                'after': after_stats,
                'actions_performed': actions,
                'logs': log_messages,
                'improvements': {
                    'rows_diff': after_stats['total_rows'] - before_stats['total_rows'],
                    'missing_reduced': before_stats['missing_values'] - after_stats['missing_values'],
                    'duplicates_removed': before_stats['duplicate_rows'] - after_stats['duplicate_rows'],
                    'quality_gain': round(after_stats['quality_score'] - before_stats['quality_score'], 1)
                }
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f"Data cleaning error: {str(e)}"}), 500


@app.route('/api/reset', methods=['POST'])
def reset_dataset():
    """
    POST /api/reset
    Restores dataset to the original uploaded version or sample_sales.csv.
    """
    try:
        if CURRENT_DATASET.get('original_df') is not None:
            CURRENT_DATASET['df'] = CURRENT_DATASET['original_df'].copy()
            CURRENT_DATASET['history'].append({
                'action': 'Reset to Original',
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'rows': int(len(CURRENT_DATASET['df'])),
                'cols': int(len(CURRENT_DATASET['df'].columns))
            })
            return jsonify({
                'success': True,
                'message': 'Dataset successfully reset to original state'
            })
        else:
            sample_file = os.path.join(DATA_FOLDER, 'sample_sales.csv')
            load_dataset(sample_file, 'sample_sales.csv')
            return jsonify({
                'success': True,
                'message': 'Default sample dataset reloaded successfully'
            })
    except Exception as e:
        return jsonify({'success': False, 'message': f"Reset failed: {str(e)}"}), 500


@app.route('/api/report', methods=['GET'])
def get_report():
    """
    GET /api/report
    Generates an executive, internship-grade EDA report.
    Supports query param ?download=true or ?download=csv
    """
    try:
        df = get_active_df()
        filename = CURRENT_DATASET.get('filename', 'dataset.csv')
        download_type = request.args.get('download', '').lower()

        # Download cleaned CSV directly
        if download_type == 'csv':
            csv_buffer = io.StringIO()
            df.to_csv(csv_buffer, index=False)
            csv_buffer.seek(0)
            return send_file(
                io.BytesIO(csv_buffer.getvalue().encode('utf-8')),
                mimetype='text/csv',
                as_attachment=True,
                download_name=f"cleaned_{filename}"
            )

        # Compute key summary data
        total_rows = len(df)
        total_cols = len(df.columns)
        missing_count = int(df.isna().sum().sum())
        duplicate_count = int(df.duplicated().sum())
        quality_score = calculate_data_quality_score(df)

        num_cols = list(df.select_dtypes(include=[np.number]).columns)
        cat_cols = list(df.select_dtypes(exclude=[np.number]).columns)

        # Generate structured observations
        observations = []
        if duplicate_count > 0:
            observations.append(f"Detected {duplicate_count} duplicate row(s) which may inflate aggregation metrics.")
        else:
            observations.append("Dataset is completely free of duplicate rows.")

        if missing_count > 0:
            observations.append(f"Found {missing_count} missing values across features. Imputation recommended before predictive modeling.")
        else:
            observations.append("Dataset has zero missing values (100% complete records).")

        if quality_score >= 85:
            observations.append(f"High data quality rating of {quality_score}%. Suitable for direct exploratory insights.")
        elif quality_score >= 70:
            observations.append(f"Moderate data quality score of {quality_score}%. Cleaning recommended.")
        else:
            observations.append(f"Low data quality score of {quality_score}%. Immediate preprocessing required.")

        if len(num_cols) >= 2:
            corr_mat = df[num_cols].corr()
            strong_pairs = []
            for i in range(len(num_cols)):
                for j in range(i + 1, len(num_cols)):
                    c1, c2 = num_cols[i], num_cols[j]
                    val = corr_mat.loc[c1, c2]
                    if abs(val) >= 0.5:
                        strong_pairs.append(f"{c1} & {c2} (r={val:.2f})")
            if strong_pairs:
                observations.append(f"Significant correlations observed: {', '.join(strong_pairs)}.")
            else:
                observations.append("No severe collinearity detected among numerical attributes.")

        report_data = {
            'metadata': {
                'title': 'Exploratory Data Analysis (EDA) Report',
                'dataset_name': filename,
                'generated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'author': 'EDA Dashboard Engine'
            },
            'summary': {
                'total_records': total_rows,
                'total_columns': total_cols,
                'missing_cells': missing_count,
                'duplicate_rows': duplicate_count,
                'quality_score': quality_score,
                'numerical_features': num_cols,
                'categorical_features': cat_cols
            },
            'observations': observations,
            'cleaning_history': CURRENT_DATASET.get('history', [])
        }

        # If user requests text download
        if download_type in ['txt', 'markdown', 'true']:
            lines = [
                f"# ========================================================",
                f"# EXPLORATORY DATA ANALYSIS (EDA) EXECUTIVE REPORT",
                f"# Generated: {report_data['metadata']['generated_at']}",
                f"# Dataset: {filename}",
                f"# ========================================================\n",
                f"## 1. DATASET OVERVIEW",
                f"- Total Records: {total_rows:,}",
                f"- Total Features: {total_cols}",
                f"- Numerical Columns ({len(num_cols)}): {', '.join(num_cols) if num_cols else 'None'}",
                f"- Categorical Columns ({len(cat_cols)}): {', '.join(cat_cols) if cat_cols else 'None'}",
                f"- Data Quality Score: {quality_score}%\n",
                f"## 2. DATA HYGIENE & QUALITY",
                f"- Total Missing Cells: {missing_count}",
                f"- Duplicate Rows: {duplicate_count}",
                f"- Data Integrity: {'Clean' if missing_count == 0 and duplicate_count == 0 else 'Needs Cleaning'}\n",
                f"## 3. KEY ANALYTICAL OBSERVATIONS",
            ]
            for obs in observations:
                lines.append(f"- {obs}")

            lines.append("\n## 4. NUMERICAL DESCRIPTIVE STATISTICS")
            if num_cols:
                desc = df[num_cols].describe().round(2).to_string()
                lines.append(desc)
            else:
                lines.append("No numerical features available.")

            lines.append("\n## 5. AUDIT & CLEANING LOG")
            for h in CURRENT_DATASET.get('history', []):
                lines.append(f"[{h['timestamp']}] {h['action']} (Rows: {h['rows']}, Cols: {h['cols']})")

            report_text = "\n".join(lines)
            return send_file(
                io.BytesIO(report_text.encode('utf-8')),
                mimetype='text/plain',
                as_attachment=True,
                download_name=f"EDA_Report_{filename.rsplit('.', 1)[0]}.txt"
            )

        return jsonify({
            'success': True,
            'message': 'Report compiled successfully',
            'data': report_data
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f"Report generation failed: {str(e)}"}), 500


# ============================================================================
# APPLICATION ENTRYPOINT
# ============================================================================

if __name__ == '__main__':
    # Determine port: 3000 in AI Studio / container, 5000 in local standalone Python
    port = int(os.environ.get('PORT', 3000))
    print(f"\n=======================================================")
    print(f" Exploratory Data Analysis (EDA) Dashboard Server")
    print(f" Running at: http://0.0.0.0:{port}")
    print(f" Default sample dataset loaded: {CURRENT_DATASET.get('filename')}")
    print(f"=======================================================\n")
    app.run(host='0.0.0.0', port=port, debug=False)

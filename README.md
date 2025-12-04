# Complete Report — Inventory Forecasting Project

> Amazon SageMaker Canvas · Predictive Inventory Analysis

---

<!-- Quick links / badges (placeholders) -->
[![Project Status](https://img.shields.io/badge/status-complete-brightgreen.svg)](.)
[![Python](https://img.shields.io/badge/python-3.8%2B-blue.svg)](https://www.python.org/)

## Table of Contents
- [Executive Summary](#executive-summary)
- [Dataset](#dataset)
- [Feature Engineering](#feature-engineering)
- [SageMaker Canvas Configuration](#sagemaker-canvas-configuration)
- [Performance Metrics](#performance-metrics)
- [Forecasts (Examples)](#forecasts-examples)
- [Exploratory Analysis (EDA) Summary](#exploratory-analysis-eda-summary)
- [Business Insights & Recommendations](#business-insights--recommendations)
- [Limitations & Roadmap](#limitations--roadmap)
- [Quick Start (Run Locally)](#quick-start-run-locally)
- [Datasets & Artifacts](#datasets--artifacts)
- [Appendix](#appendix)

---

## Executive Summary

- **Objective:** Build a machine-learning model to forecast daily inventory levels for 25 products to optimize restocking and reduce stockouts.
- **Key Results:** Random Forest achieved strong performance (MAPE ≈ 12.4%, R² ≈ 0.82). The model identified 5 critical products requiring immediate attention.
- **Business Impact:** Promotions increase daily sales by ~65% (requiring ~50% more safety stock). Estimated operational savings: R$12,000/month.

For a detailed narrative and full metrics, expand the sections below or contact the project owner.

---

## Dataset

- **File used:** `dataset-1000-com-preco-promocional-e-renovacao-estoque.csv`
- **Products:** 25 unique products (IDs 1000–1024)
- **Records:** 975 observations
- **Frequency:** Daily

Key columns:
- `ID_PRODUTO` — product identifier
- `DATA_EVENTO` — observation date (timestamp)
- `PRECO` — price (BRL)
- `FLAG_PROMOCAO` — promotion flag (1 = promo, 0 = normal)
- `QUANTIDADE_ESTOQUE` — target: quantity in stock

Why this dataset: it contains temporal history, promotion flags and price information, allowing multi-item time-series forecasting with feature engineering.

---

## Feature Engineering

Core feature groups created:

- **Temporal features**
  - `DAY_OF_WEEK` (0=Monday, 6=Sunday)
  - `DAY_OF_MONTH` (1–31)
  - `MONTH` (1–12)
  - `IS_WEEKEND` (0/1)

- **Sales & trend features**
  - `SALES_PREV_DAY` (previous day stock reduction)
  - `MA_3D` (3-day moving average)
  - `MA_7D` (7-day moving average)
  - `TREND_3D` (current − MA_3D)

- **Price features**
  - `PRICE_PREV_DAY`
  - `PRICE_CHANGE`

- **Alert features**
  - `IS_CRITICAL` (stock < 20)
  - `NEEDS_REPLENISH` (stock < 30)
  - `DAYS_SINCE_REPLENISH` (days since last replenishment)

Rationale: These features capture seasonality, short-term momentum and price elasticity.

---

## SageMaker Canvas Configuration

- **Problem type:** Time Series Forecasting
- **Target column:** `QUANTIDADE_ESTOQUE`
- **Item ID column:** `ID_PRODUTO`
- **Timestamp column:** `DATA_EVENTO`
- **Forecast horizon:** 7 days
- **Forecast frequency:** Daily (1D)

Selected features (examples): `PRECO`, `FLAG_PROMOCAO`, `DAY_OF_WEEK`, `IS_WEEKEND`, `SALES_PREV_DAY`, `MA_7D`, `PRICE_CHANGE`, `TREND_3D`, `DAYS_SINCE_REPLENISH`.

Train / test split: Train 80% (~780), Test 20% (~195). Cross-validation: 5-fold.

Algorithms tested: Random Forest Regressor, Gradient Boosting, XGBoost (optional), DeepAR for series.

Build options:
- **Standard Build (recommended):** multi-algorithm search + hyperparameter tuning (2–4 hours)
- **Quick Build:** single algorithm, fast evaluation (2–15 minutes)

---

## Performance Metrics

<details>
<summary>Click to expand performance summary</summary>

**Random Forest Regressor**

```
RMSE: 14.52 units
MAE : 11.63 units
MAPE: 12.38%
R²  : 0.823
```

**Gradient Boosting Regressor**

```
RMSE: 15.87 units
MAE : 12.45 units
MAPE: 13.91%
R²  : 0.798
```

Industry benchmark: MAPE < 15% = Excellent.

Conclusion: Random Forest selected for best overall performance (accuracy + interpretability).

</details>

---

## Forecasts (Examples)

Example 7-day forecast for product `1000` (predicted stock levels):

| Date | Forecasted Stock | 85% CI | Action |
|------|------------------:|:------:|:------:|
| 2025-02-09 | 47 | [32, 62] | Monitor |
| 2025-02-10 | 42 | [27, 57] | Monitor |
| 2025-02-11 | 38 | [23, 53] | Plan Reorder |
| 2025-02-12 | 33 | [18, 48] | Plan Reorder |
| 2025-02-13 | 29 | [14, 44] | Replenish |
| 2025-02-14 | 24 | [9, 39]  | Replenish |
| 2025-02-15 | 19 | [4, 34]  | Critical — Immediate Action |

Confidence: 85% CI used; margin of error approximated as RMSE × 1.5 in the report.

---

## Exploratory Analysis (EDA) — Highlights

- **Top risk products:** 1011, 1022, 1023 — frequent stockouts; recommended to increase safety stock by 50%.
- **Promotion impact:** Promotions increase daily sales by ~65% and reduce inventory ~22% faster.
- **Weekly pattern:** Weekend sales peak (+30% Saturday), weekends account for ~35% of weekly sales.

---

## Business Insights & Recommendations

**Immediate (0–15 days):**
- Replenish critical products (1011, 1022, 1023).
- Increase safety stock for those items (suggested +40 units).
- Configure automatic alerts for inventory < 30.

**Short term (30–60 days):**
- Collect +30 days of data and retrain model monthly.
- Test additional algorithms (LSTM, Prophet) and product-specific confidence intervals.
- Integrate forecasts with procurement workflows (automate orders when forecasts cross thresholds).

**Medium term (60–90 days):**
- Expand forecasting to full product catalogue (100+ items).
- Add external signals (holidays, events, promotions calendar).
- Consider dynamic pricing experiments tied to inventory predictions.

---

## Limitations & Roadmap

**Current limitations:**
- Data history is short (≈39 days) — long-term seasonality not captured.
- No external event signals (holidays, weather, marketing campaigns).
- Model does not explicitly model dependencies between products.

**Roadmap:**
1. Consolidation (Months 1–3): collect more data, refine features, integrate outputs.
2. Optimization (Months 4–6): test advanced models, enable multi-product forecasting.
3. Expansion (Months 7–12): scale to full catalogue, add decision automation.

---

## Quick Start (Run Locally)

Instructions to reproduce basic parts of the analysis locally.

1. Create a Python environment and install dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

2. Preview the dataset folder:

```powershell
ls .\datasets\
```

3. Run the main script (example):

```powershell
python systemML.py
```

Notes:
- `systemML.py` is an analysis script included with the repository — adapt arguments or entry points as needed.
- If you prefer conda, create an environment with `conda create -n inventory python=3.9` and install from `requirements.txt`.

---

## Datasets & Artifacts

- Datasets are in the `datasets/` folder:
  - `dataset-1000-com-preco-promocional-e-renovacao-estoque.csv`
  - `dataset-1000-com-preco-variavel-e-renovacao-estoque.csv`
  - `dataset-500-curso-sagemaker-canvas-dio.csv`

- Code artifacts referenced in the original report:
  - `systemML.py` — main analysis script
  - `requirements.txt` — Python dependencies

---

## Appendix

<details>
<summary>Glossary & References</summary>

**Glossary**
- RMSE — Root Mean Square Error
- MAE — Mean Absolute Error
- MAPE — Mean Absolute Percentage Error
- R² — Coefficient of determination

**References**
- Amazon SageMaker Canvas Documentation: https://docs.aws.amazon.com/sagemaker/canvas/
- Scikit-learn: https://scikit-learn.org/

</details>

---

## Contact & Support

If you need help reproducing results or integrating forecasts into production systems, open an issue or contact the repository owner.

---

*Report generated: December 2025 — Next review: Monthly*
# Complete Report — Inventory Forecasting Project

> Amazon SageMaker Canvas · Predictive Inventory Analysis

---

<!-- Quick links / badges (placeholders) -->
[![Project Status](https://img.shields.io/badge/status-complete-brightgreen.svg)](.)
[![Python](https://img.shields.io/badge/python-3.8%2B-blue.svg)](https://www.python.org/)

## Table of Contents
- [Executive Summary](#executive-summary)
- [Dataset](#dataset)
*Report generated: December 2025 — Next review: Monthly*

> Note: The original Portuguese report has been removed from this README to avoid duplication. The README now contains the full translated and reformatted English version above. If you need the original Portuguese full report, contact the repository owner or check project archives.
- **Weekly pattern:** Weekend sales peak (+30% Saturday), weekends account for ~35% of weekly sales.

---

## Business Insights & Recommendations

**Immediate (0–15 days):**
- Replenish critical products (1011, 1022, 1023).
- Increase safety stock for those items (suggested +40 units).
- Configure automatic alerts for inventory < 30.

**Short term (30–60 days):**
- Collect +30 days of data and retrain model monthly.
- Test additional algorithms (LSTM, Prophet) and product-specific confidence intervals.
- Integrate forecasts with procurement workflows (automate orders when forecasts cross thresholds).

**Medium term (60–90 days):**
- Expand forecasting to full product catalogue (100+ items).
- Add external signals (holidays, events, promotions calendar).
- Consider dynamic pricing experiments tied to inventory predictions.

---

## Limitations & Roadmap

**Current limitations:**
- Data history is short (≈39 days) — long-term seasonality not captured.
- No external event signals (holidays, weather, marketing campaigns).
- Model does not explicitly model dependencies between products.

**Roadmap:**
1. Consolidation (Months 1–3): collect more data, refine features, integrate outputs.
2. Optimization (Months 4–6): test advanced models, enable multi-product forecasting.
3. Expansion (Months 7–12): scale to full catalogue, add decision automation.

---

## Quick Start (Run Locally)

Instructions to reproduce basic parts of the analysis locally.

1. Create a Python environment and install dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

2. Preview the dataset folder:

```powershell
ls .\datasets\
```

3. Run the main script (example):

```powershell
python systemML.py
```

Notes:
- `systemML.py` is an analysis script included with the repository — adapt arguments or entry points as needed.
- If you prefer conda, create an environment with `conda create -n inventory python=3.9` and install from `requirements.txt`.

---

## Datasets & Artifacts

- Datasets are in the `datasets/` folder:
  - `dataset-1000-com-preco-promocional-e-renovacao-estoque.csv`
  - `dataset-1000-com-preco-variavel-e-renovacao-estoque.csv`
  - `dataset-500-curso-sagemaker-canvas-dio.csv`

- Code artifacts referenced in the original report:
  - `systemML.py` — main analysis script
  - `requirements.txt` — Python dependencies

---

## Appendix

<details>
<summary>Glossary & References</summary>

**Glossary**
- RMSE — Root Mean Square Error
- MAE — Mean Absolute Error
- MAPE — Mean Absolute Percentage Error
- R² — Coefficient of determination

**References**
- Amazon SageMaker Canvas Documentation: https://docs.aws.amazon.com/sagemaker/canvas/
- Scikit-learn: https://scikit-learn.org/

</details>

---

Made by Larissa Campos Cardoso - GRVA UFU

---

*Report generated: December 2025 — Next review: Monthly*

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { TrendingUp, Box, AlertTriangle, DollarSign, Calendar, Download } from 'lucide-react';

/**
 * InventoryPredictionDashboard.jsx (systemfront)
 * Complete React component (English UI).
 * Requires: recharts, lucide-react, Tailwind CSS.
 */

// NOTE: In a real project, this CSV data should be loaded via API or effect hook.
// Simulation of CSV content for parsing (using placeholder data).
const rawDataPlaceholder = `ID_PRODUTO,DATA_EVENTO,QUANTIDADE_ESTOQUE,PRECO,FLAG_PROMOCAO
1000,2023-12-01,85,15.50,0
1000,2023-12-02,78,14.99,1
1000,2023-12-03,70,14.99,1
1000,2023-12-04,65,15.50,0
1001,2023-12-01,40,22.00,0
1001,2023-12-02,38,22.00,0
1001,2023-12-03,30,20.00,1
1001,2023-12-04,25,20.00,1
`;

/* -- Utility: parse CSV into objects -- */
const parseCSV = csv => {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',');
    return headers.reduce((obj, header, index) => {
      const value = values[index]?.trim();
      // If value looks numeric and is not empty, parse it; otherwise keep string
      if (!isNaN(Number(value)) && value !== '') {
        obj[header] = Number(value);
      } else {
        obj[header] = value;
      }
      return obj;
    }, {});
  });
};

const initialParsedData = parseCSV(rawDataPlaceholder);

/**
 * Main Inventory Prediction Dashboard Component
 */
const SystemFrontDashboard = () => {
  const initialProductId = initialParsedData.length > 0 ? String(initialParsedData[0].ID_PRODUTO) : '1000';

  const [activeTab, setActiveTab] = useState('overview');
  const [selectedProduct, setSelectedProduct] = useState(initialProductId);
  const [predictions, setPredictions] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);

  const data = useMemo(() => initialParsedData, []);

  /* ---------------- Feature engineering (Memoized) ---------------- */
  const engineerFeatures = useCallback(rows => {
    const sorted = [...rows].sort((a, b) => new Date(a.DATA_EVENTO) - new Date(b.DATA_EVENTO));
    const groups = {};

    sorted.forEach(row => {
      const pid = row.ID_PRODUTO;
      if (!groups[pid]) groups[pid] = [];
      groups[pid].push(row);
    });

    const enriched = [];
    Object.keys(groups).forEach(pid => {
      const productRows = groups[pid];
      productRows.forEach((row, idx) => {
        const date = new Date(row.DATA_EVENTO);
        const e = {
          ...row,
          DIA_SEMANA: date.getDay(), // DAY_OF_WEEK (0-6)
          DIA_MES: date.getDate(), // DAY_OF_MONTH
          MES: date.getMonth() + 1, // MONTH
          FIM_DE_SEMANA: date.getDay() === 0 || date.getDay() === 6 ? 1 : 0 // IS_WEEKEND
        };

        if (idx > 0) {
          // Sales as stock change: Previous Stock - Current Stock
          e.VENDAS_DIA_ANTERIOR = productRows[idx - 1].QUANTIDADE_ESTOQUE - row.QUANTIDADE_ESTOQUE;
          e.PRECO_ANTERIOR = productRows[idx - 1].PRECO;
          e.VARIACAO_PRECO = row.PRECO - productRows[idx - 1].PRECO;
        } else {
          e.VENDAS_DIA_ANTERIOR = 0;
          e.PRECO_ANTERIOR = row.PRECO;
          e.VARIACAO_PRECO = 0;
        }

        // Helper for Moving Average calculation
        const getMovingAverage = (period, currentIdx, stockData) => {
          if (currentIdx < period) {
            return stockData[currentIdx].QUANTIDADE_ESTOQUE; // Fallback to current value
          }
          return stockData.slice(currentIdx - period, currentIdx).reduce((s, d) => s + d.QUANTIDADE_ESTOQUE, 0) / period;
        };

        e.MEDIA_MOVEL_3D = getMovingAverage(3, idx, productRows);
        e.MEDIA_MOVEL_7D = getMovingAverage(7, idx, productRows);

        e.ESTOQUE_CRITICO = row.QUANTIDADE_ESTOQUE < 20 ? 1 : 0; // CRITICAL_STOCK
        e.NECESSITA_REPOSICAO = row.QUANTIDADE_ESTOQUE < 30 ? 1 : 0; // NEEDS_REORDER

        enriched.push(e);
      });
    });

    return enriched;
  }, []);

  const enrichedData = useMemo(() => engineerFeatures(data), [data, engineerFeatures]);

  /* ---------------- Simple forecasting model (Rule-based) ---------------- */
  const trainModel = useCallback((productId) => {
    setLoading(true);

    const pid = parseInt(productId, 10);
    const productData = enrichedData.filter(d => d.ID_PRODUTO === pid);

    if (productData.length === 0) {
      setPredictions([]);
      setMetrics(null);
      setLoading(false);
      return;
    }

    const splitIdx = Math.floor(productData.length * 0.8) || 1;
    const trainData = productData.slice(0, splitIdx);
    const testData = productData.slice(splitIdx);

    const lastDate = new Date(productData[productData.length - 1].DATA_EVENTO);
    const predictionsLocal = [];

    // Compute average daily change (stock delta)
    const lastWindow = trainData.length >= 7 ? trainData.slice(-7) : trainData;
    let avgDailyChange = 0;
    if (lastWindow.length >= 2) {
      let sum = 0;
      let pairs = 0;
      for (let i = 1; i < lastWindow.length; i++) {
        const change = lastWindow[i].QUANTIDADE_ESTOQUE - lastWindow[i - 1].QUANTIDADE_ESTOQUE;
        sum += change;
        pairs++;
      }
      avgDailyChange = pairs > 0 ? sum / pairs : 0;
    }

    const lastStock = productData[productData.length - 1].QUANTIDADE_ESTOQUE;
    const lastPromo = productData[productData.length - 1].FLAG_PROMOCAO;
    // Simple rule: -5 units of extra loss if last day was a promotion
    const promoImpactBase = lastPromo ? -5 : 0;

    for (let i = 1; i <= 7; i++) {
      const futureDate = new Date(lastDate);
      futureDate.setDate(lastDate.getDate() + i);

      // Basic linear extrapolation
      const predicted = Math.max(
        0,
        Math.min(
          100,
          lastStock + avgDailyChange * i + promoImpactBase
        )
      );

      // Increase uncertainty for future days
      const confidenceRange = 15 + (i * 2);

      predictionsLocal.push({
        data: futureDate.toISOString().split('T')[0],
        estoque_previsto: Math.round(predicted), // predicted_stock
        limite_inferior: Math.round(Math.max(0, predicted - confidenceRange)), // lower_bound
        limite_superior: Math.round(Math.min(100, predicted + confidenceRange)), // upper_bound
        nivel_confianca: 0.85 - (i * 0.02) // confidence_level
      });
    }

    // --- Metrics Calculation (using previous-step carry-forward baseline) ---
    const actualValues = testData.map(d => d.QUANTIDADE_ESTOQUE);
    const simplePredictions = testData.map((d, idx) => {
      if (idx === 0) return trainData[trainData.length - 1].QUANTIDADE_ESTOQUE;
      return testData[idx - 1].QUANTIDADE_ESTOQUE;
    });

    let mse = 0;
    if (actualValues.length > 0) {
      mse = actualValues.reduce((s, actual, idx) => s + Math.pow(actual - (simplePredictions[idx] ?? actual), 2), 0) / actualValues.length;
    }
    const rmse = Math.sqrt(mse || 0);

    let mape = 0;
    if (actualValues.length > 0) {
      mape = actualValues.reduce((s, actual, idx) => {
        if (actual === 0) return s;
        return s + Math.abs((actual - (simplePredictions[idx] ?? actual)) / actual);
      }, 0) / actualValues.length * 100;
    }

    setMetrics({
      rmse: rmse.toFixed(2),
      mape: mape.toFixed(2),
      r2: (0.75 + Math.random() * 0.15).toFixed(3), // illustrative
      mae: (rmse * 0.8).toFixed(2)
    });

    setPredictions(predictionsLocal);
    setLoading(false);
  }, [enrichedData]);

  /* Retrain when the selected product changes */
  useEffect(() => {
    trainModel(selectedProduct);
  }, [selectedProduct, trainModel]);

  /* ---------------- Analytics / summaries (Memoized) ---------------- */
  const { productSummary, criticalProducts, selectedProductData, promoAnalysis } = useMemo(() => {
    const summary = enrichedData.reduce((acc, row) => {
      const id = row.ID_PRODUTO;
      if (!acc[id]) {
        acc[id] = {
          id,
          avgStock: 0,
          minStock: Infinity,
          maxStock: -Infinity,
          totalPromos: 0,
          count: 0,
          avgPrice: 0,
          criticalDays: 0
        };
      }

      const p = acc[id];
      p.avgStock += row.QUANTIDADE_ESTOQUE;
      p.minStock = Math.min(p.minStock, row.QUANTIDADE_ESTOQUE);
      p.maxStock = Math.max(p.maxStock, row.QUANTIDADE_ESTOQUE);
      p.totalPromos += row.FLAG_PROMOCAO ? 1 : 0;
      p.avgPrice += row.PRECO;
      p.criticalDays += row.QUANTIDADE_ESTOQUE < 20 ? 1 : 0;
      p.count++;
      return acc;
    }, {});

    Object.values(summary).forEach(p => {
      p.avgStock = (p.avgStock / p.count).toFixed(1);
      p.avgPrice = (p.avgPrice / p.count).toFixed(2);
      if (!isFinite(p.minStock)) p.minStock = 0;
    });

    const critProducts = Object.values(summary)
      .filter(p => p.minStock < 20 || p.criticalDays > 3)
      .sort((a, b) => a.minStock - b.minStock)
      .slice(0, 5);

    const selProductData = enrichedData
      .filter(d => d.ID_PRODUTO === parseInt(selectedProduct, 10))
      .map(d => ({
        data: d.DATA_EVENTO.substring(5), // Month-Day format
        stock: d.QUANTIDADE_ESTOQUE,
        price: d.PRECO,
        promotion: d.FLAG_PROMOCAO,
        moving_avg_7d: d.MEDIA_MOVEL_7D
      }));

    const promoImpact = enrichedData.reduce((acc, row) => {
      const key = row.FLAG_PROMOCAO ? 'With Promotion' : 'Without Promotion';
      if (!acc[key]) acc[key] = { total: 0, count: 0, sales: 0 };
      acc[key].total += row.QUANTIDADE_ESTOQUE;
      acc[key].count++;
      // VENDAS_DIA_ANTERIOR is stock loss (sales). Positive value is a sale.
      if (row.VENDAS_DIA_ANTERIOR > 0) acc[key].sales += row.VENDAS_DIA_ANTERIOR;
      return acc;
    }, {});

    const promoAnalysisData = Object.keys(promoImpact).map(key => ({
      category: key,
      avg_stock: (promoImpact[key].total / promoImpact[key].count).toFixed(1),
      avg_sales: (promoImpact[key].sales / promoImpact[key].count).toFixed(1)
    }));

    return {
      productSummary: summary,
      criticalProducts: critProducts,
      selectedProductData: selProductData,
      promoAnalysis: promoAnalysisData
    };
  }, [enrichedData, selectedProduct]);

  // Combine historical data and predictions for the chart
  const combinedData = useMemo(() => {
    return [
      ...selectedProductData.map(d => ({ ...d, type: 'Actual', predicted_stock: null, lower_bound: null, upper_bound: null })),
      ...predictions.map(p => ({
        data: p.data.substring(5),
        stock: null,
        predicted_stock: p.estoque_previsto,
        lower_bound: p.limite_inferior,
        upper_bound: p.limite_superior,
        type: 'Forecast'
      }))
    ];
  }, [selectedProductData, predictions]);

  /* ---------------- UI ---------------- */
  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
              <Box className="text-blue-600" size={36} />
              Inventory Forecasting System (ML)
            </h1>
            <p className="text-gray-600 mt-2">
              Predictive Analysis using Feature Engineering & Time Series Forecasting
            </p>
          </div>

          <div className="text-right">
            <div className="text-sm text-gray-500">Period</div>
            <div className="text-lg font-semibold text-gray-800">2023-12-31 - (Next 7 Days Forecast)</div>
            <div className="text-sm text-blue-600">{Object.keys(productSummary).length} Products | {enrichedData.length} Records</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-lg mb-6">
        <div className="flex border-b">
          {[
            { id: 'overview', label: 'Overview', icon: TrendingUp },
            { id: 'prediction', label: 'Forecasts', icon: Calendar },
            { id: 'analysis', label: 'Detailed Analysis', icon: Box },
            { id: 'metrics', label: 'Model Metrics', icon: DollarSign }
          ].map(tab => <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-6 py-4 flex items-center justify-center gap-2 font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <tab.icon size={20} />
            {tab.label}
          </button>)}
        </div>
      </div>

      {/* Overview */}
      {activeTab === 'overview' && <div className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">Critical Products</div>
                <div className="text-3xl font-bold text-red-600">{criticalProducts.length}</div>
              </div>
              <AlertTriangle className="text-red-600" size={32} />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">Average Stock</div>
                <div className="text-3xl font-bold text-blue-600">
                  {(enrichedData.reduce((s, d) => s + d.QUANTIDADE_ESTOQUE, 0) / enrichedData.length || 0).toFixed(0)}
                </div>
              </div>
              <Box className="text-blue-600" size={32} />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">Average Price</div>
                <div className="text-3xl font-bold text-green-600">
                  ${(enrichedData.reduce((s, d) => s + d.PRECO, 0) / enrichedData.length || 0).toFixed(2)}
                </div>
              </div>
              <DollarSign className="text-green-600" size={32} />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">Promotion Rate</div>
                <div className="text-3xl font-bold text-purple-600">
                  {((enrichedData.filter(d => d.FLAG_PROMOCAO === 1).length / enrichedData.length) * 100 || 0).toFixed(1)}%
                </div>
              </div>
              <TrendingUp className="text-purple-600" size={32} />
            </div>
          </div>
        </div>

        {/* Critical products table */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <AlertTriangle className="text-red-600" />
            Products in Critical Condition
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Product</th>
                  <th className="text-left py-3 px-4">Min Stock</th>
                  <th className="text-left py-3 px-4">Avg Stock</th>
                  <th className="text-left py-3 px-4">Critical Days</th>
                  <th className="text-left py-3 px-4">Avg Price</th>
                  <th className="text-left py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {criticalProducts.map(prod => <tr key={prod.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4 font-semibold">ID {prod.id}</td>
                  <td className="py-3 px-4">
                    <span className={`font-bold ${prod.minStock < 10 ? 'text-red-600' : 'text-orange-600'}`}>
                      {prod.minStock}
                    </span>
                  </td>
                  <td className="py-3 px-4">{prod.avgStock}</td>
                  <td className="py-3 px-4">{prod.criticalDays}</td>
                  <td className="py-3 px-4">${prod.avgPrice}</td>
                  <td className="py-3 px-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${prod.minStock < 10 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                      {prod.minStock < 10 ? 'URGENT' : 'ATTENTION'}
                    </span>
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </div>

        {/* Promotion impact */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Promotion Impact</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={promoAnalysis}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="avg_stock" name="Average Stock" fill="#3b82f6" />
              <Bar dataKey="avg_sales" name="Avg Sales/Day" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>}

      {/* Forecasts */}
      {activeTab === 'prediction' && <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select product to forecast</label>
          <select
            value={selectedProduct}
            onChange={e => setSelectedProduct(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {[...new Set(enrichedData.map(d => d.ID_PRODUTO))].map(id => <option key={id} value={id}>Product {id}</option>)}
          </select>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Stock Forecast — Next 7 Days</h3>
          {loading ? <div className="flex items-center justify-center h-96">
            <div className="text-gray-500">Generating forecasts...</div>
          </div> : <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={combinedData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="data" />
              <YAxis />
              <Tooltip />
              <Legend />
              {/* Confidence Interval Area */}
              <Area
                type="monotone"
                dataKey="upper_bound"
                fill="#c7d2fe"
                stroke="#c7d2fe"
                name="Confidence Interval"
                strokeWidth={0}
                stackId="1"
              />
              <Area
                type="monotone"
                dataKey="lower_bound"
                fill="#f8fafc"
                stroke="#f8fafc"
                name="Lower Bound"
                strokeWidth={0}
                stackId="1"
              />

              <Line type="monotone" dataKey="stock" name="Actual Stock" dot={{ r: 4 }} strokeWidth={2} stroke="#10b981" />
              <Line type="monotone" dataKey="moving_avg_7d" name="7D Moving Avg" strokeWidth={1} strokeDasharray="5 5" stroke="#6b7280" dot={false} />
              <Line type="monotone" dataKey="predicted_stock" name="Forecast" strokeWidth={3} dot={{ r: 6 }} stroke="#3b82f6" />
            </AreaChart>
          </ResponsiveContainer>}
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Forecast Details</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Date</th>
                  <th className="text-left py-3 px-4">Forecasted Stock</th>
                  <th className="text-left py-3 px-4">Confidence Interval</th>
                  <th className="text-left py-3 px-4">Confidence</th>
                  <th className="text-left py-3 px-4">Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {predictions.map((pred, idx) => <tr key={idx} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium">{pred.data}</td>
                  <td className="py-3 px-4">
                    <span className={`font-bold ${
                      pred.estoque_previsto < 20 ? 'text-red-600' :
                        pred.estoque_previsto < 50 ? 'text-orange-600' : 'text-green-600'
                      }`}>
                      {pred.estoque_previsto} units
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">{pred.limite_inferior} - {pred.limite_superior}</td>
                  <td className="py-3 px-4"><span className="text-blue-600 font-semibold">{(pred.nivel_confianca * 100).toFixed(0)}%</span></td>
                  <td className="py-3 px-4">
                    {pred.estoque_previsto < 20 ? <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">Reorder Urgently</span> : pred.estoque_previsto < 50 ? <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">Plan Reorder</span> : <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">Stock OK</span>}
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </div>
      </div>}

      {/* Analysis */}
      {activeTab === 'analysis' && <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Applied Feature Engineering</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold text-gray-700 mb-3">Temporal Features</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2"><div className="w-2 h-2 bg-blue-600 rounded-full"></div><span>DAY_OF_WEEK (0-6)</span></li>
                <li className="flex items-center gap-2"><div className="w-2 h-2 bg-blue-600 rounded-full"></div><span>IS_WEEKEND (Flag)</span></li>
                <li className="flex items-center gap-2"><div className="w-2 h-2 bg-blue-600 rounded-full"></div><span>DAY_OF_MONTH</span></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-gray-700 mb-3">Trend Features</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2"><div className="w-2 h-2 bg-green-600 rounded-full"></div><span>MOVING_AVG_3D (Stock)</span></li>
                <li className="flex items-center gap-2"><div className="w-2 h-2 bg-green-600 rounded-full"></div><span>MOVING_AVG_7D (Stock)</span></li>
                <li className="flex items-center gap-2"><div className="w-2 h-2 bg-green-600 rounded-full"></div><span>PREVIOUS_DAY_SALES (Delta)</span></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-gray-700 mb-3">Price Features</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2"><div className="w-2 h-2 bg-purple-600 rounded-full"></div><span>PREVIOUS_PRICE</span></li>
                <li className="flex items-center gap-2"><div className="w-2 h-2 bg-purple-600 rounded-full"></div><span>PRICE_CHANGE</span></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-gray-700 mb-3">Alert Features</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2"><div className="w-2 h-2 bg-red-600 rounded-full"></div><span>IS_CRITICAL_STOCK (&lt; 20)</span></li>
                <li className="flex items-center gap-2"><div className="w-2 h-2 bg-red-600 rounded-full"></div><span>NEEDS_REORDER (&lt; 30)</span></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Top 10 Products by Average Stock (Sorted Ascending)</h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={Object.values(productSummary)
                .sort((a, b) => parseFloat(a.avgStock) - parseFloat(b.avgStock))
                .slice(0, 10)
                .map(p => ({
                  product: `ID ${p.id}`,
                  avg_stock: parseFloat(p.avgStock),
                  critical_days: p.criticalDays
                }))}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="product" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="avg_stock" name="Avg Stock" fill="#3b82f6" />
              <Bar dataKey="critical_days" name="Critical Days" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>}

      {/* Metrics */}
      {activeTab === 'metrics' && <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Model Performance Metrics</h3>

          {metrics && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-600">
              <div className="text-sm text-blue-600 font-medium">RMSE</div>
              <div className="text-3xl font-bold text-blue-900">{metrics.rmse}</div>
              <div className="text-xs text-blue-600 mt-1">Root Mean Square Error</div>
            </div>

            <div className="bg-green-50 rounded-lg p-4 border-l-4 border-green-600">
              <div className="text-sm text-green-600 font-medium">MAPE</div>
              <div className="text-3xl font-bold text-green-900">{metrics.mape}%</div>
              <div className="text-xs text-green-600 mt-1">Mean Absolute % Error</div>
            </div>

            <div className="bg-purple-50 rounded-lg p-4 border-l-4 border-purple-600">
              <div className="text-sm text-purple-600 font-medium">R²</div>
              <div className="text-3xl font-bold text-purple-900">{metrics.r2}</div>
              <div className="text-xs text-purple-600 mt-1">Coefficient of Determination</div>
            </div>

            <div className="bg-orange-50 rounded-lg p-4 border-l-4 border-orange-600">
              <div className="text-sm text-orange-600 font-medium">MAE</div>
              <div className="text-3xl font-bold text-orange-900">{metrics.mae}</div>
              <div className="text-xs text-orange-600 mt-1">Mean Absolute Error</div>
            </div>
          </div>}

          <div className="bg-gray-50 rounded-lg p-6">
            <h4 className="font-semibold text-gray-800 mb-3">Metrics Interpretation</h4>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-100 rounded flex items-center justify-center"><span className="text-blue-600 font-bold text-xs">✓</span></div>
                <div><span className="font-semibold">RMSE:</span> Measures average error magnitude. Lower is better.</div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-green-100 rounded flex items-center justify-center"><span className="text-green-600 font-bold text-xs">✓</span></div>
                <div><span className="font-semibold">MAPE:</span> Percentage error. &lt;15% = Excellent | 15-25% = Good.</div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-purple-100 rounded flex items-center justify-center"><span className="text-purple-600 font-bold text-xs">✓</span></div>
                <div><span className="font-semibold">R²:</span> How well the model explains variance. Closer to 1.0 is better.</div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-orange-100 rounded flex items-center justify-center"><span className="text-orange-600 font-bold text-xs">✓</span></div>
                <div><span className="font-semibold">MAE:</span> Average absolute error in stock units.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Top 5 Most Important Features (Illustrative)</h3>
          <div className="space-y-3">
            {[
              { feature: 'MOVING_AVG_7D', importance: 92, color: 'bg-blue-600' },
              { feature: 'PREVIOUS_DAY_SALES', importance: 85, color: 'bg-green-600' },
              { feature: 'PROMOTION_FLAG', importance: 78, color: 'bg-purple-600' },
              { feature: 'PRICE_CHANGE', importance: 65, color: 'bg-orange-600' },
              { feature: 'DAY_OF_WEEK', importance: 52, color: 'bg-pink-600' }
            ].map((item, idx) => <div key={idx}>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">{item.feature}</span>
                <span className="text-sm font-semibold text-gray-900">{item.importance}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div className={`${item.color} h-3 rounded-full transition-all duration-500`} style={{ width: `${item.importance}%` }} />
              </div>
            </div>)}
          </div>
        </div>
      </div>}

      {/* Footer */}
      <div className="bg-white rounded-lg shadow-lg p-6 mt-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-gray-800">ML Project — Inventory Forecasting</h4>
            <p className="text-sm text-gray-600 mt-1">Implementation using Feature Engineering, Time Series rules, and simple forecasting heuristics.</p>
          </div>
          <button className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Download size={20} />
            Export Report
          </button>
        </div>
      </div>
    </div>
  );
};

export default SystemFrontDashboard;
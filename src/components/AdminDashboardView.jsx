import React, { useState, useEffect } from 'react';
import { Lock, Unlock, ShieldAlert, Download, Sparkles, Tag, Save, RefreshCw, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { agentSalesForecaster } from '../services/aiAgents';
import { syncSettingsToSupabase } from '../services/supabaseClient';

export default function AdminDashboardView({
  storeSettings,
  setStoreSettings,
  bills,
  products
}) {
  // Authentication & Rate-Limiting State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutTimer, setLockoutTimer] = useState(0);
  const [authError, setAuthError] = useState('');

  // Editable settings
  const [shopName, setShopName] = useState(storeSettings.shop_name);
  const [upiId, setUpiId] = useState(storeSettings.upi_id);
  const [phone, setPhone] = useState(storeSettings.phone);
  const [discountPercent, setDiscountPercent] = useState(storeSettings.active_discount_percent || 0);

  // Shop Timings & Open/Closed Status
  const [isShopOpen, setIsShopOpen] = useState(storeSettings.is_shop_open ?? true);
  const [openingTime, setOpeningTime] = useState(storeSettings.opening_time || '07:00 AM');
  const [closingTime, setClosingTime] = useState(storeSettings.closing_time || '10:30 PM');
  const [closedNotice, setClosedNotice] = useState(storeSettings.closed_message || 'Dukan abhi band hai. Subah khulegi.');


  // AI Forecasting
  const [aiReport, setAiReport] = useState(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // Lockout countdown timer
  useEffect(() => {
    let interval;
    if (lockoutTimer > 0) {
      interval = setInterval(() => {
        setLockoutTimer((prev) => {
          if (prev <= 1) {
            setFailedAttempts(0); // reset after lockout expires
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [lockoutTimer]);

  // Handle Login with 5-attempt rate limit and 30-second penalty
  const handleLogin = (e) => {
    e.preventDefault();
    if (lockoutTimer > 0) return;

    // Credentials: admin / sahayak123
    if (username === 'admin' && password === 'sahayak123') {
      setIsAuthenticated(true);
      setAuthError('');
      setFailedAttempts(0);
    } else {
      const nextFailures = failedAttempts + 1;
      setFailedAttempts(nextFailures);
      if (nextFailures >= 5) {
        setLockoutTimer(30);
        setAuthError('Too many failed attempts! Admin portal is locked for 30 seconds.');
      } else {
        setAuthError(`Invalid credentials! (${5 - nextFailures} attempts left before 30s lockout)`);
      }
    }
  };

  // Save Shop Configuration
  const handleSaveSettings = () => {
    const updatedSettings = {
      ...storeSettings,
      shop_name: shopName,
      upi_id: upiId,
      phone: phone,
      active_discount_percent: Number(discountPercent) || 0,
      is_shop_open: isShopOpen,
      opening_time: openingTime,
      closing_time: closingTime,
      closed_message: closedNotice,
    };
    setStoreSettings(updatedSettings);
    syncSettingsToSupabase(updatedSettings);
    alert('Store configuration & timings successfully updated and synced to Supabase!');
  };

  const handleToggleShopOpen = (openState) => {
    setIsShopOpen(openState);
    setStoreSettings((prev) => ({
      ...prev,
      is_shop_open: openState,
    }));
  };

  // Toggle or cancel store discount
  const handleCancelDiscount = () => {
    setDiscountPercent(0);
    setStoreSettings((prev) => ({
      ...prev,
      active_discount_percent: 0,
    }));
  };

  // Download 1-Click Sales & Profit Report (CSV)
  const handleDownloadReport = () => {
    if (bills.length === 0) {
      alert('No sales bills available yet to export.');
      return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Bill No,Date,Customer,Source,Payment Mode,Items Count,Subtotal,Discount,Grand Total,Profit Margin\n';

    bills.forEach((b) => {
      // Estimate wholesale cost
      let costSum = 0;
      (b.items || []).forEach((it) => {
        const prod = products.find((p) => p.id === it.productId || p.name === it.name);
        const wholesaleRate = prod ? prod.wholesale_price : it.unit_price * 0.8;
        costSum += wholesaleRate * it.quantity;
      });
      const profit = (b.total_amount - costSum).toFixed(2);

      csvContent += `"${b.bill_number}","${new Date(b.created_at).toLocaleDateString()}","${b.customer_name}","${b.source}","${b.payment_mode}","${b.items?.length || 0}","${b.subtotal}","${b.discount_applied}","${b.total_amount}","${profit}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Sahayak_Sales_Profit_Report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Run AI Sales & Stock Velocity Analysis
  const runAiForecast = async () => {
    setIsGeneratingAi(true);
    try {
      const result = await agentSalesForecaster(bills, products);
      setAiReport(result);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // -------------------------------------------------------------
  // Render Lock Screen if not authenticated
  // -------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div className="admin-lock-screen">
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
          <Lock size={24} />
        </div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>Admin Security Access</h2>
        <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
          Restricted dashboard. Protected by 5-attempt rate limiter.
        </p>

        {authError && (
          <div style={{ marginTop: '1rem', padding: '0.6rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '0.8rem', color: '#b91c1c' }}>
            {authError}
          </div>
        )}

        {lockoutTimer > 0 && (
          <div style={{ marginTop: '1rem', padding: '0.8rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', color: '#92400e' }}>
            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Locked: {lockoutTimer}s remaining</div>
            <p style={{ fontSize: '0.78rem' }}>Please wait for the security countdown to finish before retrying.</p>
          </div>
        )}

        <form onSubmit={handleLogin} style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem', textAlign: 'left' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={lockoutTimer > 0}
              placeholder="admin"
              style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '0.2rem' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={lockoutTimer > 0}
              placeholder="sahayak123"
              style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '0.2rem' }}
            />
          </div>

          <button
            type="submit"
            className="action-btn-primary"
            disabled={lockoutTimer > 0}
            style={{ width: '100%', marginTop: '0.5rem', background: '#0f172a' }}
          >
            <Unlock size={16} /> Unlock Admin Dashboard
          </button>
        </form>
      </div>
    );
  }

  // Calculate quick metrics
  const totalSalesRevenue = bills.reduce((acc, b) => acc + b.total_amount, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a' }}>Admin Control Center</h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Store settings, live discount campaigns, one-click profit reports & AI inventory forecast.
          </p>
        </div>
        <button
          onClick={() => setIsAuthenticated(false)}
          style={{ fontSize: '0.82rem', color: '#64748b', border: '1px solid #cbd5e1', padding: '0.4rem 0.8rem', borderRadius: '6px' }}
        >
          Lock Dashboard
        </button>
      </div>

      {/* Grid: Settings & Live Discount Campaign */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* Card 1: Shop & Payment Configuration */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '1rem', color: '#0f172a' }}>
            Shop & Payment Configuration
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Shop Display Name</label>
              <input
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>UPI ID (For Instant QR Generation)</label>
              <input
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Contact Number</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>

            {/* Shop Timings & Open/Closed Status */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>Shop Status (Open/Closed):</span>
                <button
                  type="button"
                  onClick={() => handleToggleShopOpen(!isShopOpen)}
                  style={{
                    padding: '0.35rem 0.8rem',
                    borderRadius: '9999px',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    background: isShopOpen ? '#dcfce7' : '#fee2e2',
                    color: isShopOpen ? '#15803d' : '#b91c1c',
                    border: `1px solid ${isShopOpen ? '#86efac' : '#fca5a5'}`
                  }}
                >
                  {isShopOpen ? '🟢 OPEN (Dukan Khuli Hai)' : '🔴 CLOSED (Dukan Band Hai)'}
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Opening Time</label>
                  <input
                    type="text"
                    value={openingTime}
                    onChange={(e) => setOpeningTime(e.target.value)}
                    placeholder="07:00 AM"
                    style={{ width: '100%', padding: '0.45rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Closing Time</label>
                  <input
                    type="text"
                    value={closingTime}
                    onChange={(e) => setClosingTime(e.target.value)}
                    placeholder="10:30 PM"
                    style={{ width: '100%', padding: '0.45rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Closed Notice / Message for Customers</label>
                <input
                  type="text"
                  value={closedNotice}
                  onChange={(e) => setClosedNotice(e.target.value)}
                  placeholder="Dukan abhi band hai. Subah khulegi."
                  style={{ width: '100%', padding: '0.45rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.82rem' }}
                />
              </div>
            </div>



            <button
              onClick={handleSaveSettings}
              className="action-btn-primary"
              style={{ marginTop: '0.5rem', background: '#0f766e', padding: '0.65rem' }}
            >
              <Save size={16} /> Save Shop Settings
            </button>
          </div>
        </div>

        {/* Card 2: Live Store Offer Engine */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Tag size={20} color="#dc2626" />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                Store-wide Direct Offers Engine
              </h3>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#64748b' }}>
              Add a discount directly across all items (e.g. 10% off on everything). The discount reflects instantly in POS and bills. You can cancel it at any time.
            </p>

            <div style={{ marginTop: '1.25rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
                Store Discount Percentage (%)
              </label>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <input
                  type="number"
                  min="0"
                  max="90"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  placeholder="e.g. 10"
                  style={{ width: '100px', padding: '0.6rem', fontSize: '1.2rem', fontWeight: 700, border: '2px solid #cbd5e1', borderRadius: '6px' }}
                />
                <button
                  onClick={handleSaveSettings}
                  className="action-btn-primary"
                  style={{ background: '#dc2626', padding: '0.6rem 1.25rem' }}
                >
                  Activate Offer
                </button>
              </div>
            </div>
          </div>

          {storeSettings.active_discount_percent > 0 && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, color: '#dc2626', fontSize: '0.9rem' }}>
                  {storeSettings.active_discount_percent}% OFF Currently Active
                </div>
                <div style={{ fontSize: '0.75rem', color: '#991b1b' }}>Applying to all customer items</div>
              </div>
              <button
                onClick={handleCancelDiscount}
                style={{ background: '#fff', border: '1px solid #dc2626', color: '#dc2626', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700 }}
              >
                Cancel Offer
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Reports & AI Analytics Section */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
              Sales, Profit & AI Inventory Forecasting
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#64748b' }}>
              Total Bills Recorded: <strong>{bills.length}</strong> | Total Sales: <strong>₹{totalSalesRevenue.toFixed(2)}</strong>
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={handleDownloadReport}
              className="action-btn-secondary"
              style={{ padding: '0.6rem 1rem', fontSize: '0.85rem' }}
            >
              <Download size={16} /> 1-Click Sales & Profit Report (CSV)
            </button>
            <button
              onClick={runAiForecast}
              disabled={isGeneratingAi}
              className="action-btn-primary"
              style={{ background: '#0f766e', padding: '0.6rem 1.25rem', fontSize: '0.85rem' }}
            >
              <Sparkles size={16} />
              {isGeneratingAi ? 'AI Analyzing...' : 'Run Ollama AI Restock Analysis'}
            </button>
          </div>
        </div>

        {/* AI Analytics Intelligence Box */}
        {aiReport ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            {/* High Velocity */}
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#16a34a', fontWeight: 700, fontSize: '0.95rem' }}>
                <TrendingUp size={18} />
                <span>Fast-Moving Items (Order More)</span>
              </div>
              <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {aiReport.highVelocity?.map((item, i) => (
                  <div key={i} style={{ fontSize: '0.85rem', color: '#14532d' }}>
                    <strong>• {item.itemName}:</strong> {item.reason}
                  </div>
                ))}
              </div>
            </div>

            {/* Slow Moving */}
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#d97706', fontWeight: 700, fontSize: '0.95rem' }}>
                <TrendingDown size={18} />
                <span>Slow-Moving / Dead Stock</span>
              </div>
              <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {aiReport.slowMoving?.map((item, i) => (
                  <div key={i} style={{ fontSize: '0.85rem', color: '#78350f' }}>
                    <strong>• {item.itemName}:</strong> {item.reason}
                  </div>
                ))}
              </div>
            </div>

            {/* AI Strategic Advice */}
            <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#0f172a', fontWeight: 700, fontSize: '0.95rem' }}>
                <Sparkles size={18} color="#0f766e" />
                <span>AI Actionable Business Recommendations</span>
              </div>
              <ul style={{ marginTop: '0.75rem', paddingLeft: '1.2rem', fontSize: '0.85rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {aiReport.actionableTips?.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
            <Sparkles size={32} color="#0f766e" style={{ margin: '0 auto 0.5rem auto' }} />
            <p style={{ fontWeight: 600 }}>Ollama AI Analysis Ready</p>
            <p style={{ fontSize: '0.82rem' }}>Click "Run Ollama AI Restock Analysis" above to discover fast selling vs. slow moving stock.</p>
          </div>
        )}
      </div>
    </div>
  );
}

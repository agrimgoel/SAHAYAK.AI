import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Minus, Plus, X, Printer, CheckCircle, Sparkles } from 'lucide-react';

export default function LooseWeightModal({ product, isOpen, onClose, onAddToCart, activeDiscount = 0 }) {
  const [kg, setKg] = useState(1);
  const [gm, setGm] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setKg(1);
      setGm(0);
    }
  }, [isOpen, product]);

  if (!isOpen || !product) return null;

  const totalKg = Number(kg || 0) + Number(gm || 0) / 1000;
  const baseRate = Number(product.selling_price || 0);
  const discountMultiplier = activeDiscount > 0 ? (100 - activeDiscount) / 100 : 1;
  const effectiveRate = baseRate * discountMultiplier;
  const calculatedTotal = (totalKg * effectiveRate).toFixed(2);

  const handleConfirm = () => {
    if (totalKg <= 0) return;
    onAddToCart({
      productId: product.id,
      name: product.name,
      is_loose: true,
      quantity: totalKg,
      unit: 'kg',
      displayWeight: `${kg ? `${kg} kg` : ''} ${gm ? `${gm} gm` : ''}`.trim() || `${totalKg} kg`,
      unit_price: baseRate,
      effective_price: effectiveRate,
      total_price: parseFloat(calculatedTotal),
    });
    onClose();
  };

  const setPreset = (presetKg, presetGm) => {
    setKg(presetKg);
    setGm(presetGm);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="product-loose-tag">Loose Item Weight Evaluation</span>
            <h3 style={{ marginTop: '0.2rem' }}>{product.name}</h3>
          </div>
          <button onClick={onClose} style={{ padding: '0.4rem', color: '#64748b' }}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Standard Rate: <strong>₹{baseRate} / kg</strong>
            {activeDiscount > 0 && (
              <span style={{ color: '#dc2626', marginLeft: '0.5rem', fontWeight: 600 }}>
                ({activeDiscount}% Store Off Active → ₹{effectiveRate.toFixed(2)}/kg)
              </span>
            )}
          </p>

          {/* Quick Presets */}
          <div style={{ marginTop: '1rem', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b' }}>Quick Select Presets:</span>
          </div>
          <div className="quick-weight-presets">
            <button className="preset-chip" onClick={() => setPreset(0, 250)}>250 gm</button>
            <button className="preset-chip" onClick={() => setPreset(0, 500)}>500 gm (Half kg)</button>
            <button className="preset-chip" onClick={() => setPreset(1, 0)}>1 kg</button>
            <button className="preset-chip" onClick={() => setPreset(1, 500)}>1.5 kg (1kg 500gm)</button>
            <button className="preset-chip" onClick={() => setPreset(2, 0)}>2 kg</button>
            <button className="preset-chip" onClick={() => setPreset(5, 0)}>5 kg</button>
            <button className="preset-chip" onClick={() => setPreset(10, 0)}>10 kg</button>
          </div>

          {/* Dual Inputs: Kg & Gm */}
          <div className="weight-inputs-grid">
            <div className="weight-input-field">
              <label>Kilograms (Kg)</label>
              <div className="weight-input-wrapper">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={kg}
                  onChange={(e) => setKg(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="0"
                  autoFocus
                />
                <span className="weight-input-unit">KG</span>
              </div>
            </div>

            <div className="weight-input-field">
              <label>Grams (Gm)</label>
              <div className="weight-input-wrapper">
                <input
                  type="number"
                  min="0"
                  max="999"
                  step="50"
                  value={gm}
                  onChange={(e) => setGm(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="0"
                />
                <span className="weight-input-unit">GM</span>
              </div>
            </div>
          </div>

          {/* Real-time Calculation */}
          <div className="modal-calculation-box">
            <div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Total Weight Evaluated</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
                {totalKg.toFixed(3)} kg
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Calculated Price</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f766e' }}>
                ₹{calculatedTotal}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="action-btn-secondary" onClick={onClose} style={{ padding: '0.65rem 1.25rem' }}>
            Cancel
          </button>
          <button
            className="action-btn-primary"
            onClick={handleConfirm}
            disabled={totalKg <= 0}
            style={{ padding: '0.65rem 1.5rem', background: '#0f766e' }}
          >
            Add to Bill (₹{calculatedTotal})
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { Upload, FileText, Check, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { agentDistributorBillParser } from '../services/aiAgents';
import { createWorker } from 'tesseract.js';

export default function BillScannerView({ products, setProducts }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');
  const [extractedInvoice, setExtractedInvoice] = useState(null);
  const [editableRows, setEditableRows] = useState([]);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Handle image upload and OCR
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setUploadSuccess(false);
    setOcrStatus('Reading distributor bill with OCR...');

    try {
      // 1. Run local Tesseract OCR on the uploaded bill
      let recognizedText = '';
      try {
        setOcrStatus('Initializing OCR engine (Tesseract)...');
        const worker = await createWorker('eng');
        setOcrStatus('Scanning bill image and recognizing text...');
        const ret = await worker.recognize(file);
        recognizedText = ret.data?.text || '';
        await worker.terminate();

        console.log("Raw OCR Recognized Text:\n", recognizedText);
      } catch (ocrErr) {
        console.error('Tesseract worker failed:', ocrErr);
      }

      // If recognized text is too short or empty, provide friendly feedback
      if (!recognizedText || recognizedText.trim().length < 15) {
        setOcrStatus('OCR text unclear or low resolution. Applying smart receipt parser...');
      }

      setOcrStatus('Parsing items, wholesale rates & quantities with AI Agent...');

      // 2. Call Autonomous AI Ingestion Agent
      const invoiceData = await agentDistributorBillParser(recognizedText);
      setExtractedInvoice(invoiceData);

      fillVerificationTable(invoiceData);
    } catch (err) {
      console.error(err);
      alert('Failed to parse bill: ' + err.message);
    } finally {
      setIsProcessing(false);
      setOcrStatus('');
    }
  };

  const parseDirectText = async (rawText) => {
    setIsProcessing(true);
    setUploadSuccess(false);
    setOcrStatus('Parsing invoice text with AI Agent...');
    try {
      const invoiceData = await agentDistributorBillParser(rawText);
      setExtractedInvoice(invoiceData);
      fillVerificationTable(invoiceData);
    } catch (err) {
      console.error(err);
      alert('Error: ' + err.message);
    } finally {
      setIsProcessing(false);
      setOcrStatus('');
    }
  };

  const fillVerificationTable = (invoiceData) => {
    const rows = (invoiceData.items || []).map((item, idx) => {
      const existing = products.find(p => p.name.toLowerCase().includes(item.itemName.toLowerCase().split(' ')[0]));
      return {
        id: `row-${idx}`,
        itemName: item.itemName,
        wholesalePrice: item.wholesalePrice,
        quantity: item.quantity,
        unit: item.unit || 'unit',
        sellingPrice: existing ? existing.selling_price : '',
        is_loose: item.itemName.toLowerCase().includes('atta') || item.itemName.toLowerCase().includes('sugar') || item.itemName.toLowerCase().includes('chini') || item.itemName.toLowerCase().includes('besan')
      };
    });
    setEditableRows(rows);
  };

  const handleSellingPriceChange = (index, value) => {
    setEditableRows(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], sellingPrice: value };
      return copy;
    });
  };

  // Upload verified items to Final DB
  const handleUploadToDatabase = () => {
    // Validate that shopkeeper has entered selling prices
    const missing = editableRows.filter(r => !r.sellingPrice || Number(r.sellingPrice) <= 0);
    if (missing.length > 0) {
      alert(`Please enter a valid Selling Price for all items! (${missing.length} missing)`);
      return;
    }

    // Merge into products inventory
    setProducts(prev => {
      const updated = [...prev];
      editableRows.forEach(row => {
        const existingIdx = updated.findIndex(p => p.name.toLowerCase() === row.itemName.toLowerCase());
        const addQty = Number(row.quantity);
        const sellPr = Number(row.sellingPrice);
        const wholePr = Number(row.wholesalePrice);

        if (existingIdx > -1) {
          updated[existingIdx] = {
            ...updated[existingIdx],
            stock_quantity: updated[existingIdx].stock_quantity + addQty,
            wholesale_price: wholePr,
            selling_price: sellPr,
          };
        } else {
          updated.push({
            id: `prod-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            name: row.itemName,
            is_loose: row.is_loose,
            wholesale_price: wholePr,
            selling_price: sellPr,
            stock_quantity: addQty,
            unit: row.unit,
            category: 'General'
          });
        }
        const finalProductObj = existingIdx > -1 ? updated[existingIdx] : updated[updated.length - 1];
        // Sync item to Supabase cloud
        import('../services/supabaseClient').then(({ syncProductToSupabase }) => {
          syncProductToSupabase(finalProductObj);
        });
      });
      return updated;
    });

    setUploadSuccess(true);
    setExtractedInvoice(null);
    setEditableRows([]);
  };

  return (
    <div className="invoice-upload-container">
      {/* Top Description */}
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a' }}>
          Distributor Bill Ingestion (AI Agent Scanner)
        </h2>
      </div>

      {/* Upload Box */}
      {!extractedInvoice && (
        <label className="upload-dropzone">
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
            disabled={isProcessing}
          />
          {isProcessing ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
              <Loader2 className="animate-spin" size={36} color="#0f766e" />
              <div style={{ fontWeight: 600, color: '#0f172a' }}>{ocrStatus}</div>
              <p style={{ fontSize: '0.8rem', color: '#64748b' }}>Running local Ollama Qwen 2.5:7b agent...</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Upload size={28} color="#0f766e" />
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f172a' }}>
                Click to Upload Distributor Wholesale Bill
              </div>
              <p style={{ fontSize: '0.82rem', color: '#64748b' }}>
                Supports PNG, JPG, or PDF invoices
              </p>
            </div>
          )}
        </label>
      )}

      {/* Manual Paste Text Fallback Option */}
      {!extractedInvoice && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
              Ya Invoice Text Paste Karein (Quick Scan):
            </span>
            <button
              onClick={() => {
                const sample = `M/S AGGARWAL TRADERS WHOLESALE MANDI
Date: 25-10-2026
Aashirvaad Chakki Atta 10kg | Qty: 20 | Rate: 340.00
Madhur Crystal Sugar 50kg bag | Qty: 5 | Rate: 1850.00
Fortune Kachi Ghani Mustard Oil 1L | Qty: 36 | Rate: 132.00
Tata Salt 1kg | Qty: 50 | Rate: 22.00
Maggi Masala Noodles 70g | Qty: 96 | Rate: 11.50`;
                parseDirectText(sample);
              }}
              style={{ fontSize: '0.78rem', color: '#0f766e', fontWeight: 600, textDecoration: 'underline' }}
            >
              Fill Sample Invoice
            </button>
          </div>
          <textarea
            id="manual-ocr-textarea"
            rows={4}
            placeholder="Agar camera blur ho, to invoice ke items yaha paste ya type kar sakte hain (e.g. Atta 10kg Qty 20 Rate 340)..."
            style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontFamily: 'monospace' }}
          />
          <button
            onClick={() => {
              const val = document.getElementById('manual-ocr-textarea')?.value;
              if (val) parseDirectText(val);
            }}
            className="action-btn-primary"
            style={{ marginTop: '0.5rem', background: '#0f766e', padding: '0.5rem 1rem', fontSize: '0.85rem' }}
          >
            Scan & Parse Text
          </button>
        </div>
      )}

      {/* Success Banner */}
      {uploadSuccess && (
        <div style={{ padding: '1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#15803d' }}>
          <Check size={20} />
          <span style={{ fontWeight: 600 }}>All items and updated stocks successfully saved to the Database!</span>
        </div>
      )}

      {/* 3-Column Verification Grid */}
      {extractedInvoice && editableRows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                Distributor: {extractedInvoice.vendor || 'Wholesale Supplier'}
              </h3>
              <p style={{ fontSize: '0.82rem', color: '#64748b' }}>
                Verified {editableRows.length} items extracted by AI. Enter your Selling Price in Column 3 before final database commit.
              </p>
            </div>
            <button
              className="action-btn-primary"
              onClick={handleUploadToDatabase}
              style={{ background: '#0f766e', padding: '0.75rem 1.5rem' }}
            >
              <Check size={18} />
              Confirm & Upload to Database
            </button>
          </div>

          <div className="three-column-table-wrap">
            <table className="three-column-table">
              <thead>
                <tr>
                  <th style={{ width: '35%' }}>Item Name</th>
                  <th style={{ width: '20%' }}>1st Column: Wholesale Price (From Bill)</th>
                  <th style={{ width: '20%' }}>2nd Column: Quantity (From Bill)</th>
                  <th style={{ width: '25%' }}>3rd Column: Price for Sell (Shopkeeper Enter Manually)</th>
                </tr>
              </thead>
              <tbody>
                {editableRows.map((row, idx) => (
                  <tr key={row.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{row.itemName}</div>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        Type: {row.is_loose ? 'Loose Grocery' : 'Packaged Goods'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: '#475569', fontSize: '1.05rem' }}>
                        ₹{row.wholesalePrice}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}> /{row.unit}</span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.05rem' }}>
                        {row.quantity}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}> {row.unit}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontWeight: 700, color: '#16a34a' }}>₹</span>
                        <input
                          type="number"
                          step="0.5"
                          className="sell-price-input"
                          placeholder="Enter ₹ Price"
                          value={row.sellingPrice}
                          onChange={(e) => handleSellingPriceChange(idx, e.target.value)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

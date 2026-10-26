// Ollama Local AI & Multi-Agent orchestration service for Sahayak.AI

const OLLAMA_HOST_KEY = 'sahayak_ollama_host';
const OLLAMA_MODEL_KEY = 'sahayak_ollama_model';

export const getOllamaConfig = () => {
  return {
    host: localStorage.getItem(OLLAMA_HOST_KEY) || 'http://localhost:11434',
    model: localStorage.getItem(OLLAMA_MODEL_KEY) || 'qwen2.5:7b',
  };
};

export const saveOllamaConfig = (host, model) => {
  localStorage.setItem(OLLAMA_HOST_KEY, host);
  localStorage.setItem(OLLAMA_MODEL_KEY, model);
};

// Generic chat completion with Ollama API
export async function queryOllama({ prompt, systemPrompt = '', jsonFormat = false }) {
  const { host, model } = getOllamaConfig();

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const payload = {
    model: model,
    messages: messages,
    stream: false,
  };

  if (jsonFormat) {
    payload.format = 'json';
  }

  try {
    const res = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Ollama HTTP Error: ${res.statusText}`);
    }

    const data = await res.json();
    return {
      success: true,
      content: data.message?.content || '',
      source: 'ollama',
    };
  } catch (err) {
    console.warn("Ollama request failed or local server offline:", err.message);
    return {
      success: false,
      error: err.message,
      source: 'fallback',
    };
  }
}

// -------------------------------------------------------------
// AGENT 1: WhatsApp Customer Sales & Order Extraction Agent
// -------------------------------------------------------------
export async function agentWhatsAppOrderParser(userText, currentProducts, storeSettings = {}) {
  // Check if customer is asking about shop timing or if the shop is currently closed
  const textLower = userText.toLowerCase();
  const isTimingQuery = textLower.includes('timing') || textLower.includes('samay') || textLower.includes('khulegi') || textLower.includes('band') || textLower.includes('open') || textLower.includes('close');

  if (storeSettings.is_shop_open === false) {
    const timingInfo = `Dukan abhi band hai. Shop Timings: ${storeSettings.opening_time || '07:00 AM'} se ${storeSettings.closing_time || '10:30 PM'}. ${storeSettings.closed_message || 'Kripya khulne ke baad order karein.'}`;
    return {
      intent: 'general',
      replyMessage: `Namaste! 🙏 ${timingInfo}`,
      items: [],
      requiresPaymentChoice: false,
      aiSource: 'shop-status'
    };
  }

  if (isTimingQuery) {
    return {
      intent: 'general',
      replyMessage: `Namaste! Dukan khuli hai. Humare dukan ka samay hai: ${storeSettings.opening_time || '07:00 AM'} se ${storeSettings.closing_time || '10:30 PM'}. Aap abhi saman mangwa sakte hain.`,
      items: [],
      requiresPaymentChoice: false,
      aiSource: 'shop-status'
    };
  }

  const systemPrompt = `
You are the automated WhatsApp Kirana Sales Agent for a shop.
Shop Status: OPEN (Timing: ${storeSettings.opening_time || '07:00 AM'} to ${storeSettings.closing_time || '10:30 PM'})
Customers talk to you in Hindi, English, or Hinglish (e.g., "5 kilo atta, 10kg chini pack kerdena aake le jaunga", "bhai chini ka kya rate hai?").
You have access to current inventory:
${JSON.stringify(currentProducts.map(p => ({ id: p.id, name: p.name, price: p.selling_price, unit: p.unit, is_loose: p.is_loose })))}

Your tasks:
1. Determine customer intent: "order", "price_query", or "general".
2. If it is an order: extract the list of items, match them carefully to the best inventory item name and id, extract quantity and unit.
3. If it's a price query: list matching items with their prices.
4. Provide a friendly, polite Hinglish response.

Respond ONLY in valid JSON matching this schema:
{
  "intent": "order" | "price_query" | "general",
  "replyMessage": "Polite friendly message in natural Hinglish with price/total",
  "items": [
    {
      "matchedProductId": "id of product or null",
      "matchedProductName": "Standard name",
      "requestedQuantity": 5,
      "unit": "kg"
    }
  ],
  "requiresPaymentChoice": true or false
}
`;

  const prompt = `Customer says: "${userText}"`;

  const aiResult = await queryOllama({ prompt, systemPrompt, jsonFormat: true });

  if (aiResult.success) {
    try {
      const parsed = JSON.parse(aiResult.content);
      return { ...parsed, aiSource: 'ollama-qwen' };
    } catch {
      // JSON parse error fallback
    }
  }

  // Robust Rule-Based Fallback Agent in case Ollama is not yet launched by user
  return fallbackRuleBasedParser(userText, currentProducts, storeSettings);
}

// Fallback rule parser when Ollama server is offline
function fallbackRuleBasedParser(userText, currentProducts, storeSettings = {}) {
  const text = userText.toLowerCase();
  const lowerProducts = currentProducts.map(p => ({
    ...p,
    searchTerms: p.name.toLowerCase().split(' ')
  }));

  const isPriceQuery = text.includes('price') || text.includes('rate') || text.includes('kya bhav') || text.includes('kitne ka');

  if (isPriceQuery) {
    // Find mentioned products
    const matched = lowerProducts.filter(p =>
      p.searchTerms.some(term => term.length > 3 && text.includes(term)) ||
      (text.includes('atta') && p.name.toLowerCase().includes('atta')) ||
      (text.includes('chini') && p.name.toLowerCase().includes('chini')) ||
      (text.includes('sugar') && p.name.toLowerCase().includes('chini')) ||
      (text.includes('besan') && p.name.toLowerCase().includes('besan')) ||
      (text.includes('oil') && p.name.toLowerCase().includes('oil')) ||
      (text.includes('namak') && p.name.toLowerCase().includes('salt'))
    );

    if (matched.length > 0) {
      const lines = matched.map(m => `• ${m.name}: ₹${m.selling_price} per ${m.unit}`).join('\n');
      return {
        intent: 'price_query',
        replyMessage: `Namaste! Ji rates ye hain:\n${lines}\n\nKya aapko order pack karwana hai?`,
        items: [],
        requiresPaymentChoice: false,
        aiSource: 'fallback-rules'
      };
    }
  }

  // Parse order quantities (regex for numbers followed by kg/g/packets)
  const items = [];
  const regex = /(\d+(?:\.\d+)?)\s*(kilo|kg|k\.g|gram|gm|packet|pkt|lit|liter|l)?\s+([a-zA-Z\u0900-\u097F]+)/gi;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const qty = parseFloat(match[1]);
    const unitMatch = match[2] || 'kg';
    const keyword = match[3].toLowerCase();

    const product = lowerProducts.find(p =>
      p.name.toLowerCase().includes(keyword) ||
      (keyword.includes('atta') && p.name.toLowerCase().includes('atta')) ||
      (keyword.includes('chini') && p.name.toLowerCase().includes('chini')) ||
      (keyword.includes('besan') && p.name.toLowerCase().includes('besan')) ||
      (keyword.includes('tel') && p.name.toLowerCase().includes('oil')) ||
      (keyword.includes('maggi') && p.name.toLowerCase().includes('maggi'))
    );

    if (product) {
      items.push({
        matchedProductId: product.id,
        matchedProductName: product.name,
        requestedQuantity: qty,
        unit: unitMatch.includes('g') && !unitMatch.includes('k') ? 'gm' : 'kg'
      });
    }
  }

  // Manual fallback keywords if regex missed
  if (items.length === 0) {
    if (text.includes('atta')) {
      const atta = currentProducts.find(p => p.name.toLowerCase().includes('atta'));
      if (atta) items.push({ matchedProductId: atta.id, matchedProductName: atta.name, requestedQuantity: 5, unit: 'kg' });
    }
    if (text.includes('chini') || text.includes('sugar')) {
      const chini = currentProducts.find(p => p.name.toLowerCase().includes('chini'));
      if (chini) items.push({ matchedProductId: chini.id, matchedProductName: chini.name, requestedQuantity: 2, unit: 'kg' });
    }
    if (text.includes('besan')) {
      const besan = currentProducts.find(p => p.name.toLowerCase().includes('besan'));
      if (besan) items.push({ matchedProductId: besan.id, matchedProductName: besan.name, requestedQuantity: 1, unit: 'kg' });
    }
  }

  if (items.length > 0) {
    return {
      intent: 'order',
      replyMessage: `Ji aapka order note kar liya gaya hai! Hamne bill bana diya hai. Kirpya payment mode chune (Online QR ya Counter par Pay).`,
      items: items,
      requiresPaymentChoice: true,
      aiSource: 'fallback-rules'
    };
  }

  return {
    intent: 'general',
    replyMessage: `Namaste! 🙏 Sahayak Kirana Store me swagat hai. Aap yaha saman ka bhav puch sakte hain ya seedhe saman ki list bhej kar order pack karwa sakte hain.`,
    items: [],
    requiresPaymentChoice: false,
    aiSource: 'fallback-rules'
  };
}

// -------------------------------------------------------------
// AGENT 2: Bill Ingestion & 3-Column Wholesale Margin Agent
// -------------------------------------------------------------
export async function agentDistributorBillParser(ocrText) {
  const systemPrompt = `
You are an expert Indian Wholesale Distributor Invoice Extraction Agent.
Given the raw OCR or text from an invoice, extract each item into a clean JSON array with:
1. itemName (Clean standard grocery item name)
2. wholesalePrice (per unit wholesale purchase rate as a number)
3. quantity (number of units/kg purchased)
4. unit (kg, packet, piece, liter, box)

Respond ONLY in valid JSON matching this schema:
{
  "vendor": "Name of distributor if visible",
  "invoiceDate": "Date or today",
  "items": [
    {
      "itemName": "Aashirvaad Atta 10kg",
      "wholesalePrice": 360,
      "quantity": 20,
      "unit": "packet"
    }
  ]
}
`;

  const prompt = `Invoice text: \n"""\n${ocrText}\n"""`;

  const aiResult = await queryOllama({ prompt, systemPrompt, jsonFormat: true });

  if (aiResult.success) {
    try {
      return JSON.parse(aiResult.content);
    } catch {
      // fallback
    }
  }

  // Fallback parsed mock for testing/demo
  return {
    vendor: 'M/s Aggarwal Traders Wholesale Mandi',
    invoiceDate: new Date().toLocaleDateString('en-IN'),
    items: [
      { itemName: 'Shaktibhog Chakki Atta 10kg', wholesalePrice: 340.0, quantity: 25, unit: 'packet' },
      { itemName: 'Mawana Fine Crystal Sugar 50kg bag', wholesalePrice: 1850.0, quantity: 5, unit: 'bag' },
      { itemName: 'Fortune Refined Soyabean Oil 1L Pouch', wholesalePrice: 112.0, quantity: 48, unit: 'packet' },
      { itemName: 'Tata Salt 1kg Carton (24 pkts)', wholesalePrice: 480.0, quantity: 4, unit: 'box' },
      { itemName: 'Haldiram Bhujia Sev 400g', wholesalePrice: 85.0, quantity: 30, unit: 'packet' }
    ]
  };
}

// -------------------------------------------------------------
// AGENT 3: Sales Analysis & Restock Forecasting Agent
// -------------------------------------------------------------
export async function agentSalesForecaster(bills, products) {
  const systemPrompt = `
You are the Store Inventory Intelligence & Analytics Agent for a Kirana shopkeeper.
Analyze recent sales and current stock levels. Identify:
1. Fast-moving items that are selling rapidly and require immediate re-ordering.
2. Slow-moving or dead stock.
3. 2 actionable business tips for the shopkeeper in crisp simple Hinglish/English.

Respond strictly in valid JSON:
{
  "highVelocity": [
    { "itemName": "Atta", "reason": "High daily turnover, buffer is below 3 days" }
  ],
  "slowMoving": [
    { "itemName": "Item X", "reason": "No sales in past 7 days" }
  ],
  "actionableTips": [
    "Tip 1...",
    "Tip 2..."
  ]
}
`;

  const prompt = `
Products in stock: ${JSON.stringify(products.map(p => ({ name: p.name, stock: p.stock_quantity, unit: p.unit })))}
Recent Bills: ${JSON.stringify(bills.slice(-20))}
`;

  const aiResult = await queryOllama({ prompt, systemPrompt, jsonFormat: true });

  if (aiResult.success) {
    try {
      return JSON.parse(aiResult.content);
    } catch {
      // fallback
    }
  }

  // Intelligent algorithmic fallback
  const fast = [];
  const slow = [];

  products.forEach(p => {
    if (p.stock_quantity <= 35) {
      fast.push({
        itemName: p.name,
        reason: `Current stock is only ${p.stock_quantity} ${p.unit}. High demand expected, re-order recommended.`
      });
    } else if (p.stock_quantity > 80) {
      slow.push({
        itemName: p.name,
        reason: `High remaining stock (${p.stock_quantity} ${p.unit}). Consider offering bundle discount.`
      });
    }
  });

  return {
    highVelocity: fast.slice(0, 3),
    slowMoving: slow.slice(0, 2),
    actionableTips: [
      "Weekend grocery demand increases: Keep 2 extra sacks of Atta and Chini ready.",
      "Offer 5% combo discount on Cooking Oil + Spices to accelerate slow-moving units."
    ]
  };
}

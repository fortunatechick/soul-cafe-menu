const BASE = process.env.NEXT_PUBLIC_API_URL || '';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    throw new Error(payload?.error || `Request failed (${res.status})`);
  }
  return payload;
}

export function fetchMenu() {
  return request('/api/menu');
}

export function placeOrder(order) {
  return request('/api/orders/place', {
    method: 'POST',
    body: JSON.stringify(order),
  });
}

export function verifyOrder(orderNumber) {
  return request(`/api/orders/verify/${encodeURIComponent(orderNumber)}`);
}

export const formatINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

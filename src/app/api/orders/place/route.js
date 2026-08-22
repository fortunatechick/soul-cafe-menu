import menu from '@/data/menu.json';
import { generateOrderNumber, saveOrder } from '@/lib/store';
import { pushToPetPooja } from '@/lib/petpooja';
import { evaluateCoupon } from '@/lib/coupons';

export const dynamic = 'force-dynamic';

// Delivery is free. The charge is kept as a field (at zero) because the order
// shape feeds PetPooja's delivery_charges, and to make reinstating it one edit.
const DELIVERY_CHARGE = 0;
const PAYMENT_METHODS = ['upi', 'cash', 'card'];
const ORDER_TYPES = ['delivery', 'pickup'];

// Flat lookup of every orderable item, built once per instance.
const ITEMS = new Map();
for (const category of menu.categories) {
  for (const item of category.items) {
    ITEMS.set(item.id, { ...item, category: category.name });
  }
}

const bad = (error) => Response.json({ error }, { status: 400 });

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return bad('Malformed request body.');
  }

  const customerName = String(body.customerName || '').trim();
  const customerPhone = String(body.customerPhone || '').replace(/[^\d+]/g, '');
  const customerAddress = String(body.customerAddress || '').trim();
  const notes = String(body.notes || '').trim().slice(0, 500);
  const orderType = ORDER_TYPES.includes(body.orderType) ? body.orderType : null;
  const paymentMethod = PAYMENT_METHODS.includes(body.paymentMethod) ? body.paymentMethod : null;

  if (customerName.length < 2) return bad('Please enter your name.');
  if (!/^\+?\d{10,13}$/.test(customerPhone)) return bad('Please enter a valid phone number.');
  if (!orderType) return bad('Please choose delivery or pickup.');
  if (!paymentMethod) return bad('Please choose a payment method.');
  if (orderType === 'delivery' && customerAddress.length < 10) {
    return bad('Please enter a delivery address.');
  }
  if (!Array.isArray(body.items) || body.items.length === 0) return bad('Your cart is empty.');

  // Re-price everything from the server's copy of the menu — client prices are ignored.
  const items = [];
  for (const line of body.items) {
    const item = ITEMS.get(line.menuItemId);
    if (!item) return bad(`"${line.itemName || 'An item'}" is no longer on the menu.`);
    if (item.available === false) return bad(`"${item.name}" is currently unavailable.`);
    if (orderType === 'delivery' && item.deliveryAvailable === false) {
      return bad(`"${item.name}" is available for pickup only.`);
    }

    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      return bad(`Invalid quantity for "${item.name}".`);
    }

    let unitPrice = item.price;
    let variation = null;
    // Each size is its own PetPooja item, so the chosen one carries the id
    // the POS must be sent.
    let posItemId = item.id;
    if (item.variations?.length) {
      const match = item.variations.find((v) => v.name === line.variation);
      if (!match) return bad(`Please pick an option for "${item.name}".`);
      unitPrice = match.price;
      variation = match.name;
      posItemId = match.id;
    }

    items.push({
      menuItemId: item.id,
      posItemId,
      itemName: item.name,
      posShortCode: item.posShortCode || '',
      category: item.category,
      variation,
      unitPrice,
      quantity,
      lineTotal: unitPrice * quantity,
    });
  }

  const subtotal = items.reduce((n, it) => n + it.lineTotal, 0);
  const deliveryCharge = orderType === 'delivery' ? DELIVERY_CHARGE : 0;

  // The coupon is re-evaluated here against the server's own subtotal. Whatever
  // discount the browser thinks it earned is ignored entirely.
  let discount = 0;
  let couponCode = null;
  if (body.couponCode) {
    const result = evaluateCoupon(body.couponCode, { subtotal, orderType });
    if (!result.ok) return bad(result.message);
    discount = result.discount;
    couponCode = result.coupon.code;
  }

  const total = Math.max(0, subtotal - discount + deliveryCharge);

  const order = {
    orderNumber: generateOrderNumber(),
    placedAt: new Date().toISOString(),
    status: 'placed',
    customerName,
    customerPhone,
    customerAddress: orderType === 'delivery' ? customerAddress : '',
    orderType,
    paymentMethod,
    notes,
    items,
    subtotal,
    discount,
    couponCode,
    deliveryCharge,
    total,
  };

  const pos = await pushToPetPooja(order);
  order.pos = pos;
  saveOrder(order);

  return Response.json({ order }, { status: 201 });
}

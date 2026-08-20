/**
 * PetPooja push adapter — placeholder.
 *
 * The POS integration is not wired up yet. `pushToPetPooja` builds the payload
 * in PetPooja's save_order shape and, when credentials are present in the
 * environment, POSTs it. Without credentials it is a no-op that reports
 * `skipped`, so order placement still succeeds end to end.
 *
 * When the integration is turned on, verify the field names against the
 * PetPooja account's current API docs — they version the order schema.
 */

const PAYMENT_CODE = {
  // PetPooja expects its own payment type ids; these are placeholders.
  upi: { type: 2, label: 'UPI (online)' },
  card: { type: 3, label: 'Card on delivery' },
  cash: { type: 1, label: 'Cash on delivery' },
};

export function buildPetPoojaPayload(order) {
  return {
    app_key: process.env.PETPOOJA_APP_KEY || '',
    app_secret: process.env.PETPOOJA_APP_SECRET || '',
    access_token: process.env.PETPOOJA_ACCESS_TOKEN || '',
    orderinfo: {
      OrderInfo: {
        Restaurant: {
          details: {
            res_name: 'SOUL',
            restID: process.env.PETPOOJA_RESTAURANT_ID || '388482',
          },
        },
        Customer: {
          details: {
            email: '',
            name: order.customerName,
            address: order.customerAddress || '',
            phone: order.customerPhone,
          },
        },
        Order: {
          details: {
            orderID: order.orderNumber,
            preorder_date: '',
            preorder_time: '',
            service_charge: '0',
            delivery_charges: String(order.deliveryCharge),
            order_type: order.orderType === 'delivery' ? 'H' : 'P', // H = home delivery, P = pickup
            ondc_bap: '',
            advanced_order: 'N',
            payment_type: PAYMENT_CODE[order.paymentMethod]?.type ?? 1,
            table_no: '',
            no_of_persons: '0',
            discount_total: '0',
            tax_total: '0',
            discount_type: '',
            total: String(order.total),
            description: order.notes || '',
            created_on: order.placedAt,
            enable_delivery: order.orderType === 'delivery' ? 1 : 0,
            min_prep_time: 20,
            callback_url: '',
            collect_cash: order.paymentMethod === 'cash' ? String(order.total) : '0',
            otp: '',
          },
        },
        OrderItem: {
          details: order.items.map((it, i) => ({
            id: it.posShortCode || it.menuItemId,
            name: it.itemName,
            gst_liability: 'restaurant',
            item_tax: [],
            item_discount: '0',
            price: String(it.unitPrice),
            final_price: String(it.unitPrice * it.quantity),
            quantity: String(it.quantity),
            description: it.variation || '',
            variation_name: it.variation || '',
            variation_id: '',
            AddonItem: { details: [] },
            item_order: i + 1,
          })),
        },
        Tax: { details: [] },
        Discount: { details: [] },
      },
    },
  };
}

export async function pushToPetPooja(order) {
  const url = process.env.PETPOOJA_ORDER_API_URL;
  const configured = url && process.env.PETPOOJA_APP_KEY && process.env.PETPOOJA_ACCESS_TOKEN;

  if (!configured) {
    return { status: 'skipped', reason: 'PetPooja credentials not configured' };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPetPoojaPayload(order)),
    });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      return { status: 'failed', reason: `POS returned ${res.status}`, body };
    }
    return { status: 'sent', body };
  } catch (err) {
    return { status: 'failed', reason: err.message };
  }
}

export const paymentLabel = (method) => PAYMENT_CODE[method]?.label || method;

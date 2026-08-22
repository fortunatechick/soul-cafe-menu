import './globals.css';
import { CartProvider } from '@/context/CartContext';

export const metadata = {
  title: 'Soul — Order from Soul Café',
  description:
    'Browse the menu and order from Soul — Speciality Coffees & Fusion Bakehouse.',
  keywords: 'soul cafe, coffee, bakehouse, menu, order, whatsapp',
  icons: { icon: '/icon.png', apple: '/icon.png' },
  appleWebApp: {
    capable: true,
    title: 'Soul',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0d2233',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}

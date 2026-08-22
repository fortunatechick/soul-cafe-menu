import './globals.css';
import { CartProvider } from '@/context/CartContext';

const TITLE = 'Soul — Order from Soul Café';
const DESCRIPTION =
  'Browse the menu and order from Soul — Speciality Coffees & Fusion Bakehouse.';

// og:image has to be an absolute URL, so the deployed origin must be known at
// build time. Vercel injects VERCEL_URL; set NEXT_PUBLIC_SITE_URL once a custom
// domain is attached, since VERCEL_URL points at the per-deployment hostname.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: 'soul cafe, coffee, bakehouse, menu, order, whatsapp',
  // opengraph-image.jpg sits beside this file; Next picks it up by convention
  // and fills in the url, dimensions and mime type.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: 'Soul',
    url: '/',
    type: 'website',
    locale: 'en_IN',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
  icons: { icon: '/soul-logo-bgreemoved-upscaled.png', apple: '/soul-logo-bgreemoved-upscaled.png' },
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

import './globals.css';
import { CartProvider } from '@/context/CartContext';
import { GroupProvider } from '@/context/GroupContext';

const TITLE = 'Soul — Order from Soul Café';
const DESCRIPTION =
  'Browse the menu and order from Soul — Speciality Coffees & Fusion Bakehouse.';

// og:image has to be an absolute URL, so the deployed origin must be known at
// build time — and it has to be the *stable* one. VERCEL_URL is deliberately
// not used: it is the per-deployment hostname, which changes on every push,
// and link previews are cached per URL. VERCEL_PROJECT_PRODUCTION_URL is the
// production domain; NEXT_PUBLIC_SITE_URL overrides it for a custom domain.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'https://soul-cafe-menu.vercel.app');

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
        <CartProvider>
          <GroupProvider>{children}</GroupProvider>
        </CartProvider>
      </body>
    </html>
  );
}

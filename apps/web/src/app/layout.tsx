import type { Metadata, Viewport } from 'next';
import { Inter, IBM_Plex_Sans_Thai } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const ibmThai = IBM_Plex_Sans_Thai({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['thai', 'latin'],
  variable: '--font-thai',
});

export const metadata: Metadata = {
  title: 'POS System',
  description: 'Modern Cloud POS for cafes, restaurants and retail',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#7C4DFF',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${ibmThai.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

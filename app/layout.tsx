import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SMV Logistics Console',
  description: 'Scan passports, search orders, update statuses',
  manifest: '/manifest.json',
  themeColor: '#101114',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}

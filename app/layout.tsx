// app/layout.tsx
import './globals.css';

export const metadata = {
  title: 'SMV Logistics Console',
  description: 'Internal logistics PWA',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0"
      />
      <body>{children}</body>
    </html>
  );
}

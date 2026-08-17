import './globals.css';

export const metadata = {
  title: 'Daily News',
  description: 'Editorial discovery engine for local news with national breakout potential',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
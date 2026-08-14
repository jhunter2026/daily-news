export const metadata = {
  title: 'Daily News',
  description: 'Editorial discovery engine for local news with national breakout potential',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'Georgia, serif', background: '#f7f5f0' }}>
        {children}
      </body>
    </html>
  );
}
import './globals.css';

export const metadata = {
  title: 'Video Finder Bot',
  description: 'Find the right founder video to share with each prospect.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

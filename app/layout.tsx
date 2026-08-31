import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://sarmad-company-os.openai.site'),
  title: 'Sarmad OS · Founder Command Center',
  description: 'A private AI sales command center for Sarmad Irfan.',
  openGraph: {
    title: 'Sarmad OS',
    description: 'AI Sales Command Center',
    images: [{ url: '/og.png', width: 1730, height: 909, alt: 'Sarmad OS — AI Sales Command Center' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sarmad OS',
    description: 'AI Sales Command Center',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

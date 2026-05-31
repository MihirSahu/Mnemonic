import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mnemonic Admin',
  description: 'Admin console for the Personal Memory MCP server'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}


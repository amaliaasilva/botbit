import "./globals.css";

export const metadata = {
  title: "BotBit",
  description: "Scoring BTC + B3",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

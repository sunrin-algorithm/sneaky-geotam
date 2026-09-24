import "./globals.css";

export const metadata = {
  title: "LIE DETECTOR",
  description: "축제 거짓말탐지기 박제 서비스",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
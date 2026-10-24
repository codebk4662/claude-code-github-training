import type { Metadata, Viewport } from "next";
import "@xyflow/react/dist/style.css";
import "@mm/ui/styles.css";

export const metadata: Metadata = {
  title: "회의 마인드맵",
  description: "대면 회의를 녹음하며 화자별 자막, 실시간 마인드맵, 자동 회의록을 만듭니다.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4f46e5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

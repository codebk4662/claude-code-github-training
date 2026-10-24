import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "회의 마인드맵",
    short_name: "회의맵",
    description: "대면 회의 녹음 → 화자별 자막 → 실시간 마인드맵 → 자동 회의록",
    start_url: "/",
    display: "standalone",
    background_color: "#111215",
    theme_color: "#4f46e5",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/captions": [
      "./node_modules/ffmpeg-static/**",
      "./node_modules/@ffmpeg-installer/ffmpeg/**",
    ],
    "/api/captions/burn": [
      "./node_modules/ffmpeg-static/**",
      "./node_modules/@ffmpeg-installer/ffmpeg/**",
    ],
    "/api/youtube/highlights": [
      "./node_modules/ffmpeg-static/**",
      "./node_modules/@ffmpeg-installer/ffmpeg/**",
      "./bin/yt-dlp",
    ],
    "/api/youtube/clip": [
      "./node_modules/ffmpeg-static/**",
      "./node_modules/@ffmpeg-installer/ffmpeg/**",
    ],
    "/api/ffmpeg-status": [
      "./node_modules/ffmpeg-static/**",
      "./node_modules/@ffmpeg-installer/ffmpeg/**",
    ],
    "/api/cv-admin/auto-combo": [
      "./node_modules/ffmpeg-static/**",
      "./node_modules/@ffmpeg-installer/ffmpeg/**",
      "./node_modules/@ffmpeg-installer/linux-x64/**",
      "./node_modules/@ffmpeg-installer/linux-arm64/**",
    ],
  },
};

export default nextConfig;

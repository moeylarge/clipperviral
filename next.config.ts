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
    ],
    "/api/youtube/clip": [
      "./node_modules/ffmpeg-static/**",
      "./node_modules/@ffmpeg-installer/ffmpeg/**",
    ],
    "/api/ffmpeg-status": [
      "./node_modules/ffmpeg-static/**",
      "./node_modules/@ffmpeg-installer/ffmpeg/**",
    ],
  },
};

export default nextConfig;

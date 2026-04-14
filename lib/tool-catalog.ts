export type DashboardTool = {
  id: "editor" | "kick" | "captions" | "youtube";
  label: string;
  shortLabel: string;
  href: string;
  routeSlug: string;
  description: string;
  status: string;
  steps: string[];
  checks: string[];
  eta: string;
};

export const dashboardTools: DashboardTool[] = [
  {
    id: "editor",
    label: "Unified Clip Editor",
    shortLabel: "Editor",
    href: "/editor.html",
    routeSlug: "unified-editor",
    description:
      "The main step-by-step workflow: choose source, pick vertical or horizontal layout, add captions, then export.",
    status: "Primary",
    steps: [
      "Upload a local video or generate candidates from a YouTube/Kick URL",
      "Choose vertical or horizontal layout",
      "Add Kick elements and captions",
      "Preview and download the finished clip",
    ],
    checks: ["Upload and URL entry points", "Live layout preview", "Composed final export"],
    eta: "~5 min",
  },
  {
    id: "kick",
    label: "Kick Template",
    shortLabel: "Kick",
    href: "/kick-template.html",
    routeSlug: "kick-template",
    description: "Format stream clips fast with reusable Kick-first layout controls.",
    status: "Template",
    steps: ["Upload source clip", "Tune title, framing, and layout", "Preview and export"],
    checks: ["Readable title safe area", "Brand-safe framing", "Download output"],
    eta: "~2 min",
  },
  {
    id: "captions",
    label: "Caption Studio",
    shortLabel: "Captions",
    href: "/caption-template.html",
    routeSlug: "caption-studio",
    description: "Generate captions, style subtitles, and export social-ready edits.",
    status: "Captions",
    steps: ["Upload video", "Generate and style captions", "Export subtitle or MP4"],
    checks: ["Timing quality", "Style consistency", "Correct output format"],
    eta: "~4 min",
  },
  {
    id: "youtube",
    label: "YouTube AI Clips",
    shortLabel: "YouTube AI",
    href: "/format-template.html#youtube-auto-highlights",
    routeSlug: "youtube-ai-clips",
    description: "Paste a URL and get ranked AI clip candidates with quick export.",
    status: "URL tool",
    steps: ["Paste YouTube or Kick URL", "Run AI candidate generation", "Preview and download winners"],
    checks: ["Valid source URL", "Ranked candidate quality", "Clip download pass"],
    eta: "~5-10 min",
  },
];

export function resolveToolBySlug(showId: string) {
  return dashboardTools.find((tool) => tool.routeSlug === showId) ?? dashboardTools[0];
}

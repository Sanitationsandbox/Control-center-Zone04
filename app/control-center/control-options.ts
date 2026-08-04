import type { MediaGroupSlug } from "@/lib/media";

export type GroupCopy = {
  label: string;
  shortName: string;
  tagline: string;
};

// Only the built-in fields need custom copy; dynamically added fields fall
// back to their own displayName (see ControlCenter.tsx's toOptions).
export const groupCopy: Partial<Record<MediaGroupSlug, GroupCopy>> = {
  bhrt: {
    label: "BHRT",
    shortName: "BHRT",
    tagline: "Community-led sanitation. Lasting impact.",
  },
  video: {
    label: "Video",
    shortName: "Video",
    tagline: "Portable treatment. Lasting impact.",
  },
  "what-lies-inside": {
    label: "What lies inside?",
    shortName: "What lies inside?",
    tagline: "Onsite treatment. Lasting impact.",
  },
  "use-case": {
    label: "USE CASE",
    shortName: "USE CASE",
    tagline: "Independent treatment. Lasting impact.",
  },
};

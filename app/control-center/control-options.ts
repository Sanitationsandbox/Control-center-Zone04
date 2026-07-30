import type { MediaGroupSlug } from "@/lib/media";

export type GroupCopy = {
  label: string;
  shortName: string;
  tagline: string;
};

export const groupCopy: Record<MediaGroupSlug, GroupCopy> = {
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

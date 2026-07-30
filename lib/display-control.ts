import type { MediaGroupResponse } from "./media";

export type NavigateDirection = "previous" | "next";
export type PlaybackCommand = "play" | "pause";

export type DisplayControlResponse = {
  activeGroupId: string | null;
  videoPlaying: boolean;
  updatedAt: number;
  groups: MediaGroupResponse[];
};

import type { MediaGroupResponse } from "./media";

export type NavigateDirection = "previous" | "next";
export type PlaybackCommand = "play" | "pause";

export type DisplayControlResponse = {
  /**
   * Monotonic counter from the control_state_version sequence. Clients discard
   * any snapshot older than the newest one they have already applied, which is
   * what keeps an out-of-order delivery from rolling a wall backwards.
   */
  version: number;
  activeGroupId: string | null;
  videoPlaying: boolean;
  updatedAt: number;
  groups: MediaGroupResponse[];
};

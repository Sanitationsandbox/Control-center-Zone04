"use client";

import { useCallback, useEffect, useState } from "react";
import type { DisplayControlResponse } from "@/lib/display-control";
import styles from "../preview.module.css";
import { ImageViewer } from "./ImageViewer";
import { VideoViewer } from "./VideoViewer";

const initialState: DisplayControlResponse = {
  activeGroupId: null,
  videoPlaying: false,
  updatedAt: 0,
  groups: [],
};

export function PreviewWall() {
  const [state, setState] = useState<DisplayControlResponse>(initialState);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/display-control", { cache: "no-store" });
      if (!response.ok) throw new Error("State request failed");
      setState((await response.json()) as DisplayControlResponse);
    } catch {
      // Ignore API offline errors silently
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 700);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const activeGroup = state.groups.find((group) => group.id === state.activeGroupId);

  return (
    <main className={styles.wall}>
      {activeGroup?.controlKind === "VIDEO" ? (
        <VideoViewer
          src={
            (activeGroup.items.find((item) => item.id === activeGroup.activeItemId) ??
              activeGroup.items[0])?.asset.url ?? ""
          }
          playing={state.videoPlaying}
        />
      ) : activeGroup?.controlKind === "PAGE_SEQUENCE" ? (
        <ImageViewer
          items={activeGroup.items.filter((item) => item.enabled)}
          activeItemId={activeGroup.activeItemId}
          label={activeGroup.slug}
        />
      ) : (
        <PreviewSplash />
      )}
    </main>
  );
}

function PreviewSplash() {
  return (
    <section className={styles.splash} aria-label="Rubenius idle screen">
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
      >
        <source src="/BG-VIDEO/Gates%20zone%201.0%20updated.mp4" type="video/mp4" />
      </video>
    </section>
  );
}

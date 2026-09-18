"use client";

import { useControlSocket } from "@/lib/use-control-socket";
import styles from "../preview.module.css";
import { ImageViewer } from "./ImageViewer";
import { VideoViewer } from "./VideoViewer";

export function PreviewWall() {
  const { state } = useControlSocket();
  const activeGroup = state?.groups.find((group) => group.id === state.activeGroupId);

  return (
    <main className={styles.wall}>
      {activeGroup?.controlKind === "VIDEO" ? (
        <VideoViewer
          src={
            (activeGroup.items.find((item) => item.id === activeGroup.activeItemId) ??
              activeGroup.items[0])?.asset.url ?? ""
          }
          playing={state?.videoPlaying ?? false}
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

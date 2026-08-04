"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DisplayControlResponse, NavigateDirection, PlaybackCommand } from "@/lib/display-control";
import type { MediaGroupResponse, MediaGroupSlug } from "@/lib/media";
import { groupCopy } from "../control-options";
import styles from "../control-center.module.css";
import { ControlCard } from "./ControlCard";
import { DetailScreen } from "./DetailScreen";

export type ControlOption = {
  id: string;
  slug: MediaGroupSlug;
  label: string;
  shortName: string;
  tagline: string;
  controlKind: MediaGroupResponse["controlKind"];
};

type ControlCenterProps = {
  initialGroups: MediaGroupResponse[];
  initialActiveGroupId: string | null;
  initialVideoPlaying: boolean;
};

function toOptions(groups: MediaGroupResponse[]): ControlOption[] {
  return groups.map((group) => {
    const copy = groupCopy[group.slug as MediaGroupSlug];

    return {
      id: group.id,
      slug: group.slug as MediaGroupSlug,
      controlKind: group.controlKind,
      label: copy?.label ?? group.displayName,
      shortName: copy?.shortName ?? group.displayName,
      tagline: copy?.tagline ?? "Dedicated content pipeline.",
    };
  });
}

export function ControlCenter({
  initialGroups,
  initialActiveGroupId,
  initialVideoPlaying,
}: ControlCenterProps) {
  const [groups, setGroups] = useState(initialGroups);
  const [activeGroupId, setActiveGroupId] = useState(initialActiveGroupId);
  const [, setVideoPlaying] = useState(initialVideoPlaying);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState("");
  const isSendingRef = useRef(false);

  const applyState = useCallback((data: DisplayControlResponse) => {
    setGroups(data.groups);
    setActiveGroupId(data.activeGroupId);
    setVideoPlaying(data.videoPlaying);
  }, []);

  const refresh = useCallback(async () => {
    if (isSendingRef.current) return;

    try {
      const response = await fetch("/api/display-control", { cache: "no-store" });
      if (!response.ok) throw new Error("State request failed");
      applyState((await response.json()) as DisplayControlResponse);
    } catch {
      // Ignore API offline errors silently
    }
  }, [applyState]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 700);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const options = toOptions(groups);
  const selectedOption = options.find((option) => option.id === activeGroupId) ?? null;

  async function send(body: unknown, pendingStatus: string, errorStatus: string) {
    isSendingRef.current = true;
    setIsSending(true);
    setStatus(pendingStatus);

    try {
      const response = await fetch("/api/display-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error("Command failed");
      applyState((await response.json()) as DisplayControlResponse);
      setStatus("");
    } catch {
      setStatus(errorStatus);
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  }

  async function selectOption(option: ControlOption) {
    if (isSending) return;
    await send({ action: "activate", groupId: option.id }, "Opening…", "Unable to open preview");
  }

  async function sendCommand(direction: NavigateDirection) {
    if (!selectedOption || isSending) return;
    await send({ action: "navigate", direction }, "Sending…", "Unable to reach preview");
  }

  async function closePreview() {
    if (isSending) return;
    await send({ action: "clear" }, "Closing…", "Unable to close preview");
  }

  async function sendPlayback(playback: PlaybackCommand) {
    if (!selectedOption || isSending) return;
    await send(
      { action: "playback", playback },
      playback === "play" ? "Playing…" : "Pausing…",
      "Unable to control video",
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />
      {selectedOption ? (
        <DetailScreen
          option={selectedOption}
          isSending={isSending}
          status={status}
          onNavigate={sendCommand}
          onPlayback={sendPlayback}
          onBack={closePreview}
        />
      ) : (
        <section
          className={`${styles.controls} ${options.length > 4 ? styles.controlsMultiRow : ""}`}
          aria-label="Treatment options"
        >
          {options.map((option) => (
            <ControlCard
              key={option.id}
              option={option}
              onSelect={() => void selectOption(option)}
            />
          ))}
          {status ? (
            <p className={styles.selectionStatus} aria-live="polite">
              {status}
            </p>
          ) : null}
        </section>
      )}
    </main>
  );
}

"use client";

import { useState } from "react";
import type {
  DisplayControlResponse,
  NavigateDirection,
  PlaybackCommand,
} from "@/lib/display-control";
import type { MediaGroupResponse, MediaGroupSlug } from "@/lib/media";
import { broadcastLocalControlState, useControlSocket } from "@/lib/use-control-socket";
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
  initialState: DisplayControlResponse;
};

function toOptions(groups: MediaGroupResponse[]): ControlOption[] {
  const options: ControlOption[] = [];

  for (const group of groups) {
    const copy = groupCopy[group.slug as MediaGroupSlug];
    if (!copy) continue;

    options.push({
      id: group.id,
      slug: group.slug as MediaGroupSlug,
      controlKind: group.controlKind,
      ...copy,
    });
  }

  return options;
}

export function ControlCenter({ initialState }: ControlCenterProps) {
  const { state, status: socketStatus } = useControlSocket(initialState);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState("");

  const options = toOptions(state?.groups ?? []);
  const activeGroupId = state?.activeGroupId ?? null;
  const selectedOption = options.find((option) => option.id === activeGroupId) ?? null;

  async function send(body: unknown, pendingStatus: string, errorStatus: string) {
    setIsSending(true);
    setStatus(pendingStatus);

    try {
      const response = await fetch("/api/display-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error("Command failed");

      // The socket delivers this to every wall; the local broadcast is what makes
      // a preview tab on this same device update instantly in development, where
      // there is no socket at all.
      broadcastLocalControlState((await response.json()) as DisplayControlResponse);
      setStatus("");
    } catch {
      setStatus(errorStatus);
    } finally {
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
      {socketStatus === "connected" ? null : (
        <p className={styles.connection} role="status">
          {socketStatus === "connecting" ? "Connecting…" : "Reconnecting…"}
        </p>
      )}
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
        <section className={styles.controls} aria-label="Treatment options">
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

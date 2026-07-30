import type { NavigateDirection, PlaybackCommand } from "@/lib/display-control";
import type { ControlOption } from "./ControlCenter";
import styles from "../control-center.module.css";

type DetailScreenProps = {
  option: ControlOption;
  isSending: boolean;
  status: string;
  onNavigate: (direction: NavigateDirection) => void;
  onPlayback: (playback: PlaybackCommand) => void;
  onBack: () => void;
};

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={styles.chevron}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.playbackIcon}>
      <path d="M8 5v14l11-7z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.playbackIcon}>
      <path d="M7 5h4v14H7zm6 0h4v14h-4z" fill="currentColor" />
    </svg>
  );
}

export function DetailScreen({
  option,
  isSending,
  status,
  onNavigate,
  onPlayback,
  onBack,
}: DetailScreenProps) {
  return (
    <section className={styles.detail} aria-labelledby="detail-title">
      <button
        type="button"
        className={styles.backButton}
        disabled={isSending}
        onClick={onBack}
      >
        Back
      </button>

      <div className={styles.detailContent}>
        <h1 id="detail-title">{option.shortName}</h1>
        <p>{option.tagline}</p>
        {option.controlKind === "VIDEO" ? (
          <div className={styles.pdfControls} aria-label="Video playback">
            <button
              type="button"
              aria-label="Play video"
              disabled={isSending}
              onClick={() => onPlayback("play")}
            >
              <PlayIcon />
            </button>
            <button
              type="button"
              aria-label="Pause video"
              disabled={isSending}
              onClick={() => onPlayback("pause")}
            >
              <PauseIcon />
            </button>
          </div>
        ) : (
          <div className={styles.pdfControls} aria-label="Content navigation">
            <button
              type="button"
              aria-label="Previous item"
              disabled={isSending}
              onClick={() => onNavigate("previous")}
            >
              <Chevron direction="left" />
            </button>
            <button
              type="button"
              aria-label="Next item"
              disabled={isSending}
              onClick={() => onNavigate("next")}
            >
              <Chevron direction="right" />
            </button>
          </div>
        )}
        <p className={styles.commandStatus} aria-live="polite">
          {status}
        </p>
      </div>
    </section>
  );
}

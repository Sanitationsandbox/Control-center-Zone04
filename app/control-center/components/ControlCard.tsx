import type { ControlOption } from "./ControlCenter";
import styles from "../control-center.module.css";

type ControlCardProps = {
  option: ControlOption;
  onSelect: () => void;
};

export function ControlCard({ option, onSelect }: ControlCardProps) {
  return (
    <button type="button" className={styles.control} onClick={onSelect}>
      <span>{option.label}</span>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={styles.arrow}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 17 17 7" />
        <path d="M8 7h9v9" />
      </svg>
    </button>
  );
}

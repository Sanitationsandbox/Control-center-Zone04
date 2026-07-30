"use client";

import Image from "next/image";
import styles from "../preview.module.css";

type ImageItem = {
  id: string;
  asset: { url: string };
};

type ImageViewerProps = {
  items: ImageItem[];
  activeItemId: string | null;
  label: string;
};

export function ImageViewer({ items, activeItemId, label }: ImageViewerProps) {
  if (items.length === 0) return null;

  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === activeItemId),
  );
  const activeItem = items[activeIndex] ?? items[0];

  return (
    <section
      className={styles.imageViewer}
      aria-label={`${label} image ${activeIndex + 1} of ${items.length}`}
    >
      <div key={activeItem.id} className={styles.imageSlide}>
        <Image
          src={activeItem.asset.url}
          alt=""
          fill
          priority
          unoptimized
          sizes="100vw"
          className={styles.sequenceImage}
        />
      </div>
    </section>
  );
}

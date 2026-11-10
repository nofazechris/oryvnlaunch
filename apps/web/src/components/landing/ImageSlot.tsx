import type { CSSProperties } from "react";

interface ImageSlotProps {
  radius?: number;
  placeholder?: string;
  style?: CSSProperties;
}

/**
 * Placeholder for token/character art. In the design tool this is a drag-drop
 * <image-slot>; here it renders an empty, on-brand placeholder. In production these
 * carry creator-supplied token artwork from metadata storage.
 */
export function ImageSlot({ radius = 12, placeholder = "", style }: ImageSlotProps) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: radius,
        border: "1px dashed rgba(0,0,0,0.18)",
        background: "rgba(255,255,255,0.14)",
        display: "grid",
        placeItems: "center",
        color: "inherit",
        ...style,
      }}
    >
      {placeholder ? (
        <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.45, padding: 10, textAlign: "center" }}>
          {placeholder}
        </span>
      ) : null}
    </div>
  );
}

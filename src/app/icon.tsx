import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#6c5ce7",
          borderRadius: 14,
          color: "white",
          fontSize: 34,
          fontWeight: 700,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        F+
      </div>
    ),
    { ...size }
  );
}

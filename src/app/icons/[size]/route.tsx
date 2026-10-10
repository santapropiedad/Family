import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const px = Math.min(Math.max(parseInt(size, 10) || 192, 32), 1024);

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
          color: "white",
          fontSize: px * 0.5,
          fontWeight: 700,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        F+
      </div>
    ),
    { width: px, height: px }
  );
}

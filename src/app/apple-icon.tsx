import { ImageResponse } from "next/og";
import { getIconDataUrl } from "./icon-source";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={getIconDataUrl()} width={size.width} height={size.height} alt="" />
    ),
    { ...size }
  );
}

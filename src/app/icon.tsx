import { ImageResponse } from "next/og";
import { getIconDataUrl } from "./icon-source";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={getIconDataUrl()} width={size.width} height={size.height} alt="" />
    ),
    { ...size }
  );
}

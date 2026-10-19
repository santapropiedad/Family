import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { getIconDataUrl } from "../../icon-source";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const px = Math.min(Math.max(parseInt(size, 10) || 192, 32), 1024);

  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={getIconDataUrl()} width={px} height={px} alt="" />
    ),
    { width: px, height: px }
  );
}

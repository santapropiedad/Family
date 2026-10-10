import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Familia+",
    short_name: "Familia+",
    description: "El asistente inteligente que ayuda a tu familia a saber qué hacer hoy.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#6c5ce7",
    lang: "es-CL",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

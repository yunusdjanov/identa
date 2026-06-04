import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://identa.uz";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/api/",
          "/appointments/",
          "/billing/",
          "/dashboard/",
          "/forgot-password",
          "/login",
          "/patients/",
          "/payments/",
          "/register",
          "/reset-password",
          "/settings/",
          "/staff/",
          "/team/",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}

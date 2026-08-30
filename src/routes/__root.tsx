import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

const APP_NAME = "Helion";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      { name: "theme-color", content: "#08090c" },
      {
        name: "description",
        content:
          "Helion is a GPU particle laboratory — orbital mechanics, SPH fluids, boids, cloth, and a million-particle SoA compute pipeline.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__helion/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__helion/icon-180.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap",
      },
    ],
    scripts: [
      {
        children: `
          window.addEventListener('vite:preloadError', function(event) {
            console.warn('Vite preload error detected, refreshing page:', event);
            window.location.reload();
          });
          window.addEventListener('error', function(event) {
            if (event && event.message && event.message.includes('Importing a module script failed')) {
              console.warn('Recovering from module script import failure:', event.message);
              // Prevent noisy fatal alert if transient
            }
          });
        `,
      },
    ],
  }),
  component: () => (
    <html lang="en" className="dark antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-bg text-fg">
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Toaster theme="dark" position="bottom-right" richColors />
        <Scripts />
      </body>
    </html>
  ),
});

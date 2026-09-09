import { createFileRoute } from "@tanstack/react-router";
import { buildOEmbed, creationIdFromUrl } from "@/lib/embed/oembed";

/**
 * oEmbed provider endpoint: /api/oembed?url=<share-or-embed-url>&format=json
 * (Item 10). Given a Helion share (…/s/:id) or embed (…/embed/:id) URL, returns
 * the oEmbed "rich" JSON with an <iframe> pointing at the chromeless embed
 * player, so blogs/tweets/CMSes that support oEmbed can auto-unfurl a creation.
 *
 * Public + unauthed by design. It resolves the target id from the standard
 * oEmbed `url` param via the pure `creationIdFromUrl`, verifies the creation is
 * PUBLIC (never unfurls a private/unknown id → 404), then emits the payload
 * built by the pure `buildOEmbed`. `maxwidth`/`maxheight` are honored per spec.
 *
 * The DB check is a dynamic import inside the handler so the server-only
 * creations layer never enters the client bundle.
 */
async function handle({ request }: { request: Request }): Promise<Response> {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");
  const format = url.searchParams.get("format");

  // Only JSON is supported (no XML); an explicit non-json format is a 501 per spec.
  if (format && format.toLowerCase() !== "json") {
    return new Response("Only json format is supported", { status: 501 });
  }
  if (!target) {
    return new Response("Missing url parameter", { status: 400 });
  }

  const id = creationIdFromUrl(target);
  if (!id) {
    return new Response("Unrecognized url", { status: 404 });
  }

  // Only unfurl PUBLIC creations — a private/unknown id must not embed.
  let title = "Helion creation";
  try {
    const { getPublicCreation } = await import("@/lib/creations/server.ts");
    const creation = await getPublicCreation(id);
    if (!creation) {
      return new Response("Creation not found", { status: 404 });
    }
    title = creation.name || title;
  } catch {
    return new Response("Creation not found", { status: 404 });
  }

  const origin = url.origin;
  const maxwidth = Number(url.searchParams.get("maxwidth")) || undefined;
  const maxheight = Number(url.searchParams.get("maxheight")) || undefined;
  const payload = buildOEmbed(id, { title, origin, maxwidth, maxheight });

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

export const Route = createFileRoute("/api/oembed")({
  server: { handlers: { GET: handle } },
});

import { createFileRoute } from "@tanstack/react-router";
import { handleV1 } from "@/lib/dev-api/handle";

const handle = ({ request }: { request: Request }) => handleV1(request);

export const Route = createFileRoute("/api/v1/$")({
  server: { handlers: { GET: handle, POST: handle, OPTIONS: handle } },
});

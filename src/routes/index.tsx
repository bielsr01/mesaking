import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return <div className="min-h-screen bg-gradient-to-b from-white to-gray-400" />;
}

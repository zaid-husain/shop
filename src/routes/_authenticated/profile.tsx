import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/profile")({
  component: () => <Navigate to="/settings/profile" replace />,
});

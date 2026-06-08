import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bharat Auto Parts — Shop Manager" },
      { name: "description", content: "Billing, inventory and customer management for auto parts shops." },
    ],
  }),
  component: Index,
});

function Index() {
  const { loading, session } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Logo size={64} />
      </div>
    );
  }
  return <Navigate to={session ? "/dashboard" : "/auth"} replace />;
}

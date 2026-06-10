import { createFileRoute, Outlet, useNavigate, Link, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { LayoutDashboard, ShoppingCart, BookOpen, Users, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/_authenticated")({
  component: AppShell,
});

const NAV = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/khata", label: "Khata", icon: BookOpen },
  { to: "/billing", label: "Bill", icon: ShoppingCart },
  { to: "/customers", label: "Clients", icon: Users },
  { to: "/assistant", label: "AI", icon: Sparkles },
] as const;

function AppShell() {
  const { loading, session, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Logo size={56} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Outlet />
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur border-t border-border safe-bottom">
        <div className="grid grid-cols-5 max-w-lg mx-auto">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

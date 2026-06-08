import { LogOut } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

export function ScreenHeader({
  title,
  subtitle,
  right,
  showLogout = false,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  showLogout?: boolean;
}) {
  const { signOut, profile } = useAuth();
  return (
    <header className="gradient-brand text-primary-foreground px-5 pt-10 pb-6 safe-top">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Logo size={36} />
          <div>
            <h1 className="text-lg font-bold leading-tight">{title}</h1>
            {subtitle && (
              <p className="text-xs text-primary-foreground/75">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {right}
          {showLogout && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => signOut()}
              className="text-primary-foreground hover:bg-white/10"
              aria-label="Sign out"
            >
              <LogOut size={18} />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

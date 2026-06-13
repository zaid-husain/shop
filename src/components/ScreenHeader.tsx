import { LogOut } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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
  const [open, setOpen] = useState(false);
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
            <AlertDialog open={open} onOpenChange={setOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-primary-foreground hover:bg-white/10"
                  aria-label="Sign out"
                >
                  <LogOut size={18} />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You will be signed out of your account.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => signOut()}>
                    Sign out
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </header>
  );
}

import * as React from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AIActionCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  isLocked?: boolean;
  className?: string;
}

export function AIActionCard({
  title,
  description,
  children,
  icon,
  isLocked,
  className,
}: AIActionCardProps) {
  return (
    <Card
      className={cn(
        "my-4 w-full max-w-md overflow-hidden border border-primary/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className,
      )}
    >
      <CardHeader className="bg-muted/50 pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          {icon}
          {title}
        </CardTitle>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent className="pt-4 relative">
        {isLocked && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-[1px]">
            <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              Action Completed
            </span>
          </div>
        )}
        <div className={cn("space-y-4", isLocked && "opacity-50 pointer-events-none")}>
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

export function AIActionSubmitButton({
  isLoading,
  onClick,
  disabled,
  children,
}: {
  isLoading: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button onClick={onClick} disabled={isLoading || disabled} className="w-full">
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
}

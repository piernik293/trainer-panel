import { useUser, useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import { Settings, LogOut, UserCog } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

/** Derives up to 2 uppercase initials from a display name. */
export function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const letters = parts.map((p) => p[0] ?? "").join("").toUpperCase();
  return letters.slice(0, 2) || "?";
}

interface AccountMenuProps {
  /** compact=true shows only the avatar (for the mobile header). */
  compact?: boolean;
}

export function AccountMenu({ compact = false }: AccountMenuProps) {
  const { user, isLoaded } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const [, navigate] = useLocation();

  if (!isLoaded) {
    if (compact) {
      return <Skeleton className="w-8 h-8 rounded-full" />;
    }
    return (
      <div className="flex items-center gap-3 px-3 py-2">
        <Skeleton className="w-8 h-8 rounded-full shrink-0" />
        <div className="flex-1 space-y-1.5 min-w-0">
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="h-2.5 w-32 rounded" />
        </div>
      </div>
    );
  }

  const fullName = user?.fullName ?? user?.firstName ?? null;
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const imageUrl = user?.imageUrl;
  const initials = getInitials(fullName);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          /* Mobile header — avatar only */
          <button
            aria-label="Menu konta"
            data-testid="account-menu-trigger"
            className="p-1 rounded-full hover:ring-2 hover:ring-sidebar-accent transition-all"
          >
            <Avatar className="w-8 h-8">
              <AvatarImage src={imageUrl} alt={fullName ?? "Trener"} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </button>
        ) : (
          /* Desktop sidebar — avatar + name + email */
          <button
            aria-label="Menu konta"
            data-testid="account-menu-trigger"
            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-sidebar-accent transition-colors w-full text-left"
          >
            <Avatar className="w-8 h-8 shrink-0">
              <AvatarImage src={imageUrl} alt={fullName ?? "Trener"} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-medium text-sidebar-foreground truncate"
                data-testid="account-name"
              >
                {fullName ?? "Trener"}
              </p>
              {email && (
                <p
                  className="text-xs text-muted-foreground truncate"
                  data-testid="account-email"
                >
                  {email}
                </p>
              )}
            </div>
          </button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side={compact ? "bottom" : "top"}
        align={compact ? "end" : "start"}
        className="w-56"
        data-testid="account-menu-content"
      >
        {/* Identity header */}
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="font-medium" data-testid="menu-name">
            {fullName ?? "Trener"}
          </span>
          {email && (
            <span
              className="text-xs font-normal text-muted-foreground"
              data-testid="menu-email"
            >
              {email}
            </span>
          )}
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => navigate("/settings")}
          data-testid="menu-settings"
        >
          <Settings className="w-4 h-4 mr-2" />
          Ustawienia
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => openUserProfile()}
          data-testid="menu-manage-account"
        >
          <UserCog className="w-4 h-4 mr-2" />
          Zarządzaj kontem
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => signOut()}
          data-testid="menu-sign-out"
          className="text-destructive focus:text-destructive focus:bg-destructive/10"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Wyloguj się
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

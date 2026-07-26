import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Users, LayoutDashboard, PlusCircle, Dumbbell, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const navItems = [
  { href: "/", label: "Pulpit", icon: LayoutDashboard },
  { href: "/clients", label: "Klienci", icon: Users },
  { href: "/exercises", label: "Biblioteka ćwiczeń", icon: Dumbbell },
];

function NavLinks({ location, onNavigate }: { location: string; onNavigate?: () => void }) {
  return (
    <>
      <div className="px-4 py-2">
        <p className="px-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2">
          Menu
        </p>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-all text-sm font-medium",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon
                  size={18}
                  className={cn(
                    isActive ? "text-primary-foreground" : "text-sidebar-foreground/50"
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto p-4 border-t border-sidebar-border/50">
        <Link
          href="/clients/new"
          onClick={onNavigate}
          className="flex items-center justify-center gap-2 w-full bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80 px-4 py-2 rounded-md transition-colors text-sm font-medium"
        >
          <PlusCircle size={16} />
          Nowy Klient
        </Link>
      </div>
    </>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shrink-0">
        <Dumbbell size={18} />
      </div>
      <span className="font-display font-bold text-xl tracking-tight text-sidebar-foreground">
        Panel Trenera
      </span>
    </div>
  );
}

export function Sidebar() {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* ── Mobile top bar (below md) ──────────────────────────────── */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-sidebar no-print sticky top-0 z-40">
        <BrandMark />
        <button
          aria-label="Otwórz menu"
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <Menu size={22} />
        </button>
      </header>

      {/* ── Mobile drawer ──────────────────────────────────────────── */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 bg-sidebar text-sidebar-foreground flex flex-col">
          <SheetHeader className="p-6 pb-2">
            <SheetTitle asChild>
              <BrandMark />
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col flex-1 overflow-y-auto">
            <NavLinks location={location} onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Desktop sidebar (md and up) ────────────────────────────── */}
      <aside className="hidden md:flex w-64 border-r bg-sidebar h-full flex-col no-print">
        <div className="p-6 flex items-center gap-3">
          <BrandMark />
        </div>
        <NavLinks location={location} />
      </aside>
    </>
  );
}

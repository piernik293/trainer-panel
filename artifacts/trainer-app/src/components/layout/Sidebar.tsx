import { Link, useLocation } from "wouter";
import { Users, LayoutDashboard, PlusCircle, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Pulpit", icon: LayoutDashboard },
    { href: "/clients", label: "Klienci", icon: Users },
    { href: "/exercises", label: "Biblioteka ćwiczeń", icon: Dumbbell },
  ];

  return (
    <aside className="w-64 border-r bg-sidebar h-full flex flex-col no-print">
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
          <Dumbbell size={18} />
        </div>
        <span className="font-display font-bold text-xl tracking-tight text-sidebar-foreground">
          Panel Trenera
        </span>
      </div>
      
      <div className="px-4 py-2">
        <p className="px-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2">
          Menu
        </p>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            const Icon = item.icon;
            
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-all text-sm font-medium",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-sm" 
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon size={18} className={cn(isActive ? "text-primary-foreground" : "text-sidebar-foreground/50")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto p-4 border-t border-sidebar-border/50">
        <Link 
          href="/clients/new"
          className="flex items-center justify-center gap-2 w-full bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80 px-4 py-2 rounded-md transition-colors text-sm font-medium"
        >
          <PlusCircle size={16} />
          Nowy Klient
        </Link>
      </div>
    </aside>
  );
}

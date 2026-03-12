import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { useAuthStore } from "../../stores/authStore";
import { cn } from "../../lib/utils";
import {
  LayoutDashboard,
  MessageSquare,
  Radio,
  Puzzle,
  Clock,
  Settings,
  Users,
  FileJson,
  Sun,
  Moon,
  Languages,
  LogOut,
  KeyRound,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useState } from "react";
import { ChangePasswordDialog } from "./ChangePasswordDialog";

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const GENERAL_ITEMS: NavItem[] = [
  { path: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard },
  { path: "/chat", label: "nav.chat", icon: MessageSquare },
];

const ADMIN_ITEMS: NavItem[] = [
  { path: "/settings", label: "nav.settings", icon: Settings },
  { path: "/channels", label: "nav.channels", icon: Radio },
  { path: "/tools", label: "nav.tools", icon: Puzzle },
  { path: "/users", label: "nav.users", icon: Users },
  { path: "/cron", label: "nav.cron", icon: Clock },
  { path: "/system-config", label: "nav.systemConfig", icon: FileJson },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const { t } = useTranslation();
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      className={cn(
        "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 hover:translate-x-0.5",
        active
          ? "bg-[hsl(var(--sidebar-active-bg))] text-[hsl(var(--sidebar-active-fg))]"
          : "text-[hsl(var(--sidebar-fg))] hover:bg-[hsl(var(--sidebar-hover-bg))] hover:text-[hsl(var(--sidebar-fg))]"
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          active
            ? "text-[hsl(var(--sidebar-active-fg))]"
            : "text-[hsl(var(--sidebar-muted))] group-hover:text-[hsl(var(--sidebar-fg))]"
        )}
      />
      {t(item.label)}
    </Link>
  );
}

export function Sidebar() {
  const { t, i18n } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const isAdmin = user?.role === "admin";
  const [showChangePwd, setShowChangePwd] = useState(false);

  const isActive = (item: NavItem) =>
    location.pathname === item.path ||
    (item.path !== "/dashboard" && location.pathname.startsWith(item.path));

  return (
    <aside
      className="flex h-full w-48 flex-col backdrop-blur-md"
      style={{
        background: "hsl(var(--sidebar-bg) / var(--sidebar-glass-opacity))",
        boxShadow: "var(--sidebar-edge-shadow)",
      }}
    >
      {/* Logo */}
      <div className="flex h-12 items-center px-4">
        <img src="/logo.png" alt="Nanobot" className="h-7 w-auto object-contain mix-blend-multiply dark:invert dark:mix-blend-screen" />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {/* General section */}
        <div className="mb-2">
          <p
            className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "hsl(var(--sidebar-section-label))" }}
          >
            {t("nav.section.general")}
          </p>
          <div className="space-y-0.5">
            {GENERAL_ITEMS.map((item) => (
              <NavLink key={item.path} item={item} active={isActive(item)} />
            ))}
          </div>
        </div>

        {/* Admin section */}
        {isAdmin && (
          <div className="mt-4">
            <p
              className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider"
              style={{ color: "hsl(var(--sidebar-section-label))" }}
            >
              {t("nav.section.admin")}
            </p>
            <div className="space-y-0.5">
              {ADMIN_ITEMS.map((item) => (
                <NavLink key={item.path} item={item} active={isActive(item)} />
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Bottom: user row + inline theme toggle */}
      <div
        className="shrink-0 px-2 pb-3"
        style={{ borderTop: "1px solid hsl(var(--sidebar-section-label) / 0.12)" }}
      >
        <div className="mt-1 flex items-center gap-1">
          {/* User dropdown (avatar + name) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(
                "flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200",
                "text-[hsl(var(--sidebar-fg))] hover:bg-[hsl(var(--sidebar-hover-bg))]"
              )}>
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                  {user?.username?.[0]?.toUpperCase() ?? "?"}
                </div>
                <span className="flex-1 truncate text-left">{user?.username}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-48">
              <DropdownMenuItem onClick={() => {
                const currentLang = i18n.language;
                const nextLang = currentLang === "zh" ? "en" : currentLang === "en" ? "ja" : "zh";
                i18n.changeLanguage(nextLang);
              }}>
                <Languages className="mr-2 h-4 w-4" />
                {i18n.language === "zh" ? "English" : i18n.language === "en" ? "日本語" : "中文"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowChangePwd(true)}>
                <KeyRound className="mr-2 h-4 w-4" />
                {t("auth.changePassword")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={clearAuth} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                {t("auth.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Inline theme toggle */}
          <button
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            title={resolvedTheme === "dark" ? t("common.lightMode") : t("common.darkMode")}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
              "text-[hsl(var(--sidebar-muted))] hover:bg-[hsl(var(--sidebar-hover-bg))] hover:text-[hsl(var(--sidebar-fg))]"
            )}
          >
            {resolvedTheme === "dark"
              ? <Sun className="h-3.5 w-3.5" />
              : <Moon className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <ChangePasswordDialog open={showChangePwd} onClose={() => setShowChangePwd(false)} />
    </aside>
  );
}

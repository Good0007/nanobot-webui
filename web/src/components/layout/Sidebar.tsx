import { useLocation } from "react-router-dom";
import { TransitionLink as Link } from "../shared/TransitionLink";
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
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useState } from "react";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { LANGUAGE_OPTIONS, getLanguageLabel } from "../../i18n/languages";

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

function NavLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const { t } = useTranslation();
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      title={collapsed ? t(item.label) : undefined}
      className={cn(
        "group flex items-center rounded-md text-sm font-medium transition-all duration-200",
        collapsed
          ? "justify-center py-2.5 mx-auto w-10"
          : "gap-3 border-l-2 px-3 py-2 hover:translate-x-0.5",
        active
          ? collapsed
            ? "bg-[hsl(var(--sidebar-active-bg))] text-[hsl(var(--sidebar-active-fg))]"
            : "border-[hsl(var(--primary))] bg-[hsl(var(--sidebar-active-bg))] text-[hsl(var(--sidebar-active-fg))]"
          : collapsed
            ? "text-[hsl(var(--sidebar-fg))] hover:bg-[hsl(var(--sidebar-hover-bg))]"
            : "border-transparent text-[hsl(var(--sidebar-fg))] hover:bg-[hsl(var(--sidebar-hover-bg))]"
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
      {!collapsed && <span className="truncate">{t(item.label)}</span>}
    </Link>
  );
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
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

  const currentLangLabel = getLanguageLabel(i18n.language);

  return (
    <aside
      className={cn(
        "flex h-full flex-col transition-[width] duration-300 ease-in-out overflow-hidden",
        collapsed ? "w-14" : "w-48"
      )}
      style={{
        width: collapsed ? undefined : "202px",
        background: "hsl(var(--sidebar-bg))",
        boxShadow: "var(--sidebar-edge-shadow)",
      }}
    >
      {/* Logo + collapse toggle */}
      <div className={cn(
        "group flex h-12 shrink-0 items-center",
        collapsed ? "justify-center px-1" : "justify-between pl-4 pr-2"
      )}>
        {!collapsed && (
          <img src="/logo.png" alt="Nanobot" className="h-18 max-w-[140px] w-auto object-contain object-left mix-blend-multiply dark:mix-blend-normal dark:brightness-90" />
        )}
        <button
          onClick={onToggle}
          title={collapsed ? t("nav.expand") : t("nav.collapse")}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md transition-all duration-200",
            "text-[hsl(var(--sidebar-muted))] hover:bg-[hsl(var(--sidebar-hover-bg))] hover:text-[hsl(var(--sidebar-fg))]",
            "opacity-0 group-hover:opacity-100",
            collapsed && "opacity-100"
          )}
        >
          {collapsed
            ? <PanelLeftOpen className="h-4 w-4" />
            : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {/* General section */}
        <div className="mb-2">
          {!collapsed && (
            <p
              className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider"
              style={{ color: "hsl(var(--sidebar-section-label))" }}
            >
              {t("nav.section.general")}
            </p>
          )}
          <div className="space-y-0.5">
            {GENERAL_ITEMS.map((item) => (
              <NavLink key={item.path} item={item} active={isActive(item)} collapsed={collapsed} />
            ))}
          </div>
        </div>

        {/* Admin section */}
        {isAdmin && (
          <div className={cn("mt-4", collapsed && "border-t border-[hsl(var(--sidebar-border))] pt-2")}>
            {!collapsed && (
              <p
                className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider"
                style={{ color: "hsl(var(--sidebar-section-label))" }}
              >
                {t("nav.section.admin")}
              </p>
            )}
            <div className="space-y-0.5">
              {ADMIN_ITEMS.map((item) => (
                <NavLink key={item.path} item={item} active={isActive(item)} collapsed={collapsed} />
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Bottom: user + theme toggle */}
      <div
        className="shrink-0 pb-3"
        style={{ borderTop: "1px solid hsl(var(--sidebar-border))" }}
      >
        {collapsed ? (
          <div className="mt-2 flex flex-col items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  title={user?.username}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 hover:bg-primary/25 transition-colors"
                >
                  <span className="text-xs font-bold text-primary">
                    {user?.username?.[0]?.toUpperCase() ?? "?"}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" className="w-48">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Languages className="mr-2 h-4 w-4" />{currentLangLabel}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {LANGUAGE_OPTIONS.map(({ code, label }) => (
                      <DropdownMenuItem
                        key={code}
                        onClick={() => i18n.changeLanguage(code)}
                        className={i18n.language === code ? "font-semibold text-primary" : ""}
                      >
                        {label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowChangePwd(true)}>
                  <KeyRound className="mr-2 h-4 w-4" />{t("auth.changePassword")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={clearAuth} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />{t("auth.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              title={resolvedTheme === "dark" ? t("common.lightMode") : t("common.darkMode")}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                "text-[hsl(var(--sidebar-muted))] hover:bg-[hsl(var(--sidebar-hover-bg))] hover:text-[hsl(var(--sidebar-fg))]"
              )}
            >
              {resolvedTheme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
          </div>
        ) : (
          <div className="mt-1 px-2 flex items-center gap-1">
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
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Languages className="mr-2 h-4 w-4" />{currentLangLabel}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {LANGUAGE_OPTIONS.map(({ code, label }) => (
                      <DropdownMenuItem
                        key={code}
                        onClick={() => i18n.changeLanguage(code)}
                        className={i18n.language === code ? "font-semibold text-primary" : ""}
                      >
                        {label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowChangePwd(true)}>
                  <KeyRound className="mr-2 h-4 w-4" />{t("auth.changePassword")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={clearAuth} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />{t("auth.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              title={resolvedTheme === "dark" ? t("common.lightMode") : t("common.darkMode")}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
                "text-[hsl(var(--sidebar-muted))] hover:bg-[hsl(var(--sidebar-hover-bg))] hover:text-[hsl(var(--sidebar-fg))]"
              )}
            >
              {resolvedTheme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}
      </div>

      <ChangePasswordDialog open={showChangePwd} onClose={() => setShowChangePwd(false)} />
    </aside>
  );
}

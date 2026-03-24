import { useLocation } from "react-router-dom";
import { TransitionLink as Link } from "../shared/TransitionLink";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../stores/authStore";
import { cn } from "../../lib/utils";
import {
  LayoutDashboard,
  MessageSquare,
  Settings,
  MoreHorizontal,
  Radio,
  Puzzle,
  Clock,
  FileJson,
  Users,
  X,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

const ADMIN_ITEMS = [
  { path: "/settings", label: "nav.settings", icon: Settings },
  { path: "/channels", label: "nav.channels", icon: Radio },
  { path: "/tools", label: "nav.tools", icon: Puzzle },
  { path: "/users", label: "nav.users", icon: Users },
  { path: "/cron", label: "nav.cron", icon: Clock },
  { path: "/system-config", label: "nav.systemConfig", icon: FileJson },
];

export function MobileBottomTabs() {
  const { t } = useTranslation();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  const isActive = (path: string) =>
    location.pathname === path ||
    (path !== "/dashboard" && location.pathname.startsWith(path));

  const TAB_CLS =
    "flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-[10px] font-medium transition-colors";
  const ACTIVE_CLS = "text-primary";
  const INACTIVE_CLS = "text-muted-foreground";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex bg-background/85 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)", boxShadow: "var(--shadow-up)" }}
    >
      {/* Dashboard */}
      <Link
        to="/dashboard"
        className={cn(TAB_CLS, isActive("/dashboard") ? ACTIVE_CLS : INACTIVE_CLS)}
      >
        <LayoutDashboard className="h-5 w-5" />
        <span>{t("nav.dashboard")}</span>
      </Link>

      {/* Chat */}
      <Link
        to="/chat"
        className={cn(TAB_CLS, isActive("/chat") ? ACTIVE_CLS : INACTIVE_CLS)}
      >
        <MessageSquare className="h-5 w-5" />
        <span>{t("nav.chat")}</span>
      </Link>

      {/* Admin "More" bottom drawer — uses Radix Dialog primitive for bottom-anchored positioning */}
      {isAdmin && (
        <DialogPrimitive.Root>
          <DialogPrimitive.Trigger asChild>
            <button
              className={cn(
                TAB_CLS,
                ADMIN_ITEMS.some((item) => isActive(item.path))
                  ? ACTIVE_CLS
                  : INACTIVE_CLS
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>{t("nav.more")}</span>
            </button>
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
            <DialogPrimitive.Content
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t bg-background shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom duration-300"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              {/* Drag handle */}
              <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-muted-foreground/30" />
              {/* Title row */}
              <div className="flex items-center justify-between px-5 py-3">
                <DialogPrimitive.Title className="text-sm font-semibold">
                  {t("nav.section.admin")}
                </DialogPrimitive.Title>
                <DialogPrimitive.Close className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80">
                  <X className="h-4 w-4" />
                </DialogPrimitive.Close>
              </div>
              {/* Grid of admin items */}
              <div className="grid grid-cols-3 gap-0 pb-4">
                {ADMIN_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  return (
                    <DialogPrimitive.Close asChild key={item.path}>
                      <Link
                        to={item.path}
                        className={cn(
                          "flex flex-col items-center justify-center gap-1.5 py-4 text-xs font-medium transition-colors",
                          active ? "text-primary" : "text-muted-foreground"
                        )}
                      >
                        <div className={cn(
                          "flex h-12 w-12 items-center justify-center rounded-2xl",
                          active ? "bg-primary/10" : "bg-muted"
                        )}>
                          <Icon className={cn("h-5 w-5", active && "text-primary")} />
                        </div>
                        <span>{t(item.label)}</span>
                      </Link>
                    </DialogPrimitive.Close>
                  );
                })}
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      )}

      {/* Settings shortcut for non-admin (just links to settings) */}
      {!isAdmin && (
        <Link
          to="/settings"
          className={cn(TAB_CLS, isActive("/settings") ? ACTIVE_CLS : INACTIVE_CLS)}
        >
          <Settings className="h-5 w-5" />
          <span>{t("nav.settings")}</span>
        </Link>
      )}
    </nav>
  );
}

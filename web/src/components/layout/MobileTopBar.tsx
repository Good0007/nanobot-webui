import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { useAuthStore } from "../../stores/authStore";
import { cn } from "../../lib/utils";
import { Sun, Moon, Languages, LogOut, KeyRound } from "lucide-react";
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
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { LANGUAGE_OPTIONS, getLanguageLabel } from "../../i18n/languages";

export function MobileTopBar() {
  const { t, i18n } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [showChangePwd, setShowChangePwd] = useState(false);

  const currentLangLabel = getLanguageLabel(i18n.language);

  const isDark = resolvedTheme === "dark";

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-40 flex h-12 items-center justify-between bg-background/85 px-4 backdrop-blur-xl"
        style={{ paddingTop: "env(safe-area-inset-top)", boxShadow: "var(--shadow-down)" }}
      >
        {/* Logo */}
        <img
          src="/logo.png"
          alt="Nanobot"
          className="h-7 w-auto max-w-[96px] object-contain object-left mix-blend-multiply dark:mix-blend-normal dark:brightness-90"
        />

        {/* Right actions */}
        <div className="flex items-center gap-1">
          {/* Theme toggle */}
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            title={isDark ? t("common.lightMode") : t("common.darkMode")}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* User avatar dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                title={user?.username}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary transition-colors hover:bg-primary/25"
              >
                {user?.username?.[0]?.toUpperCase() ?? "?"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {/* Username (non-clickable label) */}
              <div className={cn("px-2 py-1.5 text-xs text-muted-foreground")}>
                {user?.username}
              </div>
              <DropdownMenuSeparator />
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
                <KeyRound className="mr-2 h-4 w-4" />
                {t("auth.changePassword")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={clearAuth}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                {t("auth.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <ChangePasswordDialog open={showChangePwd} onClose={() => setShowChangePwd(false)} />
    </>
  );
}

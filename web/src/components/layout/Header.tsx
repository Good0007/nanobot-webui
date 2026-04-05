import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { useAuthStore } from "../../stores/authStore";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Sun, Moon, Languages, LogOut, KeyRound } from "lucide-react";
import { useState } from "react";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { LANGUAGE_OPTIONS, getLanguageLabel } from "../../i18n/languages";

export function Header() {
  const { t, i18n } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const user = useAuthStore((s) => s.user);
  const [showChangePwd, setShowChangePwd] = useState(false);

  const toggleLang = () => {
    const currentIndex = LANGUAGE_OPTIONS.findIndex(
      ({ code }) => code === i18n.language,
    );
    const nextIndex =
      currentIndex >= 0 ? (currentIndex + 1) % LANGUAGE_OPTIONS.length : 0;
    i18n.changeLanguage(LANGUAGE_OPTIONS[nextIndex].code);
  };

  const langLabel = getLanguageLabel(i18n.language);

  return (
    <header className="flex h-12 items-center bg-background px-4">
      <div className="flex-1" />

      {/* Right controls */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleLang}
          title={t("common.language")}
          className="h-8 px-2 gap-1 text-muted-foreground hover:text-foreground text-xs font-medium"
        >
          <Languages className="h-4 w-4" />
          {langLabel}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          title={resolvedTheme === "dark" ? t("common.lightMode") : t("common.darkMode")}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          {resolvedTheme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              title={t("auth.account")}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {user?.username?.[0]?.toUpperCase() ?? "?"}
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
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

      <ChangePasswordDialog
        open={showChangePwd}
        onClose={() => setShowChangePwd(false)}
      />
    </header>
  );
}

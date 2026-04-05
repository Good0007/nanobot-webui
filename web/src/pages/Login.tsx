import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuthStore } from "../stores/authStore";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { User, Lock, Languages } from "lucide-react";
import { LANGUAGE_OPTIONS, getLanguageLabel } from "../i18n/languages";

export default function Login() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error(t("auth.fieldRequired"));
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { username, password });
      const { access_token, user } = res.data;
      setAuth(user, access_token);
      navigate("/dashboard");
    } catch {
      toast.error(t("auth.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-orange-50 via-white to-orange-100 dark:from-gray-950 dark:via-gray-900 dark:to-orange-950 px-4">
      {/* 装饰性背景圆圈 */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-orange-200/30 dark:bg-orange-900/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-orange-300/30 dark:bg-orange-800/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2"></div>
      
      {/* 语言切换按钮 */}
      <div className="absolute top-4 right-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 backdrop-blur-sm bg-white/50 dark:bg-gray-900/50">
              <Languages className="h-4 w-4" />
              {getLanguageLabel(i18n.language)}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {LANGUAGE_OPTIONS.map(({ code, label }) => (
              <DropdownMenuItem key={code} onClick={() => changeLanguage(code)}>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card className="w-full max-w-sm shadow-2xl backdrop-blur-sm bg-white/80 dark:bg-gray-900/80 border-orange-200/50 dark:border-orange-900/50 animate-in fade-in zoom-in duration-500">
        <CardHeader className="text-center space-y-3 pb-4">
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-orange-400/20 dark:bg-orange-600/20 rounded-2xl blur-xl animate-pulse"></div>
              <img 
                src="/icon.png" 
                alt="Nanobot" 
                className="relative h-16 w-16 rounded-2xl shadow-lg ring-2 ring-orange-100 dark:ring-orange-900/50" 
              />
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-orange-600 to-orange-400 bg-clip-text text-transparent">
              Nanobot
            </CardTitle>
            <CardDescription className="text-sm mt-1">{t("auth.login")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium">
                {t("auth.username")}
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-orange-500" />
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="pl-10 h-10 border-orange-200 focus-visible:ring-orange-500 bg-gradient-to-r from-orange-50/50 to-white dark:from-orange-950/30 dark:to-gray-800"
                  placeholder={t("auth.username")}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                {t("auth.password")}
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-orange-500" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="pl-10 h-10 border-orange-200 focus-visible:ring-orange-500 bg-gradient-to-r from-orange-50/50 to-white dark:from-orange-950/30 dark:to-gray-800"
                  placeholder={t("auth.password")}
                />
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full h-10 mt-6 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold shadow-xl shadow-orange-500/40 hover:shadow-orange-600/50 transition-all duration-300 hover:scale-[1.02]" 
              disabled={loading}
            >
              {loading ? t("common.loading") : t("auth.loginButton")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

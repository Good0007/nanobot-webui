import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";
import AppLayout from "./components/layout/AppLayout";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Chat = lazy(() => import("./pages/Chat"));
const Channels = lazy(() => import("./pages/Channels"));
const Tools = lazy(() => import("./pages/Tools"));
const CronJobs = lazy(() => import("./pages/CronJobs"));
const Settings = lazy(() => import("./pages/Settings"));
const Users = lazy(() => import("./pages/Users"));
const SystemConfig = lazy(() => import("./pages/SystemConfig"));

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="chat" element={<Chat />} />
        <Route path="chat/:sessionKey" element={<Chat />} />
        <Route
          path="providers"
          element={<Navigate to="/settings?tab=providers" replace />}
        />
        <Route
          path="channels"
          element={
            <AdminRoute>
              <Channels />
            </AdminRoute>
          }
        />
        <Route
          path="mcp"
          element={<Navigate to="/tools?tab=mcp" replace />}
        />
        <Route
          path="skills"
          element={<Navigate to="/tools?tab=skills" replace />}
        />
        <Route
          path="tools"
          element={
            <AdminRoute>
              <Tools />
            </AdminRoute>
          }
        />
        <Route
          path="cron"
          element={
            <AdminRoute>
              <CronJobs />
            </AdminRoute>
          }
        />
        <Route
          path="settings"
          element={
            <AdminRoute>
              <Settings />
            </AdminRoute>
          }
        />
        <Route
          path="users"
          element={
            <AdminRoute>
              <Users />
            </AdminRoute>
          }
        />
        <Route
          path="system-config"
          element={
            <AdminRoute>
              <SystemConfig />
            </AdminRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </Suspense>
  );
}

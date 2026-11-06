import { Navigate, Outlet } from "react-router-dom";

import { authStore } from "../stores/authStore";

type Props = {
  redirectTo: string | null;
};

export const AuthGuard = ({ redirectTo = null }: Props) => {
  const { isLoggedIn, isLoading } = authStore();

  if (isLoading) return null;

  return isLoggedIn ? <Outlet /> : <Navigate to={redirectTo || "/"} />;
};

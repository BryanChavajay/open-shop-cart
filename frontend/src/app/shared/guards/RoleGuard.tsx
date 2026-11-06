import { Navigate } from "react-router-dom";
import { authStore } from "../stores/authStore";

type Props = {
  roleName: string;
  children: React.ReactNode;
};

export const RoleGuard = ({ roleName, children }: Props) => {
  const { role } = authStore();

  const hasRole = role === roleName;

  if (!hasRole) {
    return <Navigate to={"/"} replace />;
  }

  return children;
};

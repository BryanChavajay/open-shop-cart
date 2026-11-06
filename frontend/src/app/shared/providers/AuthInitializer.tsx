import React, { useEffect } from "react";

import { apiClient } from "@libs/apiClient";
import { authStore } from "../stores/authStore";
import { BASE_API_V1_URL } from "@utils/env";

type Props = {
  children: React.ReactNode;
  skeleton: React.ReactElement | null;
};

let checkSessionPromise: Promise<void> | null = null;

const checkSession = async () => {
  const { setToken, logout, setUser, setLoading, setRole } = authStore();

  try {
    const res = await apiClient.request(
      `${BASE_API_V1_URL}/auth/refresh-token`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      },
    );

    if (!res.ok) {
      logout();
      return;
    }

    const payload = await res.json();

    const accessToken = payload?.access_token;

    if (!accessToken) {
      logout();
      return;
    }

    setToken(accessToken);
    setLoading(false);
  } catch {
    logout();
  }
};

export const AuthInitializer = ({ children, skeleton = null }: Props) => {
  const isLoading = authStore((state) => state.isLoading);

  useEffect(() => {
    if (!checkSessionPromise) {
      checkSessionPromise = checkSession();
    }
  }, []);

  if (isLoading) {
    skeleton ?? (
      <div className="flex items-center justify-center min-h-screen">
        <span>Cargando...</span>
      </div>
    );
  }

  return children;
};

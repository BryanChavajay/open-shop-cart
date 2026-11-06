import { create } from "zustand";

type AutState = {
  isLoggedIn: boolean;
  token: string | null;
  isLoading: boolean;
  user: string | null;
  role: string | null;

  login: (accessToken: string) => void;
  setToken: (accessToken: string) => void;
  logout: () => void;
  setLoading: (val: boolean) => void;
  setUser: (user: string) => void;
  setRole: (role: string) => void;
};

export const authStore = create<AutState>()((set) => ({
  isLoggedIn: false,
  token: null,

  isLoading: true,
  user: null,
  role: null,

  login: (accessToken: string) =>
    set({ isLoggedIn: true, token: accessToken, isLoading: false }),
  setToken: (accessToken: string) =>
    set({ isLoggedIn: true, token: accessToken }),
  logout: () => set({ isLoggedIn: false, token: null, user: null }),
  setLoading: (val: boolean) => set({ isLoading: val }),
  setUser: (user: string) => set({ user: user }),
  setRole: (role: string) => set({ role: role }),
}));

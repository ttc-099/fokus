// auth context — keeps the logged-in user available everywhere
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiLogin, apiMe, apiRegister, type User } from "../services/api";

interface AuthState {
  user: User | null;
  loading: boolean; // true while we check the saved token on startup

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // on mount, try to restore the session from a saved token
  useEffect(() => {
    const token = localStorage.getItem("fokus_token");
    if (!token) {
      setLoading(false);
      return;
    }
    apiMe()
      .then(setUser)
      .catch(() => localStorage.removeItem("fokus_token"))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiLogin(email, password);
    localStorage.setItem("fokus_token", data.token);
    setUser(data.user);
  }, []);

  const register = useCallback(
    async (email: string, name: string, password: string) => {
      const data = await apiRegister(email, name, password);
      localStorage.setItem("fokus_token", data.token);
      setUser(data.user);
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem("fokus_token");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// hook for consuming the context
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};

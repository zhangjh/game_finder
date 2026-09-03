import { useState } from "react";
import { useNavigate } from "react-router";

import { adminLogin } from "../../admin-api";

export function AdminLoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const ok = await adminLogin(password).catch(() => false);
    setBusy(false);
    if (ok) {
      onSuccess();
      navigate("/admin");
    } else {
      setError(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-xs rounded-lg border border-neutral-800 bg-neutral-900 p-6"
      >
        <h1 className="mb-4 text-lg font-bold">管理后台登录</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="管理密码"
          autoFocus
          className="mb-3 w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        {error && (
          <p className="mb-3 text-sm text-red-400">密码错误，请重试</p>
        )}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full rounded bg-neutral-100 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
        >
          {busy ? "登录中…" : "登录"}
        </button>
      </form>
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { Eye, Lock } from "lucide-react";
import { Redirect } from "wouter";
import { useDemoAccess } from "@/contexts/DemoAccess";
import "../login.css";

// shortcut: botões só visuais, o gate demo não tem OAuth; ligar quando o login real existir (PF-4).
const ssoProviders = [
  {
    name: "Google",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    ),
  },
  {
    name: "Microsoft",
    icon: (
      <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
      </svg>
    ),
  },
];

export default function Login() {
  const { status, login, retry, expired } = useDemoAccess();
  const [email, setEmail] = useState("adm@pmais.demo");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [ssoNotice, setSsoNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  if (status === "authenticated") {
    return <Redirect to="/" />;
  }

  const isLoading = status === "loading";
  const isNetworkError = status === "error";
  const isUnconfigured = status === "unconfigured";
  const formDisabled =
    isLoading || isNetworkError || isUnconfigured || isSubmitting || isRetrying;
  const submitDisabled = formDisabled || status !== "anonymous";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    setSsoNotice("");
    setIsSubmitting(true);

    try {
      const result = await login(email, password);
      if (!result.ok) {
        setFeedback(
          result.message ||
            "Não foi possível validar o acesso. Confira os dados e tente novamente."
        );
      }
    } catch {
      setFeedback("Não foi possível conectar agora. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRetry() {
    setFeedback("");
    setIsRetrying(true);

    try {
      await retry();
    } catch {
      setFeedback(
        "Não foi possível verificar o acesso agora. Tente novamente."
      );
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-header">
          <img
            src="/brand/Logo2025.png"
            alt="P+ Financeiro"
            width={180}
            height={65}
          />
          <span className="login-badge">P+ FINANCEIRO · DEMONSTRAÇÃO</span>
          <h1 id="login-title">Entrar na sua conta</h1>
        </div>

        {expired && status === "anonymous" && (
          <p className="login-info" role="status">
            Sua sessão de demonstração expirou. Entre novamente para continuar.
          </p>
        )}

        {isLoading && (
          <div
            className="login-status login-status-loading"
            role="status"
            aria-live="polite"
          >
            <span className="login-spinner" aria-hidden="true" />
            <span>Verificando acesso…</span>
          </div>
        )}

        {isNetworkError && (
          <div className="login-status login-status-error" role="alert">
            <p>Não foi possível verificar o acesso agora.</p>
            <button
              className="login-retry"
              type="button"
              onClick={handleRetry}
              disabled={isRetrying}
            >
              {isRetrying ? "Tentando novamente…" : "Tentar novamente"}
            </button>
          </div>
        )}

        {isUnconfigured && (
          <div className="login-status login-status-blocked" role="status">
            O acesso à demonstração ainda não está disponível neste ambiente.
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-fields">
            <div className="login-field">
              <label htmlFor="login-email">E-mail</label>
              <input
                id="login-email"
                name="email"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                disabled={formDisabled}
                required
              />
            </div>

            <div className="login-field">
              <label htmlFor="login-password">Senha</label>
              <div className="login-password-wrap">
                <Lock
                  className="login-field-icon"
                  size={15}
                  strokeWidth={2}
                  aria-hidden="true"
                />
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  autoComplete="current-password"
                  disabled={formDisabled}
                  required
                />
                <button
                  className="login-password-toggle"
                  type="button"
                  onClick={() => setShowPassword(visible => !visible)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={showPassword}
                  aria-controls="login-password"
                  disabled={formDisabled}
                >
                  <Eye size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            {feedback && (
              <p className="login-error" role="alert">
                {feedback}
              </p>
            )}
          </div>

          <div className="login-footer">
            <button
              className="login-submit"
              type="submit"
              disabled={submitDisabled}
            >
              {isSubmitting ? "Entrando…" : "Entrar"}
            </button>

            <div className="login-divider">ou</div>

            <div className="login-sso">
              {ssoProviders.map(({ name, icon }) => (
                <button
                  key={name}
                  className="login-sso-button"
                  type="button"
                  onClick={() =>
                    setSsoNotice(
                      `Entrar com ${name} ainda não funciona nesta demonstração. Use e-mail e senha.`
                    )
                  }
                  disabled={formDisabled}
                >
                  {icon}
                  Entrar com {name}
                </button>
              ))}
            </div>

            {ssoNotice && (
              <p className="login-info" role="status">
                {ssoNotice}
              </p>
            )}

            <p className="login-notice">
              Acesso à demonstração • dados sintéticos. Não utilize dados
              financeiros reais.
            </p>
          </div>
        </form>
      </section>
    </main>
  );
}

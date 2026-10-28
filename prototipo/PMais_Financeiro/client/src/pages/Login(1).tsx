import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, LockKeyhole, ShieldCheck } from "lucide-react";
import { Redirect } from "wouter";
import { useDemoAccess } from "@/contexts/DemoAccess";
import "../login.css";

const reasons = [
  {
    title: "Módulos conectados",
    text: "Pagamentos, contas e relatórios reunidos em uma mesma visão.",
  },
  {
    title: "Leitura centralizada",
    text: "Informações organizadas para acompanhar o financeiro com clareza.",
  },
  {
    title: "Demonstração objetiva",
    text: "Fluxos preparados para explorar o produto com dados sintéticos.",
  },
];

export default function Login() {
  const { status, login, retry, expired } = useDemoAccess();
  const [username, setUsername] = useState("adm");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [feedback, setFeedback] = useState("");
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
    setIsSubmitting(true);

    try {
      const result = await login(username, password);
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
      <aside className="login-aside" aria-labelledby="login-brand-title">
        <div className="login-brand">
          <img src="/brand/Logo2025_branco.png" alt="P+ Financeiro" />
          <span className="login-brand-divider" aria-hidden="true" />
          <h2 id="login-brand-title">P+ Financeiro</h2>
        </div>

        <div className="login-aside-copy">
          <p className="login-kicker">Gestão financeira em uma visão</p>
          <h1>Clareza para cada decisão do dia a dia.</h1>
          <p className="login-aside-description">
            Entre para explorar uma experiência integrada de acompanhamento
            financeiro.
          </p>
        </div>

        <ul className="login-reasons" aria-label="Destaques do P+ Financeiro">
          {reasons.map(reason => (
            <li key={reason.title}>
              <span className="login-reason-icon" aria-hidden="true">
                <ShieldCheck size={17} strokeWidth={1.9} />
              </span>
              <span>
                <strong>{reason.title}</strong>
                <small>{reason.text}</small>
              </span>
            </li>
          ))}
        </ul>

        <p className="login-aside-footer">Ambiente de demonstração</p>
      </aside>

      <section className="login-content" aria-labelledby="login-title">
        <div className="login-card">
          <div className="login-heading">
            <p className="login-eyebrow">Acesso à demonstração</p>
            <h2 id="login-title">Bem-vindo de volta</h2>
            <p>Insira seus dados para continuar para o P+ Financeiro.</p>
          </div>

          {expired && status === "anonymous" && (
            <p className="login-session-note" role="status">
              Sua sessão de demonstração expirou. Entre novamente para
              continuar.
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
            <div className="login-field">
              <label htmlFor="login-username">Usuário</label>
              <input
                id="login-username"
                name="username"
                type="text"
                value={username}
                onChange={event => setUsername(event.target.value)}
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
                <LockKeyhole
                  className="login-field-icon"
                  size={17}
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
                  <Eye size={18} aria-hidden="true" />
                </button>
              </div>
            </div>

            {feedback && (
              <p className="login-error" role="alert">
                {feedback}
              </p>
            )}

            <button
              className="login-submit"
              type="submit"
              disabled={submitDisabled}
            >
              <span>{isSubmitting ? "Entrando…" : "Entrar"}</span>
              {!isSubmitting && <ArrowRight size={17} aria-hidden="true" />}
            </button>
          </form>

          <p className="login-notice">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>
              Acesso à demonstração • dados sintéticos. Não utilize dados
              financeiros reais.
            </span>
          </p>
        </div>
      </section>
    </main>
  );
}

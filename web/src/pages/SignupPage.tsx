import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function SignupPage() {
  const { session, loading, signUp } = useAuth();
  const navigate = useNavigate();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await signUp(email, password, nome.trim() || undefined);
      // If email confirmation is on, there is no session yet — tell the user.
      // If it is off, the auth listener will set a session and the guard above
      // redirects on the next render.
      setMessage(
        'Conta criada! Se a confirmação por e-mail estiver ativa, verifique sua caixa de entrada antes de entrar.',
      );
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar conta.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="brand brand-lg">OLLI</div>
        <h1 className="auth-title">Criar conta</h1>

        <label className="field">
          <span>Nome (opcional)</span>
          <input
            type="text"
            autoComplete="name"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </label>

        <label className="field">
          <span>E-mail</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Senha</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <p className="error">{error}</p>}
        {message && <p className="muted">{message}</p>}

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Criando…' : 'Criar conta'}
        </button>

        <p className="auth-alt">
          Já tem conta? <Link to="/login">Entrar</Link>
        </p>
      </form>
    </div>
  );
}

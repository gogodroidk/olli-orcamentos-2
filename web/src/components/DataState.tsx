import type { ReactNode } from 'react';

/**
 * Renders loading / error / empty placeholders for an async list, or the
 * children when data is present. Keeps every list page from repeating the
 * same three guards.
 */
interface DataStateProps {
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
  emptyLabel?: string;
  children: ReactNode;
}

export function DataState({
  loading,
  error,
  isEmpty,
  emptyLabel = 'Nada por aqui ainda.',
  children,
}: DataStateProps) {
  if (loading) return <p className="muted">Carregando…</p>;
  if (error) return <p className="error">Erro: {error}</p>;
  if (isEmpty) return <p className="muted">{emptyLabel}</p>;
  return <>{children}</>;
}

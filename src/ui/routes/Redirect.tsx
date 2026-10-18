import { Navigate, useLocation, useParams } from 'react-router-dom';

/** A route that moved: `to` may name the old route's params (":tid"); the query string comes along. */
export function Redirect({ to }: { to: string }) {
  const params = useParams();
  const { search } = useLocation();
  const path = to.replace(/:(\w+)/g, (_, k: string) => encodeURIComponent(params[k] ?? ''));
  const [base, q] = path.split('?');
  const merged = new URLSearchParams(search);
  for (const [k, v] of new URLSearchParams(q ?? '')) merged.set(k, v);
  const qs = merged.toString();
  return <Navigate to={`${base}${qs ? `?${qs}` : ''}`} replace />;
}

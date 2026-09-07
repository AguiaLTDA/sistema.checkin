import type { StatusRegistro } from '@univc/shared';
import { ROTULOS_STATUS } from '@univc/shared';
import type { ReactNode } from 'react';
import { CORES_STATUS } from '../lib/formato';

export function EtiquetaStatus({ status }: { status: StatusRegistro }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${CORES_STATUS[status]}`}
    >
      {ROTULOS_STATUS[status]}
    </span>
  );
}

export function Aviso({
  tom = 'info',
  children,
}: {
  tom?: 'sucesso' | 'atencao' | 'erro' | 'info';
  children: ReactNode;
}) {
  const cores = {
    sucesso: 'bg-emerald-50 text-emerald-900 ring-emerald-600/20',
    atencao: 'bg-amber-50 text-amber-900 ring-amber-600/20',
    erro: 'bg-rose-50 text-rose-800 ring-rose-600/20',
    info: 'bg-sky-50 text-sky-900 ring-sky-600/20',
  }[tom];

  return (
    <div className={`whitespace-pre-line rounded-xl px-4 py-3 text-sm ring-1 ring-inset ${cores}`}>
      {children}
    </div>
  );
}

export function Botao({
  children,
  variante = 'primario',
  carregando = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'secundario';
  carregando?: boolean;
}) {
  const cores = {
    primario: 'bg-univc-700 text-white active:bg-univc-900',
    secundario: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 active:bg-slate-50',
  }[variante];

  return (
    <button
      {...props}
      disabled={props.disabled || carregando}
      className={`inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-base font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${cores} ${props.className ?? ''}`}
    >
      {carregando ? 'Enviando...' : children}
    </button>
  );
}

export function Cartao({
  titulo,
  children,
}: {
  titulo?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      {titulo && (
        <h2 className="mb-2 text-sm font-bold text-slate-800">{titulo}</h2>
      )}
      {children}
    </section>
  );
}

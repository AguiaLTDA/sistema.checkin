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

export function Alerta({
  tom = 'erro',
  children,
}: {
  tom?: 'erro' | 'aviso' | 'info';
  children: ReactNode;
}) {
  const cores = {
    erro: 'bg-rose-50 text-rose-800 ring-rose-600/20',
    aviso: 'bg-amber-50 text-amber-900 ring-amber-600/20',
    info: 'bg-sky-50 text-sky-900 ring-sky-600/20',
  }[tom];

  return (
    <div className={`rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${cores}`}>
      {children}
    </div>
  );
}

export function Campo({
  rotulo,
  children,
}: {
  rotulo: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-600">{rotulo}</span>
      {children}
    </label>
  );
}

export const classesInput =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-univc-500 focus:ring-2 focus:ring-univc-500/30 disabled:bg-slate-100';

export function Botao({
  children,
  variante = 'primario',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'secundario' | 'perigo';
}) {
  const cores = {
    primario: 'bg-univc-700 text-white hover:bg-univc-900',
    secundario: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50',
    perigo: 'bg-rose-600 text-white hover:bg-rose-700',
  }[variante];

  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${cores} ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

export function Cartao({
  titulo,
  acoes,
  children,
}: {
  titulo?: string;
  acoes?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      {(titulo || acoes) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          {titulo && (
            <h2 className="text-base font-semibold text-slate-800">{titulo}</h2>
          )}
          {acoes}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return (
    <p className="py-8 text-center text-sm text-slate-500">{children}</p>
  );
}

'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck2,
  Home,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import { Brand } from '@/components/branding/brand';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ErrorScreenKind = 'not-found' | 'route-error' | 'global-error';

interface ErrorScreenProps {
  kind: ErrorScreenKind;
  digest?: string;
  onRetry?: () => void;
}

const ERROR_COPY: Record<
  ErrorScreenKind,
  {
    eyebrow: string;
    title: string;
    description: string;
    primaryLabel: string;
    secondaryLabel: string;
    secondaryHref: string;
    badge: string;
  }
> = {
  'not-found': {
    eyebrow: '404',
    title: 'Страница не найдена',
    description:
      'Похоже, эта страница больше не существует или ссылка была изменена. Вернитесь на главную страницу и продолжите работу.',
    primaryLabel: 'На главную',
    secondaryLabel: 'Войти',
    secondaryHref: '/login',
    badge: 'Ссылка неактивна',
  },
  'route-error': {
    eyebrow: 'Сбой',
    title: 'Что-то пошло не так',
    description:
      'Интерфейс остановлен в безопасном состоянии. Попробуйте обновить раздел или вернитесь на главную страницу.',
    primaryLabel: 'Повторить',
    secondaryLabel: 'На главную',
    secondaryHref: '/',
    badge: 'Можно повторить',
  },
  'global-error': {
    eyebrow: 'Ошибка',
    title: 'Система временно недоступна',
    description:
      'Не удалось загрузить приложение целиком. Обновите страницу, а если ошибка повторится, мы быстро разберемся.',
    primaryLabel: 'Обновить',
    secondaryLabel: 'На главную',
    secondaryHref: '/',
    badge: 'Безопасный режим',
  },
};

const SUPPORT_ITEMS = [
  { icon: CalendarCheck2, label: 'Записи', text: 'Расписание сохранено' },
  { icon: Stethoscope, label: 'Пациенты', text: 'Данные защищены' },
  { icon: ShieldCheck, label: 'Доступ', text: 'Сессия под контролем' },
];

export function ErrorScreen({ kind, digest, onRetry }: ErrorScreenProps) {
  const copy = ERROR_COPY[kind];
  const canRetry = typeof onRetry === 'function';

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5f9ff] text-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(37,99,235,0.16),transparent_28%),radial-gradient(circle_at_82%_16%,rgba(20,184,166,0.12),transparent_30%),linear-gradient(180deg,#ffffff_0%,#eef6ff_100%)]" />
      <div className="pointer-events-none absolute left-1/2 top-20 h-80 w-80 -translate-x-1/2 rounded-full bg-blue-200/30 blur-3xl" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between">
          <Brand href="/" variant="text" priority textClassName="w-28 sm:w-34" />
          <div className="hidden items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Identa
          </div>
        </header>

        <div className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[0.94fr_1.06fr] lg:py-14">
          <div className="max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/85 px-3 py-2 text-xs font-bold uppercase tracking-[0.26em] text-blue-700 shadow-sm">
              <AlertTriangle className="size-4" />
              {copy.eyebrow}
            </div>

            <h1 className="text-balance text-4xl font-black tracking-[-0.045em] text-slate-950 sm:text-5xl lg:text-6xl">
              {copy.title}
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-base leading-7 text-slate-600 sm:text-lg">
              {copy.description}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {canRetry ? (
                <Button
                  type="button"
                  onClick={onRetry}
                  size="lg"
                  className="h-12 rounded-2xl bg-slate-950 px-6 text-white shadow-lg shadow-blue-950/10"
                >
                  <RefreshCw className="size-4" />
                  {copy.primaryLabel}
                </Button>
              ) : (
                <Button
                  asChild
                  size="lg"
                  className="h-12 rounded-2xl bg-slate-950 px-6 text-white shadow-lg shadow-blue-950/10"
                >
                  <Link href="/">
                    <Home className="size-4" />
                    {copy.primaryLabel}
                  </Link>
                </Button>
              )}

              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-12 rounded-2xl border-slate-200 bg-white/85 px-6 text-slate-900 shadow-sm"
              >
                <Link href={copy.secondaryHref}>
                  {copy.secondaryLabel}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>

            {digest ? (
              <p className="mt-6 max-w-xl rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-xs text-slate-500">
                Код ошибки: <span className="font-mono text-slate-700">{digest}</span>
              </p>
            ) : null}
          </div>

          <div className="relative">
            <div className="rounded-[2rem] border border-blue-100 bg-white/80 p-4 shadow-2xl shadow-blue-950/10 backdrop-blur sm:p-6">
              <div className="rounded-[1.5rem] border border-slate-200 bg-gradient-to-br from-white to-blue-50 p-5 sm:p-7">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-blue-600">
                      Identa status
                    </p>
                    <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-slate-950">
                      Работа под контролем
                    </h2>
                  </div>
                  <span className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-bold text-white">
                    {copy.badge}
                  </span>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {SUPPORT_ITEMS.map((item) => {
                    const Icon = item.icon;

                    return (
                      <div
                        key={item.label}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex size-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                          <Icon className="size-5" />
                        </div>
                        <p className="mt-4 text-sm font-bold text-slate-950">{item.label}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{item.text}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <div>
                      <p className="text-sm font-bold text-slate-950">План восстановления</p>
                      <p className="text-xs text-slate-500">Быстрый маршрут обратно в систему</p>
                    </div>
                    <div className="flex gap-1.5">
                      <span className="size-2 rounded-full bg-red-300" />
                      <span className="size-2 rounded-full bg-amber-300" />
                      <span className="size-2 rounded-full bg-emerald-300" />
                    </div>
                  </div>

                  <div className="space-y-3 p-5">
                    {['Проверьте адрес страницы', 'Повторите действие', 'Вернитесь в рабочий раздел'].map(
                      (step, index) => (
                        <div
                          key={step}
                          className={cn(
                            'flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold',
                            index === 0 && 'border-blue-100 bg-blue-50/70 text-blue-950',
                            index === 1 && 'border-emerald-100 bg-emerald-50/70 text-emerald-950',
                            index === 2 && 'border-slate-100 bg-slate-50 text-slate-700',
                          )}
                        >
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black shadow-sm">
                            {index + 1}
                          </span>
                          {step}
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

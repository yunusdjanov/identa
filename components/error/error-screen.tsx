'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CalendarCheck2,
  Home,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Brand } from '@/components/branding/brand';
import { Button } from '@/components/ui/button';

type ErrorScreenKind = 'not-found' | 'route-error' | 'global-error';

interface ErrorScreenProps {
  kind: ErrorScreenKind;
  digest?: string;
  onRetry?: () => void;
}

const ERROR_COPY: Record<
  ErrorScreenKind,
  {
    code: string;
    badge: string;
    title: string;
    description: string;
    primaryLabel: string;
    secondaryLabel: string;
    secondaryHref: string;
    panelTitle: string;
    panelDescription: string;
    steps: string[];
  }
> = {
  'not-found': {
    code: '404',
    badge: 'Страница не найдена',
    title: 'Такой страницы в Identa нет',
    description:
      'Ссылка могла измениться, быть удалена или набрана с ошибкой. Данные клиники в безопасности, просто вернитесь в рабочий раздел.',
    primaryLabel: 'На главную',
    secondaryLabel: 'Войти',
    secondaryHref: '/login',
    panelTitle: 'Маршрут потерялся',
    panelDescription: 'Мы не нашли раздел по этому адресу.',
    steps: ['Проверьте адрес в строке браузера', 'Вернитесь на главную страницу', 'Откройте нужный раздел из меню'],
  },
  'route-error': {
    code: '500',
    badge: 'Временный сбой',
    title: 'Раздел не загрузился',
    description:
      'Интерфейс остановился в безопасном состоянии. Повторите загрузку, а если ошибка повторится, вернитесь на главную и продолжите работу оттуда.',
    primaryLabel: 'Повторить',
    secondaryLabel: 'На главную',
    secondaryHref: '/',
    panelTitle: 'Сбой обработан',
    panelDescription: 'Мы сохранили приложение в безопасном состоянии.',
    steps: ['Повторите загрузку раздела', 'Проверьте подключение к интернету', 'Вернитесь на главную, если сбой повторится'],
  },
  'global-error': {
    code: '503',
    badge: 'Сервис временно недоступен',
    title: 'Identa не смогла запуститься',
    description:
      'Приложение не загрузилось полностью. Обновите страницу через несколько секунд. Если проблема останется, мы сможем быстро найти её по коду ошибки.',
    primaryLabel: 'Обновить',
    secondaryLabel: 'На главную',
    secondaryHref: '/',
    panelTitle: 'Нужна перезагрузка',
    panelDescription: 'Это системная ошибка загрузки приложения.',
    steps: ['Обновите страницу', 'Подождите несколько секунд', 'Сообщите код ошибки, если он показан ниже'],
  },
};

const SIGNALS = [
  { icon: ShieldCheck, label: 'Данные защищены' },
  { icon: CalendarCheck2, label: 'Записи сохранены' },
  { icon: Sparkles, label: 'Можно продолжить' },
];

export function ErrorScreen({ kind, digest, onRetry }: ErrorScreenProps) {
  const copy = ERROR_COPY[kind];
  const canRetry = typeof onRetry === 'function';

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7fbff] text-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(37,99,235,0.11),transparent_30%),radial-gradient(circle_at_88%_14%,rgba(20,184,166,0.10),transparent_28%),linear-gradient(180deg,#ffffff_0%,#eef6ff_100%)]" />
      <div className="pointer-events-none absolute left-1/2 top-24 h-px w-[70vw] -translate-x-1/2 bg-gradient-to-r from-transparent via-blue-200 to-transparent" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between">
          <Brand href="/" variant="text" priority textClassName="w-28 sm:w-34" />
          <div className="rounded-full border border-blue-100 bg-white/85 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm shadow-blue-950/5">
            Identa
          </div>
        </header>

        <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[0.95fr_1.05fr] lg:py-14">
          <section className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/90 px-3 py-2 text-xs font-black uppercase tracking-[0.22em] text-blue-700 shadow-sm shadow-blue-100/70">
              <span className="flex h-5 min-w-9 items-center justify-center rounded-full bg-blue-600 px-2 text-[11px] text-white">
                {copy.code}
              </span>
              {copy.badge}
            </div>

            <h1 className="mt-6 max-w-2xl text-balance text-4xl font-black tracking-[-0.055em] text-slate-950 sm:text-5xl lg:text-6xl">
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
                className="h-12 rounded-2xl border-slate-200 bg-white/90 px-6 text-slate-900 shadow-sm"
              >
                <Link href={copy.secondaryHref}>
                  {copy.secondaryLabel}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
              {SIGNALS.map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm shadow-blue-950/5"
                  >
                    <Icon className="mb-2 size-4 text-blue-600" />
                    {item.label}
                  </div>
                );
              })}
            </div>

            {digest ? (
              <p className="mt-6 max-w-xl rounded-2xl border border-slate-200 bg-white/75 px-4 py-3 text-xs text-slate-500 shadow-sm">
                Код ошибки: <span className="font-mono font-semibold text-slate-700">{digest}</span>
              </p>
            ) : null}
          </section>

          <aside className="relative">
            <div className="absolute -inset-6 rounded-[3rem] bg-blue-200/20 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2.25rem] border border-blue-100 bg-white/82 p-4 shadow-2xl shadow-blue-950/10 backdrop-blur sm:p-5">
              <div className="rounded-[1.75rem] border border-slate-200 bg-gradient-to-br from-white via-white to-blue-50/70 p-5 sm:p-7">
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-600">
                      Recovery path
                    </p>
                    <h2 className="mt-3 text-2xl font-black tracking-[-0.035em] text-slate-950">
                      {copy.panelTitle}
                    </h2>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
                      {copy.panelDescription}
                    </p>
                  </div>
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/15">
                    <Route className="size-5" />
                  </span>
                </div>

                <div className="relative mt-8 space-y-4">
                  <div className="absolute bottom-8 left-6 top-8 w-px bg-gradient-to-b from-blue-200 via-blue-200 to-transparent" />
                  {copy.steps.map((step, index) => (
                    <div
                      key={step}
                      className="relative flex gap-4 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm shadow-blue-950/5"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-sm font-black text-blue-700">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-950">{step}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {index === 0
                            ? 'Начните с самого быстрого действия.'
                            : index === 1
                              ? 'Обычно этого достаточно, чтобы продолжить.'
                              : 'Если нужно, вернитесь в стабильную точку.'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm leading-6 text-blue-950">
                  Если вы попали сюда из рабочего раздела, изменения не применялись автоматически. Повторите действие после возврата.
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

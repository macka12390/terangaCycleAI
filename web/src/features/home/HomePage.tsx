import {
  ArrowRight,
  BarChart3,
  Camera,
  Globe2,
  Leaf,
  LogIn,
  MapPin,
  QrCode,
  Recycle,
  ShieldCheck,
  Sparkles,
  Truck,
  UserRound,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { PATHS } from '../../paths.ts'
import { Logo } from '../../ui/Logo.tsx'
import { useFocusOnMount } from '../../ui/useFocusOnMount.ts'

// Accueil (cahier des charges §3.1) : valeur du projet en un coup d'œil, problème,
// fonctionnement en quatre étapes, piliers et accès aux espaces (citoyen et démonstration).

const STEPS = [
  { key: 'report', Icon: Camera },
  { key: 'moderate', Icon: ShieldCheck },
  { key: 'collect', Icon: Truck },
  { key: 'measure', Icon: BarChart3 },
] as const

const PILLARS = [
  { key: 'sovereign', Icon: Globe2 },
  { key: 'sustainable', Icon: Leaf },
  { key: 'inclusive', Icon: Users },
] as const

const SPACES = [
  { key: 'citizen', Icon: UserRound, to: PATHS.report },
  { key: 'collector', Icon: Truck, to: PATHS.demo },
  { key: 'admin', Icon: ShieldCheck, to: PATHS.demo },
] as const

/** Aperçu décoratif d'un signalement analysé (illustration, masquée aux lecteurs d'écran). */
function ReportPreview() {
  const { t } = useTranslation()
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-sm">
      <div className="absolute -inset-4 rounded-[2.5rem] bg-brand-400/20 blur-2xl" />
      <div className="relative rotate-1 rounded-[2rem] border border-white/10 bg-white p-4 shadow-lift">
        <div className="relative h-40 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 to-brand-400">
          <div className="absolute inset-0 bg-dots" />
          <Recycle className="absolute right-4 bottom-4 size-16 text-white/30" />
          <span className="absolute top-3 left-3 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-brand-900">
            <MapPin className="size-3.5" />
            Dakar-Plateau
          </span>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="font-mono text-sm font-bold text-brand-900">TC-2026-7KQ4MX</span>
          <span className="rounded-full bg-warning-bg px-2.5 py-1 text-xs font-bold text-warning-ink">
            {t('home.preview.pending')}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-mint p-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-white text-brand-600">
            <Sparkles className="size-5" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-bold text-ink">{t('home.preview.ai')}</p>
            <div className="mt-1 h-2 rounded-full bg-white">
              <div className="h-2 w-4/5 rounded-full bg-brand-600" />
            </div>
          </div>
          <span className="text-sm font-bold text-brand-900">82 %</span>
        </div>
      </div>
      <div className="absolute -bottom-6 -left-4 -rotate-3 rounded-2xl bg-white px-4 py-3 shadow-lift">
        <p className="text-xs text-muted">{t('home.preview.verified')}</p>
        <p className="text-xl font-bold text-brand-900">+ 23,5 kg</p>
      </div>
    </div>
  )
}

export function HomePage() {
  const { t } = useTranslation()
  const titleRef = useFocusOnMount<HTMLHeadingElement>()

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="relative overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-brand-700 text-white">
        <div aria-hidden="true" className="absolute inset-0 bg-dots" />
        <div aria-hidden="true" className="absolute -top-24 -right-24 size-96 rounded-full bg-brand-400/20 blur-3xl" />

        <nav aria-label={t('home.nav.label')} className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to={PATHS.home} aria-label="TerangaCycle AI" className="flex min-h-11 items-center gap-3 text-lg font-extrabold">
            <Logo className="size-11 rounded-xl shadow-card sm:size-12" />
            <span className="hidden sm:inline">TerangaCycle AI</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link to={PATHS.citizenQr} className="hidden min-h-11 items-center gap-2 rounded-xl px-3 font-semibold text-mint hover:bg-white/10 sm:flex">
              <QrCode aria-hidden="true" className="size-5" />
              {t('home.nav.qr')}
            </Link>
            <Link to={PATHS.demo} className="flex min-h-11 items-center rounded-xl px-3 font-semibold text-mint hover:bg-white/10">
              {t('home.nav.demo')}
            </Link>
            <Link
              to={PATHS.login}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-3 font-semibold text-white ring-1 ring-white/25 hover:bg-white/20"
            >
              <LogIn aria-hidden="true" className="size-5" />
              {t('home.login')}
            </Link>
          </div>
        </nav>

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-8 pb-20 lg:grid-cols-2 lg:pt-16 lg:pb-28">
          <div className="flex animate-fade-up flex-col gap-6">
            <Logo title="TerangaCycle AI" className="size-24 rounded-[1.75rem] shadow-lift ring-4 ring-white/15 sm:size-28 lg:size-32" />
            <span className="flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm font-semibold text-mint">
              <Sparkles aria-hidden="true" className="size-4 text-accent" />
              {t('home.badge')}
            </span>
            <h1 ref={titleRef} tabIndex={-1} className="text-5xl font-extrabold tracking-tight focus:outline-none sm:text-6xl">
              {t('app.name')}
            </h1>
            <p className="text-2xl font-semibold text-mint">{t('home.tagline')}</p>
            <p className="max-w-xl text-lg text-white/85">{t('home.pitch')}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                to={PATHS.report}
                className="group flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-accent px-6 text-lg font-bold text-ink shadow-lift transition hover:-translate-y-0.5"
              >
                <Camera aria-hidden="true" className="size-6" />
                {t('home.report')}
                <ArrowRight aria-hidden="true" className="size-5 transition group-hover:translate-x-1" />
              </Link>
              <Link
                to={PATHS.demo}
                className="flex min-h-14 items-center justify-center gap-3 rounded-2xl border-2 border-white/40 px-6 text-lg font-bold text-white transition hover:bg-white/10"
              >
                <Users aria-hidden="true" className="size-6" />
                {t('home.demoAccess')}
              </Link>
            </div>
            <p className="text-sm text-mint">{t('home.reportHint')}</p>
          </div>
          <div className="animate-fade-up [animation-delay:150ms]">
            <ReportPreview />
          </div>
        </div>
      </header>

      <main className="flex flex-col">
        <section aria-labelledby="pillars" className="relative -mt-10 px-4">
          <h2 id="pillars" className="sr-only">{t('home.pillars.title')}</h2>
          <ul className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-3">
            {PILLARS.map(({ key, Icon }) => (
              <li key={key} className="flex gap-4 rounded-3xl border border-line bg-white p-5 shadow-card">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-900 text-white">
                  <Icon aria-hidden="true" className="size-6" />
                </span>
                <span className="flex flex-col">
                  <span className="font-bold text-ink">{t(`home.pillars.${key}.title`)}</span>
                  <span className="text-sm text-muted">{t(`home.pillars.${key}.body`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="problem" className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-16 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <p className="text-sm font-bold tracking-wider text-brand-600 uppercase">{t('home.problem.kicker')}</p>
            <h2 id="problem" className="mt-2 text-3xl font-extrabold tracking-tight text-brand-900">
              {t('home.problem.title')}
            </h2>
          </div>
          <p className="text-lg text-ink lg:col-span-3">{t('home.problem.body')}</p>
        </section>

        <section aria-labelledby="how" className="bg-white py-16">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4">
            <div>
              <p className="text-sm font-bold tracking-wider text-brand-600 uppercase">{t('home.how.kicker')}</p>
              <h2 id="how" className="mt-2 text-3xl font-extrabold tracking-tight text-brand-900">
                {t('home.how.title')}
              </h2>
            </div>
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(({ key, Icon }, index) => (
                <li key={key} className="relative flex flex-col gap-3 rounded-3xl border border-line bg-surface p-6 transition hover:-translate-y-1 hover:shadow-card">
                  <span className="absolute top-5 right-5 text-4xl font-extrabold text-line">{index + 1}</span>
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-mint text-brand-600">
                    <Icon aria-hidden="true" className="size-6" />
                  </span>
                  <span className="font-bold text-ink">{t(`home.how.${key}.title`)}</span>
                  <span className="text-sm text-muted">{t(`home.how.${key}.body`)}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="spaces" className="mx-auto w-full max-w-6xl px-4 py-16">
          <p className="text-sm font-bold tracking-wider text-brand-600 uppercase">{t('home.spaces.kicker')}</p>
          <h2 id="spaces" className="mt-2 mb-8 text-3xl font-extrabold tracking-tight text-brand-900">
            {t('home.spaces.title')}
          </h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {SPACES.map(({ key, Icon, to }) => (
              <li key={key}>
                <Link
                  to={to}
                  className="group flex h-full flex-col gap-4 rounded-3xl border border-line bg-white p-6 shadow-card transition hover:-translate-y-1 hover:border-brand-600 hover:shadow-lift"
                >
                  <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-900 text-white">
                    <Icon aria-hidden="true" className="size-7" />
                  </span>
                  <span className="text-xl font-bold text-ink">{t(`home.spaces.${key}.title`)}</span>
                  <span className="flex-1 text-muted">{t(`home.spaces.${key}.body`)}</span>
                  <span className="flex items-center gap-1 font-bold text-brand-600">
                    {t('home.spaces.open')}
                    <ArrowRight aria-hidden="true" className="size-4 transition group-hover:translate-x-1" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="px-4 pb-16">
          <div className="relative mx-auto flex max-w-6xl flex-col items-start gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 to-brand-700 p-8 text-white sm:flex-row sm:items-center sm:justify-between">
            <div aria-hidden="true" className="absolute inset-0 bg-dots" />
            <p className="relative max-w-2xl text-lg font-semibold">{t('home.promise')}</p>
            <Link to={PATHS.report} className="relative flex min-h-12 shrink-0 items-center gap-2 rounded-2xl bg-accent px-5 font-bold text-ink">
              <Camera aria-hidden="true" className="size-5" />
              {t('home.reportNow')}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-white px-4 py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 text-sm text-muted sm:flex-row sm:justify-between">
          <span className="flex items-center gap-2 font-semibold text-ink">
            <Logo className="size-9 rounded-xl" />
            TerangaCycle AI
          </span>
          <span>{t('home.footer')}</span>
        </div>
      </footer>
    </div>
  )
}

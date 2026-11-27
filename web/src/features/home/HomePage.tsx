import { BarChart3, Camera, CheckCircle2, LogIn, ShieldCheck, Truck, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { PATHS } from '../../paths.ts'
import { Logo } from '../../ui/Logo.tsx'
import { useFocusOnMount } from '../../ui/useFocusOnMount.ts'

// Accueil (cahier des charges §3.1) : valeur du projet, problème, fonctionnement en
// quatre étapes, accès à l'espace citoyen et aux espaces de démonstration.

const STEPS = [
  { key: 'report', Icon: Camera },
  { key: 'moderate', Icon: ShieldCheck },
  { key: 'collect', Icon: Truck },
  { key: 'measure', Icon: BarChart3 },
] as const

export function HomePage() {
  const { t } = useTranslation()
  const titleRef = useFocusOnMount<HTMLHeadingElement>()

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="bg-gradient-to-br from-brand-900 to-brand-600 px-4 pt-10 pb-12 text-surface">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <Logo className="size-16 rounded-2xl shadow-lg ring-2 ring-surface/20" />
          <h1 ref={titleRef} tabIndex={-1} className="text-4xl font-bold focus:outline-none">
            {t('app.name')}
          </h1>
          <p className="text-xl text-mint">{t('home.tagline')}</p>
          <p className="max-w-2xl text-surface/90">{t('home.pitch')}</p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <Link
              to={PATHS.report}
              className="flex min-h-12 items-center justify-center gap-3 rounded-xl bg-accent px-5 font-bold text-ink"
            >
              <Camera aria-hidden="true" className="size-6" />
              {t('home.report')}
            </Link>
            <Link
              to={PATHS.demo}
              className="flex min-h-12 items-center justify-center gap-3 rounded-xl border-2 border-surface px-5 font-bold text-surface"
            >
              <Users aria-hidden="true" className="size-6" />
              {t('home.demoAccess')}
            </Link>
            <Link
              to={PATHS.login}
              className="flex min-h-12 items-center justify-center gap-3 rounded-xl border-2 border-surface/60 px-5 font-bold text-surface"
            >
              <LogIn aria-hidden="true" className="size-6" />
              {t('home.login')}
            </Link>
          </div>
          <p className="text-sm text-mint">{t('home.reportHint')}</p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-10">
        <section aria-labelledby="problem" className="flex flex-col gap-3">
          <h2 id="problem" className="text-2xl font-bold text-brand-900">
            {t('home.problem.title')}
          </h2>
          <p className="text-ink">{t('home.problem.body')}</p>
        </section>

        <section aria-labelledby="how" className="flex flex-col gap-4">
          <h2 id="how" className="text-2xl font-bold text-brand-900">
            {t('home.how.title')}
          </h2>
          <ol className="grid gap-3 sm:grid-cols-2">
            {STEPS.map(({ key, Icon }, index) => (
              <li key={key} className="flex gap-3 rounded-2xl border border-line p-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-mint text-brand-600">
                  <Icon aria-hidden="true" className="size-6" />
                </span>
                <span className="flex flex-col">
                  <span className="font-bold text-ink">
                    {index + 1}. {t(`home.how.${key}.title`)}
                  </span>
                  <span className="text-sm text-muted">{t(`home.how.${key}.body`)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex items-start gap-3 rounded-2xl bg-mint p-5">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-brand-600" />
          <p className="text-ink">{t('home.promise')}</p>
        </section>
      </main>
    </div>
  )
}

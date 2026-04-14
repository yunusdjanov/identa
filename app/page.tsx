'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';
import { useI18n } from '@/components/providers/i18n-provider';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import {
  Calendar,
  Users,
  CreditCard,
  FileText,
  CheckCircle,
  ArrowRight
} from 'lucide-react';

export default function LandingPage() {
  const { t } = useI18n();

  const features = [
    {
      icon: Users,
      title: t('landing.feature.patient.title'),
      description: t('landing.feature.patient.description'),
    },
    {
      icon: FileText,
      title: t('landing.feature.odontogram.title'),
      description: t('landing.feature.odontogram.description'),
    },
    {
      icon: Calendar,
      title: t('landing.feature.appointment.title'),
      description: t('landing.feature.appointment.description'),
    },
    {
      icon: CreditCard,
      title: t('landing.feature.payment.title'),
      description: t('landing.feature.payment.description'),
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-blue-600">Identa</h1>
            <div className="flex items-center gap-3">
              <LanguageSwitcher variant="compact" />
              <Link href="/login"><Button variant="outline">{t('landing.signIn')}</Button></Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
        <div className="text-center space-y-6 sm:space-y-8">
          <div className="space-y-3 sm:space-y-4">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900">
              {t('landing.hero.title')}
              <br />
              <span className="text-blue-600">{t('landing.hero.subtitle')}</span>
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 max-w-2xl mx-auto px-4">
              {t('landing.hero.description')}
            </p>
          </div>

          {/* Sign In Button */}
          <div className="flex flex-col items-center space-y-4">
            <Link href="/login">
              <Button
                size="lg"
                className="bg-white hover:bg-gray-50 text-gray-900 border border-gray-300 px-6 sm:px-8 py-5 sm:py-6 text-base sm:text-lg shadow-lg w-full sm:w-auto max-w-sm"
              >
                {t('landing.hero.cta')}
              </Button>
            </Link>
            <p className="text-sm text-gray-500">
              {t('landing.hero.demo')}
            </p>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="text-center mb-8 sm:mb-12">
          <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 sm:mb-4">
            {t('landing.features.title')}
          </h3>
          <p className="text-gray-600 px-4">
            {t('landing.features.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="border-2 hover:border-blue-200 transition-colors">
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Icon className="w-6 h-6 text-blue-600" />
                    </div>
                    <h4 className="font-semibold text-lg">{feature.title}</h4>
                    <p className="text-sm text-gray-600">{feature.description}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Benefits Section */}
      <section className="bg-blue-600 text-white py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12 items-center">
            <div className="space-y-4 sm:space-y-6">
              <h3 className="text-2xl sm:text-3xl font-bold">
                {t('landing.benefits.title')}
              </h3>
              <div className="space-y-3 sm:space-y-4">
                {[
                  t('landing.benefit.paperless'),
                  t('landing.benefit.conditions'),
                  t('landing.benefit.appointments'),
                  t('landing.benefit.debts'),
                  t('landing.benefit.access'),
                ].map((benefit) => (
                  <div key={benefit} className="flex items-start space-x-3">
                    <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 mt-0.5" />
                    <span className="text-base sm:text-lg">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-white/20">
              <div className="space-y-4 sm:space-y-6">
                <h4 className="text-xl sm:text-2xl font-bold">{t('landing.cta.ready')}</h4>
                <p className="text-blue-100 text-sm sm:text-base">
                  {t('landing.cta.description')}
                </p>
                <Link href="/login">
                  <Button
                    size="lg"
                    className="w-full bg-white text-blue-600 hover:bg-blue-50"
                  >
                    {t('landing.cta.button')}
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm">
            {t('landing.footer')}
          </p>
        </div>
      </footer>
    </div>
  );
}


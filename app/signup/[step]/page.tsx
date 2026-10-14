import { notFound } from 'next/navigation';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { STEP_IDS } from '@/components/onboarding/steps';

export const metadata = {
  title: 'Create your account · Ringgy AI',
  description: 'Set up your AI receptionist in a few minutes.',
};

export default async function SignupStepPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step } = await params;
  if (!STEP_IDS.includes(step)) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-white">
      <OnboardingWizard stepId={step} />
    </div>
  );
}

import { Suspense } from 'react';
import RegisterForm from '@/components/RegisterForm';

// RegisterForm is a client component using Next.js hooks — wrap in Suspense
// for consistent prerendering behaviour (same pattern as /login).
export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}

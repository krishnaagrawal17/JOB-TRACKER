import { Suspense } from 'react';
import LoginForm from '@/components/LoginForm';

// LoginForm calls useSearchParams(), which Next.js 15 requires to sit inside a
// Suspense boundary. Without this, `npm run build` fails during prerendering.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

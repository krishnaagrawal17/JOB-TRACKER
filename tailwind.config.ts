import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: '#010102',
        'surface-1': '#0f1011',
        'surface-2': '#141516',
        hairline: '#23252a',
        'hairline-strong': '#34343a',
        ink: '#f7f8f8',
        'ink-muted': '#d0d6e0',
        'ink-subtle': '#8a8f98',
        accent: {
          DEFAULT: '#5e6ad2',
          hover: '#828fff',
          focus: '#5e69d1',
        },
        'accent-foreground': 'hsl(var(--accent-foreground))',
        success: '#27a644',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      fontSize: {
        headline: ['28px', { lineHeight: '1.2', fontWeight: '600', letterSpacing: '-0.5px' }],
        'card-title': ['22px', { lineHeight: '1.3', fontWeight: '500', letterSpacing: '-0.4px' }],
        body: ['16px', { lineHeight: '1.5', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        caption: ['12px', { lineHeight: '1.4', fontWeight: '400' }],
        button: ['14px', { lineHeight: '1.2', fontWeight: '500' }],
      },
      spacing: {
        xs: '8px',
        sm: '12px',
        md: '16px',
        lg: '24px',
        xl: '32px',
      },
      borderRadius: {
        md: '8px',
        lg: '12px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;

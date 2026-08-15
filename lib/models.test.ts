import { TEXT_MODEL_SLUG, WEB_MODEL_SLUG } from './models';

describe('model slugs', () => {
  it('exports non-empty slug strings for both the text and web-search models', () => {
    expect(typeof TEXT_MODEL_SLUG).toBe('string');
    expect(TEXT_MODEL_SLUG.length).toBeGreaterThan(0);
    expect(typeof WEB_MODEL_SLUG).toBe('string');
    expect(WEB_MODEL_SLUG.length).toBeGreaterThan(0);
  });

  it('uses the provider/model-name slug convention', () => {
    expect(TEXT_MODEL_SLUG).toContain('/');
    expect(WEB_MODEL_SLUG).toContain('/');
  });
});

import { STAGES, ExtractedJobSchema } from './types';

describe('STAGES', () => {
  it('lists the five pipeline stages in board order', () => {
    expect(STAGES).toEqual(['wishlist', 'applied', 'interviewing', 'offer', 'rejected']);
  });
});

describe('ExtractedJobSchema', () => {
  it('fills in null/empty defaults for missing fields', () => {
    const result = ExtractedJobSchema.parse({ title: 'Engineer' });
    expect(result).toEqual({
      title: 'Engineer',
      company: null,
      location: null,
      salary: null,
      description: null,
      sourceUrl: null,
      extraFields: {},
    });
  });

  it('rejects a wrong-typed field', () => {
    expect(() => ExtractedJobSchema.parse({ title: 12345 })).toThrow();
  });
});

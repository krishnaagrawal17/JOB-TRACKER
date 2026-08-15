import { STAGES } from './types';

describe('STAGES', () => {
  it('lists the five pipeline stages in board order', () => {
    expect(STAGES).toEqual(['wishlist', 'applied', 'interviewing', 'offer', 'rejected']);
  });
});

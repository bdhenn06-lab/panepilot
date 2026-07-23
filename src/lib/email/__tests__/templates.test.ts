import { describe, expect, it } from 'vitest';
import { inviteEmail, reminderEmail } from '../templates';

describe('inviteEmail', () => {
  it('includes org name, accept link, and inviter', () => {
    const c = inviteEmail({
      orgName: 'Whiteline Window Washing',
      inviteUrl: 'https://app/invite/tok123',
      inviterEmail: 'boss@whiteline.com',
    });
    expect(c.subject).toContain('Whiteline Window Washing');
    expect(c.html).toContain('https://app/invite/tok123');
    expect(c.html).toContain('boss@whiteline.com');
    expect(c.text).toContain('https://app/invite/tok123');
  });

  it('escapes HTML in the org name to prevent injection', () => {
    const c = inviteEmail({ orgName: '<script>x</script>', inviteUrl: 'https://app/invite/t' });
    expect(c.html).not.toContain('<script>x</script>');
    expect(c.html).toContain('&lt;script&gt;');
  });

  it('falls back gracefully without an inviter', () => {
    const c = inviteEmail({ orgName: 'Acme', inviteUrl: 'https://app/invite/t' });
    expect(c.html).toContain('A teammate');
  });
});

describe('reminderEmail', () => {
  const due = [
    { address: '100 Vine St', owner: 'MERIDIAN LLC', touch: 2 },
    { address: '200 Main St', owner: 'QUEEN CITY LLC', touch: 0 },
  ];

  it('summarizes the due count and links to the queue', () => {
    const c = reminderEmail({ orgName: 'Whiteline', due, appUrl: 'https://app' });
    expect(c.subject).toContain('2 follow-ups due today');
    expect(c.html).toContain('100 Vine St');
    expect(c.html).toContain('https://app/follow-ups');
    expect(c.text).toContain('200 Main St');
  });

  it('uses singular for one due item', () => {
    const c = reminderEmail({ orgName: 'Whiteline', due: [due[0]], appUrl: 'https://app' });
    expect(c.subject).toContain('1 follow-up due today');
  });

  it('caps the list at 25 rows', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ address: `${i} St`, owner: 'X', touch: 1 }));
    const c = reminderEmail({ orgName: 'Whiteline', due: many, appUrl: 'https://app' });
    expect(c.subject).toContain('40 follow-ups'); // count reflects all
    expect((c.html.match(/touch 1\/5/g) || []).length).toBe(25); // rows capped
  });
});

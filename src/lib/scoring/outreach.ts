import { firstName } from './owner';
import { formatMoney, formatNum } from './format';
import type { Estimate, ParcelInput, ScoringSettings } from './types';

export interface EmailDraft {
  subject: string;
  body: string;
}

/**
 * "123 Main St, Cincinnati, OH 45202" from parcel fields. Each component is
 * omitted when absent, so an unconfigured region state can't produce a
 * malformed address in proposals or Google Maps links.
 */
export function fullAddress(p: ParcelInput, s: ScoringSettings): string {
  const street = String(p.address || '').trim();
  const city = String(p.city || '').trim();
  const zip = p.zip ? String(p.zip).slice(0, 5).trim() : '';
  const state = String(s.regionState || '').trim();
  const stateZip = [state, zip].filter(Boolean).join(' ');
  return [street, city, stateZip].filter(Boolean).join(', ');
}

export function streetOf(p: ParcelInput): string {
  return String(p.address || '').split(',')[0];
}

function commercialEmails(street: string, who: string, e: Estimate, s: ScoringSettings, sig: string): EmailDraft[] {
  const money = formatMoney;
  const num = formatNum;
  return [
    {
      subject: `${street} — exterior glass, priced from county records`,
      body: `Hi ${who},\n\nI run ${s.companyName} here in town. We priced the exterior glass at ${street} straight from county building records: roughly ${num(e.windows)} windows, about ${num(e.glassSqft)} sq ft.\n\nQuarterly service comes to ${money(e.annualQuarterly)}/year, crew and equipment included. No walkthrough needed to hold that number.\n\nWorth 10 minutes this week?\n\n${sig}`,
    },
    {
      subject: `Re: ${street} — the number, in writing`,
      body: `Hi ${who},\n\nFollowing up with the specifics so you have them on file:\n\n${street}\n• ~${num(e.windows)} windows / ${num(e.panes)} panes\n• ${money(e.pricePerClean)} per exterior clean\n• ${money(e.annualQuarterly)}/yr quarterly · ${money(e.annualMonthly)}/yr monthly\n\nIf you already have a vendor, keep this as your comparison number when renewal comes up.\n\n${sig}`,
    },
    {
      subject: `How buildings like ${street} handle this`,
      body: `Hi ${who},\n\nMost owners we work with had the same setup: a vendor they inherited, no real number to compare against, glass cleaned whenever someone remembered.\n\nThe switch usually happens when they see pricing built from their building's actual specs instead of a guy eyeballing it from the parking lot. That's the quote I sent — ${money(e.annualQuarterly)}/yr, quarterly, for ${street}.\n\nHappy to walk the building and confirm it any morning this week.\n\n${sig}`,
    },
    {
      subject: `"We've got a guy" — fair enough`,
      body: `Hi ${who},\n\nTotally understand if you've got someone. Two honest questions worth asking him:\n\n1. Is the price built from the building's actual glass area, or a round number?\n2. Is it in writing with a per-clean and annual figure?\n\nIf either answer is shaky, my quote for ${street} (${money(e.annualQuarterly)}/yr) is still on the table, and I'll match the walkthrough to your schedule.\n\n${sig}`,
    },
    {
      subject: `Closing the file on ${street}`,
      body: `Hi ${who},\n\nLast note from me — I'll close out the file on ${street} this week.\n\nThe quote stands if timing changes: ${money(e.annualQuarterly)}/yr quarterly, built from ~${num(e.windows)} windows on county record. Reply anytime and it's yours.\n\nGood luck with the building,\n${sig}`,
    },
  ];
}

function residentialEmails(street: string, who: string, e: Estimate, s: ScoringSettings, sig: string): EmailDraft[] {
  const money = formatMoney;
  const num = formatNum;
  return [
    {
      subject: `${street} — a window cleaning quote, no walkthrough needed`,
      body: `Hi ${who},\n\nI run ${s.companyName} here in town. Based on county property records, ${street} looks to have about ${num(e.windows)} windows.\n\nA full in-and-out clean comes to ${money(e.pricePerClean)} — no walkthrough needed to hold that number.\n\nWant me to pencil you in this week?\n\n${sig}`,
    },
    {
      subject: `Re: ${street} — the quote, in writing`,
      body: `Hi ${who},\n\nFollowing up with the specifics so you have them on file:\n\n${street}\n• ~${num(e.windows)} windows / ${num(e.panes)} panes\n• ${money(e.pricePerClean)} per full clean\n\nIf you'd rather keep it on a regular schedule instead of calling every time, that runs ${money(e.annualQuarterly)}/yr on the 4x/year plan or ${money(e.annualMonthly)}/yr monthly.\n\n${sig}`,
    },
    {
      subject: `How homeowners on ${street}'s block handle this`,
      body: `Hi ${who},\n\nMost folks we work with had the same story: it's been on the list for a while, but ladders and second-story windows make it easy to keep putting off.\n\nThe switch usually happens once they see a real number instead of guessing. That's the quote I sent — ${money(e.pricePerClean)} for ${street}, ${num(e.windows)} windows.\n\nHappy to swing by any morning this week.\n\n${sig}`,
    },
    {
      subject: `"We do it ourselves" — fair enough`,
      body: `Hi ${who},\n\nTotally understand. Just worth saying: most window-cleaning falls and near-misses happen on exactly this kind of job — ladders on uneven ground, reaching too far for the top corner.\n\nIf that ever gets old, my quote for ${street} (${money(e.pricePerClean)}) is still good, and I can usually get you on the schedule within a few days.\n\n${sig}`,
    },
    {
      subject: `Closing the file on ${street}`,
      body: `Hi ${who},\n\nLast note from me — I'll close out the file on ${street} this week.\n\nThe quote stands whenever timing works: ${money(e.pricePerClean)} for ~${num(e.windows)} windows on county record. Reply anytime and it's yours.\n\nHave a good one,\n${sig}`,
    },
  ];
}

/**
 * The 5-touch email sequence, personalized from the property's real numbers.
 * `touch` is 0-based (0 = first touch). Copy branches on service mode —
 * commercial (B2B, vendor-comparison framing) vs residential (homeowner,
 * seasonal framing) sell very differently.
 */
export function touchEmail(
  p: ParcelInput,
  e: Estimate,
  touch: number,
  s: ScoringSettings,
): EmailDraft {
  const street = streetOf(p);
  const who = firstName(p.ownerName);
  const sig = `${s.contactName || '[Your name]'}\n${s.companyName}${s.contactPhone ? '\n' + s.contactPhone : ''}`;
  const emails =
    s.serviceMode === 'residential'
      ? residentialEmails(street, who, e, s, sig)
      : commercialEmails(street, who, e, s, sig);
  return emails[Math.min(touch, emails.length - 1)];
}

/** Cold-call script personalized from the property's numbers. */
export function callScript(p: ParcelInput, e: Estimate, s: ScoringSettings): string {
  const street = streetOf(p);
  if (s.serviceMode === 'residential') {
    return (
      `CALL — ${street}\nAsk for: the homeowner\n\n` +
      `"Hi, this is ${s.contactName || '[name]'} with ${s.companyName}. Sorry to bother you — I was pricing out window ` +
      `cleaning for homes in the area using county property records, and ${street} came out to about ${formatNum(e.windows)} ` +
      `windows, ${formatMoney(e.pricePerClean)} for a full in-and-out clean. Is that something you'd ever want off your plate?"\n\n` +
      `Interested → book the visit NOW. Offer two time windows, never open-ended.\n` +
      `"Not right now" → "No worries — mind if I follow up before spring/fall cleaning season?"\n` +
      `"How'd you get this address" → "Public county property records — happy to text over the estimate so you have it."`
    );
  }
  return (
    `CALL — ${street}\nAsk for: ${p.ownerName || 'facilities manager / owner'}\n\n` +
    `"Hi, this is ${s.contactName || '[name]'} with ${s.companyName}. Quick one — calling about ${street}. ` +
    `We priced the exterior glass from county records: about ${formatNum(e.windows)} windows, ${formatMoney(e.pricePerClean)} a clean. ` +
    `Who handles the window contract over there?"\n\n` +
    `Gatekeeper → get the decision-maker's name + when they're in.\n` +
    `"We have a guy" → "Fair. When his renewal comes up you'll want a second number — can I email it so it's on file?"\n` +
    `Interested → book the walkthrough NOW. Offer two slots, never open-ended.`
  );
}

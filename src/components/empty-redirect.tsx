import Link from 'next/link';
import { Button } from '@/components/ui';

/** Shown by data views when no parcels are loaded yet. */
export function EmptyRedirect() {
  return (
    <div>
      <p className="text-base font-semibold mb-1.5">No territory loaded yet</p>
      <p className="text-[13px] text-ink2 mb-3">
        Import your county parcel file, or load the sample Cincinnati territory from Data, and the
        whole team shares the scored list.
      </p>
      <Link href="/import">
        <Button>Go to Data</Button>
      </Link>
    </div>
  );
}

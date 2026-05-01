// Priority calculator for show-captured leads.
// HOT  = booked-soon, large, venue selected (wedding) OR explicit corporate intent w/ date
// WARM = has date or large guest count, but missing one signal
// COLD = no date, no venue, low guest count

export type GuestBand = "Under 50" | "50-100" | "100-200" | "200+" | null;

export function calculateLeadPriority(input: {
  eventType?: string | null;
  eventDate?: string | null; // ISO date
  guestBand?: GuestBand;
  venueSelected?: boolean | null;
}): "HOT" | "WARM" | "COLD" {
  const { eventType, eventDate, guestBand, venueSelected } = input;

  const hasDate = !!eventDate;
  const within6mo =
    hasDate && new Date(eventDate!).getTime() - Date.now() < 1000 * 60 * 60 * 24 * 183;
  const large = guestBand === "100-200" || guestBand === "200+";

  // Wedding hot: venue selected + date within 6 months
  if (eventType === "Wedding" && venueSelected && within6mo) return "HOT";
  // Corporate/Catering hot: date within 6mo + 100+ guests
  if ((eventType === "Corporate" || eventType === "Catering") && within6mo && large) return "HOT";

  // Warm: any date OR large guest count
  if (hasDate || large) return "WARM";

  return "COLD";
}

export const GUEST_BANDS: Exclude<GuestBand, null>[] = [
  "Under 50",
  "50-100",
  "100-200",
  "200+",
];

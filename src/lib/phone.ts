// NANP area code -> IANA timezone. Used to keep every call inside the
// legal 8am-9pm window *in the called party's* local time (TCPA 47 CFR 64.1200).
const AREA_TZ: Record<string, string> = {};
const put = (tz: string, codes: string) => {
  for (const c of codes.split(/\s+/).filter(Boolean)) AREA_TZ[c] = tz;
};

put("America/New_York", `
  201 202 203 207 212 215 216 220 223 227 231 234 240 267 272 276 289 301 302 304 305 313 315 321 326 330 332 336 339
  343 347 351 352 364 365 380 386 401 404 407 410 412 413 416 419 434 437 438 440 443 445 447 448 450 463 464 469 470
  475 478 484 508 513 514 516 517 518 519 540 548 551 561 567 570 571 579 581 585 586 603 606 607 609 610 613 614 615
  616 617 623 626 631 636 646 647 656 657 667 669 673 680 681 683 686 689 703 704 705 706 716 717 718 723 724 726 727
  729 732 734 740 743 754 757 762 770 772 773 774 781 782 786 787 802 803 804 807 810 812 813 814 819 828 835 838 839
  843 845 848 850 854 856 857 859 860 862 863 864 865 872 873 878 902 904 905 908 910 912 914 917 919 929 934 937 939
  941 943 947 954 959 970 971 978 980 984 989`);
put("America/Chicago", `
  205 214 217 218 224 225 251 254 256 262 269 270 281 309 312 314 316 318 319 320 325 331 334 337 346 361 402 405 409
  414 415 417 430 432 445 447 456 458 469 479 501 502 504 505 507 512 515 531 534 539 563 573 574 580 601 602 605 608
  612 618 620 630 636 641 651 660 662 678 682 701 708 712 713 715 731 737 763 765 769 779 785 806 815 816 817 830 832
  847 850 870 872 903 913 915 918 920 928 930 931 936 940 952 956 972 979`);
put("America/Denver", `303 307 385 406 435 505 575 719 720 801 970 986`);
put("America/Phoenix", `480 520 602 623 928`);
put("America/Los_Angeles", `
  206 209 213 236 250 253 279 310 323 341 360 408 415 424 442 458 503 509 510 530 541 559 619 626 628 650 657 661 669
  707 714 725 747 760 771 775 778 805 818 831 858 909 916 925 949 951 971`);
put("America/Anchorage", `907`);
put("Pacific/Honolulu", `808`);

/**
 * Country calling code -> a representative timezone. Countries spanning several
 * zones get their most populous one, which is close enough to keep a call inside
 * daytime hours. NANP (+1) is handled by area code above and is not listed here.
 */
const COUNTRY_TZ: Record<string, string> = {
  "20": "Africa/Cairo",        "27": "Africa/Johannesburg", "30": "Europe/Athens",
  "31": "Europe/Amsterdam",    "32": "Europe/Brussels",     "33": "Europe/Paris",
  "34": "Europe/Madrid",       "36": "Europe/Budapest",     "39": "Europe/Rome",
  "40": "Europe/Bucharest",    "41": "Europe/Zurich",       "43": "Europe/Vienna",
  "44": "Europe/London",       "45": "Europe/Copenhagen",   "46": "Europe/Stockholm",
  "47": "Europe/Oslo",         "48": "Europe/Warsaw",       "49": "Europe/Berlin",
  "51": "America/Lima",        "52": "America/Mexico_City", "54": "America/Argentina/Buenos_Aires",
  "55": "America/Sao_Paulo",   "56": "America/Santiago",    "57": "America/Bogota",
  "60": "Asia/Kuala_Lumpur",   "61": "Australia/Sydney",    "62": "Asia/Jakarta",
  "63": "Asia/Manila",         "64": "Pacific/Auckland",    "65": "Asia/Singapore",
  "66": "Asia/Bangkok",        "7":  "Europe/Moscow",       "81": "Asia/Tokyo",
  "82": "Asia/Seoul",          "84": "Asia/Ho_Chi_Minh",    "86": "Asia/Shanghai",
  "90": "Europe/Istanbul",     "91": "Asia/Kolkata",        "92": "Asia/Karachi",
  "94": "Asia/Colombo",        "98": "Asia/Tehran",
  "212": "Africa/Casablanca",  "234": "Africa/Lagos",       "254": "Africa/Nairobi",
  "351": "Europe/Lisbon",      "352": "Europe/Luxembourg",  "353": "Europe/Dublin",
  "358": "Europe/Helsinki",    "370": "Europe/Vilnius",     "380": "Europe/Kyiv",
  "420": "Europe/Prague",      "421": "Europe/Bratislava",  "852": "Asia/Hong_Kong",
  "855": "Asia/Phnom_Penh",    "880": "Asia/Dhaka",         "886": "Asia/Taipei",
  "960": "Indian/Maldives",    "961": "Asia/Beirut",        "962": "Asia/Amman",
  "965": "Asia/Kuwait",        "966": "Asia/Riyadh",        "968": "Asia/Muscat",
  "971": "Asia/Dubai",         "972": "Asia/Jerusalem",     "974": "Asia/Qatar",
  "977": "Asia/Kathmandu",
};

/**
 * The timezone the calling window is judged against. Getting this wrong means
 * calling someone at the wrong hour of their day, so an unrecognised country
 * code resolves to UTC rather than silently borrowing a US zone.
 */
export function timezoneForPhone(e164: string): string {
  const nanp = /^\+1(\d{3})/.exec(e164);
  if (nanp) return AREA_TZ[nanp[1]] ?? "America/New_York";

  const digits = e164.replace(/^\+/, "");
  for (const len of [3, 2, 1]) {
    const tz = COUNTRY_TZ[digits.slice(0, len)];
    if (tz) return tz;
  }
  return "UTC";
}

export type ParsedPhone = { ok: true; e164: string } | { ok: false; reason: string };

/** Normalize loose user input to E.164. Assumes US/Canada when no country code. */
export function normalizePhone(input: string): ParsedPhone {
  const raw = String(input || "").trim();
  if (!raw) return { ok: false, reason: "empty" };

  const hasPlus = raw.trimStart().startsWith("+");
  let digits = raw.replace(/[^\d]/g, "");
  if (!digits) return { ok: false, reason: "no digits" };

  if (hasPlus) {
    if (digits.length < 8 || digits.length > 15) return { ok: false, reason: "bad length" };
    return { ok: true, e164: "+" + digits };
  }
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return { ok: false, reason: `expected 10 digits, got ${digits.length}` };
  if (/^[01]/.test(digits)) return { ok: false, reason: "invalid area code" };
  if (/^\d{3}[01]/.test(digits)) return { ok: false, reason: "invalid exchange code" };
  return { ok: true, e164: "+1" + digits };
}

export function formatPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

/** Local hour (0-23) and weekday at the contact's location, right now. */
export function localTimeAt(tz: string, at = new Date()): { hour: number; minute: number; weekday: string; label: string } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  return {
    hour, minute,
    weekday: parts.weekday || "",
    label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${parts.weekday}`,
  };
}

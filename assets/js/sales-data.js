// Sales calendar data (Hebrew) – editable
// Fields used by the calendar:
// - startDate: YYYY-MM-DD (used for sorting + grouping)
// - title: event name
// - when: date label shown on the card
// - tag: small category pill (optional)
// - description: short sentence (optional)
// - focus: array of small “what to buy / focus” chips (optional)

window.SALES_DATA = [
  // ===== December (previous year) =====
  {
    startDate: "2025-12-14",
    title: "Green Monday / Super Saturday",
    when: "14.12 ו־19.12",
    tag: "סייל גדול",
    description: "הנחות לפני סגירת המשלוחים – זמן טוב לקניות של הרגע האחרון.",
    focus: ["מתנות", "דילים של משלוחים", "רגע אחרון"]
  },
  {
    startDate: "2025-12-26",
    title: "Boxing Day",
    when: "26.12",
    tag: "סייל גדול",
    description: "ניקוי מלאי אחרי החגים – במיוחד באופנה ובמוצרים עונתיים.",
    focus: ["אופנה", "ניקוי מלאי", "דילים אחרי חג"]
  },

  // ===== January =====
  {
    startDate: "2026-01-01",
    title: "סייל תחילת שנה / חורף",
    when: "1–15.1",
    tag: "סייל גדול",
    description: "הזדמנות מעולה למלאי חורף – וגם להתחלה מסודרת לשנה החדשה.",
    focus: ["כושר", "ארגון", "פינוי מלאי חורף"]
  },
  {
    startDate: "2026-01-05",
    title: "Love Your Skin Event (Ulta)",
    when: "ינואר (מבצעים יומיים)",
    tag: "מבצע עונתי",
    description: "דילים יומיים עד 50% על טיפוח יוקרתי.",
    focus: ["טיפוח עור יוקרתי", "דילים יומיים", "עד 50%"]
  },
  {
    startDate: "2026-01-01",
    title: "סייל בריאות לשנה החדשה (iHerb)",
    when: "ינואר (1–15.1)",
    tag: "מבצע עונתי",
    description: "הנחות רחבות על תוספים, ויטמינים וטיפוח טבעי.",
    focus: ["תוספים", "ויטמינים", "טיפוח טבעי"]
  },

  // ===== February =====
  {
    startDate: "2026-02-01",
    title: "סייל ולנטיינ׳ס",
    when: "1–14.2",
    tag: "מבצע עונתי",
    description: "מתנות קלאסיות – וגם מבצעים על מותגי יוקרה.",
    focus: ["תכשיטים", "פרחים", "שוקולד", "מתנות יוקרה"]
  },
  {
    startDate: "2026-02-16",
    title: "Presidents' Day (ארה״ב)",
    when: "16.2",
    tag: "סייל גדול",
    description: "תקופה חזקה למוצרים גדולים לבית ולחיסכון משמעותי.",
    focus: ["רהיטים", "מזרנים", "מכשירי חשמל גדולים"]
  },

  // ===== March =====
  {
    startDate: "2026-03-01",
    title: "21 ימים של יופי (Ulta) – אביב",
    when: "מרץ (מבצעים יומיים)",
    tag: "מבצע עונתי",
    description: "‘Beauty Steals’ יומיים – 50% הנחה על מוצרים נבחרים (איפור יוקרתי).",
    focus: ["איפור יוקרתי", "דילים יומיים", "50% הנחה"]
  },
  {
    startDate: "2026-03-20",
    title: "Amazon Big Spring Sale",
    when: "סוף מרץ",
    tag: "סייל גדול",
    description: "מעולה לאביב: בית, ניקיון, אופנה, וגם ביוטי במחירים טובים.",
    focus: ["מוצרי בית", "ניקיון", "אופנת אביב", "ביוטי"]
  },
  {
    startDate: "2026-03-25",
    title: "Amazon Spring Sale (כללי)",
    when: "סוף מרץ",
    tag: "סייל גדול",
    description: "דילים עונתיים מוקדמים – בעיקר לבית וליום‑יום.",
    focus: ["מוצרי בית", "ניקיון", "אופנת אביב מוקדמת"]
  },

  // ===== April =====
  {
    startDate: "2026-04-03",
    title: "סייל פסחא",
    when: "3–6.4",
    tag: "מבצע עונתי",
    description: "מבצעים על ממתקים, דקור לבית ואופנת אביב.",
    focus: ["ממתקים", "אופנת אביב", "דקור לבית"]
  },
  {
    startDate: "2026-04-10",
    title: "Spring Savings Event (Sephora)",
    when: "אפריל (תאריכים משתנים)",
    tag: "מבצע עונתי",
    description: "הנחות מדורגות (10%–20%) לפי חברות מועדון – לרוב על מגוון רחב באתר.",
    focus: ["10%–20% הנחה", "סטים", "מותגים מובילים"]
  },

  // ===== May =====
  {
    startDate: "2026-05-10",
    title: "Mother’s Day (ארה״ב)",
    when: "10.5",
    tag: "מבצע עונתי",
    description: "דילים יפים על מתנות – במיוחד ביוטי ותכשיטים.",
    focus: ["ביוטי", "תכשיטים", "מתנות אישיות"]
  },
  {
    startDate: "2026-05-25",
    title: "Memorial Day (ארה״ב)",
    when: "25.5",
    tag: "סייל גדול",
    description: "פתיחת קיץ: דילים חזקים על מוצרים גדולים וגם אופנה.",
    focus: ["ריהוט חוץ", "גרילים", "אופנת קיץ"]
  },

  // ===== June =====
  {
    startDate: "2026-06-21",
    title: "Father’s Day / Mid‑Year",
    when: "21.6",
    tag: "מבצע עונתי",
    description: "שווה לבדוק דילים על גאדג'טים, כלים ומתנות.",
    focus: ["כלי עבודה", "גאדג׳טים", "מתנות לאבא"]
  },

  // ===== July =====
  {
    startDate: "2026-07-15",
    title: "Amazon Prime Day",
    when: "אמצע יולי (TBA)",
    tag: "סייל גדול",
    description: "הנחות חזקות על אלקטרוניקה, בית חכם, ומוצרים של אמזון – וגם ביוטי ויראלי.",
    focus: ["אלקטרוניקה", "בית חכם", "מכשירי אמזון", "ביוטי ויראלי"]
  },

  // ===== August =====
  {
    startDate: "2026-08-01",
    title: "סייל חזרה ללימודים",
    when: "כל אוגוסט",
    tag: "מבצע עונתי",
    description: "מלאי לקראת ספטמבר – ציוד, תיקים, ולפטופים.",
    focus: ["מחברות", "לפטופים", "תיקים", "בגדי ילדים"]
  },
  {
    startDate: "2026-08-15",
    title: "Anniversary Sale (iHerb)",
    when: "אוגוסט (תאריכים משתנים)",
    tag: "מבצע עונתי",
    description: "הנחות רחבות באתר לרגל יום הולדת – במיוחד על תוספים וטיפוח טבעי.",
    focus: ["הנחות רחבות", "תוספים", "טיפוח טבעי"]
  },

  // ===== September =====
  {
    startDate: "2026-09-07",
    title: "Labor Day (ארה״ב)",
    when: "7.9",
    tag: "סייל גדול",
    description: "אחד הסיילים החזקים למוצרים גדולים וניקוי מלאי קיץ.",
    focus: ["מזרנים", "מכשירי חשמל גדולים", "ניקוי מלאי קיץ"]
  },
  {
    startDate: "2026-09-10",
    title: "21 ימים של יופי (Ulta) – סתיו",
    when: "ספטמבר (מבצעים יומיים)",
    tag: "מבצע עונתי",
    description: "סבב נוסף של ‘Beauty Steals’ – 50% הנחה על מוצרים יוקרתיים נבחרים.",
    focus: ["איפור יוקרתי", "דילים יומיים", "50% הנחה"]
  },

  // ===== October =====
  {
    startDate: "2026-10-05",
    title: "Prime Big Deal Days",
    when: "תחילת אוקטובר (TBA)",
    tag: "סייל גדול",
    description: "דילים מוקדמים לחגים – מעולה לסטים ולחידוש מלאי.",
    focus: ["סטים למתנה", "דילים מוקדמים", "טכנולוגיה"]
  },
  {
    startDate: "2026-10-12",
    title: "Holiday Beauty Haul (Amazon)",
    when: "אוקטובר",
    tag: "מבצע עונתי",
    description: "סטים לחגים ועד 50% הנחה על מותגי ביוטי מובילים.",
    focus: ["סטים לחגים", "עד 50%", "מותגים מובילים"]
  },

  // ===== November =====
  {
    startDate: "2026-11-11",
    title: "Singles’ Day / 11.11 (גלובלי)",
    when: "11.11",
    tag: "סייל גדול",
    description: "אחד הסיילים הגדולים ברשת – חזק במיוחד ב־K‑Beauty ובמותגי intl.",
    focus: ["K‑Beauty", "ביוטי", "טכנולוגיה", "אופנה"]
  },
  {
    startDate: "2026-11-15",
    title: "Fall Savings Event (Sephora)",
    when: "נובמבר (תאריכים משתנים)",
    tag: "מבצע עונתי",
    description: "בדרך כלל הסייל הגדול של השנה בספורה – 10%–20% הנחה על מגוון רחב.",
    focus: ["10%–20% הנחה", "מותגים מובילים", "סטים לחורף"]
  },
  {
    startDate: "2026-11-27",
    title: "Black Friday",
    when: "27.11",
    tag: "סייל גדול",
    description: "הנחות ענק באתרי קניות – במיוחד באלקטרוניקה וב‘דיל‑באסטרים’.",
    focus: ["דיל‑באסטרים", "אלקטרוניקה", "הנחות רוחביות"]
  },
  {
    startDate: "2026-11-30",
    title: "Cyber Monday",
    when: "30.11",
    tag: "סייל גדול",
    description: "דילים אונליין – טוב לתוכנות, אביזרים וגאדג׳טים קטנים.",
    focus: ["דילים אונליין", "תוכנה", "גאדג׳טים קטנים"]
  }
];

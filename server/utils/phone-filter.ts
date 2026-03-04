const italianNumbers = [
  "zero", "uno", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove",
  "dieci", "undici", "dodici", "tredici", "quattordici", "quindici", "sedici",
  "diciassette", "diciotto", "diciannove", "venti", "trenta", "quaranta",
  "cinquanta", "sessanta", "settanta", "ottanta", "novanta", "cento",
];

const englishNumbers = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty",
  "fifty", "sixty", "seventy", "eighty", "ninety", "hundred",
];

const allNumberWords = new Set([...italianNumbers, ...englishNumbers]);

function containsPhoneNumber(text: string): boolean {
  const digitPattern = /\d{3,}/;
  const spacedDigitPattern = /\d[\s.\-]*\d[\s.\-]*\d[\s.\-]*\d/;
  if (digitPattern.test(text) || spacedDigitPattern.test(text)) return true;

  const words = text.toLowerCase().split(/[\s,;.!?]+/);
  let consecutiveNumberWords = 0;
  for (const word of words) {
    if (allNumberWords.has(word)) {
      consecutiveNumberWords++;
      if (consecutiveNumberWords >= 3) return true;
    } else {
      consecutiveNumberWords = 0;
    }
  }

  return false;
}

export function shouldWarnPhoneNumber(
  currentMessage: string,
  recentMessages: { content: string | null }[]
): boolean {
  if (!containsPhoneNumber(currentMessage)) return false;

  const previousHadNumber = recentMessages.some(
    (msg) => msg.content && containsPhoneNumber(msg.content)
  );

  return previousHadNumber;
}

export const PHONE_WARNING_MESSAGE =
  "Per invogliare l'uso della app, viene sconsigliata la condivisione del numero di telefono";

export interface Language {
  code: string;
  name: string;   // English label
  native: string; // Endonym
}

export const LANGUAGES: readonly Language[] = [
  { code: 'af',    name: 'Afrikaans',     native: 'Afrikaans' },
  { code: 'ar',    name: 'Arabic',        native: 'العربية' },
  { code: 'az',    name: 'Azerbaijani',   native: 'Azərbaycan' },
  { code: 'be',    name: 'Belarusian',    native: 'Беларуская' },
  { code: 'bg',    name: 'Bulgarian',     native: 'Български' },
  { code: 'bn',    name: 'Bengali',       native: 'বাংলা' },
  { code: 'bs',    name: 'Bosnian',       native: 'Bosanski' },
  { code: 'ca',    name: 'Catalan',       native: 'Català' },
  { code: 'ckb',   name: 'Kurdish (Sorani)', native: 'کوردیی ناوەندی' },
  { code: 'cs',    name: 'Czech',         native: 'Čeština' },
  { code: 'cy',    name: 'Welsh',         native: 'Cymraeg' },
  { code: 'da',    name: 'Danish',        native: 'Dansk' },
  { code: 'de',    name: 'German',        native: 'Deutsch' },
  { code: 'el',    name: 'Greek',         native: 'Ελληνικά' },
  { code: 'en',    name: 'English',       native: 'English' },
  { code: 'eo',    name: 'Esperanto',     native: 'Esperanto' },
  { code: 'es',    name: 'Spanish',       native: 'Español' },
  { code: 'et',    name: 'Estonian',      native: 'Eesti' },
  { code: 'eu',    name: 'Basque',        native: 'Euskara' },
  { code: 'fa',    name: 'Persian',       native: 'فارسی' },
  { code: 'fi',    name: 'Finnish',       native: 'Suomi' },
  { code: 'fr',    name: 'French',        native: 'Français' },
  { code: 'ga',    name: 'Irish',         native: 'Gaeilge' },
  { code: 'gl',    name: 'Galician',      native: 'Galego' },
  { code: 'gu',    name: 'Gujarati',      native: 'ગુજરાતી' },
  { code: 'he',    name: 'Hebrew',        native: 'עברית' },
  { code: 'hi',    name: 'Hindi',         native: 'हिन्दी' },
  { code: 'hr',    name: 'Croatian',      native: 'Hrvatski' },
  { code: 'hu',    name: 'Hungarian',     native: 'Magyar' },
  { code: 'hy',    name: 'Armenian',      native: 'Հայերեն' },
  { code: 'id',    name: 'Indonesian',    native: 'Bahasa Indonesia' },
  { code: 'is',    name: 'Icelandic',     native: 'Íslenska' },
  { code: 'it',    name: 'Italian',       native: 'Italiano' },
  { code: 'ja',    name: 'Japanese',      native: '日本語' },
  { code: 'jw',    name: 'Javanese',      native: 'Basa Jawa' },
  { code: 'ka',    name: 'Georgian',      native: 'ქართული' },
  { code: 'kk',    name: 'Kazakh',        native: 'Қазақ' },
  { code: 'km',    name: 'Khmer',         native: 'ភាសាខ្មែរ' },
  { code: 'kn',    name: 'Kannada',       native: 'ಕನ್ನಡ' },
  { code: 'ko',    name: 'Korean',        native: '한국어' },
  { code: 'ku',    name: 'Kurdish (Kurmanji)', native: 'Kurdî' },
  { code: 'la',    name: 'Latin',         native: 'Latina' },
  { code: 'lt',    name: 'Lithuanian',    native: 'Lietuvių' },
  { code: 'lv',    name: 'Latvian',       native: 'Latviešu' },
  { code: 'mk',    name: 'Macedonian',    native: 'Македонски' },
  { code: 'ml',    name: 'Malayalam',     native: 'മലയാളം' },
  { code: 'mn',    name: 'Mongolian',     native: 'Монгол' },
  { code: 'mr',    name: 'Marathi',       native: 'मराठी' },
  { code: 'ms',    name: 'Malay',         native: 'Bahasa Melayu' },
  { code: 'mt',    name: 'Maltese',       native: 'Malti' },
  { code: 'my',    name: 'Burmese',       native: 'မြန်မာ' },
  { code: 'ne',    name: 'Nepali',        native: 'नेपाली' },
  { code: 'nl',    name: 'Dutch',         native: 'Nederlands' },
  { code: 'no',    name: 'Norwegian',     native: 'Norsk' },
  { code: 'pa',    name: 'Punjabi',       native: 'ਪੰਜਾਬੀ' },
  { code: 'pl',    name: 'Polish',        native: 'Polski' },
  { code: 'pt',    name: 'Portuguese',    native: 'Português' },
  { code: 'ro',    name: 'Romanian',      native: 'Română' },
  { code: 'ru',    name: 'Russian',       native: 'Русский' },
  { code: 'si',    name: 'Sinhala',       native: 'සිංහල' },
  { code: 'sk',    name: 'Slovak',        native: 'Slovenčina' },
  { code: 'sl',    name: 'Slovenian',     native: 'Slovenščina' },
  { code: 'sq',    name: 'Albanian',      native: 'Shqip' },
  { code: 'sr',    name: 'Serbian',       native: 'Српски' },
  { code: 'sv',    name: 'Swedish',       native: 'Svenska' },
  { code: 'sw',    name: 'Swahili',       native: 'Kiswahili' },
  { code: 'ta',    name: 'Tamil',         native: 'தமிழ்' },
  { code: 'te',    name: 'Telugu',        native: 'తెలుగు' },
  { code: 'th',    name: 'Thai',          native: 'ไทย' },
  { code: 'tl',    name: 'Filipino',      native: 'Filipino' },
  { code: 'tr',    name: 'Turkish',       native: 'Türkçe' },
  { code: 'uk',    name: 'Ukrainian',     native: 'Українська' },
  { code: 'ur',    name: 'Urdu',          native: 'اردو' },
  { code: 'uz',    name: 'Uzbek',         native: 'Oʻzbek' },
  { code: 'vi',    name: 'Vietnamese',    native: 'Tiếng Việt' },
  { code: 'zh-CN', name: 'Chinese (Simplified)',  native: '简体中文' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', native: '繁體中文' },
];

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

const CODE_SET: ReadonlySet<string> = new Set(LANGUAGES.map((l) => l.code));
const NAME_BY_CODE: ReadonlyMap<string, string> =
  new Map(LANGUAGES.map((l) => [l.code, l.name]));

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && CODE_SET.has(value);
}

export function labelOf(code: string): string {
  return NAME_BY_CODE.get(code) ?? code.toUpperCase();
}

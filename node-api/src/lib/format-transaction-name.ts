import * as changeCase from 'change-case';

const specialCases = [
  {
    matcher: new RegExp('.*atm\\s*withdrawal.*', 'i'),
    output: 'Atm Withdrawal',
  },
  {
    matcher: new RegExp('.*cash\\swithdrawal\\sfee.*', 'i'),
    output: 'Cash Withdrawal Fee',
  },
  {
    matcher: new RegExp('^overdraft\\sitem\\sfee.*', 'i'),
    output: 'Overdraft Fee',
  },
  {
    matcher: new RegExp('.*returned\\sitem\\sfee.*', 'i'),
    output: 'Returned Item Fee',
  },
  {
    matcher: new RegExp('^uber\\s(?:\\*|us)', 'i'),
    output: 'Uber',
  },
  {
    matcher: new RegExp('^99-cents-only.*', 'i'),
    output: '99-Cents-Only',
  },
  {
    matcher: new RegExp('\\b7-11\\b', 'i'),
    output: '7-11',
  },
];

const idDescriptors = [
  'debit\\sfor\\scheckcard',
  'debit\\scard\\spurchase',
  'confirmation[#:]*',
  'from\\smma\\stransaction#:',
  'transaction[#:]*',
  'id\\snumber',
  'received on',
  'ach\\spmt\\sweb\\sid:',
  'web\\sid:?',
  'ppd\\sid:?',
  'ending\\sin',
  'effective',
  ':\\sref\\snumber',
  'authorized\\son',
  'card',
  'ref\\s#',
  'pos\\sid:?',
  'id:',
  'type:',
  'for',
  'to',
  'from',
  '#',
  '-?\\s*pos\\sdebit(\\s+-\\s+)?',
  'orig\\sco\\sname:',
  'claimid:?',
  'citictp(\\sco:)?',
  'idcitictp',
  'entry\\sdescr:',
  'entry\\smemo\\sposted\\stoday',
  'entry\\sclass\\scode:',
  'sec:ppd',
  'company\\sid:',
  'payment\\sid:',
  'tst\\*',
  'tfi\\*',
  '\\s\\(', // cant match (exchg rte) because \b below eats "(". so lets match "(" by itself
  'exchg\\srte\\)',
  'pay\\sid:',
  'co:',
  '[A-Z]+\\s+trace\\snumber:',
].join('|');
const COMPILED_REGEX_MATCHER = new RegExp(`\\b(?:${idDescriptors})(?=$)?`, 'gi');

const idPrefixes = [
  'x*',
  'acct',
  'ch#',
  '\\.*',
  '#*',
  '-*',
  '\\**',
  'wi',
  '<br>',
  ':',
  'id:x*',
  '[a-z]',
].join('|');

const idSuffixes = ['atwa(?:lmart|mart|mar|ma|m)?', '\\s*-'].join('|');

const idMatcher = '(?:\\d+[/\\-\\.]?)+';
const ordinals = 'st|nd|rd|th';

function formatDisplayName(name: string): string {
  const isSpecial = formatSpecialName(name);
  if (isSpecial) {
    return isSpecial;
  }

  return (
    changeCase.titleCase(
      name
        .replace(COMPILED_REGEX_MATCHER, '')
        .replace(/\s\s+/g, ' ')
        .trim(),
    ) || name
  );
}

function formatSpecialName(name: string): string {
  if (name.split(/\s+/).length === 1) {
    if (changeCase.isUpperCase(name)) {
      return changeCase.titleCase(name);
    } else {
      return name;
    }
  }

  const specialCase = specialCases.find(item => item.matcher.test(name));

  if (specialCase) {
    return `${specialCase.output}`;
  }
}

function formatExternalName(name: string): string {
  const isSpecial = formatSpecialName(name);
  if (isSpecial) {
    return isSpecial;
  }

  const prefixMatch = `(?:\\s(?:${idPrefixes}))?(?=${idMatcher})`;
  const fullIdMatch = `(?:${prefixMatch})?${idMatcher}(?!${ordinals})(?:${idSuffixes})?`;
  const phraseMatch = `(?:${idDescriptors})?(?=(?:${fullIdMatch}))`;
  const idScrub = new RegExp(`(?:${phraseMatch})?${fullIdMatch}`, 'ig');

  return name
    .replace(idScrub, '')
    .replace(/\s\s+/g, ' ')
    .replace(/(.*)\spurchase\s\1.*/gi, '$1')
    .replace(/\b\w*(?:'s)?/g, txt => `${txt.charAt(0).toUpperCase()}${txt.substr(1).toLowerCase()}`)
    .replace(/\(\)\s*/, '')
    .trim();
}

export { formatExternalName, formatDisplayName };

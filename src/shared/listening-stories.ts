/** Original fictional stories written for listening practice. */
export const PRACTICE_STORIES = [
  {
    id: 'story-trail',
    title: 'The trail marker (short)',
    lines: [
      'AT THE EDGE OF THE WOODS MAY FOUND A SMALL BLUE STONE.',
      'SHE LEFT IT BESIDE THE TRAIL AND WALKED UP THE HILL.',
      'ON HER WAY HOME THE FOG HID THE PATH.',
      'THEN SHE SAW THE BLUE STONE AND KNEW WHICH WAY TO GO.',
      'SOMETIMES A SMALL THING CAN MAKE A BIG DIFFERENCE.',
    ],
  },
  {
    id: 'story-radio',
    title: 'The quiet band (medium)',
    lines: [
      'BEN TOOK HIS SMALL RADIO TO THE PARK ON A COOL AUTUMN MORNING.',
      'HE PUT A WIRE IN A TREE AND SAT AT A WOODEN TABLE.',
      'FOR A WHILE HE HEARD ONLY THE WIND AND THE SOFT HISS OF THE RADIO.',
      'HE CALLED CQ THREE TIMES AND WAITED.',
      'A FAINT SIGNAL CAME BACK FROM A STATION NEAR THE SEA.',
      'THE OTHER OPERATOR WAS NAMED ROSE AND SHE WAS USING FIVE WATTS.',
      'BEN TURNED UP THE VOLUME AND ASKED HER TO SEND HER NAME AGAIN.',
      'THIS TIME HE COPIED EVERY LETTER.',
      'THEY TALKED ABOUT THEIR ANTENNAS AND THE WEATHER.',
      'ROSE HAD RAIN WHILE BEN HAD CLEAR SKIES.',
      'WHEN THEY SAID GOODBYE THE SUN WAS HIGH ABOVE THE TREES.',
      'BEN PACKED HIS BAG WITH ONE CONTACT IN HIS LOG AND A SMILE ON HIS FACE.',
    ],
  },
  {
    id: 'story-light',
    title: 'A light across the lake (longer)',
    lines: [
      'EVERY EVENING ELLA WALKED DOWN THE OLD ROAD TO THE LAKE.',
      'ONE NIGHT SHE NOTICED A SMALL LIGHT ON THE FAR SHORE.',
      'IT FLASHED TWICE THEN WENT DARK THEN FLASHED TWICE AGAIN.',
      'THE NEXT DAY SHE ASKED HER NEIGHBOR TOM ABOUT THE LIGHT.',
      'HIS FRIEND RUTH HAD JUST MOVED INTO THE CABIN ACROSS THE WATER.',
      'TOM SMILED AND TOOK A FLASHLIGHT FROM A DRAWER.',
      'HE SHOWED ELLA HOW SHORT AND LONG FLASHES COULD STAND FOR LETTERS.',
      'THAT EVENING THEY WALKED TO THE LAKE TOGETHER.',
      'WHEN THE LIGHT APPEARED TOM SENT A SLOW GREETING ACROSS THE WATER.',
      'AFTER A SHORT PAUSE THE ANSWER CAME BACK.',
      'SHE INVITED THEM TO VISIT FOR TEA THE NEXT AFTERNOON.',
      'ELLA SENT HER NAME AND THEN A CAREFUL THANK YOU.',
      'THE LAKE WAS JUST AS WIDE AS BEFORE BUT THE FAR SHORE NO LONGER FELT SO FAR AWAY.',
    ],
  },
] as const;

/** Keep the original story catalog above unchanged for published v1 recipes. */
export const PRACTICE_PHRASES = [
  {
    id: 'phrases-radio',
    title: 'At the radio',
    lines: [
      'THE RADIO',
      'A CLEAR CALL',
      'MY NAME',
      'YOUR SIGNAL',
      'THE LAST WORD',
      'LOW POWER',
      'PLEASE SEND AGAIN',
      'THANK YOU',
    ],
  },
  {
    id: 'phrases-outdoors',
    title: 'Outside',
    lines: [
      'THE SUN',
      'A BLUE SKY',
      'THE GREEN TREE',
      'A SMALL BIRD',
      'THE OLD ROAD',
      'BY THE LAKE',
      'A COOL WIND',
      'ON THE HILL',
    ],
  },
  {
    id: 'phrases-home',
    title: 'At home',
    lines: [
      'MY CUP',
      'HOT TEA',
      'THE OPEN DOOR',
      'A GOOD BOOK',
      'THE RED BAG',
      'ON THE DESK',
      'AFTER LUNCH',
      'TIME TO REST',
    ],
  },
] as const;
export const PRACTICE_SENTENCES = [
  {
    id: 'sentences-radio',
    title: 'At the radio',
    lines: [
      'THE RADIO IS ON.',
      'I HEAR A CLEAR CALL.',
      'MY NAME IS BEN.',
      'YOUR SIGNAL IS CLEAR.',
      'I MISSED THE LAST WORD.',
      'WE USE LOW POWER.',
      'PLEASE SEND YOUR NAME AGAIN.',
      'THANK YOU FOR THE CALL.',
    ],
  },
  {
    id: 'sentences-outdoors',
    title: 'Outside',
    lines: [
      'THE SUN IS UP.',
      'THE SKY IS BLUE.',
      'THE TREE IS GREEN.',
      'A SMALL BIRD SINGS.',
      'WE TAKE THE OLD ROAD.',
      'WE SIT BY THE LAKE.',
      'A COOL WIND BLOWS.',
      'WE WALK UP THE HILL.',
    ],
  },
  {
    id: 'sentences-home',
    title: 'At home',
    lines: [
      'MY CUP IS FULL.',
      'THE TEA IS HOT.',
      'THE DOOR IS OPEN.',
      'I READ A GOOD BOOK.',
      'THE BAG IS RED.',
      'MY BOOK IS ON THE DESK.',
      'WE TALK AFTER LUNCH.',
      'IT IS TIME TO REST.',
    ],
  },
] as const;
export const PRACTICE_MINI_STORIES = [
  {
    id: 'story-first-call',
    title: 'A clear call (two sentences)',
    lines: ['THE RADIO IS ON.', 'I HEAR A CLEAR CALL.'],
  },
  {
    id: 'story-lake-rest',
    title: 'By the lake (two sentences)',
    lines: ['WE WALK TO THE LAKE.', 'WE SIT UNDER A TREE.'],
  },
  {
    id: 'story-tea-book',
    title: 'Tea and a book (two sentences)',
    lines: ['THE TEA IS HOT.', 'I READ A GOOD BOOK.'],
  },
] as const;
export const PRACTICE_PASSAGES = [
  ...PRACTICE_PHRASES,
  ...PRACTICE_SENTENCES,
  ...PRACTICE_MINI_STORIES,
  ...PRACTICE_STORIES,
] as const;
export type PassageKind = 'phrases' | 'sentences' | 'stories';
export type StoryId = (typeof PRACTICE_PASSAGES)[number]['id'];
export type PracticeStory = (typeof PRACTICE_PASSAGES)[number];
export function passageKind(id: string): PassageKind {
  return id.startsWith('phrases-')
    ? 'phrases'
    : id.startsWith('sentences-')
      ? 'sentences'
      : 'stories';
}
export function passageDescription(passage: PracticeStory): string {
  const counts = passage.lines.map((line) => line.split(' ').length);
  const kind = passageKind(passage.id);
  const unit = kind === 'phrases' ? 'phrases' : 'sentences';
  return kind === 'stories'
    ? `${passage.lines.length} sentences · ${counts.reduce((sum, count) => sum + count, 0)} words total`
    : `${passage.lines.length} ${unit} · ${Math.min(...counts)}–${Math.max(...counts)} words each`;
}
export function practiceStory(id: string): PracticeStory {
  const story = PRACTICE_PASSAGES.find((item) => item.id === id);
  if (!story) throw new Error('Choose a public phrase collection, sentence collection, or story.');
  return story;
}

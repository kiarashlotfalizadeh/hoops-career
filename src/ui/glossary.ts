// The game's jargon in plain words, for the Glossary sheet and inline <Term> links. Short sentences,
// two each where the rule allows (a cap rule's figures take three), true to how the engine plays it. The playbooks and the roles are read from the
// engine's own descriptions (PLAYBOOK_TERMS, ROLE_TERMS), so their entries never drift from the game.
import { DEF_PRESETS, DEF_ROLE_META, OFF_PRESETS } from '../core/sim/tactics';
import { ROLE_META } from '../core/ratings';

export type GlossaryGroup = 'Offense' | 'Defense' | 'Numbers' | 'Contracts' | 'Roster' | 'The game';

export interface GlossaryEntry {
  id: string;
  term: string;
  group: GlossaryGroup;
  text: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  // offense
  {
    id: 'pnr',
    term: 'Pick-and-roll (P&R)',
    group: 'Offense',
    text: 'A teammate screens for the ball handler, then rolls to the rim or pops out. The most common action in the game.',
  },
  {
    id: 'iso',
    term: 'Isolation',
    group: 'Offense',
    text: 'One player takes his man one-on-one while the others space the floor. Best for elite scorers, and it slows the ball down.',
  },
  { id: 'post', term: 'Post-up', group: 'Offense', text: 'A player backs his defender down near the basket. Works for strong, skilled bigs and against smaller defenders.' },
  { id: 'handoff', term: 'Handoff', group: 'Offense', text: 'A big hands the ball to a cutting guard and screens his man at once.' },
  { id: 'motion', term: 'Motion', group: 'Offense', text: 'Cuts, off-ball screens and drive-and-kicks instead of a set play. It spreads the shots around.' },
  {
    id: 'transition',
    term: 'Transition',
    group: 'Offense',
    text: 'Attacking before the defense is set, after a rebound or a turnover. The most efficient chances, at a cost in fatigue.',
  },
  {
    id: 'sets',
    term: 'Sets',
    group: 'Offense',
    text: "Named plays like Horns or Floppy, run for the player who fits them. They're the after-timeout play and the late play call.",
  },
  { id: 'ato', term: 'After-timeout play (ATO)', group: 'Offense', text: 'The play your team runs on the first trip out of a timeout.' },
  {
    id: 'hunt',
    term: 'Hunting a mismatch',
    group: 'Offense',
    text: 'Isolations and ball screens aimed at the weakest defender on the floor. A switch can make one for your scorer.',
  },
  {
    id: 'shape',
    term: 'Shape',
    group: 'Offense',
    text: 'Where your five stand in the half court: 4-out 1-in, 5-out, horns or double post. Each suits a different roster.',
  },
  { id: 'twoforone', term: '2-for-1', group: 'Offense', text: 'A quick shot with about 35 seconds left in a quarter. You get the ball back for the last shot.' },
  {
    id: 'usage',
    term: 'Usage (USG%)',
    group: 'Offense',
    text: "The share of his team's possessions a player ends while he's on the floor. A shot, free throws or a turnover ends one.",
  },

  // defense
  { id: 'drop', term: 'Drop', group: 'Defense', text: 'Ball-screen coverage: the big sags back toward the rim. Protects the paint, gives up pull-up jumpers.' },
  { id: 'switch', term: 'Switch', group: 'Defense', text: 'Defenders trade assignments on a screen. No gaps, but it can leave a big on a quick guard.' },
  { id: 'hedge', term: 'Hedge', group: 'Defense', text: 'The big steps out to slow the ball handler, then recovers. It takes away the pull-up but can open the roll.' },
  { id: 'blitz', term: 'Blitz', group: 'Defense', text: "Two defenders trap the ball handler off the screen. It forces the ball out of a star's hands, but leaves a 4-on-3." },
  { id: 'ice', term: 'Ice', group: 'Defense', text: 'The ball handler is pushed toward the sideline, away from the screen, into the big. Limits middle drives.' },
  {
    id: 'zone',
    term: 'Zone (2-3, 3-2)',
    group: 'Defense',
    text: 'Defenders guard areas instead of players. The 2-3 packs the paint, and the 3-2 contests threes but is softer inside.',
  },
  {
    id: 'junk',
    term: 'Junk defense (box-and-one, triangle-and-two)',
    group: 'Defense',
    text: 'A zone behind one or two chasers who face-guard their main creators. Good against an offense of one or two scorers.',
  },
  {
    id: 'defroles',
    term: 'Defensive roles',
    group: 'Defense',
    text: "A player's job out of possession, set on the tactics board. Each role has its own entry here.",
  },
  { id: 'help', term: 'Help defense', group: 'Defense', text: 'How far defenders leave their man to stop drives. More help protects the rim and opens up kick-out threes.' },
  {
    id: 'press',
    term: 'Press',
    group: 'Defense',
    text: 'Pressure in the backcourt, all over the floor. It forces turnovers and burns the clock, but good ball handlers beat it.',
  },
  {
    id: 'starplan',
    term: 'Star plan (double-team)',
    group: 'Defense',
    text: "A second defender goes at their main creator when he attacks. Worth it against a star who can't pass out of it.",
  },
  {
    id: 'foultogive',
    term: 'Foul to give',
    group: 'Defense',
    text: "A foul late in a quarter before they're in the bonus. It costs only a side out and leaves them less time.",
  },
  {
    id: 'hack',
    term: 'Hack-a-player',
    group: 'Defense',
    text: 'Fouling a poor free-throw shooter on purpose. He goes to the line instead of his team running its offense.',
  },

  // numbers
  {
    id: 'ovr',
    term: 'OVR and POT',
    group: 'Numbers',
    text: 'Overall rating now, and the peak his potential points to, on a 40-99 scale. About 74 is a median rotation player, 86 an All-Star. Badges: gold 89+, violet 82+, blue 78+, teal 72+, grey 67+, light grey below.',
  },
  { id: 'ortg', term: 'Offensive and defensive rating', group: 'Numbers', text: 'Points scored (ORtg) or allowed (DRtg) per 100 possessions. Net rating is the difference.' },
  { id: 'pace', term: 'Pace', group: 'Numbers', text: 'Possessions a team uses per 48 minutes. The league plays about 100.' },
  { id: 'efg', term: 'eFG%', group: 'Numbers', text: 'Field-goal percentage with a three counted as one and a half makes.' },
  { id: 'ts', term: 'TS%', group: 'Numbers', text: 'True shooting: scoring efficiency counting threes and free throws.' },
  { id: 'tov', term: 'TOV%', group: 'Numbers', text: 'Turnovers per possession: lower is better.' },
  { id: 'orb', term: 'ORB%', group: 'Numbers', text: 'The share of a team’s own misses it rebounds.' },
  { id: 'ftr', term: 'FTR', group: 'Numbers', text: 'Free-throw rate: free-throw attempts per field-goal attempt.' },
  {
    id: 'fourfactors',
    term: 'Four factors',
    group: 'Numbers',
    text: 'What decides possessions, most important first: shooting, turnovers, offensive rebounds and getting to the line. Their numbers are eFG%, TOV%, ORB% and FTR or FT/FGA.',
  },
  { id: 'ftfga', term: 'FT/FGA', group: 'Numbers', text: 'Free throws made per field-goal attempt. Getting to the line and making them, the fourth of the four factors.' },
  {
    id: 'grade',
    term: 'Player grade',
    group: 'Numbers',
    text: 'A+ to F for one game: his game score against what his rating predicts. B is about what was expected.',
  },
  { id: 'ppp', term: 'PPP', group: 'Numbers', text: 'Points per possession, used for play types like pick-and-roll and spot-ups. About 1.1 is average.' },
  {
    id: 'z',
    term: 'z (standard errors)',
    group: 'Numbers',
    text: "How far a number is from the league's, in standard errors. Within about ±2 it could be noise, and beyond that it's real.",
  },
  { id: 'onoff', term: 'On/off', group: 'Numbers', text: 'A team’s net rating with a player on the floor minus with him off it.' },
  {
    id: 'onnet',
    term: 'On net (on-court net rating)',
    group: 'Numbers',
    text: "The team's net rating while he's on the floor. Unlike on/off, it doesn't subtract the minutes he sits.",
  },
  {
    id: 'fit',
    term: 'Fit',
    group: 'Numbers',
    text: "What the staff reads a playbook or shape to be worth a game for your roster. It's an estimate. Make the change and the staff measures it.",
  },
  {
    id: 'wear',
    term: 'Wear',
    group: 'Numbers',
    text: 'Season fatigue built up by minutes and back-to-backs. Worn-down players shoot worse and get hurt more, and rest brings it down.',
  },
  { id: 'winprob', term: 'Win probability', group: 'Numbers', text: 'The chance to win from the score, the clock, the ball and the pre-game projection.' },

  // contracts
  {
    id: 'cap',
    term: 'Salary cap',
    group: 'Contracts',
    text: 'A soft limit on payroll. Over it, free agents take an exception or the minimum, and trades must match salaries.',
  },
  {
    id: 'tax',
    term: 'Luxury tax',
    group: 'Contracts',
    text: "Payroll over the tax line pays by brackets, from 1.5× to 3.25× and more. Each bracket is 3.68% of the cap. A repeat taxpayer pays 1 more on each. Half the tax goes to teams that didn't pay.",
  },
  {
    id: 'apron',
    term: 'Aprons',
    group: 'Contracts',
    text: "Two lines above the tax. Over the first, a team can't take back more salary than it sends. Over the second, it can't combine salaries, send cash or use a mid-level.",
  },
  {
    id: 'exception',
    term: 'Exceptions',
    group: 'Contracts',
    text: 'Ways to sign a free agent over the cap, one signing each a season. The mid-level, the taxpayer mid-level, the bi-annual and the room exception each have an entry.',
  },
  {
    id: 'mle',
    term: 'Mid-level exception (MLE)',
    group: 'Contracts',
    text: 'Signs a free agent over the cap for up to 8.5% of it. Up to four years, once a season, with a hard cap at the first apron.',
  },
  {
    id: 'tmle',
    term: 'Taxpayer mid-level',
    group: 'Contracts',
    text: 'The mid-level for a team the full one would push past the first apron. Up to 3.7% of the cap for two years, hard-capped at the second apron.',
  },
  { id: 'room', term: 'Room exception', group: 'Contracts', text: 'A smaller exception for a team that used its cap space this season. Up to 5.7% of the cap for two years.' },
  {
    id: 'bae',
    term: 'Bi-annual exception (BAE)',
    group: 'Contracts',
    text: 'A small exception for a team under the first apron, not two seasons running. Up to 3.3% of the cap for two years, hard-capped at the first apron.',
  },
  {
    id: 'bird',
    term: 'Bird rights',
    group: 'Contracts',
    text: 'A team can re-sign its own players over the cap. A trade keeps the clock. Three seasons with it: up to his max for five years. Two, Early Bird: up to 175% of his salary. One: 120%.',
  },
  { id: 'hold', term: 'Cap hold', group: 'Contracts', text: "An unsigned player's placeholder on his team's cap. It lasts until he re-signs, is renounced or free agency opens." },
  {
    id: 'matching',
    term: 'Salary matching',
    group: 'Contracts',
    text: 'A team over the cap can take back 200% of a small salary it sends. A middle salary plus 4.85% of the cap, or 125% of a big one. Over the first apron, no more than it sends.',
  },
  {
    id: 'tpe',
    term: 'Traded player exception',
    group: 'Contracts',
    text: 'Salary an over-the-cap team sent out beyond what it took back. For a year, under the first apron, it can take in that much without matching.',
  },
  {
    id: 'max',
    term: 'Max contract',
    group: 'Contracts',
    text: 'The most a player can earn, by his seasons in the league. 25% of the cap up to six, 30% for seven to nine, 35% from ten. All-NBA, MVP or Defensive Player of the Year honors let his own team pay more.',
  },
  { id: 'rookie', term: 'Rookie scale', group: 'Contracts', text: 'First-round picks sign set contracts by draft slot.' },
  {
    id: 'options',
    term: 'Player and team options',
    group: 'Contracts',
    text: "A final season the player or the team can pick up or decline. It's decided after the draft.",
  },
  { id: 'extension', term: 'Extension', group: 'Contracts', text: "A new deal signed in the old one's final season. It starts when that one ends." },
  { id: 'dead', term: 'Dead money', group: 'Contracts', text: 'Salary still owed to released players. It counts on the cap, and a stretch spreads it over more seasons.' },
  { id: 'buyout', term: 'Buyout', group: 'Contracts', text: 'A veteran gives back part of what he’s owed to be released.' },

  // roster
  { id: 'twoway', term: 'Two-way contract', group: 'Roster', text: 'Up to three players outside the 15-man roster and the cap.' },
  {
    id: 'tenday',
    term: '10-day contract',
    group: 'Roster',
    text: 'From January 5, a minimum deal that ends by itself after ten days. Two per player per team, then he signs for the season or leaves.',
  },
  {
    id: 'rfa',
    term: 'Restricted free agent (RFA)',
    group: 'Roster',
    text: 'A young player whose team made him a qualifying offer. Other teams can make him an offer sheet. His team has two days to match it.',
  },
  { id: 'qo', term: 'Qualifying offer (QO)', group: 'Roster', text: 'A one-year offer that makes a young player a restricted free agent.' },
  { id: 'waivers', term: 'Waivers', group: 'Roster', text: 'A player released in season with guaranteed money left. For two days other teams can claim his contract.' },
  {
    id: 'protection',
    term: 'Pick protection',
    group: 'Roster',
    text: 'A traded first that lands in its protected range, say the top 10, stays home. Nothing more is owed.',
  },
  { id: 'swap', term: 'Pick swap', group: 'Roster', text: "The right to trade your first for another team's in a future draft. It's used if theirs lands higher." },
  { id: 'stepien', term: 'Stepien rule', group: 'Roster', text: 'A team can’t trade away its first-round picks in back-to-back future drafts.' },

  // the game
  {
    id: 'owner',
    term: 'Job security',
    group: 'The game',
    text: 'How the owner sees your job, from his goals for each season. A hot seat at the All-Star break brings an ultimatum: miss it and you’re fired.',
  },
  {
    id: 'agenda',
    term: 'Agenda',
    group: 'The game',
    text: "The decisions waiting on you. The required ones hold the season, and the staff's pick is always one tap away.",
  },
  {
    id: 'gameplan',
    term: 'Game plan',
    group: 'The game',
    text: 'Changes to your playbook for one opponent: the next game, the series or the season. It never touches the playbook itself.',
  },
  {
    id: 'system',
    term: 'System report',
    group: 'The game',
    text: 'What your system should be good and bad at, graded against the other 29 teams. Change a setting in Team → Tactics and the grades move.',
  },
  {
    id: 'mentality',
    term: 'Mentality',
    group: 'The game',
    text: 'How much risk your team takes. Aggressive pushes and crashes the glass. Cautious protects the ball and gets back.',
  },
  {
    id: 'bench',
    term: 'The staff (live games)',
    group: 'The game',
    text: "The live game's Staff tab: your lead assistant's read and the calls he wants. It also lists your moves, with what each has done since.",
  },

  // the measuring and the words around it
  {
    id: 'measured',
    term: 'Measured',
    group: 'The game',
    text: "A number from playing the same games twice, once each way, on the same seeds. The gap is shrunk toward zero by its noise. Anything else is labelled the staff's read.",
  },
  {
    id: 'counter',
    term: 'Counter',
    group: 'The game',
    text: 'A change the staff would make for one opponent, measured before you see it. Add it to the plan for a game, a series or the season. It never changes your playbook.',
  },
  {
    id: 'luck',
    term: 'Luck (the luck line)',
    group: 'The game',
    text: 'How far the shots fell above or below what the looks were worth. It decides nights, but a plan controls the looks, not whether they drop.',
  },
  {
    id: 'keys',
    term: 'Keys to the game',
    group: 'The game',
    text: "Three numbers to hit tonight, read from both teams' seasons. Tracked live at the breaks and graded with the result.",
  },
  {
    id: 'custom',
    term: 'Custom (playbook)',
    group: 'The game',
    text: 'A playbook whose settings have moved, as in Custom Drop. Instructions shows what moved, with Put back.',
  },
  {
    id: 'archetype',
    term: 'Archetype (Heliocentric Creator, Rim Protector…)',
    group: 'Roster',
    text: "The tag under a player's name: what his ratings make him. His role is what your tactic asks, and the two can differ.",
  },
  {
    id: 'closer',
    term: 'Closer',
    group: 'Roster',
    text: 'One of the five on the floor at the end of a close game. Set them in Team → Rotation, and the late play call is built around the best.',
  },
  {
    id: 'sta',
    term: 'STA (stamina)',
    group: 'Roster',
    text: "How long a player lasts before fatigue costs his shooting and defense. A low one wants shorter stints, and Rotation's stint plan rests him.",
  },
  {
    id: 'impact',
    term: 'Impact',
    group: 'Numbers',
    text: 'What a player is worth in points per 100 possessions against an average player. It comes from seven seasons of lineups and his box score.',
  },
  {
    id: 'per',
    term: 'PER (player efficiency)',
    group: 'Numbers',
    text: 'Everything a player does in the box score, per minute and adjusted for pace. The league average is 15.',
  },
  {
    id: 'ws',
    term: 'Win shares (WS)',
    group: 'Numbers',
    text: "The wins a player's offense and defense account for, from the box score. Per 48 minutes, about .100 is an average player.",
  },
  { id: 'gb', term: 'GB (games back)', group: 'Numbers', text: 'How far a team trails the leader. The difference in wins plus the difference in losses, halved.' },
  {
    id: 'playin',
    term: 'Play-in',
    group: 'The game',
    text: 'Seeds 7 to 10 in each conference play for the last two playoff spots. 7 hosts 8 for the 7th seed, and 9 hosts 10 to stay alive. The loser of the first hosts the winner of the second for the 8th.',
  },
  {
    id: 'billing',
    term: 'Big nights (billing)',
    group: 'The game',
    text: 'What makes a game more than a date, shown in front of its line. Opening night, Christmas, a rivalry, a revenge game, a streak or a milestone in reach.',
  },
  {
    id: 'roles',
    term: 'Roles (offense)',
    group: 'Offense',
    text: "A player's job in possession, set on the tactics board. Each role has its own entry here. The board's stars show how well he suits his.",
  },
  ...playbookTerms(),
  ...roleTerms(),
];

/** The offensive playbooks and the defensive identities, each in the engine's own description. */
function playbookTerms(): GlossaryEntry[] {
  return [
    ...OFF_PRESETS.map((p) => ({ id: `pb-${p.id}`, term: `${p.name} (offensive playbook)`, group: 'Offense' as const, text: p.description })),
    ...DEF_PRESETS.map((p) => ({ id: `pb-${p.id}`, term: `${p.name} (defensive identity)`, group: 'Defense' as const, text: p.description })),
  ];
}

/** A player's roles at each end, each in the engine's own words. */
function roleTerms(): GlossaryEntry[] {
  return [
    ...Object.entries(ROLE_META).map(([id, m]) => ({ id: `role-${id}`, term: `${m.label} (role)`, group: 'Offense' as const, text: m.help })),
    ...Object.entries(DEF_ROLE_META).map(([id, m]) => ({ id: `drole-${id}`, term: `${m.label} (defensive role)`, group: 'Defense' as const, text: m.help })),
  ];
}

export const glossaryEntry = (id: string) => GLOSSARY.find((g) => g.id === id);

// The game's jargon in plain words, for the Glossary sheet and inline <Term> links. One or two
// sentences each, true to how the engine plays it.

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
    text: 'A teammate sets a screen for the ball handler, then rolls to the rim or pops out for a shot. The most common action in the game.',
  },
  {
    id: 'iso',
    term: 'Isolation',
    group: 'Offense',
    text: 'One player takes his man one-on-one while the others space the floor. Best for elite shot creators; slows the ball down.',
  },
  { id: 'post', term: 'Post-up', group: 'Offense', text: 'A player backs his defender down near the basket. Works for strong, skilled bigs and against smaller defenders.' },
  { id: 'handoff', term: 'Handoff', group: 'Offense', text: 'A big hands the ball to a cutting guard and screens his man in the same motion.' },
  { id: 'motion', term: 'Motion', group: 'Offense', text: 'Cuts, screens away from the ball and drive-and-kicks instead of a set play: spreads the shots around.' },
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
    text: 'Named plays (Spain pick-and-roll, Horns, Floppy...) run for the player who fits them. Strongest early: defenses read a set the more it is run.',
  },
  { id: 'ato', term: 'After-timeout play (ATO)', group: 'Offense', text: 'The play your team runs on the first trip out of a timeout.' },
  {
    id: 'hunt',
    term: 'Hunting a mismatch',
    group: 'Offense',
    text: 'Running isolations and ball screens at the weakest defender on the floor, or at whoever a switch has left on your scorer.',
  },
  { id: 'twoforone', term: '2-for-1', group: 'Offense', text: 'A quick shot with about 35 seconds left in a quarter, so you get the ball back for the last shot too.' },
  {
    id: 'usage',
    term: 'Usage (USG%)',
    group: 'Offense',
    text: 'The share of his team’s possessions a player ends with a shot, free throws or a turnover while he is on the floor.',
  },

  // defense
  { id: 'drop', term: 'Drop', group: 'Defense', text: 'Ball-screen coverage: the big sags back toward the rim. Protects the paint, gives up pull-up jumpers.' },
  { id: 'switch', term: 'Switch', group: 'Defense', text: 'Defenders trade assignments on a screen. No gaps, but it can leave a big on a quick guard, or a guard on a big.' },
  { id: 'hedge', term: 'Hedge', group: 'Defense', text: 'The big steps out to slow the ball handler, then recovers. Takes away the pull-up; can open the roll.' },
  { id: 'blitz', term: 'Blitz', group: 'Defense', text: 'Two defenders trap the ball handler off the screen. Forces the ball out of a star’s hands; leaves a 4-on-3 behind it.' },
  { id: 'ice', term: 'Ice', group: 'Defense', text: 'The ball handler is pushed toward the sideline, away from the screen, into the big. Limits middle drives.' },
  {
    id: 'zone',
    term: 'Zone (2-3, 3-2)',
    group: 'Defense',
    text: 'Defenders guard areas instead of players. The 2-3 packs the paint; the 3-2 contests threes harder and is softer inside.',
  },
  {
    id: 'junk',
    term: 'Box-and-one, triangle-and-two',
    group: 'Defense',
    text: 'A zone behind one or two chasers who face-guard the other team’s main creators. Good against a one- or two-man offense whose others can’t shoot.',
  },
  { id: 'help', term: 'Help defense', group: 'Defense', text: 'How far defenders leave their man to stop drives. More help protects the rim and opens up kick-out threes.' },
  {
    id: 'press',
    term: 'Press',
    group: 'Defense',
    text: 'Pressure in the backcourt, all over the floor. Forces turnovers and burns the shot clock; risky against good ball handlers.',
  },
  {
    id: 'guarding',
    term: 'Go under, top-lock, sag off, physical',
    group: 'Defense',
    text: 'How one defender plays his man. Go under screens: room for his pull-ups, none for his drives. Top-lock: runs a shooter off the line, opens drives and backdoor cuts. Sag off: helps in the paint, leaves him open from outside. Physical: tougher drives and post-ups, more fouls.',
  },
  {
    id: 'starplan',
    term: 'Star plan (deny, double-team)',
    group: 'Defense',
    text: 'Deny face-guards their main creator to keep the ball out of his hands; a double-team sends a second defender when he attacks and makes the others beat you.',
  },
  {
    id: 'foultogive',
    term: 'Foul to give',
    group: 'Defense',
    text: 'A foul with a few seconds left in a quarter when they aren’t in the bonus yet: only a side out, with less time and a worse first look for them.',
  },
  {
    id: 'hack',
    term: 'Hack-a-player',
    group: 'Defense',
    text: 'Fouling a poor free-throw shooter on purpose to send him to the line instead of letting his team run its offense.',
  },

  // numbers
  {
    id: 'ovr',
    term: 'OVR and POT',
    group: 'Numbers',
    text: 'Overall rating now and his potential, on a 40-99 scale: about 74 is the median rotation player, 87+ an All-Star, 93+ an MVP candidate.',
  },
  { id: 'ortg', term: 'Offensive and defensive rating', group: 'Numbers', text: 'Points scored (ORtg) or allowed (DRtg) per 100 possessions. Net rating is the difference.' },
  { id: 'pace', term: 'Pace', group: 'Numbers', text: 'Possessions a team uses per 48 minutes. The league plays about 100.' },
  { id: 'efg', term: 'eFG%', group: 'Numbers', text: 'Effective field-goal percentage: field goals with a three counted as one and a half makes.' },
  { id: 'ts', term: 'TS%', group: 'Numbers', text: 'True shooting: scoring efficiency counting threes and free throws.' },
  { id: 'tov', term: 'TOV%', group: 'Numbers', text: 'Turnovers per possession.' },
  { id: 'orb', term: 'ORB%', group: 'Numbers', text: 'The share of a team’s own misses it rebounds.' },
  { id: 'ftr', term: 'FTR', group: 'Numbers', text: 'Free-throw rate: free-throw attempts per field-goal attempt.' },
  { id: 'ppp', term: 'PPP', group: 'Numbers', text: 'Points per possession, used for play types (pick-and-roll, spot-ups, transition...). About 1.1 is average.' },
  {
    id: 'fourfactors',
    term: 'Four factors',
    group: 'Numbers',
    text: 'What decides possessions, at both ends: shooting (eFG%), turnovers (TOV%), offensive rebounds (ORB%) and getting to the line (FTR).',
  },
  {
    id: 'z',
    term: 'z (standard errors)',
    group: 'Numbers',
    text: 'How far a number is from the league’s, in standard errors. Within about ±2 it could be noise; beyond that it’s a real tendency.',
  },
  {
    id: 'range',
    term: '± range (Lab)',
    group: 'Numbers',
    text: 'How far a Lab result could be off: run the same test many times and the true change lands inside it about 95 times in 100. More games make it tighter.',
  },
  { id: 'onoff', term: 'On/off', group: 'Numbers', text: 'A team’s net rating with a player on the floor minus with him off it.' },
  {
    id: 'fit',
    term: 'Fit',
    group: 'Numbers',
    text: 'How well a playbook suits your roster, from what each part of it needs (a lead creator, shooting, a passing big, rim protection, depth).',
  },
  {
    id: 'wear',
    term: 'Wear',
    group: 'Numbers',
    text: 'Season fatigue built up by minutes and back-to-backs. Worn-down players shoot worse and get hurt more; rest brings it down.',
  },
  { id: 'winprob', term: 'Win probability', group: 'Numbers', text: 'The chance to win from the score, the clock, who has the ball and the pre-game projection.' },

  // contracts
  {
    id: 'cap',
    term: 'Salary cap',
    group: 'Contracts',
    text: 'A soft limit on payroll: over it, you can only add free agents with an exception or for the minimum, and trades must match salaries.',
  },
  { id: 'tax', term: 'Luxury tax', group: 'Contracts', text: 'A payroll over the tax line pays a tax on each dollar over it. Half of it goes to the teams that didn’t pay.' },
  {
    id: 'mle',
    term: 'Mid-level exception (MLE)',
    group: 'Contracts',
    text: 'Lets a team over the cap sign a free agent for up to 8.5% of the cap, once a season, if it stays under the tax.',
  },
  { id: 'room', term: 'Room exception', group: 'Contracts', text: 'A smaller exception (5.7% of the cap, up to two years) for a team that used its cap space this season.' },
  { id: 'bae', term: 'Bi-annual exception (BAE)', group: 'Contracts', text: 'A small exception (3.3% of the cap, up to two years), not two seasons running.' },
  { id: 'bird', term: 'Bird rights', group: 'Contracts', text: 'A team can re-sign its own players over the cap, at any price.' },
  { id: 'hold', term: 'Cap hold', group: 'Contracts', text: 'An unsigned player’s placeholder on his team’s cap until he re-signs, is renounced or free agency opens.' },
  { id: 'matching', term: 'Salary matching', group: 'Contracts', text: 'Over the cap after a trade, a team can take back at most 125% of the salary it sends, plus $100K.' },
  { id: 'rookie', term: 'Rookie scale', group: 'Contracts', text: 'First-round picks sign set contracts by draft slot.' },
  {
    id: 'options',
    term: 'Player and team options',
    group: 'Contracts',
    text: 'A final season the player (or the team) can choose to pick up or decline, decided after the draft.',
  },
  { id: 'extension', term: 'Extension', group: 'Contracts', text: 'A new deal signed in the final season of the old one, starting when it ends.' },
  { id: 'dead', term: 'Dead money', group: 'Contracts', text: 'Salary still owed to released players. It counts on the cap; a stretch spreads it over more seasons.' },
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
    text: 'A young player whose team made him a qualifying offer: other teams can sign him to an offer sheet, and his team has two days to match it.',
  },
  { id: 'qo', term: 'Qualifying offer (QO)', group: 'Roster', text: 'A one-year offer that makes a young player a restricted free agent.' },
  { id: 'waivers', term: 'Waivers', group: 'Roster', text: 'A player released in season with guaranteed money left spends two days where other teams can claim his contract.' },
  {
    id: 'protection',
    term: 'Pick protection',
    group: 'Roster',
    text: 'A traded first that lands in the protected range (say, top 10) stays with its team, and nothing more is owed.',
  },
  { id: 'swap', term: 'Pick swap', group: 'Roster', text: 'The right to trade firsts with another team in a future draft if theirs lands higher.' },
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
    text: 'The decisions waiting on you. The required ones hold the season until they’re settled; the staff’s suggestion is always one tap away.',
  },
  {
    id: 'gameplan',
    term: 'Game plan',
    group: 'The game',
    text: 'Changes to your playbook for one opponent: the next game, the series or the season. It never touches the playbook itself.',
  },
  { id: 'lab', term: 'Tactics Lab', group: 'The game', text: 'Runs real engine games to test a plan, compare before and after your edits, or rank the staff’s counters.' },
];

export const glossaryEntry = (id: string) => GLOSSARY.find((g) => g.id === id);

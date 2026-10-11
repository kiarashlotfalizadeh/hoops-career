// One pass over a season of cdn.nba.com play-by-play. Produces, per player:
// - shooting by zone (the engine's zones: rim / paint / mid / corner 3 / above-the-break 3)
// - how shots are created (pull-up, drive, cut, lob, putback, post move, transition, assisted)
// - assists by the zone of the shot they set up, turnover and foul types, fouls drawn
// - rebounds with on-court opportunities (true ORB% / DRB%), steals, blocks by zone
// - on-court possessions, points for/against and opponent rim shooting (rim deterrence)
// and lineup stints (who was on the floor for each possession) for RAPM.
import { tarCsvRows } from './csv';

export type Zone = 'rim' | 'paint' | 'mid' | 'c3' | 'ab3';
export const ZONES: Zone[] = ['rim', 'paint', 'mid', 'c3', 'ab3'];
const zz = (): Record<Zone, number> => ({ rim: 0, paint: 0, mid: 0, c3: 0, ab3: 0 });

export interface PlayerPbp {
  id: number;
  nameI: string;
  teams: Record<string, number>; // tricode -> games
  games: number;
  secs: number;
  offPoss: number;
  defPoss: number;
  ptsFor: number;
  ptsAgainst: number;
  fga: Record<Zone, number>;
  fgm: Record<Zone, number>;
  astFgm2: number; // assisted makes
  astFgm3: number;
  pullup: number; // pull-up / step-back jumpers
  pullupM: number;
  pullup3: number;
  drive: number;
  driveM: number;
  cut: number;
  cutM: number;
  lob: number;
  dunk: number;
  putback: number;
  putbackM: number;
  post: number;
  postM: number;
  trans: number; // fast-break attempts
  transM: number;
  fta: number;
  ftm: number;
  sfDrawn: number; // shooting fouls drawn
  and1: number;
  ast: number;
  astZone: Record<Zone, number>;
  tov: number;
  tovBadPass: number;
  tovLostBall: number;
  tovOffFoul: number;
  tovOther: number;
  orb: number;
  drb: number;
  orbChances: number; // player rebounds available at his team's offensive glass while on court
  drbChances: number;
  stl: number;
  blk: number;
  blkZone: Record<Zone, number>;
  pf: number;
  pfShooting: number;
  pfOffensive: number;
  chargesDrawn: number;
  teamFga: number; // team FGA while on court (offense)
  oppFga: number; // opponent FGA while on court (defense)
  oppRimA: number;
  oppRimM: number;
  opp3A: number;
}

export interface Stint {
  off: number[];
  def: number[];
  home: boolean; // offense is the home team
  poss: number;
  pts: number;
}

export interface SeasonPbp {
  season: number;
  games: number;
  players: Record<number, PlayerPbp>;
  stints: Stint[];
  lineupIssues: number;
}

function blank(id: number, nameI: string): PlayerPbp {
  return {
    id,
    nameI,
    teams: {},
    games: 0,
    secs: 0,
    offPoss: 0,
    defPoss: 0,
    ptsFor: 0,
    ptsAgainst: 0,
    fga: zz(),
    fgm: zz(),
    astFgm2: 0,
    astFgm3: 0,
    pullup: 0,
    pullupM: 0,
    pullup3: 0,
    drive: 0,
    driveM: 0,
    cut: 0,
    cutM: 0,
    lob: 0,
    dunk: 0,
    putback: 0,
    putbackM: 0,
    post: 0,
    postM: 0,
    trans: 0,
    transM: 0,
    fta: 0,
    ftm: 0,
    sfDrawn: 0,
    and1: 0,
    ast: 0,
    astZone: zz(),
    tov: 0,
    tovBadPass: 0,
    tovLostBall: 0,
    tovOffFoul: 0,
    tovOther: 0,
    orb: 0,
    drb: 0,
    orbChances: 0,
    drbChances: 0,
    stl: 0,
    blk: 0,
    blkZone: zz(),
    pf: 0,
    pfShooting: 0,
    pfOffensive: 0,
    chargesDrawn: 0,
    teamFga: 0,
    oppFga: 0,
    oppRimA: 0,
    oppRimM: 0,
    opp3A: 0,
  };
}

interface Row {
  order: number;
  period: number;
  clock: number; // seconds remaining in the period
  type: string;
  sub: string;
  desc: string; // descriptor
  qual: string;
  pid: number;
  team: number;
  tri: string;
  poss: number;
  sh: number;
  sa: number;
  area: string;
  made: boolean;
  ast: number;
  blk: number;
  stl: number;
  drawn: number;
  nameI: string;
}

const AREA: Record<string, Zone> = {
  'Restricted Area': 'rim',
  'In The Paint (Non-RA)': 'paint',
  'Mid-Range': 'mid',
  'Left Corner 3': 'c3',
  'Right Corner 3': 'c3',
  'Above the Break 3': 'ab3',
};

const clockSecs = (c: string) => {
  const m = /PT(\d+)M([\d.]+)S/.exec(c);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};
const periodLen = (p: number) => (p <= 4 ? 720 : 300);

export async function processSeason(file: string, season: number, log = console.log): Promise<SeasonPbp> {
  const out: SeasonPbp = { season, games: 0, players: {}, stints: [], lineupIssues: 0 };
  let game: Row[] = [];
  let gid = '';
  const flush = () => {
    if (game.length) processGame(game, out);
    game = [];
  };
  for await (const get of tarCsvRows(file)) {
    const g = get('gameId');
    if (g !== gid) {
      flush();
      gid = g;
    }
    game.push({
      order: Number(get('orderNumber')),
      period: Number(get('period')),
      clock: clockSecs(get('clock')),
      type: get('actionType'),
      sub: get('subType'),
      desc: get('descriptor'),
      qual: get('qualifiers'),
      pid: Number(get('personId')) || 0,
      team: Number(get('teamId')) || 0,
      tri: get('teamTricode'),
      poss: Number(get('possession')) || 0,
      sh: Number(get('scoreHome')) || 0,
      sa: Number(get('scoreAway')) || 0,
      area: get('area'),
      made: get('shotResult') === 'Made',
      ast: Number(get('assistPersonId')) || 0,
      blk: Number(get('blockPersonId')) || 0,
      stl: Number(get('stealPersonId')) || 0,
      drawn: Number(get('foulDrawnPersonId')) || 0,
      nameI: get('playerNameI'),
    });
  }
  flush();
  log(`  ${season}: ${out.games} games, ${Object.keys(out.players).length} players, ${out.stints.length} stints, ${out.lineupIssues} lineup repairs`);
  return out;
}

function processGame(rows: Row[], out: SeasonPbp) {
  rows.sort((a, b) => a.order - b.order);
  // teams, tricodes and each player's team
  const tri: Record<number, string> = {};
  const pteam = new Map<number, number>();
  for (const r of rows) {
    if (r.team && r.tri) tri[r.team] = r.tri;
    if (r.pid && r.team && r.pid !== r.team && r.type !== 'timeout') pteam.set(r.pid, r.team);
  }
  const teams = Object.keys(tri).map(Number);
  if (teams.length !== 2) return;
  // home team: whose basket moved scoreHome
  let home = 0;
  let lh = 0;
  let la = 0;
  for (const r of rows) {
    if (r.sh !== lh && r.team) {
      home = r.team;
      break;
    }
    if (r.sa !== la && r.team) {
      home = teams.find((t) => t !== r.team)!;
      break;
    }
    lh = r.sh;
    la = r.sa;
  }
  if (!home) return;
  const away = teams.find((t) => t !== home)!;
  const other = (t: number) => (t === home ? away : home);
  out.games++;

  const P = (pid: number, nameI = '') => {
    let p = out.players[pid];
    if (!p) p = out.players[pid] = blank(pid, nameI);
    if (nameI && !p.nameI) p.nameI = nameI;
    return p;
  };
  for (const r of rows) if (r.pid && pteam.has(r.pid) && r.nameI) P(r.pid, r.nameI);
  const played = new Set<number>();

  // stints keyed by offense team + both lineups
  const stints = new Map<string, Stint>();
  const stintFor = (offTeam: number, on: Record<number, Set<number>>) => {
    const o = [...on[offTeam]].sort((a, b) => a - b);
    const d = [...on[other(offTeam)]].sort((a, b) => a - b);
    const key = `${offTeam}|${o.join(',')}|${d.join(',')}`;
    let s = stints.get(key);
    if (!s) stints.set(key, (s = { off: o, def: d, home: offTeam === home, poss: 0, pts: 0 }));
    return s;
  };

  let prevEnd: Record<number, Set<number>> = { [home]: new Set(), [away]: new Set() };
  const periods = [...new Set(rows.map((r) => r.period))].sort((a, b) => a - b);
  let lastSh = 0;
  let lastSa = 0;
  for (const per of periods) {
    const pr = rows.filter((r) => r.period === per);
    // starters: anyone involved before being subbed in this period
    const subbedIn = new Set<number>();
    const starters: Record<number, number[]> = { [home]: [], [away]: [] };
    const mark = (pid: number) => {
      const t = pteam.get(pid);
      if (!pid || !t || subbedIn.has(pid) || starters[t].includes(pid)) return;
      starters[t].push(pid);
    };
    for (const r of pr) {
      if (r.type === 'substitution') {
        if (r.sub === 'in') subbedIn.add(r.pid);
        else mark(r.pid);
        continue;
      }
      if (r.type === 'timeout' || r.type === 'period' || r.type === 'game' || (r.type === 'foul' && r.sub === 'technical') || r.type === 'ejection') continue;
      mark(r.pid);
      mark(r.ast);
      mark(r.blk);
      mark(r.stl);
      mark(r.drawn);
    }
    const on: Record<number, Set<number>> = { [home]: new Set(), [away]: new Set() };
    for (const t of [home, away]) {
      let s = starters[t];
      if (s.length !== 5) out.lineupIssues++;
      if (s.length > 5) s = s.slice(0, 5);
      for (const pid of s) on[t].add(pid);
      // fill from the previous period's closing five if someone never showed up in the log
      for (const pid of prevEnd[t]) if (on[t].size < 5 && !subbedIn.has(pid)) on[t].add(pid);
    }

    let prevClock = periodLen(per);
    let curPoss = 0;
    let lastLineup: Stint | null = null; // where the current possession's last live action happened
    const endPossession = () => {
      if (curPoss && lastLineup) {
        lastLineup.poss++;
        for (const pid of lastLineup.off) P(pid).offPoss++;
        for (const pid of lastLineup.def) P(pid).defPoss++;
      }
    };
    for (const r of pr) {
      // time on court
      const dt = Math.max(0, prevClock - r.clock);
      if (dt > 0) {
        for (const t of [home, away])
          for (const pid of on[t]) {
            P(pid).secs += dt;
            played.add(pid);
          }
        prevClock = r.clock;
      }
      if (r.type === 'substitution') {
        const t = pteam.get(r.pid);
        if (t) {
          if (r.sub === 'out') on[t].delete(r.pid);
          else on[t].add(r.pid);
        }
        continue;
      }
      // possession changes
      if (r.poss && r.poss !== curPoss && (r.poss === home || r.poss === away)) {
        endPossession();
        curPoss = r.poss;
      }
      if (curPoss) lastLineup = stintFor(curPoss, on);
      // scoring
      if (r.sh !== lastSh || r.sa !== lastSa) {
        const dh = r.sh - lastSh;
        const da = r.sa - lastSa;
        if (dh > 0 && dh <= 4) credit(home, dh);
        if (da > 0 && da <= 4) credit(away, da);
        lastSh = r.sh;
        lastSa = r.sa;
      }
      event(r);
    }
    endPossession();
    prevEnd = on;

    function credit(team: number, pts: number) {
      const s = stintFor(team, on);
      s.pts += pts;
      for (const pid of s.off) P(pid).ptsFor += pts;
      for (const pid of s.def) P(pid).ptsAgainst += pts;
    }

    function event(r: Row) {
      const t = r.team;
      if (r.type === '2pt' || r.type === '3pt') {
        const z = AREA[r.area];
        if (!z || !r.pid) return;
        const p = P(r.pid);
        p.fga[z]++;
        if (r.made) p.fgm[z]++;
        const d = r.desc;
        const three = r.type === '3pt';
        if (r.made && r.ast) {
          if (three) p.astFgm3++;
          else p.astFgm2++;
          const a = P(r.ast);
          a.ast++;
          a.astZone[z]++;
        }
        if (/pullup|step back/.test(d)) {
          p.pullup++;
          if (r.made) p.pullupM++;
          if (three) p.pullup3++;
        } else if (/driving/.test(d)) {
          p.drive++;
          if (r.made) p.driveM++;
        } else if (/cutting/.test(d)) {
          p.cut++;
          if (r.made) p.cutM++;
        } else if (/putback|tip/.test(d)) {
          p.putback++;
          if (r.made) p.putbackM++;
        } else if (!three && (r.sub === 'Hook' || /turnaround|fadeaway/.test(d))) {
          p.post++;
          if (r.made) p.postM++;
        }
        if (/alley-oop/.test(d)) p.lob++;
        if (r.sub === 'DUNK') p.dunk++;
        if (/fastbreak/.test(r.qual)) {
          p.trans++;
          if (r.made) p.transM++;
        }
        if (r.blk && !r.made) {
          const b = P(r.blk);
          b.blk++;
          b.blkZone[z]++;
        }
        for (const pid of on[t] ?? []) P(pid).teamFga++;
        for (const pid of on[other(t)] ?? []) {
          const q = P(pid);
          q.oppFga++;
          if (z === 'rim') {
            q.oppRimA++;
            if (r.made) q.oppRimM++;
          }
          if (three) q.opp3A++;
        }
      } else if (r.type === 'freethrow') {
        if (!r.pid || /Technical/i.test(r.sub)) return;
        const p = P(r.pid);
        p.fta++;
        if (r.made) p.ftm++;
        if (r.sub === '1 of 1') p.and1++;
      } else if (r.type === 'rebound') {
        if (!r.pid || r.pid === t) return; // team rebounds
        const off = r.sub === 'offensive';
        const p = P(r.pid);
        if (off) p.orb++;
        else p.drb++;
        const offTeam = off ? t : other(t);
        for (const pid of on[offTeam] ?? []) P(pid).orbChances++;
        for (const pid of on[other(offTeam)] ?? []) P(pid).drbChances++;
      } else if (r.type === 'turnover') {
        if (!r.pid || r.pid === t) return;
        const p = P(r.pid);
        p.tov++;
        const k = `${r.sub} ${r.desc}`;
        if (/bad pass/.test(k)) p.tovBadPass++;
        else if (/lost ball/.test(k)) p.tovLostBall++;
        else if (/offensive foul/.test(k)) p.tovOffFoul++;
        else p.tovOther++;
      } else if (r.type === 'steal') {
        if (r.pid) P(r.pid).stl++;
      } else if (r.type === 'foul') {
        if (!r.pid || r.sub === 'technical') return;
        const p = P(r.pid);
        p.pf++;
        if (/shooting/.test(r.desc)) {
          p.pfShooting++;
          if (r.drawn) P(r.drawn).sfDrawn++;
        }
        if (r.sub === 'offensive') {
          p.pfOffensive++;
          if (/charge/.test(r.desc) && r.drawn) P(r.drawn).chargesDrawn++;
        }
      }
    }
  }
  for (const pid of played) {
    const p = P(pid);
    p.games++;
    const tr = tri[pteam.get(pid) ?? 0];
    if (tr) p.teams[tr] = (p.teams[tr] ?? 0) + 1;
  }
  for (const s of stints.values()) if (s.poss > 0 || s.pts > 0) out.stints.push(s);
}

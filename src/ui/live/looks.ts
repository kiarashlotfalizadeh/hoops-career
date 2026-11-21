// How the league's real players look, where it is written down: data/looks.json, a player's Basketball Reference id
// to what is known of his look (core/types.ts PlayerLook: his skin's tone, how he wears his hair, his beard, a dyed
// colour, his hairline). The rest of him is still made up from his number (court3d/look.ts), and so is every man the
// file does not have: a generated player, a draft class to come, the last men on a few benches. A real player it does
// not have is still made up plainly (REAL: lookOf dyes nothing and moves no hairline for a man with a look given).
//
// Read here, when the court asks, and not only baked into the seed (scripts/data/build-seed.ts does that too, for a
// seed built after the file): a league saved before the file had a line for a man still gets it, and a line changed
// is changed in every save. A look a save's own player carries (Player.look) comes first.
import type { Player, PlayerLook } from '../../core/types';
import LOOKS from '../../../data/looks.json';

const BY_ID = LOOKS as Record<string, PlayerLook | undefined>;
/** A real player nobody has written up: nothing known, which is still not nothing (see above). */
const REAL: PlayerLook = {};

/** What is known of a player's look, if anything: his own save's, or the file's by his Basketball Reference id. */
export const lookFor = (p: Pick<Player, 'look' | 'bbrefId'> | undefined): PlayerLook | undefined => p?.look ?? (p?.bbrefId ? (BY_ID[p.bbrefId] ?? REAL) : undefined);

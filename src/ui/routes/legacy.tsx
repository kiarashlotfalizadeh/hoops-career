// Routes from before the redesign, still linked from older code and bookmarks: each goes to its new place.
import { Route } from 'react-router-dom';
import { Redirect } from './Redirect';

export const legacyRoutes = (
  <>
    <Route path="/roster" element={<Redirect to="/team" />} />
    <Route path="/rotation" element={<Redirect to="/team/rotation" />} />
    <Route path="/lineups" element={<Redirect to="/team/lineups" />} />
    <Route path="/tactics" element={<Redirect to="/team/tactics" />} />
    <Route path="/gameplan/:tid" element={<Redirect to="/games/:tid" />} />
    <Route path="/history" element={<Redirect to="/league/history" />} />
    <Route path="/trade" element={<Redirect to="/office/trade" />} />
    <Route path="/free-agents" element={<Redirect to="/office/free-agents" />} />
    <Route path="/resign" element={<Redirect to="/office/resign" />} />
    <Route path="/draft" element={<Redirect to="/office/draft" />} />
    <Route path="/finances" element={<Redirect to="/office/finances" />} />
    <Route path="/owner" element={<Redirect to="/office/owner" />} />
  </>
);

// Starter templates for the "New…" gallery. Each is a complete, valid takui/v1 project with no
// errors, warnings or spelling issues (test/templates.test.ts enforces this), so a new user's
// first screen is never red. The test fixtures double as "Examples".

import statusBoard from './status-board.takui.json';
import incidentReport from './incident-report.takui.json';
import teamCheckin from './team-checkin.takui.json';
import resourceRequest from './resource-request.takui.json';
import serverConnect from './server-connect.takui.json';
import helloStatus from '../../test/fixtures/hello-status.takui.json';
import eventCad from '../../test/fixtures/event-cad.takui.json';

export interface Template {
  id: string;
  name: string;
  /** One line: what you'd build from it */
  blurb: string;
  icon: string;
  group: 'Start from' | 'Examples';
  raw: unknown;
}

export const TEMPLATES: Template[] = [
  { id: 'status-board', name: 'Team Status Board', blurb: 'Set your status; see the whole team color-coded.', icon: '🟢', group: 'Start from', raw: statusBoard },
  { id: 'incident-report', name: 'Incident Report', blurb: 'Field form with type, priority, map location and photo.', icon: '📋', group: 'Start from', raw: incidentReport },
  { id: 'team-checkin', name: 'Team Check-In', blurb: 'Lead requests a roll call; members answer with one tap.', icon: '✋', group: 'Start from', raw: teamCheckin },
  { id: 'resource-request', name: 'Resource Request', blurb: 'Request supplies, track them in a table. Uses tabs.', icon: '📦', group: 'Start from', raw: resourceRequest },
  { id: 'server-connect', name: 'Server Connection', blurb: 'Status pane plus a settings screen for an outside service.', icon: '🔌', group: 'Start from', raw: serverConnect },
  { id: 'hello-status', name: 'Hello Status', blurb: 'The smallest useful plugin: one screen, one action.', icon: '👋', group: 'Examples', raw: helloStatus },
  { id: 'event-cad', name: 'Event CAD (demo)', blurb: 'A full dispatch board: tabs, lists, a dialog and settings.', icon: '🚑', group: 'Examples', raw: eventCad },
];

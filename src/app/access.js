// Role-based access for the office API (/api/app/admin/...), enforced on the server.
//
// The office admin keeps every permission it had. The four team roles below each get only the
// office modules of their own work; every other office API answers 403, whatever the screens show
// and whatever URL or parameters are typed. Team roles never reach a customer's health pages:
// those routes only admit the office admin, the customer's family and the assigned nurses.
//
//   finance     Financials (invoices, payment due, recording payments and refunds), revenue
//               analytics, and fin/* (payments ledger, reconciliation, expenses, reports)
//   hr          Employees (records, KYC documents), Leave Record Management, and hr/* (onboarding,
//               employment history, credentials, attendance, leave balances, reports)
//   operations  Customer management (directory and operational profile), the Nurse scheduler's
//               visit board and holidays (not nurses' hours), leave records (read only), and ops/* (visits, capacity, onboarding, service quality)
//   sales       Lead management (overview, enquiry database, assigning, status and General
//               Information; never approving or declining a package) and sales/*

const TEAM_ROLES = { finance: 'Finance Manager', hr: 'HR', operations: 'Operations Manager', sales: 'Sales Executive' };
const OFFICE_ROLES = ['admin', ...Object.keys(TEAM_ROLES)];

// [methods, path pattern] for the path after /admin/
const R = (methods, re) => ({ methods: methods === '*' ? null : methods.split(','), re });
const RULES = {
  finance: [
    R('GET', /^analytics\/revenue$/),
    R('GET', /^finance\/(invoices|due)$/), R('GET', /^finance\/invoices\/[^/]+\/pdf$/), R('POST', /^finance\/(payments|refunds)$/),
    R('*', /^fin(\/.*)?$/)
  ],
  hr: [
    R('GET', /^employees$/), R('GET,PATCH', /^employees\/[^/]+$/), R('POST', /^employees\/[^/]+\/kyc$/), R('GET,POST', /^employees\/[^/]+\/kyc\/[^/]+$/),
    R('*', /^leave(\/.*)?$/),
    R('*', /^hr(\/.*)?$/)
  ],
  operations: [
    R('GET', /^customers$/), R('GET', /^customers\/[^/]+$/),
    // the visit board and holidays; nurses' working hours and leave stay with the office admin and HR
    R('GET', /^scheduler\/nurses$/), R('*', /^scheduler\/(visits|holidays)(\/.*)?$/),
    R('GET', /^leave$/),
    R('*', /^ops(\/.*)?$/)
  ],
  sales: [
    R('GET', /^leads(\/overview|\/members|\/list)?$/), R('GET,PATCH', /^leads\/(booking|enquiry)\/[^/]+$/), R('POST', /^leads\/(booking|enquiry)\/[^/]+\/(assign|general)$/),
    R('*', /^sales(\/.*)?$/)
  ]
};

const isTeam = (role) => Object.prototype.hasOwnProperty.call(TEAM_ROLES, role);
const isOffice = (role) => OFFICE_ROLES.includes(role);

// may this role call /admin/<path> with this method?
function allows(role, path, method) {
  if (role === 'admin') return true;
  if (!isTeam(role)) return false;
  const p = Array.isArray(path) ? path.join('/') : String(path || '');
  return RULES[role].some((r) => r.re.test(p) && (!r.methods || r.methods.includes(String(method || 'GET').toUpperCase())));
}

// the only signed-in routes outside /admin/ a team login may use (its own account, notifications, leave and trainings)
const TEAM_OPEN = ['logout', 'password', 'profile', 'notifications', 'notifications/read'];
function teamMayUse(path) { return TEAM_OPEN.includes(path) || /^me\/(leave|trainings)(\/[^/]+){0,2}$/.test(path); } // their own leave and trainings

module.exports = { TEAM_ROLES, OFFICE_ROLES, RULES, allows, isTeam, isOffice, teamMayUse };

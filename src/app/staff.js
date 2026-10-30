// Employees: everyone with a staff login (nurses/caregivers and the office team).
// The login (app_users) holds name, phone, email and role; app_staff holds the employee record:
// employee ID (EMP-XXXXXX, made once and never changed), department, business unit, location,
// date of joining, status, emergency contact, working hours and leave (nurses), and KYC documents.
// KYC files are stored like medical records (app_files) and only the office can open them.

const KYC_KINDS = {
  'id-proof': 'Identity proof (Aadhaar, PAN or passport)',
  'address-proof': 'Address proof',
  'nursing-registration': 'Nursing council registration',
  qualification: 'Qualification certificate',
  'police-verification': 'Police verification'
};
const REQUIRED = { caregiver: ['id-proof', 'address-proof', 'nursing-registration', 'qualification'], admin: ['id-proof', 'address-proof'] };
const DEPARTMENTS = ['Nursing', 'Care', 'Operations', 'Sales', 'Finance', 'Office'];
const UNITS = { kareiq: 'KareIQ', karehome: 'Kare@Home', karenest: 'KareNest' };

// how long someone has worked here, from the date of joining to today (worked out each time)
function serviceLength(joinDate, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(joinDate || '')) return null;
  const a = new Date(joinDate + 'T12:00:00Z'), b = new Date(today + 'T12:00:00Z');
  if (b < a) return { days: 0, years: 0, months: 0, text: 'Joins on ' + joinDate };
  const days = Math.round((b - a) / 86400000);
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  const years = Math.floor(months / 12); months -= years * 12;
  const text = [years ? years + (years === 1 ? ' year' : ' years') : '', months ? months + (months === 1 ? ' month' : ' months') : ''].filter(Boolean).join(' ') || 'Less than a month';
  return { days, years, months, text };
}

function kycSummary(role, kyc) {
  const docs = (kyc && kyc.docs) || [];
  const need = REQUIRED[role] || REQUIRED.admin;
  const ok = (k) => docs.some((d) => d.kind === k && d.status === 'verified');
  const sent = (k) => docs.some((d) => d.kind === k && d.status !== 'rejected');
  const pending = need.filter((k) => !ok(k));
  const status = !docs.length ? 'not_submitted' : need.every(ok) ? 'verified' : docs.some((d) => d.status === 'rejected') && !need.every(sent) ? 'action_needed' : 'submitted';
  const verifiedAt = need.every(ok) ? docs.filter((d) => d.status === 'verified').map((d) => d.verifiedAt).sort().pop() : null;
  return { status, pending: pending.map((k) => ({ kind: k, name: KYC_KINDS[k], sent: sent(k) })), verifiedAt };
}

function create(ctx) {
  const { docs, uid, now, store, todayIST } = ctx;
  async function profileOf(userId) {
    let p = await docs.findOne('app_staff', { userId });
    if (p) return p;
    const user = await docs.findOne('app_users', { id: userId });
    let employeeId;
    do { employeeId = store.makeReference('EMP'); } while (await docs.findOne('app_staff', { employeeId }));
    p = {
      id: uid(), userId, employeeId, department: user && user.role === 'caregiver' ? 'Nursing' : 'Office', businessUnit: 'kareiq', location: '',
      joinDate: user && user.createdAt ? user.createdAt.slice(0, 10) : todayIST(), status: 'active', emergencyContact: null,
      availability: null, leave: [], kyc: { docs: [] }, createdAt: now()
    };
    await docs.insert('app_staff', p);
    return p;
  }
  function onLeaveToday(p) { const t = todayIST(); return (p.leave || []).some((l) => l.from <= t && t <= l.to); }
  function view(user, p, opts) {
    const t = todayIST();
    const status = !user.active || p.status === 'inactive' ? 'inactive' : onLeaveToday(p) ? 'on_leave' : 'active';
    return {
      userId: user.id, employeeId: p.employeeId, name: user.name, role: user.role, roleName: user.role === 'caregiver' ? 'Nurse / caregiver' : user.role === 'admin' ? 'Office' : user.role,
      department: p.department || '', businessUnit: p.businessUnit || 'kareiq', businessUnitName: UNITS[p.businessUnit] || p.businessUnit || 'KareIQ', location: p.location || '',
      joinDate: p.joinDate || null, service: serviceLength(p.joinDate, t), status, statusName: { active: 'Active', inactive: 'Inactive', on_leave: 'On leave' }[status],
      ...(opts && opts.full ? {
        phone: user.phone || null, email: user.email || null, emergencyContact: p.emergencyContact || null, leave: p.leave || [],
        kyc: { ...kycSummary(user.role, p.kyc), docs: ((p.kyc && p.kyc.docs) || []).map((d) => ({ id: d.id, kind: d.kind, kindName: KYC_KINDS[d.kind] || d.kind, name: d.name, uploadedAt: d.uploadedAt, status: d.status, verifiedAt: d.verifiedAt || null, note: d.note || null })) }
      } : { kycStatus: kycSummary(user.role, p.kyc).status })
    };
  }
  return { profileOf, view, serviceLength, kycSummary, onLeaveToday };
}

module.exports = { create, serviceLength, kycSummary, KYC_KINDS, REQUIRED, DEPARTMENTS, UNITS };

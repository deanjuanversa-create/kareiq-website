# Browser checks for the Finance Manager, HR, Operations Manager and Sales Executive dashboards:
# landing pages, role-only menus, every page opening without errors, a few real actions, phone layout.
# Needs Python Playwright (pip install playwright; playwright install chromium) and a fresh demo server:
#   APP_DEMO=true node server.js            then:   python3 tools/check-teams-ui.py http://localhost:3000
import asyncio, sys, os
from playwright.async_api import async_playwright

B = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000').rstrip('/')
CHROME = os.environ.get('CHROME') or None
passed = failed = 0
def ok(c, m):
    global passed, failed
    if c: passed += 1; print('PASS ', m)
    else: failed += 1; print('FAIL ', m)

ROLES = {
  'finance': ('office/fin', 'Finance Manager', ['Dashboard', 'Financials', 'Spending', 'Analysis', 'Reports and export', 'Team activity', 'My leave and training'],
              ['fin/receivables', 'fin/payments', 'fin/credit-notes', 'fin/recon', 'fin/expenses', 'fin/pnl', 'fin/gst', 'fin/reports', 'fin/activity', 'me', 'finance/invoices', 'finance/due', 'overview/revenue']),
  'hr': ('office/hr', 'HR', ['Dashboard', 'Employees', 'Credentials', 'Training plans', 'Attendance and leave', 'Payroll', 'HR reports', 'Team activity', 'My leave and training'],
         ['hr/onboarding', 'hr/credentials', 'hr/trainings', 'hr/attendance', 'hr/attendance?view=month', 'hr/leave', 'hr/payroll', 'hr/reports', 'hr/activity', 'me', 'employees', 'employees/kyc', 'scheduler/leave']),
  'ops': ('office/ops', 'Operations Manager', ['Dashboard', 'Customer management', 'Nurse scheduler', 'Supplies', 'Service quality', 'Operations reports', 'Team activity', 'My leave and training'],
          ['ops/visits', 'ops/capacity', 'ops/timeliness', 'ops/areas', 'ops/onboarding', 'ops/quality', 'ops/reports', 'ops/activity', 'me', 'customers', 'customer?p=P-DEMO01', 'scheduler', 'scheduler/leave', 'scheduler/holidays']),
  'sales': ('office/sales', 'Sales Executive', ['Dashboard', 'Lead management', 'Quotations', 'Message templates', 'Targets and commission', 'Packages and enquiries', 'Sales reports', 'Team activity', 'My leave and training'],
            ['sales/followups', 'sales/quotes', 'sales/targets', 'sales/lost', 'sales/packages', 'sales/reports', 'sales/activity', 'me', 'leads/overview', 'leads/list']),
}

async def signin(b, who, w=1440, h=900):
    ctx = await b.new_context(viewport={'width': w, 'height': h})
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(B + '/app/#/signin'); await pg.wait_for_timeout(500)
    await pg.fill('input[name=id]', who + '@demo.kareiq'); await pg.fill('input[name=password]', 'demo-pass-123')
    await pg.keyboard.press('Enter'); await pg.wait_for_timeout(2500)
    return ctx, pg, errs

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME) if CHROME else await p.chromium.launch()
        for who, (home, label, menu, pages) in ROLES.items():
            ctx, pg, errs = await signin(b, who)
            ok(pg.url.endswith('#/' + home), who + ': lands on its dashboard')
            ok((await pg.inner_text('h1')).startswith('Good '), who + ': greeting on the landing page')
            ok((await pg.locator('.tb-role').inner_text()).strip().lower() == label.lower(), who + ': role shown in the header')
            ok(await pg.locator('.okpi').count() >= 4, who + ': summary cards on the landing page')
            got = await pg.eval_on_selector_all('#sb .sb-in > a span, #sb .sbg-btn span', 'e=>e.map(x=>x.textContent)')
            ok(got == menu, who + ': only its own menu: ' + ' | '.join(got))
            for pth in pages:
                await pg.goto(B + '/app/#/office/' + pth); await pg.wait_for_timeout(1500)
                ok(pg.url.split('#')[1].startswith('/office/' + pth.split('?')[0]) and await pg.locator('.pageerr').count() == 0, who + ': opens ' + pth)
            for other in ['office/overview/summary', 'office/risk-rules', 'health/vitals?p=P-DEMO01', 'records?p=P-DEMO01', 'admin/logins']:
                await pg.goto(B + '/app/#/' + other); await pg.wait_for_timeout(1200)
                ok(pg.url.endswith('#/' + home), who + ': ' + other + ' sends it back to its dashboard')
            await pg.goto(B + '/app/#/' + home); await pg.wait_for_timeout(1800)
            ok(await pg.locator('.ttodo').count() == 1, who + ': "Needs your attention" on the landing page')
            ok(await pg.locator('a.okpi').count() >= 4, who + ': summary cards open their lists')
            subs = await pg.eval_on_selector_all('#sb .sbg-sub a span', 'e=>e.map(x=>x.textContent)')
            ok('Assign to a member' not in subs and 'Nurses and hours' not in subs, who + ': no Assign to a member or Nurses and hours in the menu')
            ok(not errs, who + ': no page errors ' + str(errs[:3]))
            await ctx.close()

        # ---- actions through the screens
        ctx, pg, errs = await signin(b, 'finance')
        await pg.goto(B + '/app/#/office/fin/expenses'); await pg.wait_for_timeout(1500)
        await pg.click('[data-act=o-exp-new]'); await pg.wait_for_timeout(500)
        await pg.select_option('dialog[open] select[name=category]', 'travel'); await pg.fill('dialog[open] input[name=amount]', '640'); await pg.fill('dialog[open] input[name=vendor]', 'Auto fare (UI test)')
        await pg.click('dialog[open] [data-act=submit-dialog]'); await pg.wait_for_timeout(1500)
        ok(await pg.locator('td:has-text("Auto fare (UI test)")').count() == 1, 'finance: records an expense from the screen')
        ok(await pg.locator('tr:has-text("Auto fare (UI test)") [data-s=approve]').count() == 0, 'finance: no Approve button on its own expense')
        await ctx.close()
        ctx, pg, errs = await signin(b, 'sales')
        await pg.goto(B + '/app/#/office/sales/followups'); await pg.wait_for_timeout(1500)
        await pg.click('[data-act=o-contact] >> nth=0'); await pg.wait_for_timeout(1200)
        await pg.fill('dialog[open] input[name=outcome]', 'Will decide on Monday'); await pg.fill('dialog[open] textarea[name=note]', 'Spoke to the son (UI test)')
        await pg.click('dialog[open] [data-act=submit-dialog]'); await pg.wait_for_timeout(1500)
        ok(await pg.locator('dialog[open]').count() == 0, 'sales: logs a contact from the follow-ups page')
        await pg.goto(B + '/app/#/office/leads/list'); await pg.wait_for_timeout(1500)
        await pg.click('[data-act=o-lead] >> nth=0'); await pg.wait_for_timeout(1500)
        ok(await pg.locator('dialog[open] [value=approve]').count() == 0, 'sales: the enquiry has no Approve package button')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        await pg.goto(B + '/app/#/office/sales'); await pg.wait_for_timeout(1500)
        await pg.click('[data-act=o-lead-new] >> nth=0'); await pg.wait_for_timeout(1200)
        await pg.fill('dialog[open] input[name=name]', 'Walk-in Visitor (UI test)'); await pg.fill('dialog[open] input[name=phone]', '9800199999')
        await pg.select_option('dialog[open] select[name=source]', 'walk-in'); await pg.click('dialog[open] [data-act=submit-dialog]'); await pg.wait_for_timeout(1500)
        await pg.goto(B + '/app/#/office/leads/list?q=Walk-in'); await pg.wait_for_timeout(1500)
        ok(await pg.locator('td:has-text("Walk-in Visitor (UI test)")').count() == 1, 'sales: adds a walk-in lead from the dashboard')
        await pg.goto(B + '/app/#/office/leads/assign'); await pg.wait_for_timeout(1200)
        ok('/office/leads/list' in pg.url, 'sales: the old Assign to a member address opens the enquiry database')
        await ctx.close()
        ctx, pg, errs = await signin(b, 'finance')
        await pg.goto(B + '/app/#/office/fin/receivables'); await pg.wait_for_timeout(1500)
        ok(await pg.locator('.tbucket').count() >= 6, 'finance: receivables by age')
        if await pg.locator('[data-act=o-remind]').count():
            await pg.click('[data-act=o-remind] >> nth=0'); await pg.wait_for_timeout(400)
            await pg.click('dialog[open] [data-act=submit-dialog]'); await pg.wait_for_timeout(1500)
            ok(await pg.locator('td:has-text("whatsapp")').count() >= 1, 'finance: logs a payment reminder')
        await ctx.close()
        ctx, pg, errs = await signin(b, 'ops')
        await pg.goto(B + '/app/#/office/scheduler/nurses'); await pg.wait_for_timeout(1200)
        ok(pg.url.endswith('#/office/ops'), 'operations: Nurses and hours is not available')
        await pg.goto(B + '/app/#/office/ops/visits'); await pg.wait_for_timeout(1500)
        if await pg.locator('[data-act=o-resched]').count():
            await pg.click('[data-act=o-resched] >> nth=0'); await pg.wait_for_timeout(500)
            ok(await pg.locator('dialog[open] input[name=date]').count() == 1, 'operations: the reschedule dialog opens')
            await pg.keyboard.press('Escape')
        await pg.goto(B + '/app/#/office/customer?p=P-DEMO01'); await pg.wait_for_timeout(1500)
        body = await pg.inner_text('#mn')
        ok('Risk' not in body and 'Blood group' not in body and 'Vitals' not in body, 'operations: the customer profile shows no clinical information')
        await pg.goto(B + '/app/#/office/scheduler/leave'); await pg.wait_for_timeout(1500)
        ok(await pg.locator('[data-act=o-leave-add], [data-act=o-leave-approve]').count() == 0, 'operations: leave records are read only')
        await ctx.close()
        ctx, pg, errs = await signin(b, 'hr')
        await pg.click('[data-act=o-hr-new]'); await pg.wait_for_timeout(500)
        await pg.fill('dialog[open] input[name=name]', 'Nurse Bindu (UI test)'); await pg.fill('dialog[open] input[name=phone]', '9800177777')
        await pg.click('dialog[open] [data-act=submit-dialog]'); await pg.wait_for_timeout(1800)
        ok(await pg.locator('dialog[open] input[readonly]').count() == 1, 'hr: adds a nurse and gets the sign-in link')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        await pg.goto(B + '/app/#/office/hr/attendance'); await pg.wait_for_timeout(1500)
        sel = pg.locator('form[data-form=o-att] select').first
        await sel.select_option('present'); await pg.click('form[data-form=o-att] button[type=submit]'); await pg.wait_for_timeout(1500)
        ok(await pg.locator('form[data-form=o-att] select').first.input_value() == 'present', 'hr: marks attendance from the screen')
        await ctx.close()
        # ---- admin: existing dashboard plus the four team dashboards
        ctx, pg, errs = await signin(b, 'admin')
        groups = await pg.eval_on_selector_all('#sb .sbg-btn span', 'e=>e.map(x=>x.textContent)')
        ok('Team dashboards' not in groups and 'Overview' in groups and 'Financials' in groups and 'Settings' in groups, 'admin: its own menu, no separate team dashboards section')
        subs = await pg.eval_on_selector_all('#sb .sbg-sub a span', 'e=>e.map(x=>x.textContent)')
        ok('Reconciliation' in subs and 'Credentials' in subs and 'Visit tracking' in subs and 'Follow-ups' in subs, 'admin: the new pages sit in its existing groups')
        ok('Assign to a member' in subs and 'Nurses and hours' in subs, 'admin: keeps Assign to a member and Nurses and hours')
        for pth in ['leads/assign', 'scheduler/nurses']:
            await pg.goto(B + '/app/#/office/' + pth); await pg.wait_for_timeout(1500)
            ok(pg.url.endswith('#/office/' + pth) and await pg.locator('.pageerr').count() == 0, 'admin: opens ' + pth)
        await pg.goto(B + '/app/#/office/overview/summary'); await pg.wait_for_timeout(1500)
        ok(await pg.locator('.pageerr').count() == 0, 'admin: summary still opens')
        ok(not errs, 'admin: no page errors')
        await ctx.close()
        # ---- phones
        for who in ROLES:
            ctx, pg, errs = await signin(b, who, 390, 844)
            sw = await pg.evaluate('document.documentElement.scrollWidth')
            ok(sw <= 392, who + ': phone, no sideways scrolling (' + str(sw) + ')')
            await pg.click('.tb-menu'); await pg.wait_for_timeout(500)
            ok(await pg.locator('#sb').is_visible(), who + ': phone, the menu opens as a drawer')
            ok(not errs, who + ': phone, no page errors')
            await ctx.close()
        await b.close()
    print('check-teams-ui: PASS %d FAIL %d' % (passed, failed))
    sys.exit(1 if failed else 0)

asyncio.run(main())

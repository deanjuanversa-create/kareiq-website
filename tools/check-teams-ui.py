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
  'finance': ('office/fin', 'Finance Manager', ['Dashboard', 'Financials', 'Expenses', 'Revenue analytics', 'Financial reports'],
              ['fin/payments', 'fin/recon', 'fin/expenses', 'fin/reports', 'finance/invoices', 'finance/due', 'overview/revenue']),
  'hr': ('office/hr', 'HR', ['Dashboard', 'Employees', 'Credentials', 'Attendance and leave', 'HR reports'],
         ['hr/onboarding', 'hr/credentials', 'hr/attendance', 'hr/attendance?view=month', 'hr/leave', 'hr/reports', 'employees', 'employees/kyc', 'scheduler/leave']),
  'ops': ('office/ops', 'Operations Manager', ['Dashboard', 'Customer management', 'Nurse scheduler', 'Service quality', 'Operations reports'],
          ['ops/visits', 'ops/capacity', 'ops/onboarding', 'ops/quality', 'ops/reports', 'customers', 'customer?p=P-DEMO01', 'scheduler', 'scheduler/nurses', 'scheduler/leave']),
  'sales': ('office/sales', 'Sales Executive', ['Dashboard', 'Lead management', 'Packages and enquiries', 'Sales reports'],
            ['sales/followups', 'sales/packages', 'sales/reports', 'leads/overview', 'leads/list', 'leads/assign']),
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
        await ctx.close()
        ctx, pg, errs = await signin(b, 'ops')
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
        await pg.goto(B + '/app/#/office/hr/attendance'); await pg.wait_for_timeout(1500)
        sel = pg.locator('form[data-form=o-att] select').first
        await sel.select_option('present'); await pg.click('form[data-form=o-att] button[type=submit]'); await pg.wait_for_timeout(1500)
        ok(await pg.locator('form[data-form=o-att] select').first.input_value() == 'present', 'hr: marks attendance from the screen')
        await ctx.close()
        # ---- admin: existing dashboard plus the four team dashboards
        ctx, pg, errs = await signin(b, 'admin')
        groups = await pg.eval_on_selector_all('#sb .sbg-btn span', 'e=>e.map(x=>x.textContent)')
        ok('Team dashboards' in groups and 'Overview' in groups and 'Settings' in groups, 'admin: existing menu with Team dashboards added')
        for d in ['fin', 'hr', 'ops', 'sales']:
            await pg.goto(B + '/app/#/office/' + d); await pg.wait_for_timeout(1500)
            ok('dashboard' in (await pg.inner_text('h1')).lower(), 'admin: opens the ' + d + ' dashboard')
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

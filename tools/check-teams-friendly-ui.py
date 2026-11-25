# Checks the friendlier touches on the team dashboards in a real browser:
# the "Get your dashboard ready" checklist on each landing page, confirmations in the app's own style
# (no browser pop-ups), and the "Find in this table" box on long tables.
# Needs a fresh demo server:  APP_DEMO=true node server.js   then:   python3 tools/check-teams-friendly-ui.py http://localhost:3000
import asyncio, sys
from playwright.async_api import async_playwright

B = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000').rstrip('/')
P = F = 0
def ok(c, m):
    global P, F
    if c: P += 1; print('PASS ', m)
    else: F += 1; print('FAIL ', m)

async def signin(b, who, w=1440):
    ctx = await b.new_context(viewport={'width': w, 'height': 900})
    pg = await ctx.new_page(); errs = []; popups = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: (popups.append(d.message), asyncio.ensure_future(d.dismiss())))
    await pg.goto(B + '/app/#/signin'); await pg.wait_for_timeout(500)
    await pg.fill('input[name=id]', who + '@demo.kareiq'); await pg.fill('input[name=password]', 'demo-pass-123')
    await pg.keyboard.press('Enter'); await pg.wait_for_timeout(2200)
    return ctx, pg, errs, popups

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for who, home, first in [('finance', 'office/fin', 'GST rate'), ('hr', 'office/hr', 'Leave allowances'), ('ops', 'office/ops', 'On-time grace'), ('sales', 'office/sales', 'message template')]:
            ctx, pg, errs, popups = await signin(b, who)
            await pg.wait_for_timeout(800)
            card = pg.locator('.tsetup')
            ok(await card.count() == 1 and first in (await card.inner_text()), who + ': "Get your dashboard ready" lists what is not set yet')
            hrefs = await pg.eval_on_selector_all('.tsetup a.btn', 'as => as.map(a => a.getAttribute("href"))')
            ok(all(h.startswith('#/office/') for h in hrefs) and len(hrefs) >= 1, who + ': each item links to where it is set')
            if who == 'sales':
                ok(await pg.locator('.tsetup >> text=The office admin sets this').count() >= 1, 'sales: items the office admin sets say so, with no button')
            ok(not errs, who + ': no page errors'); await ctx.close()

        # the checklist item disappears once done: sales adds a template, then removes it with an in-app confirmation
        ctx, pg, errs, popups = await signin(b, 'sales')
        await pg.goto(B + '/app/#/office/sales/templates'); await pg.wait_for_timeout(1000)
        await pg.click('[data-act=o-tpl]'); await pg.wait_for_timeout(300)
        await pg.fill('dialog[open] [name=name]', 'Friendly check'); await pg.click('dialog[open] [data-act=submit-dialog]'); await pg.wait_for_timeout(1300)
        await pg.goto(B + '/app/#/office/sales'); await pg.wait_for_timeout(2000)
        ok('message template' not in (await pg.locator('.tsetup').inner_text()).split('Set up')[0] or await pg.locator('.tsetup li.ok:has-text("message template")').count() == 1, 'the template item is ticked once a template exists')
        await pg.goto(B + '/app/#/office/sales/templates'); await pg.wait_for_timeout(1000)
        await pg.click('[data-act=o-tpl-del]'); await pg.wait_for_timeout(400)
        ok(await pg.locator('dialog[open] [data-act=o-ask-yes]').count() == 1 and not popups, 'removing asks in the app\'s own dialog, not a browser pop-up')
        await pg.click('dialog[open] [data-act=o-ask-no]'); await pg.wait_for_timeout(500)
        ok(await pg.locator('h2:has-text("Friendly check")').count() == 1, 'Cancel keeps the template')
        await pg.click('[data-act=o-tpl-del]'); await pg.wait_for_timeout(400)
        await pg.click('dialog[open] [data-act=o-ask-yes]'); await pg.wait_for_timeout(1300)
        ok(await pg.locator('h2:has-text("Friendly check")').count() == 0, 'confirming removes it')
        ok(not errs and not popups, 'sales: no page errors or browser pop-ups'); await ctx.close()

        # find in a long table (Operations visit tracking or visit times, when they have more than 8 rows)
        ctx, pg, errs, popups = await signin(b, 'admin')
        found = False
        for page in ['ops/visits', 'ops/visit-times', 'sales/packages', 'leads/list']:
            await pg.goto(B + '/app/#/office/' + page); await pg.wait_for_timeout(1300)
            if await pg.locator('.tfind-w').count():
                found = True
                rows = await pg.locator('.tfind-w + .tw tbody tr').count()
                first = (await pg.locator('.tfind-w + .tw tbody tr').first.inner_text()).split('\n')[0].strip()[:12]
                await pg.fill('[data-act=o-tfind]', first); await pg.wait_for_timeout(300)
                shown = await pg.locator('.tfind-w + .tw tbody tr:not([hidden])').count()
                ok(1 <= shown <= rows and first.lower() in (await pg.locator('.tfind-w + .tw tbody tr:not([hidden])').first.inner_text()).lower(), page + ': "Find in this table" narrows the rows (' + str(shown) + ' of ' + str(rows) + ')')
                await pg.fill('[data-act=o-tfind]', 'zzzz-nothing'); await pg.wait_for_timeout(200)
                ok(await pg.locator('.tfind-w + .tw tbody tr:not([hidden])').count() == 0 and '0 of' in await pg.inner_text('.tfind-c'), page + ': nothing matches: no rows, "0 of" shown')
                break
        ok(found, 'a long table has the find box')
        ok(not errs, 'admin: no page errors'); await ctx.close()
        await b.close()
    print(('ALL PASSED  ' if not F else '') + f'check-teams-friendly-ui: PASS {P} FAIL {F}')
    sys.exit(1 if F else 0)

asyncio.run(main())

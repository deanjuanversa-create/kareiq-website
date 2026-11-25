# Checks the growth screens of the team dashboards in a real browser (src/app/teamsgrowth.js).
# Needs a fresh demo server:  APP_DEMO=true node server.js   then:   python3 tools/check-teams-growth-ui.py http://localhost:3000
# Every page opens for its role on a laptop and a phone (no page errors, nothing wider than the screen), and the main
# actions work from the screen: add-on prices, nurse skills, visits each package includes, an upgrade lead,
# a campaign, and a referred lead with the referring family found by name.
import asyncio, sys
from playwright.async_api import async_playwright

B = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000').rstrip('/')
P = F = 0
def ok(c, m):
    global P, F
    if c: P += 1; print('PASS ', m)
    else: F += 1; print('FAIL ', m)

PAGES = {
    'finance': ['fin/addons', 'fin/growth', 'fin/discounts'],
    'hr': ['hr/skills', 'hr/reviews'],
    'ops': ['ops/visits-used', 'ops/continuity'],
    'sales': ['sales/upgrades', 'sales/referrals', 'sales/campaigns'],
    'admin': ['fin/addons', 'hr/skills', 'ops/visits-used', 'sales/upgrades'],
}
WIDE = "() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1"

async def signin(b, who, w=1440, h=900):
    ctx = await b.new_context(viewport={'width': w, 'height': h})
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.goto(B + '/app/#/signin'); await pg.wait_for_timeout(500)
    await pg.fill('input[name=id]', who + '@demo.kareiq'); await pg.fill('input[name=password]', 'demo-pass-123')
    await pg.keyboard.press('Enter'); await pg.wait_for_timeout(1800)
    return ctx, pg, errs

async def submit(pg):
    await pg.click('dialog[open] [data-act=submit-dialog]'); await pg.wait_for_timeout(1400)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for who, pages in PAGES.items():
            for w in (1440, 390):
                ctx, pg, errs = await signin(b, who, w)
                for pa in pages:
                    await pg.goto(B + '/app/#/office/' + pa); await pg.wait_for_timeout(1300)
                    h1 = await pg.text_content('#mn h1') or ''
                    ok(h1 and not errs and not await pg.evaluate(WIDE), f'{who} {w}px: {pa} opens ("{h1.strip()}"), no errors, nothing too wide')
                    errs.clear()
                if w == 1440:
                    hrefs = await pg.eval_on_selector_all('.sb a', 'as => as.map(a => a.getAttribute("href"))')
                    ok(all(('#/office/' + l) in hrefs for l in pages if l != 'hr/reviews'), who + ': the pages are in the menu')
                await ctx.close()

        # finance: prices
        ctx, pg, errs = await signin(b, 'finance')
        await pg.goto(B + '/app/#/office/fin/addons'); await pg.wait_for_timeout(1300)
        await pg.fill('[name=p_physiotherapy]', '800'); await pg.click('form[data-form=o-ao-prices] button[type=submit]'); await pg.wait_for_timeout(1300)
        ok(await pg.input_value('[name=p_physiotherapy]') == '800', 'finance saves an add-on price on the screen')
        await pg.goto(B + '/app/#/office/fin/growth'); await pg.wait_for_timeout(1300)
        ok(await pg.locator('.okpi').count() >= 4 and await pg.locator('h2:has-text("Month by month")').count() == 1, 'package income shows its cards and the month table')
        ok(not errs, 'finance: no page errors'); await ctx.close()

        # hr: skills
        ctx, pg, errs = await signin(b, 'hr')
        await pg.goto(B + '/app/#/office/hr/skills'); await pg.wait_for_timeout(1200)
        await pg.click('tr:has-text("Nurse Anjali") [data-act=o-skill]'); await pg.wait_for_timeout(300)
        await pg.uncheck('dialog[open] [name=s_physiotherapy]'); await pg.check('dialog[open] [name=a_falls]'); await submit(pg)
        ok(await pg.locator('tr:has-text("Nurse Anjali") .tpill.info:has-text("Fall risk")').count() == 1 and await pg.locator('tr:has-text("Nurse Anjali") >> text=Every service').count() == 0, 'hr changes a nurse\'s skills on the screen')
        await pg.goto(B + '/app/#/office/hr/reviews'); await pg.wait_for_timeout(1300)
        ok(await pg.locator('th:has-text("Work (12 months)")').count() == 1, 'reviews show each nurse\'s work')
        ok(not errs, 'hr: no page errors'); await ctx.close()

        # operations: visits each package includes
        ctx, pg, errs = await signin(b, 'ops')
        await pg.goto(B + '/app/#/office/ops/visits-used'); await pg.wait_for_timeout(1300)
        await pg.fill('[name=a_homeplus]', '4'); await pg.click('form[data-form=o-allow] button[type=submit]'); await pg.wait_for_timeout(1300)
        ok(await pg.locator('tr:has-text("HomePlus") >> text=/of 4 left|over/').count() >= 1, 'operations sets the visits HomePlus includes; left is shown')
        ok(not errs, 'operations: no page errors'); await ctx.close()

        # sales: upgrade lead, campaign, referred lead
        ctx, pg, errs = await signin(b, 'sales')
        await pg.goto(B + '/app/#/office/sales/upgrades?min=0'); await pg.wait_for_timeout(1300)
        n0 = await pg.locator('[data-act=o-upg]').count()
        if n0:
            await pg.locator('[data-act=o-upg]').first.click(); await pg.wait_for_timeout(1500)
            ok(await pg.locator('[data-act=o-upg]').count() == n0 - 1, 'sales makes a lead from an upgrade suggestion')
        await pg.goto(B + '/app/#/office/sales/campaigns'); await pg.wait_for_timeout(1000)
        await pg.click('[data-act=o-camp]'); await pg.wait_for_timeout(300)
        await pg.fill('dialog[open] [name=name]', 'UI society drive'); await pg.fill('dialog[open] [name=cost]', '1000'); await submit(pg)
        ok(await pg.locator('tr:has-text("UI society drive")').count() == 1, 'sales adds a campaign')
        await pg.goto(B + '/app/#/office/sales/referrals'); await pg.wait_for_timeout(1000)
        await pg.click('[data-act=o-lead-new]'); await pg.wait_for_timeout(1500)
        ok(await pg.input_value('dialog[open] [name=source]') == 'referral' and await pg.locator('dialog[open] [data-act=o-ref-find]').count() == 1, 'adding a referred lead asks for the referring family')
        await pg.fill('dialog[open] [name=name]', 'UI Referred Friend'); await pg.fill('dialog[open] [name=phone]', '9800188801')
        await pg.fill('dialog[open] [data-act=o-ref-find]', 'demo'); await pg.wait_for_timeout(1200)
        await pg.locator('dialog[open] [data-act=o-ref-pick]').first.click()
        await submit(pg)
        await pg.goto(B + '/app/#/office/sales/referrals'); await pg.wait_for_timeout(1200)
        ok(await pg.locator('text=UI Referred Friend').count() == 1, 'the referred lead shows under the family who referred them')
        ok(not errs, 'sales: no page errors'); await ctx.close()
        await b.close()
    print(('ALL PASSED  ' if not F else '') + f'check-teams-growth-ui: PASS {P} FAIL {F}')
    sys.exit(1 if F else 0)

asyncio.run(main())
